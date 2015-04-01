#!/bin/bash -e
#
# This script assumes a linux environment

echo "*** uBlock.firefox: Copying files."

DES=dist/build/uBlock.firefox
rm -rf $DES
mkdir -p $DES

cp -R assets $DES/
rm $DES/assets/*.sh
cp -R src/css $DES/
cp -R src/img $DES/
cp -R src/js $DES/
cp -R src/lib $DES/
cp -R src/_locales $DES/
cp src/*.html $DES/
mv $DES/img/icon_128.png $DES/icon.png
cp platform/firefox/vapi-*.js $DES/js/
cp platform/firefox/bootstrap.js $DES/
cp platform/firefox/frame*.js $DES/
cp -R platform/firefox/img $DES/
cp platform/firefox/chrome.manifest $DES/
cp platform/firefox/install.rdf $DES/
cp platform/firefox/*.xul $DES/
cp LICENSE.txt $DES/

echo "*** uBlock.firefox: Generating meta..."
python tools/make-firefox-meta.py $DES/

if [ "$1" = all ]; then
    echo "*** uBlock.firefox: Creating package..."
    # Get timestamp of latest commit and change
    # files in $DES to have this timestamp.
    timestamp="$(git log -1 --pretty=format:"%cD")"
    find $DES/ -exec touch -d "$timestamp" {} +

    cd "$DES/"
    rm -f ../uBlock.firefox.xpi
    find . -type f -print |
      sort -d -f |
      zip -qX0@ ../uBlock.firefox.xpi
    echo "*** uBlock.firefox: Created $(dirname "$DES")/uBlock.firefox.xpi."
    echo "*** uBlock.firefox: SHA $(sha256sum ../uBlock.firefox.xpi | cut -f1 -d' ')."
fi

echo "*** uBlock.firefox: Package done."
