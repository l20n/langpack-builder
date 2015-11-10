'use strict';
/* global suite, test */

var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');
var deepEqual = require('deep-equal');

var LangpackBuilder = require('../lib/lp-builder').LangpackBuilder;

var config = {
  GAIA_DEFAULT_LOCALE: 'en-US',
  GAIA_APP_TARGET: 'production',
  MOZILLA_OFFICIAL: 1,
  GAIA_DEVICE_TYPE: 'phone',
  GAIA_DOMAIN: 'gaiamobile.org',
  GAIA_VERSION: null,
  GAIA_DIR: './tests/tmp/gaia',
  GAIA_APPS: null,

  LP_RESULT_DIR: './tests/out',
  LP_VERSION: '1.0.0',
  LP_APPS: null,
  LP_APP_TASKS: ['copy', 'appmanifests', 'optimize'],
  LP_LOCALE_TASKS: ['copySpeechData'],

  LOCALES: ['fr'],
  LOCALE_BASEDIR: './tests/tmp/gaia-l10n/fr',
};

function updateGaiaRevision(rev) {
  return new Promise(function(resolve, reject) {
    exec('cd ' + config.GAIA_DIR + ' && git co ' + rev,
      function(error, stdout) {
        if (error) {
          reject(error);
        } else {
          var gaia_rev = stdout.trim();
          resolve(gaia_rev);
        }
      });
  });
}

function updateLocaleRevision(rev) {
  return new Promise(function(resolve, reject) {
    exec('cd ' + config.LOCALE_BASEDIR + ' && hg co ' + rev,
      function (error, stdout) {
        if (error) {
          reject(error);
        } else {
          var hg_rev = stdout.trim();
          resolve(hg_rev);
        }
      });
  });
}

function updateRevisions(gaia, l10n) {
  return Promise.all([
    updateGaiaRevision(gaia),
    updateLocaleRevision(l10n)
  ]);
}

function compareManifests(path1, path2) {
  var source1 = fs.readFileSync(path1, 'utf8');
  var source2 = fs.readFileSync(path2, 'utf8');

  var man1 = JSON.parse(source1);
  var man2 = JSON.parse(source2);

  man1['languages-provided'].fr.revision = null;
  man2['languages-provided'].fr.revision = null;
  return deepEqual(man1, man2);
}

var rmdir = function(dir) {
  var list = fs.readdirSync(dir);
  for (var i = 0; i < list.length; i++) {
    var filename = path.join(dir, list[i]);
    var stat = fs.statSync(filename);

    if (filename !== '.' && filename !== '..') {
      if (stat.isDirectory()) {
        // rmdir recursively
        rmdir(filename);
      } else {
        // rm filename
        fs.unlinkSync(filename);
      }
    }
  }
  fs.rmdirSync(dir);
};

function cleanup() {
  if (!fs.existsSync('./tests/out')) {
    fs.mkdirSync('./tests/out');
    return;
  }

  if (fs.existsSync('./tests/out/fr')) {
    rmdir('./tests/out/fr');
  }

  if (fs.existsSync('./tests/out/manifest.webapp')) {
    fs.unlinkSync('./tests/out/manifest.webapp');
  }
}

function build() {

  var lpBuilder = new LangpackBuilder(config);
  return lpBuilder.init().then(lpBuilder.build.bind(lpBuilder));
}

function compare(ver) {
  return new Promise(function(resolve, reject) {
    exec('diff -uNr ./tests/out/fr ./tests/fixture/' + ver + '/fr',
      function(error, stdout) {
        if (stdout.length === 0) {
          if (compareManifests(
              './tests/out/manifest.webapp',
              './tests/fixture/' + ver + '/manifest.webapp')) {
            resolve();
          } else {
            reject('manifest mismatch');
          }
        } else {
          reject(stdout);
        }
      });
  });
}

function checkIcon() {
  return new Promise(function(resolve, reject) {
    fs.stat('./res/icon.png', function (err, stats1) {
      fs.stat('./tests/out/icon.png', function (err, stats2) {
        if (stats1.size === stats2.size) {
          resolve();
        } else {
          reject('icon not copied properly');
        }
      });
    });
  });
}

suite('Lp builder', function() {
  test('build french locale identical to fixture (2.2)', function(done) {
    this.timeout(5000);
    updateRevisions('791e53728cd8018f1d7cf7efe06bbeb1179f0370', '7ea0828dcc36')
      .then(cleanup)
      .then(build)
      .then(compare.bind(null, '2.2'))
      .then(checkIcon)
      .then(function() {
      done();
    }).catch(function(e) {
      done(new Error(e));
    });
  });

  test('build french locale identical to fixture (2.5)', function(done) {
    this.timeout(5000);
    updateRevisions('07baf61', 'd14947328aa0')
      .then(cleanup)
      .then(build)
      .then(compare.bind(null, '2.5'))
      .then(checkIcon)
      .then(function() {
      done();
    }).catch(function(e) {
      done(new Error(e));
    });
  });
});
