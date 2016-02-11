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

    baseUrl: 'https://goodblock.gladly.io',

    devConfig: {
        timeMsToSnooze: 6 * 1000,
        timeMsToSleep: 20 * 1000,
    },
    timeMsToSnooze: 97 * 60 * 1000,
    timeMsToPollServer: 30 * 60 * 1000, // 30 minutes
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

    // Begin content support test config.

    // Milliseconds of staying on the same webpage before the Goodblock
    // icon checks if it should appear.
    contentSupportTestAppearDelayMs: 15 * 1000, // 15 seconds

    // Milliseconds after the Goodblock icon appears before we
    // allow another Goodblock icon to appear.
    contentSupportTestAppearanceThrottleMs: 5 * 60 * 1000, // 5 minutes

    // Milliseconds after a user responds to a content support request
    // before we allow another Goodblock icon to appear.
    contentSupportTestResponseThrottleMs: 60 * 60 * 1000, // 60 minutes

    // Milliseconds to wait after a user supports a website before
    // we ask again for that hostname.
    contentSupportTestSupportThrottleMs: 12 * 60 * 60 * 1000, // 12 hours

    // Milliseconds to wait after a user supports a website before
    // we ask again for that hostname.
    contentSupportTestRejectThrottleMs: 5 * 24 * 60 * 60 * 1000, // 5 days

    // End content support test config.

}

/******************************************************************************/

})();
