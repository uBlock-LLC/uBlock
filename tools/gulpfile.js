
var gulp = require('gulp'); 
var browserify = require('browserify');
var reactify = require('reactify');
var envify = require('envify');


var environment = process.env.NODE_ENV

var envParams = {
};

gulp.task('scripts', function() {
    
    // TODO: build the Goodblock content script.
    console.log('NODE_ENV is ' + environment);

});

gulp.task('default', ['scripts']);
