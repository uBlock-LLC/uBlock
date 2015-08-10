
import time
import unittest

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains

import helpers
import url_helpers


class GoodblockPostInstallPageTestCase(unittest.TestCase):

    def setUp(self):
        pass

    # Returns true of the post-install page is open.
    def is_post_install_page_open(self, driver):
        # Save the starting window handle so we can switch back to it
        # after iterating through other handles.
        starting_window_handle = driver.current_window_handle

        welcome_page_url = url_helpers.get_urls(driver)['welcome']

        found_welcome_page = False
        for handle in driver.window_handles:
            driver.switch_to.window(handle)
            url = driver.current_url
            if url == welcome_page_url:
                found_welcome_page = True
                break
        driver.switch_to.window(starting_window_handle)
        return found_welcome_page

    def test_post_install_page_open(self):

        driver = helpers.get_goodblock_web_driver()

        # Save this original window so we can easily close the others.
        global ORIGINAL_WINDOW_HANDLE
        ORIGINAL_WINDOW_HANDLE = driver.current_window_handle

        # Wait for the extension's post-install tab to open.
        helpers.expect_new_window(driver, 5)

        # Ensure the post-install page is open.
        self.assertTrue(self.is_post_install_page_open(driver))

        driver.quit()
