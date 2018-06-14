#!/usr/bin/env bash
#
# This script assumes a linux environment

echo "*** uBlock.webext: Creating web store package"
echo "*** uBlock.webext: Copying files"

DES=dist/build/uBlock.webext
rm -rf $DES
mkdir -p $DES

cp -R assets                            $DES/
rm $DES/assets/*.sh
cp -R src/css                           $DES/
cp -R src/img                           $DES/
cp -R src/js                            $DES/
cp -R src/lib                           $DES/
cp -R src/_locales                      $DES/
cp -R $DES/_locales/nb                  $DES/_locales/no
cp src/*.html                           $DES/
cp -R platform/chromium/img             $DES/
cp platform/chromium/*.js               $DES/js/
cp platform/chromium/*.html             $DES/
cp platform/chromium/*.json             $DES/
cp LICENSE.txt                          $DES/

cp platform/webext/manifest.json        $DES/
mv $DES/img/icon_128.png                $DES/icon.png

echo "*** uBlock.webext: Generating meta..."
python tools/make-webext-meta.py $DES/

if [ "$1" = all ]; then
    echo "*** uBlock.webext: Creating package..."
    pushd $DES > /dev/null
    zip ../$(basename $DES).xpi -qr *
    popd > /dev/null
fi

echo "*** uBlock.webext: Package done."
