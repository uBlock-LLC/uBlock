
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
	}
}

/******************************************************************************/
/******************************************************************************/

// Actions used to update the Goodblock state.
var GoodblockDataActions = {
	iconClick: function(isClicked) {
		_goodblockData.uiState.isClicked = isClicked;
		GoodblockDataStore.emitChange();
	},
	iconHover: function(isHovering) {
		_goodblockData.uiState.isHovering = isHovering;
		GoodblockDataStore.emitChange();
	},
	setImgUrls: function(imgUrls) {
		_goodblockData.imgUrls = imgUrls;
		GoodblockDataStore.emitChange();
	},
	changeVisibility: function(isVisible) {
		console.log('Changing visibility. isVisible:', isVisible);
		_goodblockData.uiState.isVisible = isVisible;
		GoodblockDataStore.emitChange();
	},
	snoozeHover: function(isHovering) {
		_goodblockData.uiState.snooze.isHovering = isHovering;
		GoodblockDataStore.emitChange();
	},
	snoozeClick: function(isClicked) {
		_goodblockData.uiState.snooze.isClicked = isClicked;
		GoodblockDataStore.emitChange();
		// Tell the extension to snooze Goodblock
		// after some time.
		setTimeout(function() {
			LocalMessager.snoozeGoodblock();
		}, 2100);
	},
	fetchImgUrls: function() {
		LocalMessager.fetchImgUrls();
	},
}

/******************************************************************************/
/******************************************************************************/

module.exports = GoodblockDataActions;
