
var GoodblockDataStore = require('../stores/GoodblockDataStore.jsx');
var _goodblockData = require('../stores/goodblockData.jsx');

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
	},
}

module.exports = GoodblockDataActions;
