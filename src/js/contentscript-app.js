
var tokenPoller;

// Pick up the user's auth token from localstorage.
var getToken = function() {
  var TOKEN_LOCAL_STORAGE_KEY = 'goodblockToken';
  var token = localStorage.getItem(TOKEN_LOCAL_STORAGE_KEY);
  return token;
};

// Send token to the extension.
var sendUserToken = function(token) {
  if (!token) {
    console.debug('contentscript-app.js > token not found')
    return;
  }
  if (!vAPI) {
    console.warn('contentscript-app.js > vAPI not found');
    return;
  }
  var messenger = vAPI.messaging;
    messenger.send(
    'contentscript-app.js',
    {
      what: 'setUserAuthToken',
      token: token,
    });

  // Clear the poller.
  window.clearInterval(tokenPoller);
};

// The token may be set without a page reload.
var pollForToken = function() {
  tokenPoller = setInterval(function() {
    var token = getToken();
    if (token) {
      sendUserToken(token);
    }
  }, 100);
};

// Init communication with the Goodblock web app
var initApp = function() {
  var token = getToken();
  if (token) {
    sendUserToken(token);
  } else {
    pollForToken();
  }
};

initApp();
