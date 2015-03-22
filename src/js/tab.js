/*******************************************************************************

    uBlock - a browser extension to block requests.
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

/* global vAPI, uBlock */

/******************************************************************************/
/******************************************************************************/

(function() {

'use strict';

/******************************************************************************/

var ub = uBlock;

/******************************************************************************/
/******************************************************************************/

// When the DOM content of root frame is loaded, this means the tab
// content has changed.

vAPI.tabs.onNavigation = function(details) {
    if ( details.frameId !== 0 ) {
        return;
    }
    var pageStore = ub.bindTabToPageStats(details.tabId, details.url, 'afterNavigate');

    // https://github.com/gorhill/uBlock/issues/630
    // The hostname of the bound document must always be present in the
    // mini-matrix. That's the best place I could find for the fix, all other
    // options had bad side-effects or complications.
    // TODO: Eventually, we will have to use an API to check whether a scheme
    //       is supported as I suspect we are going to start to see `ws`, `wss`
    //       as well soon.
    if ( pageStore && details.url.lastIndexOf('http', 0) === 0 ) {
        pageStore.hostnameToCountMap[pageStore.pageHostname] = 0;
    }
};

/******************************************************************************/

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
    ub.bindTabToPageStats(tabId, changeInfo.url, 'tabUpdated');
};

/******************************************************************************/

vAPI.tabs.onClosed = function(tabId) {
    if ( tabId < 0 ) {
        return;
    }
    ub.unbindTabFromPageStats(tabId);
};

/******************************************************************************/

// https://github.com/gorhill/uBlock/issues/297

vAPI.tabs.onPopup = function(details) {
    //console.debug('vAPI.tabs.onPopup: details = %o', details);

    var pageStore = ub.pageStoreFromTabId(details.openerTabId);
    var openerURL = details.openerURL || '';

    if ( openerURL === '' && pageStore ) {
        openerURL = pageStore.pageURL;
    }

    if ( openerURL === '' ) {
        return;
    }

    var uburi = ub.URI;
    var openerHostname = uburi.hostnameFromURI(openerURL);
    var openerDomain = uburi.domainFromHostname(openerHostname);

    var context = {
        pageHostname: openerHostname,
        pageDomain: openerDomain,
        rootHostname: openerHostname,
        rootDomain: openerDomain
    };

    var targetURL = details.targetURL;
    var result = '';

    // https://github.com/gorhill/uBlock/issues/323
    // If popup URL is whitelisted, do not block it
    if ( ub.getNetFilteringSwitch(targetURL) ) {
        result = ub.staticNetFilteringEngine.matchStringExactType(context, targetURL, 'popup');
    }

    // https://github.com/gorhill/uBlock/issues/91
    if ( pageStore ) {
        pageStore.logRequest({
            requestURL: targetURL,
            requestHostname: ub.URI.hostnameFromURI(targetURL),
            requestType: 'popup'
        }, result);
    }

    // Not blocked
    if ( ub.isAllowResult(result) ) {
        return;
    }

    // Blocked

    // It is a popup, block and remove the tab.
    ub.unbindTabFromPageStats(details.targetTabId);
    vAPI.tabs.remove(details.targetTabId);

    return true;
};

vAPI.tabs.registerListeners();

/******************************************************************************/
/******************************************************************************/

// https://github.com/gorhill/httpswitchboard/issues/303
// Some kind of trick going on here:
//   Any scheme other than 'http' and 'https' is remapped into a fake
//   URL which trick the rest of uBlock into being able to process an
//   otherwise unmanageable scheme. uBlock needs web page to have a proper
//   hostname to work properly, so just like the 'chromium-behind-the-scene'
//   fake domain name, we map unknown schemes into a fake '{scheme}-scheme'
//   hostname. This way, for a specific scheme you can create scope with
//   rules which will apply only to that scheme.

ub.normalizePageURL = function(tabId, pageURL) {
    if ( vAPI.isNoTabId(tabId) ) {
        return 'http://behind-the-scene/';
    }
    var uri = this.URI.set(pageURL);
    var scheme = uri.scheme;
    if ( scheme === 'https' || scheme === 'http' ) {
        return uri.normalizedURI();
    }

    var url = 'http://' + scheme + '-scheme/';

    if ( uri.hostname !== '' ) {
        url += uri.hostname + '/';
    }

    return url;
};

/******************************************************************************/

// Create an entry for the tab if it doesn't exist.

ub.bindTabToPageStats = function(tabId, pageURL, context) {
    this.updateBadgeAsync(tabId);

    // https://github.com/gorhill/httpswitchboard/issues/303
    // Normalize page URL
    var normalURL = this.normalizePageURL(tabId, pageURL);

    // Do not create a page store for URLs which are of no interests
    if ( normalURL === '' ) {
        this.unbindTabFromPageStats(tabId);
        return null;
    }

    // Reuse page store if one exists: this allows to guess if a tab is a popup
    var pageStore = this.pageStores[tabId];

    // Tab is not bound
    if ( !pageStore ) {
        return this.pageStores[tabId] = this.PageStore.factory(tabId, normalURL);
    }

    // https://github.com/gorhill/uBlock/issues/516
    // If context if 'beforeRequest', do not rebind
    if ( context === 'beforeRequest' ) {
        return pageStore;
    }

    // Rebind according to context. We rebind even if the URL did not change,
    // as maybe the tab was force-reloaded, in which case the page stats must
    // be all reset.
    pageStore.reuse(normalURL, context);

    return pageStore;
};

ub.unbindTabFromPageStats = function(tabId) {
    //console.debug('uBlock> unbindTabFromPageStats(%d)', tabId);
    var pageStore = this.pageStores[tabId];
    if ( pageStore !== undefined ) {
        pageStore.dispose();
        delete this.pageStores[tabId];
    }
};

/******************************************************************************/

ub.pageUrlFromTabId = function(tabId) {
    var pageStore = this.pageStores[tabId];
    return pageStore ? pageStore.pageURL : '';
};

ub.pageUrlFromPageStats = function(pageStats) {
    if ( pageStats ) {
        return pageStats.pageURL;
    }
    return '';
};

ub.pageStoreFromTabId = function(tabId) {
    return this.pageStores[tabId];
};

/******************************************************************************/

// Permanent page store for behind-the-scene requests. Must never be removed.

ub.pageStores[vAPI.noTabId] = ub.PageStore.factory(
    vAPI.noTabId,
    ub.normalizePageURL(vAPI.noTabId)
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
    var tabIds = Object.keys(ub.pageStores).sort();
    var checkTab = function(tabId) {
        vapiTabs.get(tabId, function(tab) {
            if ( !tab ) {
                //console.error('tab.js> pageStoreJanitor(): stale page store found:', ub.pageUrlFromTabId(tabId));
                ub.unbindTabFromPageStats(tabId);
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
