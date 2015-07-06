
var React = require('react/addons');

var AdDimmer = React.createClass({
	render: function() {
		var goodblockData = this.props.goodblockData;
		var adDimmerStyle = {
			position: 'fixed',
			top: 0,
			left: 0,
			width: '100%',
			height: '100%',
			background: 'rgba(0, 0, 0, 0.7)',
			zIndex: 2147483645, // Max on some browsers, minus two
		};

		return (
			<div style={adDimmerStyle}></div>
		);
	}
});

module.exports = AdDimmer;
