
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
		var bubbleBackground = 'rgba(0, 0, 0, 0.7)';
		var bubbleBoxShadow = 'rgba(0,0,0,0.2) 3px 3px 8px';
		var bubbleTransition = 'background 0.3s, color 0.3s';
		var textColor = '#949494';
		if (goodblockData.uiState.snooze.isHovering) {
			var textColor = '#757575';
			var bubbleBackground = 'rgba(0, 0, 0, 0.8)';
		}
		var parentWidth = 70;
		var parentHeight = 65;
		var bigBubbleDiameter = 28;
		
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
			bigBubble: {
				height: bigBubbleDiameter,
				width: bigBubbleDiameter,
				background: bubbleBackground,
				boxShadow: bubbleBoxShadow,
				transition: bubbleTransition,
				position: 'absolute',
				borderRadius: '50%',
				left: 12,
				bottom: 18,
				fontSize: 11,
				textAlign: 'center',
				color: textColor,
			},
			bubbleText: {
				marginTop: 5,
				width: 18,
				height: 18,
				fill: 'rgba(255, 255, 255, 0.8)',
			},
		});
	},
	render: function() {
		var styles = this.getStyles();
		return (
			<div
				style={styles.parent}
				onClick={this.onClick}
				data-goodblock-elem='snooze-button'
				onMouseEnter={this.onMouseEnter}
				onMouseLeave={this.onMouseLeave} >
				<div style={styles.bigBubble}>
				<svg style={styles.bubbleText} 
					x="0px" y="0px" viewBox="0 0 512 512">
					<path d="M256,0C114.609,0,0,114.625,0,
					256s114.609,256,256,256c141.375,0,256-114.625,256-256S397.375,0,
					256,0z M256,448  c-105.875,0-192-86.125-192-192S150.125,64,256,
					64s192,86.125,192,192S361.875,448,256,448z M416,256c0,
					17.688-14.313,32-32,32H256  c-17.672,
					0-32-14.313-32-32V128c0-17.688,14.328-32,32-32s32,
					14.313,32,32v96h96C401.688,224,416,238.313,416,256z"/>
				</svg>
				</div>
			</div>
		);
	}
});

module.exports = SnoozeButton;
