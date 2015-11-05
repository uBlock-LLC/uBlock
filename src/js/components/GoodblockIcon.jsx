
var React = require('react/addons');


var GoodblockIcon = React.createClass({
	render: function() {
		var goodblockData = this.props.goodblockData;
		var goodblockIconUrl = goodblockData['imgUrls']['goodblockIcon60'];
		var imgSrc = goodblockIconUrl;
		var imgStyle = {
			width: '26px !important',
			height: '26px !important',
		    maxWidth: 'none !important',
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
