
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
    console.log('Sent ' + event);
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
    console.log('Sent metric ' + metric + ' with  value ' + value);
};

// Takes a string.
µBlock.goodblock.sendToDb = function(data) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', 'http://inlet.goodblock.org/write?db=impressions', true);
    xhr.setRequestHeader("Authorization", "Basic " + btoa('logger:DwV5WWXXQgNVg6hgKXFj'));
    xhr.send(data);
    console.log('Sent data:', data);
};

/******************************************************************************/

µBlock.goodblock.gladlyHostnames = ['gladlyads.xyz'];
µBlock.goodblock.gladlyAdServerDomains = ['gladlyads.xyz'];

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
        'url': 'https://gladlyads.xyz/adserver/',
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
    var today = new Date();
    var now = today.getTime();
    var timeToSleep = µBlock.goodblock.config.devConfig.timeMsToSleep;
    return now + timeToSleep;
}

// Takes a sleepEvent string.
// Returns the number of milliseconds until Goodblock should
// wake up.
µBlock.goodblock.getTimeToWakeUp = function(sleepEvent) {

    var wakeTime;

    // Handle sleep and snooze differently.
    switch (sleepEvent) {
        case 'sleep':
            if (µBlock.goodblock.config.isDev) {
                wakeTime = µBlock.goodblock.getDevTimeToWakeUp();
            }
            else {
                wakeTime = µBlock.goodblock.getTimeAtEightAmTomorrow();
            }
            break;
        case 'snooze':
            var snoozeTime;
            if (µBlock.goodblock.config.isDev) {
                snoozeTime = µBlock.goodblock.config.devConfig.timeMsToSnooze;
            }
            else {
                snoozeTime = µBlock.goodblock.config.timeMsToSnooze;
            }
            var today = new Date();
            wakeTime = today.getTime() + snoozeTime;
            break;
        default:
            break;
    }
    return wakeTime;
}

/******************************************************************************/

// Takes the UTC time (milliseconds) Goodblock should wake.
µBlock.goodblock.setGoodblockWakeTimeAlarm = function(timeToWakeUp) {
    // Debugging.
    if (timeToWakeUp <= 0) {
        // console.log('Goodblock will wake up now!');
    }
    else {
        // convert UTC milliseconds to readable date.
        var d = new Date(0);
        d.setUTCMilliseconds(timeToWakeUp);
        // console.log('Goodblock will wake up at', d);
    }

    // Store the time Goodblock should wake up.
    µBlock.localSettings.timeToWakeUp = timeToWakeUp;

    var today = new Date();
    var timeUntilWakeMs = timeToWakeUp - today.getTime();

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
    var timeToWakeUpMs = µBlock.goodblock.getTimeToWakeUp('snooze');
    µBlock.goodblock.setGoodblockWakeTimeAlarm(timeToWakeUpMs);
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
    var timeToWakeUpMs = µBlock.goodblock.getTimeToWakeUp('sleep');
    µBlock.goodblock.setGoodblockWakeTimeAlarm(timeToWakeUpMs);
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
    var timeToWakeUp = µBlock.localSettings.timeToWakeUp;

    var today = new Date();

    // It's not time to wake Goodblock.
    if (timeToWakeUp > today.getTime()) {
        // console.log('Shhhh, Tad is asleep!');
        µBlock.goodblock.markIfGoodblockIsAwake(false);
        µBlock.goodblock.setGoodblockWakeTimeAlarm(timeToWakeUp);
    }
    // It is time to wake Goodblock.
    else {
        µBlock.goodblock.markIfGoodblockIsAwake(true);
        µBlock.goodblock.setGoodblockWakeTimeAlarm(0);
    }
}

/******************************************************************************/

// Check if we should hide Tad
// (aka, it is currently snoozing or sleeping)
µBlock.goodblock.checkIfShouldWakeUpGoodblock();

/******************************************************************************/

module.exports = µBlock.goodblock;
