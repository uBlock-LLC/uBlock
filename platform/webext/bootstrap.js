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

const hostName = 'ublock';
const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
const {Services} = Cu.import('resource://gre/modules/Services.jsm', null);

function startup({ webExtension }) {
    webExtension.startup().then(api => {
        let { browser } = api,
            dataMigrator;
        let onMessage = function(message, sender, callback) {
            if ( message.what === 'getNextMigrateItem' ) {
                dataMigrator = dataMigrator || getDataMigrate();
                dataMigrator.sendNextItemData((key, value) => {
                    if ( key === undefined ) {
                        dataMigrator.closeDbConn();
                        dataMigrator = undefined;
                        browser.runtime.onMessage.removeListener(onMessage);
                    }
                    callback({ key: key, value: JSON.stringify(value) });
                });
                return true;
            }
            if ( message.what === 'dataMigrateDone' ) {
                browser.runtime.onMessage.removeListener(onMessage);
            }
            if ( typeof callback === 'function' ) {
                callback();
            }
        };
        browser.runtime.onMessage.addListener(onMessage);
    });
}

function shutdown() {
}

function install() {
}

function uninstall() {
}

var SQLite = {
    
    open: function() {
        
        var path = Services.dirsvc.get('ProfD', Ci.nsIFile);
        path.append('extension-data');
        path.append(hostName + '.sqlite');
        if ( !path.exists() || !path.isFile() ) {
            return null;
        }
        this.db = Services.storage.openDatabase(path);
        return this.db;
    },

    close: function() {
        SQLite.db.asyncClose();
    },

    run: function(query, values, callback) {

        if ( !this.db ) {
           if ( this.open() === null ) {
                callback({});
                return;
            }
        }
        
        var result = {};
        query = this.db.createAsyncStatement(query);

        if ( Array.isArray(values) && values.length ) {
            var i = values.length;

            while ( i-- ) {
                query.bindByIndex(i, values[i]);
            }
        }
        
        query.executeAsync({
            handleResult: function(rows) {
                if ( !rows || typeof callback !== 'function' ) {
                    return;
                }

                var row;

                while ( row = rows.getNextRow() ) {
                    result[row.getResultByIndex(0)] = row.getResultByIndex(1);
                }
            },
            handleCompletion: function(reason) {
                if ( typeof callback === 'function' && reason === 0 ) {
                    callback(result);
                }
            },
            handleError: function(error) {
                if ( typeof callback === 'function' && reason === 0 ) {
                    callback();
                }
                result = null;
                if ( error.result.toString() === '11' ) {
                    close();
                }
            }
        });
    }
};

var getDataMigrate = function() {

    var legacyData = null;
    var legacyDataKeys = null;

    var fetchLegacyData = function(cb) {
        var values = [];

        var prepareResult = function(result) {
            
            if ( result === undefined ) {
                cb();
                return;
            }

            var key;
            for ( key in result ) {
                result[key] = JSON.parse(result[key]);
            }

            legacyData = result;
            legacyDataKeys = Object.keys(result);
            
            var key = legacyDataKeys.pop();
            var value = legacyData[key];
            cb({ key: key, value: value });
        };
        
        SQLite.run(
            'SELECT * FROM settings',
            values,
            prepareResult
        );     
    };
   
    var sendNextItemData = function(callback) {
        
        if(!legacyData) {
            fetchLegacyData( bin => {
                callback(bin.key, bin.value);
            });
            return;
        }
        else {
            var key = legacyDataKeys.pop();
            var value = legacyData[key];
            callback(key,value);
            return;
        }
    };

    var closeDbConn = function() {
        SQLite.close();
    };

    return {
        sendNextItemData: sendNextItemData,
        closeDbConn: closeDbConn
    };
}



/******************************************************************************/
