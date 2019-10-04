/*
    The idea implemented from
    https://issues.adblockplus.org/ticket/7141
*/

(function() {
    function strToRegex(s) {
        if (s.charAt(0) === '/' && s.slice(-1) === '/' && s.length > 2) {
            return new RegExp(s.slice(1, -1));
        }
       let reStr = s.replace(/[.+?${}()|[\]\\]/g, '\\$&'); 
       return new RegExp(reStr);
    }
    
    var randomNo = Math.floor(Math.random() * 2116316160 + 60466176).toString(36);

    function abortCurrentInlineScript(api, search = "null") {
        let names =  api.split("."); 
        let base = window;
        let property;
        let lastproperty = names.pop();
            while( (property = names.shift()) !== undefined ) {
            base = base[property];
            if (!base || !(base instanceof Object)) {
                return;
            } 
        }
        var descriptor = Object.getOwnPropertyDescriptor(base, lastproperty);
        if ( descriptor && descriptor.get !== undefined ) { return; } 
        
        let re = search != "null" ? strToRegex(search) : null;
        let rid = randomNo;
        let us = document.currentScript;
        var value = base[lastproperty];
        
        function validate() {
            let element = document.currentScript;
            if (element instanceof HTMLScriptElement && element.src == "" &&
                element != us && (!re || re.test(element.textContent)))
            {
                throw new ReferenceError(rid);
            }
        }

        Object.defineProperty(base, lastproperty, {
            get() { validate(); return value; },
            set(newValue) { 
                validate();
                value = newValue;
            },
            configurable: true
        });
       var onerror = window.onerror;
       window.onerror = function(message, source, lineno, colno, error) {
           if ( typeof message === 'string' && message.indexOf(randomNo) !== -1 ) {
               return true;
           }
           if (typeof onerror == "function")
               return onerror(message, source, lineno, colno, error);
       };
    }
    abortCurrentInlineScript("{{1}}","{{2}}");
})();