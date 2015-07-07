
var React = require('react/addons');
var GoodblockDataActions = require('../actions/GoodblockDataActions.jsx');

var AdUnit = React.createClass({
	markIframeAsLoaded: function() {
		GoodblockDataActions.markIframeAsLoaded();
	},
	render: function() {
		var goodblockData = this.props.goodblockData;
		// TODO: change this placeholder.
		var src = 'https://www.google.com';

		// Only show the ad unit if it has loaded.
		var adUnitOpacity;
		if (goodblockData.uiState.ad.iframeLoaded) {
			adUnitOpacity = 1;
		}
		else {
			adUnitOpacity = 0;
		}
		var adUnitStyle = {
			position: 'absolute',
			top: 0,
			left: 0,
			width: '100%',
			height: '100%',
			border: 'none',
			background: '#FFF',
			transition: 'opacity 0.5s ease',
			opacity: adUnitOpacity,
		};

		return (
			<iframe
				src={src}
				style={adUnitStyle}
				onLoad={this.markIframeAsLoaded}>
			</iframe>
		);
	}
});

module.exports = AdUnit;
