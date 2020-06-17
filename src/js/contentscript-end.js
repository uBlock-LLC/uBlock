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

if ( !window.vAPI ) {
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
const MIN_INTERVAL = 500;
vAPI.contentscriptEndInjected = true;
vAPI.styles = vAPI.styles || [];
const queueProcessing = function () {
    this.taskArguments = [];
    this.onComplete = this.complete.bind(this);
    this.endProcessTime = -MIN_INTERVAL;
    //this.startProcessTime = this.now; 
    this.settimeoutid = null;
  }
  queueProcessing.prototype = {
    get now() {
      return performance.now();
    },
    add: function(...args) {
      this.taskArguments.push(
        {"stylesheet":args[0], "mutation":args[1]}
      );
      this.exec();
    },
    complete: function() {
      this.endProcessTime = this.now;
      this.settimeoutid = null;
      this.exec();
    },
    exec: function() {
        if(this.taskArguments.length > 0 && !this.settimeoutid) {
          if (this.now - this.endProcessTime < MIN_INTERVAL) {
            let timeoutperiod = MIN_INTERVAL - (performance.now() - this.endProcessTime);
            this.settimeoutid = setTimeout(() =>
              { 
                let nextProcessingArgs = this.taskArguments.shift();
                //this.startProcessTime = this.now;
                vAPI.proceduralCosmeticFiltering.processPattern(nextProcessingArgs.stylesheet, nextProcessingArgs.mutation, this.onComplete);
              },
              timeoutperiod);
            }
            else {
              let nextProcessingArgs = this.taskArguments.shift();
              //this.startProcessTime = this.now;
              vAPI.proceduralCosmeticFiltering.processPattern(nextProcessingArgs.stylesheet, nextProcessingArgs.mutation, this.onComplete);
            } 
        }
        else {
          return;
        }
    }
  }
let objQueueProcessing = new queueProcessing();

// Ensure elements matching a set of selectors are visually removed
    // from the page, by:
    // - Modifying the style property on the elements themselves
    // - Injecting a style tag

var hideElements = function(selectors, procedure = false) {
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
        if(procedure === false) 
            vAPI.hiddenNodesMutation.addNodeToObserver(elems[i]);
        elems[i].style.setProperty('display', 'none', 'important');
    }
};

vAPI.proceduralCosmeticFiltering = (function() {
    const abpSelectorRegexp = /:-abp-([\w-]+)\(/i;
    let scopeSupported = true;
    const incompletePrefixRegexp = /[\s>+~]$/;
    const reSiblingOperator = /^\s*[+~]/;
    let reRegexRule = /^\/(.*)\/$/;
    /* Scriptlet below borrowed from: https://github.com/adblockplus/adblockpluscore/blob/3e16d3602509b2dbb2238ab1ebcbc5e5b5993862/lib/content/elemHideEmulation.js#L175 */
    function scopedQuerySelector(subtree, selector, all) {
      
        if (selector[0] == ">") {
            selector = ":scope" + selector;
            if (scopeSupported) {
                try {
                    return all ? subtree.querySelectorAll(selector) :
                                subtree.querySelector(selector);
                } catch(e) {
                    return null;
                }
            }
            if (scopeSupported == null)
                return tryQuerySelector(subtree, selector, all);
            return null;
        }
        try {
            return all ? subtree.querySelectorAll(selector) :
                        subtree.querySelector(selector);
        } catch(e) {
            return null;
        }
    }
    /* Scriptlet below borrowed from: https://github.com/adblockplus/adblockpluscore/blob/3e16d3602509b2dbb2238ab1ebcbc5e5b5993862/lib/common.js#L40 */
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
    /* Scriptlet below borrowed from: https://github.com/adblockplus/adblockpluscore/blob/3e16d3602509b2dbb2238ab1ebcbc5e5b5993862/lib/content/elemHideEmulation.js#L193 */
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
    /* Scriptlet below borrowed from: https://github.com/adblockplus/adblockpluscore/blob/3e16d3602509b2dbb2238ab1ebcbc5e5b5993862/lib/content/elemHideEmulation.js#L63 */
    function makeSelector(node, selector = "", hassibling = false) {
        if (node == null)
            return null;
        if (!node.parentElement) {
            if(hassibling) {
                return selector;  
            }
            let newSelector = ":root";
            if (selector)
                newSelector += " > " + selector;
            return newSelector;
        }
        let idx = positionInParent(node);
        if (idx > 0) {
            let newSelector = `${node.tagName}:nth-child(${idx})`;
            if(hassibling) {
                return newSelector;  
            }
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
    /* Scriptlet below borrowed from: https://github.com/adblockplus/adblockpluscore/blob/3e16d3602509b2dbb2238ab1ebcbc5e5b5993862/lib/content/elemHideEmulation.js#L206 */
    function makeRegExpParameter(text) {
      let [, pattern, flags] = /^\/(.*)\/([imu]*)$/.exec(text) || [null, text.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")];
      try {
        return new RegExp(pattern, flags);
      } catch (e) {
      }
      return null;
    }
    const styleObserver = (function () { 
        let styleFilterMap = new Map();
        let registeredFilters = [];
        let registeredFiltersMap = Object.create(null);
         
        const registerStyleFilter = function (filter) {
            if (registeredFilters[filter]) { return; }
            let regexpString;
            if (filter.length >= 2 && filter[0] == "/" && filter[filter.length - 1] == "/") {
                regexpString = filter.slice(1, -1).replace("\\7B ", "{").replace("\\7D ", "}").replace(/;$/,"");
            }
            else
                regexpString = filterToRegExp(filter);
            registeredFilters.push({filter: filter, regex: new RegExp(regexpString, "i")});
        };
        const getSelector = function(filter) {
          var styleSheets = document.styleSheets;
          var selectors = [];
          for(let styleSheet of styleSheets){
            if (styleSheet.disabled) {
              continue;
            } 
            var styleFilter = styleFilterMap.get(styleSheet);
            if (typeof styleFilter === 'undefined') {
                continue;
            }
            if(styleFilter.hasOwnProperty(filter)) {
                if(Array.isArray(styleFilter[filter])) {
                    selectors.push(...styleFilter[filter]);
                } else {
                    selectors.push(styleFilter[filter]);
                }
            }
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
        const readStyleSheet = function (styleSheet) {
            if (!isSameOrigin(styleSheet)) {
                return;
            }
            var rules = styleSheet.cssRules;
            const getMatchedFilters = function(rule, matchFilter){
              var stringifiedStyle = stringifyStyle(rule);
              for(let {filter,regex} of registeredFilters){
                if (!regex.test(stringifiedStyle)) {
                  continue;
                }
                if (typeof matchFilter[filter] === 'undefined') {
                  matchFilter[filter] = [rule.selectorText];
                } else {
                  matchFilter[filter].push(rule.selectorText);
                }
              }
           }
           let matchFilter = {};
            for(let rule of rules) {
              if (rule.type !== CSSRule.STYLE_RULE) {
                continue;
              }
              getMatchedFilters(rule, matchFilter);
            }
            styleFilterMap.set(styleSheet, matchFilter);
        };
        /*Scriptlet below borrowed from: https://github.com/adblockplus/adblockpluscore/blob/3e16d3602509b2dbb2238ab1ebcbc5e5b5993862/lib/content/elemHideEmulation.js#L132 */
        const stringifyStyle = function(rule) {
          let styles = [];
          for (let i = 0; i < rule.style.length; i++)
          {
            let property = rule.style.item(i);
            let value = rule.style.getPropertyValue(property);
            let priority = rule.style.getPropertyPriority(property);
            styles.push(`${property}: ${value}${priority ? " !" + priority : ""}`);
          }
          styles.sort();
          return styles.join(" ");
        };
        return {
            registerStyleFilter: registerStyleFilter,
            getSelector: getSelector,
            readStyleSheet: readStyleSheet
        };
    })();
    const getSiblingNodes = function(node, combineSelector) {
        let parent = node.parentElement;
        let idx = positionInParent(node);
        let nodes = parent.querySelectorAll(
            `:scope > :nth-child(${idx})${combineSelector}`
        );
        return nodes;
    }
    const getPrefixNodes = function(rootnode, selectors, prefix) {
        let nodes, bracket = false;
        if(rootnode != "" && reSiblingOperator.test(prefix)) {
            nodes = getSiblingNodes(rootnode, prefix);
            bracket = true;
        }
        else if(selectors.size > 0 && reSiblingOperator.test(prefix)) {
            let nd = new Set();
            let arr = Array.from(selectors).pop()[1];
            for(let i = 0; i <  arr.length; i++) {
                let ns = prime(rootnode, arr[i] + prefix);
                for ( let node of ns ) {
                    if(!nd.has(node))
                        nd.add(node);
                }
            }
            if(nd.size > 0)
                nodes = Array.from(nd);
            else
                nodes = null;
        }  else {
            nodes = prime(rootnode, prefix);
        }
        return [nodes, bracket];
    }
    const removeQuotes = function (input) {
        if (typeof input !== "string" || input.indexOf("url(\"") < 0) {
            return input;
        }
        return input.replace(/url\(\"(.*?)\"\)/g, "url($1)");
    };
    var hasSelector = function(selector, prefix, hasParallelSiblingSelector = false, result = true) {
        this.prefix = prefix;
        this.prefixStartsWithSiblingOperator = reSiblingOperator.test(prefix);  
        this._innerSelectors = selector;
        this.hasParallelSiblingSelector = hasParallelSiblingSelector;
        this.dependsOnDOM = true;
        this.result = result;
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
            let [nodes, bracket] = getPrefixNodes(rootnode, selectors, this.prefix);
            let hassibling = this.prefixStartsWithSiblingOperator && bracket; 
            if(nodes == null) {
                selectors.set('selector',[]);
                return;
            }
            let matchSelector = [];
            let lastRoot = null;
            for ( let node of nodes ) {
                if (lastRoot && lastRoot.contains(node) && !this.hasParallelSiblingSelector) {
                    continue;
                }
                if (targets && !targets.some(target => node.contains(target) ||
                                               target.contains(node))) {
                    continue;
                }
                let iselectors = new Map();
                evaluate(this._innerSelectors, 0, node, iselectors, targets);
                let arr = Array.from(iselectors).pop()[1];
                if(arr.length > 0 && this.result == null) {
                    matchSelector.push(makeSelector(node, "", hassibling));
                    lastRoot = node;
                } else if(arr.length == 0 && this.result == false ) {
                    matchSelector.push(makeSelector(node, "", hassibling));
                    lastRoot = node;
                }
            }
            selectors.set('selector',matchSelector);    
            return;
        }
    }
    var notSelector = function(selector, prefix, hasParallelSiblingSelector = false) {
        hasSelector.call(this, selector, prefix, hasParallelSiblingSelector, false);
    };
    notSelector.prototype = Object.create(hasSelector.prototype);
    notSelector.prototype.constructor = notSelector;
    
    var containSelector = function(selectorText, prefix, hasParallelSiblingSelector  = false) {
        this.prefix = prefix;
        this.prefixStartsWithSiblingOperator = reSiblingOperator.test(this.prefix);
        this._regexp = makeRegExpParameter(selectorText);
        this.hasParallelSiblingSelector = hasParallelSiblingSelector;
        this.dependsOnCharacterData = true;
        this.dependsOnDOM = true;
    }
    containSelector.prototype = {
        getSelectors: function(rootnode, selectors, targets) {
            let matchSelector = [];
            let lastRoot = null;
            let [nodes, bracket] = getPrefixNodes(rootnode, selectors, this.prefix);
            let hassibling = this.prefixStartsWithSiblingOperator && bracket; 
            if(nodes == null) {
                selectors.set('selector',[]);
                return;
            }
            for ( let node of nodes ) {
                if (lastRoot && lastRoot.contains(node) && !this.hasParallelSiblingSelector) {
                    continue;
                }
                if (targets && !targets.some(target => node.contains(target) ||
                                               target.contains(node))) {
                    continue;
                }
                lastRoot = node;
                
                if (this._regexp && this._regexp.test(node.textContent)) {
                    matchSelector.push(makeSelector(node, "", hassibling));
                }
            }
            selectors.set('selector',matchSelector);
            return;
        }
    }
    var matchCSSSelector = function(selectorText, prefix,  hasParallelSiblingSelector  = false , pseudoClass) {
        this.prefix = prefix;
        this.prefixStartsWithSiblingOperator = reSiblingOperator.test(prefix);
        this.pseudoClass = pseudoClass;
        this.hasParallelSiblingSelector = hasParallelSiblingSelector;
        let matches = /([^:]+):(.*)/g.exec(selectorText);
        this.propertName = matches[1];
        this._regexp = makeRegExpParameter(matches[2].trim());
    }
    matchCSSSelector.prototype = {
        getSelectors: function(rootnode, selectors, targets) {
            let matchSelector = [];
            let [nodes, bracket] = getPrefixNodes(rootnode, selectors, this.prefix);
            if(nodes == null) {
                selectors.set('selector',[]);
                return;
            }
            let hassibling = this.prefixStartsWithSiblingOperator && bracket; 
            for ( let node of nodes ) {
                if (targets && !targets.some(target => node.contains(target) ||
                                               target.contains(node))) {
                    continue;
                }
                const style = window.getComputedStyle(node, this.pseudoClass);
                if ( style !== null && this._regexp && this._regexp.test(removeQuotes(style[this.propertName]))) {
                    matchSelector.push(makeSelector(node, "", hassibling));
                }
            }
            selectors.set('selector',matchSelector);
            return;
        }
    }
    var plainSelector = function(selectorText) {
        this.selector = selectorText;
        this.prefixStartsWithSiblingOperator = reSiblingOperator.test(selectorText);
        this.maybeContainsSiblingCombinators = /[~+]/.test(selectorText);
        this.maybeDependsOnAttributes = /[#.]|\[.+\]/.test(selectorText);
        this.dependsOnDOM = true;
    }
    plainSelector.prototype =  {
        getSelectors: function(input, selectors, targets) {
            let matchSelector = [];
            let [nodes, bracket] = getPrefixNodes(input, selectors, this.selector);
            if(nodes == null) {
                selectors.set('selector',[]);
                return;
            }
            let hassibling = this.prefixStartsWithSiblingOperator && bracket; 
            for ( let node of nodes ) {
                if (targets && !targets.some(target => node.contains(target) ||
                                               target.contains(node))) {
                    continue;
                }
                matchSelector.push(makeSelector(node, "", hassibling));
            }
            selectors.set('selector',matchSelector);
            return;
        }
    }
    var propsSelector = function(propertyExpression, prefix, hasParallelSiblingSelector = false) {
        this.prefix = prefix;
        this.prefixStartsWithSiblingOperator = reSiblingOperator.test(prefix);
        this.propertyExpression = propertyExpression;
        this.hasParallelSiblingSelector = hasParallelSiblingSelector;
        this.dependsOnStyles = true;
        this.dependsOnDOM = true;
        styleObserver.registerStyleFilter(propertyExpression);
    }
    propsSelector.prototype = {
        getSelectors: function(rootnode, selectors, targets) {
            let matchSelector = [];
            let [nodes, bracket] = getPrefixNodes(rootnode, selectors, this.prefix);
            if(nodes == null) {
                selectors.set('selector',[]);
                return;
            } 
            let styleSelectors = styleObserver.getSelector(this.propertyExpression);
            if (styleSelectors.length === 0) {
                selectors.set('selector',[]);
                return;
            }
            let lastRoot = null;    
            let hassibling = this.prefixStartsWithSiblingOperator && bracket; 
            for ( let node of nodes ) {
                if (lastRoot && lastRoot.contains(node) && !this.hasParallelSiblingSelector) {
                    continue;
                }
                if (targets && !targets.some(target => node.contains(target) ||
                    target.contains(node))) {
                    continue;
                }
                for (let i = 0, length = styleSelectors.length; i < length; i++) {
                    let stypleSelector = styleSelectors[i];
                    let pos = stypleSelector.lastIndexOf("::");
                    if (pos != -1)
                        stypleSelector = stypleSelector.substring(0, pos);
                    if (node.matches(stypleSelector)) {   
                        matchSelector.push(makeSelector(node, "", hassibling));
                        lastRoot = node;
                        break;
                    }
                }
            }
            selectors.set('selector',matchSelector);
            return;        
        }
    }
    var proceduralSelector = function() {
        this.operatorMap = new Map([['plain', plainSelector],['-abp-has', hasSelector],['has', hasSelector],['not', notSelector], ['-abp-contains', containSelector],['contains', containSelector], ['matches-css', matchCSSSelector], ['matches-css-after', matchCSSSelector], ['matches-css-before', matchCSSSelector], ['-abp-properties', propsSelector]]);
        this.patterns = [];
    }
    proceduralSelector.prototype = {
        buildFunction(s) { 
            let tasks = [];
            let selectorText = "";
            for (var property in s) {
                let cls = new (this.operatorMap.get(property))(s[property].st, s[property].pf, s[property].pss, s[property].ps);
                if(property == "plain") {
                    tasks.push(cls);
                    selectorText += s[property].st;
                    return [tasks, selectorText];
                }
                selectorText += s[property].pf + ':' + property + '(';
                let inner = s[property]._is
                if(inner) {
                    cls["_innerSelectors"] = [];
                    for(let i = 0; i < inner.length; i++) {
                        let [innerTasks, innerSelectorText] = this.buildFunction(inner[i]);
                        selectorText += innerSelectorText;
                        cls["_innerSelectors"].push(...innerTasks);
                    }
                } else {
                    selectorText += s[property].st;
                }
                selectorText += ")";
                tasks.push(cls);
            }
            return [tasks, selectorText];
        },
        decompile(s) { 
            let ss = JSON.parse(s);
            let tasks = [];
            let selectorText = "";
            for(let i = 0; i < ss.tasks.length; i++) {
                let [innerTasks, innerSelectorText] = this.buildFunction(ss.tasks[i]);
                tasks.push(...innerTasks);
                selectorText += innerSelectorText;
            }
            return [tasks, selectorText, ss.style];
        }, 
        applyPatterns: function(patterns) {
            this.patterns = [];
            for (let selector of patterns) {
                let [tasks, selectorText, style]  = this.decompile(selector);
                this.patterns.push([selectorText, tasks, style]);
            } 
            if(this.patterns.length > 0) {
                this.processPattern();
                document.addEventListener("load", onLoad.bind(this), true);
            }
        },
        processPattern: function(stylesheets, mutations, callback) {
            let patterns = this.patterns.filter(([selector, tasks]) => this.filterPatterns(tasks, mutations, stylesheets));
            
            if (!stylesheets && !mutations)
                stylesheets = document.styleSheets;
            
            if (mutations && this.patterns.some(([selector, tasks]) => tasks.some(task => task.dependsOnStyles && task.dependsOnDOM)))
                stylesheets = document.styleSheets;
  
            for (let stylesheet of stylesheets || []) {   
                styleObserver.readStyleSheet(stylesheet);
            }
  
            var matchSelector = [];
            var matchStyleSelector = [];
            var matchProcSelector = [];
            let mutationTargets = this.extractMutationTargets(mutations);
            var mutations = mutations;
  
            for (let [selector, tasks, style] of patterns) {
                let patternHasSiblingCombinator = tasks.some(task => task.maybeContainsSiblingCombinators);
                let selectors = new Map();
                if(tasks != null) {
                    evaluate(tasks, 0, "", selectors, (patternHasSiblingCombinator) ? null : mutationTargets);
                }
                if(selectors.size > 0) {
                    let arr = Array.from(selectors).pop()[1];
                    for(let i = 0; i <  arr.length; i++) {
                        let rselector = arr[i];
                        if(style != "") {
                            selector = `${selector} {${style}}`;
                            matchStyleSelector.push(`${rselector} {${style}}`);
                        } else {
                            matchSelector.push(rselector);
                        }
                        if(!matchProcSelector.includes(selector))
                            matchProcSelector.push(selector);
                    }
                }
            }
            if(matchProcSelector.length > 0)
                vAPI.injectedProcedureCosmeticFilters.push(...matchProcSelector);

            if(matchSelector.length > 0) {
                let text = matchSelector.join(',\n');
                if(vAPI.cssOriginSupport) {
                    messager.send({
                        what: 'injectCSS',
                        selectors: text + '\n{display:none!important;}'
                    });
                } else {
                    hideElements(text, true);
                }
            }
            if(matchStyleSelector.length > 0) {
                let text = matchStyleSelector.join(',\n');
                if(vAPI.cssOriginSupport) {
                    messager.send({
                        what: 'injectCSS',
                        selectors: text 
                    });
                } else {
                    vAPI.userStyleSheet.addCssRule(text);
                }
            }
            if(typeof callback === "function"){
                callback(); 
            }
        },
        /* Scriptlet below borrowed from: https://github.com/adblockplus/adblockpluscore/blob/3e16d3602509b2dbb2238ab1ebcbc5e5b5993862/lib/content/elemHideEmulation.js#L517 */
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
        /* Scriptlet below borrowed from: https://github.com/adblockplus/adblockpluscore/blob/3e16d3602509b2dbb2238ab1ebcbc5e5b5993862/lib/content/elemHideEmulation.js#L582 */
        filterPatterns: function(patterns, mutations, stylesheets) {
            if (!stylesheets && !mutations)
                return patterns;
  
            let mutationTypes = mutations ? extractMutationTypes(mutations) : null;
            
            return (stylesheets && patterns.some(pattern => pattern.dependsOnStyles)) ||
                        (mutations &&  patterns.some(pattern => pattern.dependsOnDOM) &&
                            this.matchesMutationTypes(patterns, mutationTypes)
            );
        },
        /* Scriptlet below borrowed from: https://github.com/adblockplus/adblockpluscore/blob/3e16d3602509b2dbb2238ab1ebcbc5e5b5993862/lib/content/elemHideEmulation.js#L557 */
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
    /* Scriptlet below borrowed from: https://github.com/adblockplus/adblockpluscore/blob/3e16d3602509b2dbb2238ab1ebcbc5e5b5993862/lib/content/elemHideEmulation.js#L540 */
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
          objQueueProcessing.add([stylesheet]);
    }
    return new proceduralSelector();
  })();




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
                vAPI.styles.push(selectorStr);
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
    var contextNodes = [];
    let removedNodes = false;
    var nullArray = { push: function(){} };

    function hideNode(node) {
        vAPI.hiddenNodesMutation.addNodeToObserver(node);
        node.style.setProperty('display', 'none', 'important');
    }

    var retrieveGenericSelectors = function() {
        if ( lowGenericSelectors.length !== 0 || highGenerics === null ) {
            //console.log('µBlock> ABP cosmetic filters: retrieving CSS rules using %d selectors', lowGenericSelectors.length);
            messager.send({
                    what: 'retrieveGenericCosmeticSelectors',
                    pageURL: window.location.href,
                    selectors: lowGenericSelectors,
                    firstSurvey: highGenerics === null,
                    exception: vAPI.donthideCosmeticFilters || []
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
        var result = response && response.result;
        var hideSelectors = [];
        if ( result && result.hide.length ) {
            hideSelectors.push(...result.hide);
            vAPI.userStyleSheet.addCssRule(result.hide.join(',\n') + '\n{display:none !important;}');
        }
        if(vAPI.hideCosmeticFilters) {
            hideSelectors.push(...vAPI.hideCosmeticFilters);
        }
        if ( hideSelectors.length > 0 ) {
            var selectorStr = hideSelectors.join(',\n');
            vAPI.styles.push(selectorStr);
            hideElements(selectorStr);
        }
        if(result.injectedSelectors.length !== 0) {
            vAPI.styles.push(result.injectedSelectors.join(',\n'));
        }
        contextNodes.length = 0;
        removedNodes = false;
        // Flush dead code from memory
        firstRetrieveHandler = null;
    };

    var nextRetrieveHandler = function(response) {
        // https://github.com/gorhill/uMatrix/issues/144
        if ( response && response.shutdown ) {
            shutdownJobs.exec();
            return;
        }
        var result = response && response.result;
        var hideSelectors = [];
        if ( result && result.hide.length ) {
            hideSelectors.push(...result.hide);
            vAPI.userStyleSheet.addCssRule(result.hide.join(',\n') + '\n{display:none !important;}');
            vAPI.styles.push(result.hide.join(',\n'));
        }
        if(result.injectedSelectors.length !== 0) {
            vAPI.styles.push(result.injectedSelectors.join(',\n'));
        }
        if(vAPI.hideCosmeticFilters) {
            hideSelectors.push(...vAPI.hideCosmeticFilters);
        }
        if ( hideSelectors.length > 0 ) {
            var selectorStr = hideSelectors.join(',\n');
            if(contextNodes.length != 0 && removedNodes == false) {
                for ( const node of contextNodes ) {
                    if ( node.matches(selectorStr) ) {
                        hideNode(node);
                    }
                    const nodes = node.querySelectorAll(selectorStr);
                    for ( const node of nodes ) {
                        hideNode(node);
                    }
                }
            } else {
                const nodes = document.querySelectorAll(selectorStr);
                for ( const node of nodes ) {
                    hideNode(node);
                }
            }
        }
        contextNodes.length = 0;
        removedNodes = false;
        //console.debug('%f: uBlock: CSS injection time', timer.now() - tStart);
    };

    var retrieveHandler = firstRetrieveHandler;

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
    const domObserver = (function() {
        // https://github.com/uBlockAdmin/uBlock/issues/618
        // Following is to observe dynamically added iframes:
        // - On Firefox, the iframes fails to fire a `load` event
        let ignoreTags = {
            'link': true,
            'script': true,
            'style': true
        };
    
        // Added node lists will be cumulated here before being processed
        let addedNodeLists = [];
        let removedNodeLists = [];
        let addedNodeListsTimer = null;
        let collapser = uBlockCollapser;
        let treeObserver;
    
        const treeMutationObservedHandler = function(mutations) {
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
            while ( nodeList = removedNodeLists.pop() ) {
                iNode = nodeList.length;
                while ( iNode-- ) {
                    node = nodeList[iNode];
                    if ( node.nodeType !== 1 ) {
                        removedNodes = true;
                        break;
                    }
                }
            }
           
            addedNodeListsTimer = null;
            if (!(contextNodes.length === 0 && removedNodes === false)) {
                idsFromNodeList(selectNodes('[id]'));
                classesFromNodeList(selectNodes('[class]'));
                retrieveGenericSelectors();
                messager.send({ what: 'cosmeticFiltersActivated' });
            }
            if(mutations.length != 0)
                objQueueProcessing.add(null, mutations);
        };
    
        // https://github.com/uBlockAdmin/uBlock/issues/205
        // Do not handle added node directly from within mutation observer.
        const treeMutationObservedHandlerAsync = function(mutations) {
            var iMutation = mutations.length;
            var nodeList;
            while ( iMutation-- ) {
                nodeList = mutations[iMutation].addedNodes;
                if ( nodeList.length !== 0 ) {
                    addedNodeLists.push(nodeList);
                }
                nodeList = mutations[iMutation].removedNodes;
                if ( nodeList.length !== 0 ) {
                    removedNodeLists.push(nodeList);
                }
            }
            if ( addedNodeListsTimer === null ) {
                // I arbitrarily chose 100 ms for now:
                // I have to compromise between the overhead of processing too few
                // nodes too often and the delay of many nodes less often.
                addedNodeListsTimer = setTimeout(treeMutationObservedHandler, 100, mutations);
            }
        };
        const changeMutationObserverOptions = function(options) {
            treeObserver.observe(document.body, options);
        };
        const isObserverSet = function() {
            return treeObserver !== undefined ? true : false;
        }
        const startMutationObsever = function() {
            if ( treeObserver !== undefined) { return; }
            treeObserver = new MutationObserver(treeMutationObservedHandlerAsync);
            treeObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: vAPI.shouldObserveAttributes,
                characterData: vAPI.shouldObserveCharacterData
            });
            // https://github.com/gorhill/uMatrix/issues/144
            shutdownJobs.add(function() {
                treeObserver.disconnect();
                if ( addedNodeListsTimer !== null ) {
                    clearTimeout(addedNodeListsTimer);
                }
            });
        }
        return {startMutationObsever, changeMutationObserverOptions, isObserverSet};
    })();

    // Start cosmetic filtering.

    idsFromNodeList(document.querySelectorAll('[id]'));
    classesFromNodeList(document.querySelectorAll('[class]'));
    retrieveGenericSelectors();
    if(typeof vAPI.hideProcedureFilters !== 'undefined') {
        if(vAPI.hideProcedureFilters.length > 0) 
            vAPI.proceduralCosmeticFiltering.applyPatterns(vAPI.hideProcedureFilters);
    } else {
        var localMessager = vAPI.messaging.channel('contentscript-start.js');
        var proceduresHandler = function(details) {
            vAPI.hideProcedureFilters = details.procedureHide;
            vAPI.shouldObserveAttributes = details.shouldObserveAttributes;
            vAPI.shouldObserveCharacterData = details.shouldObserveCharacterData;
            vAPI.proceduralCosmeticFiltering.applyPatterns(vAPI.hideProcedureFilters);
            if(domObserver.isObserverSet()) {
                domObserver.changeMutationObserverOptions({
                    childList: true,
                    subtree: true,
                    attributes: vAPI.shouldObserveAttributes,
                    characterData: vAPI.shouldObserveCharacterData
                });
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
    if ( !document.body || !document.querySelector('script') ) {
        return;
    }
    domObserver.startMutationObsever();

    //console.debug('%f: uBlock: survey time', timer.now() - tStart);

    // Below this point is the code which takes care to observe changes in
    // the page and to add if needed relevant CSS rules as a result of the
    // changes.

    // Observe changes in the DOM only if...
    // - there is a document.body
    // - there is at least one `script` tag
    
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
