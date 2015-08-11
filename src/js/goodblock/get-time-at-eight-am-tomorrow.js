var getTimeAtEightAmTomorrow = function() {
    var isLastDayofYear = function(d,m) {
        return (d == 31 && m == 11)
    }
    var isLastDayofMonth = function(d,m) {
        var shortMonths = [3, 5, 8, 10];
        if (m == 1) {
            return (d == 28);
        } else if (shortMonths.indexOf(m) != -1) {
            return (d == 30);
        } else {
            return (d == 31);
        }
    }

    var now = new Date();
    var h = now.getHours();
    var d = now.getDate();
    var m = now.getMonth();
    var y = now.getFullYear();

    var yT;
    var mT;
    var dT;
    if (isLastDayofYear(d,m)) {
        yT = int(y) + 1;
        mT = 1;
        dT = 1;
    } else {
        dT = isLastDayofMonth(d, m) ? 1 : d+1;
        mT = isLastDayofMonth(d, m) ? m+1 : m;
        yT = y;
    }

    var eightAmTomorrow = new Date(yT, mT, dT, 8);
    return eightAmTomorrow.getTime();
}

module.exports = getTimeAtEightAmTomorrow;
