
var popupData;
var scopeToSrcHostnameMap = {
    '/': '*',
    '.': ''
};
var hostnameToSortableTokenMap = {};
var cachedPopupHash = '';
/******************************************************************************/


var messager = vAPI.messaging; //.channel('popup.js');

/******************************************************************************/

/******************************************************************************/

var toggleNetFilteringSwitch = function(ev) {

    if ( !popupData || !popupData.pageURL ) {
        return;
    }
    if ( popupData.pageHostname === 'behind-the-scene' && !popupData.advancedUserEnabled ) {
        return;
    }

    var whiteListStatus = (popupData.pageURL === '') ||
        (!popupData.netFilteringSwitch) ||
        (popupData.pageHostname === 'behind-the-scene' && !popupData.advancedUserEnabled);

    console.log('Sending msg.');
    messager.send(
        'popupPanel', 
        {
        what: 'toggleNetFiltering',
        url: popupData.pageURL,
        scope: ev.ctrlKey || ev.metaKey ? 'page' : '',
        state: !uDom('body').toggleClass('off').hasClass('off'),
        tabId: popupData.tabId,
        whiteListStatus: whiteListStatus,
    });

    hashFromPopupData();
    
    // if ( !popupData || !popupData.pageURL ) {
    //     return;
    // }
    // if ( popupData.pageHostname === 'behind-the-scene' && !popupData.advancedUserEnabled ) {
    //     return;
    // }
    // messager.send(
    //     'popupPanel',
    //     {
    //         what: 'toggleNetFiltering',
    //         url: popupData.pageURL,
    //         scope: ev.ctrlKey || ev.metaKey ? 'page' : '',
    //         state: !uDom('body').toggleClass('off').hasClass('off'),
    //         tabId: popupData.tabId
    //     }
    // );

    // hashFromPopupData();
};

/******************************************************************************/

var reloadTab = function() {
    messager.send('popupPanel', { what: 'reloadTab', tabId: popupData.tabId, select: true });

    // Polling will take care of refreshing the popup content

    // https://github.com/chrisaljoudi/uBlock/issues/748
    // User forces a reload, assume the popup has to be updated regardless if
    // there were changes or not.
    popupData.contentLastModified = -1;

    // No need to wait to remove this.
    uDom('body').toggleClass('dirty', false);
};

/******************************************************************************/
// Poll for changes.
//
// I couldn't find a better way to be notified of changes which can affect
// popup content, as the messaging API doesn't support firing events accurately
// from the main extension process to a specific auxiliary extension process:
//
// - broadcasting() is not an option given there could be a lot of tabs opened,
//   and maybe even many frames within these tabs, i.e. unacceptable overhead
//   regardless of whether the popup is opened or not.
//
// - Modifying the messaging API is not an option, as this would require
//   revisiting all platform-specific code to support targeted broadcasting,
//   which who knows could be not so trivial for some platforms.
//
// A well done polling is a better anyways IMO, I prefer that data is pulled
// on demand rather than forcing the main process to assume a client may need
// it and thus having to push it all the time unconditionally.

var pollForContentChange = (function() {
    var pollTimer = null;

    var pollCallback = function() {
        pollTimer = null;
        messager.send(
            'popupPanel',
            {
                what: 'hasPopupContentChanged',
                tabId: popupData.tabId,
                contentLastModified: popupData.contentLastModified
            },
            queryCallback
        );
    };

    var queryCallback = function(response) {
        if ( response ) {
            getPopupData(popupData.tabId);
            return;
        }
        poll();
    };

    var poll = function() {
        if ( pollTimer !== null ) {
            return;
        }
        pollTimer = setTimeout(pollCallback, 1500);
    };

    return poll;
})();

/******************************************************************************/

var hashFromPopupData = function(reset) {
    // It makes no sense to offer to refresh the behind-the-scene scope
    if ( popupData.pageHostname === 'behind-the-scene' ) {
        uDom('body').toggleClass('dirty', false);
        return;
    }

    var hasher = [];
    var rules = popupData.firewallRules;
    var rule;
    for ( var key in rules ) {
        if ( rules.hasOwnProperty(key) === false ) {
            continue;
        }
        rule = rules[key];
        if ( rule !== '' ) {
            hasher.push(rule);
        }
    }
    hasher.push(uDom('body').hasClass('off'));

    var hash = hasher.sort().join('');
    if ( reset ) {
        cachedPopupHash = hash;
    }
    uDom('body').toggleClass('dirty', hash !== cachedPopupHash);
};

/******************************************************************************/

// var renderPopupLazy = function() {
//     var onDataReady = function(data) {
//         if ( !data ) { return; }
//         var v = data.hiddenElementCount || '';
//         // uDom.nodeFromSelector('#no-cosmetic-filtering > span.badge')
//         //     .textContent = typeof v === 'number' ? v.toLocaleString() : v;
//     };

//     messager.send(
//         'popupPanel',
//         {
//             what: 'getPopupDataLazy',
//             tabId: popupData.tabId
//         },
//         onDataReady
//     );
// };

/******************************************************************************/

var renderPopup = function() {

    if ( popupData.tabTitle ) {
        document.title = popupData.appName + ' - ' + popupData.tabTitle;
    }

    var whiteListStatus = (popupData.pageURL === '') ||
        (!popupData.netFilteringSwitch) ||
        (popupData.pageHostname === 'behind-the-scene' && !popupData.advancedUserEnabled);

    uDom('body').toggleClass(
        'off',
        whiteListStatus
    );
    
    document.getElementById("switch").checked = !whiteListStatus;
};

/******************************************************************************/

var cachePopupData = function(data) {
    popupData = {};
    scopeToSrcHostnameMap['.'] = '';
    hostnameToSortableTokenMap = {};

    if ( typeof data !== 'object' ) {
        return popupData;
    }
    popupData = data;
    scopeToSrcHostnameMap['.'] = popupData.pageHostname || '';
    var hostnameDict = popupData.hostnameDict;
    if ( typeof hostnameDict !== 'object' ) {
        return popupData;
    }
    var domain, prefix;
    for ( var hostname in hostnameDict ) {
        if ( hostnameDict.hasOwnProperty(hostname) === false ) {
            continue;
        }
        domain = hostnameDict[hostname].domain;
        if ( domain === popupData.pageDomain ) {
            domain = '\u0020';
        }
        prefix = hostname.slice(0, 0 - domain.length);
        hostnameToSortableTokenMap[hostname] = domain + prefix.split('.').reverse().join('.');
    }
    return popupData;
};

/******************************************************************************/

var getPopupData = function(tabId) {
    var onDataReceived = function(response) {
        cachePopupData(response);
        renderPopup();
        // renderPopupLazy(); // low priority rendering
        hashFromPopupData(true);
        pollForContentChange();
    };
    messager.send(
        'popupPanel',
        { what: 'getPopupData', tabId: tabId },
        onDataReceived
    );
};

// Create the popup iframe.
var setupDashboard = function() {
	var iframe = document.createElement('iframe');
	iframe.id = 'dashboard';
	iframe.src = process.env.GOODBLOCK_POPUP_URL;
	var parent = document.getElementById('dashboard-container');
	parent.appendChild(iframe);		      
}

/******************************************************************************/

// Make menu only when popup html is fully loaded

uDom.onLoad(function () {

	// Delay to allow for quicker popup loading.
	setTimeout(function() {
		setupDashboard();
	}, 10);

    var tabId = null; //If there's no tab ID specified in the query string, it will default to current tab.

    // Extract the tab id of the page this popup is for
    var matches = window.location && window.location.search.match(/[\?&]tabId=([^&]+)/);
    if (matches && matches.length === 2) {
        tabId = matches[1];
    }

    getPopupData(tabId);
    uDom('#switch').on('click', toggleNetFilteringSwitch);
    uDom('#refresh').on('click', reloadTab);
});
