#!/bin/bash
#
# This script assumes a linux environment

TEMPFILE=/tmp/httpsb-asset

echo "*** uBlock: updating remote assets..."

THIRDPARTY_REMOTEURLS=(
    'https://easylist-downloads.adblockplus.org/easylist.txt'
    'https://easylist-downloads.adblockplus.org/exceptionrules.txt'
    'https://raw.githubusercontent.com/abp-filters/abp-filters-anti-cv/master/english.txt'
    'https://raw.githubusercontent.com/hoshsadiq/adblock-nocoin-list/master/nocoin.txt'
    'https://easylist-downloads.adblockplus.org/easyprivacy.txt'
    'https://mirror1.malwaredomains.com/files/justdomains'
    'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=hosts&showintro=1&mimetype=plaintext'
    'https://www.malwaredomainlist.com/hostslist/hosts.txt'
    'https://publicsuffix.org/list/effective_tld_names.dat'
    )

THIRDPARTY_LOCALURLS=(
    'thirdparties/easylist-downloads.adblockplus.org/easylist.txt'
    'thirdparties/easylist-downloads.adblockplus.org/exceptionrules.txt'
    'thirdparties/raw.githubusercontent.com/abp-filters-anti-cv/english.txt'
    'thirdparties/raw.githubusercontent.com/adblock-nocoin-list/nocoin.txt'
    'thirdparties/easylist-downloads.adblockplus.org/easyprivacy.txt'
    'thirdparties/mirror1.malwaredomains.com/files/justdomains'
    'thirdparties/pgl.yoyo.org/as/serverlist'
    'thirdparties/www.malwaredomainlist.com/hostslist/hosts.txt'
    'thirdparties/publicsuffix.org/list/effective_tld_names.dat'
    )

ENTRY_INDEX=0
for THIRDPARTY_REMOTEURL in ${THIRDPARTY_REMOTEURLS[@]}; do
    THIRDPARTY_LOCALURL=${THIRDPARTY_LOCALURLS[ENTRY_INDEX]}
    echo "*** Downloading" $THIRDPARTY_REMOTEURL
    if wget --no-cache -q -T 30 -O $TEMPFILE -- $THIRDPARTY_REMOTEURL; then
        if [ -s $TEMPFILE ]; then
            if ! cmp -s $TEMPFILE $THIRDPARTY_LOCALURL; then
                echo "    New version found: $THIRDPARTY_LOCALURL"
                if [ "$1" != "dry" ]; then
                    mv $TEMPFILE $THIRDPARTY_LOCALURL
                fi
            fi
        fi
    fi
    let ENTRY_INDEX+=1
done
