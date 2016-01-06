
var React = require('react/addons');
var universalStyle = require('./universalStyle.jsx');


var SpeechBubble = React.createClass({
	onClick: function(event) {
		event.stopPropagation();
	},
	getDefaultProps: function() {
		return {
			type: 'text',
			bubbleSize: 'small',
			buttonOneOnClick: function(){},
			buttonTwoOnClick: function(){},
		}
	},
	render: function() {
		var goodblockData = this.props.goodblockData;
		var text = this.props.text;
		var bubbleElemKey = 'speech-bubble-' + this.props.bubbleSize;
		var baseStyle = {
			fontFamily: universalStyle.fontFamily,
			fontSize: '12px !important',
			lineHeight: '100% !important',
			background: '#000 !important',
			color: '#FFF !important',
			height: 24,
			width: 70,
			right: -61,
			position: 'absolute  !important',
			bottom: '9px !important',
			textAlign: 'center !important',
			boxSizing: 'content-box !important',
			cursor: 'default !important',
		};
		var sizingStyle;
		switch (this.props.bubbleSize) {
			case 'small':
				sizingStyle = {
					height: 24,
					width: 70,
					right: -61,
					padding: '10px !important',
				};
				break;
			case 'small-small-medium':
				sizingStyle = {
					height: 44,
					width: 108,
					right: -90,
					padding: '6px !important',
				};
				break;
			case 'small-medium':
				sizingStyle = {
					height: 60,
					width: 120,
					right: -90,
					padding: '2px !important',
				};
				break;
			case 'medium':
				sizingStyle = {
					height: 70,
					width: 150,
					right: -120,
					padding: '2px !important',
				};
				break;
		}
		var style = Object.assign({}, baseStyle, sizingStyle);

		// Button style.
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

		var buttons;
		switch (this.props.type) {
			case 'two-button':
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
			case 'text':
				break;
			default:
				break;
		}

		return (
			<div
				key={bubbleElemKey}
				style={style}
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
