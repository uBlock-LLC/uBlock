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
    var pageDomainRegister = '';
    var pageHostnameHashes;
    var requestHostnameRegister = '';
    var requestDomainRegister = '';
    var requestHostnameHashes = '';
    var skipGenericBlocking = false;
    var objDataView;
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
    const isValidRegEx = function(s) {
        var isValid = true;
        try {
            new RegExp(s);
        } catch(e) {
            isValid = false;
        }
        return isValid;
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
    
   const PAGE_SIZE = 65000;
   let hostnameFilterDataViewWrapper = function() {
        this.objView = new µb.dataView(6000000);
        this.computedIds = new Map();
    }
    hostnameFilterDataViewWrapper.prototype = {
        pushToBuffer: function(hostnames, notHostnames, allHostnames) {
            let computedId = this.computeUniqueId(new Uint32Array(allHostnames).sort());
            if(!this.computedIds.has(computedId)) {
                if((this.objView.buffer.length - this.objView.pos) < (allHostnames.length * 4)) {
                    let len;
                    if(PAGE_SIZE < (allHostnames.length * 4))
                        len = PAGE_SIZE + ((allHostnames.length * 4) + this.objView.pos);
                    else 
                        len = this.objView.pos + PAGE_SIZE;
                    this.growBuffer(len);
                }
                let hostnamesView = this.objView.getUint32ArrayView(hostnames.length);
                let notHostnamesView = this.objView.getUint32ArrayView(notHostnames.length);
                hostnamesView.set(new Uint32Array(hostnames).sort());
                notHostnamesView.set(new Uint32Array(notHostnames).sort());
                let details = {
                                '+': {"offset": hostnamesView.byteOffset, "length": hostnamesView.length},
                                '-': {"offset": notHostnamesView.byteOffset, "length": notHostnamesView.length} 
                              };
                this.computedIds.set(computedId, details);
                return details;
            } else {
                return this.computedIds.get(computedId);
            }
        },
        growBuffer: function(bufferLength) {
            const newBuffer = new Uint8Array(bufferLength);
            newBuffer.set(this.objView.buffer);
            this.objView.buffer = newBuffer;
        },
        toSelfie: function() {
            return JSON.stringify({ 
                        "buffer": Array.from(this.objView.buffer)
                    });
        },
        fromSelfie: function(serializeObj) {
            let arr = JSON.parse(serializeObj);
            this.objView = new µb.dataView(arr["buffer"].length);
            this.objView.buffer.set(arr["buffer"]);
        },
        parseOptHostnames: function(domainStr) {
            let hostnames = [];
            let notHostnames = [];
            let allHostnames = [];
            domainStr.split("|").forEach(
                function(hostname) {
                    let tokenHash = µb.tokenHash(hostname);
                    if ( hostname.charAt(0) === '~' ) {
                        notHostnames.push(µb.tokenHash(hostname.slice(1)));
                    } else {
                        hostnames.push(tokenHash);
                    }
                    allHostnames.push(tokenHash);
                }
            );
            return [hostnames, notHostnames, allHostnames];
        },
        computeUniqueId: function(hostnames) {
            let hash = (5408 * 33);
            if (hostnames !== undefined) {
                for (let i = 0; i < hostnames.length; i += 1) {
                    hash = (hash * 33) ^ hostnames[i];
                }
            }
            return hash >>> 0;
        },
        match: function(details, hostnameOnlyFilter) {
            let hostnamesView, notHostnamesView;
            if(details['+'].length > 0)
                hostnamesView = new Uint32Array(this.objView.buffer.buffer, details['+'].offset, details['+'].length);
            if(details['-'].length > 0)
                notHostnamesView = new Uint32Array(this.objView.buffer.buffer, details['-'].offset, details['-'].length);
            let hostHashes;
            let blnStatus = false;
            let matchHostname = '';
            if(hostnameOnlyFilter) {
                hostHashes = requestHostnameHashes;
            } else {
                hostHashes = pageHostnameHashes;
            }
            if(details['+'].length == 0) {
                blnStatus = true;
            } else {
                Array.from(hostHashes).some(function(element) {
                    if(µb.binSearch(hostnamesView, element[0]) !== -1) {
                        matchHostname = element[1];
                        blnStatus = true;
                        return true;
                    } else {
                        return false;
                    }
                });
            }
            if(blnStatus && details['-'].length > 0)
                blnStatus = (blnStatus && (Array.from(hostHashes).some(element => µb.binSearch(notHostnamesView, element[0]) !== -1) === false));
            
            return blnStatus +'|'+ matchHostname;
        }
    };

   var FilterDomain = function(offsets, hostnameOnlyFilter) {
       this.offsets = offsets;
       this.hostnameOnlyFilter = hostnameOnlyFilter;
       this.h = ''; // short-lived register
    }	
    
    FilterDomain.fid = FilterDomain.prototype.fid = 'd';

    FilterDomain.prototype.match = function() {
        let result = objDataView.match(this.offsets, this.hostnameOnlyFilter);
        let pos = result.indexOf('|');
        let matchHostname = result.slice(pos + 1);
        let blnMatch = (result.slice(0, pos) == 'true');
        if(this.hostnameOnlyFilter) {
            this.h = '||' + matchHostname + '^';
        } else {
            this.h = matchHostname != '' ? '$domain=' + matchHostname : '';
        }
        return blnMatch;
    }
    FilterDomain.prototype.toSelfie = function() {
        return JSON.stringify(this.offsets) + '\t' + this.hostnameOnlyFilter;
    }
    FilterDomain.prototype.toString = function() {
        return this.h;
    };
    FilterDomain.prototype.toJSON = function() {
        return {[this.fid]: this.toSelfie()};
    }; 
    FilterDomain.fromSelfie = function(s) {
        let pos = s.indexOf('\t');
        return new FilterDomain(JSON.parse(s.slice(0, pos)), (s.slice(pos + 1) == 'true'));
    };
    /******************************************************************************/
    
    var FilterPair = function(f0, f1) {
        this.f0 = f0;
        this.f1 = f1;
    }
    FilterPair.prototype.match = function(url, tokenBeg) {
        return this.f0.match(url, tokenBeg) === true  && this.f1.match();
    }
    FilterPair.fid = FilterPair.prototype.fid = 'fp';

    FilterPair.prototype.toString = function() {
        return this.f0.toString() + "," + this.f1.toString();
    };
    FilterPair.prototype.toSelfie = function() {
        return [this.f0.fid, this.f0.toSelfie(), this.f1.toSelfie()];
    };
    FilterPair.fromSelfie = function(s) {
        let factory = FilterContainer.factories[s[0]];
        const f0 = factory.fromSelfie(s[1]);
        const f1 = FilterDomain.fromSelfie(s[2]);
        return new FilterPair(f0, f1);
    };
    FilterPair.prototype.toJSON = function() {
        return {[this.fid]: this.toSelfie()};
    } 

    var FilterPlain = function(s, tokenBeg) {
        this.s = s;
        this.tokenBeg = tokenBeg;
    };
    
    FilterPlain.prototype.match = function(url, tokenBeg) {
        return url.startsWith(this.s, tokenBeg - this.tokenBeg);
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
        return url.startsWith(this.s, tokenBeg);
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
       return url.startsWith(this.s, tokenBeg - 1);
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
        return url.startsWith(this.s);
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
        return url.endsWith(this.s);
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
        if ( !url.startsWith(this.s, tokenBeg) ) {
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
                return {[x.fid]:x.toSelfie()}
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
            prop = Object.keys(item)[0];
            value = Object.values(item)[0];
            let filter = FilterContainer.factories[prop].fromSelfie(value);
            arr.push(filter);
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
            return FilterRegex;
        }
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
            if (!isValidRegEx(this.f) ) {
                this.unsupported = true;
             }
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
        'google': true,
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
            this.token = µb.tokenHash('*r');
            return;
        }
    
        let s = this.f;
    
        // https://github.com/uBlockAdmin/uBlock/issues/1038
        // Match any URL.
        if ( s === '*' ) {
            this.token = µb.tokenHash('*'); 
            return;
        }
        else if(s == "https://") {
            this.token = µb.tokenHash('https://'); 
            return;
        }
        else if(s == "http://") {
            this.token = µb.tokenHash('http://'); 
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
            this.token = µb.tokenHash('~'); 
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
        this.httpsTokenHash = µb.tokenHash('https://'); 
        this.httpTokenHash = µb.tokenHash('http://'); 
        this.anyMatchTokenHash = µb.tokenHash('*'); 
        this.noTokenHash = µb.tokenHash('~'); 
        this.regexTokenHash = µb.tokenHash('*r'); 
        this.dotTokenHash = µb.tokenHash('.');
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
        this.categories = new Map();
        this.cspFilters = new Map();
        this.filterParser.reset();
        this.filterCounts = {};
        this.cspSubsets = new Map();
        objDataView = new hostnameFilterDataViewWrapper();
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.freeze = function() {
        this.duplicateBuster = {};
        this.filterParser.reset();
        this.frozen = true;
        let pushToBuffer = false;
        for ( const [ bits, bucket ] of this.categories ) {
           let notHostnames = [];
           if(bucket.has(this.dotTokenHash) && bucket.get(this.dotTokenHash).hasOwnProperty('dict')) {
                let details = objDataView.pushToBuffer(Array.from(bucket.get(this.dotTokenHash).dict), notHostnames, Array.from(bucket.get(this.dotTokenHash).dict));
                bucket.set(this.dotTokenHash, FilterDomain.fromSelfie(JSON.stringify(details) + '\t' + true));
                pushToBuffer = true;
            }
        }
        if(pushToBuffer) {
            objDataView.objView.buffer = objDataView.objView.slice();
            objDataView.computedIds = new Map();
        }
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
        '//': FilterRegex,
       '{h}': FilterHostnameDict,
         '_': FilterGeneric,
       '||_': FilterGenericHnAnchored,
         'd': FilterDomain,
        'fc': FilterCSP,
        'fp': FilterPair
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.toSelfie = function() {

        const categoriesToSelfie = function(categories) {
            const selfie = [];
            for ( const [ bits, bucket ] of categories ) {
                const tokens = [];
                for ( const [ tokenhash, filter ] of bucket ) {
                    tokens.push([ tokenhash, filter.toJSON() ]);
                }
                selfie.push([ bits, tokens ]);
            }
            return selfie;
        };

        return {
            processedFilterCount: this.processedFilterCount,
            acceptedCount: this.acceptedCount,
            rejectedCount: this.rejectedCount,
            allowFilterCount: this.allowFilterCount,
            blockFilterCount: this.blockFilterCount,
            duplicateCount: this.duplicateCount,
            hostnameFilterDataView: objDataView.toSelfie(),
            categories: categoriesToSelfie(this.categories), 
            cspFilters: categoriesToSelfie(this.cspFilters) 
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

        const getSelfie = function(tokenEntries) {
            let selfie;
            for(let prop in tokenEntries) {
              var item = tokenEntries[prop];
              selfie = FilterContainer.factories[prop].fromSelfie(item);
            }
            return selfie;
        }

        const filterFromSelfie = function(scategories) {
            var categories = new Map(); 
            for ( const [ bits, bucket ] of scategories) {
                const tokens = new Map();
                for ( const [ tokenhash, filter ] of bucket ) {
                    tokens.set(tokenhash, getSelfie(filter));
                }
                categories.set(bits, tokens);
            } 
            return categories;
        }

        objDataView.fromSelfie(selfie.hostnameFilterDataView);
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
        if ( parsed.hostnames.length !== 0 || parsed.notHostnames.length !== 0 || parsed.dataType == 'csp' || parsed.domainList != '') {
            return;
        }
    
        let party = AnyParty;
        if ( parsed.firstParty !== parsed.thirdParty ) {
            party = parsed.firstParty ? FirstParty : ThirdParty;
        }
        let keyShard = parsed.action | parsed.important | party;
    
        let type = parsed.types;
        if ( type === 0 ) {
            out.push([keyShard, this.dotTokenHash, parsed.f]);
            return true;
        }
    
        let bitOffset = 1;
        do {
            if ( type & 1 ) {
                out.push([keyShard | (bitOffset << 4), this.dotTokenHash, parsed.f]);
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
        let obj = {}, domains;
        obj.blnDomainSpecific = this.isDomainSpecific(parsed);
        obj.compiled = filterClass.compile(parsed, hostname);
        
        if(parsed.dataStr != "") {
            obj.csp = parsed.dataStr
        }
        
        if(parsed.domainList != "") {
            obj.domains = parsed.domainList;
            domains = obj.domains.split('|');
        }

        if ( type === 0 ) {
            if(obj.blnDomainSpecific) {
                for ( const hn of domains ) {
                    if(hn !== "") {
                        obj.domains = hn;
                        out.push([bits, parsed.token, filterClass.fid, JSON.stringify(obj)]);
                    }
                }
            } else {
                out.push([bits, parsed.token, filterClass.fid, JSON.stringify(obj)]);
            }
            return;
        }
        var bitOffset = 1;
        do {
            if ( type & 1 ) {

                if(obj.blnDomainSpecific) {
                    for ( const hn of domains ) {
                        if(hn !== "") {
                            obj.domains = hn;
                            out.push([bits | (bitOffset << 4), parsed.token, filterClass.fid, JSON.stringify(obj)]);
                        }
                    }
                } else {
                    out.push([bits | (bitOffset << 4), parsed.token, filterClass.fid, JSON.stringify(obj)]);
                }   
            }
            bitOffset += 1;
            type >>>= 1;
        } while ( type !== 0 );
    };

    FilterContainer.prototype.isDomainSpecific = function(parsed) {
        return  (parsed.token == this.noTokenHash || parsed.token == this.anyMatchTokenHash || parsed.token == this.httpTokenHash || parsed.token == this.httpsTokenHash) &&
                parsed.domainList != undefined && 
                parsed.domainList.indexOf('~') === -1 &&
                parsed.dataStr == "";    
    }
    /******************************************************************************/
   
    FilterContainer.prototype.fromCompiledContent = function(text) {
        
        let bucket, entry, factory, filter;
        
        for(let i =0; i < text.length; i++) {

            let line, fields;
            
            fields = text[i];

            line = fields.join("\v");

            this.acceptedCount += 1;
    
            let blnCspMatch = false;
            
            if(fields.length == 4) fields[3] = JSON.parse(fields[3]);

            if(fields.length > 2) {
                if(line.indexOf("\"csp\":") !== -1) {
                    blnCspMatch = true;
                }
            }
    
            if(blnCspMatch) {
                bucket = this.cspFilters.get(fields[0]);  
                if ( bucket === undefined ) {
                    bucket = new Map();
                    this.cspFilters.set(fields[0], bucket);
                }
            }
            else {
                if(fields.length == 4 && fields[3].blnDomainSpecific) {
                    fields[1] = µb.tokenHash(fields[3].domains);
                } 
                bucket = this.categories.get(fields[0]);
                if ( bucket === undefined ) {
                    bucket = new Map();
                    this.categories.set(fields[0], bucket);
                }
            }
            
            entry = bucket.get(fields[1]);
            
            if ( fields[1] === this.dotTokenHash ) {
                if ( entry === undefined ) {
                    entry = new FilterHostnameDict();
                    bucket.set(this.dotTokenHash, entry);
                }
                let hshash = µb.tokenHash(fields[2]);
                if ( entry.add(hshash) === false ) {
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
            
            if(fields[3].domains != undefined) {
                let [hostnames , notHostnames, allHostnames] = objDataView.parseOptHostnames(fields[3].domains);
                let details = objDataView.pushToBuffer(hostnames, notHostnames, allHostnames);
                filter = FilterPair.fromSelfie([fields[2], fields[3].compiled, JSON.stringify(details) + '\t' + false]);
            } 
            else {
                filter = factory.fromSelfie(fields[3].compiled);
            }
            
            if(blnCspMatch && fields[3].csp != undefined) {
                let csp =  new FilterCSP();
                csp.dataStr = fields[3].csp;
                csp.filters = filter;
                filter = csp;
            }
            
            if ( entry === undefined ) {
                bucket.set(fields[1], filter);
                continue;
            }
            if ( entry.fid === '[]' ) {
                entry.add(filter);
                continue;
            }
            bucket.set(
                fields[1],
                new FilterBucket(entry, filter)
            );
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
        const addToken = function (token, beg) {
            tokenEntry = tokens[i];
            if ( tokenEntry === undefined ) {
                tokenEntry = tokens[i] = new TokenEntry();
            }
            if(beg !== undefined) tokenEntry.beg = beg;
            tokenEntry.token = token;
            i += 1;
        }
        
        for (let element of Array.from(pageHostnameHashes.keys())) {
            addToken(element);
        }
        
        while ( matches = re.exec(url) ) {
            addToken(µb.tokenHash(matches[0]), matches.index);
            // https://github.com/uBlockAdmin/uBlock/issues/1118
            // Crazy case... but I guess we have to expect the worst...
            if ( i === 2048 ) {
                break;
            }
        }
        addToken(this.noTokenHash);
        addToken(this.anyMatchTokenHash);
        if ( url.startsWith('https://') ) {
            addToken(this.httpsTokenHash);
        } else if ( url.startsWith('http://') ) {
            addToken(this.httpTokenHash);
        }
        addToken('');
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.matchTokens = function(bucket, url) {
       
        // Hostname-only filters
        let f = bucket.get(this.dotTokenHash);
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
            f = bucket.get(token);
            
            if(f !== undefined && f.fid.indexOf('h') === -1 && f.fid != "[]" && skipGenericBlocking) {
                continue;
            }
            if ( f !== undefined && f.match(url, tokenEntry.beg) !== false ) {
                return f;
            }
        }
    
        // Regex-based filters
        f = bucket.get(this.regexTokenHash);
        if ( f !== undefined && f.match(url) !== false ) {
            return f;
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
    
        pageHostnameRegister = context.pageHostname || '';
        pageDomainRegister = context.pageDomain || pageHostnameRegister;
        pageHostnameHashes = context.pageHostnameHashes || '';
        requestHostnameRegister = context.requestHostname;
        requestDomainRegister = context.requestDomain;
        requestHostnameHashes = µb.getHostnameHashesFromLabelsBackward(requestHostnameRegister, requestDomainRegister, false);
       
        let party = isFirstParty(context.pageDomain, requestHostnameRegister) ? FirstParty : ThirdParty;
    
        // Be prepared to support unknown types
        let type = typeNameToTypeValue[requestType] || 0;
        if ( type === 0 ) {
            return '';
        }
        // Tokenize only once
        this.tokenize(url);

        let categoryKeysMap = new Map([ 
                                        ["important", [
                                                        BlockAnyParty | Important | type, 
                                                        BlockAction | Important | type | party
                                                    ]
                                        ],
                                        ["blocked", [
                                                        BlockAnyParty | type, 
                                                        BlockAction | type | party
                                                    ]
                                        ],
                                        ["allowed", [
                                                        AllowAnyParty | type, 
                                                        AllowAction | type | party
                                                    ]
                                        ]
                                    ]);

        return this.match(url, categoryKeysMap, context);
    };
    
    FilterContainer.prototype.matchStringExceptionOnlyRule = function(url, requestType) {
        pageHostnameRegister = µb.URI.hostnameFromURI(url) || '';
        pageDomainRegister = µb.URI.domainFromHostname(pageHostnameRegister) || pageHostnameRegister;
        pageHostnameHashes = µb.getHostnameHashesFromLabelsBackward(pageHostnameRegister, pageDomainRegister, false);
        requestHostnameRegister = µb.URI.hostnameFromURI(url);
        requestDomainRegister = µb.URI.domainFromHostname(requestHostnameRegister) || requestHostnameRegister;
        requestHostnameHashes = µb.getHostnameHashesFromLabelsBackward(requestHostnameRegister, requestDomainRegister, false);
        let party = FirstParty;
        
        let type = typeNameToTypeValue[requestType] || 0;
        if ( type === 0 ) {
            return '';
        }
        this.tokenize(url);

        let categoryKeysMap = new Map([ 
                                        ["important", [
                                                        BlockAction | AnyParty | type | Important
                                                    ]
                                        ],
                                        ["allowed", [
                                                        AllowAnyParty | type, 
                                                        AllowAction | type | party
                                                    ]
                                        ]
                                    ]);
        let context = {};
        context.skipGenericBlocking = false;
        return this.match(url, categoryKeysMap, context);
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
            f = bucket.get(token);
            if(f !== undefined && f.fid.indexOf('h') === -1 && f.fid != "[]" && skipGenericBlocking) {
                continue;
            }
            if ( f !== undefined && f.match(url, tokenEntry.beg) !== false ) {
                if(f.fid == "[]")
                    out.set(f.f.dataStr,f.f);
                else
                    out.set(f.dataStr,f); 
            }
        }
        f = bucket.get(this.regexTokenHash);
        if ( f !== undefined && f.match(url) !== false ) {
            if(f.fid == "[]")
                out.set(f.f.dataStr,f.f);
            else
                out.set(f.dataStr,f); 
        }
    };
    
    FilterContainer.prototype.matchAndFetchCspData = function(context) {
        pageHostnameRegister = context.pageHostname || '';
        pageDomainRegister = context.pageDomain || pageHostnameRegister;
        pageHostnameHashes = context.pageHostnameHashes || '';
        requestHostnameRegister = context.requestHostname;
        requestDomainRegister = context.requestDomain; 
        requestHostnameHashes = µb.getHostnameHashesFromLabelsBackward(requestHostnameRegister, requestDomainRegister, false);
        let bucket, categoryKey;
        let type = typeNameToTypeValue["csp"];
        let toBlockCSP = new Map();
        let toAllowCSP = new Map();
    
        categoryKey = BlockAnyParty | type;    
        if ( bucket = this.cspFilters.get(categoryKey) ) {
            this.matchCspRules(bucket, context.requestURL, toBlockCSP);
        }
        categoryKey = AllowAnyParty | type;  
        if ( bucket = this.cspFilters.get(categoryKey) ) {
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
    
    FilterContainer.prototype.match = function(url, categoryKeysMap, context) {

        let bucket, bf = false, tf;
        skipGenericBlocking = context.skipGenericBlocking;

        for (let [key, categoryKeys] of Array.from(categoryKeysMap)) { 

            if(key == "allowed" && bf === false && categoryKeysMap.has("blocked")) {
                return '';
            } else if(key == "allowed" && bf !== false && categoryKeysMap.has("blocked")) {
                tf = bf;
            }
            else if(key == "allowed") {
                skipGenericBlocking = false;
            }
        
            for (let i = 0; i < categoryKeys.length; i++) { 
                if ( bucket = this.categories.get(categoryKeys[i]) ) {
                    bf = this.matchTokens(bucket, url);
                    if ( bf !== false && key == "important") {
                        return 'sb:' + bf.toString() + '$important';
                    }
                    else if( bf !== false && key == "allowed") {
                        return 'sa:' + bf.toString();
                    } else if(bf !== false) {
                        break;
                    }
                }
            }
        }     
        if(tf === undefined) return '';                               
        return 'sb:' + tf.toString();
    }
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
        pageDomainRegister = context.pageDomain || pageHostnameRegister;
        pageHostnameHashes = context.pageHostnameHashes || '';
        requestHostnameRegister = context.requestHostname;
        requestDomainRegister = context.requestDomain; 
        requestHostnameHashes = µb.getHostnameHashesFromLabelsBackward(requestHostnameRegister, requestDomainRegister, false);
    
        let party = isFirstParty(context.pageDomain, context.requestHostname) ? FirstParty : ThirdParty;
        
        // Tokenize only once
        this.tokenize(url);
        
        let categoryKeysMap = new Map([ 
                                        ["important", [
                                                        BlockAnyTypeAnyParty | Important, 
                                                        BlockAnyType | Important | party,
                                                        BlockAnyParty | Important | type,
                                                        BlockAction | Important | type | party
                                                    ]
                                        ],
                                        ["blocked", [
                                                        BlockAnyTypeAnyParty, 
                                                        BlockAnyType | party,
                                                        BlockAnyParty | type,
                                                        BlockAction | type | party
                                                    ]
                                        ],
                                        ["allowed", [
                                                        AllowAnyTypeAnyParty, 
                                                        AllowAnyType | party,
                                                        AllowAnyParty | type,
                                                        AllowAction | type | party
                                                    ]
                                        ]
                                    ]);
        return this.match(url, categoryKeysMap, context);
    };
    
    /******************************************************************************/
    
    FilterContainer.prototype.getFilterCount = function() {
        return this.acceptedCount - this.duplicateCount;
    };
    
    /******************************************************************************/
    
    return new FilterContainer();
    
    /******************************************************************************/
    
    })();
    