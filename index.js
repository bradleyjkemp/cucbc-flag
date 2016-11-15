'use strict'
var opbeat = require('opbeat').start()
const http = require('http')
const Bot = require('messenger-bot')
const redis = require('redis').createClient(process.env.REDIS_URL);

var OPTIONS = {
  YELLOW_AND_RED: 0,
  JUST_RED: 1,
  DEBUG: 2
};

var FLAGS = {
  GREEN : "Green",
  YELLOW : "Yellow",
  RED : "Red",
  NOP : "Not operational"
};

var INVERSE_FLAGS = {
  
}

let bot = new Bot({
  token: process.env.TOKEN,
  verify: process.env.VERIFY,
  app_secret: process.env.APP_SECRET
})

bot.removeGetStartedButton();
bot.removePersistentMenu();

bot.on('error', (err) => {
  console.error(err.message)
})

bot.setGetStartedButton(
  [{
    payload: "GET_STARTED"
  }],
  function(err, profile) {
    if (err) console.error(err);
  }
);

function getStarted(message, reply, actions) {
  redis.srem("YELLOW_AND_RED", message.sender.id);
  redis.srem("JUST_RED", message.sender.id);
  redis.srem("DEBUG", message.sender.id);
  reply({
    "text": "Which flags stop you rowing?",
    "quick_replies": [{
      "content_type": "text",
      "title": "Yellow and Red",
      "payload": "YELLOW_AND_RED"
    }, {
      "content_type": "text",
      "title": "Just Red",
      "payload": "JUST_RED"
    }, {
      "content_type": "text",
      "title": "Stop Updates",
      "payload": "NOP"
    }]
  });
}

var payloads = {
  'GET_STARTED' : getStarted,
  
  "YELLOW_AND_RED" : function(message, reply, actions) {
    redis.get("FLAG", (err, flag) => reply({text: "Ok we'll tell you about all flags. The current flag is " + flag}));
    redis.sadd("YELLOW_AND_RED", message.sender.id);
  },
  
  "JUST_RED" : function(message, reply, actions) {
    redis.get("FLAG", (err, flag) => reply({text: "Ok we'll only tell you about red flags. The current flag is " + flag}));
    redis.sadd("JUST_RED", message.sender.id);
  },
  
  "UPDATE_SUBSCRIPTION" : getStarted,
  
  "NOP": function(message) {
    console.log("mark seeen");
    bot.sendSenderAction(message.sender.id, "MARK_SEEN", (err, info) => {console.error(err); console.log(info)});
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
  
  reply({
    "text": "Do you want to update your subscription?",
    "quick_replies": [{
      "content_type": "text",
      "title": "Yes",
      "payload": "UPDATE_SUBSCRIPTION"
    }, {
      "content_type": "text",
      "title": "No",
      "payload": "NOP"
    }]
  });
});

http.createServer(bot.middleware()).listen(process.env.PORT || 5000);
console.log('Echo bot server running at port 3000.');


var Stream = require('user-stream');
var stream = new Stream({
    consumer_key: process.env.CONSUMER_KEY,
    consumer_secret: process.env.CONSUMER_SECRET,
    access_token_key: process.env.ACCESS_TOKEN_KEY,
    access_token_secret: process.env.ACCESS_TOKEN_SECRET
});
 
//create stream 
stream.stream();


function extractColour(tweet) {
  if(tweet.toLowerCase().indexOf("red") !== -1) return FLAGS.RED;
  if(tweet.toLowerCase().indexOf("green") !== -1) return FLAGS.GREEN;
  if(tweet.toLowerCase().indexOf("yellow") !== -1) return FLAGS.YELLOW;
  return FLAGS.NOP;
}
 
//listen stream data 
stream.on('data', function(json) {
  opbeat.setTransactionName("TWITTER_STREAM");
  
  if (!json.user || !json.text) {console.log("not message"); return};
  console.log("Pushing messages");
  
  var newFlag = extractColour(json.text);
  
  if (json.user.screen_name === "cucbc" 
      || json.user.screen_name === "cucbc_flag_test") {
    //handle flag colours
    redis.get("FLAG", (err, prevFlag) => {
      if (err) throw err;
      console.log(prevFlag +"->"+newFlag);
      if (prevFlag === newFlag) {
        return;
      } else {
        redis.set("FLAG", newFlag);
      }
      
      if (newFlag === FLAGS.GREEN) {
        redis.sunion("YELLOW_AND_RED", "JUST_RED", "DEBUG", (err, ids) => {
          if (err) throw err;
          ids.map((id) => bot.sendMessage(id, {text : "The flag is green again!"}, (err,info) => console.error(err)));
        });
      } else if (newFlag === FLAGS.RED) {
        if (prevFlag == FLAGS.YELLOW) {
          redis.sunion("JUST_RED", "DEBUG", (err, ids) => {
            if (err) throw err;
            ids.map((id) => bot.sendMessage(id, {text : "The flag is red :( How about an erg instead?"}, (err,info) => console.error(err)));
          });
        } else if (prevFlag == FLAGS.GREEN) {
          redis.sunion("YELLOW_AND_RED", "JUST_RED", "DEBUG", (err, ids) => {
            if (err) throw err;
            ids.map((id) => bot.sendMessage(id, {text : "The flag is red :( How about an erg instead?"}, (err,info) => console.error(err)));
          });
        }
      } else if (newFlag === FLAGS.YELLOW) {
        console.log("yellow flag");
        console.log(prevFlag);
        console.log(prevFlag === FLAGS.RED ? "good" : "wtf!");
        if (prevFlag == FLAGS.RED) { // double equals required
          console.log("successfully entered loop");
          redis.sunion("JUST_RED", "DEBUG", (err, ids) => {
            if (err) throw err;
            console.log(ids);
            ids.map((id) => bot.sendMessage(id, {text : "The flag is yellow again. Be safe out there :/"}, (err,info) => console.error(err)));
          });
        } else if (prevFlag == FLAGS.GREEN) { // double equals required
          console.log("entered wrong branch");
          redis.sunion("YELLOW_AND_RED", "DEBUG", (err, ids) => {
            if (err) throw err;
            ids.map((id) => bot.sendMessage(id, {text : "Sorry, the flag has turned yellow :("}, (err,info) => console.error(err)));
          });
        }
        console.log("passed through conditional");
      }
    });
  }
});

// Prevent dyno from sleeping by making fake requests
setInterval(function() {
    http.get("https://cucbc-flag.herokuapp.com/_status");
}, 300000); // every 5 minutes (300000)
