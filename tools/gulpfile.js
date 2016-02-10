
var gulp = require('gulp'); 
var browserify = require('browserify');
var reactify = require('reactify');
var envify = require('envify');
var source = require('vinyl-source-stream');


var environment = process.env.NODE_ENV;

var envParams;
if (environment === 'dev') {
    envParams = {
        // TODO: update to dev path
        GOODBLOCK_SCRIPT_SRC: '/example-path/example.js',
    };
};
if (environment === 'production') {
    envParams = {
        GOODBLOCK_SCRIPT_SRC: 'https://s3-us-west-2.amazonaws.com/goodblock-extension-static/gb.js',
    };
};

function handleError(e) {
    // Log the error.
    console.log(e);

    // On Gulp error, have OSX create a push notification.
    child_process.exec(
        "osascript -e 'display notification \"Check your Gulp console.\" with title \"Gulp error\" '",
        {shell: '/bin/bash'},
        function (err, stdout, stderr) {
            console.log(stdout);
            console.log(stderr);
        }
    );
}


gulp.task('scripts', function() {

    var filename = '../src/js/contentscript-goodblock.jsx';
    var outputDir = '../dist/build/goodblock.chromium/js/';

    return browserify(filename)
        .transform(reactify)
        .transform(['envify', envParams])
        .bundle()
        .pipe(source('contentscript-goodblock.js'))
        .pipe(gulp.dest(outputDir));

});

gulp.task('default', ['scripts']);
