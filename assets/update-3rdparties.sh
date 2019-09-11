#!/bin/bash
#
# This script assumes a linux environment

TEMPFILE=/tmp/httpsb-asset

echo "*** uBlock: updating remote assets..."

THIRDPARTY_REMOTEURLS=(
    'https://adblock.gardar.net/is.abp.txt'
    'https://raw.githubusercontent.com/cjx82630/cjxlist/master/cjxlist.txt'
    'https://raw.githubusercontent.com/gioxx/xfiles/master/filtri.txt'
    'https://easylist-downloads.adblockplus.org/advblock.txt'
    'https://easylist-downloads.adblockplus.org/bitblock.txt'
    'https://easylist-downloads.adblockplus.org/easylist.txt'
    'https://easylist-downloads.adblockplus.org/exceptionrules.txt'
    'https://raw.githubusercontent.com/abp-filters/abp-filters-anti-cv/master/english.txt'
    'https://raw.githubusercontent.com/hoshsadiq/adblock-nocoin-list/master/nocoin.txt'
    'https://easylist-downloads.adblockplus.org/easylist_noelemhide.txt'
    'https://easylist-downloads.adblockplus.org/easylistchina.txt'
    'https://easylist-downloads.adblockplus.org/easylistdutch.txt'
    'https://easylist-downloads.adblockplus.org/easylistgermany.txt'
    'https://easylist-downloads.adblockplus.org/easylistitaly.txt'
    'https://easylist-downloads.adblockplus.org/easyprivacy.txt'
    'https://easylist-downloads.adblockplus.org/fanboy-annoyance.txt'
    'https://easylist-downloads.adblockplus.org/fanboy-social.txt'
    'https://easylist-downloads.adblockplus.org/liste_fr.txt'
    'https://notabug.org/latvian-list/adblock-latvian/raw/master/lists/latvian-list.txt'
    'https://raw.githubusercontent.com/DandelionSprout/adfilt/master/NorwegianList.txt'
    'https://hosts-file.net/.%5Cad_servers.txt'
    'https://raw.githubusercontent.com/ABPindo/indonesianadblockrules/master/subscriptions/abpindo.txt'
    'https://gitcdn.xyz/repo/farrokhi/adblock-iran/master/filter.txt'
    'https://easylist-downloads.adblockplus.org/Liste_AR.txt'
    'http://margevicius.lt/easylistlithuania.txt'
    'https://mirror1.malwaredomains.com/files/justdomains'
    'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=hosts&showintro=1&mimetype=plaintext'
    'https://raw.githubusercontent.com/easylist/EasyListHebrew/master/EasyListHebrew.txt'
    'https://raw.githubusercontent.com/MajkiIT/polish-ads-filter/master/polish-adblock-filters/adblock.txt'
    'https://raw.githubusercontent.com/olegwukr/polish-privacy-filters/master/anti-adblock.txt'
    'https://raw.githubusercontent.com/k2jp/abp-japanese-filters/master/abpjf.txt'
    'https://raw.githubusercontent.com/szpeter80/hufilter/master/hufilter.txt'
    'https://raw.githubusercontent.com/tomasko126/easylistczechandslovak/master/filters.txt'
    'https://raw.githubusercontent.com/finnish-easylist-addition/finnish-easylist-addition/master/Finland_adb.txt'
    'http://someonewhocares.org/hosts/hosts'
    'https://raw.githubusercontent.com/Spam404/lists/master/adblock-list.txt'
    'http://stanev.org/abp/adblock_bg.txt'
    'http://winhelp2002.mvps.org/hosts.txt'
    'https://www.fanboy.co.nz/enhancedstats.txt'
    'https://www.fanboy.co.nz/fanboy-antifacebook.txt'
    'https://raw.githubusercontent.com/gfmaster/adblock-korea-contrib/master/filter.txt'
    'https://raw.githubusercontent.com/yous/YousList/master/youslist.txt'
    'https://raw.githubusercontent.com/lassekongo83/Frellwits-filter-lists/master/Frellwits-Swedish-Filter.txt'
    'https://filters.adtidy.org/extension/ublock/filters/9.txt'
    'https://raw.githubusercontent.com/easylist-thailand/easylist-thailand/master/subscription/easylist-thailand.txt'
    'https://easylist-downloads.adblockplus.org/easylistspanish.txt'
    'https://www.fanboy.co.nz/r/fanboy-ultimate.txt'
    'https://raw.githubusercontent.com/abpvn/abpvn/master/filter/abpvn.txt'
    'https://www.malwaredomainlist.com/hostslist/hosts.txt'
    'https://www.void.gr/kargig/void-gr-filters.txt'
    'https://raw.githubusercontent.com/tcptomato/ROad-Block/master/road-block-filters-light.txt'
    'https://filters.adtidy.org/extension/ublock/filters/2_without_easylist.txt'
    'https://filters.adtidy.org/extension/ublock/filters/3.txt'
    'https://filters.adtidy.org/extension/ublock/filters/14.txt'
    'https://filters.adtidy.org/extension/ublock/filters/4.txt'
    'https://secure.fanboy.co.nz/fanboy-cookiemonster.txt'
    'https://s3.amazonaws.com/lists.disconnect.me/simple_malvertising.txt'
    'https://filters.adtidy.org/extension/ublock/filters/7.txt'
    'https://filters.adtidy.org/extension/ublock/filters/1.txt'
    'https://filters.adtidy.org/extension/ublock/filters/13.txt'
    'https://publicsuffix.org/list/effective_tld_names.dat'
    )

THIRDPARTY_LOCALURLS=(
    'thirdparties/adblock.gardar.net/is.abp.txt'
    'thirdparties/raw.githubusercontent.com/cjx82630/cjxlist/cjxlist.txt'
    'thirdparties/raw.githubusercontent.com/gioxx/filtri.txt'
    'thirdparties/easylist-downloads.adblockplus.org/advblock.txt'
    'thirdparties/easylist-downloads.adblockplus.org/bitblock.txt'
    'thirdparties/easylist-downloads.adblockplus.org/easylist.txt'
    'thirdparties/easylist-downloads.adblockplus.org/exceptionrules.txt'
    'thirdparties/raw.githubusercontent.com/abp-filters-anti-cv/english.txt'
    'thirdparties/raw.githubusercontent.com/adblock-nocoin-list/nocoin.txt'
    'thirdparties/easylist-downloads.adblockplus.org/easylist_noelemhide.txt'
    'thirdparties/easylist-downloads.adblockplus.org/easylistchina.txt'
    'thirdparties/easylist-downloads.adblockplus.org/easylistdutch.txt'
    'thirdparties/easylist-downloads.adblockplus.org/easylistgermany.txt'
    'thirdparties/easylist-downloads.adblockplus.org/easylistitaly.txt'
    'thirdparties/easylist-downloads.adblockplus.org/easyprivacy.txt'
    'thirdparties/easylist-downloads.adblockplus.org/fanboy-annoyance.txt'
    'thirdparties/easylist-downloads.adblockplus.org/fanboy-social.txt'
    'thirdparties/easylist-downloads.adblockplus.org/liste_fr.txt'
    'thirdparties/adblock-latvian/latvian-list.txt'
    'thirdparties/raw.githubusercontent.com/DandelionSprout/adfilt/NorwegianList.txt'
    'thirdparties/hosts-file.net/ad-servers'
    'thirdparties/raw.githubusercontent.com/indonesianadblockrules/subscriptions/abpindo.txt'
    'thirdparties/gitcdn.xyz/adblock-iran/filter.txt'
    'thirdparties/easylist-downloads.adblockplus.org/Liste_AR.txt'
    'thirdparties/margevicius.lt/easylistlithuania.txt'
    'thirdparties/mirror1.malwaredomains.com/files/justdomains'
    'thirdparties/pgl.yoyo.org/as/serverlist'
    'thirdparties/raw.githubusercontent.com/EasyListHebrew/master/EasyListHebrew.txt'
    'thirdparties/raw.githubusercontent.com/polish-adblock-filters/adblock.txt'
    'thirdparties/raw.githubusercontent.com/polish-privacy-filters/anti-adblock.txt'
    'thirdparties/raw.githubusercontent.com/k2jp/abp-japanese-filters/master/abp_jp.txt'
    'thirdparties/raw.githubusercontent.com/szpeter80/hufilter/master/hufilter.txt'
    'thirdparties/raw.githubusercontent.com/tomasko126/easylistczechandslovak/master/filters.txt'
    'thirdparties/raw.githubusercontent.com/finnish-easylist-addition/Finland_adb.txt'
    'thirdparties/someonewhocares.org/hosts/hosts'
    'thirdparties/raw.githubusercontent.com/Spam404/lists/adblock-list.txt'
    'thirdparties/stanev.org/abp/adblock_bg.txt'
    'thirdparties/winhelp2002.mvps.org/hosts.txt'
    'thirdparties/www.fanboy.co.nz/enhancedstats.txt'
    'thirdparties/www.fanboy.co.nz/fanboy-antifacebook.txt'
    'thirdparties/raw.githubusercontent.com/adblock-korea-contrib/filter.txt'
    'thirdparties/raw.githubusercontent.com/YousList/youslist.txt'
    'thirdparties/raw.githubusercontent.com/Frellwits-filter-lists/Frellwits-Swedish-Filter.txt'
    'thirdparties/filters.adtidy.org/extension/ublock/filters/9.txt'
    'thirdparties/raw.githubusercontent.com/easylist-thailand/easylist-thailand.txt'
    'thirdparties/easylist-downloads.adblockplus.org/easylistspanish.txt'
    'thirdparties/www.fanboy.co.nz/fanboy-ultimate.txt'
    'thirdparties/raw.githubusercontent.com/abpvn/abpvn.txt'
    'thirdparties/www.malwaredomainlist.com/hostslist/hosts.txt'
    'thirdparties/www.void.gr/kargig/void-gr-filters.txt'
    'thirdparties/raw.githubusercontent.com/ROad-Block/road-block-filters-light.txt'
    'thirdparties/filters.adtidy.org/extension/ublock/filters/2_without_easylist.txt'
    'thirdparties/filters.adtidy.org/extension/ublock/filters/3.txt'
    'thirdparties/filters.adtidy.org/extension/ublock/filters/14.txt'
    'thirdparties/filters.adtidy.org/extension/ublock/filters/4.txt'
    'thirdparties/secure.fanboy.co.nz/fanboy-cookiemonster.txt'
    'thirdparties/s3.amazonaws.com/lists.disconnect.me/simple_malvertising.txt'
    'thirdparties/filters.adtidy.org/extension/ublock/filters/7.txt'
    'thirdparties/filters.adtidy.org/extension/ublock/filters/1.txt'
    'thirdparties/filters.adtidy.org/extension/ublock/filters/13.txt'
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
