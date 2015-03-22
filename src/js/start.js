/*******************************************************************************

    uBlock - a browser extension to block requests.
    Copyright (C) 2014-2015 Raymond Hill

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

/* global publicSuffixList, vAPI, uBlock */

/******************************************************************************/

// Load all: executed once.

uBlock.restart = (function() {

'use strict';

//quickProfiler.start('start.js');

/******************************************************************************/

var ub = uBlock;

/******************************************************************************/

// Final initialization steps after all needed assets are in memory.
// - Initialize internal state with maybe already existing tabs.
// - Schedule next update operation.

var onAllReady = function() {
    // https://github.com/gorhill/uBlock/issues/184
    // Check for updates not too far in the future.
    ub.assetUpdater.onStart.addEventListener(ub.updateStartHandler.bind(ub));
    ub.assetUpdater.onCompleted.addEventListener(ub.updateCompleteHandler.bind(ub));
    ub.assetUpdater.onAssetUpdated.addEventListener(ub.assetUpdatedHandler.bind(ub));
    ub.assets.onAssetCacheRemoved.addEventListener(ub.assetCacheRemovedHandler.bind(ub));

    // Important: remove barrier to remote fetching, this was useful only
    // for launch time.
    ub.assets.remoteFetchBarrier -= 1;

    //quickProfiler.stop(0);

    vAPI.onLoadAllCompleted();
};

/******************************************************************************/

// Filtering engines dependencies:
// - PSL

var onPSLReady = function() {
    ub.loadFilterLists(onAllReady);
};

/******************************************************************************/

// To bring older versions up to date

var onVersionReady = function(lastVersion) {
    // Whitelist some key scopes by default
    if ( lastVersion.localeCompare('0.8.6.0') < 0 ) {
        ub.netWhitelist = ub.whitelistFromString(
            ub.stringFromWhitelist(ub.netWhitelist) +
            '\n' +
            ub.netWhitelistDefault
        );
        ub.saveWhitelist();
    }
    if ( lastVersion !== vAPI.app.version ) {
        vAPI.storage.set({ version: vAPI.app.version });
    }
};

/******************************************************************************/

var onSelfieReady = function(selfie) {
    if ( selfie === null || selfie.magic !== ub.systemSettings.selfieMagic ) {
        return false;
    }
    if ( publicSuffixList.fromSelfie(selfie.publicSuffixList) !== true ) {
        return false;
    }
    //console.log('start.js/onSelfieReady: selfie looks good');
    ub.remoteBlacklists = selfie.filterLists;
    ub.staticNetFilteringEngine.fromSelfie(selfie.staticNetFilteringEngine);
    ub.cosmeticFilteringEngine.fromSelfie(selfie.cosmeticFilteringEngine);
    return true;
};

/******************************************************************************/

// https://github.com/gorhill/uBlock/issues/226
// Whitelist in memory.
// Whitelist parser needs PSL to be ready.
// gorhill 2014-12-15: not anymore

var onNetWhitelistReady = function(netWhitelistRaw) {
    ub.netWhitelist = ub.whitelistFromString(netWhitelistRaw);
    ub.netWhitelistModifyTime = Date.now();
};

/******************************************************************************/

// User settings are in memory

var onUserSettingsReady = function(fetched) {
    var userSettings = ub.userSettings;

    fromFetch(userSettings, fetched);

    // https://github.com/gorhill/uBlock/issues/426
    // Important: block remote fetching for when loading assets at launch
    // time.
    ub.assets.autoUpdate = userSettings.autoUpdate;
    ub.assets.autoUpdateDelay = ub.updateAssetsEvery;

    // https://github.com/gorhill/uBlock/issues/540
    // Disabling local mirroring for the time being
    userSettings.experimentalEnabled = false;
    ub.mirrors.toggle(false /* userSettings.experimentalEnabled */);

    ub.contextMenu.toggle(userSettings.contextMenuEnabled);
    ub.permanentFirewall.fromString(userSettings.dynamicFilteringString);
    ub.sessionFirewall.assign(ub.permanentFirewall);

    // Remove obsolete setting
    delete userSettings.logRequests;
    ub.XAL.keyvalRemoveOne('logRequests');
};

/******************************************************************************/

// Housekeeping, as per system setting changes

var onSystemSettingsReady = function(fetched) {
    var mustSaveSystemSettings = false;
    if ( fetched.compiledMagic !== ub.systemSettings.compiledMagic ) {
        ub.assets.purge(/^cache:\/\/compiled-/);
        mustSaveSystemSettings = true;
    }
    if ( fetched.selfieMagic !== ub.systemSettings.selfieMagic ) {
        mustSaveSystemSettings = true;
    }
    if ( mustSaveSystemSettings ) {
        fetched.selfie = null;
        ub.destroySelfie();
        vAPI.storage.set(ub.systemSettings, ub.noopFunc);
    }
};

/******************************************************************************/

var onFirstFetchReady = function(fetched) {
    // Order is important -- do not change:
    onSystemSettingsReady(fetched);
    fromFetch(ub.localSettings, fetched);
    onUserSettingsReady(fetched);
    fromFetch(ub.restoreBackupSettings, fetched);
    onNetWhitelistReady(fetched.netWhitelist);
    onVersionReady(fetched.version);

    // If we have a selfie, skip loading PSL, filters
    if ( onSelfieReady(fetched.selfie) ) {
        onAllReady();
        return;
    }

    ub.loadPublicSuffixList(onPSLReady);
};

/******************************************************************************/

var toFetch = function(from, fetched) {
    for ( var k in from ) {
        if ( from.hasOwnProperty(k) === false ) {
            continue;
        }
        fetched[k] = from[k];
    }
};

var fromFetch = function(to, fetched) {
    for ( var k in to ) {
        if ( to.hasOwnProperty(k) === false ) {
            continue;
        }
        if ( fetched.hasOwnProperty(k) === false ) {
            continue;
        }
        to[k] = fetched[k];
    }
};

/******************************************************************************/

return function() {
    // Forbid remote fetching of assets
    ub.assets.remoteFetchBarrier += 1;

    var fetchableProps = {
        'compiledMagic': '',
        'lastRestoreFile': '',
        'lastRestoreTime': 0,
        'lastBackupFile': '',
        'lastBackupTime': 0,
        'netWhitelist': '',
        'selfie': null,
        'selfieMagic': '',
        'version': '0.0.0.0'
    };

    toFetch(ub.localSettings, fetchableProps);
    toFetch(ub.userSettings, fetchableProps);
    toFetch(ub.restoreBackupSettings, fetchableProps);

    vAPI.storage.get(fetchableProps, onFirstFetchReady);
};

/******************************************************************************/

})();

/******************************************************************************/

uBlock.restart();
