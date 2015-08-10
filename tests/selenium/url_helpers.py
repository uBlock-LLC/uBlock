
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


global EXTENSION_ID
EXTENSION_ID = None

# Gets the Chrome extension ID by looking at the HTML of the
# chrome://extensions page.
def get_chrome_extension_id(driver):

    # So that we only have to look up the extension ID
    # once per testing run.
    global EXTENSION_ID
    if EXTENSION_ID:
        return EXTENSION_ID

	# First ensure goodblock is installed
    driver.get('chrome://extensions')

    # Wait for the page to load.
    wait = WebDriverWait(driver, 3)
    wait.until(
        EC.presence_of_element_located((By.NAME, 'extensions'))
    )

    # Switch to the extensions iframe.
    driver.switch_to.frame(driver.find_element_by_name('extensions'))

    # Make sure developer mode is on.
    dev_mode_checkbox = driver.find_element_by_id('toggle-dev-on')
    if not dev_mode_checkbox.is_selected():
        dev_mode_checkbox.click()
    
    # Get the Goodblock extension section.
    goodblock_ext_title = driver.find_element_by_xpath('//h2[text()="Goodblock"]')

    # Get the extension ID.
    goodblock_ext_developer_extras = goodblock_ext_title.find_element_by_xpath('./parent::*/parent::*')
    goodblock_ext_id_elem = goodblock_ext_developer_extras.find_element_by_class_name('extension-id')
    goodblock_ext_id = goodblock_ext_id_elem.text

    # Set the extension ID for this run.
    EXTENSION_ID = goodblock_ext_id
    
    return goodblock_ext_id

def get_extension_url_paths():
    return {
        'welcome': 'welcome.html',
    }

def get_urls(driver):
    chrome_extension_protocol = 'chrome-extension://'
    chrome_extension_id = get_chrome_extension_id(driver)
    extension_prefix = '{protocol}{ext_id}{slash}'.format(
        protocol=chrome_extension_protocol,
        ext_id=chrome_extension_id,
        slash='/'
    )

    extension_url_paths = get_extension_url_paths()

    urls = {
        'welcome': extension_prefix + extension_url_paths['welcome'],
    }
    return urls
