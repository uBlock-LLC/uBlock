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

/* jshint bitwise: false */
/* global punycode, µBlock */

/******************************************************************************/

µBlock.cosmeticFilteringEngine = (function(){

    'use strict';
    
    /******************************************************************************/
    
    var µb = µBlock;
    
    /******************************************************************************/
    
    // Could be replaced with encodeURIComponent/decodeURIComponent,
    // which seems faster on Firefox.
    var encode = JSON.stringify;
    var decode = JSON.parse;
    const abpSelectorRegexp = /:-abp-([\w-]+)\(/i;
    const supportedSnippet = new Set(["abort-current-inline-script", "abort-on-property-write", "abort-on-property-read"]); 
    const reAdguardExtCssSyntax = /(?:\[-ext-|:)(has|contains)/; 
    const reAdguardExtCssSyntaxParser = /(?:\[-ext-|:)(has|contains)/g; 
    const reAdguardCssSyntax = /.+?\s*\{.*\}\s*$/; 
    const pseudoClassReg = /:(?!(only|first|last|nth|nth-last)-(child|of-type))([\w-]+)\(/; 
    const reprocSelector = /(:-abp-contains|:-abp-properties|:-abp-has|:matches-css|:matches-css-after|:matches-css-before)\(/i;
 

    
    /******************************************************************************/
    
    // Any selector specific to a hostname
    // Examples:
    //   search.snapdo.com###ABottomD
    //   facebook.com##.-cx-PRIVATE-fbAdUnit__root
    //   sltrib.com###BLContainer + div[style="height:90px;"]
    //   myps3.com.au##.Boxer[style="height: 250px;"]
    //   lindaikeji.blogspot.com##a > img[height="600"]
    //   japantimes.co.jp##table[align="right"][width="250"]
    //   mobilephonetalk.com##[align="center"] > b > a[href^="http://tinyurl.com/"]
    /******************************************************************************/
    
    // Any selector specific to an entity
    // Examples:
    //   google.*###cnt #center_col > #res > #topstuff > .ts
    /******************************************************************************/
    
    let FilterParser = function() {
        this.prefix = '';
        this.suffix = '';
        this.unhide = 0;
        this.hostnames = [];
        this.invalid = false;
        this.cosmetic = true;
        this.reParser = /^\s*([^#]*)(##|#\$#|#@#|#\?#)(.+)\s*$/; 
    };
    
    /******************************************************************************/
    
    FilterParser.prototype.reset = function() {
        this.prefix = '';
        this.suffix = '';
        this.unhide = 0;
        this.hostnames.length = 0;
        this.invalid = false;
        this.cosmetic = true;
        this.type = '';
        this.adGuardToABPMap = new Map([  
            [ '[-ext-has',      ["[", "]", [2, -2], ":-abp-has"] ],
            [ ':has',           ["(", ")", [1, -1], ":-abp-has"] ],
            [ '[-ext-contains', ["[", "]", [2, -2], ":-abp-contains"] ],
            [ ':contains',      ["(", ")", [1, -1], ":-abp-contains"] ]
        ]);
        this.extended = false; 
        this.snippet = false;
        return this;
    };
    
    /******************************************************************************/
    FilterParser.prototype.convertAdGuardRule = function(str) { 
        let matches;
        while ( (matches = reAdguardExtCssSyntaxParser.exec(str)) !== null ) {
            let pos = matches.index;
            let m = matches[0];
            if(pos !== -1) {
                let counter = 0;
                let lastPos = 0;
                for(let i = pos; i < str.length; i++) {
                    if(str[i] == this.adGuardToABPMap.get(m)[0])
                        counter++;
                    else if(str[i] == this.adGuardToABPMap.get(m)[1]) {
                        counter--;
                        if(counter == 0) {
                            lastPos = i;
                            break;
                        }
                    }
                }
                if(lastPos != 0) {
                    str = str.slice(0, pos) + this.adGuardToABPMap.get(m)[3] + "(" + str.slice(pos, lastPos + 1).replace(m,"").slice(this.adGuardToABPMap.get(m)[2][0], this.adGuardToABPMap.get(m)[2][1]) + ")" + str.slice(lastPos + 1) ;
                } else {
                    //console.log("Couldn't found matching end bracket.")
                }
            }
        }
        return str;
    }
    FilterParser.prototype.convertuBOStyleToABP = function(suffix, spos) {
        let stylePrefix = suffix.slice(0, spos);
        let styleSuffix = suffix.slice(spos);
        let style = /:style\(([^)]+)\)/.exec(styleSuffix)[1];
        return `${stylePrefix} {${style}}`; 
    }
    FilterParser.prototype.convertuBOJsToABP = function(suffix) {
        let invalid = false;
        let arrParams = /^\+js\(([^)]+)\)/.exec(suffix)[1].replace(/,[\s]+/gi," ").replace(".js","").split(" ");
        let snippetName = arrParams[0];
        if(!supportedSnippet.has(snippetName)) {
            invalid = true;
        }
        return [invalid, arrParams.join(" ")];
    }
    FilterParser.prototype.parse = function(s) {
        // important!
        this.reset();
        let pos = s.indexOf('#');
        let matches = this.reParser.exec(s);
        
        if ( matches === null || matches.length !== 4 ) {
            this.cosmetic = false;
            return this;
        }
        //let prefix;
        // Remember original string
        //prefix = matches[1];
        this.suffix = matches[3];
        // 2014-05-23:
        // https://github.com/uBlockAdmin/httpswitchboard/issues/260
        // Any sequence of `#` longer than one means the line is not a valid
        // cosmetic filter.
        if ( this.suffix.indexOf('##') !== -1 ) {
            this.cosmetic = false;
            return this;
        }
    
        // Normalize high-medium selectors: `href` is assumed to imply `a` tag. We
        // need to do this here in order to correctly avoid duplicates. The test
        // is designed to minimize overhead -- this is a low occurrence filter.
        if ( this.suffix.charAt(1) === '[' && this.suffix.slice(2, 9) === 'href^="' ) {
            this.suffix = this.suffix.slice(1);
        }
        
        this.type = matches[2].charAt(1); 
        if(reAdguardExtCssSyntax.test(this.suffix)) { 
            this.suffix = this.convertAdGuardRule(this.suffix);
        }
        let spos = this.suffix.indexOf(":style");
        if(spos !== -1) {
            this.suffix = this.convertuBOStyleToABP(this.suffix, spos);
            this.type = '$';
        }
        if(/^\+js\(/.test(this.suffix)) {
            [this.invalid, this.suffix] = this.convertuBOJsToABP(this.suffix);
            if(this.invalid) return this;
            this.type = '$';
        }
        if(this.type == "$") { 
            if(reAdguardCssSyntax.test(this.suffix)) {
                if(reprocSelector.test(this.suffix))
                    this.extended = true;
            } else {
                let m = /([^\s]+)/.exec(this.suffix);
                if(!supportedSnippet.has(m[0])) {
                    this.invalid = true;
                    return this;
                }
                this.snippet = true;
            }
        }
        this.unhide = this.type === '@' ? 1 : 0;
        if ( pos !== 0 ) {
            this.hostnames = s.slice(0, pos).split(/\s*,\s*/);
        }
        return this;
    };

    /******************************************************************************/
    /******************************************************************************/
    
    let SelectorCacheEntry = function() {
        this.reset();
    };
    
    /******************************************************************************/
    
    SelectorCacheEntry.junkyard = [];
    
    SelectorCacheEntry.factory = function() {
        var entry = SelectorCacheEntry.junkyard.pop();
        if ( entry ) {
            return entry.reset();
        }
        return new SelectorCacheEntry();
    };
    
    /******************************************************************************/
    
    SelectorCacheEntry.prototype.netLowWaterMark = 20;
    SelectorCacheEntry.prototype.netHighWaterMark = 30;
    
    /******************************************************************************/
    
    SelectorCacheEntry.prototype.reset = function() {
        this.cosmetic = {};
        this.net = {};
        this.netCount = 0;
        this.lastAccessTime = Date.now();
        return this;
    };
    
    /******************************************************************************/
    
    SelectorCacheEntry.prototype.dispose = function() {
        this.cosmetic = this.net = null;
        if ( SelectorCacheEntry.junkyard.length < 25 ) {
            SelectorCacheEntry.junkyard.push(this);
        }
    };
    
    /******************************************************************************/
    
    SelectorCacheEntry.prototype.addCosmetic = function(selectors) {
        var dict = this.cosmetic;
        var i = selectors.length || 0;
        while ( i-- ) {
            dict[selectors[i]] = true;
        }
    };
    
    /******************************************************************************/
    
    SelectorCacheEntry.prototype.addNet = function(selectors) {
        if ( typeof selectors === 'string' ) {
            this.addNetOne(selectors, Date.now());
        } else {
            this.addNetMany(selectors, Date.now());
        }
        // Net request-derived selectors: I limit the number of cached selectors,
        // as I expect cases where the blocked net-requests are never the
        // exact same URL.
        if ( this.netCount < this.netHighWaterMark ) {
            return;
        }
        var dict = this.net;
        var keys = Object.keys(dict).sort(function(a, b) {
            return dict[b] - dict[a];
        }).slice(this.netLowWaterMark);
        var i = keys.length;
        while ( i-- ) {
            delete dict[keys[i]];
        }
    };
    
    /******************************************************************************/
    
    SelectorCacheEntry.prototype.addNetOne = function(selector, now) {
        var dict = this.net;
        if ( dict[selector] === undefined ) {
            this.netCount += 1;
        }
        dict[selector] = now;
    };
    
    /******************************************************************************/
    
    SelectorCacheEntry.prototype.addNetMany = function(selectors, now) {
        var dict = this.net;
        var i = selectors.length || 0;
        var selector;
        while ( i-- ) {
            selector = selectors[i];
            if ( dict[selector] === undefined ) {
                this.netCount += 1;
            }
            dict[selector] = now;
        }
    };
    
    /******************************************************************************/
    
    SelectorCacheEntry.prototype.add = function(selectors, type) {
        this.lastAccessTime = Date.now();
        if ( type === 'cosmetic' ) {
            this.addCosmetic(selectors);
        } else {
            this.addNet(selectors);
        }
    };
    
    /******************************************************************************/
    
    // https://github.com/uBlockAdmin/uBlock/issues/420
    SelectorCacheEntry.prototype.remove = function(type) {
        this.lastAccessTime = Date.now();
        if ( type === undefined || type === 'cosmetic' ) {
            this.cosmetic = {};
        }
        if ( type === undefined || type === 'net' ) {
            this.net = {};
            this.netCount = 0;
        }
    };
    
    /******************************************************************************/
    
    SelectorCacheEntry.prototype.retrieve = function(type, out) {
        this.lastAccessTime = Date.now();
        var dict = type === 'cosmetic' ? this.cosmetic : this.net;
        for ( var selector in dict ) {
            if ( dict.hasOwnProperty(selector) ) {
                out.push(selector);
            }
        }
    };
    
    /******************************************************************************/
    /******************************************************************************/
    
    // Two Unicode characters:
    // T0HHHHHHH HHHHHHHHH
    // |       |         |
    // |       |         |
    // |       |         |
    // |       |         +-- bit 8-0 of FNV
    // |       |
    // |       +-- bit 15-9 of FNV
    // |
    // +-- filter type (0=hide 1=unhide)
    //
    
    var makeHash = function(unhide, token, mask, proceduremask = "") {
        // Ref: Given a URL, returns a unique 4-character long hash string
        // Based on: FNV32a
        // http://www.isthe.com/chongo/tech/comp/fnv/index.html#FNV-reference-source
        // The rest is custom, suited for µBlock.
        var i1 = token.length;
        var i2 = i1 >> 1;
        var i4 = i1 >> 2;
        var i8 = i1 >> 3;
        var hval = (0x811c9dc5 ^ token.charCodeAt(0)) >>> 0;
            hval += (hval<<1) + (hval<<4) + (hval<<7) + (hval<<8) + (hval<<24);
            hval >>>= 0;
            hval ^= token.charCodeAt(i8);
            hval += (hval<<1) + (hval<<4) + (hval<<7) + (hval<<8) + (hval<<24);
            hval >>>= 0;
            hval ^= token.charCodeAt(i4);
            hval += (hval<<1) + (hval<<4) + (hval<<7) + (hval<<8) + (hval<<24);
            hval >>>= 0;
            hval ^= token.charCodeAt(i4+i8);
            hval += (hval<<1) + (hval<<4) + (hval<<7) + (hval<<8) + (hval<<24);
            hval >>>= 0;
            hval ^= token.charCodeAt(i2);
            hval += (hval<<1) + (hval<<4) + (hval<<7) + (hval<<8) + (hval<<24);
            hval >>>= 0;
            hval ^= token.charCodeAt(i2+i8);
            hval += (hval<<1) + (hval<<4) + (hval<<7) + (hval<<8) + (hval<<24);
            hval >>>= 0;
            hval ^= token.charCodeAt(i2+i4);
            hval += (hval<<1) + (hval<<4) + (hval<<7) + (hval<<8) + (hval<<24);
            hval >>>= 0;
            hval ^= token.charCodeAt(i1-1);
            hval += (hval<<1) + (hval<<4) + (hval<<7) + (hval<<8) + (hval<<24);
            hval >>>= 0;
            hval &= mask;
            if ( unhide !== 0 ) {
                hval |= 0x20000;
            }
            if(proceduremask != "") {
                hval |= proceduremask;
            }
        //return hval.toString(36);
        return hval;
    };
    
    /******************************************************************************/
    /******************************************************************************/
    
    // Cosmetic filter family tree:
    //
    // Generic
    //    Low generic simple: class or id only
    //    Low generic complex: class or id + extra stuff after
    //    High generic:
    //       High-low generic: [alt="..."],[title="..."]
    //       High-medium generic: [href^="..."]
    //       High-high generic: everything else
    // Specific
    //    Specfic hostname
    //    Specific entity
    // Generic filters can only be enforced once the main document is loaded.
    // Specific filers can be enforced before the main document is loaded.
    
    const BUCKET_TOKEN_SIZE = 8; //Size of Token Hash [4 bytes] inside TokenBucket + Size of Token's hostnames length [4 bytes] inside TokenBucket 
    const BUCKET_HOST_SIZE = 12; //Size of Token's Hashname Hash [4 bytes] inside TokenBucket + Size of Hostname's Css Length Offset [4 bytes] inside TokenBucket + Size of Hostname's Css Length inside CssBucket [2 bytes] + Size of Css Length [2 bytes] inside CssBucket
    const BUCKET_SEPARATOR_SIZE = 1; //Size of separator '\n'

    let FilterContainer = function() {
        this.domainHashMask = (1 << 10) - 1; // 10 bits
        this.genericHashMask = (1 << 15) - 1; // 15 bits
        this.procedureMask = 0x10000;
        this.type0NoDomainHash = 'type0NoDomain';
        this.type1NoDomainHash = 'type1NoDomain';
        this.parser = new FilterParser();
        this.selectorCachePruneDelay = 5 * 60 * 1000; // 5 minutes
        this.selectorCacheAgeMax = 20 * 60 * 1000; // 20 minutes
        this.selectorCacheCountMin = 10;
        this.selectorCacheTimer = null;
        this.reHasUnicode = /[^\x00-\x7F]/;
        this.punycode = punycode;
        this.reset();
    };
    
    /******************************************************************************/
    
    // Reset all, thus reducing to a minimum memory footprint of the context.
    
    FilterContainer.prototype.reset = function() {
        this.parser.reset();
        this.µburi = µb.URI;
        this.frozen = false;
        this.acceptedCount = 0;
        this.duplicateCount = 0;
        this.duplicateBuster = {};
    
        this.selectorCache = {};
        this.selectorCacheCount = 0;
    
        // permanent
        // [class], [id]
        this.lowGenericHide = {
            "lg": new Set(),
            "lgm": new Map()
        };
    
        // [alt="..."], [title="..."]
        this.highLowGenericHide = new Set();
    
        // a[href^="http..."]
        this.highMediumGenericHide = new Set();
    
        // everything else
        this.highHighGenericHide = new Set();
    
        // generic exception filters
        this.genericDonthide = [];
    
        // hostname, entity-based filters
        this.hostnameFilters = {};
        this.hostnameFilterDataView = {}; 
        this.hostnameFilterByteLength = {}; 
        this.entityFilters = {};
        this.pseudoClassExpression = false; 
    };
    
    /******************************************************************************/
    
    // https://github.com/uBlockAdmin/uBlock/issues/1004
    // Detect and report invalid CSS selectors.
    
    FilterContainer.prototype.div = document.createElement('div');
    /*
        I took an idea from the technique used here: 
        https://github.com/cliqz-oss/adblocker/blob/master/src/engine/reverse-index.ts
    */
    FilterContainer.prototype.hostnameFilterDataViewWrapper = function() {
        this.objView;
        this.tokenBucket;
        this.tokenIndex = {};
        this.lru = new µb.LRUCache(16); 
    }
    FilterContainer.prototype.hostnameFilterDataViewWrapper.prototype = {
        pushToBuffer: function(hostnameFilters, bufferLength) {
            let hostCssOffset = new Map();
            let computedIdSet = new Map();
            let tokenLength = {};
            let totalTokens = 0;
            let totalHostnames = 0;
            let tokenBucketIndex = 0;
            let additionalBufferSpace = 50;
            this.objView = new µb.dataView(bufferLength);
            for (var token in hostnameFilters) {
                totalTokens++;
                tokenLength[token] = hostnameFilters[token].size;
                if(hostCssOffset[token] === undefined) {
                    hostCssOffset[token] = new Map();
                } 
                let ob = this.objView;
                hostnameFilters[token].forEach(function(value, key, map) {
                    totalHostnames++;
                    let computeId = µb.computeSelectorsId(value);
                    let cssOffset = computedIdSet.get(computeId);
                    if(cssOffset === undefined) {
                        cssOffset = ob.getPos();
                        computedIdSet.set(computeId, cssOffset);
                        let cssString;
                        if(Array.isArray(value))
                            cssString = value.join('\n');
                        else 
                            cssString = value;
                            ob.pushUTF8(cssString);
                    }
                    hostCssOffset[token].set(key, cssOffset);
                });
            }
            this.objView.buffer = this.objView.buffer.slice(0, this.objView.pos + (((totalTokens * 2) + (totalHostnames * 2)) * 4) + additionalBufferSpace);
            let buflen = (totalTokens * 2) + (totalHostnames * 2);
            let alignVal = this.align(4);
            if((this.objView.buffer.length - alignVal) < (buflen * 4)) {
                let len;
                len = alignVal + (buflen * 4) + additionalBufferSpace;
                this.growBuffer(len);
            }
            this.tokenBucket = this.objView.getUint32ArrayView(buflen);
            for (var token in hostnameFilters) {
                this.tokenIndex[token] = tokenBucketIndex; 
                this.tokenBucket[tokenBucketIndex++] = token;
                this.tokenBucket[tokenBucketIndex++] = tokenLength[token];
                let tb = this.tokenBucket;
                hostnameFilters[token].forEach(function(value, key, map) {
                    tb[tokenBucketIndex++] = key;
                    tb[tokenBucketIndex++] = hostCssOffset[token].get(key); 
                });
            }
        },
        align: function(alignement) {
           return this.objView.pos % alignement === 0
                ? this.objView.pos
                : Math.floor(this.objView.pos / alignement) * alignement + alignement;
        },
        growBuffer: function(bufferLength) {
            const newBuffer = new Uint8Array(bufferLength);
            newBuffer.set(this.objView.buffer);
            this.objView.buffer = newBuffer;
        },
        retrieve: function(hosthashes, tokenHash, out) {
            let loop;
            let str = this.lru.get(tokenHash);
            if(str != undefined) {
                if(Array.isArray(str)) {
                    str.forEach(function(element) {
                        if(hosthashes.indexOf(element.k) != -1) {
                            out.push(...element.v);
                        }
                    });
                } else {
                    if(hosthashes.indexOf(str.k) != -1) {
                        out.push(...str.v);
                    }
                }
            } else {
                loop = this.tokenIndex[tokenHash];
                if(loop !== undefined) {  
                    loop++;
                    let hostLen = this.tokenBucket[loop];
                    let next = loop + 1;
                    let ln = next + (hostLen * 2);
                    while(next < ln) {
                        let hostHash = this.tokenBucket[next];
                        if(hosthashes.includes(hostHash)) {                  
                            let cssOffset = this.tokenBucket[next + 1];
                            this.objView.setPos(cssOffset);
                            let cssDataString = this.objView.getUTF8();
                            out.push(...cssDataString.split('\n'));
                            let cacheData = this.lru.get(tokenHash);
                            if ( cacheData === undefined ) { 
                                this.lru.set(tokenHash, {'k': hostHash,'v':cssDataString.split('\n')});
                            } else if ( typeof cacheData === 'object' ) { 
                                this.lru.set(tokenHash, [ cacheData, {'k': hostHash,'v':cssDataString.split('\n')} ]);
                            } else {
                                cacheData.push({'k': hostHash,'v':cssDataString.split('\n')});
                            }
                        }
                        next += 2;
                    }
                }
            }
        },
        toSelfie: function() {
            return JSON.stringify({ 
                "buffer": Array.from(this.objView.buffer),
                "tokenBucket": {"offset": this.tokenBucket.byteOffset, "length": this.tokenBucket.length},
                "tokenIndex": this.tokenIndex                                    
            });
        },
        fromSelfie: function(serializeObj) {
            let arr = JSON.parse(serializeObj);
            this.objView = new µb.dataView(arr["buffer"].length);
            this.objView.buffer.set(arr["buffer"]);
            this.tokenBucket = new Uint32Array(this.objView.buffer.buffer, arr["tokenBucket"].offset, arr["tokenBucket"].length);
            this.tokenIndex = arr["tokenIndex"];
        },
        rebuildHostnameFilters: function() {
            let hostnameFilters = {};
            let loop = 0;
            let hn;
            let selector;
            let entry;
            let hostnameFilterByteLength = this.objView.buffer.length;

            while(loop < this.tokenBucket.length) {
                let tokenHash = this.tokenBucket[loop];
                if(hostnameFilters[tokenHash] === undefined) {
                    hostnameFilters[tokenHash] = new Map();
                }
                entry = hostnameFilters[tokenHash];
                loop++;
                let hostLen = this.tokenBucket[loop];
                let next = loop + 1;
                let ln = next + (hostLen * 2);
                while(next < ln) {
                    let hostHash = this.tokenBucket[next];
                    let cssOffset = this.tokenBucket[next + 1];
                    this.objView.setPos(cssOffset);
                    let selectors = this.objView.getUTF8().split('\n');
                    entry.set(hostHash, selectors);
                    next += 2;
                }
                loop += (this.tokenBucket[loop] * 2) + 1;
            }
            return [hostnameFilters, hostnameFilterByteLength]; 
        }
    }
   
    // Not all browsers support `Element.matches`:
    // http://caniuse.com/#feat=matchesselector
    
    if ( typeof FilterContainer.prototype.div.matches === 'function' ) {
        FilterContainer.prototype.isValidSelector = function(s) {
            try {
                this.div.matches(s);
            } catch (e) {
                //console.error('uBlock> invalid cosmetic filter:', s);
                return false;
            }
            return true;
        };
    } else {
        FilterContainer.prototype.isValidSelector = function() {
            return true;
        };
    }

    /******************************************************************************/
    const isValidStyle = function(css) { 
        if (css.indexOf('\\') !== -1 || css.indexOf("url(") !== -1) {
            return false;
        }
        let div = document.createElement('div');
        div.style.cssText = css;
        if ( div.style.cssText === '' ) { return false; }
        div.style.cssText = '';
        return true;
    };

    FilterContainer.prototype.parseContent = function(content, startIndex) { 
        let parens = 1;
        let i = startIndex;
        for (; i < content.length; i++) {
            let c = content[i];
            if (c == "\\") {
                i++;
            }
            else if (c == "(")
                parens++;
            else if (c == ")") {
                parens--;
            if (parens == 0)
                break;
            }
        }
        if (parens > 0)
            return null;
        return {text: content.substring(startIndex, i), end: i};
    } 

    const normalizedOperators = new Set(['-abp-contains', '-abp-has', '-abp-properties' , 'matches-css', 'matches-css-after', 'matches-css-before', 'not']);
    const shortNames = new Map([
        ["pseudoCls", "ps"],
        ["prefix", "pf"],
        ["selectorText", "st"],
        ["_innerSelectors", "_is"],
        ["startsWithSiblingOperator", "sso"],
        ["hasParallelSiblingSelector", "pss"]
    ]);

    FilterContainer.prototype.parseProcedure = function(expression) { 
        let tasks = [], prefix, remaining, parsed, selectorText, isValid = true, procSelector = null, pseudoClass = null;
        let matches = pseudoClassReg.exec(expression);
        if(!matches) {
            this.shouldObserveAttributes = !this.shouldObserveAttributes ? /[#.]|\[.+\]/.test(expression) : true;
            return [true,   
                        [{   
                            ["plain"]: {
                                [shortNames.get('pseudoCls')]: null, 
                                [shortNames.get('prefix')]: "",
                                [shortNames.get('selectorText')]: expression,
                                [shortNames.get('_innerSelectors')]: null,
                                [shortNames.get('startsWithSiblingOperator')]: /^\s*[+~]/.test(expression),
                                [shortNames.get('hasParallelSiblingSelector')]: false
                            }
                        }]
                    ];
        } 
        prefix = expression.substring(0,matches.index);
        remaining = expression.substring(matches.index + matches[0].length);
        parsed = this.parseContent(remaining, 0);
        if(parsed == null) 
            return [false, []];
        
        selectorText = parsed.text;
        pseudoClass = (matches[3] == "matches-css-after" ?  ":after" : (matches[3] == "matches-css-before" ?  ":before" : null ));
       
        if(matches[3] == "-abp-contains")
            this.shouldObserveCharacterData = true; 
        
        this.shouldObserveAttributes = !this.shouldObserveAttributes ? /[#.]|\[.+\]/.test(prefix) : true;

        if(matches[3] == "-abp-has" || matches[3] == "not") {
            [isValid, procSelector] = this.parseProcedure(selectorText);
        } else if(normalizedOperators.has(matches[3])) {
            isValid = true;
        } else {
            isValid = false;
            return [isValid, []];
        }
        if(isValid) {
            tasks.push({
                [matches[3]]: {
                    [shortNames.get('pseudoCls')]: pseudoClass, 
                    [shortNames.get('prefix')]: prefix,
                    [shortNames.get('selectorText')]: procSelector === null ? selectorText : null,
                    [shortNames.get('_innerSelectors')]: procSelector,
                    [shortNames.get('startsWithSiblingOperator')]: /^\s*[+~]/.test(prefix),
                    [shortNames.get('hasParallelSiblingSelector')]: false
                }
            });
            let suffixtext = remaining.substring(parsed.end + 1);
            if (suffixtext != "") {
                let suffix;
                [isValid, suffix] = this.parseProcedure(suffixtext);
                if(isValid) {
                    if(suffix.length > 0) {
                        if(Object.values(suffix[0])[0][shortNames.get('startsWithSiblingOperator')]) {
                            for (let task of tasks) {
                                if(Object.keys(task)[0] != "plain") {
                                    task[Object.keys(task)[0]][shortNames.get('hasParallelSiblingSelector')] = true;
                                }
                            }
                        }
                    }
                    tasks.push(...suffix);
                }
                else 
                    tasks = [];
            }
        } 
        return [isValid, tasks];
    }
    FilterContainer.prototype.compile = function(s, out) {
        let parsed = this.parser.parse(s);
        
        if ( parsed.cosmetic === false ) {
            return false;
        }
        if ( parsed.invalid ) {
            return true;
        }
       
        let hostnames = parsed.hostnames;   
        let i = hostnames.length;
        if ( i === 0 ) {
            this.compileGenericSelector(parsed, out);
            return true;
        }
        
        let isValid;
        this.pseudoClassExpression = false;
        this.shouldObserveAttributes = false;
        this.shouldObserveCharacterData = false; 

        if(this.parser.type == "$") {
            if(this.parser.snippet)
                isValid = true;
            else if(this.parser.extended) {
                let matches = /(.+?)\s*\{(.*)\}\s*$/.exec(parsed.suffix);
                isValid = this.isValidSelector(matches[1].trim());
                if(!isValid && reprocSelector.test(matches[1].trim()) && isValidStyle(matches[2].trim())) { 
                    let tasks;
                    [isValid, tasks] = this.parseProcedure(matches[1].trim());
                    this.pseudoClassExpression = true;
                    parsed.suffix = JSON.stringify({'tasks': tasks, 'style': matches[2].trim(), 'attr': this.shouldObserveAttributes, 'data': this.shouldObserveCharacterData});
                }
            } else {
                let matches = /(.+?)\s*\{(.*)\}\s*$/.exec(parsed.suffix);
                isValid = this.isValidSelector(matches[1].trim()) && isValidStyle(matches[2].trim());
            }
        }
        else {
            isValid = this.isValidSelector(parsed.suffix);
            if(!isValid && reprocSelector.test(parsed.suffix)) { 
                let tasks;
                [isValid, tasks] = this.parseProcedure(parsed.suffix);
                this.pseudoClassExpression = true;
                parsed.suffix = JSON.stringify({'tasks': tasks, 'style': "",  'attr': this.shouldObserveAttributes, 'data': this.shouldObserveCharacterData});
            }
        }
        // For hostname- or entity-based filters, class- or id-based selectors are
        // still the most common, and can easily be tested using a plain regex.
        if (
            this.reClassOrIdSelector.test(parsed.suffix) === false &&
            isValid === false
        ) {
            console.error('uBlock> invalid cosmetic filter:', s);
            return true;
        }
    
        // https://github.com/uBlockAdmin/uBlock/issues/151
        // Negated hostname means the filter applies to all non-negated hostnames
        // of same filter OR globally if there is no non-negated hostnames.
        let applyGlobally = true;
        let hostname;
        while ( i-- ) {
            hostname = hostnames[i];
            if ( hostname.charAt(0) !== '~' ) {
                applyGlobally = false;
            }
            if ( hostname.slice(-2) === '.*' ) {
                this.compileEntitySelector(hostname, parsed, out);
            } else {
                this.compileHostnameSelector(hostname, parsed, out);
            }
        }
        if ( applyGlobally ) {
            this.compileGenericSelector(parsed, out);
        }
    
        return true;
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.compileGenericSelector = function(parsed, out) {
        let selector = parsed.suffix;
    
        // https://github.com/uBlockAdmin/uBlock/issues/497
        // All generic exception filters are put in the same bucket: they are
        // expected to be very rare.
        if ( parsed.unhide ) {
            if ( this.isValidSelector(selector) ) {
                out.push(['g1', selector]);
            }
            return;
        }
    
        let type = selector.charAt(0);
        let matches;
    
        if ( type === '#' || type === '.' ) {
            matches = this.rePlainSelector.exec(selector);
            if ( matches === null ) {
                return;
            }
            // Single-CSS rule: no need to test for whether the selector
            // is valid, the regex took care of this. Most generic selector falls
            // into that category.
            if ( matches[1] === selector ) {
                out.push(['lg', makeHash(0, matches[1], this.genericHashMask), selector]);
                return;
            }
            // Many-CSS rules
            if ( this.isValidSelector(selector) ) {
                out.push(['lg+', makeHash(0, matches[1], this.genericHashMask), selector]);
            }
            return;
        }
        
        // ["title"] and ["alt"] will go in high-low generic bin.
        if ( this.reHighLow.test(selector) ) {
            if ( this.isValidSelector(selector) ) {
                out.push(['hlg0', selector]);
            }
            return;
        }
    
        // [href^="..."] will go in high-medium generic bin.
        matches = this.reHighMedium.exec(selector);
        if ( matches && matches.length === 2 ) {
            if ( this.isValidSelector(selector) ) {
                out.push(['hmg0', matches[1], selector]);
            }
            return;
        }
        
        // All else
        if ( this.isValidSelector(selector) ) {
            out.push(['hhg0', selector]);
        }
    };
    
    FilterContainer.prototype.reClassOrIdSelector = /^([#.][\w-]+)$/;
    FilterContainer.prototype.rePlainSelector = /^([#.][\w-]+)/;
    FilterContainer.prototype.reHighLow = /^[a-z]*\[(?:alt|title)="[^"]+"\]$/;
    FilterContainer.prototype.reHighMedium = /^\[href\^="https?:\/\/([^"]{8})[^"]*"\]$/;
    
    /******************************************************************************/
    
    FilterContainer.prototype.compileHostnameSelector = function(hostname, parsed, out) {
        // https://github.com/uBlockAdmin/uBlock/issues/145
        let unhide = parsed.unhide;
        if ( hostname.charAt(0) === '~' ) {
            hostname = hostname.slice(1);
            unhide ^= 1;
        }
    
        // punycode if needed
        if ( this.reHasUnicode.test(hostname) ) {
            //console.debug('µBlock.cosmeticFilteringEngine/FilterContainer.compileHostnameSelector> punycoding:', hostname);
            hostname = this.punycode.toASCII(hostname);
        }
    
        // https://github.com/uBlockAdmin/uBlock/issues/188
        // If not a real domain as per PSL, assign a synthetic one
        let hash;
        let domain = this.µburi.domainFromHostname(hostname);
        if ( domain === '' ) {
            hash = unhide === 0 ? makeHash(0, this.type0NoDomainHash, this.domainHashMask) : makeHash(0, this.type1NoDomainHash, this.domainHashMask);
        } else {
            hash = this.pseudoClassExpression ? makeHash(unhide, domain, this.domainHashMask, this.procedureMask) : makeHash(unhide, domain, this.domainHashMask);
        }
        let hshash = µb.tokenHash(hostname);
        if(parsed.type == "$" && parsed.snippet)  
                out.push(['hs+', hash, hshash, parsed.suffix]);
        else if(parsed.type == "$")
            out.push(['hs', hash, hshash, parsed.suffix]); 
        else 
            out.push(['h', hash, hshash, parsed.suffix]);
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.compileEntitySelector = function(hostname, parsed, out) {
        let entity = hostname.slice(0, -2);
        if(parsed.type == "$" && parsed.snippet)  
            out.push(['es+', entity, parsed.suffix]);
        else if(parsed.type == "$")
            out.push(['es', entity, parsed.suffix]); 
        else 
            out.push(['e', entity, parsed.suffix]);    
    };

    FilterContainer.prototype.appendHostnameFilters = function(compiledFilters) {
        //https://github.com/uBlock-LLC/uBlock/issues/1810
        for(let key in this.hostnameFilterDataView) {
            [this.hostnameFilters[key], this.hostnameFilterByteLength[key]] = this.hostnameFilterDataView[key].rebuildHostnameFilters();
        }
        let fc = this;
        let flag;
        compiledFilters.forEach(function(fields) {
            if(fields[0] == "hs")
                flag = "script";
            else
                flag = "css";
            fc.addHostnameFilters(fields, flag);
        });
        this.hostnameFilterDataView = {};
    }
    /******************************************************************************/
    FilterContainer.prototype.addHostnameFilters = function(fields, flag) {
        let hshash = fields[2];
        if(!this.hostnameFilters.hasOwnProperty(flag)) {
            this.hostnameFilters[flag] = {};
            Object.defineProperty(this.hostnameFilterByteLength,flag, {                   
                  value: 0,
                  writable: true
            });
        }
        if(this.hostnameFilters[flag][fields[1]] === undefined) {
            this.hostnameFilters[flag][fields[1]] = new Map();
            this.hostnameFilters[flag][fields[1]].set(hshash,[fields[3]]);
            this.hostnameFilterByteLength[flag] += BUCKET_TOKEN_SIZE + BUCKET_HOST_SIZE;
        } else {
            let selectors = this.hostnameFilters[flag][fields[1]].get(hshash);
            if ( selectors === undefined ) { 
                this.hostnameFilters[flag][fields[1]].set(hshash, fields[3]);
                this.hostnameFilterByteLength[flag] += BUCKET_HOST_SIZE;
            } else if ( typeof selectors === 'string' ) { 
                this.hostnameFilters[flag][fields[1]].set(hshash, [ selectors, fields[3] ]);
                this.hostnameFilterByteLength[flag] += BUCKET_SEPARATOR_SIZE;
            } else {
                selectors.push(fields[3]);
                this.hostnameFilterByteLength[flag] += BUCKET_SEPARATOR_SIZE;
            }
        }
        this.hostnameFilterByteLength[flag] += fields[3].length; //Size of Css Data inside CssBucket
    }
    FilterContainer.prototype.fromCompiledContent = function(text, skip) {
       if ( skip ) {
            return;
        }
        var line, fields, filter, bucket;

        for(let i = 0; i < text.length; i++) {
            
            fields = text[i];
            line = fields.join("\v");
            this.acceptedCount += 1;
            if ( this.duplicateBuster.hasOwnProperty(line) ) {
                this.duplicateCount += 1;
                continue;
            }
            this.duplicateBuster[line] = true;
            // h	ir	twitter.com	.promoted-tweet
            if ( fields[0] === 'h' || fields[0] === 'hs' || fields[0] === 'hs+' ) { //v19
                let flag;
                if(fields[0] == "hs")
                    flag = "style";
                else if(fields[0] == "hs+")
                    flag = "script";
                else
                    flag = "css";
                this.addHostnameFilters(fields, flag);
                continue;
            }
    
            // lg	105	.largeAd
            // lg+	2jx	.Mpopup + #Mad > #MadZone
            if ( fields[0] === 'lg' || fields[0] === 'lg+' ) {
               
                if(fields[0] === 'lg+') {
                    let matches = this.rePlainSelector.exec(fields[2]);
                    let key = matches[1];
                    let selectors = this.lowGenericHide.lgm.get(key);
                    if ( selectors === undefined ) {
                        this.lowGenericHide.lgm.set(key, fields[2]);
                    } else if ( typeof selectors === 'string' ) {
                        this.lowGenericHide.lgm.set(key, [ selectors, fields[2] ]);
                    } else {
                        selectors.push(fields[2]);
                    }
                } else {
                    if(!this.lowGenericHide.lg.has(fields[2]))
                        this.lowGenericHide.lg.add(fields[2]);
                }
                continue;
            }
    
            // entity	selector
            if ( fields[0] === 'e' || fields[0] === 'es' || fields[0] === 'es+' ) {

                let flag;
                if(fields[0] == "es")
                    flag = "style";
                else if(fields[0] == "es+")
                    flag = "script";
                else
                    flag = "css";
                
                if(!this.entityFilters.hasOwnProperty(flag)) 
                    this.entityFilters[flag] = {};

                bucket = this.entityFilters[flag][fields[1]];
                if ( bucket === undefined ) {
                    this.entityFilters[flag][fields[1]] = [fields[2]];
                } else {
                    bucket.push(fields[2]);
                }
                continue;
            }
    
            if ( fields[0] === 'hlg0' ) {
                this.highLowGenericHide.add(fields[1]);
                continue;
            }
    
            if ( fields[0] === 'hmg0' ) {
                this.highMediumGenericHide.add(fields[2]);
                continue;
            }
    
            if ( fields[0] === 'hhg0' ) {
                this.highHighGenericHide.add(fields[1]);
                continue;
            }
    
            // https://github.com/uBlockAdmin/uBlock/issues/497
            // Generic exception filters: expected to be a rare occurrence.
            if ( fields[0] === 'g1' ) {
                this.genericDonthide.push(fields[1]);
            }
        }
        
        return true;
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.freeze = function() {
        for(let flag in this.hostnameFilters) {
            this.hostnameFilterDataView[flag] = {};
            this.hostnameFilterDataView[flag] = new this.hostnameFilterDataViewWrapper();
            if(Object.entries(this.hostnameFilters[flag]).length > 0)
                this.hostnameFilterDataView[flag].pushToBuffer(this.hostnameFilters[flag], this.hostnameFilterByteLength[flag]);
        }
        this.hostnameFilters = {};
        this.duplicateBuster = {};
        this.parser.reset();
        this.frozen = true;
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.toSelfie = function() {
        let hf = {};
        for(let flag in this.hostnameFilterDataView) {
            hf[flag] = this.hostnameFilterDataView[flag].toSelfie();
        }
        return {
            acceptedCount: this.acceptedCount,
            duplicateCount: this.duplicateCount,
            hostnameFilterDataView: hf,
            entitySpecificFilters: this.entityFilters,
            lowGenericHide: {"lg": Array.from(this.lowGenericHide.lg), "lgm": Array.from(this.lowGenericHide.lgm)},
            highLowGenericHide: Array.from(this.highLowGenericHide),
            highMediumGenericHide: Array.from(this.highMediumGenericHide),
            highHighGenericHide: Array.from(this.highHighGenericHide),
            genericDonthide: this.genericDonthide
        };
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.fromSelfie = function(selfie) {
        this.acceptedCount = selfie.acceptedCount;
        this.duplicateCount = selfie.duplicateCount;
        for(let flag in selfie.hostnameFilterDataView) {
            this.hostnameFilterDataView[flag] = new this.hostnameFilterDataViewWrapper();
            this.hostnameFilterDataView[flag].fromSelfie(selfie.hostnameFilterDataView[flag]);
        }
        this.entityFilters = selfie.entitySpecificFilters;
        this.lowGenericHide = {"lg": new Set(selfie.lowGenericHide.lg),"lgm": new Map(selfie.lowGenericHide.lgm)};
        this.highLowGenericHide = new Set(selfie.highLowGenericHide);
        this.highMediumGenericHide = new Set(selfie.highMediumGenericHide);
        this.highHighGenericHide = new Set(selfie.highHighGenericHide);
        this.genericDonthide = selfie.genericDonthide;
        this.frozen = true;
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.triggerSelectorCachePruner = function() {
        if ( this.selectorCacheTimer !== null ) {
            return;
        }
        if ( this.selectorCacheCount <= this.selectorCacheCountMin ) {
            return;
        }
        // Of interest: http://fitzgeraldnick.com/weblog/40/
        // http://googlecode.blogspot.ca/2009/07/gmail-for-mobile-html5-series-using.html
        this.selectorCacheTimer = setTimeout(
            this.pruneSelectorCacheAsync.bind(this),
            this.selectorCachePruneDelay
        );
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.addToSelectorCache = function(details) {
        var hostname = details.hostname;
        if ( typeof hostname !== 'string' || hostname === '' ) {
            return;
        }
        var selectors = details.selectors;
        if ( !selectors ) {
            return;
        }
        var entry = this.selectorCache[hostname];
        if ( entry === undefined ) {
            entry = this.selectorCache[hostname] = SelectorCacheEntry.factory();
            this.selectorCacheCount += 1;
            this.triggerSelectorCachePruner();
        }
        entry.add(selectors, details.type);
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.removeFromSelectorCache = function(targetHostname, type) {
        for ( var hostname in this.selectorCache ) {
            if ( this.selectorCache.hasOwnProperty(hostname) === false ) {
                continue;
            }
            if ( targetHostname !== '*' ) {
                if ( hostname.slice(0 - targetHostname.length) !== targetHostname ) {
                    continue;
                }
                if ( hostname.length !== targetHostname.length &&
                     hostname.charAt(0 - targetHostname.length - 1) !== '.' ) {
                    continue;
                }
            }
            this.selectorCache[hostname].remove(type);
        }
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.retrieveFromSelectorCache = function(hostname, type, out) {
        var entry = this.selectorCache[hostname];
        if ( entry === undefined ) {
            return;
        }
        entry.retrieve(type, out);
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.pruneSelectorCacheAsync = function() {
        this.selectorCacheTimer = null;
        if ( this.selectorCacheCount <= this.selectorCacheCountMin ) {
            return;
        }
        var cache = this.selectorCache;
        // Sorted from most-recently-used to least-recently-used, because
        //   we loop beginning at the end below.
        // We can't avoid sorting because we have to keep a minimum number of
        //   entries, and these entries should always be the most-recently-used.
        var hostnames = Object.keys(cache)
            .sort(function(a, b) { return cache[b].lastAccessTime - cache[a].lastAccessTime; })
            .slice(this.selectorCacheCountMin);
        var obsolete = Date.now() - this.selectorCacheAgeMax;
        var hostname, entry;
        var i = hostnames.length;
        while ( i-- ) {
            hostname = hostnames[i];
            entry = cache[hostname];
            if ( entry.lastAccessTime > obsolete ) {
                break;
            }
            // console.debug('pruneSelectorCacheAsync: flushing "%s"', hostname);
            entry.dispose();
            delete cache[hostname];
            this.selectorCacheCount -= 1;
        }
        this.triggerSelectorCachePruner();
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.retrieveGenericSelectors = function(request) {
        if ( this.acceptedCount === 0 ) {
            return;
        }
        if ( !request.selectors ) {
            return;
        }
    
        //quickProfiler.start('FilterContainer.retrieve()');
    
        var r = {
            hide: []
        };
        let hostname = this.µburi.hostnameFromURI(request.pageURL);

        let skipCosmetics = [];
        this.retrieveFromSelectorCache(hostname, 'cosmetic', skipCosmetics);

        var hash, bucket;
        var hashMask = this.genericHashMask;
        var hideSelectors = r.hide;
        var selectors = request.selectors;
        let exception = request.exception || [];
        var i = selectors.length;
        var selector;
        while ( i-- ) {
            selector = selectors[i];
            if ( !selector ) {
                continue;
            }
            if(this.lowGenericHide.lg.has(selector) && skipCosmetics.indexOf(selector) === -1 && exception.indexOf(selector) === -1 ) {
                hideSelectors.push(selector);
            }
            let lgmselector = this.lowGenericHide.lgm.get(selector);
            if ( lgmselector === undefined ) {
                continue;
            }
            else if ( typeof lgmselector === 'string') {
                if(skipCosmetics.indexOf(selector) === -1 && exception.indexOf(selector) === -1)
                    hideSelectors.push(lgmselector);
            } else {
                lgmselector.forEach(function(element) {
                    if(skipCosmetics.indexOf(element) === -1 && exception.indexOf(selector) === -1)
                        hideSelectors.push(element);
                });
            }
        }
        /* Add to selector cache */ 
        if(hideSelectors.length !== 0) {
            this.addToSelectorCache({
                hostname: hostname,
                selectors: hideSelectors,
                type: 'cosmetic'
            });
        }
        r.injectedSelectors = [];
        //https://issues.adblockplus.org/ticket/5090
       if(vAPI.cssOriginSupport) {
            const details = {
                code: '',
                cssOrigin: 'user',
                frameId: request.frameId,
                runAt: 'document_start'
            };
            if ( hideSelectors.length !== 0 ) {
                details.code = hideSelectors.join(',\n') + '\n{display:none!important;}';
                r.injectedSelectors = hideSelectors;
                vAPI.insertCSS(request.tabId, details);
                hideSelectors = [];
            }
        }
       
        //quickProfiler.stop();
    
        //console.log(
        //    'µBlock> abp-hide-filters.js: %d selectors in => %d selectors out',
        //    request.selectors.length,
        //    r.hide.length + r.donthide.length
        //);
    
        return r;
    };
    
    FilterContainer.prototype.injectNow = function(details, request, context, options) {
        let r = µb.cosmeticFilteringEngine.retrieveDomainSelectors(request, options, 'script');
        for(let i=0; i < r.cosmeticHide.length; i++) {
            r.cosmeticHide[i].split(";").forEach(function(element) {
                if(element != "") {
                    let argsEspaced = [];
                    let args = element.trim().split(/\s/);
                    for(let i = 0; i < args.length; i++) {
                        let arg = args[i].trim().replace(/"/g, '\\"');
                        argsEspaced.push(arg);
                    }
                    let snippet = argsEspaced.shift();
                    if(supportedSnippet.has(snippet)) {
                        µb.scriptlets.injectNow(context, details, snippet, argsEspaced);
                    }
                }
            });
            µb.logger.writeOne(details.tabId, context, 'sb:' + context.requestHostname + "#$#" + r.cosmeticHide[i]);
        }
    };
    /******************************************************************************/
    
    FilterContainer.prototype.retrieveDomainSelectors = function(request, options, flag = 'css') {
        if ( !request.locationURL ) {
            return;
        }
        
        //quickProfiler.start('FilterContainer.retrieve()');
    
        var hostname = µb.URI.hostnameFromURI(request.locationURL);
        var domain = µb.URI.domainFromHostname(hostname) || hostname;
        var pos = domain.indexOf('.');
    
        // https://github.com/uBlockAdmin/uBlock/issues/587
        // r.ready will tell the content script the cosmetic filtering engine is
        // up and ready.
    
        var r = {
            ready: this.frozen,
            domain: domain,
            entity: pos === -1 ? domain : domain.slice(0, pos - domain.length),
            skipCosmeticFiltering: options.skipCosmeticFiltering,
            cosmeticHide: [],
            procedureHide: [],
            cosmeticDonthide: [],
            netHide: [],
            netCollapse: µb.userSettings.collapseBlocked,
            cosmeticUserCss: [],
            shouldObserveAttributes: false,
            shouldObserveCharacterData: false
        };
        if(options.skipCosmeticFiltering) {
            return r;
        }
        
        // https://github.com/uBlockAdmin/uBlock/issues/497
        //r.donthide = this.genericDonthide;

        var hash, bucket;
        let hosthashes = µb.getHostnameHashesFromLabelsBackward(hostname, domain);

        // entity filter buckets are always plain js array
        if(this.entityFilters.hasOwnProperty(flag)) {
            if ( bucket = this.entityFilters[flag][r.entity] ) {
                r.cosmeticHide = r.cosmeticHide.concat(bucket);
            }
        }

        if(!this.hostnameFilterDataView.hasOwnProperty(flag)) { 
            if(request.procedureSelectorsOnly) {
                return JSON.stringify(r.procedureHide);
            } else {
                return r;
            }
        }
        
        hash = makeHash(0, domain, this.domainHashMask);
        this.hostnameFilterDataView[flag].retrieve(hosthashes, hash, r.cosmeticHide);

        // https://github.com/uBlockAdmin/uBlock/issues/188
        // Special bucket for those filters without a valid domain name as per PSL
        hash = makeHash(0, this.type0NoDomainHash, this.domainHashMask);
        this.hostnameFilterDataView[flag].retrieve(hosthashes, hash, r.cosmeticHide);
    
        if(flag == 'script') {
            return r;    
        } 

        if(this.hostnameFilterDataView.hasOwnProperty("style")) {
            hash = makeHash(0, domain, this.domainHashMask);
            this.hostnameFilterDataView["style"].retrieve(hosthashes, hash, r.cosmeticUserCss);

            hash = makeHash(0, domain, this.domainHashMask, this.procedureMask);
            this.hostnameFilterDataView["style"].retrieve(hosthashes, hash, r.procedureHide);
        }
       
        // No entity exceptions as of now
        hash = makeHash(1, domain, this.domainHashMask);
        this.hostnameFilterDataView[flag].retrieve(hosthashes, hash, r.cosmeticDonthide);
        
        hash = makeHash(0, domain, this.domainHashMask, this.procedureMask);
        this.hostnameFilterDataView[flag].retrieve(hosthashes, hash, r.procedureHide);

        if(r.procedureHide.length > 0) {
            r.shouldObserveAttributes = r.procedureHide.some(selector => selector.indexOf("\"attr\":true") !== -1);
            r.shouldObserveCharacterData = r.procedureHide.some(selector => selector.indexOf("\"data\":true") !== -1);
        }

        if(request.procedureSelectorsOnly) {
            return  { 
                        procedureHide :r.procedureHide,
                        shouldObserveAttributes: r.shouldObserveAttributes,
                        shouldObserveCharacterData: r.shouldObserveCharacterData
                    };
        }
        
        // https://github.com/uBlockAdmin/uBlock/issues/188
        // Special bucket for those filters without a valid domain name as per PSL
        hash = makeHash(0, this.type1NoDomainHash, this.domainHashMask);
        this.hostnameFilterDataView[flag].retrieve(hosthashes, hash, r.cosmeticDonthide);
        
        r.highGenerics = {
            hideLow: Array.from(this.highLowGenericHide),
            hideMedium: Array.from(this.highMediumGenericHide),
            hideHigh: Array.from(this.highHighGenericHide)
        };
        
        this.retrieveFromSelectorCache(hostname, 'cosmetic', r.cosmeticHide);
        this.retrieveFromSelectorCache(hostname, 'net', r.netHide);
        
        if ( r.cosmeticDonthide.length !== 0 ) {
            let i = r.cosmeticDonthide.length;
            while ( i-- ) {
                let h = r.cosmeticHide.indexOf(r.cosmeticDonthide[i]);
                if(h !== -1) {
                    r.cosmeticHide.splice(h, 1);
                }
                let c = r.cosmeticUserCss.indexOf(r.cosmeticDonthide[i]);
                if(c !== -1) {
                    r.cosmeticUserCss.splice(c, 1);
                }
            }
        }
        r.injectedSelectors = [];
        r.injectedUserCss = [];
        if(vAPI.cssOriginSupport) {
            const details = {
                code: '',
                cssOrigin: 'user',
                frameId: request.frameId,
                runAt: 'document_start'
            };
            if(r.highGenerics) {
                if(r.highGenerics.hideLow.length !== 0) {
                    r.cosmeticHide.push(r.highGenerics.hideLow.join(',\n'));
                    r.highGenerics.hideLow = [];
                }
                if(r.highGenerics.hideMedium.length !== 0) {
                    r.cosmeticHide.push(r.highGenerics.hideMedium.join(',\n'));
                    r.highGenerics.hideMedium = [];
                }
                if(r.highGenerics.hideHigh.length !== 0) {
                    r.cosmeticHide.push(r.highGenerics.hideHigh.join(',\n'));
                    r.highGenerics.hideHigh = [];
                }
            }
            if ( r.cosmeticHide.length !== 0 ) {
                details.code = r.cosmeticHide.join(',\n') + '\n{display:none!important;}';
                r.injectedSelectors = r.cosmeticHide;
                vAPI.insertCSS(request.tabId, details);
                r.cosmeticHide = [];
            }
            if ( r.cosmeticUserCss.length !== 0 ) {
                details.code = r.cosmeticUserCss.join(',\n');
                r.injectedUserCss = r.cosmeticUserCss;
                vAPI.insertCSS(request.tabId, details);
                r.cosmeticUserCss = [];
            }
        }
        //quickProfiler.stop();
    
        //console.log(
        //    'µBlock> abp-hide-filters.js: "%s" => %d selectors out',
        //    request.locationURL,
        //    r.cosmeticHide.length + r.cosmeticDonthide.length
        //);
    
        return r;
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.getFilterCount = function() {
        return this.acceptedCount - this.duplicateCount;
    };
    
    /******************************************************************************/
    
    return new FilterContainer();
    
    /******************************************************************************/
    
    })();
    
    /******************************************************************************/
    