/*
    The below code is borrowed from:
    https://github.com/uBlockOrigin/uAssets/blob/e4702d88404dd2e7c7346d6e38b55781cdd08dc3/filters/resources.txt#L1309

    License is GPL3:
    https://github.com/gorhill/uBlock/blob/master/README.md
*/
(function() {
	var rtcName = window.RTCPeerConnection ? 'RTCPeerConnection' : (
		window.webkitRTCPeerConnection ? 'webkitRTCPeerConnection' : ''
	);
	if ( rtcName === '' ) { return; }
	var log = console.log.bind(console);
	var pc = function(cfg) {
		log('Document tried to create an RTCPeerConnection: %o', cfg);
	};
	var noop = function() {
		;
	};
	pc.prototype = {
		close: noop,
		createDataChannel: noop,
		createOffer: noop,
		setRemoteDescription: noop
	};
	var z = window[rtcName];
	window[rtcName] = pc.bind(window);
	if ( z.prototype ) {
		z.prototype.createDataChannel = function(a, b) {
			return {
				close: function() {},
				send: function() {}
			};
		}.bind(null);
	}
})();
