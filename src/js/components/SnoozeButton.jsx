
var React = require('react/addons');
var GoodblockDataActions = require('../actions/GoodblockDataActions.jsx');
var universalStyle = require('./universalStyle.jsx');


var SnoozeButton = React.createClass({
	onClick: function(event) {
		event.stopPropagation();
		var goodblockData = this.props.goodblockData;
		GoodblockDataActions.makeGoodblockSnooze();
		this.changeHoverState(false);
	},
	changeHoverState: function(isHovering) {
		GoodblockDataActions.snoozeIconHover(isHovering);
	},
	onMouseEnter: function(event) {		
		this.changeHoverState(true);
	},
	onMouseLeave: function(event) {
		this.changeHoverState(false);
	},
	getStyles: function(name) {
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
		var bigBubbleHeight = 30;
		
		return ({
			parent: {
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
			},
			smallBubble: {
				background: bubbleBackground,
				boxShadow: bubbleBoxShadow,
				transition: bubbleTransition,
				position: 'absolute',
				borderRadius: '50%',
				width: 4,
				height: 4,
				left: 12,
				bottom: 18,
			},
			mediumBubble: {
				background: bubbleBackground,
				boxShadow: bubbleBoxShadow,
				transition: bubbleTransition,
				position: 'absolute',
				borderRadius: '50%',
				width: 12,
				height: 12,
				left: 15,
				bottom: 24,
			},
			bigBubble: {
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
			},
			bubbleText: {
				marginTop: bigBubbleHeight * 0.3,
			},
		});
	},
	render: function() {
		var styles = this.getStyles();
		return (
			<div
				style={styles.parent}
				onClick={this.onClick}
				onMouseEnter={this.onMouseEnter}
				onMouseLeave={this.onMouseLeave} >
				<div style={styles.smallBubble} />
				<div style={styles.mediumBubble} />
				<div style={styles.bigBubble}>
					<div style={styles.bubbleText}>zzz...</div>
				</div>
			</div>
		);
	}
});

module.exports = SnoozeButton;
