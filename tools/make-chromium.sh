#!/bin/bash
#
# This script assumes a linux environment

echo "*** goodblock.chromium: Creating web store package"

if [ "$1" = "dev" ]; then
  export BUILD_ENV=dev
fi
if [ "$1" = "testing" ]; then
  export BUILD_ENV=testing
fi
# If the build environment isn't specified, assume it's production.
if [ "$BUILD_ENV" = "" ]; then
  export BUILD_ENV=production
fi
echo "*** goodblock.chromium: Set build environment to ${BUILD_ENV}"

echo "*** goodblock.chromium: Copying files"

DES=./dist/build/goodblock.chromium
LOCAL_SETTINGS_FILENAME=goodblock-config-dev.js
TESTING_SETTINGS_FILENAME=goodblock-config-testing.js
rm -rf $DES
mkdir -p $DES

cp -R assets $DES/
rm $DES/assets/*.sh
cp -R src/css $DES/
cp -R src/img $DES/
mkdir $DES/js
# The dev config file might not exist in the repository, so
# create it before copying over the rest of the JS files.
touch $DES/js/$LOCAL_SETTINGS_FILENAME
cp src/js/*.js $DES/js/
echo "*** goodblock.chromium: Transforming JSX files."

# Set the Node environment.
if [ "$BUILD_ENV" = "dev" ]; then
  export NODE_ENV=dev
fi
if [ "$BUILD_ENV" = "production" ]; then
  export NODE_ENV=production
fi
# echo "*** goodblock.chromium: Set NODE_ENV to ${NODE_ENV}"

# Build the Goodblock content script.
gulp --gulpfile tools/gulpfile.js scripts

echo "*** goodblock.chromium: Browserifying ublock.js."
browserify src/js/ublock.js > $DES/js/ublock.js
cp -R src/lib $DES/
cp -R src/_locales $DES/
cp -R $DES/_locales/nb $DES/_locales/no
cp src/*.html $DES/
cp platform/chromium/*.js $DES/js/
cp -R platform/chromium/img $DES/
cp platform/chromium/*.html $DES/
cp platform/chromium/manifest.json $DES/
cp LICENSE.txt $DES/

# If this isn't a dev build, remove the dev config.
if [ "$BUILD_ENV" != "dev" ]; then
    echo "*** goodblock.chromium: Wiping dev config clean..."
    rm $DES/js/$LOCAL_SETTINGS_FILENAME
    touch $DES/js/$LOCAL_SETTINGS_FILENAME
fi

# If this isn't a testing build, remove the testing config.
if [ "$BUILD_ENV" != "testing" ]; then
    echo "*** goodblock.chromium: Wiping testing config clean..."
    rm $DES/js/$TESTING_SETTINGS_FILENAME
    touch $DES/js/$TESTING_SETTINGS_FILENAME
fi

echo "*** goodblock.chromium: Package done."
