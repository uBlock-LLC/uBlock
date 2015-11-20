
var React = require('react/addons');
var universalStyle = require('./universalStyle.jsx');


var ToolTip = React.createClass({
	render: function() {		
		var goodblockData = this.props.goodblockData;
		var text = this.props.text;

		var bubbleBackground = '#555555 !important';
		var bubbleBoxShadow = 'rgba(0,0,0,0.2) 3px 3px 8px !important';
		var bubbleTransition = 'background 0.3s, color 0.3s !important';
		var textColor = 'rgba(255, 255, 255, 0.8) !important';

		var style = {
			fontFamily: universalStyle.fontFamily,
			fontSize: '12px !important',
			lineHeight: '100% !important',
			background: '#000 !important',
			color: '#FFF !important',
			height: '24px !important',
			width: '60px !important',
			position: 'absolute  !important',
			bottom: '20px !important',
			left: '48px !important',
			textAlign: 'center !important',
			boxSizing: 'content-box !important',
			cursor: 'default !important',
			background: bubbleBackground,
			boxShadow: bubbleBoxShadow,
			transition: bubbleTransition,
			textAlign: 'center',
			color: textColor,
			borderRadius: '3px !important',
		};
		var triangleStyle =  {
			width: '0px !important',
		    height: '0px !important',
		    borderTop: '7px solid transparent !important',
		    borderBottom: '7px solid transparent !important',
		    borderRight: '7px solid ' + bubbleBackground,
		    position: 'absolute !important',
		    left: '-5px !important',
		    top: '5px !important',
		};
		var textStyle = {
			marginTop: '5px !important',
		};

		return (
			<div style={style}>
				<div style={triangleStyle}></div>
				<div style={textStyle}>
					{text}
				</div>
			</div>
		);
	}
});

module.exports = ToolTip;
