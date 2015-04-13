var Promise = require('promise');
var fs = require('fs');
var path = require('path');
var lpUtils = require('./utils');
var utils = require('../utils');

function LangpackBuilder(config) {
  this.config = config;

}

LangpackBuilder.tasks = {
  'manifest': require('./tasks/manifest').Task,
  'copy': require('./tasks/copy').Task,
  'appmanifests': require('./tasks/appmanifests').Task,
  'optimize': require('./tasks/optimize').Task
};

LangpackBuilder.prototype.init = function() {
  var tasks = [];
  tasks.push(lpUtils.getGaiaVersion(this.config.GAIA_DIR).then(function(gaiaVersion) {
    this.config.GAIA_VERSION = gaiaVersion;
  }.bind(this)));

  tasks.push(lpUtils.getAppDirs(this.config).then(function(appDirs) {
    this.config.GAIA_APPS = appDirs;
  }.bind(this)));


  return Promise.all(tasks);
}

LangpackBuilder.prototype.setupStage = function() {
  var out = this.config.LP_RESULT_DIR;
  if (utils.fileExists(out)) {
    utils.cleanDir(out);
  } else {
    fs.mkdirSync(out);
  }
}

LangpackBuilder.prototype.build = function() {
  this.setupStage();
  var apps = this.config.GAIA_APPS;
  //var apps = ['apps/settings'];

  var locale = this.config.LOCALES[0];
  fs.mkdirSync(path.join(this.config.LP_RESULT_DIR, locale));
  fs.mkdirSync(path.join(this.config.LP_RESULT_DIR, locale, 'apps'));

  var tasks = [];
  var appsProcessing = [];

  this.config.LP_APPS = {};

  Object.keys(apps).forEach(function(appName) {
    appsProcessing.push(lpUtils.getResourcesFromHTMLFiles(this.config.GAIA_DIR,
      path.join(this.config.GAIA_DIR, apps[appName]))
      .then(function(resTuples) {
        if (resTuples.length) {
          this.config.LP_APPS[appName] = apps[appName];

          this.config.LP_TASKS.forEach(function(taskName) {
            var task = LangpackBuilder.tasks[taskName];
            tasks.push(
              task(this, locale, apps[appName], resTuples));
          }, this);
        }
      }.bind(this)));
  }, this);

  return Promise.all(appsProcessing).then(function() {
    tasks.push(LangpackBuilder.tasks.manifest(this, locale));
    return Promise.all(tasks);
  }.bind(this));
}

exports.LangpackBuilder = LangpackBuilder;
