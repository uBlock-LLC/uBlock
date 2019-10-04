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

/* global vAPI, µBlock */

/******************************************************************************/

(function(){

'use strict';

/******************************************************************************/

// https://github.com/uBlockAdmin/uBlock/issues/405
// Be more flexible with whitelist syntax

// Any special regexp char will be escaped
var whitelistDirectiveEscape = /[-\/\\^$+?.()|[\]{}]/g;

// All `*` will be expanded into `.*`
var whitelistDirectiveEscapeAsterisk = /\*/g;

// Probably manually entered whitelist directive
var isHandcraftedWhitelistDirective = function(directive) {
    return directive.indexOf('/') !== -1 &&
           directive.indexOf('*') !== -1;
};

var matchWhitelistDirective = function(url, hostname, directive) {
    // Directive is a plain hostname
    if ( directive.indexOf('/') === -1 ) {
        return hostname.slice(-directive.length) === directive;
    }
    // Match URL exactly
    if ( directive.indexOf('*') === -1 ) {
        return url === directive;
    }
    // Regex escape code inspired from:
    //   "Is there a RegExp.escape function in Javascript?"
    //   http://stackoverflow.com/a/3561711
    var reStr = directive.replace(whitelistDirectiveEscape, '\\$&')
                         .replace(whitelistDirectiveEscapeAsterisk, '.*');
    var re = new RegExp(reStr);
    return re.test(url);
};

/******************************************************************************/

µBlock.getNetFilteringSwitch = function(url) {
    var netWhitelist = this.netWhitelist;
    var buckets, i, pos;
    var targetHostname = this.URI.hostnameFromURI(url);
    var key = targetHostname;
    for (;;) {
        if ( netWhitelist.hasOwnProperty(key) ) {
            buckets = netWhitelist[key];
            i = buckets.length;
            while ( i-- ) {
                if ( matchWhitelistDirective(url, targetHostname, buckets[i]) ) {
                    // console.log('"%s" matche url "%s"', buckets[i], url);
                    return false;
                }
            }
        }
        pos = key.indexOf('.');
        if ( pos === -1 ) {
            break;
        }
        key = key.slice(pos + 1);
    }
    return true;
};

/******************************************************************************/

µBlock.toggleNetFilteringSwitch = function(url, scope, newState) {
    var currentState = this.getNetFilteringSwitch(url);
    if ( newState === undefined ) {
        newState = !currentState;
    }
    if ( newState === currentState ) {
        return currentState;
    }

    var netWhitelist = this.netWhitelist;
    var pos = url.indexOf('#');
    var targetURL = pos !== -1 ? url.slice(0, pos) : url;
    var targetHostname = this.URI.hostnameFromURI(targetURL);
    var key = targetHostname;
    var directive = scope === 'page' ? targetURL : targetHostname;

    // Add to directive list
    if ( newState === false ) {
        if ( netWhitelist.hasOwnProperty(key) === false ) {
            netWhitelist[key] = [];
        }
        netWhitelist[key].push(directive);
        this.saveWhitelist();
        return true;
    }

    // Remove from directive list whatever causes current URL to be whitelisted
    var buckets, i;
    for (;;) {
        if ( netWhitelist.hasOwnProperty(key) ) {
            buckets = netWhitelist[key];
            i = buckets.length;
            while ( i-- ) {
                directive = buckets[i];
                if ( !matchWhitelistDirective(targetURL, targetHostname, directive) ) {
                    continue;
                }
                buckets.splice(i, 1);
                // If it is a directive which can't be created easily through
                // the user interface, keep it around as a commented out
                // directive
                if ( isHandcraftedWhitelistDirective(directive) ) {
                    netWhitelist['#'].push('# ' + directive);
                }
            }
            if ( buckets.length === 0 ) {
                delete netWhitelist[key];
            }
        }
        pos = key.indexOf('.');
        if ( pos === -1 ) {
            break;
        }
        key = key.slice(pos + 1);
    }
    this.saveWhitelist();
    return true;
};

/******************************************************************************/

µBlock.stringFromWhitelist = function(whitelist) {
    var r = {};
    var i, bucket;
    for ( var key in whitelist ) {
        if ( whitelist.hasOwnProperty(key) === false ) {
            continue;
        }
        bucket = whitelist[key];
        i = bucket.length;
        while ( i-- ) {
            r[bucket[i]] = true;
        }
    }
    return Object.keys(r).sort(function(a,b){return a.localeCompare(b);}).join('\n');
};

/******************************************************************************/

µBlock.whitelistFromString = function(s) {
    var whitelist = {
        '#': []
    };
    var reInvalidHostname = /[^a-z0-9.\-\[\]:]/;
    var reHostnameExtractor = /([a-z0-9\[][a-z0-9.\-:]*[a-z0-9\]])\/(?:[^\x00-\x20\/]|$)[^\x00-\x20]*$/;
    var lines = s.split(/[\n\r]+/);
    var line, matches, key, directive;
    for ( var i = 0; i < lines.length; i++ ) {
        line = lines[i].trim();
        // https://github.com/gorhill/uBlock/issues/171
        // Skip empty lines
        if ( line === '' ) {
            continue;
        }

        // Don't throw out commented out lines: user might want to fix them
        if ( line.charAt(0) === '#' ) {
            key = '#';
            directive = line;
        }
        // Plain hostname
        else if ( line.indexOf('/') === -1 ) {
            if ( reInvalidHostname.test(line) ) {
                key = '#';
                directive = '# ' + line;
            } else {
                key = directive = line;
            }
        }
        // URL, possibly wildcarded: there MUST be at least one hostname
        // label (or else it would be just impossible to make an efficient
        // dict.
        else {
            matches = reHostnameExtractor.exec(line);
            if ( !matches || matches.length !== 2 ) {
                key = '#';
                directive = '# ' + line;
            } else {
                key = matches[1];
                directive = line;
            }
        }

        // https://github.com/gorhill/uBlock/issues/171
        // Skip empty keys
        if ( key === '' ) {
            continue;
        }

        // Be sure this stays fixed:
        // https://github.com/uBlockAdmin/uBlock/issues/185
        if ( whitelist.hasOwnProperty(key) === false ) {
            whitelist[key] = [];
        }
        whitelist[key].push(directive);
    }
    return whitelist;
};

/******************************************************************************/

// Return all settings if none specified.

µBlock.changeUserSettings = function(name, value) {
    if ( name === undefined ) {
        return this.userSettings;
    }

    if ( typeof name !== 'string' || name === '' ) {
        return;
    }

    // Do not allow an unknown user setting to be created
    if ( this.userSettings[name] === undefined ) {
        return;
    }

    if ( value === undefined ) {
        return this.userSettings[name];
    }

    // Pre-change
    switch ( name ) {
        default:
            break;
    }

    // Change
    this.userSettings[name] = value;

    // Post-change
    switch ( name ) {
        case 'collapseBlocked':
            if ( value === false ) {
                this.cosmeticFilteringEngine.removeFromSelectorCache('*', 'net');
            }
            break;
        case 'contextMenuEnabled':
            this.contextMenu.toggle(value);
            break;
        case 'experimentalEnabled':
            if ( typeof this.mirrors === 'object' ) {
                // https://github.com/uBlockAdmin/uBlock/issues/540
                // Disabling local mirroring for the time being
                this.mirrors.toggle(false /* value */);
            }
            break;
        default:
            break;
    }

    this.saveUserSettings();
};

/******************************************************************************/

µBlock.elementPickerExec = function(tabId, target) {
    this.epickerTarget = target;
    vAPI.tabs.injectScript(tabId, { file: 'js/element-picker.js' });
};


/*
The below scriptlet is taken from given link
https://github.com/darkskyapp/string-hash/blob/master/index.js
*/

µBlock.tokenHash = function(str) {
    let hash = 5381,
    i = str.length;
    while(i) {
      hash = (hash * 33) ^ str.charCodeAt(--i);
    }
   return hash >>> 0;
}
/******************************************************************************/

µBlock.toggleFirewallRule = function(details) {
    if ( details.action !== 0 ) {
        this.sessionFirewall.setCellZ(details.srcHostname, details.desHostname, details.requestType, details.action);
    } else {
        this.sessionFirewall.unsetCell(details.srcHostname, details.desHostname, details.requestType);
    }

    // https://github.com/uBlockAdmin/uBlock/issues/731#issuecomment-73937469
    if ( details.persist ) {
        if ( details.action !== 0 ) {
            this.permanentFirewall.setCellZ(details.srcHostname, details.desHostname, details.requestType, details.action);
        } else {
            this.permanentFirewall.unsetCell(details.srcHostname, details.desHostname, details.requestType, details.action);
        }
        this.savePermanentFirewallRules();
    }

    // https://github.com/uBlockAdmin/uBlock/issues/420
    this.cosmeticFilteringEngine.removeFromSelectorCache(details.srcHostname, 'net');
};

/******************************************************************************/

µBlock.isBlockResult = function(result) {
    return typeof result === 'string' && result.charAt(1) === 'b';
};

/******************************************************************************/

µBlock.isAllowResult = function(result) {
    return typeof result !== 'string' || result.charAt(1) !== 'b';
};

/******************************************************************************/
/*
    The code below is taken from here: https://github.com/sindresorhus/quick-lru/blob/master/index.js
    Author: https://github.com/sindresorhus
    benchmark: https://github.com/dominictarr/bench-lru
*/
µBlock.LRUCache = function(maxSize) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.oldCache = new Map();
    this._size = 0;
};
µBlock.LRUCache.prototype = {
    _set: function(key, value) {
        this.cache.set(key, value);
        this._size++;
    
        if (this._size >= this.maxSize) {
            this._size = 0;
            this.oldCache = this.cache;
            this.cache = new Map();
        }
    },
    get: function(key) {
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }
    
        if (this.oldCache.has(key)) {
            const value = this.oldCache.get(key);
            this._set(key, value);
            return value;
        }
    },
    set: function(key, value) {
        if (this.cache.has(key)) {
            this.cache.set(key, value);
        } else {
            this._set(key, value);
        }

        return this;
    },
    has: function(key){
        return this.cache.has(key) || this.oldCache.has(key);
    },
    peek: function(key){
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }
    
        if (this.oldCache.has(key)) {
            return this.oldCache.get(key);
        }
    },
    delete: function(key) {
        const deleted = this.cache.delete(key);
        if (deleted) {
            this._size--;
        }
        return this.oldCache.delete(key) || deleted;
    },
    clear: function() {
        this.cache.clear();
        this.oldCache.clear();
        this._size = 0;
    },
    keys: function* (){
        for (const [key] of this) {
            yield key;
        }
    },
    values: function* (){
        for (const [, value] of this) {
            yield value;
        }
    },
    [Symbol.iterator]: function* (){
        for (const item of this.cache) {
            yield item;
        }
    
        for (const item of this.oldCache) {
            const [key] = item;
            if (!this.cache.has(key)) {
                yield item;
            }
        }
    }
};

/*  
    The code below is taken from here: https://github.com/cliqz-oss/adblocker/blob/master/src/data-view.ts
    License: https://github.com/cliqz-oss/adblocker/blob/master/LICENSE
*/
µBlock.dataView = function(length) {
    this.pos = 0;
    this.buffer = new Uint8Array(length);
    this.reHasUnicode = /[^\x00-\x7F]/;
    this.puny_encoded = 1 << 15;
}
µBlock.dataView.prototype = {
    getPos: function() {
        return this.pos;
    },
    seekZero: function() {
        this.pos = 0;
    },
    setByte: function(pos, byte) {
        this.buffer[pos] = byte;
    },
    getUint8: function() {
        return this.buffer[this.pos++];
    },
    align: function(alignement) {
        this.pos =
            this.pos % alignement === 0
            ? this.pos
            : Math.floor(this.pos / alignement) * alignement + alignement;
    },
    pushUint8: function(uint8) {
        this.buffer[this.pos++] = uint8;
    },
    pushUint32: function(uint32) {
        this.buffer[this.pos++] = uint32 >>> 24;
        this.buffer[this.pos++] = uint32 >>> 16;
        this.buffer[this.pos++] = uint32 >>> 8;
        this.buffer[this.pos++] = uint32;
    },
    pushUint32Array: function(arr) {
        this.pushUint32(arr.length);
        for (let i = 0; i < arr.length; i += 1) {
            this.pushUint32(arr[i]);
        }
    },
    pushUTF8: function(raw) {
        let str = raw;
        if ( this.reHasUnicode.test(raw) ) {
            str = punycode.encode(raw);
            this.pushUint16(this.setBit(str.length, this.puny_encoded));
        } else {
            this.pushUint16(str.length);
        }
        for (let i = 0; i < str.length; i += 1) {
            this.buffer[this.pos++] = str.charCodeAt(i);
        }
    },
    slice: function() {
        this.checkSize();
        return this.buffer.slice(0, this.pos);
    },
    checkSize: function() {
        if (this.pos !== 0 && this.pos > this.buffer.byteLength) {
            console.error(`StaticDataView too small: ${this.buffer.byteLength}, but required ${this.pos - 1} bytes`);
        }
    },
    setPos: function(pos){
        this.pos = pos;
    },
    getUTF8: function() {
        const lengthAndMask = this.getUint16();
        const byteLength = this.clearBit(lengthAndMask, this.puny_encoded);
        const punyEncoded = this.getBit(lengthAndMask, this.puny_encoded);
        this.pos += byteLength;
        const str = String.fromCharCode.apply(
        null,
        this.buffer.subarray(this.pos - byteLength, this.pos)
        );
        if (punyEncoded) {
            return punycode.decode(str);
        }
        return str;
    },
    getUint32ArrayView: function(desiredSize) {
        this.align(4);
        const view = new Uint32Array(
        this.buffer.buffer,
        this.pos + this.buffer.byteOffset,
        desiredSize
        );
        this.pos += desiredSize * 4;
        return view;
    },
    getUint16: function() {
        return ((this.buffer[this.pos++] << 8) | this.buffer[this.pos++]) >>> 0;
    },
    pushUint16: function(uint16) {
        this.buffer[this.pos++] = uint16 >>> 8;
        this.buffer[this.pos++] = uint16;
    },
    setBit: function(n, mask) {
        return n | mask;
    },
    getBit: function(n, mask) {
        return !!(n & mask);
    },
    clearBit: function(n, mask) {
        return n & ~mask;
    }
}
/*
    The code below is taken from here: https://github.com/cliqz-oss/adblocker/blob/32397857de8c439fb4c961f12d7e17c750b3fc98/src/filters/cosmetic.ts#L114
    License: https://github.com/cliqz-oss/adblocker/blob/master/LICENSE
*/
µBlock.computeSelectorsId = function(selectors) {
    let hash = (5408 * 33);
    for(let i = 0; i < selectors.length; i++) {
      for (let j = 0; j < selectors[i].length; j += 1) {
        hash = (hash * 33) ^ selectors[i].charCodeAt(j);
      }
    }
   return hash >>> 0;
}
/*
    The code below is taken from here: https://github.com/cliqz-oss/adblocker/blob/32397857de8c439fb4c961f12d7e17c750b3fc98/src/filters/cosmetic.ts#L51
    License: https://github.com/cliqz-oss/adblocker/blob/master/LICENSE
*/
µBlock.getHostnameHashesFromLabelsBackward = function(hostname, domain, hashesOnly = true) {
    if(hostname == domain && hostname.indexOf('www.') !== -1) {
        domain = hostname.slice(hostname.indexOf('.') + 1);
    }
    return µBlock.getDomainHashesFromBackward(hostname, hostname.length, hostname.length - domain.length, hashesOnly); 
}

/*
    The code below is taken from here: https://github.com/cliqz-oss/adblocker/blob/32397857de8c439fb4c961f12d7e17c750b3fc98/src/filters/cosmetic.ts#L16
    License: https://github.com/cliqz-oss/adblocker/blob/master/LICENSE
*/
µBlock.getDomainHashesFromBackward = function(hostname, end, startOfDomain, hashesOnly) {
    const hashes = new Map();
    let hash = 5381;
  
    // Compute hash backward, label per label
    for (let i = end - 1; i >= 0; i -= 1) {
      // Process label
      if (hostname[i] === '.' && i < startOfDomain) {
        hashes.set(hash >>> 0,hostname.slice(-(end - i - 1)));
      }
      
      // Update hash
      hash = (hash * 33) ^ hostname.charCodeAt(i);
    }
    hashes.set(hash >>> 0, hostname);

    if(hashesOnly) {
        return [ ...hashes.keys() ];
    } else {
        return hashes;
    }
}
/*
    The code below is taken from here: https://github.com/cliqz-oss/adblocker/blob/675755584a2c9b45f66ab26e7683f513e1253b01/src/utils.ts#L225
    License: https://github.com/cliqz-oss/adblocker/blob/master/LICENSE
*/
µBlock.binSearch = function(arr, elt) {
    if (arr.length === 0) {
      return -1;
    }
  
    let low = 0;
    let high = arr.length - 1;
  
    while (low <= high) {
      const mid = (low + high) >>> 1;
      const midVal = arr[mid];
      if (midVal < elt) {
        low = mid + 1;
      } else if (midVal > elt) {
        high = mid - 1;
      } else {
        return mid;
      }
    }
    return -1;
}
µBlock.logCosmeticFilters = (function() {
    var tabIdToTimerMap = {};

    var injectNow = function(tabId) {
        delete tabIdToTimerMap[tabId];
        vAPI.tabs.injectScript(tabId, { file: 'js/cosmetic-logger.js' });
    };

    var injectAsync = function(tabId) {
        if ( tabIdToTimerMap.hasOwnProperty(tabId) ) {
            return;
        }
        tabIdToTimerMap[tabId] = setTimeout(
            injectNow.bind(null, tabId),
            100
        );
    };

    return injectAsync;
})();
/*
    The below code is borrowed from:
    https://github.com/gorhill/uBlock/blob/13f2b6b86ff00827650ee2e70ea5f4779845ce4a/src/js/scriptlet-filtering.js#L61

    License is GPL3:
    https://github.com/gorhill/uBlock/blob/master/README.md
*/
µBlock.contentscriptCode = (function() {
    let parts = [
        '(',
        function(hostname, scriptlets) {
            if (
                document.location === null ||
                hostname !== document.location.hostname
            ) {
                return;
            }
            let injectScriptlets = function(d) {
                let script;
                try {
                    script = d.createElement('script');
                    script.appendChild(d.createTextNode(
                        decodeURIComponent(scriptlets))
                    );
                    (d.head || d.documentElement).appendChild(script);
                } catch (ex) {
                }
                if ( script ) {
                    if ( script.parentNode ) {
                        script.parentNode.removeChild(script);
                    }
                    script.textContent = '';
                }
            };
            injectScriptlets(document);
            let processIFrame = function(iframe) {
                let src = iframe.src;
                if ( /^https?:\/\//.test(src) === false ) {
                    injectScriptlets(iframe.contentDocument);
                }
            };
            let observerTimer,
                observerLists = [];
            let observerAsync = function() {
                for ( let nodelist of observerLists ) {
                    for ( let node of nodelist ) {
                        if ( node.nodeType !== 1 ) { continue; }
                        if ( node.parentElement === null ) { continue; }
                        if ( node.localName === 'iframe' ) {
                            processIFrame(node);
                        }
                        if ( node.childElementCount === 0 ) { continue; }
                        let iframes = node.querySelectorAll('iframe');
                        for ( let iframe of iframes ) {
                            processIFrame(iframe);
                        }
                    }
                }
                observerLists = [];
                observerTimer = undefined;
            };
            let ready = function(ev) {
                if ( ev !== undefined ) {
                    window.removeEventListener(ev.type, ready);
                }
                let iframes = document.getElementsByTagName('iframe');
                if ( iframes.length !== 0 ) {
                    observerLists.push(iframes);
                    observerTimer = setTimeout(observerAsync, 1);
                }
                let observer = new MutationObserver(function(mutations) {
                    for ( let mutation of mutations ) {
                        if ( mutation.addedNodes.length !== 0 ) {
                            observerLists.push(mutation.addedNodes);
                        }
                    }
                    if (
                        observerLists.length !== 0 &&
                        observerTimer === undefined
                    ) {
                        observerTimer = setTimeout(observerAsync, 1);
                    }
                });
                observer.observe(
                    document.documentElement,
                    { childList: true, subtree: true }
                );
            };
            if ( document.readyState === 'loading' ) {
                window.addEventListener('DOMContentLoaded', ready);
            } else {
                ready();
            }
        }.toString(),
        ')(',
            '"', 'hostname-slot', '", ',
            '"', 'scriptlets-slot', '"',
        '); void 0;',
    ];
    return {
        parts: parts,
        hostnameSlot: parts.indexOf('hostname-slot'),
        scriptletsSlot: parts.indexOf('scriptlets-slot'),
        assemble: function(hostname, scriptlets) {
            this.parts[this.hostnameSlot] = hostname;
            this.parts[this.scriptletsSlot] =
                encodeURIComponent(scriptlets);
            return this.parts.join('');
        }
    };
})();

µBlock.scriptlets = (function(){
    var µb = µBlock;

    let injectNow = function(context, details, snippet, args) {
        let replaceParams = function(scriptlets, args) {
            const reParams = /(\{\{(\d)\}\})+/g;
            reParams.lastIndex = 0;
            let matches;
            while ( matches = reParams.exec(scriptlets)) {
                scriptlets = scriptlets.replace(matches[0], args[matches[2] - 1] === undefined ? null : args[matches[2] - 1]);
            }
            return scriptlets;
        }
        var onDataReceived = function(response) {
            if(response.content != "") {
                var scriptlets = response.content;
                if(args !== undefined && Array.isArray(args) && args.length > 0)
                    scriptlets = replaceParams(scriptlets, args);

                let code = µb.contentscriptCode.assemble(context.pageHostname, scriptlets);
                vAPI.tabs.injectScript(
                    details.tabId,
                    {
                        code: code,
                        frameId: details.frameId,
                        matchAboutBlank: false,
                        runAt: 'document_start'
                    }
                ); 
            }
        }
        µb.assets.get('assets/scriptlets/'+ snippet + '.js', onDataReceived);
    }
    return {
        injectNow:injectNow
        };
})();
/******************************************************************************/

})();
