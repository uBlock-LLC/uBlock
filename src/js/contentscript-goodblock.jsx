console.log('Goodblock content script.');

/******************************************************************************/
/******************************************************************************/

// Data stores.

var ee = new EventEmitter();
// Default Goodblock data.
var _goodblockData = {
	isVisible: false
};

var goodblockDataStore = {
    get: function() {
        return _goodblockData;
    },
    set: function(newData) {
    	_goodblockData = newData;
    	this.emitChange();
    },
    emitChange: function() {
    	console.log('Changed goodblockData:', _goodblockData);
        ee.emitEvent('goodblockDataChange');
    },
    addChangeListener: function(callback) {
        ee.addListener('goodblockDataChange', callback);
    },
    removeChangeListener: function(callback) {
        ee.removeListener('goodblockDataChange', callback);
    },

};

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
			goodblockData: goodblockDataStore.get(),
			isClicked: false,
		}
	},
	_onGoodblockDataChange: function() {
		var updatedData = goodblockDataStore.get();
        this.setState({goodblockData: updatedData});
	},
	componentDidMount: function() {
		goodblockDataStore.addChangeListener(this._onGoodblockDataChange);
	},
	componentWillUnmount: function() {
		goodblockDataStore.removeChangeListener(this._onGoodblockDataChange);
	},
	onClick: function() {
		this.setState({'isClicked': !this.state.isClicked});
	},
	shouldRender: function() {
		var goodblockData = this.state.goodblockData;
		return (goodblockData && goodblockData['imgUrls']);
	},
	render: function() {
		var goodblockData = this.state.goodblockData;
		// If missing any data, return an empty div.
		if (!this.shouldRender()) {
			return <div></div>;
		}
		// TODO: Make Goodblock visibility work better on Chrome.
		// React and CSS3 transitions don't work well on background tabs
		// in the browser, so this element doesn't actually transition
		// to being invisible.
		var isVisible = goodblockData.isVisible;
		var id = 'goodblock-base-elem';
		var textColor = '#000';
		var backgroundColor = '#E2E2E2';
		if (this.state.isClicked) {
			textColor = '#FFF';
			backgroundColor = '#000';
		}
		var transition = 'opacity 1.5s ease 1s';
		var opacity;
		if (isVisible) {
			// var left = '10px';
			opacity = 1;
		}
		else {
			// var left = '-1000px';
			opacity = 0;
		}
		var style = {
			position: 'fixed',
			bottom: '10px',
			// left: left,
			opacity: opacity,
			width: '100px',
			height: '100px',
			display: 'block',
			zIndex: '10000000',
			color: textColor,
			backgroundColor: backgroundColor,
			padding: '10px',
			transition: transition,
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

// Set up the React app.

var reactBaseElemId = 'goodblock-react-base';

// Create the Goodblock app base element and return it.
var createBaseElem = function() {
	var reactBaseElem = document.createElement('div');
	reactBaseElem.id = reactBaseElemId;
	reactBaseElem.dataset.goodblockInitialized = 'true';
	document.body.appendChild(reactBaseElem);
	return reactBaseElem;
}

// Update the Goodblock app elements, creating them if they don't exist.
var initGoodblock = function() {
	var baseElem = document.querySelector('#' + reactBaseElemId);
	// If our app base element doesn't exist, let's create it.
	if (!baseElem) {
		baseElem = createBaseElem();
	}
	React.render(<GoodblockRootElem />, baseElem);
}

initGoodblock();

/******************************************************************************/
/******************************************************************************/

// Listen for messages from extension.

localMessager.listener = function(request) {
	// console.log('Message sent to contentscript-goodblock.js', request);
	switch (request.what) {
		// Listen for Goodblock data.
		case 'goodblockData':	
			goodblockDataStore.set(request.data);
			break;
		default:
			console.log('Unhandled message sent to contentscript-goodblock.js:', request);
			return;
	}
};

/******************************************************************************/
/******************************************************************************/

// Fetch Goodblock data at first load.

var goodblockDataHandler = function(data) {
	goodblockDataStore.set(data);
};

localMessager.send(
  {
    what: 'retrieveGoodblockData'
  },
  goodblockDataHandler
);

/******************************************************************************/
/******************************************************************************/

