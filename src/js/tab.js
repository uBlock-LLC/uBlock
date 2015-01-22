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

/* global vAPI, µBlock */

/******************************************************************************/
/******************************************************************************/

(function() {

'use strict';

/******************************************************************************/

var µb = µBlock;

/******************************************************************************/
/******************************************************************************/

// When the DOM content of root frame is loaded, this means the tab
// content has changed.
vAPI.tabs.onNavigation = function(details) {
    if ( details.frameId !== 0 ) {
        return;
    }
    µb.bindTabToPageStats(details.tabId, details.url, 'afterNavigate');
};

// It may happen the URL in the tab changes, while the page's document
// stays the same (for instance, Google Maps). Without this listener,
// the extension icon won't be properly refreshed.
vAPI.tabs.onUpdated = function(tabId, changeInfo, tab) {
    if ( !tab.url || tab.url === '' ) {
        return;
    }
    if ( !changeInfo.url ) {
        return;
    }
    µb.bindTabToPageStats(tabId, changeInfo.url, 'tabUpdated');
};

vAPI.tabs.onClosed = function(tabId) {
    if ( tabId < 0 ) {
        return;
    }
    µb.unbindTabFromPageStats(tabId);
};

// https://github.com/gorhill/uBlock/issues/297
vAPI.tabs.onPopup = function(details) {
    //console.debug('vAPI.tabs.onPopup: url="%s"', details.url);

    var pageStore = µb.pageStoreFromTabId(details.sourceTabId);
    if ( !pageStore ) {
        return;
    }
    var requestURL = details.url;
    var result = '';

    // https://github.com/gorhill/uBlock/issues/323
    // If popup URL is whitelisted, do not block it
    if ( µb.getNetFilteringSwitch(requestURL) ) {
        result = µb.staticNetFilteringEngine.matchStringExactType(pageStore, requestURL, 'popup');
    }

    // https://github.com/gorhill/uBlock/issues/91
    if ( result !== '' ) {
        var context = {
            requestURL: requestURL,
            requestHostname: µb.URI.hostnameFromURI(requestURL),
            requestType: 'popup'
        };
        pageStore.logBuffer.writeOne(context, result);
    }

    // Not blocked
    if ( pageStore.boolFromResult(result) === false ) {
        return;
    }

    // Blocked

    // It is a popup, block and remove the tab.
    µb.unbindTabFromPageStats(details.tabId);
    vAPI.tabs.remove(details.tabId);

    // for Safari and Firefox
    return true;
};

vAPI.tabs.registerListeners();

/******************************************************************************/
/******************************************************************************/

// https://github.com/gorhill/httpswitchboard/issues/303
// Some kind of trick going on here:
//   Any scheme other than 'http' and 'https' is remapped into a fake
//   URL which trick the rest of µBlock into being able to process an
//   otherwise unmanageable scheme. µBlock needs web page to have a proper
//   hostname to work properly, so just like the 'chromium-behind-the-scene'
//   fake domain name, we map unknown schemes into a fake '{scheme}-scheme'
//   hostname. This way, for a specific scheme you can create scope with
//   rules which will apply only to that scheme.

µb.normalizePageURL = function(tabId, pageURL) {
    if ( vAPI.isNoTabId(tabId) ) {
        return 'http://behind-the-scene/';
    }
    var uri = this.URI.set(pageURL);
    var scheme = uri.scheme;
    if ( scheme === 'https' || scheme === 'http' ) {
        return uri.normalizedURI();
    }

    if ( uri.hostname !== '' ) {
        return 'http://' + scheme + '-' + uri.hostname + uri.path;
    }

    return 'http://' + scheme + '-scheme/';
};

/******************************************************************************/

// Create an entry for the tab if it doesn't exist.

µb.bindTabToPageStats = function(tabId, pageURL, context) {
    this.updateBadgeAsync(tabId);

    // https://github.com/gorhill/httpswitchboard/issues/303
    // Normalize page URL
    pageURL = this.normalizePageURL(tabId, pageURL);

    // Do not create a page store for URLs which are of no interests
    if ( pageURL === '' ) {
        this.unbindTabFromPageStats(tabId);
        return null;
    }

    // Reuse page store if one exists: this allows to guess if a tab is a popup
    var pageStore = this.pageStores[tabId];

    // Tab is not bound
    if ( !pageStore ) {
        return this.pageStores[tabId] = this.PageStore.factory(tabId, pageURL);
    }

    // https://github.com/gorhill/uBlock/issues/516
    // If context if 'beforeRequest', do not rebind
    if ( context === 'beforeRequest' ) {
        return pageStore;
    }

    if ( context === 'afterNavigate' ) {
        pageStore.reuse(pageURL, context);
    }

    return pageStore;
};

µb.unbindTabFromPageStats = function(tabId) {
    //console.debug('µBlock> unbindTabFromPageStats(%d)', tabId);
    var pageStore = this.pageStores[tabId];
    if ( pageStore !== undefined ) {
        pageStore.dispose();
        delete this.pageStores[tabId];
    }
};

/******************************************************************************/

µb.pageUrlFromTabId = function(tabId) {
    var pageStore = this.pageStores[tabId];
    return pageStore ? pageStore.pageURL : '';
};

µb.pageUrlFromPageStats = function(pageStats) {
    if ( pageStats ) {
        return pageStats.pageURL;
    }
    return '';
};

µb.pageStoreFromTabId = function(tabId) {
    return this.pageStores[tabId];
};

/******************************************************************************/

// Permanent page store for behind-the-scene requests. Must never be removed.

µb.pageStores[vAPI.noTabId] = µb.PageStore.factory(
    vAPI.noTabId,
    µb.normalizePageURL(vAPI.noTabId)
);

/******************************************************************************/
/******************************************************************************/

// Stale page store entries janitor
// https://github.com/gorhill/uBlock/issues/455

var pageStoreJanitorPeriod = 15 * 60 * 1000;
var pageStoreJanitorSampleAt = 0;
var pageStoreJanitorSampleSize = 10;

var pageStoreJanitor = function() {
    var vapiTabs = vAPI.tabs;
    var tabIds = Object.keys(µb.pageStores).sort();
    var checkTab = function(tabId) {
        vapiTabs.get(tabId, function(tab) {
            if ( !tab ) {
                //console.error('tab.js> pageStoreJanitor(): stale page store found:', µb.pageUrlFromTabId(tabId));
                µb.unbindTabFromPageStats(tabId);
            }
        });
    };
    if ( pageStoreJanitorSampleAt >= tabIds.length ) {
        pageStoreJanitorSampleAt = 0;
    }
    var tabId;
    var n = Math.min(pageStoreJanitorSampleAt + pageStoreJanitorSampleSize, tabIds.length);
    for ( var i = pageStoreJanitorSampleAt; i < n; i++ ) {
        tabId = tabIds[i];
        // Do not remove behind-the-scene page store
        if ( vAPI.isNoTabId(tabId) ) {
            continue;
        }
        checkTab(tabId);
    }
    pageStoreJanitorSampleAt = n;

    setTimeout(pageStoreJanitor, pageStoreJanitorPeriod);
};

setTimeout(pageStoreJanitor, pageStoreJanitorPeriod);

/******************************************************************************/
/******************************************************************************/

})();

/******************************************************************************/
