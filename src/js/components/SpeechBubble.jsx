
var React = require('react/addons');
var universalStyle = require('./universalStyle.jsx');


var SpeechBubble = React.createClass({
	onClick: function(event) {
		event.stopPropagation();
	},
	render: function() {
		var goodblockData = this.props.goodblockData;
		var text = this.props.text;
		var speechBubbleHeight = 24;
		var speechBubbleWidth = 70;
		var style = {
			fontFamily: universalStyle.fontFamily,
			fontSize: 12,
			color: '#fff',
			height: speechBubbleHeight,
			width: speechBubbleWidth,
			position: 'absolute',
			bottom: 9,
			right: (-speechBubbleWidth) * 0.87,
			textAlign: 'center',
			boxSizing: 'content-box',
			cursor: 'default',
		};
		return (
			<div style={style}
				className='speech-bubble'
				onClick={this.onClick}
				data-goodblock-elem='speech-bubble'>
				{text}
			</div>
		);
	}
});

module.exports = SpeechBubble;
