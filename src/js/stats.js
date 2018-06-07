
µBlock.stats = (function () {

    var µb = µBlock;

    var reOS = /(CrOS\ \w+|Windows\ NT|Mac\ OS\ X|Linux)\ ([\d\._]+)?/;

    var matches = reOS.exec(navigator.userAgent);

    var operatingSystem = (matches || [])[1] || "Unknown";

    var operatingSystemVersion = (matches || [])[2] || "Unknown";

    var reBW = /(MSIE|Trident|(?!Gecko.+)Firefox|(?!AppleWebKit.+Chrome.+)Safari(?!.+Edge)|(?!AppleWebKit.+)Chrome(?!.+Edge)|(?!AppleWebKit.+Chrome.+Safari.+)Edge|AppleWebKit(?!.+Chrome|.+Safari)|Gecko(?!.+Firefox))(?: |\/)([\d\.apre]+)/;

    var matches = reBW.exec(navigator.userAgent);

    var browser = (matches || [])[1] || "Unknown";

    var browserFlavor;
    
    if (window.opr)
        browserFlavor = "O"; // Opera
    else if (window.safari)
        browserFlavor = "S"; // Safari
    else if(browser == "Firefox")
        browserFlavor = "F"; // Firefox
    else
        browserFlavor = "E"; // Chrome

    var browserVersion = (matches || [])[2] || "Unknown";

    var browserLanguage = navigator.language.match(/^[a-z]+/i)[0];

    var storageStatsAttr = {
        userId: null,
        totalPings: 0
    };

    var exports = {};

    exports.generateUserId = function() {

        var timeSuffix = (Date.now()) % 1e8; // 8 digits from end of timestamp

        var alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';

        var result = [];

        for (var i = 0; i < 8; i++) {
            var choice = Math.floor(Math.random() * alphabet.length);

            result.push(alphabet[choice]);
        }
        return result.join('') + timeSuffix;
    }

    var ajaxCall = function(params){
        var xhr = new XMLHttpRequest();
        var url = "https://ping.ublock.org/api/stats"
        xhr.open('POST', url, true);
        xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        xhr.overrideMimeType('text/html;charset=utf-8');
        xhr.responseType = 'text';
        xhr.onreadystatechange = function() {
            if(xhr.readyState == 4 && xhr.status == 200) {
           
            }
        }
        xhr.send(JSON.stringify(params));
    }

    var getStatsEntries = function(callback) {

        if(storageStatsAttr.userId != null) {
            callback(storageStatsAttr);
            return;
        }
        var onDataReceived = function(data) {

            entries = data.stats || {userId: exports.generateUserId(),totalPings: 0 };

            storageStatsAttr = entries;

            callback(entries);
        }
        vAPI.storage.get('stats',onDataReceived);
    }

    exports.sendStats = function() {
        
        if (!µb.userSettings.allowUserStats) {
            return;
        }
        var processData = function(details) {

            details.totalPings = details.totalPings + 1;

            var statsData = {
                n: vAPI.app.name,
                v: vAPI.app.version,
                b: µb.localSettings.blockedRequestCount,
                a: µb.localSettings.allowedRequestCount,
                ad: µb.userSettings.advancedUserEnabled === true ? 1 : 0,
                df: µb.userSettings.dynamicFilteringEnabled === true ? 1 : 0,
                u: details.userId,
                f: browserFlavor,
                o: operatingSystem,
                bv: browserVersion,
                ov: operatingSystemVersion,
                l: browserLanguage
            }

            if (details.totalPings > 5000) {
                if (details.totalPings > 5000 && details.totalPings < 100000 && ((details.totalPings % 5000) !== 0)) {
                    return;
                }
                if (details.totalPings >= 100000 && ((details.totalPings % 50000) !== 0)) {
                    return;
                }
            }

            vAPI.storage.set({ 'stats': details });

            if(browser == "Chrome") {
                if (chrome.management && chrome.management.getSelf) {
                    chrome.management.getSelf(function(info) {
                        statsData["it"] = info.installType.charAt(0);
                        ajaxCall(statsData);
                    });
                }
            }
            else {
                ajaxCall(statsData);
            }
            scheduleStatsEvent();
        }
        getStatsEntries(processData);
    }

    var scheduleStatsEvent = function() {

        var delayTiming = getNextScheduleTiming(function(delayTiming){

            µBlock.asyncJobs.add(
                'sendStats',
                null,
                µBlock.stats.sendStats.bind(µBlock),
                delayTiming,
                true
            );
        });
    }
    var getNextScheduleTiming = function(callback) {

        var processData = function(details) {

            var totalPings = details.totalPings;

            var delay_hours;

            delayHours = 1;

            if (totalPings == 1)      // Ping one hour after install
                delayHours = 1;
            else if (totalPings < 9)  // Then every day for a week
                delayHours = 24;
            else                       // Then weekly forever
                delayHours = 24 * 7 ;

            var millis = 1000 * 60 * 60 * delayHours;

            callback(millis);
        }

        getStatsEntries(processData);
    }
    return exports;

})();

µBlock.stats.sendStats();
