console.log('Goodblock content script.');

/******************************************************************************/
/******************************************************************************/

// Our React app code.

var GoodblockIcon = React.createClass({
	render: function() {
		var goodblockData = this.props.goodblockData;
		var goodblockIconUrl = goodblockData['imgUrls']['goodblockIcon60'];
		var imgSrc = goodblockIconUrl;
		var imgStyle = {

		};
		return (
			<img
				src={imgSrc}
				style={imgStyle} />
		);
	}
});

var GoodblockRootElem = React.createClass({
	getInitialState: function() {
		return {
			isClicked: false,
		}
	},
	onClick: function() {
		this.setState({'isClicked': !this.state.isClicked});
	},
	render: function() {
		var goodblockData = this.props.goodblockData;
		var id = 'goodblockBaseElem';
		var textColor = '#000';
		var backgroundColor = '#E2E2E2';
		if (this.state.isClicked) {
			textColor = '#FFF';
			backgroundColor = '#000';
		}
		var style = {
			position: 'fixed',
			bottom: '10px',
			left: '10px',
			width: '100px',
			height: '100px',
			display: 'block',
			zIndex: '10000000',
			color: textColor,
			backgroundColor: backgroundColor,
			padding: '10px',
		};
		return (
			<div
				id={id}
				style={style}
				onMouseDown={this.onClick}
				dataGoodblockElem='true'>
					<GoodblockIcon goodblockData={goodblockData} />
			</div>
		);
	}
});

/******************************************************************************/
/******************************************************************************/

// Set up messaging to the extension.
var localMessager = vAPI.messaging.channel('contentscript-goodblock.js');

/******************************************************************************/
/******************************************************************************/

// Create the Goodblock app elements.
var setUpGoodblock = function(goodblockData) {
	var reactBaseElem = document.createElement('div');
	var reactBaseElemId = 'goodblock-react-base';
	reactBaseElem.id = reactBaseElemId;
	reactBaseElem.dataset.goodblockInitialized = 'true';
	document.body.appendChild(reactBaseElem);
	React.render(<GoodblockRootElem goodblockData={goodblockData} />, document.getElementById(reactBaseElemId));
}

/******************************************************************************/
/******************************************************************************/

// Listener for messages from extension.

localMessager.listener = function(request) {
	// console.log('Message sent to contentscript-goodblock.js', request);
	switch (request.what) {
		// Listen for Goodblock data.
		case 'goodblockData':
			// console.log('Goodblock data', request.data);
			// TODO: handle data updating, not just setup.
			setUpGoodblock(request.data);
		default:
			// console.log('Unhandled message sent to contentscript-goodblock.js:', request);
	}
};

/******************************************************************************/
/******************************************************************************/
