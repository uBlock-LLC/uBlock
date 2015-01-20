/*******************************************************************************

    µBlock - a browser extension to block requests.
    Copyright (C) 2014 The µBlock authors

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

// For non background pages

/******************************************************************************/

(function() {

'use strict';

/******************************************************************************/

self.vAPI = self.vAPI || {};
vAPI.safari = true;

/******************************************************************************/

var messagingConnector = function(response) {
    if ( !response ) {
        return;
    }

    var channels = vAPI.messaging.channels;
    var channel, listener;

    if ( response.broadcast === true && !response.channelName ) {
        for ( channel in channels ) {
            if ( channels.hasOwnProperty(channel) === false ) {
                continue;
            }
            listener = channels[channel].listener;
            if ( typeof listener === 'function' ) {
                listener(response.msg);
            }
        }
        return;
    }

    if ( response.requestId ) {
        listener = vAPI.messaging.listeners[response.requestId];
        delete vAPI.messaging.listeners[response.requestId];
        delete response.requestId;
    }

    if ( !listener ) {
        channel = channels[response.channelName];
        listener = channel && channel.listener;
    }

    if ( typeof listener === 'function' ) {
        listener(response.msg);
    }
};

/******************************************************************************/

var uniqueId = function() {
    return Math.random().toString(36).slice(2);
};

/******************************************************************************/

// Relevant?
// https://developer.apple.com/library/safari/documentation/Tools/Conceptual/SafariExtensionGuide/MessagesandProxies/MessagesandProxies.html#//apple_ref/doc/uid/TP40009977-CH14-SW12
vAPI.messaging = {
    channels: {},
    listeners: {},
    requestId: 1,
    connectorId: uniqueId(),

    setup: function() {
        this.connector = function(msg) {
            // messages from the background script are sent to every frame,
            // so we need to check the connectorId to accept only
            // what is meant for the current context
            if ( msg.name === vAPI.messaging.connectorId
                || msg.name === 'broadcast' ) {
                messagingConnector(msg.message);
            }
        };
        safari.self.addEventListener('message', this.connector, false);

        this.channels['vAPI'] = {
            listener: function(msg) {
                if ( msg.cmd === 'injectScript' && msg.details.code ) {
                    Function(msg.details.code).call(self);
                }
            }
        };
    },

    close: function() {
        if ( this.connector ) {
            safari.self.removeEventListener('message', this.connector, false);
            this.connector = null;
            this.channels = {};
            this.listeners = {};
        }
    },

    channel: function(channelName, callback) {
        if ( !channelName ) {
            return;
        }

        this.channels[channelName] = {
            channelName: channelName,
            listener: typeof callback === 'function' ? callback : null,
            send: function(message, callback) {
                if ( !vAPI.messaging.connector ) {
                    vAPI.messaging.setup();
                }

                message = {
                    channelName: this.channelName,
                    msg: message
                };

                if ( callback ) {
                    message.requestId = vAPI.messaging.requestId++;
                    vAPI.messaging.listeners[message.requestId] = callback;
                }

                // popover content doesn't know messaging...
                if ( safari.extension.globalPage ) {
                    if ( !safari.self.visible ) {
                        return;
                    }

                    safari.extension.globalPage.contentWindow
                        .vAPI.messaging.onMessage({
                            name: vAPI.messaging.connectorId,
                            message: message,
                            target: {
                                page: {
                                    dispatchMessage: function(name, msg) {
                                        messagingConnector(msg);
                                    }
                                }
                            }
                        });
                } else {
                    safari.self.tab.dispatchMessage(
                        vAPI.messaging.connectorId,
                        message
                    );
                }
            },
            close: function() {
                delete vAPI.messaging.channels[this.channelName];
            }
        };

        return this.channels[channelName];
    }
};

/******************************************************************************/

vAPI.canExecuteContentScript = function() {
    return /^https?:/.test(location.protocol);
};

/******************************************************************************/

// This file can be included into extensin pages,
// but the following code should run only in content pages.

if ( location.protocol === 'safari-extension:' ) {
    return;
}

/******************************************************************************/

var frameId = window === window.top ? 0 : Date.now() % 1E5;
var parentFrameId = frameId ? 0 : -1;
var beforeLoadEvent = new Event('beforeload'); // Helper event to message background

// Inform that we've navigated
if(frameId === 0) {
    safari.self.tab.canLoad(beforeLoadEvent, { 
        url: location.href,
        type: 'main_frame',
        navigatedToNew: true
    });
}

var linkHelper = document.createElement('a');
var nodeTypes = {
    'frame': 'sub_frame',
    'iframe': 'sub_frame',
    'script': 'script',
    'img': 'image',
    'input': 'image',
    'object': 'object',
    'embed': 'object',
    'link': 'stylesheet'
};
var shouldBlockDetailedRequest = function(details) {
    linkHelper.href = details.url;
    details.url = linkHelper.href;
    details.frameId = frameId;
    details.parentFrameId = parentFrameId;
    details.timeStamp = Date.now();
    return !(safari.self.tab.canLoad(beforeLoadEvent, details));
}
var onBeforeLoad = function(e) {
    if(e.url.lastIndexOf('data:', 0) === 0) {
        return;
    }
    linkHelper.href = e.url;
    var url = linkHelper.href;
    var details = {
        url: url,
        type: nodeTypes[e.target.nodeName.toLowerCase()] || 'other',
        // tabId is determined in the background script
        frameId: frameId,
        parentFrameId: parentFrameId,
        timeStamp: Date.now()
    };
    var response = safari.self.tab.canLoad(e, details);
    if(!response) {
        e.preventDefault();
        return false;
    }
    // Local mirroring, response should be a data: URL here
    if(typeof response !== 'string') {
        return;
    }
    // Okay, we're mirroring...
    e.preventDefault();
    // Content Security Policy with disallowed inline scripts may break things
    details = document.createElement('script');
    details.textContent = atob(response.slice(response.indexOf(',', 20) + 1));

    if ( e.target.hasAttribute('defer') && document.readyState === 'loading' ) {
        var jsOnLoad = function(ev) {
            this.removeEventListener(ev.type, jsOnLoad, true);
            this.body.removeChild(this.body.appendChild(details));
        };

        document.addEventListener('DOMContentLoaded', jsOnLoad, true);
    } else {
        e.target.parentNode.insertBefore(details, e.target);
        details.parentNode.removeChild(details);
    }
};

document.addEventListener('beforeload', onBeforeLoad, true);

/******************************************************************************/
// block pop-ups, intercept xhr requests, and apply site patches
var firstMutation = function() {
    document.removeEventListener('DOMSubtreeModified', firstMutation, true);
    firstMutation = false;

    var randEventName = uniqueId();

    window.addEventListener(randEventName, function(e) {
        if(shouldBlockDetailedRequest(e.detail)) {
            e.detail.url = false;
        };
    }, true);

    // the extension context is unable to reach the page context,
    // also this only works when Content Security Policy allows inline scripts
    var tmpJS = document.createElement('script');
    var tmpScript = ['(function() {',
        'var block = function(u, t) {',
            'var e = new CustomEvent("' + randEventName +'",',
                '{detail: {url: u, type: t}, bubbles: false});',
            'dispatchEvent(e);',
            'return e.detail.url === false;',
        '}, wo = open, xo = XMLHttpRequest.prototype.open;',
        'open = function(u) {',
            'return block(u, "popup") ? null : wo.apply(this, arguments);',
        '};',
        'XMLHttpRequest.prototype.open = function(m, u, s) {',
            'return xo.apply(',
                'this,',
                'block(u, "xmlhttprequest") ? ["HEAD", u, s] : arguments',
            ');',
        '};'
    ];

    if ( frameId === 0 ) {
        tmpScript.push(
            'var pS = history.pushState, rS = history.replaceState,',
            'onpopstate = function(e) {',
                'if (!e || e.state !== null) block(location.href, "popstate");',
            '};',
            'window.addEventListener("popstate", onpopstate, true);',
            'history.pushState = function() {',
                'var r = pS.apply(this, arguments);',
                'onpopstate();',
                'return r;',
            '};',
            'history.replaceState = function() {',
                'var r = rS.apply(this, arguments);',
                'onpopstate();',
                'return r;',
            '};'
        );
    }

    var block = safari.self.tab.canLoad(beforeLoadEvent, {
        isURLWhiteListed: location.href
    });

    if ( vAPI.sitePatch && !block ) {
        tmpScript.push('(' + vAPI.sitePatch + ')();');
    }

    tmpScript.push('})();');
    tmpJS.textContent = tmpScript.join('');
    document.documentElement.removeChild(
        document.documentElement.appendChild(tmpJS)
    );
};

document.addEventListener('DOMSubtreeModified', firstMutation, true);

/******************************************************************************/

var onContextMenu = function(e) {
    var target = e.target;
    var tagName = target.tagName.toLowerCase();
    var details = {
        tagName: tagName,
        pageUrl: location.href,
        insideFrame: window !== window.top
    };

    details.editable = tagName === 'textarea' || tagName === 'input';

    if ( target.hasOwnProperty('checked') ) {
        details.checked = target.checked;
    }

    if ( tagName === 'a' ) {
        details.linkUrl = target.href;
    }

    if ( target.hasOwnProperty('src') ) {
        details.srcUrl = target.src;

        if ( tagName === 'img' ) {
            details.mediaType = 'image';
        } else if ( tagName === 'video' || tagName === 'audio' ) {
            details.mediaType = tagName;
        }
    }

    safari.self.tab.setContextMenuEventUserInfo(e, details);
};

self.addEventListener('contextmenu', onContextMenu, true);


/******************************************************************************/
})();

/******************************************************************************/
