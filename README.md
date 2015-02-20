# <sub>![logo](https://raw.githubusercontent.com/gorhill/uBlock/master/src/img/browsericons/icon38.png)</sub> µBlock
<sub>pronounce _you-block_ as in "you decide what enters your browser" / see the "µ" as a stylish "u", to emphasize small resource footprint<br></sub><sup>sorry for the dubious name, we are coders, not marketers</sup>

**支持多浏览器的高效过滤工具，快速、有效且简洁。**

* [Purpose & General Info](#philosophy)
* [Performance and Efficiency](#performance)
  * [Memory](#memory)
  * [CPU](#cpu)
  * [Blocking](#blocking)
  * [Quick tests](#quick-tests)
* [Installation](#installation)
  * [Chromium](#chromium)
  * [Firefox](#firefox)
  * [Safari](#safari)
* [Release History](#release-history)
* [Wiki](https://github.com/gorhill/uBlock/wiki)

# ![Build](https://travis-ci.org/gorhill/uBlock.svg?branch=master)

## Philosophy

µBlock 不是一个*广告过滤工具*，它是具有一般性用途的过滤工具，屏蔽广告的功能是通过支持 [Adblock Plus 过滤规则语法](https://adblockplus.org/en/filters)实现的。µBlock 还[扩充](https://github.com/gorhill/uBlock/wiki/Filter-syntax-extensions)了语法，开发伊始就支持自定义过滤规则。

这就是说，最重要的是知道使用过滤工具**不是**一种[偷窃行为](https://twitter.com/LeaVerou/status/518154828166725632)，别总抱着这种令人不爽的想法。_最终_在逻辑上`屏蔽 = 偷窃`会成立的也是因侵犯隐私权利而被定罪。

Ads, "unintrusive" or not, are just the visible portions of privacy-invading apparatus entering your browser when you visit most sites nowadays. **µBlock's main goal is to help users neutralize such privacy-invading apparatus** — in a way that welcomes those users who don't wish to use more technical, involved means (such as [µMatrix](https://github.com/gorhill/uMatrix)).

_EasyList_, _Peter Lowe's Adservers_, _EasyPrivacy_ are enabled by default when you install µBlock. Many more lists are readily available to block trackers, analytics, and more. Hosts files are also supported.

## Performance

#### Memory

<div align="center">
从平均值来看，µBlock <b>的确</b>让你的浏览器运行起来更轻巧。<sup>[1]</sup><br><br>

Chromium <sup>[2]</sup><br>
<img src="https://raw.githubusercontent.com/gorhill/uBlock/master/doc/benchmarks/mem-usage-overall-chart-20141224.png" /><br><br>

Firefox<br>
<img src="https://raw.githubusercontent.com/gorhill/uBlock/master/doc/benchmarks/mem-usage-overall-chart-20150205.png" /><br><br>

Safari<br>
<img src="https://raw.githubusercontent.com/gorhill/uBlock/master/doc/benchmarks/mem-usage-overall-chart-safari-20150205.png" /><br><br>

</div>

<sup>[1] 基准测试详细情况参见： <a href="https://github.com/gorhill/uBlock/wiki/Firefox-version:-benchmarking-memory-footprint">Firefox version: benchmarking memory footprint</a>.</sup><br>

<sup>[2] 重要提示：目前[Chromium 39+ 存在一个每次打开扩展弹出界面时会产生新的内存泄漏的 bug](https://code.google.com/p/chromium/issues/detail?id=441500)，会影响<i>所有</i>扩展，在测量 Chromium 的内存占用时别忘了这点。我自己在测试中已避免完全打开弹出界面。</sup><br>

#### CPU

<p align="center">
µBlock 也让 CPU 更省心<br>
<img src="https://raw.githubusercontent.com/gorhill/uBlock/master/doc/benchmarks/cpu-usage-overall-chart-20141226.png" /><br>
<sup>基准测试详细情况参见：<a href="https://github.com/gorhill/uBlock/blob/master/doc/benchmarks/cpu-usage-overall-20141226.ods">this LibreOffice spreadsheet</a>.</sup>
</p>

#### Blocking

<p align="center">
Being lean and efficient doesn't mean blocking less<br>
<img src="https://raw.githubusercontent.com/gorhill/uBlock/master/doc/benchmarks/privex-201409-30.png" /><br>
<sup>For details of benchmark, see 
<a href="https://github.com/gorhill/uBlock/wiki/%C2%B5Block-and-others:-Blocking-ads,-trackers,-malwares">µBlock and others: Blocking ads, trackers, malwares</a>.
</p>

#### Quick tests

- [Index](http://raymondhill.net/ublock/tests.html)
- [Web page components](http://raymondhill.net/ublock/tiles1.html)
- [Popups](http://raymondhill.net/ublock/popup.html)

## Installation

Feel free to read [about the extension's required permissions](https://github.com/gorhill/uBlock/wiki/About-the-required-permissions).

#### Chromium

You can install the latest version [manually](https://github.com/gorhill/uBlock/tree/master/dist#install), from the [Chrome Web Store](https://chrome.google.com/webstore/detail/cjpalhdlnbpafiamejdnhcphjbkeiagm), or from the [Opera store](https://addons.opera.com/en-gb/extensions/details/ublock/).

#### Firefox

Install from [Firefox Add-ons homepage](https://addons.mozilla.org/en-US/firefox/addon/ublock/), or you can install by downloading the latest [uBlock.firefox.xpi](https://github.com/gorhill/uBlock/releases) file, and by dragging the downloaded `xpi` file to your add-on page.

#### Safari

##### 8.0 or newer only

You can get and install the latest µBlock for Safari [right here](https://chrismatic.io/ublock).

µBlock is also available on the [Safari Extension Gallery](https://extensions.apple.com/details/?id=net.gorhill.uBlock-96G4BAKDQ9), although that's not guaranteed to be the latest version.

<sup>Safari versions prior to 8.0 have a bug triggering a crash during µBlock installation. It's not recommended that you attempt to install µBlock on them (*if you must, do it at your own risk*).</sup>

#### Note for all browsers

To benefit from µBlock's higher efficiency, it's advised that you don't use other inefficient blockers at the same time (such as AdBlock or Adblock Plus). µBlock will do [as well or better](#blocking) than most popular ad blockers.

## Release History

See the [releases pages](https://github.com/gorhill/uBlock/releases) for a history of releases and highlights for each release.

## Documentation

[Quick guide: popup user interface](https://github.com/gorhill/uBlock/wiki/Quick-guide:-popup-user-interface)

![Popup](https://raw.githubusercontent.com/gorhill/uBlock/master/doc/img/popup-1.png)

For advanced usage, read about [dynamic filtering](https://github.com/gorhill/uBlock/wiki/Dynamic-filtering:-quick-guide) and more on [µBlock's wiki](https://github.com/gorhill/uBlock/wiki).

## About

Free. Open source. For users by users. No donations sought.

Without the preset lists of filters, this extension is nothing. So if ever you
really do want to contribute something, think about the people working hard
to maintain the filter lists you are using, which were made available to use by
all for free.

You can contribute by helping to translate this project. There's an
[entry on Crowdin](https://crowdin.net/project/ublock) where you may contribute to µBlock's localization.

## License

[GPLv3](https://github.com/gorhill/uBlock/blob/master/LICENSE.txt).
