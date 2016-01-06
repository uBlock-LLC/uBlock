
var React = require('react/addons');
var universalStyle = require('./universalStyle.jsx');


var SpeechBubble = React.createClass({
	onClick: function(event) {
		event.stopPropagation();
	},
	getDefaultProps: function() {
		return {
			type: 'text',
			buttonOneOnClick: function(){},
			buttonTwoOnClick: function(){},
		}
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

		var twoButtonStyle = {
			height: '60px !important',
			width: '120px !important',
			right: '-90px !important',
			padding: '2px !important'
		};

		var buttonContainerStyle = {
			marginTop: '14px !important',
		};
		var buttonStyle = {
			cursor: 'pointer !important',
			paddingTop: '4px !important',
			paddingBottom: '4px !important',
			paddingLeft: '8px !important',
			paddingRight: '8px !important',
		    borderRadius: '2px !important',
		    marginLeft: '2px !important',
		    marginRight: '2px !important',
		};
		var noButtonStyle = Object.assign({}, buttonStyle, {
			background: '#a94442 !important',
		});
		var yesButtonStyle = Object.assign({}, buttonStyle, {
			background: '#10992A !important',
		});

		var finalStyle;
		var buttons;
		switch (this.props.type) {
			case 'two-button':
				finalStyle = Object.assign({}, style, twoButtonStyle);
				buttons = (
					<div style={buttonContainerStyle}>
						<span
							style={noButtonStyle}
							onClick={this.props.buttonOneOnClick}>
								No
						</span>
						<span
							style={yesButtonStyle}
							onClick={this.props.buttonTwoOnClick}>
								Yes
						</span>
					</div>
				);
				break;
			default:
				finalStyle = Object.assign({}, style);
		}

		return (
			<div style={finalStyle}
				className='speech-bubble'
				onClick={this.onClick}
				data-goodblock-elem='speech-bubble'>
				{text}
				{buttons}
			</div>
		);
	}
});

module.exports = SpeechBubble;
