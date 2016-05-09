/*******************************************************************************


    uBlock Origin - a browser extension to block requests.
    Copyright (C) 2014-2016 The uBlock Origin authors

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

// For background page

/******************************************************************************/

(function() {

'use strict';

/******************************************************************************/

var vAPI = self.vAPI = self.vAPI || {};

var chrome = self.chrome;
var manifest = chrome.runtime.getManifest();

vAPI.chrome = true;

var noopFunc = function(){};

/******************************************************************************/

vAPI.app = {
    name: manifest.name,
    version: manifest.version
};

/******************************************************************************/

if ( !chrome.runtime ) {
    // Chrome 20-21
    chrome.runtime = chrome.extension;
} else if ( !chrome.runtime.onMessage ) {
    // Chrome 22-25
    chrome.runtime.onMessage = chrome.extension.onMessage;
    chrome.runtime.sendMessage = chrome.extension.sendMessage;
    chrome.runtime.onConnect = chrome.extension.onConnect;
    chrome.runtime.connect = chrome.extension.connect;
}

/******************************************************************************/

// Goodblock.
if ( chrome.runtime.setUninstallURL ) {
    // On uninstall, send the users to our webpage for analytics logging
    // and feedback.
    var url = 'https://goodblock.gladly.io/app/goodbye/';
    chrome.runtime.setUninstallURL(url);
}

/******************************************************************************/

vAPI.gladlyHostnames = [
    'gladlyads.xyz',
    'goodblock.org',
    'gladly.io',
    'tab.gladly.io',
    'goodblock.gladly.io',
    // Local hosts
    'gladly.dev',
    'goodblock.gladly.dev',
];

// Goodblock
vAPI.handlePageLoad = function(tabId, changeInfo, tab) {

    if (changeInfo.status == 'complete') {

        if (!tab.url) {
            return;
        }

        // If this page is a Gladly page, don't inject the content script.
        var tabHostname = µBlock.URI.hostnameFromURI(tab.url);
        if (vAPI.gladlyHostnames.indexOf(tabHostname) > 0) {
            return;
        }

        // Check if we should inject the content script.
        var shouldInjectContentScript = (
            localStorage['enableGbContentScript'] === 'true' ? true : false
        );
        if (!shouldInjectContentScript) {
            // console.log('Should not inject Goodblock content script.');
            return;
        }
        
        // Inject Goodblock script. 
        vAPI.injectGoodblockContentScripts(tabId, function() {
            // console.log('Injected Goodblock content script.');
        });
    }
};

/******************************************************************************/

vAPI.app.restart = function() {
    chrome.runtime.reload();
};

/******************************************************************************/

// chrome.storage.local.get(null, function(bin){ console.debug('%o', bin); });

vAPI.storage = chrome.storage.local;
vAPI.storage.preferences = vAPI.storage;

/******************************************************************************/
// beginblock uBlock Origin Code
/******************************************************************************/

// https://github.com/gorhill/uMatrix/issues/234
// https://developer.chrome.com/extensions/privacy#property-network

// 2015-08-12: Wrapped Chrome API in try-catch statements. I had a fluke
// event in which it appeared Chrome 46 decided to restart uBlock (for
// unknown reasons) and again for unknown reasons the browser acted as if
// uBlock did not declare the `privacy` permission in its manifest, putting
// uBlock in a bad, non-functional state -- because call to `chrome.privacy`
// API threw an exception.

vAPI.browserSettings = {
    webRTCSupported: undefined,

    // https://github.com/gorhill/uBlock/issues/533
    // We must first check wether this Chromium-based browser was compiled
    // with WebRTC support. To do this, we use an iframe, this way the
    // empty RTCPeerConnection object we create to test for support will
    // be properly garbage collected. This prevents issues such as
    // a computer unable to enter into sleep mode, as reported in the
    // Chrome store:
    // https://github.com/gorhill/uBlock/issues/533#issuecomment-167931681
    setWebrtcIPAddress: function(setting) {
        // We don't know yet whether this browser supports WebRTC: find out.
        if ( this.webRTCSupported === undefined ) {
            this.webRTCSupported = { setting: setting };
            var iframe = document.createElement('iframe');
            var me = this;
            var messageHandler = function(ev) {
                if ( ev.origin !== self.location.origin ) {
                    return;
                }
                window.removeEventListener('message', messageHandler);
                var setting = me.webRTCSupported.setting;
                me.webRTCSupported = ev.data === 'webRTCSupported';
                me.setWebrtcIPAddress(setting);
                iframe.parentNode.removeChild(iframe);
                iframe = null;
            };
            window.addEventListener('message', messageHandler);
            iframe.src = 'is-webrtc-supported.html';
            document.body.appendChild(iframe);
            return;
        }

        // We are waiting for a response from our iframe. This makes the code
        // safe to re-entrancy.
        if ( typeof this.webRTCSupported === 'object' ) {
            this.webRTCSupported.setting = setting;
            return;
        }

        // https://github.com/gorhill/uBlock/issues/533
        // WebRTC not supported: `webRTCMultipleRoutesEnabled` can NOT be
        // safely accessed. Accessing the property will cause full browser
        // crash.
        if ( this.webRTCSupported !== true ) {
            return;
        }

        // Older version of Chromium do not support this setting.
        if ( typeof chrome.privacy.network.webRTCMultipleRoutesEnabled !== 'object' ) {
            return;
        }

        try {
            chrome.privacy.network.webRTCMultipleRoutesEnabled.set({
                value: !!setting,
                scope: 'regular'
            }, function() {
                void chrome.runtime.lastError;
            });
        } catch(ex) {
            console.error(ex);
        }
    },

    set: function(details) {
        // https://github.com/gorhill/uBlock/issues/875
        // Must not leave `lastError` unchecked.
        var callback = function() {
            void chrome.runtime.lastError;
        };

        for ( var setting in details ) {
            if ( details.hasOwnProperty(setting) === false ) {
                continue;
            }
            switch ( setting ) {
            case 'prefetching':
                try {
                    chrome.privacy.network.networkPredictionEnabled.set({
                        value: !!details[setting],
                        scope: 'regular'
                    }, callback);
                } catch(ex) {
                    console.error(ex);
                }
                break;

            case 'hyperlinkAuditing':
                try {
                    chrome.privacy.websites.hyperlinkAuditingEnabled.set({
                        value: !!details[setting],
                        scope: 'regular'
                    }, callback);
                } catch(ex) {
                    console.error(ex);
                }
                break;

            case 'webrtcIPAddress':
                this.setWebrtcIPAddress(details[setting]);
                break;

            default:
                break;
            }
        }
    }
};

/******************************************************************************/
// endblock uBlock Origin Code
/******************************************************************************/

vAPI.tabs = {};

/******************************************************************************/

vAPI.isBehindTheSceneTabId = function(tabId) {
    return tabId.toString() === '-1';
};

vAPI.noTabId = '-1';

/******************************************************************************/

var toChromiumTabId = function(tabId) {
    if ( typeof tabId === 'string' ) {
        tabId = parseInt(tabId, 10);
    }
    if ( typeof tabId !== 'number' || isNaN(tabId) || tabId === -1 ) {
        return 0;
    }
    return tabId;
};

/******************************************************************************/

vAPI.tabs.registerListeners = function() {
    var onNavigationClient = this.onNavigation || noopFunc;
    var onPopupClient = this.onPopup || noopFunc;
    var onUpdatedClient = this.onUpdated || noopFunc;
    var onClosedClient = this.onClosed || noopFunc;

    // https://developer.chrome.com/extensions/webNavigation
    // [onCreatedNavigationTarget ->]
    //  onBeforeNavigate ->
    //  onCommitted ->
    //  onDOMContentLoaded ->
    //  onCompleted

/******************************************************************************/
// beginBlock uBlock-Goodblock Code
/******************************************************************************/
    var popupCandidates = Object.create(null);

    var PopupCandidate = function(details) {
        this.targetTabId = details.tabId.toString();
        this.openerTabId = details.sourceTabId.toString();
        this.targetURL = details.url;
        this.selfDestructionTimer = null;
    };

    PopupCandidate.prototype.selfDestruct = function() {
        if ( this.selfDestructionTimer !== null ) {
            clearTimeout(this.selfDestructionTimer);
        }
        delete popupCandidates[this.targetTabId];
    };

    PopupCandidate.prototype.launchSelfDestruction = function() {
        if ( this.selfDestructionTimer !== null ) {
            clearTimeout(this.selfDestructionTimer);
        }
        this.selfDestructionTimer = setTimeout(this.selfDestruct.bind(this), 10000);
    };

    var popupCandidateCreate = function(details) {
        var popup = popupCandidates[details.tabId];
        // This really should not happen...
        if ( popup !== undefined ) {
            return;
        }
        return popupCandidates[details.tabId] = new PopupCandidate(details);
    };

    var popupCandidateTest = function(details) {
        var popup = popupCandidates[details.tabId];
        if ( popup === undefined ) {
            return;
        }
        popup.targetURL = details.url;
        if ( onPopupClient(popup) !== true ) {
            return;
        }
        popup.selfDestruct();
        return true;
    };

    var popupCandidateDestroy = function(details) {
        var popup = popupCandidates[details.tabId];
        if ( popup instanceof PopupCandidate ) {
            popup.launchSelfDestruction();
        }
    };

/******************************************************************************/
// endBlock uBlock-Goodblock Code
/******************************************************************************/

    // The chrome.webRequest.onBeforeRequest() won't be called for everything
    // else than `http`/`https`. Thus, in such case, we will bind the tab as
    // early as possible in order to increase the likelihood of a context
    // properly setup if network requests are fired from within the tab.
    // Example: Chromium + case #6 at
    //          http://raymondhill.net/ublock/popup.html
    var reGoodForWebRequestAPI = /^https?:\/\//;

    // Goodblock.
    // If the tab has the URL of our Gladly ad webapge,
    // mark this tab as the Gladly ad tab.
    var checkIfNewTabIsGladlyAd = function(tab) {
        if (!tab.url) {
            return;
        }
        if (µBlock.goodblock.gladlyAdUrls.indexOf(tab.url) > -1) {
            µBlock.goodblock.saveGladlyAdTabId(tab.id.toString());
        }
    }

    // Goodblock.
    // Check if the closed tab is the Gladly ad tab.
    // If so, perform actions related to ad closing.
    var checkIfClosedTabIsGladlyAd = function(tabId) {
        if (µBlock.goodblock.getGladlyAdTabId() === tabId.toString()) {
            µBlock.goodblock.closeAd();

            // Reset the Gladly ad tab ID.
            µBlock.goodblock.saveGladlyAdTabId(null);
        }
    }

    var onCreatedNavigationTarget = function(details) {
        //console.debug('onCreatedNavigationTarget: popup candidate tab id %d = "%s"', details.tabId, details.url);
        if ( reGoodForWebRequestAPI.test(details.url) === false ) {
            details.frameId = 0;
            onNavigationClient(details);
        }
        popupCandidateCreate(details);
        popupCandidateTest(details);
    };

    var onBeforeNavigate = function(details) {
        if ( details.frameId !== 0 ) {
            return;
        }
        //console.debug('onBeforeNavigate: popup candidate tab id %d = "%s"', details.tabId, details.url);
        popupCandidateTest(details);
    };

    // Goodblock.
    var onCreated = function(tab) {
    };

    // Goodblock
    var onActivated = function(activeInfo) {
        var tabId = activeInfo.tabId;
        µBlock.goodblock.updateActiveTab(tabId);
    }

    var onUpdated = function(tabId, changeInfo, tab) {
        if ( changeInfo.url && popupCandidateTest({ tabId: tabId, url: changeInfo.url }) ) {
            return;
        }
        onUpdatedClient(tabId, changeInfo, tab);

        // Goodblock.
        checkIfNewTabIsGladlyAd(tab);
    };

    var onCommitted = function(details) {
        if ( details.frameId !== 0 ) {
            return;
        }
        onNavigationClient(details);
        delete iconStateForTabId[details.tabId];
        //console.debug('onCommitted: popup candidate tab id %d = "%s"', details.tabId, details.url);
        if ( popupCandidateTest(details) === true ) {
            return;
        }
        popupCandidateDestroy(details);
    };

    var onClosed = function(tabId) {
        delete iconStateForTabId[tabId];
        onClosedClient(tabId);

        // Goodblock.
        checkIfClosedTabIsGladlyAd(tabId);
    };

    var onActivated = function(details) {
        vAPI.contextMenu.onMustUpdate(details.tabId);
    };

    var onUpdated = function(tabId, changeInfo, tab) {
        onUpdatedClient(tabId, changeInfo, tab);
    };

    chrome.webNavigation.onBeforeNavigate.addListener(onBeforeNavigate);
    chrome.webNavigation.onCommitted.addListener(onCommitted);
    chrome.webNavigation.onCreatedNavigationTarget.addListener(onCreatedNavigationTarget);
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onClosed);
    // Goodblock.
    chrome.tabs.onCreated.addListener(onCreated);
    chrome.tabs.onUpdated.addListener(vAPI.handlePageLoad);
    // Goodblock.
    chrome.tabs.onActivated.addListener(onActivated);
};

/******************************************************************************/

vAPI.tabs.get = function(tabId, callback) {
    var onTabReady = function(tab) {
        // https://code.google.com/p/chromium/issues/detail?id=410868#c8
        if ( chrome.runtime.lastError ) {
            /* noop */
        }
        // Caller must be prepared to deal with nil tab value
        callback(tab);
    };

    if ( tabId !== null ) {
        tabId = toChromiumTabId(tabId);
        if ( tabId === 0 ) {
            onTabReady(null);
        } else {
            chrome.tabs.get(tabId, onTabReady);
        }
        return;
    }

    var onTabReceived = function(tabs) {
        // https://code.google.com/p/chromium/issues/detail?id=410868#c8
        void chrome.runtime.lastError;
        callback(tabs[0]);
    };
    chrome.tabs.query({ active: true, currentWindow: true }, onTabReceived);
};

/******************************************************************************/

// properties of the details object:
//   url: 'URL', // the address that will be opened
//   tabId: 1, // the tab is used if set, instead of creating a new one
//   index: -1, // undefined: end of the list, -1: following tab, or after index
//   active: false, // opens the tab in background - true and undefined: foreground
//   select: true, // if a tab is already opened with that url, then select it instead of opening a new one
//   popup: true // open in a new window

vAPI.tabs.open = function(details) {
    var targetURL = details.url;
    if ( typeof targetURL !== 'string' || targetURL === '' ) {
        return null;
    }

    // extension pages
    if ( /^[\w-]{2,}:/.test(targetURL) !== true ) {
        targetURL = vAPI.getURL(targetURL);
    }

    // dealing with Chrome's asynchronous API
    var wrapper = function() {
        if ( details.active === undefined ) {
            details.active = true;
        }

        var subWrapper = function() {
            var _details = {
                url: targetURL,
                active: !!details.active
            };

            // Opening a tab from incognito window won't focus the window
            // in which the tab was opened
            var focusWindow = function(tab) {
                if ( tab.active ) {
                    chrome.windows.update(tab.windowId, { focused: true });
                }
            };

            if ( !details.tabId ) {
                if ( details.index !== undefined ) {
                    _details.index = details.index;
                }

                chrome.tabs.create(_details, focusWindow);
                return;
            }

            // update doesn't accept index, must use move
            chrome.tabs.update(toChromiumTabId(details.tabId), _details, function(tab) {
                // if the tab doesn't exist
                if ( vAPI.lastError() ) {
                    chrome.tabs.create(_details, focusWindow);
                } else if ( details.index !== undefined ) {
                    chrome.tabs.move(tab.id, {index: details.index});
                }
            });
        };

        // Open in a standalone window
        if ( details.popup === true ) {
            chrome.windows.create({
                url: details.url,
                focused: details.active,
                type: 'popup'
            });
            return;
        }

        if ( details.index !== -1 ) {
            subWrapper();
            return;
        }

        vAPI.tabs.get(null, function(tab) {
            if ( tab ) {
                details.index = tab.index + 1;
            } else {
                delete details.index;
            }

            subWrapper();
        });
    };

    if ( !details.select ) {
        wrapper();
        return;
    }

    // https://developer.chrome.com/extensions/tabs#method-query
    // "Note that fragment identifiers are not matched."
    // It's a lie, fragment identifiers ARE matched. So we need to remove the
    // fragment.
    var pos = targetURL.indexOf('#');
    var targetURLWithoutHash = pos === -1 ? targetURL : targetURL.slice(0, pos);

    chrome.tabs.query({ url: targetURLWithoutHash }, function(tabs) {
        var tab = tabs[0];
        if ( !tab ) {
            wrapper();
            return;
        }

        var _details = {
            active: true,
            url: undefined
        };
        if ( targetURL !== tab.url ) {
            _details.url = targetURL;
        }
        chrome.tabs.update(tab.id, _details, function(tab) {
            chrome.windows.update(tab.windowId, { focused: true });
        });
    });
};

/******************************************************************************/

// Replace the URL of a tab. Noop if the tab does not exist.

vAPI.tabs.replace = function(tabId, url) {
    tabId = toChromiumTabId(tabId);
    if ( tabId === 0 ) {
        return;
    }

    var targetURL = url;

    // extension pages
    if ( /^[\w-]{2,}:/.test(targetURL) !== true ) {
        targetURL = vAPI.getURL(targetURL);
    }

    chrome.tabs.update(tabId, { url: targetURL }, function() {
        // https://code.google.com/p/chromium/issues/detail?id=410868#c8
        if ( chrome.runtime.lastError ) {
            /* noop */
        }
    });
};

/******************************************************************************/

vAPI.tabs.remove = function(tabId) {
    tabId = toChromiumTabId(tabId);
    if ( tabId === 0 ) {
        return;
    }

    var onTabRemoved = function() {
        // https://code.google.com/p/chromium/issues/detail?id=410868#c8
        if ( chrome.runtime.lastError ) {
            /* noop */
        }
    };

    chrome.tabs.remove(tabId, onTabRemoved);
};

/******************************************************************************/

vAPI.tabs.reload = function(tabId /*, flags*/) {
    tabId = toChromiumTabId(tabId);
    if ( tabId === 0 ) {
        return;
    }

    var onReloaded = function() {
        // https://code.google.com/p/chromium/issues/detail?id=410868#c8
        if ( chrome.runtime.lastError ) {
            /* noop */
        }
    };

    chrome.tabs.reload(tabId, onReloaded);
};

/******************************************************************************/

// Select a specific tab.

vAPI.tabs.select = function(tabId) {
    tabId = toChromiumTabId(tabId);
    if ( tabId === 0 ) {
        return;
    }

    chrome.tabs.update(tabId, { active: true }, function(tab) {
        if ( chrome.runtime.lastError ) {
            /* noop */
        }
        if ( !tab ) {
            return;
        }
        chrome.windows.update(tab.windowId, { focused: true });
    });
};

/******************************************************************************/

vAPI.tabs.injectScript = function(tabId, details, callback) {
    var onScriptExecuted = function() {
        // https://code.google.com/p/chromium/issues/detail?id=410868#c8
        if ( chrome.runtime.lastError ) {
            /* noop */
        }
        if ( typeof callback === 'function' ) {
            callback();
        }
    };
    if ( tabId ) {
        chrome.tabs.executeScript(toChromiumTabId(tabId), details, onScriptExecuted);
    } else {
        chrome.tabs.executeScript(details, onScriptExecuted);
    }
};

/******************************************************************************/
/******************************************************************************/

var IconState = function(badge, img) {
    this.badge = badge;
        // ^ a number -- the badge 'value'
    this.img = img;
        // ^ a string -- 'on' or 'off'
    this.dirty = (1 << 1) | (1 << 0);
        /* ^ bitmask AB: two bits, A and B
                where A is whether img has changed and needs render
                and B is whether badge has changed and needs render */
};
var iconStateForTabId = {}; // {tabId: IconState}

var ICON_PATHS = {
    "on": { '19': 'img/browsericons/icon19.png',     '38': 'img/browsericons/icon38.png' },
    "off": { '19': 'img/browsericons/icon19.png', '38': 'img/browsericons/icon38.png' },
    // Goodblock
    "goodblock": {
        'goodblockIcon20': 'img/browsericons/icon20.png',
        'goodblockIcon60': 'img/browsericons/icon60.png',
        'heartIcon': 'img/browsericons/heart40x35.png',
        'waterIcon': 'img/browsericons/water33x40.png',
        'closeIcon': 'img/browsericons/close13x13.png'
    }
};

var SCRIPT_PATHS = {
    // Goodblock
    "goodblock": {
        'contentscript': 'js/contentscript-goodblock.js',
        'eventEmitter': 'lib/EventEmitter.min.js',
    }
};

// Must read: https://code.google.com/p/chromium/issues/detail?id=410868#c8

// https://github.com/chrisaljoudi/uBlock/issues/19
// https://github.com/chrisaljoudi/uBlock/issues/207
// Since we may be called asynchronously, the tab id may not exist
// anymore, so this ensures it does still exist.

vAPI.setIcon = function(tabId, iconStatus, badge) {
    tabId = toChromiumTabId(tabId);
    if ( tabId === 0 ) {
        return;
    }

    var onIconReady = function() {
        if ( vAPI.lastError() ) {
            return;
        }
        chrome.browserAction.setBadgeText({ tabId: tabId, text: badge });
        chrome.browserAction.setBadgeBackgroundColor({
            tabId: tabId,
            color: '#666'
        });
    };
    var state = iconStateForTabId[tabId];
    if(typeof state === "undefined") {
        state = iconStateForTabId[tabId] = new IconState(badge, iconStatus);
    }
    else {
        state.dirty = ((state.badge !== badge) << 1) | ((state.img !== iconStatus) << 0);
        state.badge = badge;
        state.img = iconStatus;
    }
    if(state.dirty & 1) { // got a new icon?
        chrome.browserAction.setIcon({ tabId: tabId, path: ICON_PATHS[iconStatus] }, onIconReady);
    }
    else if(state.dirty & 2) {
        chrome.browserAction.setBadgeText({ tabId: tabId, text: badge });
    }
};

/******************************************************************************/

// Goodblock.
vAPI.getGoodblockImgUrls = function() {
    return {
        'goodblockIcon60': chrome.extension.getURL(ICON_PATHS['goodblock']['goodblockIcon60']),
        'heartIcon': chrome.extension.getURL(ICON_PATHS['goodblock']['heartIcon']),
        'waterIcon': chrome.extension.getURL(ICON_PATHS['goodblock']['waterIcon']),
        'closeIcon': chrome.extension.getURL(ICON_PATHS['goodblock']['closeIcon']),
    };
}

/******************************************************************************/

// Goodblock.
// Inject Goodblock content scripts into the tab with ID tabId.
// After the scripts are injected, call the function callback.
vAPI.injectGoodblockContentScripts = function(tabId, callback) {
    var scripts = SCRIPT_PATHS['goodblock'];

    // Execute Goodblock code and call the callback.
    function injectGoodblockScript() {
        chrome.tabs.executeScript(
            tabId,
            {
                file: scripts['contentscript'],
            },
            function() {
                if (typeof callback === 'function') {
                    callback();
                }
            }
        );
    };

    // Execute EventEmitter code and call the next script.
    function injectEventEmitterScript() {
        chrome.tabs.executeScript(
            tabId,
            {
                file: scripts['eventEmitter'],
            }, injectGoodblockScript
        );
    };
    
    injectEventEmitterScript();
};
/******************************************************************************/
// uBlock Origin Code
    // chrome.browserAction.setIcon({ tabId: tabId, path: iconPaths }, onIconReady);
    // vAPI.contextMenu.onMustUpdate(tabId);
/******************************************************************************/

/******************************************************************************/

vAPI.messaging = {
    ports: {},
    listeners: {},
    defaultHandler: null,
    NOOPFUNC: noopFunc,
    UNHANDLED: 'vAPI.messaging.notHandled'
};

/******************************************************************************/

vAPI.messaging.listen = function(listenerName, callback) {
    this.listeners[listenerName] = callback;
};

/******************************************************************************/

vAPI.messaging.onPortMessage = (function() {
    var messaging = vAPI.messaging;
    var toAuxPending = {};

    // Use a wrapper to avoid closure and to allow reuse.
    var CallbackWrapper = function(port, request, timeout) {
        this.callback = this.proxy.bind(this); // bind once
        this.init(port, request, timeout);
    };

    CallbackWrapper.prototype.init = function(port, request, timeout) {
        this.port = port;
        this.request = request;
        this.timerId = timeout !== undefined ?
                            vAPI.setTimeout(this.callback, timeout) :
                            null;
        return this;
    };

    CallbackWrapper.prototype.proxy = function(response) {
        if ( this.timerId !== null ) {
            clearTimeout(this.timerId);
            delete toAuxPending[this.timerId];
            this.timerId = null;
        }
        // https://github.com/chrisaljoudi/uBlock/issues/383
        if ( messaging.ports.hasOwnProperty(this.port.name) ) {
            this.port.postMessage({
                auxProcessId: this.request.auxProcessId,
                channelName: this.request.channelName,
                msg: response !== undefined ? response : null
            });
        }
        // Mark for reuse
        this.port = this.request = null;
        callbackWrapperJunkyard.push(this);
    };

    var callbackWrapperJunkyard = [];

    var callbackWrapperFactory = function(port, request, timeout) {
        var wrapper = callbackWrapperJunkyard.pop();
        if ( wrapper ) {
            return wrapper.init(port, request, timeout);
        }
        return new CallbackWrapper(port, request, timeout);
    };

    var toAux = function(details, portFrom) {
        var port, portTo;
        var chromiumTabId = toChromiumTabId(details.toTabId);

        // TODO: This could be an issue with a lot of tabs: easy to address
        //       with a port name to tab id map.
        for ( var portName in messaging.ports ) {
            if ( messaging.ports.hasOwnProperty(portName) === false ) {
                continue;
            }
            // When sending to an auxiliary process, the target is always the
            // port associated with the root frame.
            port = messaging.ports[portName];
            if ( port.sender.frameId === 0 && port.sender.tab.id === chromiumTabId ) {
                portTo = port;
                break;
            }
        }

        var wrapper;
        if ( details.auxProcessId !== undefined ) {
            wrapper = callbackWrapperFactory(portFrom, details, 1023);
        }

        // Destination not found: 
        if ( portTo === undefined ) {
            if ( wrapper !== undefined ) {
                wrapper.callback();
            }
            return;
        }

        // As per HTML5, timer id is always an integer, thus suitable to be
        // used as a key, and which value is safe to use across process
        // boundaries.
        if ( wrapper !== undefined ) {
            toAuxPending[wrapper.timerId] = wrapper;
        }

        portTo.postMessage({
            mainProcessId: wrapper && wrapper.timerId,
            channelName: details.toChannel,
            msg: details.msg
        });
    };

    var toAuxResponse = function(details) {
        var mainProcessId = details.mainProcessId;
        if ( mainProcessId === undefined ) {
            return;
        }
        if ( toAuxPending.hasOwnProperty(mainProcessId) === false ) {
            return;
        }
        var wrapper = toAuxPending[mainProcessId];
        delete toAuxPending[mainProcessId];
        wrapper.callback(details.msg);
    };

    return function(request, port) {
        // Auxiliary process to auxiliary process
        if ( request.toTabId !== undefined ) {
            toAux(request, port);
            return;
        }

        // Auxiliary process to auxiliary process: response
        if ( request.mainProcessId !== undefined ) {
            toAuxResponse(request);
            return;
        }

        // Auxiliary process to main process: prepare response
        var callback = messaging.NOOPFUNC;
        if ( request.auxProcessId !== undefined ) {
            callback = callbackWrapperFactory(port, request).callback;
        }

        // Auxiliary process to main process: specific handler
        var r = messaging.UNHANDLED;
        var listener = messaging.listeners[request.channelName];
        if ( typeof listener === 'function' ) {
            r = listener(request.msg, port.sender, callback);
        }
        if ( r !== messaging.UNHANDLED ) {
            return;
        }

        // Auxiliary process to main process: default handler
        r = messaging.defaultHandler(request.msg, port.sender, callback);
        if ( r !== messaging.UNHANDLED ) {
            return;
        }

        // Auxiliary process to main process: no handler
        console.error('uBlock> messaging > unknown request: %o', request);

        // Need to callback anyways in case caller expected an answer, or
        // else there is a memory leak on caller's side
        callback();
    };
})();

/******************************************************************************/

vAPI.messaging.onPortDisconnect = function(port) {
    port.onDisconnect.removeListener(vAPI.messaging.onPortDisconnect);
    port.onMessage.removeListener(vAPI.messaging.onPortMessage);
    delete vAPI.messaging.ports[port.name];
};

/******************************************************************************/

vAPI.messaging.onPortConnect = function(port) {
    port.onDisconnect.addListener(vAPI.messaging.onPortDisconnect);
    port.onMessage.addListener(vAPI.messaging.onPortMessage);
    vAPI.messaging.ports[port.name] = port;
};

/******************************************************************************/

vAPI.messaging.setup = function(defaultHandler) {
    // Already setup?
    if ( this.defaultHandler !== null ) {
        return;
    }

    if ( typeof defaultHandler !== 'function' ) {
        defaultHandler = function(){ return vAPI.messaging.UNHANDLED; };
    }
    this.defaultHandler = defaultHandler;

    chrome.runtime.onConnect.addListener(this.onPortConnect);
};

/******************************************************************************/

// Sends a message to all tabs.
vAPI.messaging.broadcast = function(message) {
    var messageWrapper = {
        broadcast: true,
        msg: message
    };

    for ( var portName in this.ports ) {
        if ( this.ports.hasOwnProperty(portName) === false ) {
            continue;
        }
        this.ports[portName].postMessage(messageWrapper);
    }
};

/******************************************************************************/
// beginblock Goodblock-uBlock Code
/******************************************************************************/

vAPI.messaging.getPortFromTabId = function(tabId) {
    for ( var portName in this.ports ) {
        var portTabId = this.ports[portName]['sender']['tab']['id'];
        if (portTabId === tabId) {
            return this.ports[portName];
        }
    }
    return null;
}

// Goodblock.
// Sends a message to a specific tab.
vAPI.messaging.messageTab = function(message, tabId) {
    var messageWrapper = {
        msg: message,
        channelName: 'contentscript-goodblock.js'
    };

    // Get the portName from the tabId.
    var port = vAPI.messaging.getPortFromTabId(tabId);

    // If there isn't a port for the tab, don't send the message.
    if (!port) {
        return;
    }

    var portName = port['name'];
    // Message the port.
    this.ports[portName].postMessage(messageWrapper);
};

/******************************************************************************/

// This allows to avoid creating a closure for every single message which
// expects an answer. Having a closure created each time a message is processed
// has been always bothering me. Another benefit of the implementation here
// is to reuse the callback proxy object, so less memory churning.
//
// https://developers.google.com/speed/articles/optimizing-javascript
// "Creating a closure is significantly slower then creating an inner
//  function without a closure, and much slower than reusing a static
//  function"
//
// http://hacksoflife.blogspot.ca/2015/01/the-four-horsemen-of-performance.html
// "the dreaded 'uniformly slow code' case where every function takes 1%
//  of CPU and you have to make one hundred separate performance optimizations
//  to improve performance at all"
//
// http://jsperf.com/closure-no-closure/2

var CallbackWrapper = function(port, request) {
    // No need to bind every single time
    this.callback = this.proxy.bind(this);
    this.messaging = vAPI.messaging;
    this.init(port, request);
};

CallbackWrapper.junkyard = [];

CallbackWrapper.factory = function(port, request) {
    var wrapper = CallbackWrapper.junkyard.pop();
    if ( wrapper ) {
        wrapper.init(port, request);
        return wrapper;
    }
    return new CallbackWrapper(port, request);
};

CallbackWrapper.prototype.init = function(port, request) {
    this.port = port;
    this.request = request;
};

CallbackWrapper.prototype.proxy = function(response) {
    // https://github.com/chrisaljoudi/uBlock/issues/383
    if ( this.messaging.ports.hasOwnProperty(this.port.name) ) {
        this.port.postMessage({
            requestId: this.request.requestId,
            channelName: this.request.channelName,
            msg: response !== undefined ? response : null
        });
    }
    // Mark for reuse
    this.port = this.request = null;
    CallbackWrapper.junkyard.push(this);
};

/******************************************************************************/
// endblock Goodblock-uBlock Code
/******************************************************************************/

vAPI.net = {};

/******************************************************************************/

vAPI.net.registerListeners = function() {
    var µb = µBlock;
    var µburi = µb.URI;

    // https://bugs.chromium.org/p/chromium/issues/detail?id=410382
    // Between Chromium 38-48, plug-ins' network requests were reported as
    // type "other" instead of "object".
    var is_v38_48 = /\bChrom[a-z]+\/(?:3[89]|4[0-8])\.[\d.]+\b/.test(navigator.userAgent);

    // Chromium-based browsers understand only these network request types.
    var validTypes = {
        'main_frame': true,
        'sub_frame': true,
        'stylesheet': true,
        'script': true,
        'image': true,
        'object': true,
        'xmlhttprequest': true,
        'other': true
    };

    var denormalizeTypes = function(aa) {
        if ( aa.length === 0 ) {
            return Object.keys(validTypes);
        }
        var out = [];
        var i = aa.length,
            type,
            needOther = true;
        while ( i-- ) {
            type = aa[i];
            if ( validTypes.hasOwnProperty(type) ) {
                out.push(type);
            }
            if ( type === 'other' ) {
                needOther = false;
            }
        }
        if ( needOther ) {
            out.push('other');
        }
        return out;
    };

    var headerValue = function(headers, name) {
        var i = headers.length;
        while ( i-- ) {
            if ( headers[i].name.toLowerCase() === name ) {
                return headers[i].value.trim();
            }
        }
        return '';
    };

    var normalizeRequestDetails = function(details) {
        details.tabId = details.tabId.toString();

        // https://github.com/gorhill/uBlock/issues/1493
        // Chromium 49+ support a new request type: `ping`, which is fired as
        // a result of using `navigator.sendBeacon`.
        if ( details.type === 'ping' ) {
            details.type = 'beacon';
            return;
        }

        // The rest of the function code is to normalize type
        if ( details.type !== 'other' ) {
            return;
        }

        var path = µburi.pathFromURI(details.url);
        var pos = path.indexOf('.', path.length - 6);

        // https://github.com/chrisaljoudi/uBlock/issues/862
        // If no transposition possible, transpose to `object` as per
        // Chromium bug 410382 (see below)
        if ( pos !== -1 ) {
            var needle = path.slice(pos) + '.';
            if ( '.eot.ttf.otf.svg.woff.woff2.'.indexOf(needle) !== -1 ) {
                details.type = 'font';
                return;
            }

            if ( '.mp3.mp4.webm.'.indexOf(needle) !== -1 ) {
                details.type = 'media';
                return;
            }

            // Still need this because often behind-the-scene requests are wrongly
            // categorized as 'other'
            if ( '.ico.png.gif.jpg.jpeg.webp.'.indexOf(needle) !== -1 ) {
                details.type = 'image';
                return;
            }
        }

        // Try to extract type from response headers if present.
        if ( details.responseHeaders ) {
            var contentType = headerValue(details.responseHeaders, 'content-type');
            if ( contentType.startsWith('font/') ) {
                details.type = 'font';
                return;
            }
            if ( contentType.startsWith('image/') ) {
                details.type = 'image';
                return;
            }
            if ( contentType.startsWith('audio/') || contentType.startsWith('video/') ) {
                details.type = 'media';
                return;
            }
        }

        // https://code.google.com/p/chromium/issues/detail?id=410382
        if ( is_v38_48 ) {
            details.type = 'object';
        }
    };

    // https://bugs.chromium.org/p/chromium/issues/detail?id=129353
    // https://github.com/gorhill/uBlock/issues/1497
    // Expose websocket-based network requests to uBO's filtering engine,
    // logger, etc.
    // Counterpart of following block of code is found in "vapi-client.js" --
    // search for "https://github.com/gorhill/uBlock/issues/1497".
    var onBeforeWebsocketRequest = function(details) {
        details.type = 'websocket';
        var matches = /url=([^&]+)/.exec(details.url);
        details.url = decodeURIComponent(matches[1]);
        var r = onBeforeRequestClient(details);
        // Blocked?
        if ( r && r.cancel ) {
            return r;
        }
        // Returning a 1x1 transparent pixel means "not blocked".
        return { redirectUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' };
    };

    var onBeforeRequestClient = this.onBeforeRequest.callback;
    var onBeforeRequest = function(details) {
        // https://github.com/gorhill/uBlock/issues/1497
        if (
            details.type === 'image' &&
            details.url.endsWith('ubofix=f41665f3028c7fd10eecf573336216d3')
        ) {
            return onBeforeWebsocketRequest(details);
        }

        normalizeRequestDetails(details);
        return onBeforeRequestClient(details);
    };

    var onHeadersReceivedClient = this.onHeadersReceived.callback;
    var onHeadersReceivedClientTypes = this.onHeadersReceived.types.slice(0);
    var onHeadersReceivedTypes = denormalizeTypes(onHeadersReceivedClientTypes);
    var onHeadersReceived = function(details) {
        normalizeRequestDetails(details);
        // Hack to work around Chromium API limitations, where requests of
        // type `font` are returned as `other`. For example, our normalization
        // fail at transposing `other` into `font` for URLs which are outside
        // what is expected. At least when headers are received we can check
        // for content type `font/*`. Blocking at onHeadersReceived time is
        // less worse than not blocking at all. Also, due to Chromium bug,
        // `other` always becomes `object` when it can't be normalized into
        // something else. Test case for "unfriendly" font URLs:
        //   https://www.google.com/fonts
        if ( details.type === 'font' ) {
            var r = onBeforeRequestClient(details);
            if ( typeof r === 'object' && r.cancel === true ) {
                return { cancel: true };
            }
        }
        if (
            onHeadersReceivedClientTypes.length !== 0 &&
            onHeadersReceivedClientTypes.indexOf(details.type) === -1
        ) {
            return;
        }
        return onHeadersReceivedClient(details);
    };

    var installListeners = (function() {
        var listener;
        var crapi = chrome.webRequest;

        listener = onBeforeRequest;
        //listener = function(details) {
        //    quickProfiler.start('onBeforeRequest');
        //    var r = onBeforeRequest(details);
        //    quickProfiler.stop();
        //    return r;
        //};
        if ( crapi.onBeforeRequest.hasListener(listener) === false ) {
            crapi.onBeforeRequest.addListener(
                listener,
                {
                    'urls': this.onBeforeRequest.urls || ['<all_urls>'],
                    'types': this.onBeforeRequest.types || undefined
                },
                this.onBeforeRequest.extra
            );
        }

        listener = onHeadersReceived;
        if ( crapi.onHeadersReceived.hasListener(listener) === false ) {
            crapi.onHeadersReceived.addListener(
                listener,
                {
                    'urls': this.onHeadersReceived.urls || ['<all_urls>'],
                    'types': onHeadersReceivedTypes
                },
                this.onHeadersReceived.extra
            );
        }

        // https://github.com/gorhill/uBlock/issues/675
        // Experimental: keep polling to be sure our listeners are still installed.
        //setTimeout(installListeners, 20000);
    }).bind(this);

    installListeners();
};

/******************************************************************************/
/******************************************************************************/

vAPI.contextMenu = {
    _callback: null,
    _entries: [],
    _createEntry: function(entry) {
        chrome.contextMenus.create(JSON.parse(JSON.stringify(entry)), function() {
            void chrome.runtime.lastError;
        });
    },
    onMustUpdate: function() {},
    setEntries: function(entries, callback) {
        entries = entries || [];
        var n = Math.max(this._entries.length, entries.length),
            oldEntryId, newEntry;
        for ( var i = 0; i < n; i++ ) {
            oldEntryId = this._entries[i];
            newEntry = entries[i];
            if ( oldEntryId && newEntry ) {
                if ( newEntry.id !== oldEntryId ) {
                    chrome.contextMenus.remove(oldEntryId);
                    this._createEntry(newEntry);
                    this._entries[i] = newEntry.id;
                }
            } else if ( oldEntryId && !newEntry ) {
                chrome.contextMenus.remove(oldEntryId);
            } else if ( !oldEntryId && newEntry ) {
                this._createEntry(newEntry);
                this._entries[i] = newEntry.id;
            }
        }
        n = this._entries.length = entries.length;
        callback = callback || null;
        if ( callback === this._callback ) {
            return;
        }
        if ( n !== 0 && callback !== null ) {
            chrome.contextMenus.onClicked.addListener(callback);
            this._callback = callback;
        } else if ( n === 0 && this._callback !== null ) {
            chrome.contextMenus.onClicked.removeListener(this._callback);
            this._callback = null;
        }
    }
};

/******************************************************************************/
/******************************************************************************/

vAPI.lastError = function() {
    return chrome.runtime.lastError;
};

/******************************************************************************/
/******************************************************************************/

// This is called only once, when everything has been loaded in memory after
// the extension was launched. It can be used to inject content scripts
// in already opened web pages, to remove whatever nuisance could make it to
// the web pages before uBlock was ready.

vAPI.onLoadAllCompleted = function() {
    // http://code.google.com/p/chromium/issues/detail?id=410868#c11
    // Need to be sure to access `vAPI.lastError()` to prevent
    // spurious warnings in the console.
    var scriptDone = function() {
        vAPI.lastError();
    };
    var scriptEnd = function(tabId) {
        if ( vAPI.lastError() ) {
            return;
        }
        vAPI.tabs.injectScript(tabId, {
            file: 'js/contentscript-end.js',
            allFrames: true,
            runAt: 'document_idle'
        }, function() {
            // Goodblock.
            // vAPI.injectGoodblockContentScripts(tabId, scriptDone);
        });
    };
    var scriptStart = function(tabId) {
        vAPI.tabs.injectScript(tabId, {
            file: 'js/vapi-client.js',
            allFrames: true,
            runAt: 'document_idle'
        }, function(){ });
        vAPI.tabs.injectScript(tabId, {
            file: 'js/contentscript-start.js',
            allFrames: true,
            runAt: 'document_idle'
        }, function(){ scriptEnd(tabId); });
    };
    var bindToTabs = function(tabs) {
        var µb = µBlock;
        var i = tabs.length, tab;
        while ( i-- ) {
            tab = tabs[i];

            // Goodblock.
            // Do not inject content scripts into Gladly
            // whitelisted pages.
            var hostname = µb.URI.hostnameFromURI(tab.url);
            if (µBlock.goodblock.isGladlyHostname(hostname)) {
                continue;
            }

            µb.tabContextManager.commit(tab.id, tab.url);
            µb.bindTabToPageStats(tab.id);
            // https://github.com/chrisaljoudi/uBlock/issues/129
            scriptStart(tab.id);
        }
    };

    // Old code 
    // try {
    //     // Hello? Is this a recent version of Chrome?
    //     chrome.browserAction.setIcon({ path: ICON_PATHS.off });
    // }
    // catch(e) {
    //     // Nope; looks like older than v23
    //     chrome.browserAction._setIcon = chrome.browserAction.setIcon;
    //     // Shim
    //     chrome.browserAction.setIcon = function(x, callback) {
    //         this._setIcon({path: x.path[19], tabId: x.tabId}, callback);
    //     };
    //     // maybe this time... I'll win
    //     chrome.browserAction.setIcon({ path: ICON_PATHS.off });
    // }

    // chrome.tabs.query({ url: 'http://*/*' }, bindToTabs);
    // chrome.tabs.query({ url: 'https://*/*' }, bindToTabs);

    chrome.tabs.query({ url: '<all_urls>' }, bindToTabs);
};

/******************************************************************************/
/******************************************************************************/

vAPI.punycodeHostname = function(hostname) {
    return hostname;
};

vAPI.punycodeURL = function(url) {
    return url;
};

/******************************************************************************/

// https://github.com/gorhill/uBlock/issues/531
// Storage area dedicated to admin settings. Read-only.

// https://github.com/gorhill/uBlock/commit/43a5ed735b95a575a9339b6e71a1fcb27a99663b#commitcomment-13965030
// Not all Chromium-based browsers support managed storage. Merely testing or
// exception handling in this case does NOT work: I don't know why. The
// extension on Opera ends up in a non-sensical state, whereas vAPI become
// undefined out of nowhere. So only solution left is to test explicitly for
// Opera.
// https://github.com/gorhill/uBlock/issues/900
// Also, UC Browser: http://www.upsieutoc.com/image/WXuH

vAPI.adminStorage = {
    getItem: function(key, callback) {
        var onRead = function(store) {
            var data;
            if (
                !chrome.runtime.lastError &&
                typeof store === 'object' &&
                store !== null
            ) {
                data = store[key];
            }
            callback(data);
        };
        try {
            chrome.storage.managed.get(key, onRead);
        } catch (ex) {
            callback();
        }
    }
};

/******************************************************************************/
/******************************************************************************/

vAPI.cloud = (function() {
    var chunkCountPerFetch = 16; // Must be a power of 2

    // Mind chrome.storage.sync.MAX_ITEMS (512 at time of writing)
    var maxChunkCountPerItem = Math.floor(512 * 0.75) & ~(chunkCountPerFetch - 1);

    // Mind chrome.storage.sync.QUOTA_BYTES_PER_ITEM (8192 at time of writing)
    var maxChunkSize = Math.floor(chrome.storage.sync.QUOTA_BYTES_PER_ITEM * 0.75);

    // Mind chrome.storage.sync.QUOTA_BYTES (128 kB at time of writing)
    var maxStorageSize = chrome.storage.sync.QUOTA_BYTES;

    var options = {
        defaultDeviceName: window.navigator.platform,
        deviceName: window.localStorage.getItem('deviceName') || ''
    };

    // This is used to find out a rough count of how many chunks exists:
    // We "poll" at specific index in order to get a rough idea of how
    // large is the stored string.
    // This allows reading a single item with only 2 sync operations -- a
    // good thing given chrome.storage.sync.MAX_WRITE_OPERATIONS_PER_MINUTE
    // and chrome.storage.sync.MAX_WRITE_OPERATIONS_PER_HOUR.

    var getCoarseChunkCount = function(dataKey, callback) {
        var bin = {};
        for ( var i = 0; i < maxChunkCountPerItem; i += 16 ) {
            bin[dataKey + i.toString()] = '';
        }

        chrome.storage.sync.get(bin, function(bin) {
            if ( chrome.runtime.lastError ) {
                callback(0, chrome.runtime.lastError.message);
                return;
            }

            var chunkCount = 0;
            for ( var i = 0; i < maxChunkCountPerItem; i += 16 ) {
                if ( bin[dataKey + i.toString()] === '' ) {
                    break;
                }
                chunkCount = i + 16;
            }

            callback(chunkCount);
        });
    };

    var deleteChunks = function(dataKey, start) {
        var keys = [];

        // No point in deleting more than:
        // - The max number of chunks per item
        // - The max number of chunks per storage limit
        var n = Math.min(
            maxChunkCountPerItem,
            Math.ceil(maxStorageSize / maxChunkSize)
        );
        for ( var i = start; i < n; i++ ) {
            keys.push(dataKey + i.toString());
        }
        chrome.storage.sync.remove(keys);
    };

    var start = function(/* dataKeys */) {
    };

    var push = function(dataKey, data, callback) {
        var bin = {
            'source': options.deviceName || options.defaultDeviceName,
            'tstamp': Date.now(),
            'data': data,
            'size': 0
        };
        bin.size = JSON.stringify(bin).length;
        var item = JSON.stringify(bin);

        // Chunkify taking into account QUOTA_BYTES_PER_ITEM:
        //   https://developer.chrome.com/extensions/storage#property-sync
        //   "The maximum size (in bytes) of each individual item in sync
        //   "storage, as measured by the JSON stringification of its value
        //   "plus its key length."
        bin = {};
        var chunkCount = Math.ceil(item.length / maxChunkSize);
        for ( var i = 0; i < chunkCount; i++ ) {
            bin[dataKey + i.toString()] = item.substr(i * maxChunkSize, maxChunkSize);
        }
        bin[dataKey + i.toString()] = ''; // Sentinel

        chrome.storage.sync.set(bin, function() {
            var errorStr;
            if ( chrome.runtime.lastError ) {
                errorStr = chrome.runtime.lastError.message;
            }
            callback(errorStr);

            // Remove potentially unused trailing chunks
            deleteChunks(dataKey, chunkCount);
        });
    };

    var pull = function(dataKey, callback) {
        var assembleChunks = function(bin) {
            if ( chrome.runtime.lastError ) {
                callback(null, chrome.runtime.lastError.message);
                return;
            }

            // Assemble chunks into a single string.
            var json = [], jsonSlice;
            var i = 0;
            for (;;) {
                jsonSlice = bin[dataKey + i.toString()];
                if ( jsonSlice === '' ) {
                    break;
                }
                json.push(jsonSlice);
                i += 1;
            }

            var entry = null;
            try {
                entry = JSON.parse(json.join(''));
            } catch(ex) {
            }
            callback(entry);
        };

        var fetchChunks = function(coarseCount, errorStr) {
            if ( coarseCount === 0 || typeof errorStr === 'string' ) {
                callback(null, errorStr);
                return;
            }

            var bin = {};
            for ( var i = 0; i < coarseCount; i++ ) {
                bin[dataKey + i.toString()] = '';
            }

            chrome.storage.sync.get(bin, assembleChunks);
        };

        getCoarseChunkCount(dataKey, fetchChunks);
    };

    var getOptions = function(callback) {
        if ( typeof callback !== 'function' ) {
            return;
        }
        callback(options);
    };

    var setOptions = function(details, callback) {
        if ( typeof details !== 'object' || details === null ) {
            return;
        }

        if ( typeof details.deviceName === 'string' ) {
            window.localStorage.setItem('deviceName', details.deviceName);
            options.deviceName = details.deviceName;
        }

        getOptions(callback);
    };

    return {
        start: start,
        push: push,
        pull: pull,
        getOptions: getOptions,
        setOptions: setOptions
    };
})();

/******************************************************************************/
/******************************************************************************/

})();

/******************************************************************************/
