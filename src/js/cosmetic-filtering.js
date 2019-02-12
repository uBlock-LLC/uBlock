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
    
    /*
      I took the idea to store specific filters from here:
      
      Commits: 
      https://github.com/gorhill/uBlock/blob/8a616bcafb8c5143f76b5ff4b0d94a78c11786b2/src/js/cosmetic-filtering.js#L64
      https://github.com/gorhill/uBlock/blob/8a616bcafb8c5143f76b5ff4b0d94a78c11786b2/src/js/cosmetic-filtering.js#L110
      https://github.com/gorhill/uBlock/blob/8a616bcafb8c5143f76b5ff4b0d94a78c11786b2/src/js/cosmetic-filtering.js#L156

      Author: https://github.com/gorhill
      
      License is GPL3: https://github.com/gorhill/uBlock/blob/master/README.md
    */

    let FilterHostnamesSelectors = function(mapping){
        this.hs = new Map(mapping);
    }
    FilterHostnamesSelectors.prototype.add = function(hostname, selector) {
        let selectors = this.hs.get(hostname);
        if ( selectors === undefined ) {
            this.hs.set(hostname, selector);
        } else if ( typeof selectors === 'string' ) {
            this.hs.set(hostname, [ selectors, selector ]);
        } else {
            selectors.push(selector);
        }
    }
    FilterHostnamesSelectors.prototype.retrieve = function(hostname, out) {
        this.hs.forEach(function(value, key) {
            if ( hostname.slice(-key.length) === key ) {
                let selectors = value;
                if ( typeof selectors === 'string' ) {
                    out.push(selectors);
                }
                else {
                    out.push(...selectors);
                }
            }
        });
    };
    FilterHostnamesSelectors.prototype.fid = 'hmm';
    
    FilterHostnamesSelectors.prototype.toSelfie = function() {
        return JSON.stringify(Array.from(this.hs));
    };
    FilterHostnamesSelectors.fromSelfie = function(s) {
        let f = new FilterHostnamesSelectors();
        let o = JSON.parse(s);
        f.hs = new Map(o);
        return f;
    };
    FilterHostnamesSelectors.prototype.toJSON = function() {
        return {[this.fid]: this.toSelfie()};
    } 
    
    /*************************************************************/
    
    let FilterHostnameSeletors = function(hostname, selectors) {
        this.hostname = hostname;
        this.selectors = selectors;
    }
    FilterHostnameSeletors.prototype.add = function(hostname, selector) {
        if(this.hostname == hostname){
            this.selectors.push(selector);
            return this;
        } else {
            return new FilterHostnamesSelectors([[this.hostname,this.selectors],[hostname, selector]]);
        }
    }
    FilterHostnameSeletors.prototype.retrieve = function(hostname, out) {
        if ( hostname.slice(-this.hostname.length) === this.hostname ) {
            out.push(...this.selectors);
        }
    };
    
    FilterHostnameSeletors.prototype.fid = 'hm';
    
    FilterHostnameSeletors.prototype.toSelfie = function() {
        let str = this.selectors.map(
            function(x){
                return encode(x);
            }
        )
        return JSON.stringify(str) + '\t' + this.hostname;
    };
    
    FilterHostnameSeletors.fromSelfie = function(s) {
        let opts =  s.split('\t');
        let selectors = JSON.parse(opts[0]).map(
            function(x) {
                return decode(x);
            }
        )
        return new FilterHostnameSeletors(opts[1], selectors);
    };
    FilterHostnameSeletors.prototype.toJSON = function() {
        return {[this.fid]: this.toSelfie()};
    } 
    
    /*************************************************************/
    
    let FilterHostname = function(s, hostname) {
        this.s = s;
        this.hostname = hostname;
    };
    
    FilterHostname.prototype.add = function(hostname, selector) {
        if ( hostname === this.hostname ) {
            return new FilterHostnameSeletors(this.hostname,[ this.s, selector ]);
        } 
        else {
            return new FilterHostnamesSelectors([[this.hostname, this.s],[ hostname, selector ]]);
        }
    }
    
    FilterHostname.prototype.retrieve = function(hostname, out) {
        if ( hostname.slice(-this.hostname.length) === this.hostname ) {
            out.push(this.s);
        }
    };
    
    FilterHostname.prototype.fid = 'h';
    
    FilterHostname.prototype.toSelfie = function() {
        return encode(this.s) + '\t' + this.hostname;
    };
    
    FilterHostname.fromSelfie = function(s) {
        let pos = s.indexOf('\t');
        return new FilterHostname(decode(s.slice(0, pos)), s.slice(pos + 1));
    };
    FilterHostname.prototype.toJSON = function() {
        return {[this.fid]:this.toSelfie()};
    };
    
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
        this.reParser = /^\s*([^#]*)(##|#@#|#\?#)(.+)\s*$/;
    };
    
    /******************************************************************************/
    
    FilterParser.prototype.reset = function() {
        this.prefix = '';
        this.suffix = '';
        this.unhide = 0;
        this.hostnames.length = 0;
        this.invalid = false;
        this.cosmetic = true;
        return this;
    };
    
    /******************************************************************************/
    
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
    
        this.unhide = matches[2].charAt(1) === '@' ? 1 : 0;
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
        return hval.toString(36);
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
        this.highLowGenericHide = {};
        this.highLowGenericHideCount = 0;
    
        // a[href^="http..."]
        this.highMediumGenericHide = {};
        this.highMediumGenericHideCount = 0;
    
        // everything else
        this.highHighGenericHideArray = [];
        this.highHighGenericHide = '';
        this.highHighGenericHideCount = 0;
    
        // generic exception filters
        this.genericDonthide = [];
    
        // hostname, entity-based filters
        this.hostnameFilters = {};
        this.entityFilters = {};
    };
    
    /******************************************************************************/
    
    // https://github.com/uBlockAdmin/uBlock/issues/1004
    // Detect and report invalid CSS selectors.
    
    FilterContainer.prototype.div = document.createElement('div');
    
    // Not all browsers support `Element.matches`:
    // http://caniuse.com/#feat=matchesselector
    
    if ( typeof FilterContainer.prototype.div.matches === 'function' ) {
        FilterContainer.prototype.isValidSelector = function(s) {
            try {
                this.div.matches(s);
            } catch (e) {
                console.error('uBlock> invalid cosmetic filter:', s);
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
        
        let isValid = abpSelectorRegexp.test(parsed.suffix) ? true : this.isValidSelector(parsed.suffix); 
        // For hostname- or entity-based filters, class- or id-based selectors are
        // still the most common, and can easily be tested using a plain regex.
        if (
            this.reClassOrIdSelector.test(parsed.suffix) === false &&
            isValid === false
        ) {
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
            hash = unhide === 0 ? this.type0NoDomainHash : this.type1NoDomainHash;
        } else {
            hash = abpSelectorRegexp.test(parsed.suffix) ? makeHash(unhide, domain, this.domainHashMask, this.procedureMask) : makeHash(unhide, domain, this.domainHashMask);
        }
        out.push(['h', hash, hostname, parsed.suffix]);
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.compileEntitySelector = function(hostname, parsed, out) {
        let entity = hostname.slice(0, -2);
        out.push(['e',entity, parsed.suffix]);
    };
    
    /******************************************************************************/
    
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
            if ( fields[0] === 'h' ) {
                bucket = this.hostnameFilters[fields[1]];
                if ( bucket === undefined ) {
                    this.hostnameFilters[fields[1]] = new FilterHostname(fields[3], fields[2]);
                } else if ( bucket instanceof FilterHostnamesSelectors) {
                    bucket.add(fields[2], fields[3]);
                } else {
                    this.hostnameFilters[fields[1]] = bucket.add(fields[2], fields[3]);
                }
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
            if ( fields[0] === 'e' ) {
                bucket = this.entityFilters[fields[1]];
                if ( bucket === undefined ) {
                    this.entityFilters[fields[1]] = [fields[2]];
                } else {
                    bucket.push(fields[2]);
                }
                continue;
            }
    
            if ( fields[0] === 'hlg0' ) {
                this.highLowGenericHide[fields[1]] = true;
                this.highLowGenericHideCount += 1;
                continue;
            }
    
            if ( fields[0] === 'hmg0' ) {
                if ( Array.isArray(this.highMediumGenericHide[fields[1]]) ) {
                    this.highMediumGenericHide[fields[1]].push(fields[2]);
                } else {
                    this.highMediumGenericHide[fields[1]] = [fields[2]];
                }
                this.highMediumGenericHideCount += 1;
                continue;
            }
    
            if ( fields[0] === 'hhg0' ) {
                this.highHighGenericHideArray.push(fields[1]);
                this.highHighGenericHideCount += 1;
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
        this.duplicateBuster = {};
    
        if ( this.highHighGenericHide !== '' ) {
            this.highHighGenericHideArray.unshift(this.highHighGenericHide);
        }
        this.highHighGenericHide = this.highHighGenericHideArray.join(',\n');
        this.highHighGenericHideArray = [];
    
        this.parser.reset();
        this.frozen = true;
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.toSelfie = function() {

        let stringify = function(hostnameFilters) {
            let arr = [];
            for (const [key, value] of Object.entries(hostnameFilters)) {
                arr.push({[key]: JSON.stringify(value)});
              }
            return JSON.stringify(arr);
        }
        return {
            acceptedCount: this.acceptedCount,
            duplicateCount: this.duplicateCount,
            hostnameSpecificFilters: stringify(this.hostnameFilters),
            entitySpecificFilters: this.entityFilters,
            lowGenericHide: {"lg": Array.from(this.lowGenericHide.lg), "lgm": Array.from(this.lowGenericHide.lgm)},
            highLowGenericHide: this.highLowGenericHide,
            highLowGenericHideCount: this.highLowGenericHideCount,
            highMediumGenericHide: this.highMediumGenericHide,
            highMediumGenericHideCount: this.highMediumGenericHideCount,
            highHighGenericHide: this.highHighGenericHide,
            highHighGenericHideCount: this.highHighGenericHideCount,
            genericDonthide: this.genericDonthide
        };
    };
    
    FilterContainer.factories = {
             'h': FilterHostname,
           'hmm': FilterHostnamesSelectors,
           'hm' : FilterHostnameSeletors
    };
    /******************************************************************************/
    
    FilterContainer.prototype.fromSelfie = function(selfie) {
       
    
        var filterFromSelfie = function(s) {
    
            function getSelfie(tokenEntries) {
                let selfie;
                for(let prop in tokenEntries) {
                  var item = tokenEntries[prop];
                  selfie = FilterContainer.factories[prop].fromSelfie(item);
                }
                return selfie;
            }

            let categories = JSON.parse(s);
            let categoriesDict = {}; 
            for(let item of categories) { 
                for (const [key, value] of Object.entries(item)) { 
                    categoriesDict[key] = getSelfie(JSON.parse(value));
                }
            }
            return categoriesDict;
        }
    
        this.acceptedCount = selfie.acceptedCount;
        this.duplicateCount = selfie.duplicateCount;
        this.hostnameFilters = filterFromSelfie(selfie.hostnameSpecificFilters);
        this.entityFilters = selfie.entitySpecificFilters;
        this.lowGenericHide = {"lg": new Set(selfie.lowGenericHide.lg),"lgm": new Map(selfie.lowGenericHide.lgm)};
        this.highLowGenericHide = selfie.highLowGenericHide;
        this.highLowGenericHideCount = selfie.highLowGenericHideCount;
        this.highMediumGenericHide = selfie.highMediumGenericHide;
        this.highMediumGenericHideCount = selfie.highMediumGenericHideCount;
        this.highHighGenericHide = selfie.highHighGenericHide;
        this.highHighGenericHideCount = selfie.highHighGenericHideCount;
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
    
        if ( request.firstSurvey ) {
            r.highGenerics = {
                hideLow: this.highLowGenericHide,
                hideLowCount: this.highLowGenericHideCount,
                hideMedium: this.highMediumGenericHide,
                hideMediumCount: this.highMediumGenericHideCount,
                hideHigh: this.highHighGenericHide,
                hideHighCount: this.highHighGenericHideCount
            };
            // https://github.com/uBlockAdmin/uBlock/issues/497
            r.donthide = this.genericDonthide;
        }
    
        var hash, bucket;
        var hashMask = this.genericHashMask;
        var hideSelectors = r.hide;
        var selectors = request.selectors;
        var i = selectors.length;
        var selector;
        while ( i-- ) {
            selector = selectors[i];
            if ( !selector ) {
                continue;
            }
            if(this.lowGenericHide.lg.has(selector)){
                hideSelectors.push(selector);
            }
            let lgmselector = this.lowGenericHide.lgm.get(selector);
            if ( lgmselector === undefined ) {
                continue;
            }
            else if ( typeof lgmselector === 'string' ) {
                hideSelectors.push(lgmselector);
            } else {
                hideSelectors.push(...lgmselector);
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
    
    /******************************************************************************/
    
    FilterContainer.prototype.retrieveDomainSelectors = function(request,options) {
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
            netCollapse: µb.userSettings.collapseBlocked
        };
        if(options.skipCosmeticFiltering){
            return r;
        }
        var hash, bucket;
        hash = makeHash(0, domain, this.domainHashMask);
        if ( bucket = this.hostnameFilters[hash] ) {
            bucket.retrieve(hostname, r.cosmeticHide);
        }
        // https://github.com/uBlockAdmin/uBlock/issues/188
        // Special bucket for those filters without a valid domain name as per PSL
        if ( bucket = this.hostnameFilters[this.type0NoDomainHash] ) {
            bucket.retrieve(hostname, r.cosmeticHide);
        }
    
        // entity filter buckets are always plain js array
        if ( bucket = this.entityFilters[r.entity] ) {
            r.cosmeticHide = r.cosmeticHide.concat(bucket);
        }
        // No entity exceptions as of now
    
        hash = makeHash(1, domain, this.domainHashMask);
        if ( bucket = this.hostnameFilters[hash] ) {
            bucket.retrieve(hostname, r.cosmeticDonthide);
        }
        
        hash = makeHash(0, domain, this.domainHashMask, this.procedureMask);
        if ( bucket = this.hostnameFilters[hash] ) {
            bucket.retrieve(hostname, r.procedureHide);
        }
        if(request.procedureSelectorsOnly) {
            return r.procedureHide;
        }
    
        // https://github.com/uBlockAdmin/uBlock/issues/188
        // Special bucket for those filters without a valid domain name as per PSL
        if ( bucket = this.hostnameFilters[this.type1NoDomainHash] ) {
            bucket.retrieve(hostname, r.cosmeticDonthide);
        }
    
        this.retrieveFromSelectorCache(hostname, 'cosmetic', r.cosmeticHide);
        this.retrieveFromSelectorCache(hostname, 'net', r.netHide);
    
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
    