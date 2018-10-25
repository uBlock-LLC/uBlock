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

µBlock.rewriteEngine = (function (){
    
    var parseResult = function(result) {
		let rewrite = '';
		let pos = result.indexOf('$');
        let text = result.slice(0, pos);
    	if ( pos !== -1 ) {
          	rewrite = result.slice(pos + 1).slice(8);
    	}
    	return [text,rewrite];
	}
	
	var convertTextToRexExp = function (text){
		// remove multiple wildcards
        if (text.length >= 2 && text[0] == "/" && text[text.length - 1] == "/") {
            text = text.substr(1, text.length - 2);
        } else {
            text = text.replace(/\*+/g, "*");

            text = text
                // remove anchors following separator placeholder
                .replace(/\^\|$/, "^")
                // escape special symbols
                .replace(/\W/g, "\\$&")
                // replace wildcards by .*
                .replace(/\\\*/g, ".*")
                // process separator placeholders (all ANSI characters but alphanumeric
                // characters and _%.-)
                .replace(/\\\^/g, "(?:[\\x00-\\x24\\x26-\\x2C\\x2F\\x3A-\\x40\\x5B-\\x5E\\x60\\x7B-\\x7F]|$)")
                // process extended anchor at expression start
                .replace(/^\\\|\\\|/, "^[\\w\\-]+:\\/+(?!\\/)(?:[^\\/]+\\.)?")
                // process anchor at expression start
                .replace(/^\\\|/, "^")
                // process anchor at expression end
                .replace(/\\\|$/, "$");
        }
        let regexp = new RegExp(text,false ? "" : "i");
        return regexp;
	}
	
	var rewriteUrl = function(url,result) {
		let [text,rewrite] = parseResult(result);
        let regexp = convertTextToRexExp(text);
        try
        {
            let rewrittenUrl = new URL(url.replace(regexp, rewrite), url);
            if (rewrittenUrl.origin == new URL(url).origin)
                return rewrittenUrl.href;
            }
        catch (e)
        {
        }
        return url;
    }
   return {rewriteUrl : rewriteUrl};
})();

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
    let injectNow = function(context,details) {
        var onDataReceived = function(response){
            if(response.content != "") {
                var scriptlets = response.content;
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
        µb.assets.get('assets/scriptlets/nowebrtc.js', onDataReceived);
    }
    return {
        injectNow:injectNow
        };
})();
/******************************************************************************/

})();
