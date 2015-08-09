
import time
import unittest

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains

import helpers


def setUpModule():
    # Launch the browser and install Goodblock.
    # This is so we don't have to launch a browser and reinstall the extension
    # between every test.
    driver = helpers.get_goodblock_web_driver()

    global DRIVER
    DRIVER = driver

    # Save this original window so we can easily close the others.
    global ORIGINAL_WINDOW_HANDLE
    ORIGINAL_WINDOW_HANDLE = driver.current_window_handle

    # Wait for the extension's post-install tab to open and close
    # the tab so we can watch what's going on in the main tab.
    helpers.expect_new_window(driver, 5)
    helpers.close_all_other_windows(driver, ORIGINAL_WINDOW_HANDLE)

def tearDownModule():
    # Close the browser.
    DRIVER.quit()

# # Ensure that the extension installed properly.
# class GoodblockIsInstalledTestCase(unittest.TestCase):

#     def setUp(self):
#         # self.driver = get_goodblock_web_driver()
#         # ensure_goodblock_is_installed(self.driver)
#         self.driver = DRIVER

#     def ensure_goodblock_is_installed(self):
#         # First ensure goodblock is installed
#         self.driver.get('chrome://extensions')
#         time.sleep(1) # The page takes a moment to init.
#         # Switch to the extensions iframe and ensure that we're installed
#         self.driver.switch_to.frame(self.driver.find_element_by_name("extensions"))
#         self.driver.find_element_by_xpath('//span[text()="Goodblock"]')

#     def test_goodblock_is_installed(self):
#         self.ensure_goodblock_is_installed()


# Ensure the Goodblock icon is created on our HTML page.
class GoodblockIconExistsTestCase(unittest.TestCase):

    def setUp(self):
        # self.driver = get_goodblock_web_driver()
        # ensure_goodblock_is_installed(self.driver)
        self.driver = DRIVER
        self.open_test_page()

    def tearDown(self):
        # self.driver.quit()
        pass

    def open_test_page(self):
        # Then open the page.
        self.driver.get('localhost:8000/blank-goodblock.html')
        # Wait until the page loads.
        wait = WebDriverWait(self.driver, 5)
        wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, '[data-test-elem="page-title"]'))
        )

    # Return the base HTML element created by the extension.
    def get_goodblock_app_base_elem(self):
        return self.driver.find_element_by_css_selector(
            '#goodblock-react-base[data-goodblock-initialized="true"]')

    def test_goodblock_app_exists(self):
        EC.presence_of_element_located((By.CSS_SELECTOR,
            '#goodblock-react-base[data-goodblock-initialized="true"]'))

    def test_icon_exists(self):
        helpers.wait_for_goodblock_icon_img_load(self.driver)
        EC.presence_of_element_located((By.CSS_SELECTOR, 'img[data-goodblock-elem="icon-img"]'))

    def test_icon_dimensions(self):
        helpers.wait_for_goodblock_icon_img_load(self.driver)
        icon = self.driver.find_element_by_css_selector('img[data-goodblock-elem="icon-img"]')
        icon_width = icon.value_of_css_property('width')
        icon_height = icon.value_of_css_property('height')
        self.assertEqual(icon_width, '26px')
        self.assertEqual(icon_height, '26px')
