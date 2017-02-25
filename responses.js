'use strict';
const Flag = require('./flag.js');
const Types = require('./message-types.js');
const format = require('string-format');
format.extend(String.prototype);

Array.prototype.randomElement = function () {
  return this[Math.floor((Math.random()*this.length))];
};

const Responses = {};
Responses.Messages = {};
Responses.Types = {};

Responses.Messages[Types.GREETING] = [
  "Hi there!",
  "Hello :)",
];


Responses.Messages[Types.FLAG_UPDATE] = {};
Responses.Messages[Types.FLAG_UPDATE][Types.POSITIVE] = [
  "Good news! The flag is {color} again",
  "The flag is {color} again :)",
];
Responses.Messages[Types.FLAG_UPDATE][Types.NEGATIVE] = [
  "Bad news: the flag has turned {color}",
  "The flag has turned {color}. Sad times :(",
];


Responses.Messages[Types.FLAG_QUERY] = {};
Responses.Messages[Types.FLAG_QUERY][Types.POSITIVE] = [
  "Good news! The flag is {color}",
  "The flag is {color} :)",
];
Responses.Messages[Types.FLAG_QUERY][Types.NEGATIVE] = [
  "Bad news: the flag is {color}",
  "The flag is {color}. Sad times :(",
];

Responses.Sentiments = {};
Responses.Sentiments["YELLOW_SUBSCRIBERS"] = {};
Responses.Sentiments["YELLOW_SUBSCRIBERS"][Flag.Colors.GREEN] = Types.POSITIVE;
Responses.Sentiments["YELLOW_SUBSCRIBERS"][Flag.Colors.YELLOW] = Types.NEGATIVE;
Responses.Sentiments["YELLOW_SUBSCRIBERS"][Flag.Colors.RED] = Types.NEGATIVE;
Responses.Sentiments["RED_SUBSCRIBERS"] = {};
Responses.Sentiments["RED_SUBSCRIBERS"][Flag.Colors.GREEN] = Types.POSITIVE;
Responses.Sentiments["RED_SUBSCRIBERS"][Flag.Colors.YELLOW] = Types.POSITIVE;
Responses.Sentiments["RED_SUBSCRIBERS"][Flag.Colors.RED] = Types.NEGATIVE;


Responses.Types[Types.GREETING] = (reply) => {
  reply({text: Responses.Messages[Types.GREETING].randomElement()});
};

Responses.Types[Types.FLAG_QUERY] = (reply, flag, sentiment) => {
  console.log(flag);
  console.log(sentiment);
  console.log(Responses.Messages[Types.FLAG_UPDATE]);
  reply({
    text: Responses.Messages[Types.FLAG_QUERY][sentiment].randomElement().format({
      color: flag
    })
  });
};

Responses.Types[Types.SUBSCRIPTION_UPDATE] = (reply) => {
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
};

Responses.respond = (reply, type, flag, sentiment) => {
  console.log(Responses.Types);
  console.log(type);
  Responses.Types[type](reply, flag, sentiment);
};

module.exports = Responses;
