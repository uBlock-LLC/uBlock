
var React = require('react/addons');

var AdContainer = React.createClass({
	render: function() {
		var goodblockData = this.props.goodblockData;
		var adContainerStyle = {
			position: 'fixed',
			top: 0,
			left: 0,
			width: '100%',
			height: '100%',
			background: '#FDCA60',
			zIndex: 2147483646, // Max on some browsers, minus one
		};

		return (
			<div style={adContainerStyle}>

			</div>
		);
	}
});

module.exports = AdContainer;
