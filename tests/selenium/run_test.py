from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.action_chains import ActionChains
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

    def wait_for_goodblock(self):
        # First ensure goodblock is installed
        self.driver.get('chrome://extensions')
        time.sleep(1) # The page takes a moment to init.
        # Switch to the extensions iframe and ensure that we're installed
        self.driver.switch_to.frame(self.driver.find_element_by_name("extensions"))
        self.driver.find_element_by_xpath('//span[text()="uBlock"]')

        # Then open the page and wait for Tad to show up
        self.driver.get('localhost:8000/icon-placement.html')
        wait = WebDriverWait(self.driver, 5)
        # Wait until goodblock kicks in
        wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, '[data-elephant="true"]'))
        )

    def assert_tad_placement(self, ad, tad):
        self.assertDictEqual({'width': 21, 'height': 20}, tad.size)
        offsets = {
            'x': tad.location['x'] - ad.location['x'],
            'y': tad.location['y'] - ad.location['y'],
        }
        self.assertDictEqual({'x': 0, 'y': 18}, offsets)

    def test_ad_placement(self):
        self.wait_for_goodblock()
        # Do the following for each ad placement.
        # Note the data-test identifier. It's useful to have specific identifiers for
        # test code which are not shared with selectors used by JS or CSS, but not required
        banner1 = self.driver.find_element_by_css_selector('[data-test="banner1"]')
        banner1_tad = banner1.find_element_by_xpath('.//div/div/img')
        self.assert_tad_placement(banner1, banner1_tad)

    def test_ad_hover(self):
        self.wait_for_goodblock()
        banner2 = self.driver.find_element_by_css_selector('[data-test="banner2"]')
        # xpath is the easiest way to find elements that don't have specific identifiers
        # or need to be located relative to something else. To search within an elements
        # just use element.find_element_by_* rather than self.driver.find_element_by_*
        banner2_tad = banner2.find_element_by_xpath('.//div/div/img')
        # Action chains let you queue up actions to perform. They're also the easiest way to hover
        actions = ActionChains(self.driver)
        actions.move_to_element(banner2_tad)
        actions.perform()
        tooltip = self.driver.find_element_by_id('goodblock-informational-tooltip')
        spacing = banner2_tad.location['y'] - tooltip.size['height'] - tooltip.location['y']
        self.assertLess(spacing, 15)

        tooltip.find_element_by_xpath('.//div[text()="Learn more"]').click()
        WebDriverWait(self.driver, 2).until(
            EC.visibility_of_element_located((By.ID, 'goodblock-informational-modal'))
        )

    def test_ad_hover_after_scroll(self):
        self.wait_for_goodblock()
        absolute_child = self.driver.find_element_by_css_selector('[data-test="absolute-child"]')
        # Xpath is great since you can go up to the parent easily
        absolute_child_tad = absolute_child.find_element_by_xpath('..//div/div/img')
        # You can always fall back to arbitrary javascript:
        self.driver.execute_script('window.scrollTo(0, 30)')

        ActionChains(self.driver).move_to_element(absolute_child_tad).perform()
        tooltip = self.driver.find_element_by_id('goodblock-informational-tooltip')
        spacing = absolute_child_tad.location['y'] - tooltip.size['height'] - tooltip.location['y']
        self.assertLess(spacing, 15)
