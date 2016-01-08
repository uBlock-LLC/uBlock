
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
    // xhr.open('POST', 'http://inlet.goodblock.gladly.io/write?db=impressions', true);
    // xhr.setRequestHeader("Authorization", "Basic " + btoa('logger:DwV5WWXXQgNVg6hgKXFj'));
    // xhr.send(data);
    // console.log('Sent data:', data);
};

/******************************************************************************/

µBlock.goodblock.tests = {
    contentSupport: {
        isTestUser: false,
        testGroup: null,
        constants: {
            TEST_GROUP_AD_VIEW: 1,
            TEST_GROUP_DONATE_HEARTS: 2,
        },
        domainBlacklist: [],
        contentSupportHistory: {},

        // Timing settings
        appearDelayMs: µBlock.goodblock.config.contentSupportTestAppearDelayMs,
        appearanceThrottleMs: µBlock.goodblock.config.contentSupportTestAppearanceThrottleMs,
        responseThrottleMs: µBlock.goodblock.config.contentSupportTestResponseThrottleMs,
        supportThrottleMs: µBlock.goodblock.config.contentSupportTestSupportThrottleMs,
        rejectThrottleMs: µBlock.goodblock.config.contentSupportTestRejectThrottleMs,


        dateOfLastGoodblockIconAppear: new Date(),
        dateOfLastGoodblockIconResponse: new Date(),
    },
};

µBlock.goodblock.addUserToTestGroups = function(userProfile) {
    if (userProfile.support_content_test !== µBlock.goodblock.tests.contentSupport.isTestUser) {
        µBlock.goodblock.tests.contentSupport.isTestUser = true;
        var testGroup = userProfile.support_content_test_channel;
        µBlock.goodblock.tests.contentSupport.testGroup = testGroup;
    }
};

µBlock.goodblock.getGoodblockTestGroupData = function() {
    return µBlock.goodblock.tests;
};

/******************************************************************************/

µBlock.goodblock.logContentSupportRequest = function() {
    return µBlock.goodblock.API.logContentSupportRequest();
};

// Takes a page URL. Returns a boolean.
µBlock.goodblock.shouldShowContentSupportRequest = function(pageUrl) {

    var hostname = µBlock.URI.hostnameFromURI(pageUrl);

    // See if the user recently saw or responded to a Goodblock request.
    function isTooSoon() {

        var testData = µBlock.goodblock.tests;
        var appearanceThrottleMs = testData.contentSupport.appearanceThrottleMs;
        var responseThrottleMs = testData.contentSupport.responseThrottleMs;
        var now = new Date();

        var dateOfLastAppear = testData.contentSupport.dateOfLastGoodblockIconAppear;
        var dateOfLastResponse = testData.contentSupport.dateOfLastGoodblockIconResponse;

        // See if the Goodblock icon has appeared too recently.
        var msSinceAppear = (now - dateOfLastAppear);
        if (msSinceAppear < appearanceThrottleMs) {
            return true;
        }

        // See if the user has responded to the Goodblock icon 
        // too recently.
        var msSinceResponse = (now - dateOfLastResponse);
        if (msSinceResponse < responseThrottleMs) {
            return true;
        }
        return false;
    }

    function isPageBlacklisted() {
        var testData = µBlock.goodblock.tests;
        var domainBlacklist = testData.contentSupport.domainBlacklist;
        return (domainBlacklist.indexOf(hostname) > -1);
    }

    // See if the user recently responded to a support content
    // request on this domain.
    function userRecentlyRespondedToThisDomain() {
        var testData = µBlock.goodblock.tests;
        var contentSupportHistory = testData.contentSupport.contentSupportHistory;

        var supportThrottleMs = testData.contentSupport.supportThrottleMs;
        var rejectThrottleMs = testData.contentSupport.rejectThrottleMs;

        var userRecentlyResponded = false;
        for (var i = 0; i < contentSupportHistory.length; i++) {
            var item = contentSupportHistory[i];

            var itemHostname;
            if (!item.domain || item.domain === '') {
                continue;
            } else {
                itemHostname = µBlock.URI.hostnameFromURI(item.domain);
            }

            if (itemHostname === hostname) {
                // See if the content support response was recent.
                var timeResponded = new Date(item.datetime);
                var now = new Date();
                var dateDiffInSecs = (now - timeResponded) / 1000;

                // If the user supported the site, wait less time to
                // ask again.
                var waitTimeInSecs;
                if (item.supported) {
                    waitTimeInSecs = supportThrottleMs / 1000;
                } else {
                    waitTimeInSecs = rejectThrottleMs / 1000;
                }
                if (dateDiffInSecs < waitTimeInSecs) {
                    userRecentlyResponded = true;
                    break;
                }
            }
        }
        return userRecentlyResponded;
    }

    var shouldShow = (
        !isTooSoon() &&
        !isPageBlacklisted() &&
        !userRecentlyRespondedToThisDomain()
    );

    // console.log(pageUrl);
    // console.log(hostname);
    // console.log('isTooSoon', isTooSoon());
    // console.log('isPageBlacklisted', isPageBlacklisted());
    // console.log('userRecentlyResponded', userRecentlyRespondedToThisDomain());
    // console.log('shouldShow', shouldShow);

    return shouldShow;
};

// Called to hide the Goodblock icon across all tabs.
µBlock.goodblock.changeIconVisibilityForContentSupportTest = function() {
    µBlock.goodblock.updateGoodblockVisibility(false);
};

/******************************************************************************/

µBlock.goodblock.userProfile = {};

µBlock.goodblock.storeUserProfile = function(userProfile) {
    µBlock.goodblock.userProfile = userProfile;  
};

µBlock.goodblock.getUserProfile = function() {
    return µBlock.goodblock.userProfile;
};

/******************************************************************************/

function getGladlyHostnamesFromConfig() {
    return µBlock.goodblock.config.gladlyHostnames;
}

function getGladlyAdUrlsFromConfig() {
    return µBlock.goodblock.config.gladlyAdUrls;
}

µBlock.goodblock.gladlyHostnames = getGladlyHostnamesFromConfig();
µBlock.goodblock.gladlyAdServerDomains = getGladlyHostnamesFromConfig();
µBlock.goodblock.gladlyAdUrls = getGladlyAdUrlsFromConfig();

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
        'url': 'https://goodblock.gladly.io/app/ad/',
        'index': -1,
        'select': true,
    });
    µBlock.goodblock.log.logEvent('adOpened');

    // Hide the Goodblock icon.
    µBlock.goodblock.goodnightGoodblock();
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

// Set the timer to wake up Goodblock.
// Takes the date Goodblock should wake.
µBlock.goodblock.setGoodblockWakeTimeAlarm = function(timeToWakeUp) {

    // Don't wake up Goodblock on a timer if the user is in the
    // content support test.
    if (µBlock.goodblock.tests.contentSupport.isTestUser) {
        return;
    }

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
};

// Call the server to set the time we should next wake up.
// Takes the date Goodblock should wake.
µBlock.goodblock.setNextNotifyTime = function(timeToWakeUp) {

    // Call the server with the time to wake.
    µBlock.goodblock.API.setTimeToWake(timeToWakeUp).then(
        function(data) {
            // console.log('Updated time to wake.');
        },
        function(error) {
            // console.log('Error updating time to wake:', error);
        }
    );

    // Update the local timer.
    µBlock.goodblock.setGoodblockWakeTimeAlarm(timeToWakeUp);
};

/******************************************************************************/

µBlock.goodblock.snoozeGoodblock = function() {
    µBlock.goodblock.updateGoodblockVisibility(false);

    // Get the time to wake up after snoozing.
    var dateToWakeUp = µBlock.goodblock.getTimeToWakeUp('snooze');
    µBlock.goodblock.setNextNotifyTime(dateToWakeUp);
    µBlock.goodblock.log.logEvent('snooze');
    if (µBlock.goodblock.browserState.lastWakeTime) {
      var timeTilSnooze = new Date().getTime() - µBlock.goodblock.browserState.lastWakeTime;
      µBlock.goodblock.log.logMetric('timeUntilSnooze', timeTilSnooze);
    }

    //Log the snooze event
    µBlock.goodblock.API.logSnoozeEvent();
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
    µBlock.goodblock.setNextNotifyTime(dateToWakeUp);
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
      //Log that Tad is showing on the page.
      µBlock.goodblock.API.logHelloTadEvent();
    }
}

/******************************************************************************/

µBlock.goodblock.checkIfShouldWakeUpGoodblock = function(userProfile) {

    // Don't wake up Goodblock on a timer if the user is in the
    // content support test.
    if (µBlock.goodblock.tests.contentSupport.isTestUser) {
        µBlock.goodblock.markIfGoodblockIsAwake(false);
        return;
    }

    // Get the UTC time to wake up in milliseconds.
    var dateToWakeUp = new Date(userProfile['next_notify_time']);
    var now = new Date();
    // It's not time to wake Goodblock.
    if (dateToWakeUp > now) {
        // console.log('Shhhh, Tad is asleep!');
        µBlock.goodblock.markIfGoodblockIsAwake(false);
        µBlock.goodblock.setGoodblockWakeTimeAlarm(dateToWakeUp);

        // Make sure the icon is invisible.
        µBlock.goodblock.updateGoodblockVisibility(false);
    }
    // It is time to wake Goodblock.
    else {
        µBlock.goodblock.markIfGoodblockIsAwake(true);
        µBlock.goodblock.setGoodblockWakeTimeAlarm(now);
    }
};

µBlock.goodblock.syncUserDataFromRemote = function() {

    µBlock.goodblock.API.getUserData().then(
        function(userProfile) {

            // Initialize test groups for this user.
            µBlock.goodblock.addUserToTestGroups(userProfile);

            // Initialize test groups for this user.
            µBlock.goodblock.storeUserProfile(userProfile);

            // See if we should wake up Tad.
            µBlock.goodblock.checkIfShouldWakeUpGoodblock(userProfile);
        },
        function(error) {
            // If the user isn't logged in, default to showing Tad.
            console.log('User is not logged in.');
            µBlock.goodblock.markIfGoodblockIsAwake(true);
            var now = new Date();
            µBlock.goodblock.setGoodblockWakeTimeAlarm(now);
        }
    );
};

// Update our local domain blacklist.
µBlock.goodblock.syncDomainBlacklistFromRemote = function() {

    µBlock.goodblock.API.getDomainBlacklist().then(
        function(blacklist) {
            µBlock.goodblock.tests.contentSupport.domainBlacklist = blacklist;
            // console.log('Current blacklist:', µBlock.goodblock.tests.contentSupport.domainBlacklist);
        },
        function(error) {
            console.log('Error fetching domain blacklist.');
        }
    );
};

// Update our local content support history.
µBlock.goodblock.syncContentSupportHistoryFromRemote = function() {

    µBlock.goodblock.API.getContentSupportHistory().then(
        function(data) {
            µBlock.goodblock.tests.contentSupport.contentSupportHistory = data.results;
            // console.log('Content support history:', µBlock.goodblock.tests.contentSupport.contentSupportHistory);
        },
        function(error) {
            console.log('Error fetching domain blacklist.');
        }
    );
};


/******************************************************************************/

// Make sure this extension version is logged to the DB.
µBlock.goodblock.syncExtensionVersion = function() {
    µBlock.goodblock.API.getLoggedExtensionVersion().then(function(data) {

        // If the current version doesn't match the remote version,
        // update the remote version.
        var version = chrome.app.getDetails().version;
        if (version !== data.version) {
            µBlock.goodblock.API.logExtensionVersion(version);
        }
    });
}

/******************************************************************************/

µBlock.goodblock.postLogin = function() {
    µBlock.goodblock.syncUserDataFromRemote();
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
µBlock.goodblock.API.baseUrl = µBlock.goodblock.config.baseUrl + '/api';
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
};

µBlock.goodblock.API.setTimeToWake = function(datetime) {
    var data = {
        next_notify_time: datetime,
    };
    var url = µBlock.goodblock.API.baseUrl + '/users/update-notify-time/';
    return µBlock.goodblock.API.fetchEndpoint('POST', url, data);
};

µBlock.goodblock.API.logSnoozeEvent = function() {
    var url = µBlock.goodblock.API.baseUrl + '/snooze-click/';
    return µBlock.goodblock.API.fetchEndpoint('POST', url);
};

µBlock.goodblock.API.logHelloTadEvent = function() {
    var url = µBlock.goodblock.API.baseUrl + '/gbicon-appear/';
    return µBlock.goodblock.API.fetchEndpoint('POST', url);
};

µBlock.goodblock.API.getLoggedExtensionVersion = function() {
    var url = µBlock.goodblock.API.baseUrl + '/log-extversion/get-user-extension-version/';
    return µBlock.goodblock.API.fetchEndpoint('GET', url);
};

µBlock.goodblock.API.logExtensionVersion = function(version) {
    var data = {
        version: version,
    };
    var url = µBlock.goodblock.API.baseUrl + '/log-extversion/';
    return µBlock.goodblock.API.fetchEndpoint('POST', url, data);
};

µBlock.goodblock.API.getDomainBlacklist = function() {
    var url = µBlock.goodblock.API.baseUrl + '/black-list/';
    return µBlock.goodblock.API.fetchEndpoint('GET', url);
};

µBlock.goodblock.API.getContentSupportHistory = function() {
    var url = µBlock.goodblock.API.baseUrl + '/content-support/';
    return µBlock.goodblock.API.fetchEndpoint('GET', url);
};

µBlock.goodblock.API.logContentSupportRequest = function() {

    // Update the last time a Goodblock icon appeared.
    µBlock.goodblock.tests.contentSupport.dateOfLastGoodblockIconAppear = new Date();

    // Log that we showed the Goodblock icon.
    µBlock.goodblock.API.logHelloTadEvent();

    var url = µBlock.goodblock.API.baseUrl + '/content-support/';
    return µBlock.goodblock.API.fetchEndpoint('POST', url);
};

µBlock.goodblock.API.logContentNotSupported = function(pageUrl, objUrl) {

    // Update the last time the user responded to a Goodblock icon request.
    µBlock.goodblock.tests.contentSupport.dateOfLastGoodblockIconResponse = new Date();

    var url = objUrl;
    return µBlock.goodblock.API.fetchEndpoint('PATCH', url, {
        responded: true,
        supported: false,
        viewed_ad: false,
        domain: pageUrl,
    });
};

µBlock.goodblock.API.logContentSupportedWithAd = function(pageUrl, objUrl) {

    // Update the last time the user responded to a Goodblock icon request.
    µBlock.goodblock.tests.contentSupport.dateOfLastGoodblockIconResponse = new Date();

    var url = objUrl;
    return µBlock.goodblock.API.fetchEndpoint('PATCH', url, {
        responded: true,
        supported: true,
        viewed_ad: true,
        domain: pageUrl,
    });
};

µBlock.goodblock.API.logContentSupportedWithHearts = function(pageUrl, objUrl) {

    // Update the last time the user responded to a Goodblock icon request.
    µBlock.goodblock.tests.contentSupport.dateOfLastGoodblockIconResponse = new Date();

    var url = objUrl;
    return µBlock.goodblock.API.fetchEndpoint('PATCH', url, {
        responded: true,
        supported: true,
        viewed_ad: false,
        domain: pageUrl,
        vc_donated: 25,
    });
};

/******************************************************************************/

µBlock.goodblock.syncExtensionVersion();

var syncData = function() {
     // console.log('Polling server.');
    µBlock.goodblock.syncUserDataFromRemote();
    µBlock.goodblock.syncDomainBlacklistFromRemote();
    µBlock.goodblock.syncContentSupportHistoryFromRemote();   
};
syncData();

// Check every once in a while to get the latest time to wake.
// The time may have changed via interaction on another device, or
// it may have changed server-side.
var poller = setInterval(syncData, µBlock.goodblock.config.timeMsToPollServer);

/******************************************************************************/

module.exports = µBlock.goodblock;
