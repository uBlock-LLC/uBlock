
var React = require('react/addons');
var GoodblockDataStore = require('../stores/GoodblockDataStore.jsx');
var GoodblockDataActions = require('../actions/GoodblockDataActions.jsx');
var universalStyle = require('./universalStyle.jsx');
var GoodblockIconHolder = require('./GoodblockIconHolder.jsx');
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
		var isVisible = (
			isNonemptyObject(goodblockData.uiState) ? 
			goodblockData.uiState.isVisible : false
		);
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

module.exports = GoodblockRootElem;
