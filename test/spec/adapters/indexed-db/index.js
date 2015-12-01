'use strict';

var commonUtils = require('deltadb-common-utils'),
  commonTestUtils = require('deltadb-common-utils/scripts/test-utils'),
  Promise = require('bluebird'),
  IDB = require('../../../../scripts/adapters/indexed-db'),
  testUtils = require('../../../utils');

describe('indexed-db custom', function () {

  var db = null,
    adapter = new IDB(),
    idb = null;

  beforeEach(function () {
    db = adapter.db({
      db: 'mydb'
    });
  });

  afterEach(function () {
    return db.destroy();
  });

  it('should create doc', function () {
    var tasks = db.col('tasks');

    var task = tasks.doc({
      thing: 'sing'
    });

    return task.set({
      priority: 'high'
    });
  });

  it('should reload', function () {

    var createTasks = function () {
      var tasks = db.col('tasks');

      return tasks.doc({
        $id: '1',
        thing: 'write'
      }).save().then(function () {
        return tasks.doc({
          $id: '2',
          thing: 'sing'
        }).save();
      });
    };

    var createColors = function () {
      var colors = db.col('colors');

      return colors.doc({
        $id: '3',
        name: 'red'
      }).save().then(function () {
        return colors.doc({
          $id: '4',
          name: 'green'
        }).save();
      });
    };

    var cols = {};

    var all = function () {
      var promises = [];
      db.all(function (col) {
        var docs = {};
        cols[col._name] = docs;
        var promise = col.all(function (doc) {
          docs[doc.id()] = doc.get();
        });
        promises.push(promise);
      });
      return Promise.all(promises);
    };

    var assert = function () {
      var expCols = {
        tasks: {
          '1': {
            $id: '1',
            thing: 'write'
          },
          '2': {
            $id: '2',
            thing: 'sing'
          }
        },
        colors: {
          '3': {
            $id: '3',
            name: 'red'
          },
          '4': {
            $id: '4',
            name: 'green'
          }
        }
      };
      testUtils.eql(expCols, cols);
    };

    db._destroy = commonUtils.resolveFactory(); // fake as we want to preserve for reload

    var restore = function () {
      return db.destroy().then(function () {
        idb = new IDB(); // Simulate a fresh instance during an initial load
        db = idb.db({
          db: 'mydb'
        });
        return commonUtils.once(db, 'load'); // wait for data to load
      }).then(function () {
        return all();
      }).then(function () {
        assert();
      });
    };

    return createTasks().then(function () {
      return createColors();
    }).then(function () {
      return restore();
    });

  });

  // TODO: remove after add offset functionality to IDB
  it('should throw error when finding with offset', function () {
    var users = db.col('users');

    return commonTestUtils.shouldThrow(function () {
      return users.find({
        offset: 0
      }, function () {});
    }, new Error());
  });

  // TODO: remove after add limit functionality to IDB
  it('should throw error when finding with limit', function () {
    var users = db.col('users');

    return commonTestUtils.shouldThrow(function () {
      return users.find({
        limit: 1
      }, function () {});
    }, new Error());
  });

  it('should close when not yet opened', function () {
    return db.close().then(function () {
      // We need to reopen the DB so that it can be destroyed. TODO: Is there a cleaner way?
      return db._reopen();
    });
  });

  it('should throw error when opening or closing', function () {
    var err = new Error('my err');
    return commonTestUtils.shouldThrow(function () {
      return db._openClose(commonUtils.promiseErrorFactory(err));
    }, err);
  });

});
