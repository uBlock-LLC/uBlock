# Testing Infrastructure

## Requirements

You must have the [Chrome webdriver](https://sites.google.com/a/chromium.org/chromedriver/) installed and available in your `PATH`.

There's a requirements.txt file in `tests/selenium/requirements.txt`

## Running Tests

Start an HTTP server:
```
cd tests/icon-placement
python -m SimpleHTTPServer
```

then, from the top-level directory:
```
./tools/test-chromium.sh
```
will build the plugin and run the test suite

## Resources

 - [Selenium Webdriver Docs](http://selenium-python.readthedocs.org/en/latest/getting-started.html)
 - [Expected Conditions Docs](https://selenium.googlecode.com/git/docs/api/py/webdriver_support/selenium.webdriver.support.expected_conditions.html)
 - [Locate By Options](https://selenium.googlecode.com/svn/trunk/docs/api/py/webdriver/selenium.webdriver.common.by.html)
 - [Python Unittest Docs](https://docs.python.org/2/library/unittest.html)
