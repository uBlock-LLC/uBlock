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

/* jshint bitwise: false, esnext: true */
/* global µBlock */

// Older Safari throws an exception for const when it's used with 'use strict'.
// 'use strict';

/******************************************************************************/

µBlock.staticNetFilteringEngine = (function(){

/******************************************************************************/

var µb = µBlock;

// fedcba9876543210
// |      |   | |||
// |      |   | |||
// |      |   | |||
// |      |   | |||
// |      |   | ||+---- bit 0: [BlockAction | AllowAction]
// |      |   | |+---- bit 1: `important`
// |      |   | +---- bit 2-3: party [0 - 3]
// |      |   +---- bit 4-7: type [0 - 15]
// |      +---- bit 8-15: unused
// +---- bit 15: never use! (to ensure valid unicode character)

const BlockAction = 0 << 0;
const AllowAction = 1 << 0;
const ToggleAction = BlockAction ^ AllowAction;

const Important = 1 << 1;

const AnyParty = 0 << 2;
const FirstParty = 1 << 2;
const ThirdParty = 2 << 2;

const AnyType = 1 << 4;
var typeNameToTypeValue = {
        'stylesheet':  2 << 4,
             'image':  3 << 4,
            'object':  4 << 4,
            'script':  5 << 4,
    'xmlhttprequest':  6 << 4,
         'sub_frame':  7 << 4,
             'other':  8 << 4,
'cosmetic-filtering': 13 << 4,
     'inline-script': 14 << 4,
             'popup': 15 << 4
};
var typeOtherToTypeValue = typeNameToTypeValue.other;

const BlockAnyTypeAnyParty = BlockAction | AnyType | AnyParty;
const BlockAnyType = BlockAction | AnyType;
const BlockAnyParty = BlockAction | AnyParty;

const AllowAnyTypeAnyParty = AllowAction | AnyType | AnyParty;
const AllowAnyType = AllowAction | AnyType;
const AllowAnyParty = AllowAction | AnyParty;

var pageHostname = ''; // short-lived register

var reIgnoreEmpty = /^\s+$/;
var reIgnoreComment = /^\[|^!/;
var reHostnameRule = /^[0-9a-z][0-9a-z.-]+[0-9a-z]$/;
var reHostnameToken = /^[0-9a-z]+/g;
var reGoodToken = /[%0-9a-z]{2,}/g;
var reURLPostHostnameAnchors = /[\/?#]/;

// ABP filters: https://adblockplus.org/en/filters
// regex tester: http://regex101.com/

/******************************************************************************/

var histogram = function() {};
/*
histogram = function(label, categories) {
    var h = [],
        categoryBucket;
    for ( var k in categories ) {
        // No need for hasOwnProperty() here: there is no prototype chain.
        categoryBucket = categories[k];
        for ( var kk in categoryBucket ) {
            // No need for hasOwnProperty() here: there is no prototype chain.
            filterBucket = categoryBucket[kk];
            h.push({
                k: k.charCodeAt(0).toString(2) + ' ' + kk,
                n: filterBucket instanceof FilterBucket ? filterBucket.filters.length : 1
            });
        }
    }

    console.log('Histogram %s', label);

    var total = h.length;
    h.sort(function(a, b) { return b.n - a.n; });

    // Find indices of entries of interest
    var target = 2;
    for ( var i = 0; i < total; i++ ) {
        if ( h[i].n === target ) {
            console.log('\tEntries with only %d filter(s) start at index %s (key = "%s")', target, i, h[i].k);
            target -= 1;
        }
    }

    h = h.slice(0, 50);

    h.forEach(function(v) {
        console.log('\tkey=%s  count=%d', v.k, v.n);
    });
    console.log('\tTotal buckets count: %d', total);
};
*/
/******************************************************************************/

// Could be replaced with encodeURIComponent/decodeURIComponent,
// which seems faster on Firefox.
var encode = JSON.stringify;
var decode = JSON.parse;

var cachedParseInt = parseInt;

var atoi = function(s) {
    return cachedParseInt(s, 10);
};

var isFirstParty = function(firstPartyDomain, hostname) {
    if ( hostname.slice(0 - firstPartyDomain.length) !== firstPartyDomain ) {
        return false;
    }
    // Be sure to not confuse 'example.com' with 'anotherexample.com'
    var c = hostname.charAt(hostname.length - firstPartyDomain.length - 1);
    return c === '.' || c === '';
};

/*******************************************************************************

Filters family tree:

- plain (no wildcard)
  - anywhere
    - no hostname
    - specific hostname
  - anchored at start
    - no hostname
    - specific hostname
  - anchored at end
    - no hostname
    - specific hostname
  - anchored within hostname
    - no hostname
    - specific hostname (not implemented)

- one wildcard
  - anywhere
    - no hostname
    - specific hostname
  - anchored at start
    - no hostname
    - specific hostname
  - anchored at end
    - no hostname
    - specific hostname
  - anchored within hostname
    - no hostname (not implemented)
    - specific hostname (not implemented)

- more than one wildcard
  - anywhere
    - no hostname
    - specific hostname
  - anchored at start
    - no hostname
    - specific hostname
  - anchored at end
    - no hostname
    - specific hostname
  - anchored within hostname
    - no hostname (not implemented)
    - specific hostname (not implemented)

*/

/******************************************************************************/

var FilterPlain = function(s, tokenBeg) {
    this.s = s;
    this.tokenBeg = tokenBeg;
};

FilterPlain.prototype.match = function(url, tokenBeg) {
    return url.substr(tokenBeg - this.tokenBeg, this.s.length) === this.s;
};

FilterPlain.prototype.fid = 'a';

FilterPlain.prototype.toString = function() {
    return this.s;
};

FilterPlain.prototype.toSelfie = function() {
    return this.s + '\t' +
           this.tokenBeg;
};

FilterPlain.fromSelfie = function(s) {
    var pos = s.indexOf('\t');
    return new FilterPlain(s.slice(0, pos), atoi(s.slice(pos + 1)));
};

/******************************************************************************/

var FilterPlainHostname = function(s, tokenBeg, hostname) {
    this.s = s;
    this.tokenBeg = tokenBeg;
    this.hostname = hostname;
};

FilterPlainHostname.prototype.match = function(url, tokenBeg) {
    return pageHostname.slice(-this.hostname.length) === this.hostname &&
           url.substr(tokenBeg - this.tokenBeg, this.s.length) === this.s;
};

FilterPlainHostname.prototype.fid = 'ah';

FilterPlainHostname.prototype.toString = function() {
    return this.s + '$domain=' + this.hostname;
};

FilterPlainHostname.prototype.toSelfie = function() {
    return this.s + '\t' +
           this.tokenBeg + '\t' +
           this.hostname;
};

FilterPlainHostname.fromSelfie = function(s) {
    var args = s.split('\t');
    return new FilterPlainHostname(args[0], atoi(args[1]), args[2]);
};

/******************************************************************************/

var FilterPlainPrefix0 = function(s) {
    this.s = s;
};

FilterPlainPrefix0.prototype.match = function(url, tokenBeg) {
    return url.substr(tokenBeg, this.s.length) === this.s;
};

FilterPlainPrefix0.prototype.fid = '0a';

FilterPlainPrefix0.prototype.toString = function() {
    return this.s;
};

FilterPlainPrefix0.prototype.toSelfie = function() {
    return this.s;
};

FilterPlainPrefix0.fromSelfie = function(s) {
    return new FilterPlainPrefix0(s);
};

/******************************************************************************/

var FilterPlainPrefix0Hostname = function(s, hostname) {
    this.s = s;
    this.hostname = hostname;
};

FilterPlainPrefix0Hostname.prototype.match = function(url, tokenBeg) {
    return pageHostname.slice(-this.hostname.length) === this.hostname &&
           url.substr(tokenBeg, this.s.length) === this.s;
};

FilterPlainPrefix0Hostname.prototype.fid = '0ah';

FilterPlainPrefix0Hostname.prototype.toString = function() {
    return this.s + '$domain=' + this.hostname;
};

FilterPlainPrefix0Hostname.prototype.toSelfie = function() {
    return this.s + '\t' +
           this.hostname;
};

FilterPlainPrefix0Hostname.fromSelfie = function(s) {
    var pos = s.indexOf('\t');
    return new FilterPlainPrefix0Hostname(s.slice(0, pos), s.slice(pos + 1));
};

/******************************************************************************/

var FilterPlainPrefix1 = function(s) {
    this.s = s;
};

FilterPlainPrefix1.prototype.match = function(url, tokenBeg) {
    return url.substr(tokenBeg - 1, this.s.length) === this.s;
};

FilterPlainPrefix1.prototype.fid = '1a';

FilterPlainPrefix1.prototype.toString = function() {
    return this.s;
};

FilterPlainPrefix1.prototype.toSelfie = function() {
    return this.s;
};

FilterPlainPrefix1.fromSelfie = function(s) {
    return new FilterPlainPrefix1(s);
};

/******************************************************************************/

var FilterPlainPrefix1Hostname = function(s, hostname) {
    this.s = s;
    this.hostname = hostname;
};

FilterPlainPrefix1Hostname.prototype.match = function(url, tokenBeg) {
    return pageHostname.slice(-this.hostname.length) === this.hostname &&
           url.substr(tokenBeg - 1, this.s.length) === this.s;
};

FilterPlainPrefix1Hostname.prototype.fid = '1ah';

FilterPlainPrefix1Hostname.prototype.toString = function() {
    return this.s + '$domain=' + this.hostname;
};

FilterPlainPrefix1Hostname.prototype.toSelfie = function() {
    return this.s + '\t' +
           this.hostname;
};

FilterPlainPrefix1Hostname.fromSelfie = function(s) {
    var pos = s.indexOf('\t');
    return new FilterPlainPrefix1Hostname(s.slice(0, pos), s.slice(pos + 1));
};

/******************************************************************************/

var FilterPlainLeftAnchored = function(s) {
    this.s = s;
};

FilterPlainLeftAnchored.prototype.match = function(url) {
    return url.slice(0, this.s.length) === this.s;
};

FilterPlainLeftAnchored.prototype.fid = '|a';

FilterPlainLeftAnchored.prototype.toString = function() {
    return '|' + this.s;
};

FilterPlainLeftAnchored.prototype.toSelfie = function() {
    return this.s;
};

FilterPlainLeftAnchored.fromSelfie = function(s) {
    return new FilterPlainLeftAnchored(s);
};

/******************************************************************************/

var FilterPlainLeftAnchoredHostname = function(s, hostname) {
    this.s = s;
    this.hostname = hostname;
};

FilterPlainLeftAnchoredHostname.prototype.match = function(url) {
    return pageHostname.slice(-this.hostname.length) === this.hostname &&
           url.slice(0, this.s.length) === this.s;
};

FilterPlainLeftAnchoredHostname.prototype.fid = '|ah';

FilterPlainLeftAnchoredHostname.prototype.toString = function() {
    return '|' + this.s + '$domain=' + this.hostname;
};

FilterPlainLeftAnchoredHostname.prototype.toSelfie = function() {
    return this.s + '\t' +
           this.hostname;
};

FilterPlainLeftAnchoredHostname.fromSelfie = function(s) {
    var pos = s.indexOf('\t');
    return new FilterPlainLeftAnchoredHostname(s.slice(0, pos), s.slice(pos + 1));
};

/******************************************************************************/

var FilterPlainRightAnchored = function(s) {
    this.s = s;
};

FilterPlainRightAnchored.prototype.match = function(url) {
    return url.slice(-this.s.length) === this.s;
};

FilterPlainRightAnchored.prototype.fid = 'a|';

FilterPlainRightAnchored.prototype.toString = function() {
    return this.s + '|';
};

FilterPlainRightAnchored.prototype.toSelfie = function() {
    return this.s;
};

FilterPlainRightAnchored.fromSelfie = function(s) {
    return new FilterPlainRightAnchored(s);
};

/******************************************************************************/

var FilterPlainRightAnchoredHostname = function(s, hostname) {
    this.s = s;
    this.hostname = hostname;
};

FilterPlainRightAnchoredHostname.prototype.match = function(url) {
    return pageHostname.slice(-this.hostname.length) === this.hostname &&
           url.slice(-this.s.length) === this.s;
};

FilterPlainRightAnchoredHostname.prototype.fid = 'a|h';

FilterPlainRightAnchoredHostname.prototype.toString = function() {
    return this.s + '|$domain=' + this.hostname;
};

FilterPlainRightAnchoredHostname.prototype.toSelfie = function() {
    return this.s + '\t' +
           this.hostname;
};

FilterPlainRightAnchoredHostname.fromSelfie = function(s) {
    var pos = s.indexOf('\t');
    return new FilterPlainRightAnchoredHostname(s.slice(0, pos), s.slice(pos + 1));
};

/******************************************************************************/

// https://github.com/gorhill/uBlock/issues/235
// The filter is left-anchored somewhere within the hostname part of the URL.

var FilterPlainHnAnchored = function(s) {
    this.s = s;
};

FilterPlainHnAnchored.prototype.match = function(url, tokenBeg) {
    if ( url.substr(tokenBeg, this.s.length) !== this.s ) {
        return false;
    }
    // Valid only if hostname-valid characters to the left of token
    var pos = url.indexOf('://');
    return pos !== -1 &&
           reURLPostHostnameAnchors.test(url.slice(pos + 3, tokenBeg)) === false;
};

FilterPlainHnAnchored.prototype.fid = 'h|a';

FilterPlainHnAnchored.prototype.toString = function() {
    return '||' + this.s;
};

FilterPlainHnAnchored.prototype.toSelfie = function() {
    return this.s;
};

FilterPlainHnAnchored.fromSelfie = function(s) {
    return new FilterPlainHnAnchored(s);
};

// https://www.youtube.com/watch?v=71YS6xDB-E4

/******************************************************************************/

// With a single wildcard, regex is not optimal.
// See:
//   http://jsperf.com/regexp-vs-indexof-abp-miss/3
//   http://jsperf.com/regexp-vs-indexof-abp-hit/3

var FilterSingleWildcard = function(lSegment, rSegment, tokenBeg) {
    this.tokenBeg = tokenBeg;
    this.lSegment = lSegment;
    this.rSegment = rSegment;
};

FilterSingleWildcard.prototype.match = function(url, tokenBeg) {
    tokenBeg -= this.tokenBeg;
    return url.substr(tokenBeg, this.lSegment.length) === this.lSegment &&
           url.indexOf(this.rSegment, tokenBeg + this.lSegment.length) > 0;
};

FilterSingleWildcard.prototype.fid = '*';

FilterSingleWildcard.prototype.toString = function() {
    return this.lSegment + '*' + this.rSegment;
};

FilterSingleWildcard.prototype.toSelfie = function() {
    return this.lSegment + '\t' +
           this.rSegment + '\t' +
           this.tokenBeg;
};

FilterSingleWildcard.fromSelfie = function(s) {
    var args = s.split('\t');
    return new FilterSingleWildcard(args[0], args[1], atoi(args[2]));
};

/******************************************************************************/

var FilterSingleWildcardHostname = function(lSegment, rSegment, tokenBeg, hostname) {
    this.tokenBeg = tokenBeg;
    this.lSegment = lSegment;
    this.rSegment = rSegment;
    this.hostname = hostname;
};

FilterSingleWildcardHostname.prototype.match = function(url, tokenBeg) {
    tokenBeg -= this.tokenBeg;
    return pageHostname.slice(-this.hostname.length) === this.hostname &&
           url.substr(tokenBeg, this.lSegment.length) === this.lSegment &&
           url.indexOf(this.rSegment, tokenBeg + this.lSegment.length) > 0;
};

FilterSingleWildcardHostname.prototype.fid = '*h';

FilterSingleWildcardHostname.prototype.toString = function() {
    return this.lSegment + '*' + this.rSegment + '$domain=' + this.hostname;
};

FilterSingleWildcardHostname.prototype.toSelfie = function() {
    return this.lSegment + '\t' +
           this.rSegment + '\t' +
           this.tokenBeg + '\t' +
           this.hostname;
};

FilterSingleWildcardHostname.fromSelfie = function(s) {
    var args = s.split('\t');
    return new FilterSingleWildcardHostname(args[0], args[1], atoi(args[2]), args[3]);
};

/******************************************************************************/

var FilterSingleWildcardPrefix0 = function(lSegment, rSegment) {
    this.lSegment = lSegment;
    this.rSegment = rSegment;
};

FilterSingleWildcardPrefix0.prototype.match = function(url, tokenBeg) {
    return url.substr(tokenBeg, this.lSegment.length) === this.lSegment &&
           url.indexOf(this.rSegment, tokenBeg + this.lSegment.length) > 0;
};

FilterSingleWildcardPrefix0.prototype.fid = '0*';

FilterSingleWildcardPrefix0.prototype.toString = function() {
    return this.lSegment + '*' + this.rSegment;
};

FilterSingleWildcardPrefix0.prototype.toSelfie = function() {
    return this.lSegment + '\t' +
           this.rSegment;
};

FilterSingleWildcardPrefix0.fromSelfie = function(s) {
    var pos = s.indexOf('\t');
    return new FilterSingleWildcardPrefix0(s.slice(0, pos), s.slice(pos + 1));
};

/******************************************************************************/

var FilterSingleWildcardPrefix0Hostname = function(lSegment, rSegment, hostname) {
    this.lSegment = lSegment;
    this.rSegment = rSegment;
    this.hostname = hostname;
};

FilterSingleWildcardPrefix0Hostname.prototype.match = function(url, tokenBeg) {
    return pageHostname.slice(-this.hostname.length) === this.hostname &&
           url.substr(tokenBeg, this.lSegment.length) === this.lSegment &&
           url.indexOf(this.rSegment, tokenBeg + this.lSegment.length) > 0;
};

FilterSingleWildcardPrefix0Hostname.prototype.fid = '0*h';

FilterSingleWildcardPrefix0Hostname.prototype.toString = function() {
    return this.lSegment + '*' + this.rSegment + '$domain=' + this.hostname;
};

FilterSingleWildcardPrefix0Hostname.prototype.toSelfie = function() {
    return this.lSegment + '\t' +
           this.rSegment + '\t' +
           this.hostname;
};

FilterSingleWildcardPrefix0Hostname.fromSelfie = function(s) {
    var args = s.split('\t');
    return new FilterSingleWildcardPrefix0Hostname(args[0], args[1], args[2]);
};

/******************************************************************************/

var FilterSingleWildcardLeftAnchored = function(lSegment, rSegment) {
    this.lSegment = lSegment;
    this.rSegment = rSegment;
};

FilterSingleWildcardLeftAnchored.prototype.match = function(url) {
    return url.slice(0, this.lSegment.length) === this.lSegment &&
           url.indexOf(this.rSegment, this.lSegment.length) > 0;
};

FilterSingleWildcardLeftAnchored.prototype.fid = '|*';

FilterSingleWildcardLeftAnchored.prototype.toString = function() {
    return '|' + this.lSegment + '*' + this.rSegment;
};

FilterSingleWildcardLeftAnchored.prototype.toSelfie = function() {
    return this.lSegment + '\t' +
           this.rSegment;
};

FilterSingleWildcardLeftAnchored.fromSelfie = function(s) {
    var pos = s.indexOf('\t');
    return new FilterSingleWildcardLeftAnchored(s.slice(0, pos), s.slice(pos + 1));
};

/******************************************************************************/

var FilterSingleWildcardLeftAnchoredHostname = function(lSegment, rSegment, hostname) {
    this.lSegment = lSegment;
    this.rSegment = rSegment;
    this.hostname = hostname;
};

FilterSingleWildcardLeftAnchoredHostname.prototype.match = function(url) {
    return pageHostname.slice(-this.hostname.length) === this.hostname &&
           url.slice(0, this.lSegment.length) === this.lSegment &&
           url.indexOf(this.rSegment, this.lSegment.length) > 0;
};

FilterSingleWildcardLeftAnchoredHostname.prototype.fid = '|*h';

FilterSingleWildcardLeftAnchoredHostname.prototype.toString = function() {
    return '|' + this.lSegment + '*' + this.rSegment + '$domain=' + this.hostname;
};

FilterSingleWildcardLeftAnchoredHostname.prototype.toSelfie = function() {
    return this.lSegment + '\t' +
           this.rSegment + '\t' +
           this.hostname;
};

FilterSingleWildcardLeftAnchoredHostname.fromSelfie = function(s) {
    var args = s.split('\t');
    return new FilterSingleWildcardLeftAnchoredHostname(args[0], args[1], args[2]);
};

/******************************************************************************/

var FilterSingleWildcardRightAnchored = function(lSegment, rSegment) {
    this.lSegment = lSegment;
    this.rSegment = rSegment;
};

FilterSingleWildcardRightAnchored.prototype.match = function(url) {
    return url.slice(-this.rSegment.length) === this.rSegment &&
           url.lastIndexOf(this.lSegment, url.length - this.rSegment.length - this.lSegment.length) >= 0;
};

FilterSingleWildcardRightAnchored.prototype.fid = '*|';

FilterSingleWildcardRightAnchored.prototype.toString = function() {
    return this.lSegment + '*' + this.rSegment + '|';
};

FilterSingleWildcardRightAnchored.prototype.toSelfie = function() {
    return this.lSegment + '\t' +
           this.rSegment;
};

FilterSingleWildcardRightAnchored.fromSelfie = function(s) {
    var pos = s.indexOf('\t');
    return new FilterSingleWildcardRightAnchored(s.slice(0, pos), s.slice(pos + 1));
};

/******************************************************************************/

var FilterSingleWildcardRightAnchoredHostname = function(lSegment, rSegment, hostname) {
    this.lSegment = lSegment;
    this.rSegment = rSegment;
    this.hostname = hostname;
};

FilterSingleWildcardRightAnchoredHostname.prototype.match = function(url) {
    return pageHostname.slice(-this.hostname.length) === this.hostname &&
           url.slice(-this.rSegment.length) === this.rSegment &&
           url.lastIndexOf(this.lSegment, url.length - this.rSegment.length - this.lSegment.length) >= 0;
};

FilterSingleWildcardRightAnchoredHostname.prototype.fid = '*|h';

FilterSingleWildcardRightAnchoredHostname.prototype.toString = function() {
    return this.lSegment + '*' + this.rSegment + '|$domain=' + this.hostname;
};

FilterSingleWildcardRightAnchoredHostname.prototype.toSelfie = function() {
    return this.lSegment + '\t' +
           this.rSegment + '\t' +
           this.hostname;
};

FilterSingleWildcardRightAnchoredHostname.fromSelfie = function(s) {
    var args = s.split('\t');
    return new FilterSingleWildcardRightAnchoredHostname(args[0], args[1], args[2]);
};

/******************************************************************************/

// With many wildcards, a regex is best.

// Ref: regex escaper taken from:
// https://developer.mozilla.org/en/docs/Web/JavaScript/Guide/Regular_Expressions
// modified for the purpose here.

var FilterManyWildcards = function(s, tokenBeg) {
    this.s = s;
    this.tokenBeg = tokenBeg;
    this.re = new RegExp('^' + s.replace(/([.+?^=!:${}()|\[\]\/\\])/g, '\\$1').replace(/\*/g, '.*'));
};

FilterManyWildcards.prototype.match = function(url, tokenBeg) {
    return this.re.test(url.slice(tokenBeg - this.tokenBeg));
};

FilterManyWildcards.prototype.fid = '*+';

FilterManyWildcards.prototype.toString = function() {
    return this.s;
};

FilterManyWildcards.prototype.toSelfie = function() {
    return this.s + '\t' +
           this.tokenBeg;
};

FilterManyWildcards.fromSelfie = function(s) {
    var pos = s.indexOf('\t');
    return new FilterManyWildcards(s.slice(0, pos), atoi(s.slice(pos + 1)));
};

/******************************************************************************/

var FilterManyWildcardsHostname = function(s, tokenBeg, hostname) {
    this.s = s;
    this.tokenBeg = tokenBeg;
    this.re = new RegExp('^' + s.replace(/([.+?^=!:${}()|\[\]\/\\])/g, '\\$1').replace(/\*/g, '.*'));
    this.hostname = hostname;
};

FilterManyWildcardsHostname.prototype.match = function(url, tokenBeg) {
    return pageHostname.slice(-this.hostname.length) === this.hostname &&
           this.re.test(url.slice(tokenBeg - this.tokenBeg));
};

FilterManyWildcardsHostname.prototype.fid = '*+h';

FilterManyWildcardsHostname.prototype.toString = function() {
    return this.s + '$domain=' + this.hostname;
};

FilterManyWildcardsHostname.prototype.toSelfie = function() {
    return this.s + '\t' +
           this.tokenBeg + '\t' +
           this.hostname;
};

FilterManyWildcardsHostname.fromSelfie = function(s) {
    var args = s.split('\t');
    return new FilterManyWildcardsHostname(args[0], atoi(args[1]), args[2]);
};

/******************************************************************************/
/******************************************************************************/

// Some buckets can grow quite large, and finding a hit in these buckets
// may end up being expensive. After considering various solutions, the one
// retained is to promote hit filters to a smaller index, so that next time
// they can be looked-up faster.

// key=  10000 ad           count=660
// key=  10000 ads          count=433
// key=  10001 google       count=277
// key=1000000 2mdn         count=267
// key=  10000 social       count=240
// key=  10001 pagead2      count=166
// key=  10000 twitter      count=122
// key=  10000 doubleclick  count=118
// key=  10000 facebook     count=114
// key=  10000 share        count=113
// key=  10000 google       count=106
// key=  10001 code         count=103
// key=  11000 doubleclick  count=100
// key=1010001 g            count=100
// key=  10001 js           count= 89
// key=  10000 adv          count= 88
// key=  10000 youtube      count= 61
// key=  10000 plugins      count= 60
// key=  10001 partner      count= 59
// key=  10000 ico          count= 57
// key= 110001 ssl          count= 57
// key=  10000 banner       count= 53
// key=  10000 footer       count= 51
// key=  10000 rss          count= 51

/******************************************************************************/

var FilterBucket = function(a, b) {
    this.promoted = 0;
    this.vip = 16;
    this.f = null;  // short-lived register
    this.filters = [];
    if ( a !== undefined ) {
        this.filters[0] = a;
        if ( b !== undefined ) {
            this.filters[1] = b;
        }
    }
};

FilterBucket.prototype.add = function(a) {
    this.filters.push(a);
};

// Promote hit filters so they can be found faster next time.
FilterBucket.prototype.promote = function(i) {
    var filters = this.filters;
    var pivot = filters.length >>> 1;
    while ( i < pivot ) {
        pivot >>>= 1;
        if ( pivot < this.vip ) {
            break;
        }
    }
    if ( i <= pivot ) {
        return;
    }
    var j = this.promoted % pivot;
    //console.debug('FilterBucket.promote(): promoted %d to %d', i, j);
    var f = filters[j];
    filters[j] = filters[i];
    filters[i] = f;
    this.promoted += 1;
};

FilterBucket.prototype.match = function(url, tokenBeg) {
    var filters = this.filters;
    var n = filters.length;
    for ( var i = 0; i < n; i++ ) {
        if ( filters[i].match(url, tokenBeg) !== false ) {
            this.f = filters[i];
            if ( i >= this.vip ) {
                this.promote(i);
            }
            return true;
        }
    }
    return false;
};

FilterBucket.prototype.fid = '[]';

FilterBucket.prototype.toString = function() {
    if ( this.f !== null ) {
        return this.f.toString();
    }
    return '';
};

FilterBucket.prototype.toSelfie = function() {
    return this.filters.length.toString();
};

FilterBucket.fromSelfie = function() {
    return new FilterBucket();
};

/******************************************************************************/

var makeFilter = function(details, tokenBeg) {
    var s = details.f;
    var wcOffset = s.indexOf('*');
    if ( wcOffset !== -1 ) {
        if ( s.indexOf('*', wcOffset + 1) !== -1 ) {
            return details.anchor === 0 ? new FilterManyWildcards(s, tokenBeg) : null;
        }
        var lSegment = s.slice(0, wcOffset);
        var rSegment = s.slice(wcOffset + 1);
        if ( details.anchor < 0 ) {
            return new FilterSingleWildcardLeftAnchored(lSegment, rSegment);
        }
        if ( details.anchor > 0 ) {
            return new FilterSingleWildcardRightAnchored(lSegment, rSegment);
        }
        if ( tokenBeg === 0 ) {
            return new FilterSingleWildcardPrefix0(lSegment, rSegment);
        }
        return new FilterSingleWildcard(lSegment, rSegment, tokenBeg);
    }
    if ( details.anchor < 0 ) {
        return new FilterPlainLeftAnchored(s);
    }
    if ( details.anchor > 0 ) {
        return new FilterPlainRightAnchored(s);
    }
    if ( details.hostnameAnchored ) {
        return new FilterPlainHnAnchored(s);
    }
    if ( tokenBeg === 0 ) {
        return new FilterPlainPrefix0(s);
    }
    if ( tokenBeg === 1 ) {
        return new FilterPlainPrefix1(s);
    }
    return new FilterPlain(s, tokenBeg);
};

/******************************************************************************/

var makeHostnameFilter = function(details, tokenBeg, hostname) {
    var s = details.f;
    var wcOffset = s.indexOf('*');
    if ( wcOffset !== -1 ) {
        if ( s.indexOf('*', wcOffset + 1) !== -1 ) {
            return details.anchor === 0 ? new FilterManyWildcardsHostname(s, tokenBeg, hostname) : null;
        }
        var lSegment = s.slice(0, wcOffset);
        var rSegment = s.slice(wcOffset + 1);
        if ( details.anchor < 0 ) {
            return new FilterSingleWildcardLeftAnchoredHostname(lSegment, rSegment, hostname);
        }
        if ( details.anchor > 0 ) {
            return new FilterSingleWildcardRightAnchoredHostname(lSegment, rSegment, hostname);
        }
        if ( tokenBeg === 0 ) {
            return new FilterSingleWildcardPrefix0Hostname(lSegment, rSegment, hostname);
        }
        return new FilterSingleWildcardHostname(lSegment, rSegment, tokenBeg, hostname);
    }
    if ( details.anchor < 0 ) {
        return new FilterPlainLeftAnchoredHostname(s, hostname);
    }
    if ( details.anchor > 0 ) {
        return new FilterPlainRightAnchoredHostname(s, hostname);
    }
    if ( tokenBeg === 0 ) {
        return new FilterPlainPrefix0Hostname(s, hostname);
    }
    if ( tokenBeg === 1 ) {
        return new FilterPlainPrefix1Hostname(s, hostname);
    }
    return new FilterPlainHostname(s, tokenBeg, hostname);
};

/******************************************************************************/

// Given a string, find a good token. Tokens which are too generic, i.e. very
// common with a high probability of ending up as a miss, are not
// good. Avoid if possible. This has a *significant* positive impact on
// performance.
// These "bad tokens" are collated manually.

var badTokens = {
    'com': true,
    'http': true,
    'https': true,
    'icon': true,
    'images': true,
    'img': true,
    'js': true,
    'net': true,
    'news': true,
    'www': true
};

var findFirstGoodToken = function(s) {
    reGoodToken.lastIndex = 0;
    var matches;
    while ( matches = reGoodToken.exec(s) ) {
        if ( badTokens[matches[0]] === undefined ) {
            return matches;
        }
    }
    // No good token found, just return the first token from left
    reGoodToken.lastIndex = 0;
    return reGoodToken.exec(s);
};

/******************************************************************************/

var findHostnameToken = function(s) {
    reHostnameToken.lastIndex = 0;
    return reHostnameToken.exec(s);
};

/******************************************************************************/

// Trim leading/trailing char "c"

var trimChar = function(s, c) {
    // Remove leading and trailing wildcards
    var pos = 0;
    while ( s.charAt(pos) === c ) {
        pos += 1;
    }
    s = s.slice(pos);
    if ( pos = s.length ) {
        while ( s.charAt(pos-1) === c ) {
            pos -= 1;
        }
        s = s.slice(0, pos);
    }
    return s;
};

/******************************************************************************/
/******************************************************************************/

var FilterParser = function() {
    this.hostnames = [];
    this.types = [];
    this.reset();
};

/******************************************************************************/

FilterParser.prototype.toNormalizedType = {
        'stylesheet': 'stylesheet',
             'image': 'image',
            'object': 'object',
 'object-subrequest': 'object',
            'script': 'script',
    'xmlhttprequest': 'xmlhttprequest',
       'subdocument': 'sub_frame',
             'other': 'other',
     'inline-script': 'inline-script',
             'popup': 'popup'
};

/******************************************************************************/

FilterParser.prototype.reset = function() {
    this.action = BlockAction;
    this.anchor = 0;
    this.elemHiding = false;
    this.f = '';
    this.firstParty = false;
    this.fopts = '';
    this.hostnameAnchored = false;
    this.hostnamePure = false;
    this.hostnames.length = 0;
    this.notHostname = false;
    this.thirdParty = false;
    this.types.length = 0;
    this.important = 0;
    this.unsupported = false;
    return this;
};

/******************************************************************************/

FilterParser.prototype.parseOptType = function(raw, not) {
    var type = this.toNormalizedType[raw];
    if ( not ) {
        for ( var k in typeNameToTypeValue ) {
            if ( typeNameToTypeValue.hasOwnProperty(k) === false ) {
                continue;
            }
            if ( k === type ) {
                continue;
            }
            // https://github.com/gorhill/uBlock/issues/121
            // `popup` is a special type, it cannot be set for filters intended
            // for real net request types. The test is safe since there is no
            // such thing as a filter using `~popup`.
            if ( typeNameToTypeValue[k] > typeNameToTypeValue.other ) {
                continue;
            }
            this.types.push(typeNameToTypeValue[k]);
        }
    } else {
        this.types.push(typeNameToTypeValue[type]);
    }
};

/******************************************************************************/

FilterParser.prototype.parseOptParty = function(not) {
    if ( not ) {
        this.firstParty = true;
    } else {
        this.thirdParty = true;
    }
};

/******************************************************************************/

FilterParser.prototype.parseOptHostnames = function(raw) {
    var hostnames = raw.split('|');
    var hostname, not;
    for ( var i = 0; i < hostnames.length; i++ ) {
        hostname = hostnames[i];
        not = hostname.charAt(0) === '~';
        if ( not ) {
            hostname = hostname.slice(1);
        }
        // https://github.com/gorhill/uBlock/issues/191
        // Well it doesn't seem to make a whole lot of sense to have both
        // non-negated hostnames mixed with negated hostnames.
        if ( this.hostnames.length !== 0 && not !== this.notHostname ) {
            console.error('FilterContainer.parseOptHostnames(): ambiguous filter syntax: "%s"', this.f);
            this.unsupported = true;
            return;
        }
        this.notHostname = not;
        this.hostnames.push(hostname);
    }
};

/******************************************************************************/

FilterParser.prototype.parse = function(s) {
    // important!
    this.reset();

    if ( reHostnameRule.test(s) ) {
        this.f = s;
        this.hostnamePure = this.hostnameAnchored = true;
        return this;
    }

    // element hiding filter?
    if ( s.indexOf('##') >= 0 || s.indexOf('#@') >= 0 ) {
        this.elemHiding = true;
        return this;
    }

    // block or allow filter?
    if ( s.slice(0, 2) === '@@' ) {
        this.action = AllowAction;
        s = s.slice(2);
    }

    // options
    var pos = s.indexOf('$');
    if ( pos > 0 ) {
        this.fopts = s.slice(pos + 1);
        s = s.slice(0, pos);
    }

    // regex? (not supported)
    if ( s.charAt(0) === '/' && s.slice(-1) === '/' ) {
        this.unsupported = true;
        return this;
    }

    // hostname anchoring
    if ( s.slice(0, 2) === '||' ) {
        this.hostnameAnchored = true;
        s = s.slice(2);
    }

    // left-anchored
    if ( s.charAt(0) === '|' ) {
        this.anchor = -1;
        s = s.slice(1);
    }

    // right-anchored
    if ( s.slice(-1) === '|' ) {
        this.anchor = 1;
        s = s.slice(0, -1);
    }

    // normalize placeholders
    // TODO: transforming `^` into `*` is not a strict interpretation of
    // ABP syntax.
    s = s.replace(/\^/g, '*');
    s = s.replace(/\*\*+/g, '*');

    // remove leading and trailing wildcards
    s = trimChar(s, '*');

    // pure hostname-based?
    this.hostnamePure = this.hostnameAnchored && reHostnameRule.test(s);

    this.f = s;

    if ( !this.fopts ) {
        return this;
    }

    // parse options
    var opts = this.fopts.split(',');
    var opt, not;
    for ( var i = 0; i < opts.length; i++ ) {
        opt = opts[i];
        not = opt.charAt(0) === '~';
        if ( not ) {
            opt = opt.slice(1);
        }
        if ( opt === 'third-party' ) {
            this.parseOptParty(not);
            continue;
        }
        if ( opt === 'elemhide' && this.action === AllowAction ) {
            this.types.push(typeNameToTypeValue['cosmetic-filtering']);
            this.action = BlockAction;
            continue;
        }
        if ( this.toNormalizedType.hasOwnProperty(opt) ) {
            this.parseOptType(opt, not);
            continue;
        }
        if ( opt.slice(0,7) === 'domain=' ) {
            this.parseOptHostnames(opt.slice(7));
            continue;
        }
        if ( opt === 'popup' ) {
            this.parseOptType('popup', not);
            continue;
        }
        if ( opt === 'important' ) {
            this.important = Important;
            continue;
        }
        this.unsupported = true;
        break;
    }
    return this;
};

/******************************************************************************/
/******************************************************************************/

var TokenEntry = function() {
    this.beg = 0;
    this.token = '';
};

/******************************************************************************/
/******************************************************************************/

var FilterContainer = function() {
    this.reAnyToken = /[%0-9a-z]+/g;
    this.tokens = [];
    this.buckets = new Array(4);
    this.blockedAnyPartyHostnames = new µb.LiquidDict();
    this.blocked3rdPartyHostnames = new µb.LiquidDict();
    this.filterParser = new FilterParser();
    this.reset();
};

/******************************************************************************/

// Reset all, thus reducing to a minimum memory footprint of the context.

FilterContainer.prototype.reset = function() {
    this.frozen = false;
    this.processedFilterCount = 0;
    this.acceptedCount = 0;
    this.rejectedCount = 0;
    this.allowFilterCount = 0;
    this.blockFilterCount = 0;
    this.duplicateCount = 0;
    this.categories = Object.create(null);
    this.duplicates = Object.create(null);
    this.blockedAnyPartyHostnames.reset();
    this.blocked3rdPartyHostnames.reset();
    this.filterParser.reset();
};

/******************************************************************************/

FilterContainer.prototype.freeze = function() {
    histogram('allFilters', this.categories);
    this.blockedAnyPartyHostnames.freeze();
    this.blocked3rdPartyHostnames.freeze();
    this.duplicates = Object.create(null);
    this.filterParser.reset();
    this.frozen = true;
};

/******************************************************************************/

FilterContainer.prototype.toSelfie = function() {
    var categoryToSelfie = function(dict) {
        var selfie = [];
        var bucket, ff, n, i, f;
        for ( var k in dict ) {
            // No need for hasOwnProperty() here: there is no prototype chain.
            // We need to encode the key because there could be a `\n` or '\t'
            // character in it, which would trip the code at parse time.
            selfie.push('k2\t' + encode(k));
            bucket = dict[k];
            selfie.push(bucket.fid + '\t' + bucket.toSelfie());
            if ( bucket.fid !== '[]' ) {
                continue;
            }
            ff = bucket.filters;
            n = ff.length;
            for ( i = 0; i < n; i++ ) {
                f = ff[i];
                selfie.push(f.fid + '\t' + f.toSelfie());
            }
        }
        return selfie.join('\n');
    };

    var categoriesToSelfie = function(dict) {
        var selfie = [];
        for ( var k in dict ) {
            // No need for hasOwnProperty() here: there is no prototype chain.
            // We need to encode the key because there could be a `\n` or '\t'
            // character in it, which would trip the code at parse time.
            selfie.push('k1\t' + encode(k));
            selfie.push(categoryToSelfie(dict[k]));
        }
        return selfie.join('\n');
    };

    return {
        processedFilterCount: this.processedFilterCount,
        acceptedCount: this.acceptedCount,
        rejectedCount: this.rejectedCount,
        allowFilterCount: this.allowFilterCount,
        blockFilterCount: this.blockFilterCount,
        duplicateCount: this.duplicateCount,
        categories: categoriesToSelfie(this.categories),
        blockedAnyPartyHostnames: this.blockedAnyPartyHostnames.toSelfie(),
        blocked3rdPartyHostnames: this.blocked3rdPartyHostnames.toSelfie()
    };
};

/******************************************************************************/

FilterContainer.prototype.fromSelfie = function(selfie) {
    this.frozen = true;
    this.processedFilterCount = selfie.processedFilterCount;
    this.acceptedCount = selfie.acceptedCount;
    this.rejectedCount = selfie.rejectedCount;
    this.allowFilterCount = selfie.allowFilterCount;
    this.blockFilterCount = selfie.blockFilterCount;
    this.duplicateCount = selfie.duplicateCount;
    this.blockedAnyPartyHostnames.fromSelfie(selfie.blockedAnyPartyHostnames);
    this.blocked3rdPartyHostnames.fromSelfie(selfie.blocked3rdPartyHostnames);

    var factories = {
         '[]': FilterBucket,
          'a': FilterPlain,
         'ah': FilterPlainHostname,
         '0a': FilterPlainPrefix0,
        '0ah': FilterPlainPrefix0Hostname,
         '1a': FilterPlainPrefix1,
        '1ah': FilterPlainPrefix1Hostname,
         '|a': FilterPlainLeftAnchored,
        '|ah': FilterPlainLeftAnchoredHostname,
         'a|': FilterPlainRightAnchored,
        'a|h': FilterPlainRightAnchoredHostname,
        'h|a': FilterPlainHnAnchored,
          '*': FilterSingleWildcard,
         '*h': FilterSingleWildcardHostname,
         '0*': FilterSingleWildcardPrefix0,
        '0*h': FilterSingleWildcardPrefix0Hostname,
         '|*': FilterSingleWildcardLeftAnchored,
        '|*h': FilterSingleWildcardLeftAnchoredHostname,
         '*|': FilterSingleWildcardRightAnchored,
        '*|h': FilterSingleWildcardRightAnchoredHostname,
         '*+': FilterManyWildcards,
        '*+h': FilterManyWildcardsHostname
    };

    var catKey, tokenKey;
    var dict = this.categories, subdict;
    var bucket = null;
    var rawText = selfie.categories;
    var rawEnd = rawText.length;
    var lineBeg = 0, lineEnd;
    var line, pos, what, factory;
    while ( lineBeg < rawEnd ) {
        lineEnd = rawText.indexOf('\n', lineBeg);
        if ( lineEnd < 0 ) {
            lineEnd = rawEnd;
        }
        line = rawText.slice(lineBeg, lineEnd);
        lineBeg = lineEnd + 1;
        pos = line.indexOf('\t');
        what = line.slice(0, pos);
        if ( what === 'k1' ) {
            catKey = decode(line.slice(pos + 1));
            subdict = dict[catKey] = Object.create(null);
            bucket = null;
            continue;
        }
        if ( what === 'k2' ) {
            tokenKey = decode(line.slice(pos + 1));
            bucket = null;
            continue;
        }
        factory = factories[what];
        if ( bucket === null ) {
            bucket = subdict[tokenKey] = factory.fromSelfie(line.slice(pos + 1));
            continue;
        }
        // When token key is reused, it can't be anything
        // else than FilterBucket
        bucket.add(factory.fromSelfie(line.slice(pos + 1)));
    }
};

/******************************************************************************/

FilterContainer.prototype.makeCategoryKey = function(category) {
    return String.fromCharCode(category);
};

/******************************************************************************/

FilterContainer.prototype.add = function(s) {
    // ORDER OF TESTS IS IMPORTANT!

    // Ignore empty lines
    if ( reIgnoreEmpty.test(s) ) {
        return false;
    }

    // Ignore comments
    if ( reIgnoreComment.test(s) ) {
        return false;
    }

    var parsed = this.filterParser.parse(s);

    // Ignore rules with other conditions for now
    if ( parsed.unsupported ) {
        this.rejectedCount += 1;
        // console.log('µBlock> abp-filter.js/FilterContainer.add(): unsupported filter "%s"', s);
        return false;
    }

    // Ignore element-hiding filters
    if ( parsed.elemHiding ) {
        return false;
    }

    this.processedFilterCount += 1;
    this.acceptedCount += 1;

    // Pure hostnames, use more efficient liquid dict
    if ( parsed.hostnamePure && parsed.action === BlockAction ) {
        if ( parsed.fopts === '' ) {
            if ( this.blockedAnyPartyHostnames.add(parsed.f) ) {
                this.blockFilterCount++;
            } else {
                this.duplicateCount++;
            }
            return true;
        }
        if ( parsed.fopts === 'third-party' ) {
            if ( this.blocked3rdPartyHostnames.add(parsed.f) ) {
                this.blockFilterCount++;
            } else {
                this.duplicateCount++;
            }
            return true;
        }
    }

    if ( this.duplicates[s] ) {
        this.duplicateCount++;
        return false;
    }
    if ( this.frozen === false ) {
        this.duplicates[s] = true;
    }

    var r = this.addFilter(parsed);
    if ( r === false ) {
        return false;
    }

    if ( parsed.action ) {
        this.allowFilterCount += 1;
    } else {
        this.blockFilterCount += 1;
    }
    return true;
};

/******************************************************************************/

FilterContainer.prototype.addFilter = function(parsed) {
    // TODO: avoid duplicates

    var matches = parsed.hostnameAnchored ?
        findHostnameToken(parsed.f) :
        findFirstGoodToken(parsed.f);
    if ( !matches || !matches[0].length ) {
        return false;
    }
    var tokenBeg = matches.index;
    var tokenEnd = parsed.hostnameAnchored ?
        reHostnameToken.lastIndex :
        reGoodToken.lastIndex;
    var filter;

    var i = parsed.hostnames.length;

    // Applies to specific domains

    if ( i !== 0 && !parsed.notHostname ) {
        while ( i-- ) {
            filter = makeHostnameFilter(parsed, tokenBeg, parsed.hostnames[i]);
            if ( !filter ) {
                return false;
            }
            this.addFilterEntry(filter, parsed, AnyParty, tokenBeg, tokenEnd);
        }
        return true;
    }

    var party = AnyParty;
    if ( parsed.firstParty !== parsed.thirdParty ) {
        party = parsed.firstParty ? FirstParty : ThirdParty;
    }

    // Applies to all domains, with exception(s)

    // https://github.com/gorhill/uBlock/issues/191
    // Invert the purpose of the filter for negated hostnames
    if ( i !== 0 && parsed.notHostname ) {
        filter = makeFilter(parsed, tokenBeg);
        if ( !filter ) {
            return false;
        }
        // https://github.com/gorhill/uBlock/issues/251
        // Apply third-party option if it is present
        this.addFilterEntry(filter, parsed, party, tokenBeg, tokenEnd);
        // Reverse purpose of filter
        parsed.action ^= ToggleAction;
        while ( i-- ) {
            filter = makeHostnameFilter(parsed, tokenBeg, parsed.hostnames[i]);
            if ( !filter ) {
                return false;
            }
            // https://github.com/gorhill/uBlock/issues/191#issuecomment-53654024
            // If it is a block filter, we need to reverse the order of
            // evaluation.
            if ( parsed.action === BlockAction ) {
                parsed.important = Important;
            }
            this.addFilterEntry(filter, parsed, AnyParty, tokenBeg, tokenEnd);
        }
        return true;
    }

    // Applies to all domains without exceptions

    filter = makeFilter(parsed, tokenBeg);
    if ( !filter ) {
        return false;
    }

    this.addFilterEntry(filter, parsed, party, tokenBeg, tokenEnd);

    return true;
};

/******************************************************************************/

FilterContainer.prototype.addFilterEntry = function(filter, parsed, party, tokenBeg, tokenEnd) {
    var s = parsed.f;
    var tokenKey = s.slice(tokenBeg, tokenEnd);
    var bits = parsed.action | parsed.important | party;
    if ( parsed.types.length === 0 ) {
        this.addToCategory(bits | AnyType, tokenKey, filter);
        return;
    }
    var n = parsed.types.length;
    for ( var i = 0; i < n; i++ ) {
        this.addToCategory(bits | parsed.types[i], tokenKey, filter);
    }
};

/******************************************************************************/

FilterContainer.prototype.addToCategory = function(category, tokenKey, filter) {
    var categoryKey = this.makeCategoryKey(category);
    var categoryBucket = this.categories[categoryKey];
    if ( !categoryBucket ) {
        categoryBucket = this.categories[categoryKey] = Object.create(null);
    }
    var filterEntry = categoryBucket[tokenKey];
    if ( filterEntry === undefined ) {
        categoryBucket[tokenKey] = filter;
        return;
    }
    if ( filterEntry.fid === '[]' ) {
        filterEntry.add(filter);
        return;
    }
    categoryBucket[tokenKey] = new FilterBucket(filterEntry, filter);
};

/******************************************************************************/

// Since the addition of the `important` evaluation, this means it is now
// likely that the url will have to be scanned more than once. So this is
// to ensure we do it once only, and reuse results.

FilterContainer.prototype.tokenize = function(url) {
    var tokens = this.tokens;
    var re = this.reAnyToken;
    var matches, tokenEntry;
    re.lastIndex = 0;
    var i = 0;
    while ( matches = re.exec(url) ) {
        tokenEntry = tokens[i];
        if ( tokenEntry === undefined ) {
            tokenEntry = tokens[i] = new TokenEntry();
        }
        tokenEntry.beg = matches.index;
        tokenEntry.token = matches[0];
        i += 1;
    }
    // Sentinel
    tokenEntry = tokens[i];
    if ( tokenEntry === undefined ) {
        tokenEntry = tokens[i] = new TokenEntry();
    }
    tokenEntry.token = '';
};

/******************************************************************************/

FilterContainer.prototype.matchTokens = function(bucket, url) {
    var tokens = this.tokens;
    var tokenEntry, token, f;
    var i = 0;
    for (;;) {
        tokenEntry = tokens[i++];
        token = tokenEntry.token;
        if ( token === '' ) {
            break;
        }
        f = bucket[token];
        if ( f !== undefined && f.match(url, tokenEntry.beg) !== false ) {
            return f;
        }
    }
    return false;
};

/******************************************************************************/

// This is where we test filters which have the form:
//
//   `||www.example.com^`
//
// Because LiquidDict is well optimized to deal with plain hostname, we gain
// reusing it here for these sort of filters rather than using filters
// specialized to deal with other complex filters.

FilterContainer.prototype.matchAnyPartyHostname = function(requestHostname) {
    var pos;
    while ( this.blockedAnyPartyHostnames.test(requestHostname) !== true ) {
        pos = requestHostname.indexOf('.');
        if ( pos === -1 ) {
            return false;
        }
        requestHostname = requestHostname.slice(pos + 1);
    }
    return '||' + requestHostname + '^';
};

/******************************************************************************/

// This is where we test filters which have the form:
//
//   `||www.example.com^$third-party`
//
// Because LiquidDict is well optimized to deal with plain hostname, we gain
// reusing it here for these sort of filters rather than using filters
// specialized to deal with other complex filters.

FilterContainer.prototype.match3rdPartyHostname = function(requestHostname) {
    var pos;
    while ( this.blocked3rdPartyHostnames.test(requestHostname) !== true ) {
        pos = requestHostname.indexOf('.');
        if ( pos === -1 ) {
            return false;
        }
        requestHostname = requestHostname.slice(pos + 1);
    }
    return '||' + requestHostname + '^$third-party';
};

/******************************************************************************/

// Specialized handlers

// https://github.com/gorhill/uBlock/issues/116
// Some type of requests are exceptional, they need custom handling,
// not the generic handling.

FilterContainer.prototype.matchStringExactType = function(context, requestURL, requestType) {
    var url = requestURL.toLowerCase();
    var requestHostname = µb.URI.hostnameFromURI(requestURL);
    var party = isFirstParty(context.pageDomain, requestHostname) ? FirstParty : ThirdParty;

    // This will be used by hostname-based filters
    pageHostname = context.pageHostname || '';

    // Be prepared to support unknown types
    var bf = false;
    var bucket;
    var categories = this.categories;
    var type = typeNameToTypeValue[requestType] || typeOtherToTypeValue;

    // Tokenize only once
    this.tokenize(url);

    // https://github.com/gorhill/uBlock/issues/139
    // Test against important block filters
    if ( bucket = categories[this.makeCategoryKey(BlockAnyParty | Important | type)] ) {
        bf = this.matchTokens(bucket, url);
        if ( bf !== false ) {
            return 'sb:' + bf.toString();
        }
    }
    if ( bucket = categories[this.makeCategoryKey(BlockAction | Important | type | party)] ) {
        bf = this.matchTokens(bucket, url);
        if ( bf !== false ) {
            return 'sb:' + bf.toString();
        }
    }

    // Test against block filters
    if ( bucket = categories[this.makeCategoryKey(BlockAnyParty | type)] ) {
        bf = this.matchTokens(bucket, url);
    }
    if ( bf === false ) {
        if ( bucket = categories[this.makeCategoryKey(BlockAction | type | party)] ) {
            bf = this.matchTokens(bucket, url);
        }
    }
    // If there is no block filter, no need to test against allow filters
    if ( bf === false ) {
        return '';
    }

    // Test against allow filters
    var af;
    if ( bucket = categories[this.makeCategoryKey(AllowAnyParty | type)] ) {
        af = this.matchTokens(bucket, url);
        if ( af !== false ) {
            return 'sa:' + af.toString();
        }
    }
    if ( bucket = categories[this.makeCategoryKey(AllowAction | type | party)] ) {
        af = this.matchTokens(bucket, url);
        if ( af !== false ) {
            return 'sa:' + af.toString();
        }
    }

    return 'sb:' + bf.toString();
};

/******************************************************************************/

FilterContainer.prototype.matchString = function(context) {
    // https://github.com/gorhill/uBlock/issues/519
    // Use exact type match for anything beyond `other`
    // Also, be prepared to support unknown types
    var type = typeNameToTypeValue[context.requestType] || typeOtherToTypeValue;
    if ( type > 8 << 4 ) {
        return this.matchStringExactType(context, context.requestURL, context.requestType);
    }

    // https://github.com/gorhill/httpswitchboard/issues/239
    // Convert url to lower case:
    //     `match-case` option not supported, but then, I saw only one
    //     occurrence of it in all the supported lists (bulgaria list).
    var url = context.requestURL.toLowerCase();

    // The logic here is simple:
    //
    // block = !whitelisted &&  blacklisted
    //   or equivalent
    // allow =  whitelisted || !blacklisted

    // Statistically, hits on a URL in order of likelihood:
    // 1. No hit
    // 2. Hit on a block filter
    // 3. Hit on an allow filter
    //
    // High likelihood of "no hit" means to optimize we need to reduce as much
    // as possible the number of filters to test.
    //
    // Then, because of the order of probabilities, we should test only
    // block filters first, and test allow filters if and only if there is a
    // hit on a block filter. Since there is a high likelihood of no hit,
    // testing allow filter by default is likely wasted work, hence allow
    // filters are tested *only* if there is a (unlikely) hit on a block
    // filter.

    var requestHostname = context.requestHostname;
    var party = isFirstParty(context.pageDomain, requestHostname) ? FirstParty : ThirdParty;

    // This will be used by hostname-based filters
    pageHostname = context.pageHostname || '';

    var bf, bucket;
    var categories = this.categories;

    // Tokenize only once
    this.tokenize(url);


    // https://github.com/gorhill/uBlock/issues/139
    // Test against important block filters.
    // The purpose of the `important` option is to reverse the order of
    // evaluation. Normally, it is "evaluate block then evaluate allow", with
    // the `important` property it is "evaluate allow then evaluate block".
    if ( bucket = categories[this.makeCategoryKey(BlockAnyTypeAnyParty | Important)] ) {
        bf = this.matchTokens(bucket, url);
        if ( bf !== false ) {
            return 'sb:' + bf.toString() + '$important';
        }
    }
    if ( bucket = categories[this.makeCategoryKey(BlockAnyType | Important | party)] ) {
        bf = this.matchTokens(bucket, url);
        if ( bf !== false ) {
            return 'sb:' + bf.toString() + '$important';
        }
    }
    if ( bucket = categories[this.makeCategoryKey(BlockAnyParty | Important | type)] ) {
        bf = this.matchTokens(bucket, url);
        if ( bf !== false ) {
            return 'sb:' + bf.toString() + '$important';
        }
    }
    if ( bucket = categories[this.makeCategoryKey(BlockAction | Important | type | party)] ) {
        bf = this.matchTokens(bucket, url);
        if ( bf !== false ) {
            return 'sb:' + bf.toString() + '$important';
        }
    }

    // Test hostname-based block filters
    bf = this.matchAnyPartyHostname(requestHostname);
    if ( bf === false && party === ThirdParty ) {
        bf = this.match3rdPartyHostname(requestHostname);
    }

    // Test against block filters
    if ( bf === false ) {
        if ( bucket = categories[this.makeCategoryKey(BlockAnyTypeAnyParty)] ) {
            bf = this.matchTokens(bucket, url);
        }
    }
    if ( bf === false ) {
        if ( bucket = categories[this.makeCategoryKey(BlockAnyType | party)] ) {
            bf = this.matchTokens(bucket, url);
        }
    }
    if ( bf === false ) {
        if ( bucket = categories[this.makeCategoryKey(BlockAnyParty | type)] ) {
            bf = this.matchTokens(bucket, url);
        }
    }
    if ( bf === false ) {
        if ( bucket = categories[this.makeCategoryKey(BlockAction | type | party)] ) {
            bf = this.matchTokens(bucket, url);
        }
    }

    // If there is no block filter, no need to test against allow filters
    if ( bf === false ) {
        return '';
    }

    // Test against allow filters
    var af;
    if ( bucket = categories[this.makeCategoryKey(AllowAnyTypeAnyParty)] ) {
        af = this.matchTokens(bucket, url);
        if ( af !== false ) {
            return 'sa:' + af.toString();
        }
    }
    if ( bucket = categories[this.makeCategoryKey(AllowAnyType | party)] ) {
        af = this.matchTokens(bucket, url);
        if ( af !== false ) {
            return 'sa:' + af.toString();
        }
    }
    if ( bucket = categories[this.makeCategoryKey(AllowAnyParty | type)] ) {
        af = this.matchTokens(bucket, url);
        if ( af !== false ) {
            return 'sa:' + af.toString();
        }
    }
    if ( bucket = categories[this.makeCategoryKey(AllowAction | type | party)] ) {
        af = this.matchTokens(bucket, url);
        if ( af !== false ) {
            return 'sa:' + af.toString();
        }
    }

    return 'sb:' + bf.toString();
};

/******************************************************************************/

FilterContainer.prototype.getFilterCount = function() {
    return this.blockFilterCount + this.allowFilterCount;
};

/******************************************************************************/

return new FilterContainer();

/******************************************************************************/

})();
