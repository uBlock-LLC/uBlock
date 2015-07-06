
var _goodblockData = require('./goodblockData.jsx');

var ee = new EventEmitter();

// Source-of-truth state for Goodblock in the content script.
var GoodblockDataStore = {
    get: function() {
        return _goodblockData;
    },
    emitChange: function() {
    	// console.log('Changed goodblockData:', _goodblockData);
        ee.emitEvent('goodblockDataChange');
    },
    addChangeListener: function(callback) {
        ee.addListener('goodblockDataChange', callback);
    },
    removeChangeListener: function(callback) {
        ee.removeListener('goodblockDataChange', callback);
    },
};

module.exports = GoodblockDataStore;
