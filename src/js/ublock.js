/*******************************************************************************

    µBlock - a browser extension to block requests.
    Copyright (C) 2014 Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/chrisaljoudi/uBlock
*/

/* global vAPI, µBlock */

/******************************************************************************/

(function(){

'use strict';

/******************************************************************************/

var wakeUpGoodblock = function(µb) {
    console.log('should we wake up tad??')
    var snoozeTil = µb.localSettings.snoozeTil;
    var sleepTil = µb.localSettings.sleepTil;
    console.log('shhh, snoozing...', snoozeTil)
    console.log('shhh, sleeping...', sleepTil)
    
    var d = new Date();

    if ( snoozeTil > d.getTime() ) {
        µBlock.goodblock.updateGoodblockVisibility(false);
        // keep snoozing
        var alarm = chrome.alarms.create(
            'snoozeGoodblock',
            {when: snoozeTil}
        );
        chrome.alarms.onAlarm.addListener(function(alarm) {
            µBlock.goodblock.updateGoodblockVisibility(true);
        });
    } else if ( sleepTil > d.getTime() ) {
        µBlock.goodblock.updateGoodblockVisibility(false);
        // keep sleeping
        var alarm = chrome.alarms.create(
            'sleepGoodblock',
            {when: sleepTil}
        );
        chrome.alarms.onAlarm.addListener(function(alarm) {
            µBlock.goodblock.updateGoodblockVisibility(true);
        });
    } else {
        // wake up
        µb.localSettings.snoozeTil = 0;
        µb.localSettings.sleepTil = 0;
    }
}

// Check if we should hide Tad
// (aka, it is currently snoozing or sleeping)
var µb = µBlock;
wakeUpGoodblock(µb);

/******************************************************************************/

// https://github.com/chrisaljoudi/uBlock/issues/405
// Be more flexible with whitelist syntax

// Any special regexp char will be escaped
var whitelistDirectiveEscape = /[-\/\\^$+?.()|[\]{}]/g;

// All `*` will be expanded into `.*`
var whitelistDirectiveEscapeAsterisk = /\*/g;

// Probably manually entered whitelist directive
var isHandcraftedWhitelistDirective = function(directive) {
    return directive.indexOf('/') !== -1 &&
           directive.indexOf('*') !== -1;
};

var matchWhitelistDirective = function(url, hostname, directive) {
    // Directive is a plain hostname
    if ( directive.indexOf('/') === -1 ) {
        return hostname.slice(-directive.length) === directive;
    }
    // Match URL exactly
    if ( directive.indexOf('*') === -1 ) {
        return url === directive;
    }
    // Regex escape code inspired from:
    //   "Is there a RegExp.escape function in Javascript?"
    //   http://stackoverflow.com/a/3561711
    var reStr = directive.replace(whitelistDirectiveEscape, '\\$&')
                         .replace(whitelistDirectiveEscapeAsterisk, '.*');
    var re = new RegExp(reStr);
    return re.test(url);
};

/******************************************************************************/

µBlock.getNetFilteringSwitch = function(url) {
    var netWhitelist = this.netWhitelist;
    var buckets, i, pos;
    var targetHostname = this.URI.hostnameFromURI(url);
    var key = targetHostname;
    for (;;) {
        if ( netWhitelist.hasOwnProperty(key) ) {
            buckets = netWhitelist[key];
            i = buckets.length;
            while ( i-- ) {
                if ( matchWhitelistDirective(url, targetHostname, buckets[i]) ) {
                    // console.log('"%s" matche url "%s"', buckets[i], url);
                    return false;
                }
            }
        }
        pos = key.indexOf('.');
        if ( pos === -1 ) {
            break;
        }
        key = key.slice(pos + 1);
    }
    return true;
};

/******************************************************************************/

µBlock.toggleNetFilteringSwitch = function(url, scope, newState) {
    var currentState = this.getNetFilteringSwitch(url);
    if ( newState === undefined ) {
        newState = !currentState;
    }
    if ( newState === currentState ) {
        return currentState;
    }

    var netWhitelist = this.netWhitelist;
    var pos = url.indexOf('#');
    var targetURL = pos !== -1 ? url.slice(0, pos) : url;
    var targetHostname = this.URI.hostnameFromURI(targetURL);
    var key = targetHostname;
    var directive = scope === 'page' ? targetURL : targetHostname;

    // Add to directive list
    if ( newState === false ) {
        if ( netWhitelist.hasOwnProperty(key) === false ) {
            netWhitelist[key] = [];
        }
        netWhitelist[key].push(directive);
        this.saveWhitelist();
        return true;
    }

    // Remove from directive list whatever causes current URL to be whitelisted
    var buckets, i;
    for (;;) {
        if ( netWhitelist.hasOwnProperty(key) ) {
            buckets = netWhitelist[key];
            i = buckets.length;
            while ( i-- ) {
                directive = buckets[i];
                if ( !matchWhitelistDirective(targetURL, targetHostname, directive) ) {
                    continue;
                }
                buckets.splice(i, 1);
                // If it is a directive which can't be created easily through
                // the user interface, keep it around as a commented out
                // directive
                if ( isHandcraftedWhitelistDirective(directive) ) {
                    netWhitelist['#'].push('# ' + directive);
                }
            }
            if ( buckets.length === 0 ) {
                delete netWhitelist[key];
            }
        }
        pos = key.indexOf('.');
        if ( pos === -1 ) {
            break;
        }
        key = key.slice(pos + 1);
    }
    this.saveWhitelist();
    return true;
};

/******************************************************************************/

µBlock.stringFromWhitelist = function(whitelist) {
    var r = {};
    var i, bucket;
    for ( var key in whitelist ) {
        if ( whitelist.hasOwnProperty(key) === false ) {
            continue;
        }
        bucket = whitelist[key];
        i = bucket.length;
        while ( i-- ) {
            r[bucket[i]] = true;
        }
    }
    return Object.keys(r).sort(function(a,b){return a.localeCompare(b);}).join('\n');
};

/******************************************************************************/

µBlock.whitelistFromString = function(s) {
    var whitelist = {
        '#': []
    };
    var reInvalidHostname = /[^a-z0-9.\-\[\]:]/;
    var reHostnameExtractor = /([a-z0-9\[][a-z0-9.\-:]*[a-z0-9\]])\/(?:[^\x00-\x20\/]|$)[^\x00-\x20]*$/;
    var lines = s.split(/[\n\r]+/);
    var line, matches, key, directive;
    for ( var i = 0; i < lines.length; i++ ) {
        line = lines[i].trim();
        // https://github.com/gorhill/uBlock/issues/171
        // Skip empty lines
        if ( line === '' ) {
            continue;
        }

        // Don't throw out commented out lines: user might want to fix them
        if ( line.charAt(0) === '#' ) {
            key = '#';
            directive = line;
        }
        // Plain hostname
        else if ( line.indexOf('/') === -1 ) {
            if ( reInvalidHostname.test(line) ) {
                key = '#';
                directive = '# ' + line;
            } else {
                key = directive = line;
            }
        }
        // URL, possibly wildcarded: there MUST be at least one hostname
        // label (or else it would be just impossible to make an efficient
        // dict.
        else {
            matches = reHostnameExtractor.exec(line);
            if ( !matches || matches.length !== 2 ) {
                key = '#';
                directive = '# ' + line;
            } else {
                key = matches[1];
                directive = line;
            }
        }

        // https://github.com/gorhill/uBlock/issues/171
        // Skip empty keys
        if ( key === '' ) {
            continue;
        }

        // Be sure this stays fixed:
        // https://github.com/chrisaljoudi/uBlock/issues/185
        if ( whitelist.hasOwnProperty(key) === false ) {
            whitelist[key] = [];
        }
        whitelist[key].push(directive);
    }
    return whitelist;
};

/******************************************************************************/

// Return all settings if none specified.

µBlock.changeUserSettings = function(name, value) {
    if ( name === undefined ) {
        return this.userSettings;
    }

    if ( typeof name !== 'string' || name === '' ) {
        return;
    }

    // Do not allow an unknown user setting to be created
    if ( this.userSettings[name] === undefined ) {
        return;
    }

    if ( value === undefined ) {
        return this.userSettings[name];
    }

    // Pre-change
    switch ( name ) {
        default:
            break;
    }

    // Change
    this.userSettings[name] = value;

    // Post-change
    switch ( name ) {
        case 'collapseBlocked':
            if ( value === false ) {
                this.cosmeticFilteringEngine.removeFromSelectorCache('*', 'net');
            }
            break;
        case 'contextMenuEnabled':
            this.contextMenu.toggle(value);
            break;
        case 'experimentalEnabled':
            if ( typeof this.mirrors === 'object' ) {
                // https://github.com/chrisaljoudi/uBlock/issues/540
                // Disabling local mirroring for the time being
                this.mirrors.toggle(false /* value */);
            }
            break;
        default:
            break;
    }

    this.saveUserSettings();
};

/******************************************************************************/

µBlock.elementPickerExec = function(tabId, target) {
    this.epickerTarget = target;
    vAPI.tabs.injectScript(tabId, { file: 'js/element-picker.js' });
};

/******************************************************************************/

µBlock.toggleFirewallRule = function(details) {
    if ( details.action !== 0 ) {
        this.sessionFirewall.setCellZ(details.srcHostname, details.desHostname, details.requestType, details.action);
    } else {
        this.sessionFirewall.unsetCell(details.srcHostname, details.desHostname, details.requestType);
    }

    // https://github.com/chrisaljoudi/uBlock/issues/731#issuecomment-73937469
    if ( details.persist ) {
        if ( details.action !== 0 ) {
            this.permanentFirewall.setCellZ(details.srcHostname, details.desHostname, details.requestType, details.action);
        } else {
            this.permanentFirewall.unsetCell(details.srcHostname, details.desHostname, details.requestType, details.action);
        }
        this.savePermanentFirewallRules();
    }

    // https://github.com/chrisaljoudi/uBlock/issues/420
    this.cosmeticFilteringEngine.removeFromSelectorCache(details.srcHostname, 'net');
};

/******************************************************************************/

µBlock.isBlockResult = function(result) {
    return typeof result === 'string' && result.charAt(1) === 'b';
};

/******************************************************************************/

µBlock.isAllowResult = function(result) {
    return typeof result !== 'string' || result.charAt(1) !== 'b';
};

/******************************************************************************/

µBlock.logCosmeticFilters = (function() {
    var tabIdToTimerMap = {};

    var injectNow = function(tabId) {
        delete tabIdToTimerMap[tabId];
        vAPI.tabs.injectScript(tabId, { file: 'js/cosmetic-logger.js' });
    };

    var injectAsync = function(tabId) {
        if ( tabIdToTimerMap.hasOwnProperty(tabId) ) {
            return;
        }
        tabIdToTimerMap[tabId] = setTimeout(
            injectNow.bind(null, tabId),
            100
        );
    };

    return injectAsync;
})();

/******************************************************************************/

// Goodblock.
µBlock.goodblock = {};

/******************************************************************************/

/******************************************************************************/

// Goodblock.
µBlock.goodblock.logEvent = function(event) {
  var xhr = new XMLHttpRequest();
  xhr.open('POST', 'http://inlet.goodblock.org/write?db=impressions', true);
  xhr.onload = function () {
      // do something to response
      console.log(this.responseText);
  };
  xhr.setRequestHeader("Authorization", "Basic " + btoa('logger:DwV5WWXXQgNVg6hgKXFj')); 
  var data = 'impr,userId=' + µBlock.userSettings.userId + ',event=' + event + ' value=y';
  xhr.send(data);
  console.log(data);
};

/******************************************************************************/

// To store info about tab activity that's relevant to showing
// the Goodlbock icon.
µBlock.goodblock.tabData = {
    activeTabId: null,
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
    var oldActiveTabId = µBlock.goodblock.tabData['activeTabId'];

    // Set the new active tab.
    µBlock.goodblock.tabData['activeTabId'] = activeTabId;

    // // Update Goodblock visibility on old and new tabs.
    // µBlock.goodblock.updateGoodblockVisibilityByTabId(oldActiveTabId, false);
    // µBlock.goodblock.updateGoodblockVisibilityByTabId(activeTabId, true);
}

/******************************************************************************/

µBlock.goodblock.updateVisibility = function() {
    wakeUpGoodblock(µb);
}

/******************************************************************************/

µBlock.goodblock.snoozeGoodblock = function() {
    µBlock.goodblock.updateGoodblockVisibility(false);

    µb.localSettings.sleepTil = 0;
    var d = new Date();
    var snoozeTime = 5820000;
    µb.localSettings.snoozeTil = d.getTime() + snoozeTime;

    console.log('snoozeTil', µb.localSettings.snoozeTil)
    var alarm = chrome.alarms.create(
        'snoozeGoodblock',
        {when: µb.localSettings.snoozeTil}
    );
    chrome.alarms.onAlarm.addListener(function(alarm) {
        µBlock.goodblock.updateGoodblockVisibility(true);
    });
}

/******************************************************************************/

µBlock.goodblock.goodnightGoodblock = function() {
    µBlock.goodblock.sendGoodblockToBed();

    µb.localSettings.snoozeTil = 0;
    
    var isLastDayofYear = function(d,m) {
        return (d == 31 && m == 11)
    }
    var isLastDayofMonth = function(d,m) {
        var shortMonths = [3, 5, 8, 10];
        if (m == 1) {
            return (d == 28);
        } else if (shortMonths.indexOf(m) != -1) {
            return (d == 30);
        } else {
            return (d == 31);
        }
    }
    
    var now = new Date();
    var h = now.getHours();
    var d = now.getDate();
    var m = now.getMonth();
    var y = now.getFullYear();

    var yT;
    var mT;
    var dT;
    if (isLastDayofYear(d,m)) {
        yT = int(y) + 1;
        mT = 1;
        dT = 1;
    } else {
        dT = isLastDayofMonth(d, m) ? 1 : d+1;
        mT = isLastDayofMonth(d, m) ? m+1 : m;
        yT = y;
    }

    var eightAmTomorrow = new Date(yT, mT, dT, 8);
    var sleepTime = eightAmTomorrow.getTime() - now.getTime();
    console.log('asleep until', eightAmTomorrow)
    µb.localSettings.sleepTil = eightAmTomorrow.getTime();
    
    var alarm = chrome.alarms.create(
        'sleepGoodblock',
        {when: eightAmTomorrow.getTime()}
    );
    chrome.alarms.onAlarm.addListener(function(alarm) {
        µBlock.goodblock.updateGoodblockVisibility(true);
    });

    µBlock.goodblock.logEvent('goodnight');
}

/******************************************************************************/

µBlock.goodblock.sendGoodblockToBed = function() {
    vAPI.messaging.broadcast({
        what: 'goToBed',
        data: {},
    });
}

/******************************************************************************/

µBlock.goodblock.updateGoodblockVisibility = function(isVisible) {
    vAPI.messaging.broadcast({
        what: 'goodblockVisibility',
        data: {
            isVisible: isVisible,
        },
    });
}

/******************************************************************************/

})();
