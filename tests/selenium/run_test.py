from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
import time
import unittest

class AdTagTestCase(unittest.TestCase):
    def setUp(self):
        chrome_options = Options()
        dist_path = './dist/build/uBlock.chromium'
        chrome_options.add_argument('load-extension=%s' % dist_path)
        self.driver = webdriver.Chrome(chrome_options=chrome_options)

    def tearDown(self):
        self.driver.close()

    def test_ad_placement(self):
        self.driver.get('chrome://extensions')
        time.sleep(1)
        # Switch to the extensions iframe and ensure that we're installed
        self.driver.switch_to.frame(self.driver.find_element_by_name("extensions"))
        self.driver.find_element_by_xpath('//span[text()="uBlock"]')

        # Now load up the test page and wait for it to load
        self.driver.get('localhost:8000/icon-placement.html')
        wait = WebDriverWait(self.driver, 2)
        wait.until(
            EC.presence_of_element_located((By.CLASS_NAME, 'page-title'))
        )

        # Do the following for each ad placement
        banner1 = self.driver.find_element_by_css_selector('[data-test="banner1"]')
        banner1_tad = banner1.find_element_by_xpath('.//div/div/img')
        size = banner1_tad.size
        loc = banner1_tad.location
        assert size['height'] == 20
        assert size['width'] == 21
        assert loc['y'] == 84
        assert loc['x'] == 265
