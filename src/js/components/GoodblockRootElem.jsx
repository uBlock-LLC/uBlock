
var React = require('react/addons');
var GoodblockDataStore = require('../stores/GoodblockDataStore.jsx');
var GoodblockDataActions = require('../actions/GoodblockDataActions.jsx');
var universalStyle = require('./universalStyle.jsx');
var GoodblockIconHolder = require('./GoodblockIconHolder.jsx');
var AdContainer = require('./AdContainer.jsx');
var AdDimmer = require('./AdDimmer.jsx');
var AdCloseButton = require('./AdCloseButton.jsx');
var TimeoutTransitionGroup = require('./TimeoutTransitionGroup.jsx');

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
		};

		// Set up the ad-related elements.
		var adContainer;
		var adDimmer;
		var adCloseButton;
		if (goodblockData.uiState.isClicked) {
			var adContainer = (
				<AdContainer goodblockData={goodblockData} />
			);
			var adDimmer = (
				<AdDimmer goodblockData={goodblockData} />
			);
			var adCloseButton = (
				<AdCloseButton />
			);
		}
		console.log('goodblockData.uiState.isClicked', goodblockData.uiState.isClicked)
		return (
			<div
				id={id}
				style={style}
				dataGoodblockElem='true'>
					<GoodblockIconHolder goodblockData={goodblockData} />
					<TimeoutTransitionGroup
						transitionName='ad-dimmer'
						enterTimeout={700}
						leaveTimeout={700}
						transitionEnter={true}
						transitionLeave={true}>
							{adCloseButton}
					</TimeoutTransitionGroup>
					<TimeoutTransitionGroup
						transitionName='ad'
						enterTimeout={700}
						leaveTimeout={700}
						transitionEnter={true}
						transitionLeave={true}>
							{adContainer}
					</TimeoutTransitionGroup>
					<TimeoutTransitionGroup
						transitionName='ad-dimmer'
						enterTimeout={700}
						leaveTimeout={700}
						transitionEnter={true}
						transitionLeave={true}>
							{adDimmer}
					</TimeoutTransitionGroup>
			</div>
		);
	}
});

module.exports = GoodblockRootElem;
