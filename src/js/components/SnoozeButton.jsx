
var React = require('react/addons');
var GoodblockDataActions = require('../actions/GoodblockDataActions.jsx');
var universalStyle = require('./universalStyle.jsx');


var SnoozeButton = React.createClass({
	onClick: function(event) {
		event.stopPropagation();
		var goodblockData = this.props.goodblockData;
		GoodblockDataActions.snoozeClick(true);
		this.changeHoverState(false);

		// Hide the snooze text after some time.
		setTimeout(function() {
			GoodblockDataActions.snoozeClick(false);
		}, 2000);
	},
	changeHoverState: function(isHovering) {
		GoodblockDataActions.snoozeHover(isHovering);
	},
	onMouseEnter: function(event) {		
		this.changeHoverState(true);
	},
	onMouseLeave: function(event) {
		this.changeHoverState(false);
	},
	render: function() {
		var goodblockData = this.props.goodblockData;
		var bubbleBackground = 'rgba(255, 255, 255, 0.62)';
		var bubbleBoxShadow = 'rgba(0,0,0,0.2) 3px 3px 8px';
		var bubbleTransition = 'background 0.3s, color 0.3s';
		var textColor = '#949494';
		if (goodblockData.uiState.snooze.isHovering) {
			var textColor = '#757575';
			var bubbleBackground = 'rgba(255, 255, 255, 1)';
		}
		var parentWidth = 70;
		var parentHeight = 65;
		var parentStyle = {
			position: 'absolute',
			width: parentWidth,
			height: parentHeight,
			top: (-parentHeight) * 0.6,
			right: (-parentWidth) * 0.76,
			zIndex: '-1',
			cursor: 'default',
    		fontFamily: universalStyle.fontFamily,
    		// Radius to limit the mouse events to around
    		// the visible area of the thought bubble.
		    borderBottomRightRadius: '100%',
		    borderTopLeftRadius: '90%',
		    borderTopRightRadius: '30%',

		};
		var smallBubbleStyle = {
			background: bubbleBackground,
			boxShadow: bubbleBoxShadow,
			transition: bubbleTransition,
			position: 'absolute',
			borderRadius: '50%',
			width: 4,
			height: 4,
			left: 12,
			bottom: 18,
		};
		var mediumBubbleStyle = {
			background: bubbleBackground,
			boxShadow: bubbleBoxShadow,
			transition: bubbleTransition,
			position: 'absolute',
			borderRadius: '50%',
			width: 12,
			height: 12,
			left: 15,
			bottom: 24,
		};
		var bigBubbleHeight = 30;
		var bigBubbleStyle = {
			height: bigBubbleHeight,
			background: bubbleBackground,
			boxShadow: bubbleBoxShadow,
			transition: bubbleTransition,
			position: 'absolute',
			borderRadius: '50%',
			width: 40,
			left: 24,
			bottom: 30,
			fontSize: 11,
			textAlign: 'center',
			color: textColor,
		};
		var bubbleTextStyle = {
			marginTop: bigBubbleHeight * 0.3,
		};
		return (
			<div
				style={parentStyle}
				onClick={this.onClick}
				onMouseEnter={this.onMouseEnter}
				onMouseLeave={this.onMouseLeave} >
				<div style={smallBubbleStyle} />
				<div style={mediumBubbleStyle} />
				<div style={bigBubbleStyle}>
					<div style={bubbleTextStyle}>zzz...</div>
				</div>
			</div>
		);
	}
});

module.exports = SnoozeButton;
