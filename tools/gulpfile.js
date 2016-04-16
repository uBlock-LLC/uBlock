
var gulp = require('gulp'); 
var browserify = require('browserify');
var reactify = require('reactify');
var envify = require('envify');
var source = require('vinyl-source-stream');


var environment = process.env.NODE_ENV;

var envParams;
if (environment === 'dev') {
    envParams = {
        GOODBLOCK_SCRIPT_SRC: 'https://goodblock.gladly.dev/static/js/goodblock-script.js',
        GOODBLOCK_POPUP_URL: 'https://goodblock.gladly.dev/app/dashboard/',
    };
};
if (environment === 'production') {
    envParams = {
        GOODBLOCK_SCRIPT_SRC: 'https://s3-us-west-2.amazonaws.com/goodblock-extension-static/gb.js',
        GOODBLOCK_POPUP_URL: 'https://goodblock.gladly.io/app/dashboard/',
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

function buildScript(filename, outputDir, outputName) {
    browserify(filename)
        .transform(reactify)
        .transform(['envify', envParams])
        .bundle()
        .pipe(source(outputName))
        .pipe(gulp.dest(outputDir));
}

var files = [
    {
        filename: '../src/js/contentscript-goodblock.jsx',
        outputDir: '../dist/build/goodblock.chromium/js/',
        outputName: 'contentscript-goodblock.js',
    },
    {
        filename: '../src/js/goodblock-popup.js',
        outputDir: '../dist/build/goodblock.chromium/js/',
        outputName: 'goodblock-popup.js',
    },
];


gulp.task('scripts', function() {

    files.forEach(function(file) {
        buildScript(file.filename, file.outputDir, file.outputName);
    });

});

gulp.task('default', ['scripts']);
