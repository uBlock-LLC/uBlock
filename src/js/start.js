/*******************************************************************************

    µBlock - a browser extension to block requests.
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

    Home: https://github.com/uBlockAdmin/uBlock
*/

/* global publicSuffixList, vAPI, µBlock */

/******************************************************************************/

// Load all: executed once.

µBlock.restart = (() => {

'use strict';

//quickProfiler.start('start.js');

/******************************************************************************/

var µb = µBlock;

/******************************************************************************/

// Final initialization steps after all needed assets are in memory.
// - Initialize internal state with maybe already existing tabs.
// - Schedule next update operation.

const onAllReady = () => {
    // https://github.com/uBlockAdmin/uBlock/issues/184
    // Check for updates not too far in the future.
    µb.assetUpdater.onStart.addEventListener(µb.updateStartHandler.bind(µb));
    µb.assetUpdater.onCompleted.addEventListener(µb.updateCompleteHandler.bind(µb));
    µb.assetUpdater.onAssetUpdated.addEventListener(µb.assetUpdatedHandler.bind(µb));
    µb.assets.onAssetCacheRemoved.addEventListener(µb.assetCacheRemovedHandler.bind(µb));

    // Important: remove barrier to remote fetching, this was useful only
    // for launch time.
    µb.assets.remoteFetchBarrier -= 1;

    //quickProfiler.stop(0);

    vAPI.onLoadAllCompleted();
};

/******************************************************************************/

// Filtering engines dependencies:
// - PSL

const onPSLReady = () => {
    µb.loadFilterLists(onAllReady);
};

/******************************************************************************/

// To bring older versions up to date

const onVersionReady = (lastVersion) => {
    // Whitelist some key scopes by default
    if ( lastVersion.localeCompare('0.8.6.0') < 0 ) {
        µb.netWhitelist = µb.whitelistFromString(
            µb.stringFromWhitelist(µb.netWhitelist) +
            '\n' +
            µb.netWhitelistDefault
        );
        µb.saveWhitelist();
    }
    // https://github.com/gorhill/uBlock/issues/135#issuecomment-96677379
    // `about:loopconversation` is used by Firefox for its Hello service
    if ( lastVersion.localeCompare('0.9.3.5') <= 0 ) {
        µb.netWhitelist = µb.whitelistFromString(
            µb.stringFromWhitelist(µb.netWhitelist) +
            '\n' +
            'loopconversation.about-scheme'
        );
        µb.saveWhitelist();
    }
    if ( lastVersion !== vAPI.app.version ) {
        vAPI.storage.set({ version: vAPI.app.version });
    }
};

/******************************************************************************/

const onSelfieReady = (selfie) => {
    if ( selfie === null || selfie.magic !== µb.systemSettings.selfieMagic ) {
        return false;
    }
    if ( publicSuffixList.fromSelfie(selfie.publicSuffixList) !== true ) {
        return false;
    }
    //console.log('start.js/onSelfieReady: selfie looks good');
    µb.remoteBlacklists = selfie.filterLists;
    µb.staticNetFilteringEngine.fromSelfie(selfie.staticNetFilteringEngine);
    µb.cosmeticFilteringEngine.fromSelfie(selfie.cosmeticFilteringEngine);
    return true;
};

/******************************************************************************/

// https://github.com/uBlockAdmin/uBlock/issues/226
// Whitelist in memory.
// Whitelist parser needs PSL to be ready.
// uBlockAdmin 2014-12-15: not anymore

const onNetWhitelistReady = (netWhitelistRaw) => {
    µb.netWhitelist = µb.whitelistFromString(netWhitelistRaw);
    µb.netWhitelistModifyTime = Date.now();
};

/******************************************************************************/

// User settings are in memory

const onUserSettingsReady = (fetched) => {
    var userSettings = µb.userSettings;

    fromFetch(userSettings, fetched);

    // https://github.com/uBlockAdmin/uBlock/issues/426
    // Important: block remote fetching for when loading assets at launch
    // time.
    µb.assets.autoUpdate = userSettings.autoUpdate;
    µb.assets.autoUpdateDelay = µb.updateAssetsEvery;

    // https://github.com/uBlockAdmin/uBlock/issues/540
    // Disabling local mirroring for the time being
    userSettings.experimentalEnabled = false;
    µb.mirrors.toggle(false /* userSettings.experimentalEnabled */);

    µb.contextMenu.toggle(userSettings.contextMenuEnabled);
    µb.permanentFirewall.fromString(fetched.dynamicFilteringString);
    µb.sessionFirewall.assign(µb.permanentFirewall);

    // Remove obsolete setting
    delete userSettings.logRequests;
    vAPI.storage.remove('logRequests');
};

/******************************************************************************/

// Housekeeping, as per system setting changes

const onSystemSettingsReady = (fetched) => {
    var mustSaveSystemSettings = false;
    if ( fetched.compiledMagic !== µb.systemSettings.compiledMagic ) {
        µb.assets.purge(/^cache:\/\/compiled-/);
        mustSaveSystemSettings = true;
    }
    if ( fetched.selfieMagic !== µb.systemSettings.selfieMagic ) {
        mustSaveSystemSettings = true;
    }
    if ( mustSaveSystemSettings ) {
        fetched.selfie = null;
        µb.destroySelfie();
        vAPI.storage.preferences.set(µb.systemSettings, µb.noopFunc);
    }
};

/******************************************************************************/

const onUserFiltersReady = (userFilters) => {
    µb.saveUserFilters(userFilters); // we need this because of migration
};

const onFirstFetchReady = (fetched) => {

    // Order is important -- do not change:
    onInstalled();
    onSystemSettingsReady(fetched);
    fromFetch(µb.localSettings, fetched);
    onUserSettingsReady(fetched);
    fromFetch(µb.restoreBackupSettings, fetched);
    onNetWhitelistReady(fetched.netWhitelist);
    onUserFiltersReady(fetched.userFilters);
    onVersionReady(fetched.version);

    // If we have a selfie, skip loading PSL, filters
    if ( onSelfieReady(fetched.selfie) ) {
        onAllReady();
        return;
    }

    µb.loadPublicSuffixList(onPSLReady);
};

const onInstalled = () => {

    var onVersionRead = function(store) {

        var lastVersion = store.extensionLastVersion || '0.0.0.0';

        var firstInstall = lastVersion === '0.0.0.0';

        if(!firstInstall) {
            return;
        }
        var onDataReceived = function(data) {
            entries = data.stats || {userId: µBlock.stats.generateUserId(),totalPings: 0 };
            vAPI.storage.set({ 'stats': entries });
            vAPI.tabs.open({
                url: µBlock.donationUrl+"?u=" + entries.userId + "&lg=" + navigator.language,
                select: true,
                index: -1
            });
        }
        vAPI.storage.get('stats',onDataReceived);
    };
    vAPI.storage.get('extensionLastVersion', onVersionRead);
};

/******************************************************************************/

const onPrefFetchReady = (fetched) => {
    fetched.userFilters = fetched.userFilters || fetched["cached_asset_content://assets/user/filters.txt"];
    vAPI.storage.get({"selfie": null}, function(res) {
        fetched["selfie"] = res["selfie"];
        onFirstFetchReady(fetched);
    });
};

/******************************************************************************/

const toFetch = (from, fetched) => {
    for ( var k in from ) {
        if ( from.hasOwnProperty(k) === false ) {
            continue;
        }
        fetched[k] = from[k];
    }
};

const fromFetch = (to, fetched) => {
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

return () => {
    µb.assets.remoteFetchBarrier += 1;

    var fetchableProps = {
        'compiledMagic': '',
        'dynamicFilteringString': '',
        'lastRestoreFile': '',
        'lastRestoreTime': 0,
        'lastBackupFile': '',
        'lastBackupTime': 0,
        'netWhitelist': '',
        'userFilters': '',
        'cached_asset_content://assets/user/filters.txt': '',
        'selfie': null,
        'selfieMagic': '',
        'version': '0.0.0.0'
    };
    toFetch(µb.localSettings, fetchableProps);
    toFetch(µb.userSettings, fetchableProps);
    toFetch(µb.restoreBackupSettings, fetchableProps);
    vAPI.storage.preferences.get(fetchableProps, onPrefFetchReady);
};

})();

/******************************************************************************/

µBlock.restart();
