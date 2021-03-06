'use strict';

var utils = require('../../utils'),
  Promise = require('bluebird');

// TODO: split into separate tests

var Adapter = function (AdapterClass, name) {
  this._Adapter = AdapterClass;
  this._adapter = new AdapterClass();
  this._name = name;
};

Adapter.prototype.test = function () {

  var adapter = this._adapter; // for convenience

  describe(this._name + ' common', function () {

    var db = null;

    beforeEach(function () {
      db = adapter.db({
        db: 'mydb'
      });
    });

    afterEach(function () {
      return db.destroy();
    });

    it('should work', function () {

      var users = db.col('users');

      var user1 = users.doc({
        name: 'Jack',
        age: 24
      });

      var user2 = users.doc({
        name: 'Jill',
        age: 23
      });

      return user1.save().then(function () {
        return user2.save();
      }).then(function () {
        return users.get(user1.id());
      }).then(function (userFound) {
        var doc = userFound.get();
        doc.should.eql({
          $id: user1.id(),
          name: 'Jack',
          age: 24
        });
      }).then(function () {
        user1._set('age', 25);
        var updates = user1.get(true);
        updates.should.eql({
          age: 25
        });
        return user1.save();
      }).then(function () {
        return users.get(user1.id());
      }).then(function (userFound) {
        var doc = userFound.get();
        doc.should.eql({
          $id: user1.id(),
          name: 'Jack',
          age: 25
        });
      }).then(function () {
        return utils.allShouldEql([{
          $id: user1.id(),
          name: 'Jack',
          age: 25
        }, {
          $id: user2.id(),
          name: 'Jill',
          age: 23
        }], users);
      }).then(function () {
        return utils.findShouldEql(
          [{
            $id: user2.id(),
            name: 'Jill',
            age: 23
          }, {
            $id: user1.id(),
            name: 'Jack',
            age: 25
          }],
          users, {
            where: [
              ['age', '<', 25], 'or', ['name', '=', 'Jack']
            ],
            order: ['age', 'asc']
              // offset: 0, // TODO: uncomment when working with indexeddb
              // limit: 2 // // TODO: uncomment when working with indexeddb
          }
        );
      }).then(function () {
        return user1.destroy();
      }).then(function () {
        return utils.allShouldEql([{
          $id: user2.id(),
          name: 'Jill',
          age: 23
        }], users);
      });
    });

    it('should lookup collection', function () {
      var users = db.col('users');

      var user = users.doc({
        name: 'Jack',
        age: 24
      });

      return user.save().then(function () {
        return db.col('users');
      }).then(function (users2) {
        users2.should.eql(users);
      });
    });

    it('should get missing doc', function () {
      var users = db.col('users');
      return users.get('missing').then(function (user) {
        (user === null).should.eql(true);
      });
    });

    it('should retrieve existing db', function () {
      var db2 = adapter.db({
        db: db._name // use same DB name
      });
      db2.should.eql(db);
    });

    it('should destroy collection', function () {
      var users = db.col('users');
      return users.destroy();
      // TODO: also test using same db after destroying col as in IDB need to close DB to destroy
      // col
    });

    it('should set', function () {
      var tasks = db.col('tasks'),
        task = tasks.doc();
      task.set({
        thing: 'paint'
      });
      task.get().thing.should.eql('paint');
    });

    it('should unset', function () {
      var users = db.col('users');

      var user = users.doc({
        name: 'Jack',
        age: 24
      });

      return user.save().then(function () {
        return user.unset('age');
      }).then(function () {
        user.get().should.eql({
          $id: user.id(),
          name: 'Jack'
        });
      });
    });

    it('should include', function () {
      // TODO: this test is only for coverage, make it more meaningful
      var users = db.col('users');
      var user = users.doc();
      (user._include() !== null).should.eql(true);
    });

    it('should stop all if callback returns false', function () {
      var tasks = db.col('tasks'),
        promises = [];

      // Populate tasks
      for (var i = 0; i < 10; i++) {
        promises.push(tasks.doc().save());
      }

      var max = 2,
        n = 0;

      return Promise.all(promises).then(function () {
        return tasks.all(function () {
          if (++n === max) {
            return false;
          }
        });
      }).then(function () {
        // Make sure that all loop only executed max times
        // n.should.eql(max); // Doesn't work in IE 9
        (n === max).should.eql(true);
      });
    });

    it('should instantiate doc with id', function () {
      var tasks = db.col('tasks'),
        data = {
          $id: '1'
        },
        task = tasks.doc(data);
      task.get().should.eql(data);
    });

    it('should get doc ref', function () {
      var tasks = db.col('tasks'),
        task = tasks.doc();
      task.getRef().should.eql(task._data);
    });

    it('should get existing doc', function () {
      var tasks = db.col('tasks'),
        task = tasks.doc();
      tasks.doc({
        $id: task.id()
      }).should.eql(task);
    });

    it('should get all collections', function () {
      var tasks = db.col('tasks'),
        tags = db.col('tags'),
        cols = {};

      db.all(function (col) {
        cols[col._name] = true;
        if (col._name === 'tasks') {
          col.should.eql(tasks);
        } else {
          col.should.eql(tags);
        }
      });

      cols.should.eql({
        tasks: true,
        tags: true
      });
    });

    it('should simulatenously create docs in different collections', function () {
      // The Safari implementation of IndexedDB has some serious issues such as the fact that fact
      // that you cannot create object stores in separate transactions, which means that you cannot
      // create object stores dynamically: http://stackoverflow.com/questions/34124846. This test
      // covers this condition.

      var tasks = db.col('tasks'),
        tags = db.col('tags'),
        promises = [];

      promises.push(tasks.doc({
        thing: 'sing'
      }).save());

      promises.push(tags.doc({
        text: 'personal'
      }).save());

      return Promise.all(promises);
    });

  });

};

module.exports = Adapter;
