
// Initial Goodblockstate.
var _goodblockData = {
	imgUrls: {}, // We fetch these from the extension on load.
	uiState: {
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
		},
		goodnight: {
			sayingGoodnight: false,
			goingToBed: false,
		},
	}
};

module.exports = _goodblockData;
