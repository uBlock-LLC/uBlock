# reactify

[Browserify][] transform for JSX (superset of JavaScript used in [React][]
library):

    var React = require('react')

    class Hello extends React.Component {

      render() {
        return <div>Hello, {this.props.name}!</div>
      }
    }

Save the snippet above as `main.js` and then produce a bundle with the following
command:

    % browserify -t reactify main.js

`reactify` transform activates for files with either `.js` or `.jsx` extensions.

If you want to reactify modules with other extensions, pass an `-x /
--extension` option:

    % browserify -t coffeeify -t [ reactify --extension coffee ] main.coffee

If you don't want to specify extension, just pass `--everything` option:

    % browserify -t coffeeify -t [ reactify --everything ] main.coffee

## ES6 transformation

`reactify` transform also can compile a limited set of es6 syntax constructs
into es5. Supported features are arrow functions, rest params, templates, object
short notation and classes. You can activate this via `--es6` or `--harmony`
boolean option:

    % browserify -t [ reactify --es6 ] main.js

es6 class getter and setter methods can be activated via `--target es5` option:

    % browserify -t [ reactify --es6 --target es5 ] main.js

You can also configure it in package.json

```json
{
    "name": "my-package",
    "browserify": {
        "transform": [
            ["reactify", {"es6": true}]
        ]
    }
}
```

## Troubleshooting

### Code in 3rd-party packages isn't being transformed by reactify

By default Browserify applies transforms only for modules in the current package. That means that if there are modules with JSX in packages in `node_modules/` directory then browserify will throw SyntaxError left and right even if you are using reactify.

The best way to fix that is ask package author to publish to npm with code compiled down to plain ES5 which is runnable in browsers and Node.js as-is.

Another approach is to ask to add
```
"browserify": {
  "transform": ["reactify"]
}
```
to the package's `package.json`. That will make Browserify apply reactify transform for that package too.

Another way is to activate reactify with `-g` option which will instruct Browserify to apply reactify to every module it encounters:
```
% browserify -g reactify main.js
```
Note that this will lead to slower builds as every module will be parsed and transformed by reactify even if it doesn't have JSX code in it. 


[Browserify]: http://browserify.org
[React]: http://facebook.github.io/react/
