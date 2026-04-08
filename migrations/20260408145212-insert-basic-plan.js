'use strict';

var dbm;
var type;
var seed;
var fs = require('fs');
var path = require('path');
var Promise;

/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

exports.up = function (db) {
  var filePath = path.join(__dirname, 'sqls', '20260408145212-insert-basic-plan-up.sql');
  return new Promise(function (resolve, reject) {
    fs.readFile(filePath, { encoding: 'utf-8' }, function (err, data) {
      if (err) return reject(err);
      console.log('received data: ' + data);

      resolve(data);
    });
  })
    .then(function (data) {
      var statements = data.split(';\n').map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
      return statements.reduce(function (promise, statement) {
        return promise.then(function () { return db.runSql(statement); });
      }, Promise.resolve());
    });
};

exports.down = function (db) {
  var filePath = path.join(__dirname, 'sqls', '20260328171559-insert-table-pgx-data-down.sql');
  return new Promise(function (resolve, reject) {
    fs.readFile(filePath, { encoding: 'utf-8' }, function (err, data) {
      if (err) return reject(err);
      console.log('received data: ' + data);

      resolve(data);
    });
  })
    .then(function (data) {
      var statements = data.split(';\n').map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
      return statements.reduce(function (promise, statement) {
        return promise.then(function () { return db.runSql(statement); });
      }, Promise.resolve());
    });
};

exports._meta = {
  "version": 1
};
