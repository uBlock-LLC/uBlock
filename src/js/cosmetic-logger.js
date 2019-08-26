/*******************************************************************************

    uBlock - a browser extension to block requests.
    Copyright (C) 2015 Raymond Hill

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

/* global vAPI, HTMLDocument */

/******************************************************************************/

(function() {

'use strict';

/******************************************************************************/

// https://github.com/gorhill/uBlock/issues/464
if ( document instanceof HTMLDocument === false ) {
    //console.debug('cosmetic-logger.js > not a HTLMDocument');
    return;
}

// This can happen
if ( !vAPI ) {
    //console.debug('cosmetic-logger.js > vAPI not found');
    return;
}

/******************************************************************************/

var loggedSelectors = vAPI.loggedSelectors || {};
var loggedUserStyle = vAPI.loggedUserStyle || {};

var injectedSelectors = [];
var reProperties = /\s*\{[^}]+\}\s*/;
var i;
var styles = vAPI.styles || [];
var injectedProcedureSelector = vAPI.injectedProcedureCosmeticFilters || [];
let injectedUserStyle = vAPI.userStyles || [];

i = styles.length;
while ( i-- ) {
    //injectedSelectors = injectedSelectors.concat(styles[i].textContent.replace(reProperties, '').split(/\s*,\n\s*/));
    injectedSelectors = injectedSelectors.concat(styles[i].replace(reProperties, '').split(/\s*,\n\s*/));
}

if ( injectedSelectors.length === 0 ) {
    return;
}

var matchedSelectors = [];
var matchedUserStyle = [];

var selector;

i = injectedSelectors.length;
while ( i-- ) {
    selector = injectedSelectors[i];
    if ( loggedSelectors.hasOwnProperty(selector) ) {
        continue;
    }
    if ( document.querySelector(selector) === null ) {
        continue;
    }
    loggedSelectors[selector] = true;
    matchedSelectors.push(selector);
}

for (let selector of injectedProcedureSelector) {
    if ( loggedSelectors.hasOwnProperty(selector) ) {
        continue;
    }
    loggedSelectors[selector] = true;
    matchedSelectors.push(selector);
}

for (let selector of injectedUserStyle) {
    if ( loggedUserStyle.hasOwnProperty(selector)) {
        continue;
    }
    loggedUserStyle[selector] = true;
    matchedUserStyle.push(selector);
}

vAPI.loggedSelectors = loggedSelectors;
vAPI.loggedUserStyle = loggedUserStyle;

/******************************************************************************/

var localMessager = vAPI.messaging.channel('cosmetic-*.js');

localMessager.send({
    what: 'logCosmeticFilteringData',
    pageURL: window.location.href,
    matchedSelectors: matchedSelectors,
    matchedUserStyle: matchedUserStyle
}, function() {
    localMessager.close();
});

/******************************************************************************/

})();

/******************************************************************************/
