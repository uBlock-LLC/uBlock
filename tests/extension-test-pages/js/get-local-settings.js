var $localSettingsElem = $('.local-settings-list');
var localSettings = µBlock.localSettings;
// console.log('localSettings = ', localSettings);
$.each(localSettings, function(key, val) {
	// console.log(key, val);
	var $li = $('<li>')
		.html('key: ' + key + ', value: ' + val)
		.attr('data-key', key)
		.attr('data-value', val);
	$localSettingsElem.append($li);
});
