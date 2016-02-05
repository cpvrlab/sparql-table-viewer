// We have to require our dependencies
var gulp = require('gulp');

var ghPages = require('gulp-gh-pages');
var sass = require('gulp-sass');
var del = require('del');
var jshint = require('gulp-jshint');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var imagemin = require('gulp-imagemin');
var util = require('gulp-util');
var runSequence = require('run-sequence');
var browserSync = require('browser-sync');
var reload = browserSync.reload;

var bases = {
    app: 'app/',
    dist: 'dist/',
};

var paths = {
    scripts: ['js/**/*.js', '!scripts/libs/**/*.js'],
    libs: ['lib/**'],
    css: ['css/**/*.scss'],
    html: ['index.html', '*.html'],
    images: ['images/**/*.png', 'images/**/*.gif'],
    elements: ['elements/**/*.html'],
};


// Delete the dist directory
gulp.task('clean', function() {
    return del(bases.dist);
});

// Process scripts and concatenate them into one output file
gulp.task('scripts', function() {
    return gulp.src(paths.scripts, {cwd: bases.app})
    .pipe(jshint())
    .pipe(jshint.reporter('default'))
    //.pipe(uglify())
    .pipe(concat('app.min.js'))
    .pipe(gulp.dest(bases.dist + 'js/'));
});

// Imagemin images and ouput them in dist
gulp.task('imagemin', function() {
    return gulp.src(paths.images, {cwd: bases.app})
    .pipe(imagemin())
    .pipe(gulp.dest(bases.dist + 'images/'));
});

// compile Sass into CSS using gulp-sass
gulp.task('css', function() {
    return gulp.src(['./app/**/*.scss'])
    .pipe(sass({style: 'expanded'}))
    .pipe(gulp.dest('./dist/'));
});

// Copy all other files to dist directly
gulp.task('copy', function() {
    // Copy html
    gulp.src(paths.html, {cwd: bases.app})
    .pipe(gulp.dest(bases.dist));

    // Copy lib scripts, maintaining the original directory structure
    gulp.src(paths.libs, {cwd: 'app/**'})
    .pipe(gulp.dest(bases.dist));

    // Copy lib scripts, maintaining the original directory structure
    return gulp.src(paths.elements, {cwd: 'app/**'})
    .pipe(gulp.dest(bases.dist));
});

// gh pages deploy task
gulp.task('deploy-gh-pages', function() {
    return gulp.src('./dist/**/*')
    .pipe(ghPages({push: false, message: "update"}));
});

gulp.task('deploy', function(cb) {
    runSequence('default',
        'deploy-gh-pages', 
        cb);
});

// A development task to run anytime a file changes
gulp.task('watch', function() {
    gulp.watch('app/**/*', ['scripts', 'css', 'copy']);
});


// Build task
gulp.task('build', function(cb) {
    runSequence('clean',
        ['scripts', 'css', 'imagemin', 'copy'], 
        cb);
});


gulp.task('serve', ['build'], function() {
  browserSync.init({
    server: {
      baseDir: bases.dist
    }
  });

  gulp.watch(['app/**/*.html'], ['copy', reload]);
  gulp.watch(['app/css/**/*.css', 'app/css/**/*.scss'], ['css', reload]);
  gulp.watch(['app/images/**/*'], ['imagemin', reload]);
  gulp.watch(['app/js/**/*.js'], ['scripts', reload]);
});


gulp.task('default', ['build']);

