
var React = require('react/addons');
var AdUnit = require('./AdUnit.jsx');
var TimeoutTransitionGroup = require('./TimeoutTransitionGroup.jsx');

var AdContainer = React.createClass({
	render: function() {
		var goodblockData = this.props.goodblockData;
		var adContainerStyle = {
			position: 'fixed',
			top: 0,
			left: 0,
			width: '100%',
			height: '100%',
			background: '#FDCA60', // one of our icon's oranges
			// background: '#FFF',
			zIndex: 2147483646, // Max on some browsers, minus one
		};

		// Only load the ad unit after the slider is fully open.
		var adUnit;
		if (goodblockData.uiState.ad.isFullyOpen) {
			var adUnit = (
				<AdUnit goodblockData={goodblockData} />
			);
		}

		return (
			<div style={adContainerStyle}>
				<TimeoutTransitionGroup
					transitionName='goodblock-ad-unit'
					transitionEnter={false}
					transitionAppear={false}
					transitionLeave={false}
					leaveTimeout={500}>
						{adUnit}
				</TimeoutTransitionGroup>
			</div>
		);
	}
});

module.exports = AdContainer;
