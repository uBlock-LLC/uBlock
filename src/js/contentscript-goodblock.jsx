console.log('Goodblock content script.');

/******************************************************************************/
/******************************************************************************/

var React = require('react/addons');
var GoodblockDataStore = require('./stores/GoodblockDataStore.jsx');
var GoodblockDataActions = require('./actions/GoodblockDataActions.jsx');

// This module is a replacement for React's CSSTransitionGroup,
// which is buggy when run background tabs.
// See https://github.com/facebook/react/issues/1326
var TimeoutTransitionGroup = require('./components/TimeoutTransitionGroup.jsx');

/******************************************************************************/
/******************************************************************************/

// Our React app code.

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
		GoodblockDataActions.snoozeClick(true);
		this.changeHoverState(false);

		// Hide the snooze text after some time.
		setTimeout(function() {
			GoodblockDataActions.snoozeClick(false);
		}, 2000);

		// Tell the extension to snooze Goodblock
		// after some time.
		setTimeout(function() {
			snoozeGoodblock();
		}, 2100);
	},
	changeHoverState: function(isHovering) {
		GoodblockDataActions.snoozeHover(isHovering);
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
		GoodblockDataActions.iconClick(!goodblockData.uiState.isClicked);
	},
	changeHoverState: function(isHovering) {
		GoodblockDataActions.iconHover(isHovering);
	},
	onMouseEnter: function(event) {		
		this.changeHoverState(true);
	},
	onMouseLeave: function(event) {
		this.changeHoverState(false);
	},
	render: function() {
		var goodblockData = this.props.goodblockData;
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
						<TimeoutTransitionGroup
							appearTimeout={200}
							enterTimeout={200}
							leaveTimeout={150}
							transitionName='snooze'
							transitionAppear={true}
							transitionEnter={true}
							transitionLeave={true}>
								{snoozeButton}
								{speechBubble}
						</TimeoutTransitionGroup>
				</div>
			);
		}
		var SHOULD_ANIMATE_ICON = true;
		return (
			<TimeoutTransitionGroup
				appearTimeout={3000}
				enterTimeout={3000}
				leaveTimeout={500}
				transitionName='goodblock-icon'
				transitionAppear={SHOULD_ANIMATE_ICON}
				transitionEnter={SHOULD_ANIMATE_ICON}
				transitionLeave={SHOULD_ANIMATE_ICON} >
					{goodblockIcon}
			</TimeoutTransitionGroup>
		);
	}
});

var GoodblockRootElem = React.createClass({
	getInitialState: function() {
		return {
			goodblockData: GoodblockDataStore.get(),
		}
	},
	_onGoodblockDataChange: function() {
		var updatedData = GoodblockDataStore.get();
        this.setState({goodblockData: updatedData});
	},
	componentDidMount: function() {
		GoodblockDataStore.addChangeListener(this._onGoodblockDataChange);
	},
	componentWillUnmount: function() {
		GoodblockDataStore.removeChangeListener(this._onGoodblockDataChange);
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
			GoodblockDataActions.changeVisibility(request.data.isVisible);
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
	GoodblockDataActions.setImgUrls(imgUrlData);
};

localMessager.send(
  {
    what: 'retrieveGoodblockImgUrls'
  },
  goodblockImgUrlHandler
);

/******************************************************************************/
/******************************************************************************/

// Tell the extension to snooze Goodblock.

var snoozeGoodblock = function() {
	localMessager.send(
		{
			what: 'snoozeGoodblock'
		}
	);
}

/******************************************************************************/
/******************************************************************************/

