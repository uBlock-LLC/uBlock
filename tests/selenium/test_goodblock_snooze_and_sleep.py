
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

    # Set the driver for access in tests.
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


class GoodblockIconHoverTestCase(unittest.TestCase):

    def setUp(self):
        self.driver = DRIVER

        # Open a page and wait for the Goodblock icon to appear.
        helpers.open_test_page(self.driver)
        helpers.wait_for_goodblock_icon_img_load(self.driver)
        helpers.wait_for_goodblock_icon_to_appear(self.driver)

    def test_icon_hover(self):

        # Hover over the Goodblock icon.
        goodblock_icon = self.driver.find_element_by_css_selector('img[data-goodblock-elem="icon-img"]')
        actions = ActionChains(self.driver)
        actions.move_to_element(goodblock_icon)
        actions.perform()

        # Ensure the snooze button is visible and correctly formatted.
        wait = WebDriverWait(self.driver, 1)
        wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, '[data-goodblock-elem="snooze-button"]'))
        )
        EC.visibility_of_element_located((By.CSS_SELECTOR, '[data-goodblock-elem="snooze-button"]'))
        snooze_button = self.driver.find_element_by_css_selector('[data-goodblock-elem="snooze-button"]')
        self.assertEqual(snooze_button.value_of_css_property('width'), '70px')
        self.assertEqual(snooze_button.value_of_css_property('height'), '65px')

        # Move mouse off the icon.
        actions.move_to_element(goodblock_icon).move_by_offset(200, 10).perform()

        # Ensure the snooze button isn't visible.
        wait = WebDriverWait(self.driver, 4)
        wait.until(
            EC.invisibility_of_element_located((By.CSS_SELECTOR, '[data-goodblock-elem="snooze-button"]'))
        )


class GoodblockSnoozeSleepTestCase(unittest.TestCase):

    def setUp(self):
        self.driver = DRIVER

        # Open a page and wait for the Goodblock icon to appear.
        helpers.open_test_page(self.driver)
        helpers.wait_for_goodblock_icon_img_load(self.driver)
        helpers.wait_for_goodblock_icon_to_appear(self.driver)

    def hover_over_goodblock_icon(self):
        # Hover over the Goodblock icon.
        goodblock_icon = self.driver.find_element_by_css_selector('img[data-goodblock-elem="icon-img"]')
        actions = ActionChains(self.driver)
        actions.move_to_element(goodblock_icon).perform()

    def wait_for_speech_bubble_to_appear(self):
        # Wait for the snooze speech bubble to appear.
        wait = WebDriverWait(self.driver, 2)
        wait.until(
            EC.visibility_of_element_located((By.CSS_SELECTOR, '[data-goodblock-elem="speech-bubble"]'))
        )

    def wait_for_speech_bubble_to_disappear(self):
        # Wait for the speech bubble to disappear.
        wait = WebDriverWait(self.driver, 7)
        wait.until(
            EC.invisibility_of_element_located((By.CSS_SELECTOR, '[data-goodblock-elem="speech-bubble"]'))
        )

    def wait_for_goodblock_icon_to_disappear(self):
        # Wait for the Goodblock icon to disappear.
        wait = WebDriverWait(self.driver, 10)
        wait.until(
            EC.invisibility_of_element_located((By.CSS_SELECTOR, '[data-goodblock-elem="icon"]'))
        )

    # Returns True if the Goodblock ad tab is open.
    def is_ad_tab_open(self):
        # Save the starting window handle so we can switch back to it
        # after iterating through other handles.
        starting_window_handle = self.driver.current_window_handle

        goodblock_ad_url = 'https://gladlyads.xyz/adserver/'
        found_ad_url = False
        for handle in self.driver.window_handles:
            self.driver.switch_to.window(handle)
            url = self.driver.current_url
            if url == goodblock_ad_url:
                found_ad_url = True
                break
        self.driver.switch_to.window(starting_window_handle)
        return found_ad_url

    def test_snooze(self):
        self.hover_over_goodblock_icon()

        # Wait for the snooze button to appear.
        wait = WebDriverWait(self.driver, 1)
        wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, '[data-goodblock-elem="snooze-button"]'))
        )

        # Click the snooze button.
        snooze_button = self.driver.find_element_by_css_selector('[data-goodblock-elem="snooze-button"]')
        snooze_button.click()

        self.wait_for_speech_bubble_to_appear()

        # Test the speech bubble
        speech_bubble = self.driver.find_element_by_css_selector('[data-goodblock-elem="speech-bubble"]')
        self.assertEqual(speech_bubble.text, "Ok, I'll come back later!")
        self.assertEqual(speech_bubble.size['width'], 100)
        self.assertEqual(speech_bubble.size['height'], 54)


        self.wait_for_speech_bubble_to_disappear()
        self.wait_for_goodblock_icon_to_disappear()

        snooze_time = helpers.get_animation_times()['snooze']

        # Make sure the icon is still invisible right before waking up from snooze.
        time.sleep(snooze_time - 0.01)
        EC.invisibility_of_element_located((By.CSS_SELECTOR, '[data-goodblock-elem="icon"]'))

        helpers.wait_for_goodblock_icon_to_appear(self.driver)

    def test_ad_open_and_sleep(self):
        # Make sure an ad tab isn't open.
        self.assertFalse(self.is_ad_tab_open())

        # Wait for a new window to open.
        with helpers.wait_for_new_window(self.driver, 4):
            # Click the Goodblock icon.
            self.driver.find_element_by_css_selector('[data-goodblock-elem="icon"]').click()

        # Wait for the new tab to load.
        time.sleep(1)

        # Make sure an ad tab is now open.
        self.assertTrue(self.is_ad_tab_open())

        # Return to the original tab.
        helpers.close_all_other_windows(self.driver, ORIGINAL_WINDOW_HANDLE)

        # Test the speech bubble
        self.wait_for_speech_bubble_to_appear()
        speech_bubble = self.driver.find_element_by_css_selector('[data-goodblock-elem="speech-bubble"]')
        self.assertEqual(speech_bubble.text, 'Thanks! See you later!')
        self.assertEqual(speech_bubble.size['width'], 100)
        self.assertEqual(speech_bubble.size['height'], 54)

        self.wait_for_speech_bubble_to_disappear()
        self.wait_for_goodblock_icon_to_disappear()

        sleep_time = helpers.get_animation_times()['sleep']

        # Make sure the icon is still invisible right before waking up from snooze.
        time.sleep(sleep_time - 0.01)
        EC.invisibility_of_element_located((By.CSS_SELECTOR, '[data-goodblock-elem="icon"]'))

        helpers.wait_for_goodblock_icon_to_appear(self.driver)

