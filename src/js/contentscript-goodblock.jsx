// console.log('Goodblock content script.');

/******************************************************************************/
/******************************************************************************/

var React = require('react/addons');
var GoodblockDataStore = require('./stores/GoodblockDataStore.jsx');
var GoodblockDataActions = require('./actions/GoodblockDataActions.jsx');
var GoodblockRootElem = require('./components/GoodblockRootElem.jsx');

/******************************************************************************/
/******************************************************************************/

var reactBaseElemId = 'goodblock-react-base';
var CONTENT_SCRIPT_NUM; // An integer
var DOM_CHANGE_LISTENER; // An instance of MutationObserver

// Create the Goodblock app base element and return it.
var createBaseElem = function() {
	var reactBaseElem = document.createElement('div');
	reactBaseElem.id = reactBaseElemId;
	reactBaseElem.dataset.goodblockInitialized = 'true';
	reactBaseElem.dataset.goodblockContentScriptNum = 0;
	reactBaseElem.dataset.goodblockRemountApp = 'false';
	document.body.appendChild(reactBaseElem);
	return reactBaseElem;
}

// Return the Goodblock app base elem if it exists. If it
// does not exist, create it and return it.
var getOrCreateBaseElem = function() {
	var baseElem = document.querySelector('#' + reactBaseElemId);
	// If our app's base element doesn't exist, let's create it.
	if (!baseElem) {
		baseElem = createBaseElem();
	}
	return baseElem;
}

// Returns true if this is the first content script to execute,
var isFirstContentScript = function() {
	return (
		getGoodblockContentScriptNum() === 1 &&
		CONTENT_SCRIPT_NUM === 1
	);
}

// Fetch whether the React app was just unmounted by another content script.
// This datum is stored in a DOM attribute.
// Returns a boolean.
var getGoodblockShouldMountValue = function() {
	var reactBaseElem = getOrCreateBaseElem();
	var shouldRemountAppStr = reactBaseElem.dataset.goodblockRemountApp;

	// Convert data value string to boolean.
	shouldRemountApp = shouldRemountAppStr === 'true' ? true : false;
	return shouldRemountApp;
}

// Set whether the React app was just unmounted by another content script.
// This datum is stored in a DOM attribute.
// shouldRemountApp is a boolean.
var setGoodblockShouldMountValue = function(shouldRemountApp) {
	var reactBaseElem = getOrCreateBaseElem();
	reactBaseElem.dataset.goodblockRemountApp = shouldRemountApp.toString();

}

// Get the number of Goodblock content scripts we've injected
// into this page.
// This datum is stored in a DOM attribute.
var getGoodblockContentScriptNum = function() {
	var reactBaseElem = getOrCreateBaseElem();
	return parseInt(reactBaseElem.dataset.goodblockContentScriptNum);
}

// Get the number of Goodblock content scripts we've injected
// into this page.
// This datum is stored in a DOM attribute.
var incrementGoodblockContentScriptNum = function() {
	var reactBaseElem = getOrCreateBaseElem();
	var currNum = parseInt(reactBaseElem.dataset.goodblockContentScriptNum);

	// Increment the value of the data attribute.
	reactBaseElem.dataset.goodblockContentScriptNum = currNum + 1;

	return currNum + 1;
}

// Unmount the React app from the base DOM element.
// Set a DOM attribute indicating that we've unmounted the app.
var unmountApp = function() {
	var reactBaseElem = getOrCreateBaseElem();
	var didReactUnmount = React.unmountComponentAtNode(reactBaseElem);
	if (didReactUnmount) {
		// Once we've unmounted the app, mark the app ready for
		// mounting by the new content script.
		setGoodblockShouldMountValue(true);
	}
}

// Mount the React app onto the base DOM element.
var mountApp = function() {
	var baseElem = getOrCreateBaseElem();
	React.render(<GoodblockRootElem />, baseElem);
}

// Called when there are changes to the data attributes on our
// base DOM element that are relevant to mounting/unmounting.
var handleMountingChange = function() {
	currContentScriptNum = getGoodblockContentScriptNum();

	// If the current content script count is different from
	// this content script's number, another content script
	// ran in this page, so we should unmount the app here.
	if (CONTENT_SCRIPT_NUM !== currContentScriptNum) {
		unmountApp();
		unregisterContentScriptChangeListener();
	}
	// If the current content script count is the same as this
	// content script's number, we may need to mount the app.
	else {
		var shouldMountApp = getGoodblockShouldMountValue();
		if (shouldMountApp) {
			mountApp();

			// Once we've mounted the app, mark that we should
			// not mount it again.
			setGoodblockShouldMountValue(false);
		}
	}
}

// Called when our base DOM element is mutated in some way.
// Takes mutations, an array created by MutationObserver.
var handleGoodblockElemChange = function(mutations) {
	mutations.forEach(function(mutation) {

		// Check if the mutation is a change to one of the attributes
		// we use in mounting and unmounting.
		if (mutation.type === 'attributes' &&
			(
				mutation.attributeName === 'data-goodblock-content-script-num' ||
				mutation.attributeName === 'data-goodblock-remount-app'
			)
		) {
			handleMountingChange();
		}
	});
}

// Stop observing our base DOM element.
var unregisterContentScriptChangeListener = function() {
	DOM_CHANGE_LISTENER.disconnect();
}

// Observe changes to our base DOM element. This is so that we know
// whether we need to mount or unmount the app based on what's
// happening in any other content scripts.
var registerContentScriptChangeListener = function() {
	var baseElem = getOrCreateBaseElem();
	DOM_CHANGE_LISTENER = new MutationObserver(handleGoodblockElemChange);
	DOM_CHANGE_LISTENER.observe(baseElem, {
		attributes: true,
		childList: false,
		subtree: false,
		characterData: false,
	});
}

// Update the Goodblock app elements, creating them if they don't exist.
var initGoodblock = function() {

	// Make sure our base elem exists.
	var baseElem = getOrCreateBaseElem();

	// Increment the saved number of Goodblock content scripts
	// we've injected, and save that value in this content script.
	CONTENT_SCRIPT_NUM = incrementGoodblockContentScriptNum();

	// Listen for whether we should mount or unmount our
	// React app.
	registerContentScriptChangeListener();

	// If this is the first content script to run on this page,
	// set that we want to mount the app.
	if(isFirstContentScript()) {
		setGoodblockShouldMountValue(true);
	}
}

// When this content script executes, there are two possibilities:
//   (1) This is the first time the content script has run in the
//		 current page, like when the user navigates to a new web
//		 page or when the user installs the extension for the first
//		 time.
//	 (2) This is the second or greater time the content script has
//	     has run in the current page. This can happen when the extension
//		 updates, when the user manually reloads the extension, or if
//		 the user uninstalls and reinstalls without reloading a web page.
// In possibility #2, we must be sure to unmount our React app from the 
// old content script before we mount the React app in the new content
// script. If we do not, there will be duplicate React nodes that cause
// bugs (as of React 0.13.3). Because the instance of React in the new
// content script will be different from that of the old content script,
// we can't unmount the old app from the new content script.
// To deal with this, we use DOM attributes to determine how many content
// scripts have been executed. When an old content script sees that a
// new content script has executed, the old content script unmounts its
// React app. Then, the new content script mounts the app.
initGoodblock();

/******************************************************************************/
/******************************************************************************/

// On load, fetch Goodblock image URLs from the extension.
GoodblockDataActions.fetchImgUrls();
GoodblockDataActions.fetchGoodblockVisibilityState();

/******************************************************************************/
/******************************************************************************/
