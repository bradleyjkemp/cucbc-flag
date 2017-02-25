'use strict';
var opbeat;
if (!process.env.TEST_PREFIX) {
  opbeat = require('opbeat').start();
} else {
  opbeat = {setTransactionName: ()=>{}};
}
const http = require('http');
const Bot = require('messenger-bot');
const redis = require('redis').createClient(process.env.REDIS_URL, {
  prefix: process.env.TEST_PREFIX
});

console.log("Prefixing Redis keys with "+process.env.TEST_PREFIX);
const Flag = require('./flag.js');
let flagWatcher = new Flag(process.env, redis);
flagWatcher.constuctor(process.env, redis);

const MessageTypes = require('./message-types.js');
const conversation = require('./conversation.js');
const responses = require('./responses.js');

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
    "type": "postback",
    "title": "Update Subscription",
    "payload": "UPDATE_SUBSCRIPTION"
  },
  {
    "type": "postback",
    "title": "Current Flag",
    "payload": "FLAG_QUERY"
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
        "text": "Do you want to be told about flag changes?",
        "buttons": [{
          "type": "postback",
          "title": "Yes",
          "payload": "YELLOW_AND_RED"
        }, {
          "type": "postback",
          "title": "No",
          "payload": "UNSUBSCRIBE"
        }]
      }
  }}, (err) => console.error(err));
}

var payloads = {
  'GET_STARTED': getStarted,
  
  "YELLOW_AND_RED": function(message, reply, actions) {
    redis.get("FLAG", (err, flag) => {
      if (err) throw err;
      reply({text: "Ok we'll let you know when you can't row. The current flag is " + flag});
    });
    redis.sadd("YELLOW_SUBSCRIBERS", message.sender.id);
  },
  
  "JUST_RED": function(message, reply, actions) {
   redis.get("FLAG", (err, flag) => {
      if (err) throw err;
      reply({text: "Ok we'll let you know when you can't row. The current flag is " + flag});
    });
    redis.sadd("RED_SUBSCRIBERS", message.sender.id);
  },
  
  "UPDATE_SUBSCRIPTION": getStarted,
  
  "FLAG_QUERY": (message, reply, actions) => {
    console.log(message);
    respond(MessageTypes.FLAG_QUERY, message.sender.id, reply);
  },
  
  "UNSUBSCRIBE": (message, reply, actions) => {
    reply({text: "Ok, you're unsubscribed."});
  },
  
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
  console.log("postback recieved");
  opbeat.setTransactionName(message.postback.payload);
  if (payloads[message.postback.payload]) {
    payloads[message.postback.payload](message, reply, actions);
  } else {
    console.error(message.postback.payload + " not known");
  }
});

function respond(type, senderId, reply) {
  console.log(reply);
  redis.sismember("RED_SUBSCRIBERS", senderId, (err, red) => {
    if (err) throw err;
    var subscriberType = red ? "RED_SUBSCRIBERS" : "YELLOW_SUBSCRIBERS";
    
    redis.get("FLAG", (err, flag) => {
      if (err) throw err;
      
      var sentiment = responses.Sentiments[subscriberType][flag];
      responses.respond(reply, type, flag, sentiment);
    });
  });
}

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
  
  var type = conversation.classify(payload.message.string);
  respond(type, payload.sender.id, reply);
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
  redis.sunion("YELLOW_SUBSCRIBERS", "YELLOW_AND_RED", "RED_SUBSCRIBERS", "JUST_RED", (err, ids) => {
    if (err) throw err;
    
    ids.map((id) => bot.sendMessage(id, {text : "The flag is no longer in operation"}, (err,info) => console.error(err)));
  });
}

function GREENMessage () {
  redis.sunion("YELLOW_SUBSCRIBERS", "YELLOW_AND_RED", "RED_SUBSCRIBERS", "JUST_RED", (err, ids) => {
    if (err) throw err;
    
    ids.map((id) => bot.sendMessage(id, {text : "The flag is green again!"}, (err,info) => console.error(err)));
  });
}

transitionFunctions[Flag.Colors.GREEN] = {};
transitionFunctions[Flag.Colors.YELLOW] = {};
transitionFunctions[Flag.Colors.RED] = {};
transitionFunctions[Flag.Colors.NOP] = {};

transitionFunctions[Flag.Colors.GREEN][Flag.Colors.YELLOW] = () => {
  console.log("test");
  redis.sunion("YELLOW_SUBSCRIBERS", "YELLOW_AND_RED", "RED_SUBSCRIBERS", "JUST_RED", (err, ids) => {
    if (err) throw err;
    console.log(ids);
    ids.map((id) => bot.sendMessage(id, {text : "Sorry, the flag has turned yellow :("}, (err,info) => console.error(err)));
  });
};

transitionFunctions[Flag.Colors.GREEN][Flag.Colors.RED] = () => {
  redis.sunion("YELLOW_SUBSCRIBERS", "YELLOW_AND_RED", "RED_SUBSCRIBERS", "JUST_RED", (err, ids) => {
    if (err) throw err;
    
    ids.map((id) => bot.sendMessage(id, {text : "Sorry, the flag has turned red :("}, (err,info) => console.error(err)));
  });
};

transitionFunctions[Flag.Colors.GREEN][Flag.Colors.NOP] = NOPMessage;

transitionFunctions[Flag.Colors.YELLOW][Flag.Colors.GREEN] = GREENMessage;

transitionFunctions[Flag.Colors.YELLOW][Flag.Colors.RED] = () => {
  redis.sunion("YELLOW_SUBSCRIBERS", "YELLOW_AND_RED", "RED_SUBSCRIBERS", "JUST_RED", (err, ids) => {
    if (err) throw err;
    
    ids.map((id) => bot.sendMessage(id, {text : "Sorry, the flag has turned red :("}, (err,info) => console.error(err)));
  });
};

transitionFunctions[Flag.Colors.YELLOW][Flag.Colors.NOP] = NOPMessage;

transitionFunctions[Flag.Colors.RED][Flag.Colors.GREEN] = GREENMessage;

transitionFunctions[Flag.Colors.RED][Flag.Colors.YELLOW] = () => {
  redis.sunion("YELLOW_SUBSCRIBERS", "YELLOW_AND_RED", "RED_SUBSCRIBERS", "JUST_RED", (err, ids) => {
    if (err) throw err;
    
    ids.map((id) => bot.sendMessage(id, {text : "The flag has turned yellow. Getting slightly better..."}, (err,info) => console.error(err)));
  });
};

transitionFunctions[Flag.Colors.RED][Flag.Colors.NOP] = NOPMessage;

flagWatcher.onTransition(transitionFunctions);
flagWatcher.watch(process.env.SCREEN_NAME || "cucbc_flag_test");
console.log("Watching "+(process.env.SCREEN_NAME || "cucbc_flag_test"));

// Prevent dyno from sleeping by making fake requests
setInterval(function() {
    http.get("http://cucbc-flag.herokuapp.com/_status");
}, 300000); // every 5 minutes (300000)
