
import time

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
        'sleep': 1,
    }
    return data
