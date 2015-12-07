/*******************************************************************************

    µBlock - a browser extension to block requests.
    Copyright (C) 2014-2015 The µBlock authors

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

/* global self, µBlock */

/******************************************************************************/

(function(){

/******************************************************************************/

// To store config info.
µBlock.goodblock.config = {

	// DO NOT MODIFY isDev.
	// Instead, override it in goodblock-config-dev.js.
    isDev: false, // Do not modify.

    devConfig: {
        timeMsToSnooze: 6 * 1000,
        timeMsToSleep: 20 * 1000,
    },
    timeMsToSnooze: 97 * 60 * 1000,
    timeMsToPollServer: 60 * 1000 * 15, // 15 minutes
    gladlyHostnames: [
        'gladly.io',
        'blog.gladly.io',
        'goodblock.gladly.io',
        'tab.gladly.io',
        'tabforacause.gladly.io',
        'gladlyads.xyz',
        'goodblock.org',
        'tabforacause.org',
    ],
    gladlyAdUrls: [
        'https://goodblock.gladly.io/app/ad/',
        // Some uncertainty about what we will choose
        // as the final URL.
        'https://gladly.io/app/ad/',
        'https://www.gladly.io/app/ad/',
        'https://goodblock.org/app/ad/',
        'https://www.goodblock.gladly.io/app/ad/',
    ],
}

/******************************************************************************/

})();
