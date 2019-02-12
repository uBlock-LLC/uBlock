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

/* jshint bitwise: false, esnext: true, boss: true */
/* global punycode, µBlock */

/******************************************************************************/

µBlock.staticNetFilteringEngine = (function(){

    'use strict';
    
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
    
    var BlockAction = 0 << 0;
    var AllowAction = 1 << 0;
    var ToggleAction = BlockAction ^ AllowAction;
    
    var Important = 1 << 1;
    
    var AnyParty = 0 << 2;
    var FirstParty = 1 << 2;
    var ThirdParty = 2 << 2;
    
    var AnyType = 0 << 4;
    var typeNameToTypeValue = {
            'stylesheet':  1 << 4,
                 'image':  2 << 4,
                'object':  3 << 4,
                'script':  4 << 4,
        'xmlhttprequest':  5 << 4,
             'sub_frame':  6 << 4,
             'websocket':  9 << 4,
                 'other':  10 << 4,
            'main_frame':  12 << 4,  
    'cosmetic-filtering':  13 << 4,
         'inline-script':  14 << 4,
                 'popup':  15 << 4,
                 'csp'  :  16 << 4,
              'webrtc'  :  17 << 4,
              'rewrite' :  18 << 4,
          'generichide' :  19 << 4,
          'genericblock':  20 << 4
    };
    var typeOtherValue = typeNameToTypeValue.other;
    
    // All network request types to bitmap
    //   bring origin to 0 (from 4 -- see typeNameToTypeValue)
    //   left-shift 1 by the above-calculated value
    //   subtract 1 to set all type bits
    var allNetRequestTypesBitmap = (1 << (typeOtherValue >>> 4)) - 1;
    
    var BlockAnyTypeAnyParty = BlockAction | AnyType | AnyParty;
    var BlockAnyType = BlockAction | AnyType;
    var BlockAnyParty = BlockAction | AnyParty;
    
    var AllowAnyTypeAnyParty = AllowAction | AnyType | AnyParty;
    var AllowAnyType = AllowAction | AnyType;
    var AllowAnyParty = AllowAction | AnyParty;
    
    var reHostnameRule = /^[0-9a-z][0-9a-z.-]*[0-9a-z]$/;
    var reURLPostHostnameAnchors = /[\/?#]/;
    
    // ABP filters: https://adblockplus.org/en/filters
    // regex tester: http://regex101.com/
    
    /******************************************************************************/
    
    // See the following as short-lived registers, used during evaluation. They are
    // valid until the next evaluation.
    
    var pageHostnameRegister = '';
    var requestHostnameRegister = '';
    var skipGenericBlocking = false;
    //var filterRegister = null;
    //var categoryRegister = '';
    
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
    
    var alwaysTruePseudoRegex = {
        match: { '0': '', index: 0 },
        exec: function(s) {
            this.match['0'] = s;
            return this.match;
        },
        test: function() {
            return true;
        }
    };
    
    var strToRegex = function(s, anchor) {
        // https://github.com/uBlockAdmin/uBlock/issues/1038
        // Special case: always match.
        if ( s === '*' ) {
            return alwaysTruePseudoRegex;
        }
    
        // https://developer.mozilla.org/en/docs/Web/JavaScript/Guide/Regular_Expressions
        var reStr = s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
                     .replace(/\*/g, '.*');
    
        if ( anchor < 0 ) {
            reStr = '^' + reStr;
        } else if ( anchor > 0 ) {
            reStr += reStr + '$';
        }
    
        //console.debug('µBlock.staticNetFilteringEngine: created RegExp("%s")', reStr);
        return new RegExp(reStr);
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
    
    - with wildcard(s)
      - anchored within hostname
        - no hostname
        - specific hostname
      - all else
        - no hostname
        - specific hostname
    
    */
    
    var FilterCSP = function(dataStr) {
        this.dataStr = dataStr;
        this.filters = [];
    }
    FilterCSP.fid = FilterCSP.prototype.fid = 'fc';
    
    FilterCSP.prototype.toSelfie = function() {
        let filterStr;
        if(Array.isArray(this.filters)) {
            let f0 = this.filters[0];
            let f1 = this.filters[1];
            filterStr = [{[f0.fid]:f0.toSelfie()}, {[f1.fid]:f1.toSelfie()}]
        }
        else {
            let f0 = this.filters;
            filterStr = {[f0.fid]:f0.toSelfie()}
        }
        return {"dataStr":this.dataStr, "filters":JSON.stringify(filterStr)};
    };
    
    FilterCSP.fromSelfie = function(s) {
        var f = new FilterCSP();
        f.dataStr = s.dataStr;
        var item = JSON.parse(s.filters);
        let prop, value;
        if(Array.isArray(item)) {
            var arr = [];
            for(let p in item) {
                prop = Object.keys(item[p])[0];
                value = Object.values(item[p])[0];
                arr.push(FilterContainer.factories[prop].fromSelfie(value));
            }
            f.filters = arr;
        } else {
            prop = Object.keys(item)[0];
            value = Object.values(item)[0];
            let filter = FilterContainer.factories[prop].fromSelfie(value);
            f.filters = filter;
        }
        return f;
    };
    
    FilterCSP.prototype.toString = function() {
        var filters = this.filters;
        if(Array.isArray(filters)) {
            let f0 = filters[0];
            let f1 = filters[1];
            return f0.toString() +'^$csp=' + this.dataStr + "," + f1.toString();
        } else {
            return filters.toString() +'^$csp=' + this.dataStr;
        }
    };
    
    FilterCSP.prototype.toJSON = function() {
        return {[this.fid]:this.toSelfie()};
    };
    
    FilterCSP.prototype.match = function(url, tokenBeg) {
        var filters = this.filters;
        if(Array.isArray(filters)) {
            let f0 = filters[0];
            let f1 = filters[1];
            if ( f0.match(url, tokenBeg) !== false && f1.match()) {
                return true;
            }
        } else {
            if ( filters.match(url, tokenBeg) !== false){
                return true;
            }
        }
        return false;
    }
    /**************************************************/
    var FilterDomain = function(index) {
        this.index = index;
    }
    
    FilterDomain.fid = FilterDomain.prototype.fid = 'd';
    
    FilterDomain.prototype.toString = function() {
        return µb.domainHolder.toString(this.index);
    };
    FilterDomain.prototype.toSelfie = function() {
        return this.index;
    };
    FilterDomain.prototype.match = function() {
        return µb.domainHolder.match(this.index, pageHostnameRegister);
    }
    FilterDomain.compile = function(domainList) {
        if(domainList != "")
            return domainList;
        else return "";
    };
    FilterDomain.fromSelfie = function(index) {
        return new FilterDomain(index);
    };
    FilterDomain.prototype.toJSON = function() {
        return {[this.fid]: this.toSelfie()};
    } 

    /******************************************************************************/
    
    var FilterPlain = function(s, tokenBeg) {
        this.s = s;
        this.tokenBeg = tokenBeg;
    };
    
    FilterPlain.prototype.match = function(url, tokenBeg) {
        return url.substr(tokenBeg - this.tokenBeg, this.s.length) === this.s;
    };
    
    FilterPlain.fid = FilterPlain.prototype.fid = 'a';
    
    FilterPlain.prototype.toString = function() {
        return this.s;
    };
    
    FilterPlain.prototype.toSelfie = function() {
        return this.s + '\t' +
               this.tokenBeg;
    };
    
    FilterPlain.compile = function(details) {
        return details.f + '\t' + details.tokenBeg;
    };
    
    FilterPlain.fromSelfie = function(s) {
        var pos = s.indexOf('\t');
        return new FilterPlain(s.slice(0, pos), atoi(s.slice(pos + 1)));
    };
    FilterPlain.prototype.toJSON = function() {
        return {[this.fid]: this.toSelfie()};
    } 
    /******************************************************************************/
    
    var FilterPlainPrefix0 = function(s) {
        this.s = s;
    };
    
    FilterPlainPrefix0.prototype.match = function(url, tokenBeg) {
        return url.substr(tokenBeg, this.s.length) === this.s;
    };
    
    FilterPlainPrefix0.fid = FilterPlainPrefix0.prototype.fid = '0a';
    
    FilterPlainPrefix0.prototype.toString = function() {
        return this.s;
    };
    
    FilterPlainPrefix0.prototype.toSelfie = function() {
        return this.s;
    };
    
    FilterPlainPrefix0.compile = function(details) {
        return details.f;
    };
    
    FilterPlainPrefix0.fromSelfie = function(s) {
        return new FilterPlainPrefix0(s);
    };
    FilterPlainPrefix0.prototype.toJSON = function() {
        return {[this.fid]: this.toSelfie()};
    } 
    /******************************************************************************/
    var FilterPlainPrefix1 = function(s) {
        this.s = s;
    };
    
    FilterPlainPrefix1.prototype.match = function(url, tokenBeg) {
        return url.substr(tokenBeg - 1, this.s.length) === this.s;
    };
    
    FilterPlainPrefix1.fid = FilterPlainPrefix1.prototype.fid = '1a';
    
    FilterPlainPrefix1.prototype.toString = function() {
        return this.s;
    };
    
    FilterPlainPrefix1.prototype.toSelfie = function() {
        return this.s;
    };
    
    FilterPlainPrefix1.compile = function(details) {
        return details.f;
    };
    
    FilterPlainPrefix1.fromSelfie = function(s) {
        return new FilterPlainPrefix1(s);
    };
    FilterPlainPrefix1.prototype.toJSON = function() {
        return {[this.fid]: this.toSelfie()};
    } 
    /******************************************************************************/
    
    var FilterPlainLeftAnchored = function(s) {
        this.s = s;
    };
    
    FilterPlainLeftAnchored.prototype.match = function(url) { 
        return url.slice(0, this.s.length) === this.s;
    };
    
    FilterPlainLeftAnchored.fid = FilterPlainLeftAnchored.prototype.fid = '|a';
    
    FilterPlainLeftAnchored.prototype.toString = function() {
        return '|' + this.s;
    };
    
    FilterPlainLeftAnchored.prototype.toSelfie = function() {
        return this.s;
    };
    
    FilterPlainLeftAnchored.compile = function(details) {
        return details.f;
    };
    
    FilterPlainLeftAnchored.fromSelfie = function(s) {
        return new FilterPlainLeftAnchored(s);
    };
    FilterPlainLeftAnchored.prototype.toJSON = function() {
        return {[this.fid]: this.toSelfie()};
    } 
    
    /******************************************************************************/
    var FilterPlainRightAnchored = function(s) {
       this.s = s;
    };
    FilterPlainRightAnchored.prototype.match = function(url) {
        return url.slice(-this.s.length) === this.s;
    };
    
    FilterPlainRightAnchored.fid = FilterPlainRightAnchored.prototype.fid = 'a|';
    
    FilterPlainRightAnchored.prototype.toString = function() {
        return this.s + '|';
    };
    
    FilterPlainRightAnchored.prototype.toSelfie = function() {
        return this.s;
    };
    
    FilterPlainRightAnchored.compile = function(details) {
        return details.f;
    };
    
    FilterPlainRightAnchored.fromSelfie = function(s) {
        return new FilterPlainRightAnchored(s);
    };
    FilterPlainRightAnchored.prototype.toJSON = function() {
        return {[this.fid]: this.toSelfie()};
    } 
    /******************************************************************************/
    
    /******************************************************************************/
    
    // https://github.com/uBlockAdmin/uBlock/issues/235
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
    
    FilterPlainHnAnchored.fid = FilterPlainHnAnchored.prototype.fid = '||a';
    
    FilterPlainHnAnchored.prototype.toString = function() {
        return '||' + this.s;
    };
    
    FilterPlainHnAnchored.prototype.toSelfie = function() {
        return this.s;
    };
    
    FilterPlainHnAnchored.compile = function(details) {
        return details.f;
    };
    
    FilterPlainHnAnchored.fromSelfie = function(s) {
        return new FilterPlainHnAnchored(s);
    };
    FilterPlainHnAnchored.prototype.toJSON = function() {
        return {[this.fid]: this.toSelfie()};
    } 
    /******************************************************************************/
    
    // Generic filter
    
    var FilterGeneric = function(s, anchor) {
        this.s = s;
        this.anchor = anchor;
        this.re = null;
    };
    FilterGeneric.prototype.match = function(url) {
        if ( this.re === null ) {
            this.re = strToRegex(this.s, this.anchor);
        }
        return this.re.test(url);
    };
    
    FilterGeneric.fid = FilterGeneric.prototype.fid = '_';
    
    FilterGeneric.prototype.toString = function() {
        if ( this.anchor === 0 ) {
            return this.s;
        }
        if ( this.anchor < 0 ) {
            return '|' + this.s;
        }
        return this.s + '|';
    };
    
    FilterGeneric.prototype.toSelfie = function() {
        return this.s + '\t' + this.anchor;
    };
    
    FilterGeneric.compile = function(details) {
        return details.f + '\t' + details.anchor;
    };
    
    FilterGeneric.fromSelfie = function(s) {
        var pos = s.indexOf('\t');
        return new FilterGeneric(s.slice(0, pos), parseInt(s.slice(pos + 1), 10));
    };
    FilterGeneric.prototype.toJSON = function() {
        return {[this.fid]: this.toSelfie()};
    } 
    /******************************************************************************/
    
    // Generic filter: hostname-anchored: it has that extra test to find out
    // whether the start of the match falls within the hostname part of the
    // URL.
    
    var FilterGenericHnAnchored = function(s) {
        this.s = s;
    };
    FilterGenericHnAnchored.prototype.re = null;
    FilterGenericHnAnchored.prototype.match = function(url) {
        if ( this.re === null ) {
            this.re = strToRegex(this.s, 0);
        }
        // Quick test first
        if ( this.re.test(url) === false ) {
            return false;
        }
        // Valid only if begininning of match is within the hostname
        // part of the url
        let match = this.re.exec(url);
        let pos = url.indexOf('://');
        return pos !== -1 &&
               reURLPostHostnameAnchors.test(url.slice(pos + 3, match.index)) === false;
    };
    
    FilterGenericHnAnchored.fid = FilterGenericHnAnchored.prototype.fid = '||_';
    
    FilterGenericHnAnchored.prototype.toString = function() {
        return '||' + this.s;
    };
    
    FilterGenericHnAnchored.prototype.toSelfie = function() {
        return this.s;
    };
    
    FilterGenericHnAnchored.compile = function(details) {
        return details.f;
    };
    
    FilterGenericHnAnchored.fromSelfie = function(s) {
        return new FilterGenericHnAnchored(s);
    };
    FilterGenericHnAnchored.prototype.toJSON = function() {
        return {[this.fid]: this.toSelfie()};
    } 
    /******************************************************************************/
    
    /******************************************************************************/
    
    // Regex-based filters
    
    var FilterRegex = function(s) {
        this.re = new RegExp(s);

    };
    FilterRegex.prototype.match = function(url) {
        return this.re.test(url);
    };
    
    FilterRegex.fid = FilterRegex.prototype.fid = '//';
    
    FilterRegex.prototype.toString = function() {
        return '/' + this.re.source + '/';
    };
    
    FilterRegex.prototype.toSelfie = function() {
        return this.re.source;
    };
    
    FilterRegex.compile = function(details) {
        return details.f;
    };
    
    FilterRegex.fromSelfie = function(s) {
        return new FilterRegex(s);
    };
    FilterRegex.prototype.toJSON = function() {
        return {[this.fid]: this.toSelfie()};
    } 
    
    var FilterRegexRewrite = function(s,rewrite){
        FilterRegex.call(this,s);
        this.rewrite = rewrite;
    }
    FilterRegexRewrite.prototype = Object.create(FilterRegex.prototype);
    FilterRegexRewrite.prototype.constructor = FilterRegexRewrite;
    
    FilterRegexRewrite.prototype.match = function(url) {
        return FilterRegex.prototype.match.call(this, url); 
    };
    
    FilterRegexRewrite.fid = FilterRegexRewrite.prototype.fid = '//r';
    
    FilterRegexRewrite.prototype.toString = function() {
        return '/' + this.re.source + '/' + '$rewrite=' + this.rewrite;
    };
    
    FilterRegexRewrite.prototype.toSelfie = function() {
        return this.re.source + '\t' + this.rewrite;
    };
    
    FilterRegexRewrite.compile = function(details) {
        return details.f + '\t' + details.rewrite;
    };
    
    FilterRegexRewrite.fromSelfie = function(s) {
        let pos = s.indexOf('\t');
        return new FilterRegexRewrite(s.slice(0, pos), s.slice(pos + 1));
    };
    FilterRegexRewrite.prototype.toJSON = function() {
        return {[this.fid]: this.toSelfie()};
    } 
    
    var FilterRewrite = function(s,rewrite) {
        this.s = s;
        this.rewrite = rewrite;
    }
    FilterRewrite.prototype = Object.create(FilterPlainHnAnchored.prototype);
    FilterRewrite.prototype.constructor = FilterRewrite;
    
    FilterRewrite.prototype.match = function(url,tokenBeg) {
        return FilterPlainHnAnchored.prototype.match.call(this, url,tokenBeg); 
    };
    
    FilterRewrite.fid = FilterRewrite.prototype.fid = '||r';
    
    FilterRewrite.prototype.toString = function() {
        return '||' + this.s + '$rewrite=' + this.rewrite;
    };
    
    FilterRewrite.prototype.toSelfie = function() {
        return this.s + '\t' + this.rewrite;
    };
    
    FilterRewrite.compile = function(details) {
        return details.f + '\t' + details.rewrite;
    };
    
    FilterRewrite.fromSelfie = function(s) {
        let pos = s.indexOf('\t');
        return new FilterRewrite(s.slice(0, pos), s.slice(pos + 1));
    };
    FilterRewrite.prototype.toJSON = function() {
        return {[this.fid]: this.toSelfie()};
    } 
    /******************************************************************************/
    
    /******************************************************************************/
    /******************************************************************************/
    
    // Dictionary of hostnames
    //
    // FilterHostnameDict is the main reason why uBlock is not equipped to keep
    // track of which filter comes from which list, and also why it's not equipped
    // to be able to disable a specific filter -- other than through using a
    // counter-filter.
    //
    // On the other hand it is also *one* of the reason uBlock's memory and CPU
    // footprint is smaller. Compacting huge list of hostnames into single strings
    // saves a lot of memory compared to having one dictionary entry per hostname.
    
    var FilterHostnameDict = function() {
        this.h = ''; // short-lived register
        this.dict = new Set();
    };
    
    FilterHostnameDict.prototype.add = function(hn) {
        let hns = hn;
        if ( this.dict.has(hns) === true ) { return false; }
            this.dict.add(hns);
        return true;
    };
    
    FilterHostnameDict.prototype.match = function() {
    
        // TODO: mind IP addresses
    
        let pos,
            hostname = requestHostnameRegister;
        while ( this.dict.has(hostname) === false ) {
            pos = hostname.indexOf('.');
            if ( pos === -1 ) {
                this.h = '';
                return false;
            }
            hostname = hostname.slice(pos + 1);
        }
        this.h = '||' + hostname + '^';
        return this;
    };
    
    FilterHostnameDict.fid = FilterHostnameDict.prototype.fid = '{h}';
    
    FilterHostnameDict.prototype.toString = function() {
        return this.h;
    };
    
    FilterHostnameDict.prototype.toSelfie = function() {
        return JSON.stringify(Array.from(this.dict));
    };
    FilterHostnameDict.prototype.toJSON = function() {
        return {[this.fid]:this.toSelfie()};
    };
    
    FilterHostnameDict.fromSelfie = function(s) {
        let f = new FilterHostnameDict();
        let o = JSON.parse(s);
        f.dict = new Set(o);
        return f;
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
        let filters = this.filters;
        let pivot = filters.length >>> 1;
        while ( i < pivot ) {
            pivot >>>= 1;
            if ( pivot < this.vip ) {
                break;
            }
        }
        if ( i <= pivot ) {
            return;
        }
        let j = this.promoted % pivot;
        //console.debug('FilterBucket.promote(): promoted %d to %d', i, j);
        let f = filters[j];
        filters[j] = filters[i];
        filters[i] = f;
        this.promoted += 1;
    };
    
    FilterBucket.prototype.match = function(url, tokenBeg) {
        let filters = this.filters;
        let n = filters.length;
        for ( let i = 0; i < n; i++ ) {
            if(Array.isArray(filters[i])) {
                let f0 = filters[i][0];
                let f1 = filters[i][1];
                if(f0.fid.indexOf('h') === -1 && skipGenericBlocking) {
                    continue;
                }
                if ( f0.match(url, tokenBeg) !== false && f1.match()) {
                    this.f = filters[i];
                    if ( i >= this.vip ) {
                        this.promote(i);
                    }
                    return true;
                }
            } else {
                if(filters[i].fid.indexOf('h') === -1 && skipGenericBlocking) {
                    continue;
                }
                if ( filters[i].match(url, tokenBeg) !== false) { 
                    this.f = filters[i];
                    if ( i >= this.vip ) {
                        this.promote(i);
                    }
                    return true;
                }
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
        let str = this.filters.map(
            function(x) {
                if(Array.isArray(x)) {
                    return [{[x[0].fid]:x[0].toSelfie()}, {[x[1].fid]:x[1].toSelfie()}]
                }
                else {
                    return {[x.fid]:x.toSelfie()}
                }
            }   
        );
        return JSON.stringify(str);
    };
    
    FilterBucket.fromSelfie = function(s) {
        let f = new FilterBucket();
        let o = JSON.parse(s);
        let arr = [];
        for(let key in o) {
            let item = o[key];
            let prop, value;
            if(Array.isArray(item)) {
                let arrF = [];
                for(let p in item) {
                    prop = Object.keys(item[p])[0];
                    value = Object.values(item[p])[0];
                    arrF.push(FilterContainer.factories[prop].fromSelfie(value));
                }
                arr.push(arrF);
            } else {
                prop = Object.keys(item)[0];
                value = Object.values(item)[0];
                let filter = FilterContainer.factories[prop].fromSelfie(value);
                arr.push(filter);
            }
          }
        f.filters = arr;
        return f;
    };
    FilterBucket.prototype.toJSON = function() {
        return {[this.fid]:this.toSelfie()};
    };
    
    /******************************************************************************/
    
    var getFilterClass = function(details) {
        if ( details.isRegex ) {
            if(details.rewrite != '')
                return FilterRegexRewrite;
            else
                return FilterRegex;
        }
        if(details.rewrite != '')
            return FilterRewrite;
    
        var s = details.f;
        if ( s.indexOf('*') !== -1 || details.token === '*' ) {
            if ( details.hostnameAnchored ) {
                return FilterGenericHnAnchored;
            }
            return FilterGeneric;
        }
        if ( details.anchor < 0 ) {
            return FilterPlainLeftAnchored;
        }
        if ( details.anchor > 0 ) {
            return FilterPlainRightAnchored;
        }
        if ( details.hostnameAnchored ) {
            return FilterPlainHnAnchored;
        }
        if ( details.tokenBeg === 0 ) {
            return FilterPlainPrefix0;
        }
        if ( details.tokenBeg === 1 ) {
            return FilterPlainPrefix1;
        }
        
        return FilterPlain;
    };
    
    /******************************************************************************/
    
    // Trim leading/trailing char "c"
    
    var trimChar = function(s, c) {
        // Remove leading and trailing wildcards
        let pos = 0;
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
        this.reHasWildcard = /[\^\*]/;
        this.reHasUppercase = /[A-Z]/;
        this.reCleanupHostname = /^\|\|[.*]*/;
        this.reIsolateHostname = /^([^\x00-\x24\x26-\x2C\x2F\x3A-\x5E\x60\x7B-\x7F]+)(.*)/;
        this.reHasUnicode = /[^\x00-\x7F]/;
        this.hostnames = [];
        this.notHostnames = [];
        this.dataType = '';
        this.dataStr = '';
        this.rewrite = '';
        this.reset();
    };
    
    /******************************************************************************/
    
    FilterParser.prototype.toNormalizedType = {
            'stylesheet': 'stylesheet',
                 'image': 'image',
                'object': 'object',
     'object-subrequest': 'object',
                'script': 'script',
                   'xhr': 'xmlhttprequest',
        'xmlhttprequest': 'xmlhttprequest',
           'subdocument': 'sub_frame',
                  'ping': 'other',
                 'other': 'other',
              'document': 'main_frame',
              'elemhide': 'cosmetic-filtering',
         'inline-script': 'inline-script',
                 'popup': 'popup',
                  'csp' : 'csp', 
             'websocket': 'websocket',
                'webrtc': 'webrtc',
               'rewrite': 'rewrite',
           'generichide': 'generichide',
          'genericblock': 'genericblock'
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
        this.notHostnames.length = 0;
        this.domainList = '';
        this.isRegex = false;
        this.thirdParty = false;
        this.token = '';
        this.tokenBeg = 0;
        this.tokenEnd = 0;
        this.types = 0;
        this.important = 0;
        this.unsupported = false;
        this.dataType = '';
        this.dataStr = '';
        return this;
    };
    
    /******************************************************************************/
    
    // https://github.com/uBlockAdmin/uBlock/issues/589
    // Be ready to handle multiple negated types
    
    FilterParser.prototype.parseOptType = function(raw, not) {
        var typeBit = 1 << ((typeNameToTypeValue[this.toNormalizedType[raw]] >>> 4) - 1);
    
        if ( !not ) {
            this.types |= typeBit;
            return;
        }
    
        // Negated type: set all valid network request type bits to 1
        if ( this.types === 0 ) {
            this.types = allNetRequestTypesBitmap;
        }
    
        this.types &= ~typeBit;
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
        var hostname;
        for ( var i = 0; i < hostnames.length; i++ ) {
            hostname = hostnames[i];
            if ( hostname.charAt(0) === '~' ) {
                this.notHostnames.push(hostname.slice(1));
            } else {
                this.hostnames.push(hostname);
            }
        }
    };
    
    /******************************************************************************/
    
    FilterParser.prototype.parseOptions = function(s) {
        this.fopts = s;
        let opts =  decode(encode(s.split(',')));
        let opt, not;
        for ( let i = 0; i < opts.length; i++ ) {
            opt = opts[i];
            not = opt.charAt(0) === '~';
            if ( not ) {
                opt = opt.slice(1);
            }
            if ( opt === 'third-party' ) {
                this.parseOptParty(not);
                continue;
            }
            if ( opt === 'elemhide' ) {
                if ( not === false ) {   
                    this.parseOptType('elemhide', false);
                    continue;
                }
                this.unsupported = true;
                break;
            }
            if ( opt === 'generichide' ) {
                if ( not === false ) {      
                    this.parseOptType('generichide', false);
                    continue;
                }
                this.unsupported = true;
                break;
            }
            if ( opt === 'document' ) {
                this.parseOptType('document', not);
                continue;
            }
            if ( opt.startsWith('csp=') ) {
                if ( opt.length > 4) {
                    this.parseOptType('csp', not);
                    this.dataType = 'csp';
                    this.dataStr = decode(encode(opt.slice(4).trim()));
                }
                continue;
            }
            if ( opt === 'csp' && this.action === AllowAction ) {
                this.parseOptType('csp', not);
                this.dataType = 'csp';
                this.dataStr = '';
                continue;
            }
            if ( opt.slice(0,8) === 'rewrite=') {
                this.parseOptType('rewrite', not);
                this.rewrite = opt.slice(8);
                continue;
            }
            if ( this.toNormalizedType.hasOwnProperty(opt) ) {
                this.parseOptType(opt, not);
                continue;
            }
            if ( opt.slice(0,7) === 'domain=' ) {
                this.domainList = decode(encode(opt.slice(7).trim()));
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
    };
    
    /******************************************************************************/
    
    FilterParser.prototype.parse = function(raw) {
        // important!
        this.reset();
        
        let s = raw;
       
        // plain hostname?
        if ( reHostnameRule.test(s) ) {
            this.f = s;
            this.hostnamePure = this.hostnameAnchored = true;
            return this;
        }
    
        // element hiding filter?
        let pos = s.indexOf('#');
        if ( pos !== -1 ) {
            let c = s.charAt(pos + 1);
            if ( c === '#' || c === '@' ) {
                //console.error('static-net-filtering.js > unexpected cosmetic filters');
                this.elemHiding = true;
                return this;
            }
        }
    
        // block or allow filter?
        // Important: this must be executed before parsing options
        if ( s.lastIndexOf('@@', 0) === 0 ) {
            this.action = AllowAction;
            s = s.slice(2);
        }
    
        // options
        pos = s.indexOf('$');
        if ( pos !== -1 ) {
            this.parseOptions(s.slice(pos + 1));
            s = s.slice(0, pos);
        }
    
        // regex?
        if ( s.charAt(0) === '/' && s.slice(-1) === '/' && s.length > 2 ) {
            this.isRegex = true;
            this.f = s.slice(1, -1);
            return this;
        }
    
        // hostname-anchored
        if ( s.lastIndexOf('||', 0) === 0 ) {
            this.hostnameAnchored = true;
            // cleanup: `||example.com`, `||*.example.com^`, `||.example.com/*`
            s = s.replace(this.reCleanupHostname, '');
            // convert hostname to punycode if needed
            if ( this.reHasUnicode.test(s) ) {
                var matches = this.reIsolateHostname.exec(s);
                if ( matches && matches.length === 3 ) {
                    s = punycode.toASCII(matches[1]) + matches[2];
                    //console.debug('µBlock.staticNetFilteringEngine/FilterParser.parse():', raw, '=', s);
                }
            }
    
            // https://github.com/uBlockAdmin/uBlock/issues/1096
            if ( s.charAt(0) === '^' ) {
                this.unsupported = true;
                return this;
            }
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
        if ( this.reHasWildcard.test(s) ) {
            s = s.replace(/\^/g, '*').replace(/\*\*+/g, '*');
            s = trimChar(s, '*');
        }
    
        // nothing left?
        if ( s === '' ) {
            s = '*';
        }
    
        // plain hostname?
        this.hostnamePure = this.hostnameAnchored && reHostnameRule.test(s);
    
        // This might look weird but we gain memory footprint by not going through
        // toLowerCase(), at least on Chromium. Because copy-on-write?
    
        this.f = this.reHasUppercase.test(s) ? s.toLowerCase() : s;
    
        return this;
    };
    
    /******************************************************************************/
    
    // Given a string, find a good token. Tokens which are too generic, i.e. very
    // common with a high probability of ending up as a miss, are not
    // good. Avoid if possible. This has a *significant* positive impact on
    // performance.
    // These "bad tokens" are collated manually.
    
    var reHostnameToken = /^[0-9a-z]+/g;
    var reGoodToken = /[%0-9a-z]{2,}/g;
    
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
        let matches;
        while ( matches = reGoodToken.exec(s) ) {
            if ( s.charAt(reGoodToken.lastIndex) === '*' ) {
                continue;
            }
            if ( badTokens.hasOwnProperty(matches[0]) ) {
                continue;
            }
            return matches;
        }
        // No good token found, try again without minding "bad" tokens
        reGoodToken.lastIndex = 0;
        while ( matches = reGoodToken.exec(s) ) {
            if ( s.charAt(reGoodToken.lastIndex) === '*' ) {
                continue;
            }
            return matches;
        }
        return null;
    };
    
    var findHostnameToken = function(s) {
        reHostnameToken.lastIndex = 0;
        return reHostnameToken.exec(s);
    };
    
    /******************************************************************************/
    
    FilterParser.prototype.makeToken = function() {
        if ( this.isRegex ) {
            this.token = '*';
            return;
        }
    
        let s = this.f;
    
        // https://github.com/uBlockAdmin/uBlock/issues/1038
        // Match any URL.
        if ( s === '*' ) {
            this.token = '*';
            return;
        }
    
        let matches;
    
        // Hostname-anchored with no wildcard always have a token index of 0.
        if ( this.hostnameAnchored && s.indexOf('*') === -1 ) {
            matches = findHostnameToken(s);
            if ( !matches || matches[0].length === 0 ) {
                return;
            }
            this.tokenBeg = matches.index;
            this.tokenEnd = reHostnameToken.lastIndex;
            this.token = µb.tokenHash(s.slice(this.tokenBeg, this.tokenEnd));
            return;
        }
    
        matches = findFirstGoodToken(s);
        if ( matches === null || matches[0].length === 0 ) {
            this.token = '*';
            return;
        }
        this.tokenBeg = matches.index;
        this.tokenEnd = reGoodToken.lastIndex;
        this.token = µb.tokenHash(s.slice(this.tokenBeg, this.tokenEnd));
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
        this.duplicateBuster = {};
        this.categories = Object.create(null);
        this.cspFilters = Object.create(null);
        this.filterParser.reset();
        this.filterCounts = {};
        this.cspSubsets = new Map();
        µb.domainHolder.reset();
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.freeze = function() {
        this.duplicateBuster = {};
        this.filterParser.reset();
        this.frozen = true;
    };
    
    /******************************************************************************/

    FilterContainer.factories = {
        '[]': FilterBucket,
         'a': FilterPlain,
        '0a': FilterPlainPrefix0,
        '1a': FilterPlainPrefix1,
        '|a': FilterPlainLeftAnchored,
        'a|': FilterPlainRightAnchored,
       '||a': FilterPlainHnAnchored,
       '||r': FilterRewrite,
        '//': FilterRegex,
       '//r': FilterRegexRewrite,
       '{h}': FilterHostnameDict,
         '_': FilterGeneric,
       '||_': FilterGenericHnAnchored,
         'd': FilterDomain,
        'fc': FilterCSP
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.toSelfie = function() {
        return {
            processedFilterCount: this.processedFilterCount,
            acceptedCount: this.acceptedCount,
            rejectedCount: this.rejectedCount,
            allowFilterCount: this.allowFilterCount,
            blockFilterCount: this.blockFilterCount,
            duplicateCount: this.duplicateCount,
            categories: JSON.stringify(this.categories), 
            cspFilters: JSON.stringify(this.cspFilters) 
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
        var fc = this;
        var filterFromSelfie = function(s) {
    
            function getSelfie(tokenEntries) {
                let selfie;
                
                for(let prop in tokenEntries) {
                  var item = tokenEntries[prop];
                  selfie = FilterContainer.factories[prop].fromSelfie(item);
                }
                return selfie;
            }
    
            var categories = JSON.parse(s);
    
            var categoriesDict = {}; 
    
            for(let category in categories) {
                
                if(typeof categoriesDict[category] == "undefined" )
                    categoriesDict[category] = Object.create(null);
                
                let categoryItem = categories[category];
    
                for(let token in categoryItem) {
                
                if(typeof categoriesDict[category][token] == "undefined" )
                    categoriesDict[category][token] = Object.create(null);
                
                    if(Array.isArray(categoryItem[token])) { 
                        categoriesDict[category][token] = [getSelfie(categoryItem[token][0]), getSelfie(categoryItem[token][1])]; 
                    }
                    else {
                        categoriesDict[category][token] = getSelfie(categoryItem[token]);
                    }
                };
            }
            return categoriesDict;
        }
        this.categories = filterFromSelfie(selfie.categories);
        this.cspFilters = filterFromSelfie(selfie.cspFilters);
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.makeCategoryKey = function(category) {
        return category.toString(16);
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.compile = function(raw, out) {
        // ORDER OF TESTS IS IMPORTANT!
        
        // Ignore empty lines
        let s = raw.trim();
       
        if ( s.length === 0 ) {
            return false;
        }
        
        // Ignore comments
        var c = s.charAt(0);
        if ( c === '[' || c === '!' ) {
            return false;
        }
    
        var parsed = this.filterParser.parse(s);
    
        // Ignore element-hiding filters
        if ( parsed.elemHiding ) {
            return false;
        }
    
        // Ignore filters with unsupported options
        if ( parsed.unsupported ) {
            //console.log('static-net-filtering.js > FilterContainer.add(): unsupported filter "%s"', raw);
            return false;
        }
    
        // Pure hostnames, use more efficient liquid dict
        // https://github.com/uBlockAdmin/uBlock/issues/665
        // Create a dict keyed on request type etc.
        if ( parsed.hostnamePure && this.compileHostnameOnlyFilter(parsed, out)) {
            return true;
        }
    
        let r = this.compileFilter(parsed, out);
        if ( r === false ) {
            return false;
        }
    
        return true;
    };
    
    /******************************************************************************/
    
    // Using fast/compact dictionary when filter is a (or portion of) pure hostname.
    
    FilterContainer.prototype.compileHostnameOnlyFilter = function(parsed, out) {
        // Can't fit the filter in a pure hostname dictionary.
        if ( parsed.hostnames.length !== 0 || parsed.notHostnames.length !== 0 || parsed.dataType == 'csp' || parsed.rewrite != '' || parsed.domainList != '') {
            return;
        }
    
        let party = AnyParty;
        if ( parsed.firstParty !== parsed.thirdParty ) {
            party = parsed.firstParty ? FirstParty : ThirdParty;
        }
        let keyShard = parsed.action | parsed.important | party;
    
        let type = parsed.types;
        if ( type === 0 ) {
            out.push([this.makeCategoryKey(keyShard), '.', parsed.f]);
            return true;
        }
    
        let bitOffset = 1;
        do {
            if ( type & 1 ) {
                out.push([this.makeCategoryKey(keyShard | (bitOffset << 4)), '.', parsed.f]);
            }
            bitOffset += 1;
            type >>>= 1;
        } while ( type !== 0 );
        return true;
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.compileFilter = function(parsed, out) {
        parsed.makeToken();
        if ( parsed.token === '' ) {
            console.error('static-net-filtering.js > FilterContainer.addFilter("%s"): can\'t tokenize', parsed.f);
            return false;
        }
    
        let party = AnyParty;
        if ( parsed.firstParty !== parsed.thirdParty ) {
            party = parsed.firstParty ? FirstParty : ThirdParty;
        }
    
        let filterClass;
        let i = parsed.hostnames.length;
        let j = parsed.notHostnames.length;
        
        filterClass = getFilterClass(parsed);
        if ( filterClass === null ) {
            return false;
        }
        this.compileToAtomicFilter(filterClass, parsed, party, out);
        return true;
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.compileToAtomicFilter = function(filterClass, parsed, party, out, hostname) {
        let bits = parsed.action | parsed.important | party;
        let type = parsed.types;
        let obj = {};
        obj.compiled = filterClass.compile(parsed, hostname);
        
        if(parsed.dataStr != "") {
            obj.csp = parsed.dataStr
        }
        
        if(parsed.domainList != "") {
            obj.domains = parsed.domainList;
        }
        
        if ( type === 0 ) {
            out.push([this.makeCategoryKey(bits), parsed.token, filterClass.fid, JSON.stringify(obj)]);
            return;
        }
        var bitOffset = 1;
        do {
            if ( type & 1 ) {
                out.push([this.makeCategoryKey(bits | (bitOffset << 4)), parsed.token, filterClass.fid, JSON.stringify(obj)]);
            }
            bitOffset += 1;
            type >>>= 1;
        } while ( type !== 0 );
    };
    
    /******************************************************************************/
    
    
    FilterContainer.prototype.fromCompiledContent = function(text) {
        
        let bucket, entry, factory, filter;
        
        for(let i =0; i < text.length; i++) {

            let line, fields;
            
            fields = text[i];
            
            line = fields.join("\v");
    
            this.acceptedCount += 1;
    
            let blnCspMatch = false;
            
            if(fields.length > 2) {
                if(line.indexOf("\"csp\":") !== -1) {
                    blnCspMatch = true;
                }
            }
    
            if(blnCspMatch) {
                bucket = this.cspFilters[fields[0]];
                if ( bucket === undefined ) {
                    bucket = this.cspFilters[fields[0]] = Object.create(null);
                }
            }
            else {
                bucket = this.categories[fields[0]];
                if ( bucket === undefined ) {
                    bucket = this.categories[fields[0]] = Object.create(null);
                }
            }
            
            entry = bucket[fields[1]];
            
            if ( fields[1] === '.' ) {
                
                if ( entry === undefined ) {
                    entry = bucket['.'] = new FilterHostnameDict();
                }
                if ( entry.add(fields[2]) === false ) {
                    this.duplicateCount += 1;
                }
                continue;
            }
            
            if ( this.duplicateBuster.hasOwnProperty(line) ) {
                this.duplicateCount += 1;
                continue;
            }
            
            this.duplicateBuster[line] = true;
    
            factory = FilterContainer.factories[fields[2]];
           
            fields[3] = JSON.parse(fields[3]);
            
            if(fields[3].domains != undefined) {
               let domainIndex = µb.domainHolder.getIndex(fields[3].domains);  
               filter = [factory.fromSelfie(fields[3].compiled), FilterDomain.fromSelfie(domainIndex)];
            } else {
                filter = factory.fromSelfie(fields[3].compiled);
            }
            
            if(blnCspMatch && fields[3].csp != undefined) {
                let csp =  new FilterCSP();
                csp.dataStr = fields[3].csp;
                csp.filters = filter;
                filter = csp;
            }
            
            if ( entry === undefined ) {
                bucket[fields[1]] = filter;
                continue;
            }
            if ( entry.fid === '[]' ) {
                entry.add(filter);
                continue;
            }
            bucket[fields[1]] = new FilterBucket(entry, filter);
        }
        return true;
    };
    
    /******************************************************************************/
    
    // Since the addition of the `important` evaluation, this means it is now
    // likely that the url will have to be scanned more than once. So this is
    // to ensure we do it once only, and reuse results.
    
    FilterContainer.prototype.tokenize = function(url) {
        this.tokens = [];
        let tokens = this.tokens;
        let re = this.reAnyToken;
        let matches, tokenEntry;
        re.lastIndex = 0;
        let i = 0;
        while ( matches = re.exec(url) ) {
            tokenEntry = tokens[i];
            if ( tokenEntry === undefined ) {
                tokenEntry = tokens[i] = new TokenEntry();
            }
            tokenEntry.beg = matches.index;
            tokenEntry.token = µb.tokenHash(matches[0]);
            i += 1;
    
            // https://github.com/uBlockAdmin/uBlock/issues/1118
            // Crazy case... but I guess we have to expect the worst...
            if ( i === 2048 ) {
                break;
            }
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
        // Hostname-only filters
        let f = bucket['.'];
        if ( f !== undefined && !skipGenericBlocking && f.match() !== false) {
            return f;
        }
    
        let tokens = this.tokens;
        let tokenEntry, token;
        let i = 0;
        for (;;) {
            tokenEntry = tokens[i++];
            token = tokenEntry.token;
            if ( token === '' ) {
                break;
            }
            f = bucket[token];
            
            if(Array.isArray(f)) {
                let f0 = f[0];
                let f1 = f[1];
                if(f0 !== undefined && f0.fid.indexOf('h') === -1 && f0.fid != "[]" && skipGenericBlocking) {
                    continue;
                }
                if ( f0 !== undefined && f0.match(url, tokenEntry.beg) !== false &&  f1.match()) {
                    return f0;
                }
            } else {
                if(f !== undefined && f.fid.indexOf('h') === -1 && f.fid != "[]" && skipGenericBlocking) {
                    continue;
                }
                if ( f !== undefined && f.match(url, tokenEntry.beg) !== false ) {
                    return f;
                }
            }
        }
    
        // Regex-based filters
        f = bucket['*'];
        if(f !== undefined && Array.isArray(f)) {
            let f0 = f[0];
            let f1 = f[1];
            if (f0.match(url) !== false && f1.match()) {
                return f0;
            }
        } else {
            if ( f !== undefined && f.match(url) !== false ) {
                return f;
            }
        }
        
        return false;
    };
    
    /******************************************************************************/
    
    // Specialized handlers
    
    // https://github.com/uBlockAdmin/uBlock/issues/116
    // Some type of requests are exceptional, they need custom handling,
    // not the generic handling.
    
    FilterContainer.prototype.matchStringExactType = function(context, requestURL, requestType) {
        let url = requestURL.toLowerCase();
    
        // These registers will be used by various filters
        pageHostnameRegister = context.pageHostname || '';
        requestHostnameRegister = decode(encode(µb.URI.hostnameFromURI(requestURL).trim()));
        skipGenericBlocking = context.skipGenericBlocking;
    
        let party = isFirstParty(context.pageDomain, requestHostnameRegister) ? FirstParty : ThirdParty;
    
        // Be prepared to support unknown types
        let type = typeNameToTypeValue[requestType] || 0;
        if ( type === 0 ) {
            return '';
        }
    
        let categories = this.categories;
        let bf = false, bucket;
    
        // Tokenize only once
        this.tokenize(url);
    
        // https://github.com/uBlockAdmin/uBlock/issues/139
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
    
        skipGenericBlocking = false;
        // Test against allow filters
        let af;
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
    
    FilterContainer.prototype.matchStringExceptionOnlyRule = function(url,requestType) {
        pageHostnameRegister = µb.URI.hostnameFromURI(url) || '';
        requestHostnameRegister = µb.URI.hostnameFromURI(url);
        let categories = this.categories;
        let af = false,bf = false, bucket;
        skipGenericBlocking = false;
        let party = FirstParty;
        
        let type = typeNameToTypeValue[requestType] || 0;
        if ( type === 0 ) {
            return '';
        }
        this.tokenize(url);
    
        if ( bucket = categories[this.makeCategoryKey(BlockAction | AnyParty | type | Important)] ) {
            bf = this.matchTokens(bucket, url);
            if ( bf !== false ) {
                return 'sb:' + bf.toString();
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
        return '';
    };
    FilterContainer.prototype.matchCspRules = function(bucket, url,out) {
        this.tokenize(url);
        let tokens = this.tokens;
        let tokenEntry, token;
        let i = 0;
        let matchCsp = [];
        let f;
        for (;;) {
            tokenEntry = tokens[i++];
            token = tokenEntry.token;
            if ( token === '' ) {
                break;
            }
            f = bucket[token];
            if(f !== undefined && f.fid.indexOf('h') === -1 && f.fid != "[]" && skipGenericBlocking) {
                continue;
            }
            if ( f !== undefined && f.match(url, tokenEntry.beg) !== false ) {
                out.set(f.dataStr,f);
            }
        }
        f = bucket['*'];
        if ( f !== undefined && f.match(url) !== false ) {
            out.set(f.f.dataStr,f.f);
        }
    };
    
    FilterContainer.prototype.matchAndFetchCspData = function(context) {
        pageHostnameRegister = context.pageHostname || '';
        requestHostnameRegister = context.requestHostname;
        let bucket;
        let type = typeNameToTypeValue["csp"];
        let toBlockCSP = new Map();
        let toAllowCSP = new Map();
    
        if ( bucket = this.cspFilters[this.makeCategoryKey(BlockAnyParty | type)] ) {
            this.matchCspRules(bucket, context.requestURL, toBlockCSP);
        }
        if ( bucket = this.cspFilters[this.makeCategoryKey(AllowAnyParty | type)] ) {
            this.matchCspRules(bucket, context.requestURL, toAllowCSP);
        }   
    
        if ( toBlockCSP.size === 0 ) { return; }
        
        let key;
        for ( key of toAllowCSP.keys()) {
            if ( key == '' || key === undefined ) {
                toBlockCSP.clear();
                break;
            }
            toBlockCSP.delete(key);
        }
        for (let [key, value] of toBlockCSP.entries()) {
             if ( key == '' || key === undefined ) {
                break;
            }
            this.cspSubsets.set(key,value.toString());
        }
    }
    /******************************************************************************/
    
    FilterContainer.prototype.matchString = function(context) {
        // https://github.com/uBlockAdmin/uBlock/issues/519
        // Use exact type match for anything beyond `other`
        // Also, be prepared to support unknown types
        let type = typeNameToTypeValue[context.requestType] || typeOtherValue;
        if ( type > typeOtherValue ) {
            return this.matchStringExactType(context, context.requestURL, context.requestType);
        }
    
        // https://github.com/uBlockAdmin/httpswitchboard/issues/239
        // Convert url to lower case:
        //     `match-case` option not supported, but then, I saw only one
        //     occurrence of it in all the supported lists (bulgaria list).
        let url = context.requestURL.toLowerCase();

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
    
    
        // These registers will be used by various filters
        pageHostnameRegister = context.pageHostname || '';
        requestHostnameRegister = context.requestHostname;
        skipGenericBlocking = context.skipGenericBlocking;
    
        let party = isFirstParty(context.pageDomain, context.requestHostname) ? FirstParty : ThirdParty;
        let filterClasses = this.categories;
        let bucket;
    
        // Tokenize only once
        this.tokenize(url);
    
        let bf = false;
    
        // https://github.com/uBlockAdmin/uBlock/issues/139
        // Test against important block filters.
        // The purpose of the `important` option is to reverse the order of
        // evaluation. Normally, it is "evaluate block then evaluate allow", with
        // the `important` property it is "evaluate allow then evaluate block".
        if ( bucket = filterClasses[this.makeCategoryKey(BlockAnyTypeAnyParty | Important)] ) {
            bf = this.matchTokens(bucket, url);
            if ( bf !== false ) {
                return 'sb:' + bf.toString() + '$important';
            }
        }
        if ( bucket = filterClasses[this.makeCategoryKey(BlockAnyType | Important | party)] ) {
            bf = this.matchTokens(bucket, url);
            if ( bf !== false ) {
                return 'sb:' + bf.toString() + '$important';
            }
        }
        if ( bucket = filterClasses[this.makeCategoryKey(BlockAnyParty | Important | type)] ) {
            bf = this.matchTokens(bucket, url);
            if ( bf !== false ) {
                return 'sb:' + bf.toString() + '$important';
            }
        }
        if ( bucket = filterClasses[this.makeCategoryKey(BlockAction | Important | type | party)] ) {
            bf = this.matchTokens(bucket, url);
            if ( bf !== false ) {
                return 'sb:' + bf.toString() + '$important';
            }
        }
    
        // Test against block filters
        if ( bf === false ) {
            if ( bucket = filterClasses[this.makeCategoryKey(BlockAnyTypeAnyParty)] ) {
                bf = this.matchTokens(bucket, url);
            }
        }
        if ( bf === false ) {
            if ( bucket = filterClasses[this.makeCategoryKey(BlockAnyType | party)] ) {
                bf = this.matchTokens(bucket, url);
            }
        }
        if ( bf === false ) {
            if ( bucket = filterClasses[this.makeCategoryKey(BlockAnyParty | type)] ) {
                bf = this.matchTokens(bucket, url);
            }
        }
        if ( bf === false ) {
            if ( bucket = filterClasses[this.makeCategoryKey(BlockAction | type | party)] ) {
                bf = this.matchTokens(bucket, url);
            }
        }
    
        // If there is no block filter, no need to test against allow filters
        if ( bf === false ) {
            return '';
        }
    
        // Test against allow filters
        let af;
        skipGenericBlocking = false;
    
        if ( bucket = filterClasses[this.makeCategoryKey(AllowAnyTypeAnyParty)] ) {
            af = this.matchTokens(bucket, url);
            if ( af !== false ) {
                return 'sa:' + af.toString();
            }
        }
        if ( bucket = filterClasses[this.makeCategoryKey(AllowAnyType | party)] ) {
            af = this.matchTokens(bucket, url);
            if ( af !== false ) {
                return 'sa:' + af.toString();
            }
        }
        if ( bucket = filterClasses[this.makeCategoryKey(AllowAnyParty | type)] ) {
            af = this.matchTokens(bucket, url);
            if ( af !== false ) {
                return 'sa:' + af.toString();
            }
        }
        if ( bucket = filterClasses[this.makeCategoryKey(AllowAction | type | party)] ) {
            af = this.matchTokens(bucket, url);
            if ( af !== false ) {
                return 'sa:' + af.toString();
            }
        }
    
        return 'sb:' + bf.toString();
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.getFilterCount = function() {
        return this.acceptedCount - this.duplicateCount;
    };
    
    /******************************************************************************/
    
    return new FilterContainer();
    
    /******************************************************************************/
    
    })();
    