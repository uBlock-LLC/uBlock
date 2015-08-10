
var defaultUiState = {
	isClicked: false,
	isHovering: false,
	isVisible: false,
	ad: {
		isOpen: false,
		iframeLoaded: false,
	},
	snooze: {
		isHovering: false,
		isSnoozing: false,
		inProcessOfSnoozing: false,
	},
	goodnight: {
		sayingGoodnight: false,
		goingToBed: false,
	},
};

// "Clone" an object.
function clone(obj) {
	return JSON.parse(JSON.stringify(obj));
}

// Initial Goodblockstate.
var _goodblockData = {
	imgUrls: {}, // We fetch these from the extension on load.
	uiState: clone(defaultUiState),
	resetUiState: function() {
		_goodblockData.uiState = clone(defaultUiState);
	},
};

module.exports = _goodblockData;
