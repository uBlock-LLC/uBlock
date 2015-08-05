
var React = require('react/addons');


var GoodblockIcon = React.createClass({
	render: function() {
		var goodblockData = this.props.goodblockData;
		var goodblockIconUrl = goodblockData['imgUrls']['goodblockIcon60'];
		var imgSrc = goodblockIconUrl;
		var imgStyle = {
			width: 26,
			height: 26,
		    maxWidth: 'none',
		};
		return (
			<img
				src={imgSrc}
				style={imgStyle}
				data-goodblock-elem='icon-img' />
		);
	}
});

module.exports = GoodblockIcon;
