# <sub>![logo](https://raw.githubusercontent.com/gorhill/uBlock/master/src/img/browsericons/icon38.png)</sub> µBlock
<sub>pronounce _you-block_ as in "you decide what enters your browser" / see the "µ" as a stylish "u", to emphasize small resource footprint<br></sub><sup>sorry for the dubious name, we are coders, not marketers</sup>

**支持多浏览器的高效过滤工具，快速、有效且简洁。**

* [用途和常规信息](#基本观点)
* [性能和运行效率](#性能比较)
  * [内存占用](#内存占用)
  * [CPU 占用](#cpu-占用)
  * [屏蔽能力](#屏蔽能力)
  * [快速测试](#快速测试)
* [安装](#安装)
  * [Chromium](#chromium)
  * [Firefox](#firefox)
  * [Safari](#safari)
* [发布历史](#发布历史)
* [Wiki](https://github.com/fang5566/uBlock/wiki)

# ![Build](https://travis-ci.org/gorhill/uBlock.svg?branch=master)

## 基本观点

µBlock 不是一个*广告过滤工具*，它是具有一般性用途的过滤工具，屏蔽广告的功能是通过支持 [Adblock Plus 过滤规则语法](https://adblockplus.org/en/filters)实现的。µBlock 还[扩充](https://github.com/gorhill/uBlock/wiki/Filter-syntax-extensions)了语法，开发伊始就支持自定义过滤规则。

这就是说，最重要的是知道使用过滤工具**不是**一种[偷窃行为](https://twitter.com/LeaVerou/status/518154828166725632)，别总抱着这种令人不爽的想法。_最终_在逻辑上`屏蔽 = 偷窃`会成立的也是因侵犯隐私权利而被定罪。

Ads, "unintrusive" or not, are just the visible portions of privacy-invading apparatus entering your browser when you visit most sites nowadays. **µBlock's main goal is to help users neutralize such privacy-invading apparatus** — in a way that welcomes those users who don't wish to use more technical, involved means (such as [µMatrix](https://github.com/gorhill/uMatrix)).

μBlock 安装后会默认开启 _EasyList_、_Peter Lowe's Adservers_ 和 _EasyPrivacy_，此外还有许多规则列表可以屏蔽跟踪、分析行为和其他内容，我们也支持根据 hosts 文件来屏蔽。

## 性能比较

#### 内存占用

<div align="center">
从平均值来看，µBlock <b>的确</b>让你的浏览器运行起来更轻巧。<sup>[1]</sup><br><br>

Chromium <sup>[2]</sup><br>
<img src="https://raw.githubusercontent.com/gorhill/uBlock/master/doc/benchmarks/mem-usage-overall-chart-20141224.png" /><br><br>

Firefox<br>
<img src="https://raw.githubusercontent.com/gorhill/uBlock/master/doc/benchmarks/mem-usage-overall-chart-20150205.png" /><br><br>

Safari<br>
<img src="https://raw.githubusercontent.com/gorhill/uBlock/master/doc/benchmarks/mem-usage-overall-chart-safari-20150205.png" /><br><br>

</div>

<sup>[1] 基准测试详细情况参见： <a href="https://github.com/fang5566/uBlock/wiki/Firefox-version:-benchmarking-memory-footprint">Firefox version: benchmarking memory footprint</a>。</sup><br>

<sup>[2] 重要提示：目前[Chromium 39+ 存在一个每次打开扩展弹出界面时会产生新的内存泄漏的 bug](https://code.google.com/p/chromium/issues/detail?id=441500)，会影响<i>所有</i>扩展，在测量 Chromium 的内存占用时别忘了这点。我自己在测试中已避免完全打开弹出界面。</sup><br>

#### CPU 占用

<p align="center">
µBlock 也让 CPU 更省心<br>
<img src="https://raw.githubusercontent.com/gorhill/uBlock/master/doc/benchmarks/cpu-usage-overall-chart-20141226.png" /><br>
<sup>基准测试详细情况参见：<a href="https://github.com/gorhill/uBlock/blob/master/doc/benchmarks/cpu-usage-overall-20141226.ods">这个 LibreOffice spreadsheet</a>。</sup>
</p>

#### 屏蔽能力

<p align="center">
变得简洁高效并不意味着屏蔽得少<br>
<img src="https://raw.githubusercontent.com/gorhill/uBlock/master/doc/benchmarks/privex-201409-30.png" /><br>
<sup>基准测试详细情况参见： 
<a href="https://github.com/fang5566/uBlock/wiki/%C2%B5Block-and-others:-Blocking-ads,-trackers,-malwares">µBlock and others: Blocking ads, trackers, malwares</a>。
</p>

#### 快速测试

- [Index](http://raymondhill.net/ublock/tests.html)
- [Web page components](http://raymondhill.net/ublock/tiles1.html)
- [Popups](http://raymondhill.net/ublock/popup.html)

## 安装

你可以随意阅读一下 [about the extension's required permissions](https://github.com/gorhill/uBlock/wiki/About-the-required-permissions)。

#### Chromium

你可以打开[Chrome 网上应用店](https://chrome.google.com/webstore/detail/cjpalhdlnbpafiamejdnhcphjbkeiagm)或 [Opera 商店](https://addons.opera.com/en-gb/extensions/details/ublock/)来[手动](https://github.com/gorhill/uBlock/tree/master/dist#install)安装最新的版本。

#### Firefox

你可以到 [Firefox 附加组件主页](https://addons.mozilla.org/en-US/firefox/addon/ublock/)安装，或直接下载最新版本的 [uBlock.firefox.xpi](https://github.com/gorhill/uBlock/releases) 文件，将下载好的 `xpi` 文件拖动到附加组件管理器安装。

#### Safari

##### 仅支持 8.0 或更新的版本

你可以到[这里](https://chrismatic.io/ublock)安装最新版本的 µBlock for Safari。

你还可以在 [Safari Extension Gallery](https://extensions.apple.com/details/?id=net.gorhill.uBlock-96G4BAKDQ9) 下载 μBlock，不过不能保证你下载的是最新的版本。

<sup>早于 Safari 8.0 的版本存在一个在 μBlock 安装过程中会崩溃的 bug，所以不建议你使用这些版本安装 μBlock（*如果你一定要安装，请自担风险*）。</sup>

#### 所有浏览器的注意事项

为了能够真正感受到 µBlock 的高效，建议你不要同时安装其他的广告过滤工具，比如 AdBlock 或 Adblock Plus，因为 µBlock [绝不逊色于](#blocking)这些流行的广告过滤工具。

## 发布历史

你可以打开[发布页面](https://github.com/gorhill/uBlock/releases)了解所有发布历史以及每次发布时的关键更新。

## 文档

[Quick guide: popup user interface](https://github.com/fang5566/uBlock/wiki/Quick-guide:-popup-user-interface)

![Popup](https://raw.githubusercontent.com/gorhill/uBlock/master/doc/img/popup-1.png)

你还可以了解[动态过滤](https://github.com/gorhill/uBlock/wiki/Dynamic-filtering:-quick-guide)等高级功能，更多的高级用法参见 [µBlock 的 wiki 页面](https://github.com/gorhill/uBlock/wiki)。

## 关于

它是免费、开源的，属于用户也来自用户，无需任何捐助。

没有预置的规则列表，扩展什么事也做不到，所以如果你真心想尽一份力，不妨记住那些维护规则列表的人，是他们的努力才让我们能免费用上这些规则列表。

你可以通过协助翻译我们的项目来尽一份力，项目托管在 [Crowdin](https://crowdin.net/project/ublock)，你可以在这里参与 μBlock 的本地化工作。

## 许可协议

[GPLv3](https://github.com/gorhill/uBlock/blob/master/LICENSE.txt)
