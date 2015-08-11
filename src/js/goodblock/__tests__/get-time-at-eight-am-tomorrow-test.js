
jest.dontMock('../get-time-at-eight-am-tomorrow');

describe('getTimeAtEightAmTomorrow', function() {
	it('matches another way of calculating the time', function() {
		// Get date at midnight.
		var d = new Date();
		d.setHours(0,0,0,0);

		var thirtyTwoHoursInMs = 32 * 60 * 60 * 1000;
		var eightAmTomorrowMs = d.getTime() + thirtyTwoHoursInMs;

		var getTimeAtEightAmTomorrow = require('../get-time-at-eight-am-tomorrow');

		expect(getTimeAtEightAmTomorrow()).toBe(eightAmTomorrowMs);
	});
});