
var React = require('react/addons');
var GoodblockDataActions = require('../actions/GoodblockDataActions.jsx');
var GoodblockIcon = require('./GoodblockIcon.jsx');
var SnoozeButton = require('./SnoozeButton.jsx');
var SpeechBubble = require('./SpeechBubble.jsx');


// This module is a replacement for React's CSSTransitionGroup,
// which is buggy when run background tabs.
// See https://github.com/facebook/react/issues/1326
var TimeoutTransitionGroup = require('./TimeoutTransitionGroup.jsx');


var GoodblockIconHolder = React.createClass({
	onClick: function() {
		var goodblockData = this.props.goodblockData;
		GoodblockDataActions.iconClick(!goodblockData.uiState.isClicked);
	},
	changeHoverState: function(isHovering) {
		GoodblockDataActions.iconHover(isHovering);
	},
	onMouseEnter: function(event) {		
		this.changeHoverState(true);
	},
	onMouseLeave: function(event) {
		this.changeHoverState(false);
	},
	render: function() {
		var goodblockData = this.props.goodblockData;
		var isVisible = goodblockData.uiState.isVisible;
		var textColor = '#000';
		var backgroundColor = 'rgba(0, 0, 0, 0.06)';

		// Set up the snooze button and/or snooze text.
		var snoozeButton;
		var speechBubble;
		if (goodblockData.uiState.snooze.isClicked) {
			var text = "Ok, I'll come back later!";
			var speechBubble = (
				<SpeechBubble key='snooze-speech-bubble' goodblockData={goodblockData} text={text} />
			);
		}
		else if (goodblockData.uiState.isHovering && !goodblockData.uiState.isClicked) {
			backgroundColor = 'rgba(0, 0, 0, 0.12)';
			snoozeButton = (
				<SnoozeButton key='snooze-button' goodblockData={goodblockData} />
			);
		}

		// Style of the main icon.
		if (goodblockData.uiState.isClicked) {
			textColor = '#FFF';
			backgroundColor = '#000';
		}
		var style = {
			color: textColor,
			backgroundColor: backgroundColor,
			transition: 'background-color 0.3s',
			left: 10,
			bottom: 30,
			width: 26,
			height: 26,
			padding: 6,
			display: 'block',
			zIndex: 2147483647, // Max on some browsers,
			position: 'fixed',
			borderRadius: '50%',
			boxSizing: 'content-box',
		};
		var goodblockIcon;
		if (isVisible) {
			goodblockIcon = (
				<div
					key='goodblock-icon-holder'
					style={style}
					onClick={this.onClick}
					onMouseEnter={this.onMouseEnter}
					onMouseLeave={this.onMouseLeave} >
					<GoodblockIcon goodblockData={goodblockData} />
						<TimeoutTransitionGroup
							appearTimeout={200}
							enterTimeout={200}
							leaveTimeout={150}
							transitionName='snooze'
							transitionAppear={true}
							transitionEnter={true}
							transitionLeave={true}>
								{snoozeButton}
								{speechBubble}
						</TimeoutTransitionGroup>
				</div>
			);
		}
		var SHOULD_ANIMATE_ICON = true;
		return (
			<TimeoutTransitionGroup
				appearTimeout={3000}
				enterTimeout={3000}
				leaveTimeout={500}
				transitionName='goodblock-icon'
				transitionAppear={SHOULD_ANIMATE_ICON}
				transitionEnter={SHOULD_ANIMATE_ICON}
				transitionLeave={SHOULD_ANIMATE_ICON} >
					{goodblockIcon}
			</TimeoutTransitionGroup>
		);
	}
});

module.exports = GoodblockIconHolder;
