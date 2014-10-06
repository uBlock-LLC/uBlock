/*******************************************************************************

    µBlock - a Chromium browser extension to block requests.
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

    Home: https://github.com/gorhill/uBlock
*/

/* global chrome, µBlock */

/******************************************************************************/

// Start isolation from global scope

µBlock.webRequest = (function() {

/******************************************************************************/

// Intercept and filter web requests.

var onBeforeRequest = function(details) {
    //console.debug('onBeforeRequest()> "%s": %o', details.url, details);

    // Do not block behind the scene requests.
    var tabId = details.tabId;
    if ( tabId < 0 ) {
        return;
    }

    var µb = µBlock;
    var requestURL = details.url;
    var requestType = details.type;

    // Special handling for root document.
    if ( requestType === 'main_frame' && details.parentFrameId === -1 ) {
        µb.bindTabToPageStats(tabId, requestURL, 'beforeRequest');
        return;
    }

    // Commented out until (and if ever) there is a fix for:
    // https://code.google.com/p/chromium/issues/detail?id=410382
    //
    // Try to transpose generic `other` category into something more meaningful.
    if ( requestType === 'other' ) {
        requestType = µb.transposeType('other', µb.URI.set(requestURL).path);
        // https://github.com/gorhill/uBlock/issues/206
        // https://code.google.com/p/chromium/issues/detail?id=410382
        // Work around the issue of Chromium not properly setting the type for
        // `object` requests. Unclear whether this issue will be fixed, hence 
        // this workaround to prevent torch-and-pitchfork mobs because ads are 
        // no longer blocked in videos.
        // onBeforeSendHeaders() will handle this for now.
        if ( requestType === 'other' ) {
            return;
        }
    }

    // Lookup the page store associated with this tab id.
    var pageStore = µb.pageStoreFromTabId(tabId);
    if ( !pageStore ) {
        return;
    }

    // https://github.com/gorhill/uBlock/issues/114
    var requestContext = pageStore;

    var frameStore;
    var frameId = details.frameId;
    if ( frameId > 0 ) {
        if ( frameStore = pageStore.getFrame(frameId) ) {
            requestContext = frameStore;
        }
    }

    var result = '';
    if ( pageStore.getNetFilteringSwitch() ) {
        result = pageStore.filterRequest(requestContext, requestType, requestURL);
    }

    // Not blocked
    if ( pageStore.boolFromResult(result) === false ) {
        pageStore.perLoadAllowedRequestCount++;
        µb.localSettings.allowedRequestCount++;

        // https://github.com/gorhill/uBlock/issues/114
        if ( frameId > 0 && frameStore === undefined ) {
            pageStore.addFrame(frameId, requestURL);
        }

        if ( µb.userSettings.experimentalEnabled ) {
            // https://code.google.com/p/chromium/issues/detail?id=387198
            // Not all redirects will succeed, until bug above is fixed.
            var redirectURL = µb.mirrors.toURL(requestURL, true);
            if ( redirectURL !== '' ) {
                pageStore.setRequestFlags(requestURL, 0x01, 0x01);
                //console.debug('"%s" redirected to "%s..."', requestURL.slice(0, 50), redirectURL.slice(0, 50));
                return { redirectUrl: redirectURL };
            }
        }

        //console.debug('µBlock> onBeforeRequest()> ALLOW "%s" (%o)', details.url, details);
        return;
    }

    // Blocked
    pageStore.perLoadBlockedRequestCount++;
    µb.localSettings.blockedRequestCount++;
    µb.updateBadgeAsync(tabId);

    // https://github.com/gorhill/uBlock/issues/18
    // Do not use redirection, we need to block outright to be sure the request
    // will not be made. There can be no such guarantee with redirection.

    // console.debug('µBlock> onBeforeRequest()> BLOCK "%s" (%o) because "%s"', details.url, details, result);
    return { 'cancel': true };
};

/******************************************************************************/

// Intercept root frame requests. This is where we identify and block popups.

var onBeforeSendHeaders = function(details) {
    // TODO: I vaguely remember reading that when pre-fetch is enabled,
    // the tab id could be -1, despite the request not really being a
    // behind-the-scene request. If true, the test below would prevent 
    // the popup blocker from working. Need to check this.

    // Do not block behind the scene requests.
    var tabId = details.tabId;
    if ( tabId < 0 ) {
        return;
    }

    // https://github.com/gorhill/uBlock/issues/206
    // https://code.google.com/p/chromium/issues/detail?id=410382
    // Work around the issue of Chromium not properly setting the type for
    // `object` requests. Unclear whether this issue will be fixed, hence this
    // workaround to prevent widespread breakage of the extension.
    if ( details.type === 'other' ) {
        return cr410382Workaround(details);
    }

    // Only root document.
    if ( details.parentFrameId !== -1 ) {
        return;
    }

    var µb = µBlock;
    var requestURL = details.url;

    // Lookup the page store associated with this tab id.
    var pageStore = µb.pageStoreFromTabId(tabId);
    if ( !pageStore ) {
        console.error('µBlock> onBeforeSendHeaders(): no page store for "%s"', requestURL);
        return;
    }

    // Heuristic to determine whether we are dealing with a popup:
    // - the page store is new (it's not a reused one)
    // - the referrer is not nil

    // Can't be a popup, the tab was in use previously.
    if ( pageStore.previousPageURL !== '' ) {
        return;
    }

    var referrer = headerValue(details.requestHeaders, 'referer');
    if ( referrer === '' ) {
        return;
    }

    // https://github.com/gorhill/uBlock/issues/67
    // We need to pass the details of the page which opened this popup,
    // so that the `third-party` option works.
    var µburi = µb.URI;
    var referrerHostname = µburi.hostnameFromURI(referrer);
    var pageDetails = {
        pageHostname: referrerHostname,
        pageDomain: µburi.domainFromHostname(referrerHostname)
    };
    //console.debug('Referrer="%s"', referrer);

    // TODO: I think I should test the switch of the referrer instead, not the
    // switch of the popup. If so, that would require being able to lookup
    // a page store from a URL. Have to keep in mind the same URL can appear
    // in multiple tabs.
    var result = '';
    if ( pageStore.getNetFilteringSwitch() ) {
        result = µb.netFilteringEngine.matchStringExactType(pageDetails, requestURL, 'popup');
    }

    // Not blocked?
    if ( result === '' || result.slice(0, 2) === '@@' ) {
        return;
    }

    // It is a popup, block and remove the tab.
    µb.unbindTabFromPageStats(tabId);
    chrome.tabs.remove(tabId);

    return { 'cancel': true };
};

/******************************************************************************/

// Work around the issue of Chromium not properly setting the type for
// `object` requests. Unclear whether this issue will be fixed, hence this
// workaround to prevent widespread breakage of the extension.

var cr410382Workaround = function(details) {
    //console.debug('cr410382Workaround()> "%s": %o', details.url, details);

    var µb = µBlock;
    var requestURL = details.url;
    var µburi = µb.URI.set(requestURL);

    // If the type can be successfully transposed, this means the request
    // was processed at onBeforeRequest time.
    if ( µb.transposeType('other', µburi.path) !== 'other' ) {
        return;
    }

    // Lookup "X-Requested-With" header: this will tell us whether the request
    // is of type "object".
    // Reference: https://code.google.com/p/chromium/issues/detail?id=145090
    var requestedWith = headerValue(details.requestHeaders, 'x-requested-with');

    // Reference: https://codereview.chromium.org/451923002/patch/120001/130008
    var requestType = requestedWith.indexOf('ShockwaveFlash') !== -1 ?
        'object' :
        'other';

    // Lookup the page store associated with this tab id.
    var pageStore = µb.pageStoreFromTabId(details.tabId);
    if ( !pageStore ) {
        return;
    }

    // https://github.com/gorhill/uBlock/issues/114
    var requestContext = pageStore;
    var frameStore;
    var frameId = details.frameId;
    if ( frameId > 0 ) {
        if ( frameStore = pageStore.getFrame(frameId) ) {
            requestContext = frameStore;
        }
    }

    var result = '';
    if ( pageStore.getNetFilteringSwitch() ) {
        result = pageStore.filterRequest(requestContext, requestType, requestURL);
    }

    // Not blocked
    if ( pageStore.boolFromResult(result) === false ) {
        pageStore.perLoadAllowedRequestCount++;
        µb.localSettings.allowedRequestCount++;

        // https://github.com/gorhill/uBlock/issues/114
        if ( frameId > 0 && frameStore === undefined ) {
            pageStore.addFrame(frameId, requestURL);
        }

        //console.debug('µBlock> cr410382Workaround()> ALLOW "%s" (%o)', details.url, details);
        return;
    }

    // Blocked
    pageStore.perLoadBlockedRequestCount++;
    µb.localSettings.blockedRequestCount++;
    µb.updateBadgeAsync(details.tabId);

    //console.debug('µBlock> cr410382Workaround()> BLOCK "%s" (%o) because "%s"', details.url, details, result);
    return { 'cancel': true };
};

/******************************************************************************/

// To handle `inline-script`.

var onHeadersReceived = function(details) {
    // Only root document.
    if ( details.parentFrameId !== -1 ) {
        return;
    }

    // Do not interfere with behind-the-scene requests.
    var tabId = details.tabId;
    if ( tabId < 0 ) {
        return;
    }

    // Lookup the page store associated with this tab id.
    var µb = µBlock;
    var pageStore = µb.pageStoreFromTabId(tabId);
    if ( !pageStore ) {
        return;
    }

    var result = '';
    if ( pageStore.getNetFilteringSwitch() ) {
        result = µb.netFilteringEngine.matchStringExactType(pageStore, details.url, 'inline-script');
    }

    // Not blocked?
    if ( result === '' || result.slice(0, 2) === '@@' ) {
        return;
    }

    // Blocked
    pageStore.perLoadBlockedRequestCount++;
    µb.localSettings.blockedRequestCount++;
    µb.updateBadgeAsync(tabId);

    details.responseHeaders.push({
        'name': 'Content-Security-Policy',
        'value': "script-src *"
    });

    return { 'responseHeaders': details.responseHeaders };
};

/******************************************************************************/

var headerValue = function(headers, name) {
    var i = headers.length;
    while ( i-- ) {
        if ( headers[i].name.toLowerCase() === name ) {
            return headers[i].value;
        }
    }
    return '';
};
/******************************************************************************/

chrome.webRequest.onBeforeRequest.addListener(
    //function(details) {
    //    quickProfiler.start('onBeforeRequest');
    //    var r = onBeforeRequest(details);
    //    quickProfiler.stop();
    //    return r;
    //},
    onBeforeRequest,
    {
        "urls": [
            "http://*/*",
            "https://*/*"
        ],
        "types": [
            "main_frame",
            "sub_frame",
            'stylesheet',
            "script",
            "image",
            "object",
            "xmlhttprequest",
            "other"
        ]
    },
    [ "blocking" ]
);

chrome.webRequest.onBeforeSendHeaders.addListener(
    //function(details) {
    //    quickProfiler.start('onBeforeSendHeaders');
    //    var r = onBeforeSendHeaders(details);
    //    quickProfiler.stop();
    //    return r;
    //},
    onBeforeSendHeaders,
    {
        "urls": [
            "http://*/*",
            "https://*/*"
        ],
        "types": [
            "main_frame",
            "other"          // Because cr410382Workaround()
        ]
    },
    [ "blocking", "requestHeaders" ]
);

chrome.webRequest.onHeadersReceived.addListener(
    onHeadersReceived,
    {
        "urls": [
            "http://*/*",
            "https://*/*"
        ],
        "types": [
            "main_frame"
        ]
    },
    [ "blocking", "responseHeaders" ]
);

console.log('µBlock> Beginning to intercept net requests at %s', (new Date()).toISOString());

/******************************************************************************/

})();

/******************************************************************************/

