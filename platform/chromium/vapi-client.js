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

    Home: https://github.com/uBlockAdmin/uBlock
*/

// For non background pages

/* global self */

/******************************************************************************/

(function(self) {

'use strict';

/******************************************************************************/

var vAPI = self.vAPI = self.vAPI || {};
var chrome = self.chrome;
let browserDetails = navigator.userAgent.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i);
vAPI.hideNodes = vAPI.hideNodes || new Set();
vAPI.cssOriginSupport = false;
if(browserDetails.length > 0) {
    if( (browserDetails[1] == "Firefox" && browserDetails[2] >= 53) || (browserDetails[1] == "Chrome" && browserDetails[2] >= 66)  ) {
        vAPI.cssOriginSupport = true;
    }
}
// https://github.com/uBlockAdmin/uBlock/issues/456
// Already injected?
if ( vAPI.vapiClientInjected ) {
    //console.debug('vapi-client.js already injected: skipping.');
    return;
}

vAPI.vapiClientInjected = true;
vAPI.sessionId = String.fromCharCode(Date.now() % 25 + 97) +
    Math.random().toString(36).slice(2);
vAPI.chrome = true;

const userStyleSheet = function() {
    this.style;
    this.cssRules = new Map();
}
userStyleSheet.prototype.addStyleElement = function() {
    this.style = document.createElement('style');
    const parent = document.head || document.documentElement;
    if ( parent === null ) { return; }
    parent.appendChild(this.style);
}
userStyleSheet.prototype.addCssRule = function(cssRule) {
    if(cssRule == '' || this.cssRules.has(cssRule)) return;
    if(this.style === undefined) { 
        this.addStyleElement();
    }
    const sheet = this.style.sheet;
    if ( !sheet ) { return; }
    const len = sheet.cssRules.length;
    sheet.insertRule(cssRule, len);
    this.cssRules.set(cssRule, sheet.cssRules[len]);
}
vAPI.userStyleSheet = new userStyleSheet();

if(vAPI.cssOriginSupport === true) {
    vAPI.hiddenNodesMutation = (function() {
        return {
            addNodeToObserver: function(node) {
                //console.log("do nothing");
            }
        };    
    })();    
} else {
    vAPI.hiddenNodesMutation = (function() {
        let nodeObserverTimer = undefined;
        let hiddenNodeObserverAsync = function() {
            for ( let node of vAPI.hideNodes ) {
                node.style.setProperty('display', 'none', 'important');
            }
            vAPI.hideNodes.clear();
            nodeObserverTimer = undefined;
        }
        let hiddenNodeObserver = new MutationObserver(function(mutations) {
            for ( const mutation of mutations ) {
                if(mutation.target.style.display != "none")
                    vAPI.hideNodes.add(mutation.target);
                else
                    vAPI.hideNodes.delete(mutation.target);
            }
            if (
                vAPI.hideNodes.size !== 0 &&
                nodeObserverTimer === undefined
            ) {
                nodeObserverTimer = setTimeout(hiddenNodeObserverAsync, 1);
            }
        });
        return {
            addNodeToObserver: function(node) {
                if ( node.hasAttribute("uBlockHide") === false ) {
                    node.setAttribute('uBlockHide', '');
                    vAPI.hideNodes.add(node);
                    hiddenNodeObserver.observe(
                        node,
                        { 
                            attributes: true,
                            attributeFilter: [ 'style' ] 
                        }
                    );
                }
            }
        };    
    })();
}
/******************************************************************************/

if (!chrome.runtime) {
    // Chrome 20-21
    chrome.runtime = chrome.extension;
}
else if(!chrome.runtime.onMessage) {
    // Chrome 22-25
    chrome.runtime.onMessage = chrome.extension.onMessage;
    chrome.runtime.sendMessage = chrome.extension.sendMessage;
    chrome.runtime.onConnect = chrome.extension.onConnect;
    chrome.runtime.connect = chrome.extension.connect;
}

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

vAPI.messaging = {
    port: null,
    channels: {},
    listeners: {},
    requestId: 1,

    setup: function() {
        this.port = chrome.runtime.connect({name: vAPI.sessionId});
        this.port.onMessage.addListener(messagingConnector);
    },

    close: function() {
        if ( this.port === null ) {
            return;
        }
        this.port.disconnect();
        this.port.onMessage.removeListener(messagingConnector);
        this.port = null;
        this.channels = {};
        this.listeners = {};
    },

    channel: function(channelName, callback) {
        if ( !channelName ) {
            return;
        }

        this.channels[channelName] = {
            channelName: channelName,
            listener: typeof callback === 'function' ? callback : null,
            send: function(message, callback) {
                if ( vAPI.messaging.port === null ) {
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

                vAPI.messaging.port.postMessage(message);
            },
            close: function() {
                delete vAPI.messaging.channels[this.channelName];
                if ( Object.keys(vAPI.messaging.channels).length === 0 ) {
                    vAPI.messaging.close();
                }
            }
        };

        return this.channels[channelName];
    }
};

/******************************************************************************/

})(this);

/******************************************************************************/
