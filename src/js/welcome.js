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

    Home: https://github.com/chrisaljoudi/uBlock
*/

/* global punycode, vAPI, uDom */

/******************************************************************************/

(function() {

'use strict';

/******************************************************************************/

var mainWelcomeText = vAPI.i18n('welcomeMain');
var introText = vAPI.i18n('intro');
var point1Text = vAPI.i18n('welcome1');
var point2Text = vAPI.i18n('welcome2');
var point3Text = vAPI.i18n('welcome3');
var point4Text = vAPI.i18n('welcome4');

/******************************************************************************/

var messager = vAPI.messaging.channel('welcome.js');

/******************************************************************************/

var populatePage = function() {
    uDom('#welcome-message').text(mainWelcomeText);
    uDom('#intro').text(introText);
    uDom('#point1').text(point1Text);
    uDom('#point2').text(point2Text);
    uDom('#point3').text(point3Text);
    uDom('#point4').text(point4Text);
};

// populate the text once the page is fully rendered
uDom.onLoad(function () {
    populatePage();
});

})();