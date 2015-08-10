
var GoodblockDataStore = require('../stores/GoodblockDataStore.jsx');
var _goodblockData = require('../stores/goodblockData.jsx');

/******************************************************************************/
/******************************************************************************/

// Set up messaging to the extension.
var goodblockMessager = vAPI.messaging.channel('contentscript-goodblock.js');

/******************************************************************************/
/******************************************************************************/

// Listen for messages from the extension.

goodblockMessager.listener = function(request) {
	// console.log('Message sent to contentscript-goodblock.js', request);
	switch (request.what) {
		// Listen for Goodblock data.
		case 'goodblockVisibility':
			GoodblockDataActions.changeVisibility(request.data.isVisible);
			break;
		case 'goToBed':
			GoodblockDataActions.sendGoodblockToBed();
			break;
		default:
			console.log('Unhandled message sent to contentscript-goodblock.js:', request);
			return;
	}
};

/******************************************************************************/
/******************************************************************************/

var LocalMessager = {

	fetchImgUrls: function() {

		var goodblockImgUrlHandler = function(imgUrlData) {
			GoodblockDataActions.setImgUrls(imgUrlData);
		};

		goodblockMessager.send(
		  {
		    what: 'retrieveGoodblockImgUrls'
		  },
		  goodblockImgUrlHandler
		);
	},

	fetchGoodblockVisibilityState: function() {

		var goodblockVisibilityHandler = function(isVisible) {
			GoodblockDataActions.changeVisibility(isVisible);
		}

		goodblockMessager.send(
			{
				what: 'getGoodblockVisibilityState'
			},
			goodblockVisibilityHandler
		);
	},

	// Tell the extension to snooze Goodblock.
	snoozeGoodblock: function() {
		goodblockMessager.send(
			{
				what: 'snoozeGoodblock'
			}
		);
	},

	goodnightGoodblock: function() {
		goodblockMessager.send(
			{
				what: 'goodnightGoodblock'
			}
		);
	},

	adOpenStateChange: function(isAdOpen) {
		goodblockMessager.send(
			{
				what: 'adOpenStateChange',
				isAdOpen: isAdOpen,
			}
		);
	},
	
	logAdView: function() {
		goodblockMessager.send(
			{
				what: 'logAdView'
			}
		);
	}
	
}

/******************************************************************************/
/******************************************************************************/

function setSnoozeMessageStatus(showSnoozeMessage) {
	_goodblockData.uiState.snooze.isSnoozing = showSnoozeMessage;
	GoodblockDataStore.emitChange();
}

// Set whether we're currently saying good night.
function sayGoodnight(shouldSayGoodnight) {
	_goodblockData.uiState.goodnight.sayingGoodnight = shouldSayGoodnight;
	goingToBed(true);
	GoodblockDataStore.emitChange();
}

// Set whether we're in the process of going to bed.
function goingToBed(isGoingToBed) {
	_goodblockData.uiState.goodnight.goingToBed = isGoingToBed;

	// Reset the state of the ad.
	_goodblockData.uiState.ad.iframeLoaded = false;
	GoodblockDataStore.emitChange();
}

// Set whether we're in the process of snozing.
function inProcessOfSnoozing(isSnoozing) {
	_goodblockData.uiState.snooze.inProcessOfSnoozing = isSnoozing;
}

// Resets the UI state to defaults.
function resetUiState() {
	_goodblockData.resetUiState();
	GoodblockDataStore.emitChange();
}

function changeAdOpenState(isOpen) {
	_goodblockData.uiState.ad.isOpen = isOpen;
	GoodblockDataStore.emitChange();
}

var adOpenAnimationLength = 700;

// Actions used to update the Goodblock state.
var GoodblockDataActions = {
	fetchImgUrls: function() {
		LocalMessager.fetchImgUrls();
	},
	fetchGoodblockVisibilityState: function() {
		LocalMessager.fetchGoodblockVisibilityState();
	},
	setImgUrls: function(imgUrls) {
		_goodblockData.imgUrls = imgUrls;
		GoodblockDataStore.emitChange();
	},
	iconClick: function() {
		if (!_goodblockData.uiState.isClicked) {
			_goodblockData.uiState.isClicked = true;
			GoodblockDataStore.emitChange();

			// if the user is clicking it the first time
			// log that they're viewing the ad
			GoodblockDataActions.logAdView();

			// Mark the ad opened state as true.
			changeAdOpenState(true);
		}

		// Tell the extension the ad unit has opened.
		LocalMessager.adOpenStateChange(true);

	},
	iconHover: function(isHovering) {
		_goodblockData.uiState.isHovering = isHovering;
		GoodblockDataStore.emitChange();
	},
	changeVisibility: function(isVisible) {
		// console.log('Changing visibility. isVisible:', isVisible);
		_goodblockData.uiState.isVisible = isVisible;
		GoodblockDataStore.emitChange();
	},
	snoozeIconHover: function(isHovering) {
		_goodblockData.uiState.snooze.isHovering = isHovering;
		GoodblockDataStore.emitChange();
	},
	makeGoodblockSnooze: function() {
		setSnoozeMessageStatus(true);
		var timeToSnooze = 2100;
		var exitAnimationTime = 500;

		inProcessOfSnoozing(true);

		// Hide the snooze text after some time.
		setTimeout(function() {
			setSnoozeMessageStatus(false);
		}, timeToSnooze - 100);

		// Tell the extension to snooze Goodblock
		// after some time.
		setTimeout(function() {
			LocalMessager.snoozeGoodblock();
			inProcessOfSnoozing(false);
		}, timeToSnooze);

		// Reset Goodblock UI state once the icon is hidden.
		setTimeout(function() {
			resetUiState();
		}, timeToSnooze + exitAnimationTime);
	},
	// Go through the process of going to bed.
	sendGoodblockToBed: function() {

		var timeToGoodnight = 2400;
		var exitAnimationTime = 500;

		// Show the "goodnight" speech bubble.
		setTimeout(function() {
			sayGoodnight(true);
		}, 200);

		// Hide the "goodnight" speech bubble after
		// some time.
		setTimeout(function() {
			sayGoodnight(false);
		}, timeToGoodnight - 400);

		// Change the Goodblock visibility.
		setTimeout(function() {
			GoodblockDataActions.changeVisibility(false);
			goingToBed(false);
		}, timeToGoodnight);

		// Reset Goodblock UI state once the icon is hidden.
		setTimeout(function() {
			resetUiState();
		}, timeToGoodnight + exitAnimationTime);
	},
	logAdView: function() {
		LocalMessager.logAdView();
	},
	markIframeAsLoaded: function() {
		_goodblockData.uiState.ad.iframeLoaded = true;
		GoodblockDataStore.emitChange();
	},
}

/******************************************************************************/
/******************************************************************************/

module.exports = GoodblockDataActions;
