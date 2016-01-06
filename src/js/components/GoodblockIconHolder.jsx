
var React = require('react/addons');
var GoodblockDataActions = require('../actions/GoodblockDataActions.jsx');
var GoodblockIcon = require('./GoodblockIcon.jsx');
var SnoozeButton = require('./SnoozeButton.jsx');
var SpeechBubble = require('./SpeechBubble.jsx');


// This module is a replacement for React's CSSTransitionGroup,
// which is buggy when run background tabs.
// See https://github.com/facebook/react/issues/1326
var TimeoutTransitionGroup = require('./TimeoutTransitionGroup.jsx');

var SECONDS_TO_DELAY_ICON_APPEARANCE = 4;


var GoodblockIconHolder = React.createClass({
	getInitialState: function() {
		return {
			mountIcon: false,
		}
	},
	hideGoodblockForContentTest: function() {
		GoodblockDataActions.hideGoodblockForContentTest();
	},
	// When users click "no", choosing to not support a site.
	doNotSupportClick: function() {
		GoodblockDataActions.changeContentSupportDidNotSupport(true);

		// Log event
		var pageUrl = window.location.href;
		var objUrl = this.props.goodblockData.uiState.tests.contentSupport.logObjUrl;
		GoodblockDataActions.logContentNotSupported(pageUrl, objUrl);

		// Hide the Goodblock icon.
		this.hideGoodblockForContentTest();
	},
	// When users click "no", choosing to not support a site, after trying
	// to donate Hearts.
	doNotSupportClickHeart: function() {
		GoodblockDataActions.changeContentSupportDidNotSupport(true);

		// Hide the Goodblock icon.
		this.hideGoodblockForContentTest();

	},
	openAd: function() {
		console.log('Opening ad.');
		var hostname = window.location.hostname;
		var adUrl = 'https://goodblock.gladly.io/app/ad/?type=content&site=' + hostname;
		window.open(adUrl, '_blank');
		GoodblockDataActions.changeContentSupportOpenedAd(true);

		// Log event
		var pageUrl = window.location.href;
		var objUrl = this.props.goodblockData.uiState.tests.contentSupport.logObjUrl;
		GoodblockDataActions.logContentSupportedWithAd(pageUrl, objUrl);

		// Hide the Goodblock icon.
		this.hideGoodblockForContentTest();
	},
	giveHeartsToSite: function() {

		// Log event
		var pageUrl = window.location.href;
		var objUrl = this.props.goodblockData.uiState.tests.contentSupport.logObjUrl;
		GoodblockDataActions.logContentSupportedWithHearts(pageUrl, objUrl);

		var userProfile = this.props.goodblockData.userProfile;
		var vcAmountToGive = 25;
		if (userProfile.vc >= vcAmountToGive) {
			GoodblockDataActions.changeContentSupportGaveHearts(true);
			this.hideGoodblockForContentTest();
		} else {
			GoodblockDataActions.changeContentSupportInsufficientHearts(true);
		}
	},
	// Logic on when to show Goodblock for content support test.
	showGoodblockForContentSupport: function() {

		var self = this;

		setTimeout(function() {
			var shouldShow = self.shouldShowContentSupport();
			if (!shouldShow) {
				return;
			}

			// Show the Goodblock icon.
			GoodblockDataActions.changeVisibility(true);

			// Log the Goodblock icon appearance.
			GoodblockDataActions.logContentSupportRequest();

		}, 30 * 1000);
	},
	isPageBlacklisted: function() {
		var goodblockData = this.props.goodblockData;
		var domainBlacklist = goodblockData.testData.contentSupport.domainBlacklist;
		var hostname = window.location.hostname;
		return (domainBlacklist.indexOf(hostname) > -1);
	},
	hostnameFromURI: function(uri) {
		var getLocation = function(href) {
		    var l = document.createElement("a");
		    l.href = href;
		    return l;
		};
		var l = getLocation(uri);
		return l.hostname;
	},
	shouldShowContentSupport: function() {
		if (this.isPageBlacklisted()) {
			return false;
		}

		// See if the user recently responded to a support content
		// request on this domain.
		var goodblockData = this.props.goodblockData;
		var contentSupportHistory = goodblockData.testData.contentSupport.contentSupportHistory;

		var currentHostname = window.location.hostname;

		var SECONDS_WAIT_AFTER_SITE_SUPPORTED = 60 * 60 * 12; // 12 hours
		var SECONDS_WAIT_AFTER_SITE_NOT_SUPPORTED = 60 * 60 * 24 * 5; // 5 days
		var shouldShow = true;
		for (var i = 0; i < contentSupportHistory.length; i++) {
			var item = contentSupportHistory[i];

			var itemHostname;
			if (!item.domain || item.domain === '') {
				continue;
			} else {
				itemHostname = this.hostnameFromURI(item.domain);
			}

			if (itemHostname === currentHostname) {
				// See if the content support response was recent.
				var timeResponded = new Date(item.datetime);
				var now = new Date();
				var dateDiffInSecs = (now - timeResponded) / 1000;

				// If the user supported the site, wait less time to
				// ask again.
				var waitTimeInSecs;
				if (item.supported) {
					waitTimeInSecs = SECONDS_WAIT_AFTER_SITE_SUPPORTED;
				} else {
					waitTimeInSecs = SECONDS_WAIT_AFTER_SITE_NOT_SUPPORTED;
				}
				if (dateDiffInSecs < waitTimeInSecs) {
					shouldShow = false;
					break;
				}
			}
		}
		return shouldShow;
	},
	handleTestCases: function() {
		var goodblockData = this.props.goodblockData;

		// If the user is in the content support test group, let's
		// control when Goodblock will appear. If not, return.
		var userIsContentSupportTester = goodblockData.testData.contentSupport.isTestUser;
		if (!userIsContentSupportTester) {
			return;
		}

		var currentPageBlacklisted = this.isPageBlacklisted();
		if(!currentPageBlacklisted) {
			this.showGoodblockForContentSupport();
		} else {
			GoodblockDataActions.changeVisibility(false);
		}
	},
	componentDidMount: function() {
		this.handleTestCases();
	},
	setIconToMount: function() {
		// Delay the mounting so we can give the web page time to load
		// before the Goodblock icon slides in.
		var self = this;
		setTimeout(function() {
			self.setState({
				mountIcon: true,
			});
		}, SECONDS_TO_DELAY_ICON_APPEARANCE * 1000);
	},
	setIconToUnmount: function() {
		var self = this;
		setTimeout(function() {
			self.setState({
				mountIcon: false,
			});
		}, 50);
	},
	onClick: function() {
		var goodblockData = this.props.goodblockData;
		var prevClickState = goodblockData.uiState.isClicked;
		GoodblockDataActions.iconClick();
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
		var userIsContentSupportTester = goodblockData.testData.contentSupport.isTestUser;
		var contentSupportTestChannel = goodblockData.testData.contentSupport.testGroup;
		var textColor = '#000';
		var backgroundColor = 'rgba(0, 0, 0, 0.7)';

		// Set up the snooze button and/or snooze text.
		var snoozeButton;
		var speechBubble;
		if (goodblockData.uiState.snooze.isSnoozing) {
			var text = "Ok, I'll come back later!";
			speechBubble = (
				<SpeechBubble key='snooze-speech-bubble' goodblockData={goodblockData} text={text} />
			);
		}
		else if (
			goodblockData.uiState.isHovering &&
			!goodblockData.uiState.isClicked &&
			!goodblockData.uiState.goodnight.goingToBed &&
			!goodblockData.uiState.snooze.inProcessOfSnoozing &&
			// don't show the snooze button for content support testers
			!userIsContentSupportTester
		) {
			backgroundColor = 'rgba(0, 0, 0, 0.9)';
			snoozeButton = (
				<SnoozeButton key='snooze-button' goodblockData={goodblockData} />
			);
		}

		// Say goodbye to the user after they view an ad.
		if (goodblockData.uiState.goodnight.sayingGoodnight) {
			var text = 'Thanks! See you later!';
			speechBubble = (
				<SpeechBubble
					key='goodnight-speech-bubble'
					goodblockData={goodblockData}
					text={text} />
			);
		}

		// Show speech bubble for supporting content test.
		if (userIsContentSupportTester) {
			var text;
			var speechBubbleType = 'text';
			var speechBubbleSize = 'small';
			var buttonOneOnClick;
			var buttonTwoOnClick;
			// var buttonTwoUrl;
			switch (contentSupportTestChannel) {
				case 1:
					if (goodblockData.uiState.tests.contentSupport.didNotSupport) {
						// User chose not to support the site
						text = 'Ok, no worries. See you later!';
						speechBubbleType = 'text';
						speechBubbleSize = 'small-small-medium';
					} else {
						// Introductory speech bubble
						text = 'Like this site? View an ad to support it!'
						speechBubbleType = 'two-button';
						speechBubbleSize = 'small-medium';
						buttonOneOnClick = this.doNotSupportClick;
						buttonTwoOnClick = this.openAd;
					}
					break;
				case 2:
					if (goodblockData.uiState.tests.contentSupport.gaveHearts) {
						// User gave Hearts
						text = 'Great! You just gave 25 Hearts. Thanks!';
						speechBubbleType = 'text';
						speechBubbleSize = 'small-small-medium';
					} else if (goodblockData.uiState.tests.contentSupport.didNotSupport) {
						// User chose not to support the site
						text = 'Ok, no worries. See you later!';
						speechBubbleType = 'text';
						speechBubbleSize = 'small-small-medium';

					} else if (goodblockData.uiState.tests.contentSupport.insufficientHearts) {
						// User does not have enough Hearts to give
						text = 'Aw, you don’t have enough Hearts. Want to see an ad now to get more?';
						speechBubbleType = 'two-button';
						speechBubbleSize = 'medium';
						buttonOneOnClick = this.doNotSupportClickHeart;
						buttonTwoOnClick = this.openAd;

					} else {
						// Introductory speech bubble
						text = 'Like this site? Give it 25 Hearts!';
						speechBubbleType = 'two-button';
						speechBubbleSize = 'small-medium';
						buttonOneOnClick = this.doNotSupportClick;
						buttonTwoOnClick = this.giveHeartsToSite;
					}

					break;
				default:
					break;
			}

			// Don't show the speech bubble if the icon is leaving.
			if (!goodblockData.uiState.tests.contentSupport.inProcessOfHiding) {
				speechBubble = (
					<SpeechBubble
						key='content-test-speech-bubble'
						goodblockData={goodblockData}
						type={speechBubbleType}
						bubbleSize={speechBubbleSize}
						buttonOneOnClick={buttonOneOnClick}
						buttonTwoOnClick={buttonTwoOnClick}
						text={text} />
				);
			}
		}

		// Style of the main icon.
		if (goodblockData.uiState.isClicked) {
			backgroundColor = 'rgba(0, 0, 0, 0.9) !important';
		}
		var style = {
			color: textColor,
			backgroundColor: backgroundColor,
			transition: 'background-color 0.3s',
			left: '10px !important',
			bottom: '30px !important',
			width: '26px !important',
			height: '26px !important',
			padding: '6px !important',
			display: 'block',
			zIndex: '2147483647 !important', // Max on some browsers,
			position: 'fixed !important',
			borderRadius: '50% !important',
			boxSizing: 'content-box !important',
			cursor: 'pointer !important',
		};
		var goodblockIcon;

		// If the Goodblock icon should be visible but isn't,
		// set the icon to mount after a delay.
		if (isVisible && !this.state.mountIcon) {
			this.setIconToMount();
		}

		// If the Goodblock icon should be hidden but isn't,
		// hide it.
		if (!isVisible && this.state.mountIcon) {
			this.setIconToUnmount();
		}

		if (this.state.mountIcon) {
			goodblockIcon = (
				<div
					key='goodblock-icon-holder'
					style={style}
					onClick={this.onClick}
					onMouseEnter={this.onMouseEnter}
					onMouseLeave={this.onMouseLeave}
					data-goodblock-elem='icon' >
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
				appearTimeout={1000}
				enterTimeout={1000}
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

module.exports = GoodblockIconHolder;
