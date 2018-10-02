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
