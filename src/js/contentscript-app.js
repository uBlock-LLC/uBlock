// Pick up the user's auth token from localstorage and provide it to
// the extension
var sendUserTokenIfExists = function() {
  var TOKEN_LOCAL_STORAGE_KEY = 'goodblockToken';
  var token = localStorage.getItem(TOKEN_LOCAL_STORAGE_KEY);
  if (!token) {
    console.debug('contentscript-app.js > token not found')
    return;
  }
  if (!vAPI) {
    console.warn('contentscript-app.js > vAPI not found');
    return;
  }
  var messenger = vAPI.messaging.channel('contentscript-app.js');
  messenger.send({
    what: 'setUserAuthToken',
    token: token,
  });
}

// Init communication with the Goodblock web app
var initApp = function() {
  sendUserTokenIfExists();
}

initApp();
