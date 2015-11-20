
var React = require('react/addons');
var GoodblockDataActions = require('../actions/GoodblockDataActions.jsx');
var universalStyle = require('./universalStyle.jsx');
var Tooltip = require('./Tooltip.jsx');


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
		var bubbleBackground = 'rgba(0, 0, 0, 0.7) !important';
		var bubbleBoxShadow = 'rgba(0,0,0,0.2) 3px 3px 8px !important';
		var bubbleTransition = 'background 0.3s, color 0.3s !important';
		var textColor = '#949494 !important';
		if (goodblockData.uiState.snooze.isHovering) {
			var textColor = '#757575 !important';
			var bubbleBackground = 'rgba(0, 0, 0, 0.8) !important';
		}
		var parentWidth = '70px !important';
		var parentHeight = '65px !important';
		var bigBubbleDiameter = '28px !important';
		
		return ({
			parent: {
				position: 'absolute !important',
				width: parentWidth,
				height: parentHeight,
				top: '-42px !important',
				right: '-53px !important',
				zIndex: '-1 !important',
				cursor: 'default !important',
	    		fontFamily: universalStyle.fontFamily,
	    		// Radius to limit the mouse events to around
	    		// the visible area of the thought bubble.
			    borderBottomRightRadius: '100% !important',
			    borderTopLeftRadius: '90% !important',
			    borderTopRightRadius: '30% !important',
			},
			mediumBubble: {
				background: bubbleBackground,
				boxShadow: bubbleBoxShadow,
				transition: bubbleTransition,
				position: 'absolute !important',
				borderRadius: '50% !important',
				width: '12px !important',
				height: '12px !important',
				left: '15px !important',
				bottom: '24px !important',
			},
			smallBubble: {
				background: bubbleBackground,
				boxShadow: bubbleBoxShadow,
				transition: bubbleTransition,
				position: 'absolute !important',
				borderRadius: '50% !important',
				width: '4px !important',
				height: '4px !important',
				left: '12px !important',
				bottom: '18px !important',
			},
			bigBubble: {
				height: bigBubbleDiameter,
				width: bigBubbleDiameter,
				background: bubbleBackground,
				boxShadow: bubbleBoxShadow,
				transition: bubbleTransition,
				position: 'absolute',
				borderRadius: '50%',
				left: '12px !important',
				bottom: '18px !important',
				fontSize: '11px !important',
				textAlign: 'center !important',
				color: textColor,
			},
			bubbleText: {
				marginTop: '5px !important',
				width: '18px !important',
				height: '18px !important',
				fill: 'rgba(255, 255, 255, 0.8) !important',
			},
		});
	},
	render: function() {
		var styles = this.getStyles();
		var goodblockData = this.props.goodblockData;

		var tooltip;
		if (goodblockData.uiState.snooze.isHovering) {
			tooltip = (
				<Tooltip key='tooltip' text='Snooze' />
			);
		}

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
					{tooltip}
			</div>
		);
	}
});

module.exports = SnoozeButton;
