
var React = require('react/addons');
var universalStyle = require('./universalStyle.jsx');


var SpeechBubble = React.createClass({
	onClick: function(event) {
		event.stopPropagation();
	},
	render: function() {
		var goodblockData = this.props.goodblockData;
		var text = this.props.text;
		var style = {
			fontFamily: universalStyle.fontFamily,
			fontSize: '12px !important',
			lineHeight: '100% !important',
			background: '#000 !important',
			color: '#FFF !important',
			height: '24px !important',
			width: '70px !important',
			position: 'absolute  !important',
			bottom: '9px !important',
			right: '-61px !important',
			textAlign: 'center !important',
			boxSizing: 'content-box !important',
			cursor: 'default !important',
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
