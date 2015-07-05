console.log('Goodblock content script.');

/******************************************************************************/
/******************************************************************************/

// Data stores.

var ee = new EventEmitter();
// Initial Goodblockstate.
var _goodblockData = {
	imgUrls: {}, // We fetch these from the extension on load.
	uiState: {
		isClicked: false,
		isHovering: false,
		isVisible: true,
		snooze: {
			isHovering: false,
			isClicked: false,
		}
	}
};

// Source-of-truth state for Goodblock on this page.
var goodblockDataStore = {
    get: function() {
        return _goodblockData;
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

// Actions used to update the Goodblock state.
var goodblockDataActions = {
	iconClick: function(isClicked) {
		_goodblockData.uiState.isClicked = isClicked;
		goodblockDataStore.emitChange();
	},
	iconHover: function(isHovering) {
		_goodblockData.uiState.isHovering = isHovering;
		goodblockDataStore.emitChange();
	},
	setImgUrls: function(imgUrls) {
		_goodblockData.imgUrls = imgUrls;
		goodblockDataStore.emitChange();
	},
	changeVisibility: function(isVisible) {
		_goodblockData.uiState.isVisible = isVisible;
		goodblockDataStore.emitChange();
	},
	snoozeHover: function(isHovering) {
		_goodblockData.uiState.snooze.isHovering = isHovering;
		goodblockDataStore.emitChange();
	},
	snoozeClick: function(isClicked) {
		_goodblockData.uiState.snooze.isClicked = isClicked;
		goodblockDataStore.emitChange();
	},
}

/******************************************************************************/
/******************************************************************************/

// Our React app code.

var ReactCSSTransitionGroup = React.addons.CSSTransitionGroup;

var universalStyle = {
	'fontFamily': "'Helvetica Neue', Roboto, 'Segoe UI', Calibri, sans-serif",
}

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
				style={imgStyle} />
		);
	}
});

var SpeechBubble = React.createClass({
	onClick: function(event) {
		event.stopPropagation();
	},
	render: function() {
		var goodblockData = this.props.goodblockData;
		var text = this.props.text;
		var speechBubbleHeight = 24;
		var speechBubbleWidth = 70;
		var style = {
			fontFamily: universalStyle.fontFamily,
			fontSize: 12,
			color: '#757575',
			height: speechBubbleHeight,
			width: speechBubbleWidth,
			position: 'absolute',
			bottom: 9,
			right: (-speechBubbleWidth) * 0.87,
			textAlign: 'center',
			boxSizing: 'content-box',
			cursor: 'default',
		};
		return (
			<div style={style} className='speech-bubble' onClick={this.onClick}>
				{text}
			</div>
		);
	}
});

var SnoozeButton = React.createClass({
	onClick: function(event) {
		event.stopPropagation();
		var goodblockData = this.props.goodblockData;
		goodblockDataActions.snoozeClick(!goodblockData.uiState.snooze.isClicked);
	},
	changeHoverState: function(isHovering) {
		goodblockDataActions.snoozeHover(isHovering);
	},
	onMouseEnter: function(event) {		
		this.changeHoverState(true);
	},
	onMouseLeave: function(event) {
		this.changeHoverState(false);
	},
	render: function() {
		var goodblockData = this.props.goodblockData;
		var bubbleBackground = 'rgba(255, 255, 255, 0.62)';
		var bubbleBoxShadow = 'rgba(0,0,0,0.2) 3px 3px 8px';
		var bubbleTransition = 'background 0.3s, color 0.3s';
		var textColor = '#949494';
		if (goodblockData.uiState.snooze.isHovering) {
			var textColor = '#757575';
			var bubbleBackground = 'rgba(255, 255, 255, 1)';
		}
		var parentWidth = 70;
		var parentHeight = 65;
		var parentStyle = {
			position: 'absolute',
			width: parentWidth,
			height: parentHeight,
			top: (-parentHeight) * 0.6,
			right: (-parentWidth) * 0.76,
			zIndex: '-1',
			cursor: 'default',
    		fontFamily: universalStyle.fontFamily,
    		// Radius to limit the mouse events to around
    		// the visible area of the thought bubble.
		    borderBottomRightRadius: '100%',
		    borderTopLeftRadius: '90%',
		    borderTopRightRadius: '30%',

		};
		var smallBubbleStyle = {
			background: bubbleBackground,
			boxShadow: bubbleBoxShadow,
			transition: bubbleTransition,
			position: 'absolute',
			borderRadius: '50%',
			width: 4,
			height: 4,
			left: 12,
			bottom: 18,
		};
		var mediumBubbleStyle = {
			background: bubbleBackground,
			boxShadow: bubbleBoxShadow,
			transition: bubbleTransition,
			position: 'absolute',
			borderRadius: '50%',
			width: 12,
			height: 12,
			left: 15,
			bottom: 24,
		};
		var bigBubbleHeight = 30;
		var bigBubbleStyle = {
			height: bigBubbleHeight,
			background: bubbleBackground,
			boxShadow: bubbleBoxShadow,
			transition: bubbleTransition,
			position: 'absolute',
			borderRadius: '50%',
			width: 40,
			left: 24,
			bottom: 30,
			fontSize: 11,
			textAlign: 'center',
			color: textColor,
		};
		var bubbleTextStyle = {
			marginTop: bigBubbleHeight * 0.3,
		};
		return (
			<div
				style={parentStyle}
				onClick={this.onClick}
				onMouseEnter={this.onMouseEnter}
				onMouseLeave={this.onMouseLeave} >
				<div style={smallBubbleStyle} />
				<div style={mediumBubbleStyle} />
				<div style={bigBubbleStyle}>
					<div style={bubbleTextStyle}>zzz...</div>
				</div>
			</div>
		);
	}
});

var GoodblockIconHolder = React.createClass({
	onClick: function() {
		var goodblockData = this.props.goodblockData;
		goodblockDataActions.iconClick(!goodblockData.uiState.isClicked);
	},
	changeHoverState: function(isHovering) {
		goodblockDataActions.iconHover(isHovering);
	},
	onMouseEnter: function(event) {		
		this.changeHoverState(true);
	},
	onMouseLeave: function(event) {
		this.changeHoverState(false);
	},
	render: function() {
		var goodblockData = this.props.goodblockData;
		// TODO: Make Goodblock visibility work better on Chrome.
		// React and CSS3 transitions don't work well on background tabs
		// in the browser, so this element doesn't actually transition
		// to being invisible.
		var isVisible = goodblockData.uiState.isVisible;
		var textColor = '#000';
		var backgroundColor = 'rgba(0, 0, 0, 0.06)';

		// Set up the snooze button and/or snooze text.
		var snoozeButton;
		var speechBubble;
		if (goodblockData.uiState.snooze.isClicked) {
			var text = "Ok, I'll come back later!";
			var speechBubble = (
				<SpeechBubble key='snooze-speech-bubble' goodblockData={goodblockData} text={text} />
			);
		}
		else if (goodblockData.uiState.isHovering) {
			backgroundColor = 'rgba(0, 0, 0, 0.12)';
			snoozeButton = (
				<SnoozeButton key='snooze-button' goodblockData={goodblockData} />
			);
		}

		// Style of the main icon.
		if (goodblockData.uiState.isClicked) {
			textColor = '#FFF';
			backgroundColor = '#000';
		}
		var style = {
			color: textColor,
			backgroundColor: backgroundColor,
			transition: 'background-color 0.3s',
			left: 10,
			bottom: 30,
			width: 26,
			height: 26,
			padding: 6,
			display: 'block',
			zIndex: '10000001',
			position: 'fixed',
			borderRadius: '50%',
			boxSizing: 'content-box',
		};
		var goodblockIcon;
		if (isVisible) {
			goodblockIcon = (
				<div
					key='goodblock-icon-holder'
					style={style}
					onClick={this.onClick}
					onMouseEnter={this.onMouseEnter}
					onMouseLeave={this.onMouseLeave} >
					<GoodblockIcon goodblockData={goodblockData} />
						<ReactCSSTransitionGroup
							transitionName='snooze'
							transitionAppear={true}
							transitionLeave={true}>
								{snoozeButton}
								{speechBubble}
						</ReactCSSTransitionGroup>
				</div>
			);
		}
		var SHOULD_ANIMATE_ICON = true;
		return (
			<ReactCSSTransitionGroup
				transitionName='goodblock-icon'
				transitionAppear={SHOULD_ANIMATE_ICON}
				transitionEnter={SHOULD_ANIMATE_ICON}
				transitionLeave={SHOULD_ANIMATE_ICON} >
				{goodblockIcon}
			</ReactCSSTransitionGroup>
		);
	}
});

var GoodblockRootElem = React.createClass({
	getInitialState: function() {
		return {
			goodblockData: goodblockDataStore.get(),
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
	shouldRender: function() {
		function isNonemptyObject(obj) {
            return (Object.keys(obj).length);
        }
		var goodblockData = this.state.goodblockData;
		return (
			goodblockData &&
			goodblockData.imgUrls &&
			isNonemptyObject(goodblockData.imgUrls) &&
			goodblockData.uiState &&
			isNonemptyObject(goodblockData.uiState)
		);
	},
	render: function() {
		var goodblockData = this.state.goodblockData;
		// If missing any data, return an empty div.
		if (!this.shouldRender()) {
			return <div></div>;
		}
		var id = 'goodblock-base-elem';
		var style = {
			lineHeight: '100%',
			boxSizing: 'content-box',
			fontSize: 12,
			wordSpacing: 'normal',
		}
		return (
			<div
				id={id}
				style={style}
				dataGoodblockElem='true'>
					<GoodblockIconHolder goodblockData={goodblockData} />
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

// Listen for messages from the extension.

localMessager.listener = function(request) {
	// console.log('Message sent to contentscript-goodblock.js', request);
	switch (request.what) {
		// Listen for Goodblock data.
		case 'goodblockVisibility':
			goodblockDataActions.changeVisibility(request.data.isVisible);
			break;
		default:
			console.log('Unhandled message sent to contentscript-goodblock.js:', request);
			return;
	}
};

/******************************************************************************/
/******************************************************************************/

// On load, fetch any Goodblock data we need from the extension.

var goodblockImgUrlHandler = function(imgUrlData) {
	goodblockDataActions.setImgUrls(imgUrlData);
};

localMessager.send(
  {
    what: 'retrieveGoodblockImgUrls'
  },
  goodblockImgUrlHandler
);

/******************************************************************************/
/******************************************************************************/

