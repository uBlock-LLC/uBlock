import imp
import time
import unittest

# Try importing local settings.
try:
    imp.find_module('local_settings')
    import local_settings
    local_settings_found = True
except ImportError:
    local_settings_found = False

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.action_chains import ActionChains


# Returns the driver for the browser with Goodblock installed.
def get_goodblock_web_driver():
    chrome_options = Options()
    dist_path = './dist/build/goodblock.chromium'
    chrome_options.add_argument('load-extension=%s' % dist_path)
    if local_settings_found:
        # If the user specified a custom binary path, use it.
        google_chrome_binary_path = getattr(local_settings, 'GOOGLE_CHROME_BINARY_PATH', None)
        if google_chrome_binary_path:
            chrome_options._binary_location = google_chrome_binary_path
    return webdriver.Chrome(chrome_options=chrome_options)

def setUpModule():
    # Launch the browser and install Goodblock.
    # This is so we don't have to launch a browser and reinstall the extension
    # between every test.
    driver = get_goodblock_web_driver()
    global DRIVER
    DRIVER = driver

def tearDownModule():
    # Close the browser.
    DRIVER.quit()

GOODBLOCK_BASE_ELEM_CSS_SELECTOR = '#goodblock-react-base[data-goodblock-initialized="true"]'

# Ensure that the extension installed properly.
class GoodblockIsInstalledTestCase(unittest.TestCase):

    def setUp(self):
        # self.driver = get_goodblock_web_driver()
        # ensure_goodblock_is_installed(self.driver)
        self.driver = DRIVER

    def ensure_goodblock_is_installed(self):
        # First ensure goodblock is installed
        self.driver.get('chrome://extensions')
        time.sleep(1) # The page takes a moment to init.
        # Switch to the extensions iframe and ensure that we're installed
        self.driver.switch_to.frame(self.driver.find_element_by_name("extensions"))
        self.driver.find_element_by_xpath('//span[text()="Goodblock"]')

    def test_goodblock_is_installed(self):
        self.ensure_goodblock_is_installed()


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
        return self.driver.find_element_by_css_selector(GOODBLOCK_BASE_ELEM_CSS_SELECTOR)

    def test_goodblock_app_exists(self):
        EC.presence_of_element_located((By.CSS_SELECTOR, GOODBLOCK_BASE_ELEM_CSS_SELECTOR))

    # Wait for the icon image to load. It may take some time because the extension's
    # content script has to fetch the image from the extension.
    def wait_for_goodblock_icon_img_load(self):
        wait = WebDriverWait(self.driver, 10)
        wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'img[data-goodblock-elem="icon-img"]'))
        )

    def test_icon_exists(self):
        self.wait_for_goodblock_icon_img_load()
        EC.presence_of_element_located((By.CSS_SELECTOR, 'img[data-goodblock-elem="icon-img"]'))

    def test_icon_dimensions(self):
        self.wait_for_goodblock_icon_img_load()
        icon = self.driver.find_element_by_css_selector('img[data-goodblock-elem="icon-img"]')
        icon_width = icon.value_of_css_property('width')
        icon_height = icon.value_of_css_property('height')
        self.assertEqual(icon_width, '26px')
        self.assertEqual(icon_height, '26px')
