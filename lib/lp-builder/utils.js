'use strict';

var Path = require('path');
var utils = require('../utils');
var fs = require('fs');

exports.getAppDirs = function(config) {
  var re = /(.+)\/(.+)/;
  var listPath = Path.join(
    config.GAIA_DIR,
    'build',
    'config',
    config.GAIA_DEVICE_TYPE,
    'apps-' + config.GAIA_APP_TARGET + '.list'); 

  return utils.getFileContent(listPath).then(function(content) {
    var apps = {};
    content.split('\n').forEach(function(line) {
      line = line.trim();
      var matched = line.match(re);
      if (matched) {
        if (matched[2] !== '*') {
          if (apps[matched[2]]) {
            throw new Error('two apps with same name: \n  - ' + line);
          }
          if (utils.fileExists(Path.join(config.GAIA_DIR, line))) {
            apps[matched[2]] = line;
          }
     // XXX why isn't this used anywhere?
     // } else {
     //   var p = Path.join(config.GAIA_DIR, matched[1]);
     //   if (utils.fileExists(p)) {
     //     var dirs = utils.getDirs(p);
     //   }
        }
      } else if (line) {
        var msg = 'Unsupported path "' + line + '" in app list file.';
        console.log(msg);
        throw new Error(msg);
      }
    });
    return apps;
  });
};

exports.buildResourcePath = function(path, gaiaPath) {
  var pathChunks = utils.splitPath(path);
  var pos = pathChunks.indexOf('device_type');

  if (pos !== -1) {
    var fullPath = Path.join(gaiaPath, Path.dirname(path));

    var list = fs.readdirSync(fullPath).filter(function(dir) {
      return utils.isDirectory(Path.join(fullPath, dir));
    });

    // temporary
    list = ['phone'];

    var result = [];

    list.forEach(function(type) {
      var pcCopy = pathChunks.slice(0);
      pcCopy.splice(pos + 1, 0 , type);
      result.push(Path.join.apply(Path, pcCopy));
    });
    return result;
  }

  return path;
};

function importNodesFromSource(source) {
  var links = new Set();
  var match;
  var re = /<link[^>]*href\=\"(\/shared\/pages\/import\/[^"]+\.html)/ig;
  while ((match = re.exec(source)) !== null) {
    links.add(match[1]);
  }
  return links;
}

function extractResourcesFromDocument(gaiaPath, appPath, htmlPath, $, source) {
  var l10nScript = $('script[src*="l10n.js"], script[src*="l20n.js"]');
  var resNodes = $('link[rel="localization"]');
  var importNodes = importNodesFromSource(source);
  var links = [];
  var l10nLib = null;

  if (l10nScript.length) {
    var src = l10nScript[0].attribs.src;
    if (src.indexOf('l20n.js') !== -1) {
      l10nLib = 'l20n.js';
    } else if (src.indexOf('l10n.js') !== -1) {
      l10nLib = 'l10n.js';
    }
  }

  if (l10nLib === null) {
    if (source.indexOf('l20n.js') !== -1 || source.indexOf('l20n-client.js')
        !== -1) {
      l10nLib = 'l20n.js';
    } else if (source.indexOf('l10n.js') !== -1) {
      l10nLib = 'l10n.js';
    }
  }

  if (l10nLib === null) {
    l10nLib = 'l10n.js';
  }

  function pushToLinks(path) {
    links.push(path);
  }

  for (var i = 0; i < resNodes.length; i++) {
    var link = resNodes[i];
    var path = link.attribs.href;

    var normalized;

    var pathChunks = utils.splitPath(path);
    if (pathChunks[0] === 'shared') {
      normalized = path;
    } else if (path[0] === '/') {
      normalized = Path.join(Path.relative(gaiaPath, appPath), path);
    } else {
      normalized = Path.normalize(
        Path.relative(
          gaiaPath, Path.join(Path.dirname(htmlPath), path)));
    }

    var fullResPath = exports.buildResourcePath(normalized, gaiaPath);
    [].concat(fullResPath).forEach(pushToLinks);
  }

  var subResCalls = [];
  var subRes = {};

  importNodes.forEach(function(importNode) {
    var fullPath = Path.join(gaiaPath, importNode);
    subResCalls.push(
      exports.getResourcesFromHTMLFile(gaiaPath, appPath, fullPath).then(
        function(res) { subRes[importNode] = res[2]; }));
  }, this);

  return Promise.all(subResCalls).then(function() {
    function pushToLinks(res) {
      var pathChunks = utils.splitPath(res);
      if (pathChunks[0] === 'shared') {
        links.push(res);
      } else {
        links.push(Path.normalize(
          Path.relative(gaiaPath,
            Path.join(Path.dirname(htmlPath), res))));
      }
    }

    for (var i in subRes) {
      subRes[i].forEach(pushToLinks);
    }

    return [htmlPath, l10nLib, links];
  });
}

exports.getResourcesFromHTMLFile = function(gaiaPath, appPath, htmlPath) {
  return utils.getFileContent(htmlPath)
    .then(function(content) {
      if (content.indexOf('localization') === -1) {
        return [htmlPath, null, []];
      } else {
        return utils.getDocument(content).then(function($) {
          return extractResourcesFromDocument(
            gaiaPath, appPath, htmlPath, $, content);
        });
      }
    });
};

function isNotTestFile(path) {
  return path.indexOf('/test/') === -1;
}

exports.getResourcesFromHTMLFiles = function(gaiaPath, appPath) {
  var htmlPaths = utils.ls(appPath, true, /\.html$/).filter(isNotTestFile);
  return Promise.all(
    htmlPaths.map(
      exports.getResourcesFromHTMLFile.bind(null, gaiaPath, appPath)));
};

exports.getGaiaVersion = function(gaiaDir) {
  var settingsPath = Path.join(gaiaDir, 'build', 'config',
    'common-settings.json');

  return utils.getFileContent(settingsPath).then(function(source) {
    var settings = JSON.parse(source);
    return settings['langpack.channel'] || settings['moz.b2g.version'];
  });
};
