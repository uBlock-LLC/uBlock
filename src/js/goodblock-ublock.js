
var getTimeAtEightAmTomorrow = require('./goodblock/get-time-at-eight-am-tomorrow');

/******************************************************************************/

// Goodblock logging

µBlock.goodblock.log = {};

// Inputs:
// - measurementName, a string
// - fieldsObj, an object
// - tagsObj, an object (or null)
// Output: a string to post to InfluxDB.
// TODO: Key values for fieldsObj and tagsObj cannot currently contain spaces
// or commas, because this function doesn't escape characters. Fix this.
// This automatically includes userId in the fields and meta tags.
µBlock.goodblock.log.formInfluxDbDataStr = function(measurementName, fieldsObj, tagsObj) {
    function objToStr(obj, useQuotes) {
        var str = '';

        for(var keys = Object.keys(obj), i = 0; i < keys.length; i++) {
            var key = keys[i];
            var value = typeof(obj[key]) == 'string' && useQuotes ? '"' + obj[key] + '"' : obj[key];
            str = str + key + '=' + value;

            // See if we should add a trailing comma.
            var isLastKey = i == (keys.length - 1);
            if (!isLastKey) {
                str = str + ',';
            }
        };
        return str;
    }

    var dataStr = 'extension.';
    dataStr = dataStr + measurementName;

    // Add tag values.
    if (tagsObj) {
        dataStr = dataStr + ',' + objToStr(tagsObj, false);
    }

    // Add field values.
    dataStr = dataStr + ' ' + objToStr(fieldsObj, true);

    // Add userId to the fields.
    // We don't make userId a tag because we want to keep cardinality low. See:
    // https://influxdb.com/docs/v0.9/concepts/schema_and_data_layout.html
    dataStr = dataStr + ',userId="' + µBlock.userSettings.userId + '"';

    return dataStr;
}



µBlock.goodblock.log.logEvent = function(event) {
    var data = µBlock.goodblock.log.formInfluxDbDataStr(
        event,
        {
            'event': event,
        },
        {
            'event': event,
        }
    );

    µBlock.goodblock.sendToDb(data);
    // console.log('Sent ' + event);
};

µBlock.goodblock.log.logMetric = function(metric, value) {
    var data = µBlock.goodblock.log.formInfluxDbDataStr(
        metric,
        {
            'value': value,
            'event': metric,
        }
    );
    µBlock.goodblock.sendToDb(data);
    // console.log('Sent metric ' + metric + ' with  value ' + value);
};

// Takes a string.
µBlock.goodblock.sendToDb = function(data) {
    // var xhr = new XMLHttpRequest();
    // xhr.open('POST', 'http://inlet.goodblock.org/write?db=impressions', true);
    // xhr.setRequestHeader("Authorization", "Basic " + btoa('logger:DwV5WWXXQgNVg6hgKXFj'));
    // xhr.send(data);
    // console.log('Sent data:', data);
};

/******************************************************************************/

µBlock.goodblock.gladlyHostnames = ['gladlyads.xyz', 'goodblock.org'];
µBlock.goodblock.gladlyAdServerDomains = ['goodblock.org'];

/******************************************************************************/

µBlock.goodblock.isGladlyHostname = function(hostname) {
    return (µBlock.goodblock.gladlyHostnames.indexOf(hostname) > -1);
}

/******************************************************************************/

µBlock.goodblock.isGladlyAdServer = function(hostname) {
    return (µBlock.goodblock.gladlyAdServerDomains.indexOf(hostname) > -1);
}

/******************************************************************************/

// To store info about browser activity that's relevant to Goodblock.
µBlock.goodblock.browserState = {
    isAwake: false,
    wakeTimeout: null,
    activeTabId: null,
    isAdOpen: false,
    adTabId: null,
    lastWakeTime: null
}

/******************************************************************************/

µBlock.goodblock.updateGoodblockVisibilityByTabId = function(tabId, isVisible) {
    if (!tabId) {
        return;
    }
    vAPI.messaging.messageTab({
        what: 'goodblockVisibility',
        data: {
            isVisible: isVisible,
        },
    }, tabId);
}

/******************************************************************************/

// Control Goodblock visibility

µBlock.goodblock.updateActiveTab = function(activeTabId) {
    var oldActiveTabId = µBlock.goodblock.browserState['activeTabId'];

    // Set the new active tab.
    µBlock.goodblock.browserState['activeTabId'] = activeTabId;

    // // Update Goodblock visibility on old and new tabs.
    // µBlock.goodblock.updateGoodblockVisibilityByTabId(oldActiveTabId, false);
    // µBlock.goodblock.updateGoodblockVisibilityByTabId(activeTabId, true);
}

/******************************************************************************/

µBlock.goodblock.openAd = function() {
    µBlock.goodblock.browserState.isAdOpen = true;
    var thing = vAPI.tabs.open({
        'url': 'https://goodblock.org/app/ad/',
        'index': -1,
        'select': true,
    });
    µBlock.goodblock.log.logEvent('adOpened');
}

/******************************************************************************/

// Saves the tab ID of the tab showing a Gladly ad.
// tabId is a string.
µBlock.goodblock.saveGladlyAdTabId = function(tabId) {
    µBlock.goodblock.browserState.adTabId = tabId;
}

µBlock.goodblock.getGladlyAdTabId = function() {
    return µBlock.goodblock.browserState.adTabId;
}

/******************************************************************************/

µBlock.goodblock.closeAd = function() {
    µBlock.goodblock.browserState.isAdOpen = false;
    µBlock.goodblock.browserState.adTabId = null;

    µBlock.goodblock.goodnightGoodblock();
    µBlock.goodblock.log.logEvent('adClosed');
}

/******************************************************************************/

µBlock.goodblock.markIfGoodblockIsAwake = function(isAwake) {
    if (!µBlock.goodblock.browserState.isAwake && isAwake) {
      // When tranisitioning from asleep to awake, set last wake time
      µBlock.goodblock.browserState.lastWakeTime = new Date().getTime();
    }
    µBlock.goodblock.browserState.isAwake = isAwake;
}

/******************************************************************************/

µBlock.goodblock.isGoodblockAwake = function() {
    return µBlock.goodblock.browserState.isAwake;
}

/******************************************************************************/

µBlock.goodblock.getTimeAtEightAmTomorrow = getTimeAtEightAmTomorrow;

µBlock.goodblock.getDevTimeToWakeUp = function() {
    var now = new Date();
    var secondsToSleep = µBlock.goodblock.config.devConfig.timeMsToSleep / 1000;
    now.setSeconds(now.getSeconds() + secondsToSleep);
    return now;
}

// Takes a sleepEvent string.
// Returns the date Goodblock should wake up.
µBlock.goodblock.getTimeToWakeUp = function(sleepEvent) {

    // Handle sleep and snooze differently.
    switch (sleepEvent) {
        case 'sleep':
            var wakeTime;
            if (µBlock.goodblock.config.isDev) {
                wakeTime = µBlock.goodblock.getDevTimeToWakeUp();
            }
            else {
                wakeTime = µBlock.goodblock.getTimeAtEightAmTomorrow();
            }
            return wakeTime;
            break;
        case 'snooze':
            var secondsToSnooze;
            if (µBlock.goodblock.config.isDev) {
                secondsToSnooze = µBlock.goodblock.config.devConfig.timeMsToSnooze / 1000;
            }
            else {
                secondsToSnooze = µBlock.goodblock.config.timeMsToSnooze / 1000;
            }
            var now = new Date();
            now.setSeconds(now.getSeconds() + secondsToSnooze);
            return now;
            break;
        default:
            break;
    }
}

/******************************************************************************/

// Takes the date Goodblock should wake.
µBlock.goodblock.setGoodblockWakeTimeAlarm = function(timeToWakeUp) {

    // Store the time Goodblock should wake up.
    µBlock.goodblock.API.setTimeToWake(dateToWake).then(
        function(data) {
            console.log('Updated time to wake.');
        },
        function(error) {
            console.log('Error updating time to wake:', error);
        }
    );

    var today = new Date();
    var timeUntilWakeMs = timeToWakeUp.getTime() - today.getTime();

    // If a previous alarm exists, clear it.
    var oldWakeTimeout = µBlock.goodblock.browserState.wakeTimeout;
    if (oldWakeTimeout) {
        clearTimeout(oldWakeTimeout);
    }

    // Set an alarm to make Goodblock visible when
    // it's time to wake up.
    var wakeTimeout = setTimeout(function() {
        µBlock.goodblock.updateGoodblockVisibility(true);
    }, timeUntilWakeMs);

    µBlock.goodblock.browserState.wakeTimeout = wakeTimeout;
}

/******************************************************************************/

µBlock.goodblock.snoozeGoodblock = function() {
    µBlock.goodblock.updateGoodblockVisibility(false);

    // Get the time to wake up after snoozing.
    var dateToWakeUp = µBlock.goodblock.getTimeToWakeUp('snooze');
    µBlock.goodblock.setGoodblockWakeTimeAlarm(dateToWakeUp);
    µBlock.goodblock.log.logEvent('snooze');
    if (µBlock.goodblock.browserState.lastWakeTime) {
      var timeTilSnooze = new Date().getTime() - µBlock.goodblock.browserState.lastWakeTime;
      µBlock.goodblock.log.logMetric('timeUntilSnooze', timeTilSnooze);
    }
}

/******************************************************************************/

µBlock.goodblock.goodnightGoodblock = function() {

    vAPI.messaging.broadcast({
        what: 'goToBed',
        data: {},
    });

    // Mark that Goodblock is asleep.
    µBlock.goodblock.markIfGoodblockIsAwake(false);

    // Get the time to wake up after sleeping.
    var dateToWakeUp = µBlock.goodblock.getTimeToWakeUp('sleep');
    µBlock.goodblock.setGoodblockWakeTimeAlarm(dateToWakeUp);
    µBlock.goodblock.log.logEvent('goodnight');
    if (µBlock.goodblock.browserState.lastWakeTime) {
      var timeTilAd = new Date().getTime() - µBlock.goodblock.browserState.lastWakeTime;
      µBlock.goodblock.log.logMetric('timeUntilAd', timeTilAd);
    }
}

/******************************************************************************/

µBlock.goodblock.updateGoodblockVisibility = function(isVisible) {
    vAPI.messaging.broadcast({
        what: 'goodblockVisibility',
        data: {
            isVisible: isVisible,
        },
    });

    // Mark whether Goodblock is asleep.
    µBlock.goodblock.markIfGoodblockIsAwake(isVisible);
    if (isVisible) {
      µBlock.goodblock.log.logEvent('wokeUp');
    }
}

/******************************************************************************/

µBlock.goodblock.checkIfShouldWakeUpGoodblock = function() {

    // Get the UTC time to wake up in milliseconds.
    µBlock.goodblock.API.getUserData().then(
        function(data) {
            var dateToWakeUp = new Date(data['next_notify_time']);
            var now = new Date();
            // It's not time to wake Goodblock.
            if (dateToWakeUp > now) {
                // console.log('Shhhh, Tad is asleep!');
                µBlock.goodblock.markIfGoodblockIsAwake(false);
                µBlock.goodblock.setGoodblockWakeTimeAlarm(dateToWakeUp);
            }
            // It is time to wake Goodblock.
            else {
                µBlock.goodblock.markIfGoodblockIsAwake(true);
                µBlock.goodblock.setGoodblockWakeTimeAlarm(now);
            }
        },
        function(error) {
            // If the user isn't logged in, default to showing Tad.
            console.log('User is not logged in.');
            µBlock.goodblock.markIfGoodblockIsAwake(true);
            var now = new Date();
            µBlock.goodblock.setGoodblockWakeTimeAlarm(now);
        }
    );
}

/******************************************************************************/

µBlock.goodblock.postLogin = function() {
    µBlock.goodblock.checkIfShouldWakeUpGoodblock();
};

/******************************************************************************/

var TOKEN_LOCAL_STORAGE_KEY = 'goodblockToken';

µBlock.goodblock.setUserAuthToken = function(token) {
  var currentToken = µBlock.goodblock.getUserAuthToken();

  // If the new token is different from the old one, set it.
  if (token != currentToken) {
    vAPI.localStorage.setItem(TOKEN_LOCAL_STORAGE_KEY, token);

    // Handle anything we need to do after logging in.
    µBlock.goodblock.postLogin();
  } 
};

µBlock.goodblock.getUserAuthToken = function() {
  return vAPI.localStorage.getItem(TOKEN_LOCAL_STORAGE_KEY)
};

/******************************************************************************/

// API access
µBlock.goodblock.API = {};
µBlock.goodblock.API.baseUrl = 'https://goodblock.org/api';
µBlock.goodblock.API.fetchEndpoint = function(method, endpoint, data) {
  var dataToSend = data;
  return new Promise(function(resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, endpoint);

    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('Content-Type', 'application/json');

    // If we have a token, use it.
    var token = µBlock.goodblock.getUserAuthToken();
    if (token) {
        xhr.setRequestHeader('Authorization', 'Token ' + token);
    }
    xhr.onload = function () {
      if (this.status >= 200 && this.status < 300) {
        resolve(JSON.parse(xhr.response));
      } else {
        reject({
          status: this.status,
          statusText: xhr.statusText
        });
      }
    };
    xhr.onerror = function () {
      reject({
        status: this.status,
        statusText: xhr.statusText
      });
    };

    // Add the body to the request if it's not a GET or HEAD request.
    if (['GET', 'HEAD'].indexOf(method) === -1) {
        // `data` parameter is optional.
        var data = dataToSend || {};
        xhr.send(JSON.stringify(data));
    } else {
      xhr.send();
    }
  });
};

µBlock.goodblock.API.getUserData = function() {
    var url = µBlock.goodblock.API.baseUrl + '/me/';
    return µBlock.goodblock.API.fetchEndpoint('GET', url);
}

µBlock.goodblock.API.setTimeToWake = function(datetime) {
    var data = {
        next_notify_time: datetime,
    };
    var url = µBlock.goodblock.API.baseUrl + '/users/update-notify-time/';
    return µBlock.goodblock.API.fetchEndpoint('POST', url, data);
}

/******************************************************************************/

// Check if we should hide Tad
// (aka, it is currently snoozing or sleeping)
µBlock.goodblock.checkIfShouldWakeUpGoodblock();

/******************************************************************************/

module.exports = µBlock.goodblock;
