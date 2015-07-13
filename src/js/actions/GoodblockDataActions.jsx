
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
			GoodblockDataActions.changeVisibility(false);
			goingToBed(false);
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

function changeAdFullyOpenState(isAdFullyOpen) {
	_goodblockData.uiState.ad.isFullyOpen = isAdFullyOpen;
	GoodblockDataStore.emitChange();
}

var adOpenAnimationLength = 700;

// Actions used to update the Goodblock state.
var GoodblockDataActions = {
	fetchImgUrls: function() {
		LocalMessager.fetchImgUrls();
	},
	setImgUrls: function(imgUrls) {
		_goodblockData.imgUrls = imgUrls;
		GoodblockDataStore.emitChange();
	},
	iconClick: function(isClicked) {
		_goodblockData.uiState.isClicked = isClicked;
		GoodblockDataStore.emitChange();

		if (isClicked) {
			// After the ad has opened, mark the ad opened state as true.
			setTimeout(function() {
				changeAdFullyOpenState(true);
			}, adOpenAnimationLength);
		}
	},
	iconHover: function(isHovering) {
		_goodblockData.uiState.isHovering = isHovering;
		GoodblockDataStore.emitChange();
	},
	changeVisibility: function(isVisible) {
		console.log('Changing visibility. isVisible:', isVisible);
		_goodblockData.uiState.isVisible = isVisible;
		GoodblockDataStore.emitChange();
	},
	takeNap: function() {
	    GoodblockDataStore.emitChange();
	},
	snoozeIconHover: function(isHovering) {
		_goodblockData.uiState.snooze.isHovering = isHovering;
		GoodblockDataStore.emitChange();
	},
	makeGoodblockSnooze: function() {
		setSnoozeMessageStatus(true);
		var timeToSnooze = 2100;

		// Hide the snooze text after some time.
		setTimeout(function() {
			setSnoozeMessageStatus(false);
		}, timeToSnooze - 100);

		// Tell the extension to snooze Goodblock
		// after some time.
		setTimeout(function() {
			LocalMessager.snoozeGoodblock();
		}, timeToSnooze);
	},
	// Go through the process of going to bed.
	sendGoodblockToBed: function(isViewed) {
		sayGoodnight(true);
		changeAdFullyOpenState(false);

		var timeToGoodnight = 2400;

		// Hide the "goodnight" speech bubble after
		// some time.
		setTimeout(function() {
			sayGoodnight(false);
		}, timeToGoodnight - 400);

		// Tell the extension to goodnight Goodblock
		// after some time.
		setTimeout(function() {
			LocalMessager.goodnightGoodblock();
		}, timeToGoodnight);
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
