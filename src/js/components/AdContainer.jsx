
var React = require('react/addons');
var AdUnit = require('./AdUnit.jsx');
var AdCloseButton = require('./AdCloseButton.jsx');
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
		var adCloseButton;
		if (goodblockData.uiState.ad.isFullyOpen) {
			adUnit = (
				<AdUnit key='goodblock-ad-unit' goodblockData={goodblockData} />
			);
			adCloseButton = (
				<AdCloseButton />
			);
		}

		return (
			<div style={adContainerStyle}>
				<TimeoutTransitionGroup
					transitionName='ad-dimmer'
					enterTimeout={700}
					leaveTimeout={700}
					transitionEnter={true}
					transitionLeave={true}>
						{adCloseButton}
				</TimeoutTransitionGroup>
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
