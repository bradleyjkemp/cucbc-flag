'use strict';
const Stream = require('user-stream');
const Twitter = require('twitter');

class Flag {
  constuctor (tokens, redis) {
    console.log("Watcher constructed");
    this._redis = redis;
    
    this._twitterStream = new Stream({
      consumer_key: tokens.CONSUMER_KEY,
      consumer_secret: tokens.CONSUMER_SECRET,
      access_token_key: tokens.ACCESS_TOKEN_KEY,
      access_token_secret: tokens.ACCESS_TOKEN_SECRET
    });
    
    this._twitterStream.on('data', this._handle.bind(this));
    this._twitterStream.on('close', this.watch.bind(this));
    
    this._twitter = new Twitter({
      consumer_key: tokens.CONSUMER_KEY,
      consumer_secret: tokens.CONSUMER_SECRET,
      access_token_key: tokens.ACCESS_TOKEN_KEY,
      access_token_secret: tokens.ACCESS_TOKEN_SECRET
    });
  }
  
  watch (screenName) {
    if(screenName) this.screenName = screenName;
    if(!this.screenName) throw new Error("A twitter screen name is required");
    
    this._forceTwitterCheck();
    
    this._twitterStream.stream();
    
    // backup check of the flag in case we missed the tweet during a restart
    this._intervalId = setInterval(this._forceTwitterCheck.bind(this), 300000);
  }
  
  stop () {
    // stop stream and interval checker
    this._twitterStream.destroy();
    clearInterval(this._intervalId);
  }
  
  onTransition (transitionFunctions) {
    this.transitionFunctions = transitionFunctions;
  }
  
  _handle (tweetObj) {
    if (!this._isTweet(tweetObj)) return;
    if (!this._fromUser(tweetObj, this.screenName)) return;
    
    let newFlag = this._extractColour(tweetObj.text);
    
    this._setFlag(newFlag);
  }
  
  _setFlag (newFlag) {
    console.log("setting flag to "+newFlag);
    if (!newFlag) {
      throw new Error("New flag was undefined");
    }
    this._redis.getset("FLAG", newFlag, (err, prevFlag) => {
      if (err) throw err;
      console.log("old flag was "+prevFlag);
      if(newFlag !== prevFlag) {
        console.log("transitioning");
        this._transition(prevFlag, newFlag);
      }
    });
  }
  
  _transition (oldFlag, newFlag) {
    console.log("transitioning from "+oldFlag+"->"+newFlag);
     this.transitionFunctions[oldFlag][newFlag]();
  }
  
  _isTweet (tweetObj) {
    return (tweetObj.user && tweetObj.text);
  }
  
  _fromUser (tweetObj, screenName) {
    return (tweetObj.user.screen_name === screenName);
  }
  
  _extractColour (tweetText) {
    if(tweetText.toLowerCase().indexOf("red") !== -1) return Flag.Colours.RED;
    if(tweetText.toLowerCase().indexOf("green") !== -1) return Flag.Colours.GREEN;
    if(tweetText.toLowerCase().indexOf("yellow") !== -1) return Flag.Colours.YELLOW;
    return Flag.Colours.NOP;
  }
  
  _forceTwitterCheck () {
    let self = this;

    this._twitter.get('statuses/user_timeline', {screen_name: this.screenName}, (err, tweets, response) => {
      if (err) throw err;
      console.log(tweets[0].text);
      var currentFlag = self._extractColour(tweets[0].text);
      console.log(currentFlag);
      self._setFlag(currentFlag);
    });
  }
}

Flag.Colours = {
    "RED": "Red",
    "GREEN": "Green",
    "YELLOW": "Yellow",
    "NOP": "Not operational"
};

module.exports = Flag;
