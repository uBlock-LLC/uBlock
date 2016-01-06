
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
	tests: {
		contentSupport: {
			insufficientHearts: false,
			gaveHearts: false,
			didNotSupport: false,
			openedAd: false,
			inProcessOfHiding: false,
		}
	}
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
	testData: {},
	userProfile: {},
};

module.exports = _goodblockData;
