
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
		var prevClickState = goodblockData.uiState.isClicked;
		GoodblockDataActions.iconClick();
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
		var backgroundColor = 'rgba(0, 0, 0, 0.7)';

		// Set up the snooze button and/or snooze text.
		var snoozeButton;
		var speechBubble;
		if (goodblockData.uiState.snooze.isSnoozing) {
			var text = "Ok, I'll come back later!";
			speechBubble = (
				<SpeechBubble key='snooze-speech-bubble' goodblockData={goodblockData} text={text} />
			);
		}
		else if (
			goodblockData.uiState.isHovering &&
			!goodblockData.uiState.isClicked &&
			!goodblockData.uiState.goodnight.goingToBed &&
			!goodblockData.uiState.snooze.inProcessOfSnoozing
		) {
			backgroundColor = 'rgba(0, 0, 0, 0.9)';
			snoozeButton = (
				<SnoozeButton key='snooze-button' goodblockData={goodblockData} />
			);
		}

		// Say goodbye to the user after they view an ad.
		if (goodblockData.uiState.goodnight.sayingGoodnight) {
			var text = 'Thanks! See you later!';
			speechBubble = (
				<SpeechBubble
					key='goodnight-speech-bubble'
					goodblockData={goodblockData}
					text={text} />
			);
		}

		// Style of the main icon.
		if (goodblockData.uiState.isClicked) {
			backgroundColor = 'rgba(0, 0, 0, 0.9)';
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
					onMouseLeave={this.onMouseLeave}
					data-goodblock-elem='icon' >
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
				appearTimeout={1000}
				enterTimeout={1000}
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
