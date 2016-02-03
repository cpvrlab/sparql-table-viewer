// We have to require our dependencies
var gulp = require('gulp');

var ghPages = require('gulp-gh-pages');
var sass = require('gulp-sass');
var clean = require('gulp-clean');
var jshint = require('gulp-jshint');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var imagemin = require('gulp-imagemin');
var util = require('gulp-util');

var bases = {
 app: 'app/',
 dist: 'dist/',
};

var paths = {
 scripts: ['js/**/*.js', '!scripts/libs/**/*.js'],
 libs: ['lib/**'],
 css: ['css/**/*.scss'],
 html: ['index.html'],
 images: ['images/**/*.png', 'images/**/*.gif'],
};

// gh pages deploy task
gulp.task('deploy', function() {
  return gulp.src('./dist/**/*')
    .pipe(ghPages({push: false}));
});

// Delete the dist directory
gulp.task('clean', function() {
 return gulp.src(bases.dist)
 .pipe(clean());
});

// Process scripts and concatenate them into one output file
gulp.task('scripts', function() {
 gulp.src(paths.scripts, {cwd: bases.app})
 .pipe(jshint())
 .pipe(jshint.reporter('default'))
 .pipe(uglify())
 .pipe(concat('app.min.js'))
 .pipe(gulp.dest(bases.dist + 'js/'));
});

// Imagemin images and ouput them in dist
gulp.task('imagemin', function() {
 gulp.src(paths.images, {cwd: bases.app})
 .pipe(imagemin())
 .pipe(gulp.dest(bases.dist + 'images/'));
});

// compile Sass into CSS using gulp-sass
gulp.task('css', function() {
   gulp.src(['./app/**/*.scss'])
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
});

// A development task to run anytime a file changes
gulp.task('watch', function() {
 gulp.watch('app/**/*', ['scripts', 'css', 'copy']);
});

// Define the default task as a sequence of the above tasks
gulp.task('default', ['clean', 'scripts', 'css', 'imagemin', 'copy']);