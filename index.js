'use strict';
var opbeat = require('opbeat').start();
const http = require('http');
const Bot = require('messenger-bot');
const redis = require('redis').createClient(process.env.REDIS_URL, {
  prefix: process.env.TEST_PREFIX
});
console.log("Prefixing Redis keys with "+process.env.TEST_PREFIX);
const Flag = require('./flag.js');
let flagWatcher = new Flag(process.env, redis);
flagWatcher.constuctor(process.env, redis);

//redis.set("FLAG", Flag.Colours.GREEN);
redis.get("FLAG", (err, val) => console.log("Flag is "+val));

let bot = new Bot({
  token: process.env.TOKEN,
  verify: process.env.VERIFY,
  app_secret: process.env.APP_SECRET
});

bot.removeGetStartedButton();
bot.removePersistentMenu();

bot.on('error', (err) => {
  console.error(err.message);
});

bot.setGetStartedButton(
  [{
    payload: "GET_STARTED"
  }],
  function(err, profile) {
    if (err) console.error(err);
  }
);

bot.setPersistentMenu([
  {
    "type":"postback",
    "title":"Update Subscription",
    "payload":"UPDATE_SUBSCRIPTION"
  }
], (err) => console.error(err));

function getStarted(message, reply, actions) {
  redis.srem("YELLOW_AND_RED", message.sender.id);
  redis.srem("JUST_RED", message.sender.id);
  redis.srem("YELLOW_SUBSCRIBERS", message.sender.id);
  redis.srem("RED_SUBSCRIBERS", message.sender.id);

  reply({ "attachment" :
    {
      "type": "template",
      "payload": {
        "template_type": "button",
        "text": "Do you want to be told about yellow flags?",
        "buttons": [{
          "type": "postback",
          "title": "Yes",
          "payload": "YELLOW_AND_RED"
        }, {
          "type": "postback",
          "title": "No",
          "payload": "JUST_RED"
        }]
      }
  }}, (err) => console.error(err));
}

var payloads = {
  'GET_STARTED' : getStarted,
  
  "YELLOW_AND_RED" : function(message, reply, actions) {
    redis.get("FLAG", (err, flag) => {
      if (err) throw err;
      reply({text: "Ok we'll let you know when you can't row. The current flag is " + flag});
    });
    redis.sadd("YELLOW_SUBSCRIBERS", message.sender.id);
  },
  
  "JUST_RED" : function(message, reply, actions) {
   redis.get("FLAG", (err, flag) => {
      if (err) throw err;
      reply({text: "Ok we'll let you know when you can't row. The current flag is " + flag});
    });
    redis.sadd("RED_SUBSCRIBERS", message.sender.id);
  },
  
  "UPDATE_SUBSCRIPTION" : getStarted,
  
  "NOP": function(message) {
    console.log("mark seeen");
    bot.sendSenderAction(message.sender.id, "MARK_SEEN", (err, info) => {console.error(err); console.log(info);});
  },
  
  "DEBUG" : function(message, reply, actions) {
    reply({text: "Ok we'll give you debug information"});
    console.log("Adding "+message.sender.id+" to DEBUG set");
    redis.sadd("DEBUG", message.sender.id, (err, res) => console.error(err));
  }
};


bot.on('postback', (message, reply, actions) => {
  opbeat.setTransactionName(message.postback.payload);
  if (payloads[message.postback.payload]) {
    payloads[message.postback.payload](message, reply, actions);
  } else {
    console.error(message.postback.payload + " not known");
  }
});

bot.on('message', (payload, reply) => {
  console.log("message received");
  console.log(payload);
  if (payload.message.quick_reply) {
    if (payloads[payload.message.quick_reply.payload]) {
      opbeat.setTransactionName(payload.message.quick_reply.payload);
      payloads[payload.message.quick_reply.payload](payload, reply);
    } else {
      console.error(payload.message.quick_reply.payload + " not known");
    }
    return;
  }
  
  opbeat.setTransactionName("MESSAGE");
  console.log("replying");
  reply({"attachment": {
    "type": "template",
    "payload": {
      "template_type": "button",
      "text": "Do you want to update your subscription?",
      "buttons": [{
        "type": "postback",
        "title": "Yes",
        "payload": "UPDATE_SUBSCRIPTION"
      }, {
        "type": "postback",
        "title": "No",
        "payload": "NOP"
      }]
    }
  }}, (err) => console.log(err));
});

http.createServer(function (req, res) {
  if (req.url === '/_status') {
    opbeat.setTransactionName("STATUS");
  }
  bot.middleware()(req, res);
}).listen(process.env.PORT || 5000);
console.log("Listening on "+(process.env.PORT || 5000));

var transitionFunctions = {};

function NOPMessage () {
  redis.sunion("YELLOW_SUBSCRIBERS", "RED_SUBSCRIBERS", (err, ids) => {
    if (err) throw err;
    
    ids.map((id) => bot.sendMessage(id, {text : "The flag is no longer in operation"}, (err,info) => console.error(err)));
  });
}

function GREENMessage () {
  redis.sunion("YELLOW_SUBSCRIBERS", "RED_SUBSCRIBERS", (err, ids) => {
    if (err) throw err;
    
    ids.map((id) => bot.sendMessage(id, {text : "The flag is green again!"}, (err,info) => console.error(err)));
  });
}

transitionFunctions[Flag.Colours.GREEN] = {};
transitionFunctions[Flag.Colours.YELLOW] = {};
transitionFunctions[Flag.Colours.RED] = {};
transitionFunctions[Flag.Colours.NOP] = {};

transitionFunctions[Flag.Colours.GREEN][Flag.Colours.YELLOW] = () => {
  console.log("test");
  redis.sunion("YELLOW_AND_RED", "YELLOW_SUBSCRIBERS", (err, ids) => {
    if (err) throw err;
    console.log(ids);
    ids.map((id) => bot.sendMessage(id, {text : "Sorry, the flag has turned yellow :("}, (err,info) => console.error(err)));
  });
};

transitionFunctions[Flag.Colours.GREEN][Flag.Colours.RED] = () => {
  redis.sunion("YELLOW_SUBSCRIBERS", "YELLOW_AND_RED", "RED_SUBSCRIBERS", "JUST_RED", (err, ids) => {
    if (err) throw err;
    
    ids.map((id) => bot.sendMessage(id, {text : "Sorry, the flag has turned red :("}, (err,info) => console.error(err)));
  });
};

transitionFunctions[Flag.Colours.GREEN][Flag.Colours.NOP] = NOPMessage;

transitionFunctions[Flag.Colours.YELLOW][Flag.Colours.GREEN] = GREENMessage;

transitionFunctions[Flag.Colours.YELLOW][Flag.Colours.RED] = () => {
  redis.sunion("RED_SUBSCRIBERS", "JUST_RED", (err, ids) => {
    if (err) throw err;
    
    ids.map((id) => bot.sendMessage(id, {text : "Sorry, the flag has turned red :("}, (err,info) => console.error(err)));
  });
};

transitionFunctions[Flag.Colours.YELLOW][Flag.Colours.NOP] = NOPMessage;

transitionFunctions[Flag.Colours.RED][Flag.Colours.GREEN] = GREENMessage;

transitionFunctions[Flag.Colours.RED][Flag.Colours.YELLOW] = () => {
  redis.sunion("RED_SUBSCRIBERS", "JUST_RED", (err, ids) => {
    if (err) throw err;
    
    ids.map((id) => bot.sendMessage(id, {text : "The flag has turned yellow. Stay safe out there :)"}, (err,info) => console.error(err)));
  });
};

transitionFunctions[Flag.Colours.RED][Flag.Colours.NOP] = NOPMessage;

flagWatcher.onTransition(transitionFunctions);
flagWatcher.watch(process.env.SCREEN_NAME || "cucbc_flag_test");
console.log("Watching "+(process.env.SCREEN_NAME || "cucbc_flag_test"));

// Prevent dyno from sleeping by making fake requests
setInterval(function() {
    http.get("http://cucbc-flag.herokuapp.com/_status");
}, 300000); // every 5 minutes (300000)
