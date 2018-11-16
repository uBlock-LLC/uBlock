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

/* global vAPI, HTMLDocument */

/******************************************************************************/

// Injected into content pages

(function() {

'use strict';

/******************************************************************************/

// https://github.com/uBlockAdmin/uBlock/issues/464
if ( document instanceof HTMLDocument === false ) {
    //console.debug('contentscript-end.js > not a HTLMDocument');
    return false;
}

if ( !vAPI ) {
    //console.debug('contentscript-end.js > vAPI not found');
    return;
}

// https://github.com/uBlockAdmin/uBlock/issues/587
// Pointless to execute without the start script having done its job.
if ( !vAPI.contentscriptStartInjected ) {
    return;
}

// https://github.com/uBlockAdmin/uBlock/issues/456
// Already injected?
if ( vAPI.contentscriptEndInjected ) {
    //console.debug('contentscript-end.js > content script already injected');
    return;
}
vAPI.proceduralCosmeticFiltering = (function() {
    const abpSelectorRegexp = /:-abp-([\w-]+)\(/i;
    let scopeSupported = true;
    const incompletePrefixRegexp = /[\s>+~]$/;
    let reRegexRule = /^\/(.*)\/$/;
    //let testdocument = document;
    
    function scopedQuerySelector(subtree, selector, all) {
      
        if (selector[0] == ">") {
            selector = ":scope" + selector;
    
        if (scopeSupported) {
          return all ? subtree.querySelectorAll(selector) :
            subtree.querySelector(selector);
        }
        if (scopeSupported == null)
          return tryQuerySelector(subtree, selector, all);
        return null;
      }
      return all ? subtree.querySelectorAll(selector) :
        subtree.querySelector(selector);
    }
    function filterToRegExp(text, captureAll = false) {
        // remove multiple wildcards
        text = text.replace(/\*+/g, "*");
  
        if (!captureAll)
        {
            // remove leading wildcard
            if (text[0] == "*")
            text = text.substring(1);
  
            // remove trailing wildcard
            if (text[text.length - 1] == "*")
            text = text.substring(0, text.length - 1);
        }
  
        return text
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
    function scopedQuerySelectorAll(subtree, selector) {
      return scopedQuerySelector(subtree, selector, true);
    }
    function findIndex(iterable, callback, thisArg) {
      let index = 0;
      for (let item of iterable) {
        if (callback.call(thisArg, item))
          return index;
        index++;
      }
      return -1;
    }
    function indexOf(iterable, searchElement) {
      return findIndex(iterable, item => item === searchElement);
    }
    function positionInParent(node) {
      return indexOf(node.parentNode.children, node) + 1;
    }
    function makeSelector(node, selector = "") {
        if (node == null)
            return null;
        if (!node.parentElement) {
            let newSelector = ":root";
            if (selector)
                newSelector += " > " + selector;
            return newSelector;
        }
        let idx = positionInParent(node);
        if (idx > 0) {
            let newSelector = `${node.tagName}:nth-child(${idx})`;
            if (selector)
                newSelector += " > " + selector;
            return makeSelector(node.parentElement, newSelector);
        }
    
        return selector;
    }
    function cartesianProductOf() {
      return Array.prototype.reduce.call(arguments, function(a, b) {
        var ret = [];
        a.forEach(function(a) {
          b.forEach(function(b) {
            ret.push(a.concat([b]));
          });
        });
        return ret;
      }, [[]]);
    }
    function prime(input,prefix) {
        var root = input || document;
        let actualPrefix = (!prefix || incompletePrefixRegexp.test(prefix)) ?
        prefix + "*" : prefix;
        let elements = scopedQuerySelectorAll(root, actualPrefix);
        return elements;
    }
    function makeRegExpParameter(text) {
      let [, pattern, flags] = /^\/(.*)\/([imu]*)$/.exec(text) || [null, text.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")];
      try {
        return new RegExp(pattern, flags);
      } catch (e) {
      }
      return null;
    }
    
    const styleObserver = (function () { 
        let sheetToFilterSelectorMap = new Map();
        let parsedFilters = [];
        let registeredFiltersMap = Object.create(null);
         
        const registerStylePropertyFilter = function (filter) {
            filter = filter.trim();
            if (registeredFiltersMap[filter]) { return; }
            let re;
            let regexpString;
            if (filter.length >= 2 && filter[0] == "/" &&
                        filter[filter.length - 1] == "/")
            {
                regexpString = filter.slice(1, -1)
                    .replace("\\7B ", "{").replace("\\7D ", "}").replace(/;$/,"");
            }
            else
                regexpString = filterToRegExp(filter);
  
            re = new RegExp(regexpString, "i");
            
            parsedFilters.push({
                filter: filter,
                re: re
            });
            registeredFiltersMap[filter] = true;
        };
        const getSelector = function(filter) {
            var styleSheets = document.styleSheets;
            var selectors = [];
    
            for (var _i10 = 0, _length10 = styleSheets.length; _i10 < _length10; _i10++) {
                var styleSheet = styleSheets[_i10];
                if (styleSheet.disabled) {
                    continue;
                } 
                var map = sheetToFilterSelectorMap.get(styleSheet);
                if (typeof map === 'undefined') {
                    continue;
                }
                Array.prototype.push.apply(selectors, map[filter]);
            }
            return selectors;
        };
        const isSameOrigin = function(stylesheet) {
            try {
                return new URL(stylesheet.href).origin == document.location.origin;
            }
            catch (e) {
                return true;
            }
        };
        const readStyleSheetContent = function (styleSheet) {
            if (!isSameOrigin(styleSheet)) {
                return;
            }
            var rules = styleSheet.cssRules;
            var map = Object.create(null);
    
            for (var _i8 = 0, _length8 = rules.length; _i8 < _length8; _i8++) {
                var rule = rules[_i8];
                if (rule.type !== CSSRule.STYLE_RULE) {
                    continue;
                }
                var stringifiedStyle = stringifyStyle(rule);
                
                for (var _i9 = 0, _length9 = parsedFilters.length; _i9 < _length9; _i9++) {
                    var parsedFilter = parsedFilters[_i9];
                    var re = parsedFilter.re;
                  
                    if (!re.test(stringifiedStyle)) {
                        continue;
                    }
                    var selectorText = rule.selectorText.replace(/::(?:after|before)/, '');
                    let filter = parsedFilter.filter;
    
                    if (typeof map[filter] === 'undefined') {
                        map[filter] = [selectorText];
                    } else {
                        map[filter].push(selectorText);
                    }
               }
            }
            sheetToFilterSelectorMap.set(styleSheet, map);
        };
        const stringifyStyle = function (rule) {
            var styles = [];
            var style = rule.style;
            var i = void 0,
                l = void 0;
            for (i = 0, l = style.length; i < l; i++) {
                styles.push(style[i]);
            }
            styles.sort();
            for (i = 0; i < l; i++) {
                var property = styles[i];
                var value = style.getPropertyValue(property);
                var priority = style.getPropertyPriority(property);
                styles[i] += ': ' + value;
                if (priority.length) {
                    styles[i] += '!' + priority;
                }
            }
            return styles.join(" ");
        };
        return {
            registerStylePropertyFilter: registerStylePropertyFilter,
            getSelector: getSelector,
            readStyleSheetContent: readStyleSheetContent
        };
    })();
    
    const getCombineSelectors = function(selectors) {
        let arrSelector = [];
        let productOfSelectors = [];
        let combineSelectors = [];
        for (var value of selectors.values()) {
            Array.isArray(value) ? arrSelector.push([...value]) : arrSelector.push([value]);
        }
        if(arrSelector.length > 1) {
            productOfSelectors = cartesianProductOf(...arrSelector)
            for ( var arrayOfCombineSelector of productOfSelectors ) {
                let combineSelector = arrayOfCombineSelector.join("");
                combineSelectors.push(combineSelector);
            }
        } else {
            combineSelectors = arrSelector[0];
        }
        return combineSelectors;
    }
    var hasSelector = function(hasSelector, prefix) {
        this.prefix = prefix;
        this._innerSelectors = hasSelector;
        this.hasParallelSiblingSelector = false;
        this.dependsOnDOM = true;
    }
    hasSelector.prototype = {
        get maybeContainsSiblingCombinators() {
          return this._innerSelectors.some(selector => selector.maybeContainsSiblingCombinators);
        },
        get maybeDependsOnAttributes() {
          return this._innerSelectors.some(selector => selector.maybeDependsOnAttributes);
        },
        get dependsOnCharacterData() {
          return this._innerSelectors.some(selector => selector.dependsOnCharacterData);
        },
        get dependsOnStyles() {
          return this._innerSelectors.some(selector => selector.dependsOnStyles);
        },
        getSelectors: function(rootnode, selectors, targets) {
            var nodes = prime(rootnode,this.prefix);
            var matchSelector = [];
            var lastRoot = null;
            for ( var node of nodes ) {
                if (lastRoot && lastRoot.contains(node) && !this.hasParallelSiblingSelector) {
                    continue;
                }
                if (targets && !targets.some(target => node.contains(target) ||
                                               target.contains(node))) {
                    continue;
                }
                let iselectors = new Map();
                evaluate(this._innerSelectors, 0, node, iselectors, targets);
                if(iselectors.size > 0) {
                    let combineSelectors = getCombineSelectors(iselectors);
                    for ( var combineSelector of combineSelectors ) {
                        if(scopedQuerySelector(node, combineSelector,false)) {
                            matchSelector.push(makeSelector(node));
                            lastRoot = node;
                            break;
                        }
                    }
                }
            }
            if(matchSelector.length > 0) 
                selectors.set('has',matchSelector);
            return;
        }
    }
    var containSelector = function(selectorText, prefix) {
        this.prefix = prefix;
        this._regexp = makeRegExpParameter(selectorText);
        this.hasParallelSiblingSelector = false;
        this.dependsOnCharacterData = true;
        this.dependsOnDOM = true;
    }
    containSelector.prototype = {
        getSelectors: function(rootnode, selectors, targets) {
            var matchSelector = [];
            let lastRoot = null;
            var nodes = prime(rootnode, this.prefix);
            for ( var node of nodes ) {
                if (lastRoot && lastRoot.contains(node) && !this.hasParallelSiblingSelector){
                    continue;
                }
                if (targets && !targets.some(target => node.contains(target) ||
                                               target.contains(node))) {
                    continue;
                }
                lastRoot = node;
                if (this._regexp && this._regexp.test(node.textContent)) {
                    matchSelector.push(makeSelector(node));
                }
            }
            if(matchSelector.length > 0) 
                selectors.set('contains',matchSelector);
            return;
        }
    }
    var plainSelector = function(selectorText) {
        this.selector = selectorText;
        this.maybeContainsSiblingCombinators = /[~+]/.test(selectorText);
        this.maybeDependsOnAttributes = /[#.]|\[.+\]/.test(selectorText);
        this.dependsOnDOM = true;
    }
    plainSelector.prototype =  {
        getSelectors: function(input, selectors) {
            selectors.set('plain',[this.selector]);
            return;
        }
    }
    var propsSelector = function(propertyExpression, prefix) {
        this.prefix = prefix;
        this.propertyExpression = propertyExpression;
        this.hasParallelSiblingSelector = false;
        this.dependsOnStyles = true;
        this.dependsOnDOM = true;
        styleObserver.registerStylePropertyFilter(propertyExpression);
    }
    propsSelector.prototype = {
        getSelectors: function(rootnode, selectors, targets) {
            var matchSelector = [];
            var nodes = prime(rootnode, this.prefix);
            var styleSelectors = styleObserver.getSelector(this.propertyExpression);
            if (styleSelectors.length === 0)
                return;
            let lastRoot = null;    
            for ( var node of nodes ) {
                if (lastRoot && lastRoot.contains(node) && !this.hasParallelSiblingSelector) {
                    continue;
                }
                for (var i = 0, length = styleSelectors.length; i < length; i++) {
                    var stypleSelector = styleSelectors[i];
                    if (node.matches(stypleSelector)) {   
                        matchSelector.push(makeSelector(node));
                        lastRoot = node;
                        break;
                    }
                }
            }
            if(matchSelector.length > 0) 
                selectors.set('properties',matchSelector);
            return;        
        }
    }
    var proceduralSelector = function() {
        this.operatorMap = new Map([['has', hasSelector], ['contains', containSelector], ['properties', propsSelector]]);
        this.patterns = [];
    }
    proceduralSelector.prototype = {
        parseProcedure : function(expression, prefix = "") {
            let tasks = [];
            let matches = abpSelectorRegexp.exec(expression);
            if(!matches) {
                return [new plainSelector(expression)];
            } 
            var prefix = expression.substring(0,matches.index);
            let remaining = expression.substring(matches.index + matches[0].length);
            let parsed = this.parseContent(remaining,0);
            let selectorText = parsed.text;
            if(matches[1] == "properties") {
                tasks.push(new (this.operatorMap.get(matches[1]))(selectorText,prefix));
            }
            else if(matches[1] == "has") {
                let procSelector = this.parseProcedure(selectorText, prefix);
                tasks.push(new (this.operatorMap.get(matches[1]))(procSelector,prefix));
            }
            else if(matches[1] == "contains") {
                tasks.push(new (this.operatorMap.get(matches[1]))(selectorText,prefix));
            }
            else {
                console.error(new SyntaxError("Failed to parse uBlock."));
                return null;
            }
            let suffixtext = remaining.substring(parsed.end + 1);
            if (suffixtext != "") {
                let suffix = this.parseProcedure(suffixtext);
                if(suffix.length == 1 && suffix[0] instanceof plainSelector && suffix[0].maybeContainsSiblingCombinators) {
                    for (let task of tasks) {
                        if(task instanceof hasSelector || task instanceof containSelector ||  task instanceof proceduralSelector) {
                            task.hasParallelSiblingSelector = true;
                        }
                    }
                }
                tasks.push(...suffix);
            }
            return tasks;
        },
        parseContent: function(content, startIndex) {
            let parens = 1;
            let quote = null;
            let i = startIndex;
            for (; i < content.length; i++) {
                let c = content[i];
                if (c == "\\") {
                i++;
                }
                else if (quote) {
                if (c == quote)
                    quote = null;
                }
                else if (c == "'" || c == '"')
                quote = c;
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
        },
        applyPatterns: function(patterns) {
            this.patterns = [];
            for (let selector of patterns) {
                var tasks = this.parseProcedure(selector,"");
                this.patterns.push([selector, tasks]);
            } 
            if(this.patterns.length > 0) {
                this.processPattern();
                document.addEventListener("load", onLoad.bind(this), true);
            }
        },
        processPattern: function(stylesheets, mutations) {
            let patterns = this.patterns.filter(([selector, tasks]) => this.filterPatterns(tasks, mutations, stylesheets));
            
            if (!stylesheets && !mutations)
                stylesheets = document.styleSheets;
            
            if (mutations && this.patterns.some(([selector, tasks]) => tasks.some(task => task.dependsOnStyles && task.dependsOnDOM)))
                stylesheets = document.styleSheets;
  
            for (let stylesheet of stylesheets || []) {   
                styleObserver.readStyleSheetContent(stylesheet);
            }
  
            var matchSelector = [];
            var matchProcSelector = [];
            let mutationTargets = this.extractMutationTargets(mutations);
            var mutations = mutations;
  
            for (let [selector, tasks] of patterns) {
                let patternHasSiblingCombinator = tasks.some(task => task.maybeContainsSiblingCombinators);
                let selectors = new Map();
                if(tasks != null) {
                    evaluate(tasks, 0, "", selectors, (patternHasSiblingCombinator) ? null : mutationTargets);
                }
                if(selectors.size > 0) {
                    let combineSelectors = getCombineSelectors(selectors);
                    for ( var combineSelector of combineSelectors ) {
                        if(scopedQuerySelector(document, combineSelector,false)) {
                            if(!matchProcSelector.includes(selector))
                                matchProcSelector.push(selector);
                                matchSelector.push(combineSelector);
                        }
                    }
                }
            }
            if(matchSelector.length > 0) {
                vAPI.injectedProcedureCosmeticFilters.push(...matchProcSelector);
                let text = matchSelector.join(',\n');
                hideElements(text);
            }
        },
        matchesMutationTypes: function(patterns, mutationTypes) {
            let mutationTypeMatchMap = new Map([
                ["childList", true],
                ["attributes", patterns.some(pattern => pattern.maybeDependsOnAttributes)],
                ["characterData", patterns.some(pattern => pattern.dependsOnCharacterData)]
            ]);
  
            for (let mutationType of mutationTypes) {
                if (mutationTypeMatchMap.get(mutationType))
                    return true;
            }
            return false;
        },
        filterPatterns: function(patterns, mutations, stylesheets) {
            if (!stylesheets && !mutations)
                return patterns;
  
            let mutationTypes = mutations ? extractMutationTypes(mutations) : null;
            
            return (stylesheets && patterns.some(pattern => pattern.dependsOnStyles)) ||
                        (mutations &&  patterns.some(pattern => pattern.dependsOnDOM) &&
                            this.matchesMutationTypes(patterns, mutationTypes)
            );
        },
        extractMutationTargets: function(mutations) {
            if (!mutations)
                return null;
  
            let targets = new Set();
            for (let mutation of mutations) {
                if (mutation.type == "childList") {
                    for (let node of mutation.addedNodes)
                        targets.add(node);
                }
                else {
                    targets.add(mutation.target);
                }
            }
            return [...targets];
        },
        shouldObserveAttributes: function() {
            return this.patterns.some(([selector, tasks]) => tasks.some(task => task.maybeDependsOnAttributes));
        },
        shouldObserveCharacterData: function() {
            return this.patterns.some(([selector, tasks]) => tasks.some(task => task.dependsOnCharacterData));
        }
    }
    var evaluate = function(tasks, index, rootnode, selectors, targets) {
       tasks[index].getSelectors(rootnode,selectors, targets);
       index = index + 1;
       if(index >= tasks.length) {
           return;
       } else {
           evaluate(tasks, index, rootnode, selectors, targets);
       }
    }
    function extractMutationTypes(mutations) {
      let types = new Set();
      for (let mutation of mutations) {
          types.add(mutation.type);
          if (types.size == 3)
          break;
      }
      return types;
      }
    function onLoad(event) {
      let stylesheet = event.target.sheet;
      if (stylesheet)
      this.processPattern([stylesheet]);
    }
    var hideElements = function(selectors) {
      // https://github.com/uBlockAdmin/uBlock/issues/207
      // Do not call querySelectorAll() using invalid CSS selectors
      if ( selectors.length === 0 ) {
          return;
      }
      if ( document.body === null ) {
          return;
      }
      // https://github.com/uBlockAdmin/uBlock/issues/158
      // Using CSSStyleDeclaration.setProperty is more reliable
      var elems = document.querySelectorAll(selectors);
      var i = elems.length;
      while ( i-- ) {
          elems[i].style.setProperty('display', 'none', 'important');
      }
      messager.send({ what: 'cosmeticFiltersActivated' });
    };
    return new proceduralSelector();
  })();

vAPI.contentscriptEndInjected = true;
vAPI.styles = vAPI.styles || [];

/******************************************************************************/
/******************************************************************************/

var shutdownJobs = (function() {
    var jobs = [];

    return {
        add: function(job) {
            jobs.push(job);
        },
        exec: function() {
            //console.debug('Shutting down...');
            var job;
            while ( job = jobs.pop() ) {
                job();
            }
        }
    };
})();

/******************************************************************************/
/******************************************************************************/

var messager = vAPI.messaging.channel('contentscript-end.js');

// https://github.com/gorhill/uMatrix/issues/144
shutdownJobs.add(function() {
    messager.close();
});

/******************************************************************************/

// https://github.com/uBlockAdmin/uBlock/issues/789
// Be sure that specific cosmetic filters are still applied.
// Executed once, then flushed from memory.

(function() {
    // Were there specific cosmetic filters?
    if ( vAPI.specificHideStyle instanceof HTMLStyleElement === false ) {
        return;
    }
    // Is our style tag still in the DOM? (the guess is whatever parent there
    // is, it is in the DOM)
    if ( vAPI.specificHideStyle.parentNode !== null ) {
        return;
    }
    // Put it back
    var parent = document.head || document.documentElement;
    if ( parent ) {
        parent.appendChild(vAPI.specificHideStyle);
    }
})();

/******************************************************************************/
/******************************************************************************/

// https://github.com/uBlockAdmin/uBlock/issues/7

var uBlockCollapser = (function() {
    var timer = null;
    var requestId = 1;
    var newRequests = [];
    var pendingRequests = {};
    var pendingRequestCount = 0;
    var srcProps = {
        'embed': 'src',
        'iframe': 'src',
        'img': 'src',
        'object': 'data'
    };

    var PendingRequest = function(target, tagName, attr) {
        this.id = requestId++;
        this.target = target;
        this.tagName = tagName;
        this.attr = attr;
        pendingRequests[this.id] = this;
        pendingRequestCount += 1;
    };

    // Because a while ago I have observed constructors are faster than
    // literal object instanciations.
    var BouncingRequest = function(id, tagName, url) {
        this.id = id;
        this.tagName = tagName;
        this.url = url;
        this.collapse = false;
    };

    var onProcessed = function(response) {
        // https://github.com/gorhill/uMatrix/issues/144
        if ( response.shutdown ) {
            shutdownJobs.exec();
            return;
        }

        var requests = response.result;
        if ( requests === null || Array.isArray(requests) === false ) {
            return;
        }
        var selectors = [];
        var i = requests.length;
        var request, entry, target, value;
        while ( i-- ) {
            request = requests[i];
            if ( pendingRequests.hasOwnProperty(request.id) === false ) {
                continue;
            }
            entry = pendingRequests[request.id];
            delete pendingRequests[request.id];
            pendingRequestCount -= 1;

            // https://github.com/uBlockAdmin/uBlock/issues/869
            if ( !request.collapse ) {
                continue;
            }

            target = entry.target;

            // https://github.com/uBlockAdmin/uBlock/issues/399
            // Never remove elements from the DOM, just hide them
            target.style.setProperty('display', 'none', 'important');

            // https://github.com/uBlockAdmin/uBlock/issues/1048
            // Use attribute to construct CSS rule
            if ( value = target.getAttribute(entry.attr) ) {
                selectors.push(entry.tagName + '[' + entry.attr + '="' + value + '"]');
            }
        }
        if ( selectors.length !== 0 ) {
            messager.send({
                what: 'cosmeticFiltersInjected',
                type: 'net',
                hostname: window.location.hostname,
                selectors: selectors
            });
            var selectorStr = selectors.join(',\n'),
                style = document.createElement('style');
            // The linefeed before the style block is very important: do no remove!
            style.appendChild(document.createTextNode(selectorStr + '\n{display:none !important;}'));
            var parent = document.body || document.documentElement;
            if ( parent ) {
                parent.appendChild(style);
                vAPI.styles.push(style);
            }
        }
        // Renew map: I believe that even if all properties are deleted, an
        // object will still use more memory than a brand new one.
        if ( pendingRequestCount === 0 ) {
            pendingRequests = {};
        }
    };

    var send = function() {
        timer = null;
        messager.send({
            what: 'filterRequests',
            pageURL: window.location.href,
            pageHostname: window.location.hostname,
            requests: newRequests
        }, onProcessed);
        newRequests = [];
    };

    var process = function(delay) {
        if ( newRequests.length === 0 ) {
            return;
        }
        if ( delay === 0 ) {
            clearTimeout(timer);
            send();
        } else if ( timer === null ) {
            timer = setTimeout(send, delay || 20);
        }
    };

    // If needed eventually, we could listen to `src` attribute changes
    // for iframes.

    var add = function(target) {
        var tagName = target.localName;
        var prop = srcProps[tagName];
        if ( prop === undefined ) {
            return;
        }
        // https://github.com/uBlockAdmin/uBlock/issues/174
        // Do not remove fragment from src URL
        var src = target[prop];
        if ( typeof src !== 'string' || src === '' ) {
            return;
        }
        if ( src.lastIndexOf('http', 0) !== 0 ) {
            return;
        }
        var req = new PendingRequest(target, tagName, prop);
        newRequests.push(new BouncingRequest(req.id, tagName, src));
    };

    var iframeSourceModified = function(mutations) {
        var i = mutations.length;
        while ( i-- ) {
            addIFrame(mutations[i].target, true);
        }
        process();
    };
    var iframeSourceObserver = new MutationObserver(iframeSourceModified);
    var iframeSourceObserverOptions = {
        attributes: true,
        attributeFilter: [ 'src' ]
    };

    var addIFrame = function(iframe, dontObserve) {
        // https://github.com/gorhill/uBlock/issues/162
        // Be prepared to deal with possible change of src attribute.
        if ( dontObserve !== true ) {
            iframeSourceObserver.observe(iframe, iframeSourceObserverOptions);
        }

        var src = iframe.src;
        if ( src === '' || typeof src !== 'string' ) {
            return;
        }
        if ( src.lastIndexOf('http', 0) !== 0 ) {
            return;
        }
        var req = new PendingRequest(iframe, 'iframe', 'src');
        newRequests.push(new BouncingRequest(req.id, 'iframe', src));
    };

    var iframesFromNode = function(node) {
        if ( node.localName === 'iframe' ) {
            addIFrame(node);
        }
        var iframes = node.querySelectorAll('iframe');
        var i = iframes.length;
        while ( i-- ) {
            addIFrame(iframes[i]);
        }
        process();
    };

    return {
        add: add,
        addIFrame: addIFrame,
        iframesFromNode: iframesFromNode,
        process: process
    };
})();

/******************************************************************************/
/******************************************************************************/

// Cosmetic filters

(function() {
    if ( vAPI.skipCosmeticFiltering ) {
        // console.debug('Abort cosmetic filtering');
        return;
    }

    //var timer = window.performance || Date;
    //var tStart = timer.now();

    var queriedSelectors = {};
    var injectedSelectors = {};
    var lowGenericSelectors = [];
    var highGenerics = null;
    var contextNodes = [document];
    var nullArray = { push: function(){} };

    var retrieveGenericSelectors = function() {
        if ( lowGenericSelectors.length !== 0 || highGenerics === null ) {
            //console.log('µBlock> ABP cosmetic filters: retrieving CSS rules using %d selectors', lowGenericSelectors.length);
            messager.send({
                    what: 'retrieveGenericCosmeticSelectors',
                    pageURL: window.location.href,
                    selectors: lowGenericSelectors,
                    firstSurvey: highGenerics === null
                },
                retrieveHandler
            );
            // https://github.com/uBlockAdmin/uBlock/issues/452
            retrieveHandler = nextRetrieveHandler;
        } else {
            nextRetrieveHandler(null);
        }
        lowGenericSelectors = [];
    };

    // https://github.com/uBlockAdmin/uBlock/issues/452
    // This needs to be executed *after* the response from our query is
    // received, not at `DOMContentLoaded` time, or else there is a good
    // likeliness to outrun contentscript-start.js, which may still be waiting
    // on a response from its own query.
    var firstRetrieveHandler = function(response) {
        // https://github.com/uBlockAdmin/uBlock/issues/158
        // Ensure injected styles are enforced
        // rhill 2014-11-16: not sure this is needed anymore. Test case in
        //  above issue was fine without the line below..
        var selectors = vAPI.hideCosmeticFilters;
        if ( typeof selectors === 'object' ) {
            injectedSelectors = selectors;
            hideElements(Object.keys(selectors));
        }
        // Add exception filters into injected filters collection, in order
        // to force them to be seen as "already injected".
        selectors = vAPI.donthideCosmeticFilters;
        if ( typeof selectors === 'object' ) {
            for ( var selector in selectors ) {
                if ( selectors.hasOwnProperty(selector) ) {
                    injectedSelectors[selector] = true;
                }
            }
        }
        // Flush dead code from memory
        firstRetrieveHandler = null;

        // These are sent only once
        var result = response && response.result;
        if ( result ) {
            if ( result.highGenerics ) {
                highGenerics = result.highGenerics;
            }
            if ( result.donthide ) {
                processLowGenerics(result.donthide, nullArray);
            }
        }

        nextRetrieveHandler(response);
    };

    var nextRetrieveHandler = function(response) {
        // https://github.com/gorhill/uMatrix/issues/144
        if ( response && response.shutdown ) {
            shutdownJobs.exec();
            return;
        }

        //var tStart = timer.now();
        //console.debug('µBlock> contextNodes = %o', contextNodes);
        var result = response && response.result;
        var hideSelectors = [];
        if ( result && result.hide.length ) {
            processLowGenerics(result.hide, hideSelectors);
        }
        if ( highGenerics ) {
            if ( highGenerics.hideLowCount ) {
                processHighLowGenerics(highGenerics.hideLow, hideSelectors);
            }
            if ( highGenerics.hideMediumCount ) {
                processHighMediumGenerics(highGenerics.hideMedium, hideSelectors);
            }
            if ( highGenerics.hideHighCount ) {
                processHighHighGenericsAsync();
            }
        }
        if ( hideSelectors.length !== 0 ) {
            addStyleTag(hideSelectors);
        }
        contextNodes.length = 0;
        //console.debug('%f: uBlock: CSS injection time', timer.now() - tStart);
    };

    var retrieveHandler = firstRetrieveHandler;

    // Ensure elements matching a set of selectors are visually removed
    // from the page, by:
    // - Modifying the style property on the elements themselves
    // - Injecting a style tag

    var addStyleTag = function(selectors) {
        var selectorStr = selectors.join(',\n');
        hideElements(selectorStr);
        var style = document.createElement('style');
        // The linefeed before the style block is very important: do no remove!
        style.appendChild(document.createTextNode(selectorStr + '\n{display:none !important;}'));
        var parent = document.body || document.documentElement;
        if ( parent ) {
            parent.appendChild(style);
            vAPI.styles.push(style);
        }
        messager.send({
            what: 'cosmeticFiltersInjected',
            type: 'cosmetic',
            hostname: window.location.hostname,
            selectors: selectors
        });
        //console.debug('µBlock> generic cosmetic filters: injecting %d CSS rules:', selectors.length, text);
    };

    var hideElements = function(selectors) {
        // https://github.com/uBlockAdmin/uBlock/issues/207
        // Do not call querySelectorAll() using invalid CSS selectors
        if ( selectors.length === 0 ) {
            return;
        }
        if ( document.body === null ) {
            return;
        }
        // https://github.com/uBlockAdmin/uBlock/issues/158
        // Using CSSStyleDeclaration.setProperty is more reliable
        var elems = document.querySelectorAll(selectors);
        var i = elems.length;
        while ( i-- ) {
            elems[i].style.setProperty('display', 'none', 'important');
        }
    };

    // Extract and return the staged nodes which (may) match the selectors.

    var selectNodes = function(selector) {
        var targetNodes = [];
        var i = contextNodes.length;
        var node, nodeList, j;
        var doc = document;
        while ( i-- ) {
            node = contextNodes[i];
            if ( node === doc ) {
                return doc.querySelectorAll(selector);
            }
            targetNodes.push(node);
            nodeList = node.querySelectorAll(selector);
            j = nodeList.length;
            while ( j-- ) {
                targetNodes.push(nodeList[j]);
            }
        }
        return targetNodes;
    };

    // Low generics:
    // - [id]
    // - [class]

    var processLowGenerics = function(generics, out) {
        var i = generics.length;
        var selector;
        while ( i-- ) {
            selector = generics[i];
            if ( injectedSelectors.hasOwnProperty(selector) ) {
                continue;
            }
            injectedSelectors[selector] = true;
            out.push(selector);
        }
    };

    // High-low generics:
    // - [alt="..."]
    // - [title="..."]

    var processHighLowGenerics = function(generics, out) {
        var attrs = ['title', 'alt'];
        var attr, attrValue, nodeList, iNode, node;
        var selector;
        while ( attr = attrs.pop() ) {
            nodeList = selectNodes('[' + attr + ']');
            iNode = nodeList.length;
            while ( iNode-- ) {
                node = nodeList[iNode];
                attrValue = node.getAttribute(attr);
                if ( !attrValue ) { continue; }
                // Candidate 1 = generic form
                // If generic form is injected, no need to process the specific
                // form, as the generic will affect all related specific forms
                selector = '[' + attr + '="' + attrValue + '"]';
                if ( generics.hasOwnProperty(selector) ) {
                    if ( injectedSelectors.hasOwnProperty(selector) === false ) {
                        injectedSelectors[selector] = true;
                        out.push(selector);
                        continue;
                    }
                }
                // Candidate 2 = specific form
                selector = node.localName + selector;
                if ( generics.hasOwnProperty(selector) ) {
                    if ( injectedSelectors.hasOwnProperty(selector) === false ) {
                        injectedSelectors[selector] = true;
                        out.push(selector);
                    }
                }
            }
        }
    };

    // High-medium generics:
    // - [href^="http"]

    var processHighMediumGenerics = function(generics, out) {
        var nodeList = selectNodes('a[href^="http"]');
        var iNode = nodeList.length;
        var node, href, pos, hash, selectors, selector, iSelector;
        while ( iNode-- ) {
            node = nodeList[iNode];
            href = node.getAttribute('href');
            if ( !href ) { continue; }
            pos = href.indexOf('://');
            if ( pos === -1 ) { continue; }
            hash = href.slice(pos + 3, pos + 11);
            selectors = generics[hash];
            if ( selectors === undefined ) { continue; }
            iSelector = selectors.length;
            while ( iSelector-- ) {
                selector = selectors[iSelector];
                if ( injectedSelectors.hasOwnProperty(selector) === false ) {
                    injectedSelectors[selector] = true;
                    out.push(selector);
                }
            }
        }
    };

    // High-high generics are *very costly* to process, so we will coalesce
    // requests to process high-high generics into as few requests as possible.
    // The gain is *significant* on bloated pages.

    var processHighHighGenericsMisses = 8;
    var processHighHighGenericsTimer = null;

    var processHighHighGenerics = function() {
        processHighHighGenericsTimer = null;
        if ( highGenerics.hideHigh === '' ) {
            return;
        }
        if ( injectedSelectors.hasOwnProperty('{{highHighGenerics}}') ) {
            return;
        }
        //var tStart = timer.now();
        if ( document.querySelector(highGenerics.hideHigh) === null ) {
            //console.debug('%f: high-high generic test time', timer.now() - tStart);
            processHighHighGenericsMisses -= 1;
            // Too many misses for these nagging highly generic CSS rules,
            // so we will just skip them from now on.
            if ( processHighHighGenericsMisses === 0 ) {
                injectedSelectors['{{highHighGenerics}}'] = true;
                //console.debug('high-high generic: apparently not needed...');
            }
            return;
        }
        injectedSelectors['{{highHighGenerics}}'] = true;
        // We need to filter out possible exception cosmetic filters from
        // high-high generics selectors.
        var selectors = highGenerics.hideHigh.split(',\n');
        var i = selectors.length;
        var selector;
        while ( i-- ) {
            selector = selectors[i];
            if ( injectedSelectors.hasOwnProperty(selector) ) {
                selectors.splice(i, 1);
            } else {
                injectedSelectors[selector] = true;
            }
        }
        if ( selectors.length !== 0 ) {
            addStyleTag(selectors);
        }
    };

    var processHighHighGenericsAsync = function() {
        if ( processHighHighGenericsTimer !== null ) {
            clearTimeout(processHighHighGenericsTimer);
        }
        processHighHighGenericsTimer = setTimeout(processHighHighGenerics, 300);
    };

    // Extract all ids: these will be passed to the cosmetic filtering
    // engine, and in return we will obtain only the relevant CSS selectors.

    var idsFromNodeList = function(nodes) {
        if ( !nodes || !nodes.length ) {
            return;
        }
        var qq = queriedSelectors;
        var ll = lowGenericSelectors;
        var node, v;
        var i = nodes.length;
        while ( i-- ) {
            node = nodes[i];
            if ( node.nodeType !== 1 ) { continue; }
            // id
            v = nodes[i].id;
            if ( typeof v !== 'string' ) { continue; }
            v = v.trim();
            if ( v === '' ) { continue; }
            v = '#' + v;
            if ( qq.hasOwnProperty(v) ) { continue; }
            ll.push(v);
            qq[v] = true;
        }
    };

    // Extract all classes: these will be passed to the cosmetic filtering
    // engine, and in return we will obtain only the relevant CSS selectors.

    var classesFromNodeList = function(nodes) {
        if ( !nodes || !nodes.length ) {
            return;
        }
        var qq = queriedSelectors;
        var ll = lowGenericSelectors;
        var node, v, vv, j;
        var i = nodes.length;
        while ( i-- ) {
            node = nodes[i];
            vv = node.classList;
            if ( typeof vv !== 'object' ) { continue; }
            j = vv.length || 0;
            while ( j-- ) {
                v = vv[j];
                if ( typeof v !== 'string' ) { continue; }
                v = '.' + v;
                if ( qq.hasOwnProperty(v) ) { continue; }
                ll.push(v);
                qq[v] = true;
            }
        }
    };

    // Start cosmetic filtering.

    idsFromNodeList(document.querySelectorAll('[id]'));
    classesFromNodeList(document.querySelectorAll('[class]'));
    retrieveGenericSelectors();
    if(typeof vAPI.hideProcedureFilters !== 'undefined') {
        vAPI.proceduralCosmeticFiltering.applyPatterns(vAPI.hideProcedureFilters);
    } else {
        var localMessager = vAPI.messaging.channel('contentscript-start.js');
        var proceduresHandler = function(details) {
            if(details) {
                vAPI.hideProcedureFilters = details;
                vAPI.proceduralCosmeticFiltering.applyPatterns(vAPI.hideProcedureFilters);
            }
            localMessager.close();
        }
        localMessager.send(
            {
                what: 'retrieveDomainCosmeticSelectors',
                pageURL: window.location.href,
                locationURL: window.location.href,
                procedureSelectorsOnly: true
            },
            proceduresHandler
        );
        
    }


    //console.debug('%f: uBlock: survey time', timer.now() - tStart);

    // Below this point is the code which takes care to observe changes in
    // the page and to add if needed relevant CSS rules as a result of the
    // changes.

    // Observe changes in the DOM only if...
    // - there is a document.body
    // - there is at least one `script` tag
    if ( !document.body || !document.querySelector('script') ) {
        return;
    }

    // https://github.com/uBlockAdmin/uBlock/issues/618
    // Following is to observe dynamically added iframes:
    // - On Firefox, the iframes fails to fire a `load` event

    var ignoreTags = {
        'link': true,
        'script': true,
        'style': true
    };

    // Added node lists will be cumulated here before being processed
    var addedNodeLists = [];
    var addedNodeListsTimer = null;
    var collapser = uBlockCollapser;

    var treeMutationObservedHandler = function(mutations) {
        var nodeList, iNode, node;
        while ( nodeList = addedNodeLists.pop() ) {
            iNode = nodeList.length;
            while ( iNode-- ) {
                node = nodeList[iNode];
                if ( node.nodeType !== 1 ) {
                    continue;
                }
                if ( ignoreTags.hasOwnProperty(node.localName) ) {
                    continue;
                }
                contextNodes.push(node);
                collapser.iframesFromNode(node);
            }
        }
        addedNodeListsTimer = null;
        if ( contextNodes.length !== 0 ) {
            idsFromNodeList(selectNodes('[id]'));
            classesFromNodeList(selectNodes('[class]'));
            retrieveGenericSelectors();
            messager.send({ what: 'cosmeticFiltersActivated' });
        }
        if(mutations.length != 0)
            vAPI.proceduralCosmeticFiltering.processPattern(null, mutations);
    };

    // https://github.com/uBlockAdmin/uBlock/issues/205
    // Do not handle added node directly from within mutation observer.
    var treeMutationObservedHandlerAsync = function(mutations) {
        var iMutation = mutations.length;
        var nodeList;
        while ( iMutation-- ) {
            nodeList = mutations[iMutation].addedNodes;
            if ( nodeList.length !== 0 ) {
                addedNodeLists.push(nodeList);
            }
        }
        if ( addedNodeListsTimer === null ) {
            // I arbitrarily chose 100 ms for now:
            // I have to compromise between the overhead of processing too few
            // nodes too often and the delay of many nodes less often.
            addedNodeListsTimer = setTimeout(treeMutationObservedHandler, 100, mutations);
        }
    };

    // https://github.com/uBlockAdmin/httpswitchboard/issues/176
    var treeObserver = new MutationObserver(treeMutationObservedHandlerAsync);
    treeObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: vAPI.proceduralCosmeticFiltering.shouldObserveAttributes(),
        characterData: vAPI.proceduralCosmeticFiltering.shouldObserveCharacterData()
    });

    // https://github.com/gorhill/uMatrix/issues/144
    shutdownJobs.add(function() {
        treeObserver.disconnect();
        if ( addedNodeListsTimer !== null ) {
            clearTimeout(addedNodeListsTimer);
        }
    });
})();

/******************************************************************************/
/******************************************************************************/

// Permanent

// Listener to collapse blocked resources.
// - Future requests not blocked yet
// - Elements dynamically added to the page
// - Elements which resource URL changes

(function() {
    var onResourceFailed = function(ev) {
        //console.debug('onResourceFailed(%o)', ev);
        uBlockCollapser.add(ev.target);
        uBlockCollapser.process();
    };
    document.addEventListener('error', onResourceFailed, true);

    // https://github.com/gorhill/uMatrix/issues/144
    shutdownJobs.add(function() {
        document.removeEventListener('error', onResourceFailed, true);
    });
})();

/******************************************************************************/
/******************************************************************************/

// https://github.com/uBlockAdmin/uBlock/issues/7

// Executed only once

(function() {
    var collapser = uBlockCollapser;
    var elems, i, elem;

    elems = document.querySelectorAll('img, embed, object');
    i = elems.length;
    while ( i-- ) {
        collapser.add(elems[i]);
    }

    elems = document.querySelectorAll('iframe');
    i = elems.length;
    while ( i-- ) {
        collapser.addIFrame(elems[i]);
    }
    collapser.process(0);
})();

/******************************************************************************/
/******************************************************************************/

// To send mouse coordinates to context menu handler, as the chrome API fails
// to provide the mouse position to context menu listeners.
// This could be inserted in its own content script, but it's so simple that
// I feel it's not worth the overhead.

// Ref.: https://developer.mozilla.org/en-US/docs/Web/Events/contextmenu

(function() {
    if ( window !== window.top ) {
        return;
    }
    var onContextMenu = function(ev) {
        messager.send({
            what: 'contextMenuEvent',
            clientX: ev.clientX,
            clientY: ev.clientY
        });
    };

    window.addEventListener('contextmenu', onContextMenu, true);

    // https://github.com/gorhill/uMatrix/issues/144
    shutdownJobs.add(function() {
        document.removeEventListener('contextmenu', onContextMenu, true);
    });
})();

/******************************************************************************/
/******************************************************************************/

})();

/******************************************************************************/
