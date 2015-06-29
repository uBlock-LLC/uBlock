function openInNewTab(url) {
  var win = window.open(url, '_blank');
  win.focus();
}
function onInstall() {
  openInNewTab('/welcome.html')
}

function onUpdate() {
  console.log("Extension Updated");
}

function getVersion() {
  var details = chrome.app.getDetails();
  return details.version;
}

// Check if the version has changed.
var currVersion = getVersion();
var prevVersion = localStorage['version']
if (currVersion != prevVersion) {
  // Check if we just installed this extension.
  if (typeof prevVersion === 'undefined') {
    onInstall();
  } else {
    onUpdate();
  }
  localStorage['version'] = currVersion;
}