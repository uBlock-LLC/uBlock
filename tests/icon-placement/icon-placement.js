var adClass = 'google_ads';
var adText = 'This is an ad.';
var iframeContentSrc = 'iframe-banner.html';
var adLoadDelay = 2000;

function createBannerAdDiv() {
	var ad = $('<div/>').addClass(adClass + ' banner advertisement item');
	ad.text(adText);
	return ad;
}

function createBannerAdIframe() {
	var ad = $('<iframe/>').addClass(adClass + ' banner advertisement iframe item');
	ad.attr('src', iframeContentSrc);
	return ad;
}

function testE() {
	setTimeout(function() {
		var ad = createBannerAdDiv();
		$('.test-e').append(ad);
	}, adLoadDelay);
}

function testF() {
	setTimeout(function() {
		var ad = createBannerAdIframe();
		$('.test-f').append(ad);
	}, adLoadDelay);
}

function testG() {
	setTimeout(function() {
		var ad = createBannerAdIframe();
		var adParent = $('<div/>').addClass('container');
		adParent.append(ad);
		$('.test-g').append(adParent);
	}, adLoadDelay);
}

// Run all the tests.
testE();
testF();
testG();