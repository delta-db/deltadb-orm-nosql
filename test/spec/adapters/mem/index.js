'use strict';

var MemAdapter = require('../../../../scripts/adapters/mem');

describe('mem custom', function () {

  var db = null,
    adapter = new MemAdapter();

  beforeEach(function () {
    db = adapter.db({
      db: 'mydb'
    });
  });

  afterEach(function () {
    return db.destroy();
  });

  it('should exclude docs', function () {
    var tasks = db.col('tasks'),
      sing = tasks.doc({
        thing: 'sing'
      }),
      write = tasks.doc({
        thing: 'write'
      });

    // Fake
    sing._include = function () {
      return false;
    };

    var includedTasks = [];
    tasks.all(function (task) {
      includedTasks.push(task);
    });
    includedTasks.should.eql([write]);
  });

});
