
import imp
import time
from contextlib import contextmanager

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# Try importing local settings.
try:
    imp.find_module('local_settings')
    import local_settings
    local_settings_found = True
except ImportError:
    local_settings_found = False


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


# A function that expects a new window to open.
# If no window opens before timeout seconds, it throws a timeout exception.
# This is useful when a new window will open, but not directly because
# of our own code (e.g. post-install of a browser extension).
# Adapted from: http://stackoverflow.com/a/26648414/1332513
def expect_new_window(driver, timeout=10):
    handles_before = driver.window_handles
    WebDriverWait(driver, timeout).until(
        lambda driver: len(handles_before) != len(driver.window_handles))

# A function that waits for a new window to open.
# If no window opens before timeout seconds, throws a timeout exception.
# From: http://stackoverflow.com/a/26648414/1332513
@contextmanager
def wait_for_new_window(driver, timeout=10):
    handles_before = driver.window_handles
    yield
    WebDriverWait(driver, timeout).until(
        lambda driver: len(handles_before) != len(driver.window_handles))

# FIXME
# Get the extension ID for Goodblock by looking it up in
# chrome://extensions.
def get_chrome_extension_id(driver):
	# First ensure goodblock is installed
    driver.get('chrome://extensions')
    time.sleep(1) # The page takes a moment to init.

    # Switch to the extensions iframe.
    driver.switch_to.frame(driver.find_element_by_name("extensions"))
    
    # Get the Goodblock extension section
    goodblock_ext_title = driver.find_element_by_xpath('//span[text()="Goodblock"]')

    # FIXME: this cannot find the element.
    goodblock_ext_developer_extras = goodblock_ext_title.find_element_by_xpath('../../div')
    goodblock_ext_id_elem = goodblock_ext_developer_extras.find_element_by_class_name('extension-id')
    goodblock_ext_id = goodblock_ext_id_elem.text()
    # print goodblock_ext_id
    
    return goodblock_ext_id


def get_animation_times():
    # Time in seconds.
    # Note these will use testing time lengths as defined in
    # goodblock-config-testing.js.
    data = {
        'snooze': 0.5,
        'sleep': 3,
    }
    return data

def open_test_page(driver):
    driver.get('localhost:8000/blank-goodblock.html')
    # Wait until the page loads.
    wait = WebDriverWait(driver, 5)
    wait.until(
        EC.presence_of_element_located((By.CSS_SELECTOR, '[data-test-elem="page-title"]'))
    )

def wait_for_goodblock_icon_img_load(driver, timeout=20):
    wait = WebDriverWait(driver, timeout)
    wait.until(
        EC.presence_of_element_located((By.CSS_SELECTOR, 'img[data-goodblock-elem="icon-img"]'))
    )

def wait_for_goodblock_icon_to_appear(driver, timeout=5):
    # Wait for the Goodblock icon to reappear.
    wait = WebDriverWait(driver, timeout)
    wait.until(
        EC.visibility_of_element_located((By.CSS_SELECTOR, '[data-goodblock-elem="icon"]'))
    )

def close_all_other_windows(driver, window_to_keep):
    for handle in driver.window_handles:
        if handle != window_to_keep:
            driver.switch_to.window(handle)
            driver.close()
    driver.switch_to.window(window_to_keep)
