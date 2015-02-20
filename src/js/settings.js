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

/* global vAPI, uDom */

/******************************************************************************/

(function() {

'use strict';

/******************************************************************************/

var messager = vAPI.messaging.channel('settings.js');

/******************************************************************************/

var exportToFile = function() {
    var onUserDataReady = function(userData) {
        if (!userData) {
            return;
        }
        var now = new Date();
        var filename = getBrowser() + vAPI.i18n('aboutBackupFilename')
            .replace('{{datetime}}', now.toLocaleString())
            .replace(/ +/g, '_');
        vAPI.download({
            'url': 'data:text/plain;charset=utf-8,' + encodeURIComponent(JSON.stringify(userData, null, '  ')),
            'filename': filename
        });
    };

    messager.send({ what: 'getUserData' }, onUserDataReady);
};

var getBrowser = function(){
    var userAgent = navigator.userAgent;

    if(userAgent.indexOf("Chrome") > -1){
        return "(Google Chrome) ";
    }
    if(userAgent.indexOf("Safari") > -1){
        return "(Apple Safari) ";
    }
    if(userAgent.indexOf("Firefox") > -1){
        return "(Mozilla Firefox) ";
    }

    return "";
}

/******************************************************************************/

var handleImportFilePicker = function() {
    var fileReaderOnLoadHandler = function() {
        var userData;
        try {
            userData = JSON.parse(this.result);
            if ( typeof userData !== 'object' ) {
                throw 'Invalid';
            }
            if ( typeof userData.userSettings !== 'object' ) {
                throw 'Invalid';
            }
            if ( typeof userData.netWhitelist !== 'string' ) {
                throw 'Invalid';
            }
            if ( typeof userData.filterLists !== 'object' ) {
                throw 'Invalid';
            }
        }
        catch (e) {
            userData = undefined;
        }
        if ( userData === undefined ) {
            window.alert(vAPI.i18n('aboutRestoreDataError'));
            return;
        }
        var time = new Date(userData.timeStamp);
        var msg = vAPI.i18n('aboutRestoreDataConfirm')
            .replace('{{time}}', time.toLocaleString());
        var proceed = window.confirm(msg);
        if ( proceed ) {
            messager.send({ what: 'restoreUserData', userData: userData });
        }
    };

    var file = this.files[0];
    if ( file === undefined || file.name === '' ) {
        return;
    }
    if ( file.type.indexOf('text') !== 0 ) {
        return;
    }
    var fr = new FileReader();
    fr.onload = fileReaderOnLoadHandler;
    fr.readAsText(file);
};

/******************************************************************************/

var startImportFilePicker = function() {
    var input = document.getElementById('restoreFilePicker');
    // Reset to empty string, this will ensure an change event is properly
    // triggered if the user pick a file, even if it is the same as the last
    // one picked.
    input.value = '';
    input.click();
};

/******************************************************************************/

var resetUserData = function() {
    var msg = vAPI.i18n('aboutResetDataConfirm');
    var proceed = window.confirm(msg);
    if ( proceed ) {
        messager.send({ what: 'resetUserData' });
    }
};

/******************************************************************************/

var changeUserSettings = function(name, value) {
    messager.send({
        what: 'userSettings',
        name: name,
        value: value
    });
};

/******************************************************************************/

// TODO: use data-* to declare simple settings

var onUserSettingsReceived = function(details) {
    uDom('#collapse-blocked')
        .prop('checked', details.collapseBlocked === true)
        .on('change', function(){
            changeUserSettings('collapseBlocked', this.checked);
        });

    uDom('#icon-badge')
        .prop('checked', details.showIconBadge === true)
        .on('change', function(){
            changeUserSettings('showIconBadge', this.checked);
        });

    uDom('#context-menu-enabled')
        .prop('checked', details.contextMenuEnabled === true)
        .on('change', function(){
            changeUserSettings('contextMenuEnabled', this.checked);
        });

    uDom('#advanced-user-enabled')
        .prop('checked', details.advancedUserEnabled === true)
        .on('change', function(){
            changeUserSettings('advancedUserEnabled', this.checked);
        });

    uDom('#experimental-enabled')
        .prop('checked', details.experimentalEnabled === true)
        .on('change', function(){
            changeUserSettings('experimentalEnabled', this.checked);
        });

    uDom('#export').on('click', exportToFile);
    uDom('#import').on('click', startImportFilePicker);
    uDom('#reset').on('click', resetUserData);
    uDom('#restoreFilePicker').on('change', handleImportFilePicker);
};

/******************************************************************************/

uDom.onLoad(function() {
    messager.send({ what: 'userSettings' }, onUserSettingsReceived);
});

/******************************************************************************/

})();
