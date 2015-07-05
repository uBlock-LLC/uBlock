# CHANGELOG

## 1.1.1

  * Correctly handle streams with multibyte characters inside (#67 by @uggedal)

## 1.1.0

  * Bump react-tools to 0.13.0.

## 1.0.0

  * Add source maps support.
  * Remove deprecated `visitors` option.
  * Remove previously exposed `process` function (wasn't documented).

## 0.17.0

  * Add `--strip-types` option (command line) or `stripTypes` option (JS API) to
    strip type declarations from source code.

  * Deprecate `visitors` option. Custom visitors should be executed in a
    separate browserify transform rather than in reactify.

## 0.16.0

  * Add `target` parameter to specify target runtime. The only allowed value is
    `es5` at the moment.

## 0.15.1

  * Fix react-tools dependency

## 0.15.0

  * transform now works without the `@jsx` pragma

## 0.14.0

  * bump dependencies versions

  * remove deprecated features

## 0.13.1

  * bump dependencies jstransform dependency

## 0.13.0

  * include file path in error message.

## 0.11.0

  * add support for `--visitors` to allow additional jstransform visitors to be
    used for transformation.

## 0.10.0

  * add support for `--es6/--harmony` option to compile a limited set of es6
    into es5. Supported features are arrow functions, rest params, templates,
    object short notation and classes.

  * add support for `--everything` to apply transform to every module

## 0.9.1

  * fix mathcing filename for extension

## 0.9.0

  * bump jstransform to 0.9.0

## 0.8.0

  * bump react-tools version to 0.9.0

  * deprecate reactify/undoubted transform

  * -x/--extension command line option to process files with specified extension

## 0.7.0

  * bump jstransform version

## 0.6.1

  * fix transform function override

## 0.6.0

  * allow transform function to be passed as an argument

  * export isJSXExtension regexp

## 0.5.1

  * add "browserify-transform" keyword to package metadata

## 0.5.0

  * move react-tools from peer deps to deps, update to 0.8.0

## 0.4.0

  * update to react-tools 0.5.0
  * mention filename if transform error occurred
  * fix bug with callstack explosion

## 0.3.1

  * rewrite in javascript

## 0.3.0

  * reactify/no-doubt transform which doesn't not require pragma even for .js
    files

## 0.2.2

  * check for the presence of @jsx pragma

## 0.2.1

  * update to react-tools 0.4.1

## 0.2.0

  * update to react-tools 0.4.0

## 0.1.4

  * fix test for @jsx pragma

## 0.1.3

  * preserve line numbers during transform

## 0.1.2

  * emit error event on error

## 0.1.1

  * update to react-tools 0.3.1
  * specs

## 0.1.0

  * initial release
