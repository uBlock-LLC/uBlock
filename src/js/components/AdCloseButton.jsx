var React = require('react/addons');
var GoodblockDataActions = require('../actions/GoodblockDataActions.jsx');

var AdCloseButton = React.createClass({
	getInitialState: function() {
		return {
			hovering: false
		}
	},
	onClick: function() {
		GoodblockDataActions.sendGoodblockToBed();
		GoodblockDataActions.iconClick(false);
	},
	onMouseEnter: function(event) {		
		this.setState({'hovering': true});
	},
	onMouseLeave: function(event) {
		this.setState({'hovering': false});
	},
	render: function() {
		var backgroundColor;
		if (this.state.hovering) {
			backgroundColor = 'rgba(0, 0, 0, 0.9)';
		} else {
			backgroundColor = 'rgba(0, 0, 0, 0.7)';
		}
		var adCloseButtonStyle = {
			position: 'fixed',
			top: 10,
			left: '95%',
			width: 15,
			height: 15,
			background: backgroundColor,
			transition: 'background-color 0.3s',
			borderRadius: '50%',
			boxSizing: 'content-box',
			padding: 8,
			color: '#FFF',
			zIndex: 2147483647, // Max on some browsers
		};
		var crossStyle = {
			width: 16,
			height: 16,
			fill: 'rgba(255, 255, 255, 0.8)',
		};

		return (
			<div 
				style={adCloseButtonStyle}
				onClick={this.onClick}
				onMouseEnter={this.onMouseEnter}
				onMouseLeave={this.onMouseLeave} >
				<svg style={crossStyle} 
					x="0px" y="0px" viewBox="0 0 512 512">
					<path d="M310.182,235.995l103.285-103.259c5.006-5.018,
					5.006-13.237,0-18.251l-54.721-54.733c-5.014-5-13.229-5-18.24,
					0l-103.281,103.28L133.944,59.752c-5.018-5-13.229-5-18.246,
					0l-54.717,54.733c-5.008,5.014-5.008,13.233,0,18.251l103.281,
					103.259L60.999,339.263c-5.018,5.014-5.018,13.232,0,
					18.25l54.717,54.738c5.018,5.001,13.229,
					5.001,18.242,0l103.268-103.285l103.264,103.285c5.018,
					5.001,13.229,5.001,18.24,0l54.721-54.738c5.014-5.018,
					5.014-13.236,0-18.25L310.182,235.995z"/>
				</svg>
			</div>
		);
	}
});

module.exports = AdCloseButton;
