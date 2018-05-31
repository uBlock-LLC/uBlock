/*******************************************************************************

    µBlock - a browser extension to block requests.
    Copyright (C) 2014 The µBlock authors

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

'use strict';

/******************************************************************************/

µBlock.migrateLegacyData = (function() {
    
    let µb = µBlock;

    let migrateLegacyData = function(callback) {

        let storeKeyValue = function(details, callback) {
            let bin = {};
            bin[details.key] = JSON.parse(details.value);
            vAPI.storage.set(bin, callback);
        };

        let migrateNextDataItem = function() {
            self.browser.runtime.sendMessage({ what: 'getNextMigrateItem' }, response => {
                if ( response.key === undefined ) {
                    return callback();
                }
                storeKeyValue(response, migrateNextDataItem);
            });
        };

        self.browser.storage.local.get('dataMigrateDone', bin => {
            if ( bin && bin.dataMigrateDone ) {
                self.browser.runtime.sendMessage({ what: 'dataMigrateDone' });
                return callback();
            }
            self.browser.storage.local.set({ dataMigrateDone: true });
            migrateNextDataItem();
        });
    };

    return migrateLegacyData;
  
})();


/******************************************************************************/
