/*
    The idea implemented from
    https://issues.adblockplus.org/ticket/6969
*/

(function() {
    let createProxy = function(object, property, descriptor) {
        let pos = property.indexOf(".");
        if(pos === -1) {
            let objDescriptor = Object.getOwnPropertyDescriptor(object, property);
            if (objDescriptor && !objDescriptor.configurable)
                return;

            Object.defineProperty(object, property, Object.assign({}, descriptor, {configurable: true}));
            return true;
        } else {
            let property1 = property.slice(0, pos);
            let propertyRemaining = property.slice(pos + 1);
            let value = object[property1];
            if (value && (value instanceof Object)) {
                createProxy(value, propertyRemaining, descriptor);
                return;
            }

            let objDescriptor = Object.getOwnPropertyDescriptor(object, property1);
            if (objDescriptor && !objDescriptor.configurable)
                    return;
                    
            Object.defineProperty(object, property1, {
                get() { return value; },
                set(newValue) { value = newValue; if ( newValue instanceof Object ) {
                    createProxy(newValue, propertyRemaining, descriptor);
                }},
                configurable: true
            });
        }
    }

    let randomNo = Math.floor(Math.random() * 2116316160 + 60466176).toString(36);
    let abort = function() {
        throw new ReferenceError(randomNo);
    }
    var onerror = window.onerror;
    window.onerror = function(message, source, lineno, colno, error) {
            if( typeof message === 'string' && message.indexOf(randomNo) !== -1 ) {
                return true;
            }
            if(typeof onerror == "function")
                return onerror(message, source, lineno, colno, error);
    };
    createProxy(window, '{{1}}', {get: abort, set: function(){}});
})();