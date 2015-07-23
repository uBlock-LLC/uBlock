#!/bin/bash
#
# This script assumes a linux environment

echo "*** goodblock.chromium: Creating web store package"
echo "*** goodblock.chromium: Copying files"

DES=dist/build/goodblock.chromium
LOCAL_SETTINGS_FILENAME=goodblock-config-dev.js
rm -rf $DES
mkdir -p $DES

cp -R assets $DES/
rm $DES/assets/*.sh
cp -R src/css $DES/
cp -R src/img $DES/
mkdir $DES/js
cp src/js/*.js $DES/js/
echo "*** goodblock.chromium: Transforming browserify/JSX files."
browserify -t reactify src/js/contentscript-goodblock.jsx > $DES/js/contentscript-goodblock.js
cp -R src/lib $DES/
cp -R src/_locales $DES/
cp -R $DES/_locales/nb $DES/_locales/no
cp src/*.html $DES/
cp platform/chromium/*.js $DES/js/
cp -R platform/chromium/img $DES/
cp platform/chromium/*.html $DES/
cp platform/chromium/manifest.json $DES/
cp LICENSE.txt $DES/

if [ "$1" != dev ]; then
    echo "*** goodblock.chromium: Removing dev config..."
    rm $DES/js/$LOCAL_SETTINGS_FILENAME
    touch $DES/js/$LOCAL_SETTINGS_FILENAME
fi

if [ "$1" = all ]; then
    echo "*** goodblock.chromium: Creating package..."
    pushd $(dirname $DES/)
    zip goodblock.chromium.zip -qr $(basename $DES/)/*
    popd
fi

echo "*** goodblock.chromium: Package done."
