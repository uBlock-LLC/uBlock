/*******************************************************************************

    µBlock - a browser extension to block requests.
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

    Home: https://github.com/uBlockAdmin/uBlock
*/

/* jshint multistr: true */
/* global vAPI, HTMLDocument */

/******************************************************************************/

// Injected into content pages

/******************************************************************************/

(function() {

'use strict';

/******************************************************************************/

// https://github.com/uBlockAdmin/uBlock/issues/464
if ( document instanceof HTMLDocument === false ) {
    //console.debug('contentscript-start.js > not a HTLMDocument');
    return false;
}

// Because in case
if ( !vAPI ) {
    //console.debug('contentscript-start.js > vAPI not found');
    return;
}

// https://github.com/uBlockAdmin/uBlock/issues/456
// Already injected?
if ( vAPI.contentscriptStartInjected ) {
    //console.debug('contentscript-start.js > content script already injected');
    return;
}
vAPI.contentscriptStartInjected = true;
vAPI.styles = vAPI.styles || [];
vAPI.userStyles = vAPI.userStyles || [];
vAPI.injectedProcedureCosmeticFilters = vAPI.injectedProcedureCosmeticFilters || [];
vAPI.shouldObserveAttributes = false;
vAPI.shouldObserveCharacterData = false;


/******************************************************************************/

var localMessager = vAPI.messaging.channel('contentscript-start.js');

/******************************************************************************/
/******************************************************************************/

// Domain-based ABP cosmetic filters.
// These can be inserted before the DOM is loaded.

var cosmeticFilters = function(details) {
    let hide = details.cosmeticHide;
    let userCss = details.cosmeticUserCss;
    let injectedHide = details.injectedSelectors;
    let injectedUserCss = details.injectedUserCss;

    let hideProcedureFilters = details.procedureHide || [];
    let highGenerics = details.highGenerics;
    vAPI.donthideCosmeticFilters = details.cosmeticDonthide || [];
    vAPI.cosmeticUserCss = details.cosmeticUserCss;
    vAPI.hideCosmeticFilters = details.cosmeticHide;
    vAPI.injectedSelectors = details.injectedSelectors;
    vAPI.hideProcedureFilters = hideProcedureFilters;
    vAPI.shouldObserveAttributes = details.shouldObserveAttributes;
    vAPI.shouldObserveCharacterData = details.shouldObserveCharacterData;
    let highGenericsArray = [];
    if(highGenerics) {
        if(highGenerics.hideLow.length > 0) {
            highGenericsArray.push(...highGenerics.hideLow);
        }
        if(highGenerics.hideMedium.length > 0) {
            highGenericsArray.push(...highGenerics.hideMedium);
        }
        if(highGenerics.hideHigh.length > 0) {
            highGenericsArray.push(...highGenerics.hideHigh);
        }
        if(highGenericsArray.length > 0) {
            vAPI.userStyleSheet.addCssRule(highGenericsArray.join(',\n') + '\n{display:none !important;}');
            vAPI.styles.push(highGenericsArray.join(',\n'));
        }
    }
    if(userCss.length !== 0) {
        vAPI.userStyleSheet.addCssRule(userCss.join(',\n'));
        vAPI.userStyles.push(userCss.join(',\n'));
    }
    if(injectedUserCss.length !== 0) {
        vAPI.userStyles.push(injectedUserCss.join(',\n'));
    }
    if ( hide.length !== 0 ) {
        vAPI.userStyleSheet.addCssRule(hide.join(',\n') + '\n{display:none !important;}');
        vAPI.styles.push(hide.join(',\n'));
        hideElements(hide.concat(highGenericsArray).join(',\n'));
    }
    if(injectedHide.length !== 0) {
        vAPI.styles.push(injectedHide.join(',\n'));
    }
    
};

var netFilters = function(details) {
   var text = details.netHide.join(',\n');
   var css = details.netCollapse ?
        '\n{display:none !important;}' :
        '\n{visibility:hidden !important;}';
   vAPI.userStyleSheet.addCssRule(text + css);
};

var filteringHandler = function(details) {
    var styleTagCount = vAPI.styles.length;

    vAPI.skipCosmeticFiltering = !details || details.skipCosmeticFiltering;
    if ( details ) {
        if ( details.cosmeticHide.length !== 0 || details.cosmeticDonthide.length !== 0 || details.procedureHide !== 0 || details.cosmeticUserCss !== 0) {
            cosmeticFilters(details);
        }
        if ( details.netHide.length !== 0 ) {
            netFilters(details);
        }
    }

    // This is just to inform the background process that cosmetic filters were
    // actually injected.
    if ( vAPI.styles.length !== styleTagCount ) {
        localMessager.send({ what: 'cosmeticFiltersActivated' });
    }

    // https://github.com/uBlockAdmin/uBlock/issues/587
    // If no filters were found, maybe the script was injected before uBlock's
    // process was fully initialized. When this happens, pages won't be
    // cleaned right after browser launch.
    vAPI.contentscriptStartInjected = details && details.ready;

    // The port will never be used again at this point, disconnecting allows
    // the browser to flush this script from memory.
    localMessager.close();
};

var hideElements = function(selectors) {
    if ( document.body === null ) {
        return;
    }
    // https://github.com/uBlockAdmin/uBlock/issues/158
    // Using CSSStyleDeclaration.setProperty is more reliable
    var elems = document.querySelectorAll(selectors);
    var i = elems.length;
    while ( i-- ) {
        elems[i].style.setProperty('display', 'none', 'important');
        vAPI.hiddenNodesMutation.addNodeToObserver(elems[i]);
    }
};

var url = window.location.href;
localMessager.send(
    {
        what: 'retrieveDomainCosmeticSelectors',
        pageURL: url,
        locationURL: url,
        procedureSelectorsOnly: false
    },
    filteringHandler
);

/******************************************************************************/
/******************************************************************************/

})();

/******************************************************************************/
