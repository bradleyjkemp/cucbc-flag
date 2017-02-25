'use strict';
const nBayes = require('nbayes');
const classifier = nBayes();
const MessageTypes = require('./message-types.js');

const TrainingData = {};

TrainingData[MessageTypes.GREETING] = [
  "Hi",
  "Hey",
  "What's up?",
];

TrainingData[MessageTypes.FLAG_QUERY] = [
  "What's the flag?",
  "Is the flag green?",
  "Can I row?",
];

TrainingData[MessageTypes.SUBSCRIPTION_UPDATE] = [
  "Update Subscription",
  "Preferences",
  "Settings",
];

Object.keys(TrainingData).forEach(
  (type) =>
    TrainingData[type].forEach(
      (message)=> classifier.learn(type, nBayes.stringToDoc(message))
    )
);

classifier._classify = classifier.classify;

classifier.classify = (string) => classifier._classify(nBayes.stringToDoc(string));

module.exports = classifier;