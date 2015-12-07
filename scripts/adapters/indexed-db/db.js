'use strict';

// NOTE: we only use the index on the primary key -- in future support indexes (NEED MORE NOTES ON
// THIS!!)
// TODO: because of indexing complexity need one store per DB?

var Promise = require('bluebird'),
  inherits = require('inherits'),
  CommonDB = require('../../common/db'),
  Collection = require('./collection'),
  utils = require('deltadb-common-utils'),
  idbUtils = require('./utils');

// Use a shim as phantomjs doesn't support IndexedDB and we need to simulate IndexedDB in Safari via
// WebSQL
require('indexeddbshim'); // Automatically sets window.shimIndexedDB

/**
 * It appears that the IndexedDB spec takes some shortcuts. In order to create an object store, you
 * need to first close any open DB then re-open while triggering a DB upgrade. Therefore, you need
 * to worry about synchronizing transactions so that you are not executing a transaction while
 * opening/closing a DB or vise-versa. We'll handle this detail in this adapter so that the end user
 * doesn't have to.
 *
 * Synchronization:
 * - The initial open is triggered by the constructor and the 'open' event is fired when the open
 *   has completed
 * - All open/close operations are queued together as they need to be executed in sequence as the
 *   same IndexedDB cannot be opened/closed simulatenously
 * - All transactions are queued together as they can be executed simulatenously, but not during any
 *   open/closes
 * - Upon queuing a open/close or transaction the _processQueue() is triggered, which ensures that
 *   the above rules are followed
 * - After the first open has completed, _processQueue() is called in case any processes have been
 *   queued before the initial open
 */
var DB = function () {

  CommonDB.apply(this, arguments); // apply parent constructor
  this._cols = {};
  this._pendingObjectStores = [];

  // Promise that guarantees that DB is open
  this._opened = utils.once(this, 'open');

  this._opensCloses = []; // used to synchronize open/close transactions
  this._transactions = []; // used to synchronize transactions

  this._load();
};

inherits(DB, CommonDB);

// TODO: use browser detection to set to 0 when not Safari or IE The Safari/IE IndexedDB
// implementations still have some bugs and we need to sleep for a little bit before
// destroying/opening the DB to make sure that we don't get any blocking errors from transactions
// that have yet to complete. IE and Safari still have a long way to go when it comes to fully
// implementing IndexedDB: http://w3c.github.io/test-results/IndexedDB/all.html
DB._SLEEP_MS = 400;

DB.prototype._setDB = function (request) {
  this._db = request.result;
  this._version = parseInt(this._db.version);
};

// Package open as a promise so that we can consolidate code and provide a single place to test the
// error case
DB.prototype._open = function (onUpgradeNeeded, onSuccess) {
  var self = this;
  return new Promise(function (resolve, reject) {

    var request = null;
    if (self._version) {
      request = idbUtils.indexedDB().open(self._name, self._version);
    } else { // 1st time opening?
      request = idbUtils.indexedDB().open(self._name);
    }

    request.onupgradeneeded = function () {
      self._setDB(request);
      if (onUpgradeNeeded) {
        onUpgradeNeeded(request, resolve);
      }
    };

    request.onsuccess = function () {
      self._setDB(request);
      onSuccess(request, resolve);
      self.emit('open');

      // Process queue in case transactions have been waiting for this open
      self._processQueue();
    };

    // TODO: fake indexedDB to unit test
    /* istanbul ignore next */
    request.onerror = function () {
      reject(request.error);
    };
  });
};

DB.prototype._initStore = function () {
  var self = this;
  return self._open(null, function (request, resolve) {
    resolve();
  });
};

DB.prototype._openAndCreateObjectStore = function (name) {
  var self = this;

  var onUpgradeNeeded = function () {
    self._db.createObjectStore(name, {
      keyPath: self._idName
    });
  };

  var onSuccess = function (request, resolve) {
    resolve();
  };

  // Close any existing connection. We cannot reopen until we close first
  return self._close().then(function () {
    self._version++; // Increment the version that we can add the object store
    return self._open(onUpgradeNeeded, onSuccess);
  });
};

DB.prototype._getOrCreateObjectStore = function (name) {
  if (this._db.objectStoreNames.contains(name)) { // exists?
    return Promise.resolve();
  } else {
    return this._openAndCreateObjectStore(name);
  }
};

DB.prototype._createObjectStore = function (name) {
  var self = this;
  // Make sure cols have been loaded before trying to create cols so that we don't create a col that
  // already exists
  return self._loaded.then(function () {
    return self._openClose(function () {
      return self._getOrCreateObjectStore(name);
    });
  });
};

DB.prototype.col = function (name) {
  if (this._cols[name]) { // exists?
    return this._cols[name];
  } else {
    var col = new Collection(this, name);
    this._cols[name] = col;
    return col;
  }
};

DB.prototype._close = function () {
  var self = this;
  return new Promise(function (resolve) {
    self._db.close(); // Close is synchronous
    resolve();
  });
};

DB.prototype.close = function () {
  var self = this;

  return self._openClose(function () {
    // close() is meant to be called when the database is to be permanently closed. At this point
    // we'll set _closed so that processQueue no longer executes any transactions
    self._closed = true;

    return self._close();
  });
};

DB.prototype._reopen = function () {
  this._closed = false;
  this._initLoaded();
  return this._load();
};

DB.prototype._queueOpenClose = function (promise) {
  this._opensCloses.push(promise);
};

DB.prototype._queueTransaction = function (promise) {
  this._transactions.push(promise);
};

DB.prototype._promiseFactory = function (promise) {
  return function () {
    return promise();
  };
};

DB.prototype._processOpensCloses = function () {
  // We need to process these sequentially as we can only open/close the DB in a synchronized way
  var chain = Promise.resolve();
  while (this._opensCloses.length > 0) { // more?
    var promise = this._opensCloses.shift();
    chain = chain.then(this._promiseFactory(promise));
  }
  return chain;
};

DB.prototype._processTransactions = function () {
  // We can process transactions simulatenously
  var promises = [];
  while (this._transactions.length > 0) { // more?
    var promise = this._transactions.shift();
    promises.push(promise()); // Need to execute the promise
  }
  return Promise.all(promises);
};

DB.prototype._moreToProcess = function () {
  return this._transactions.length > 0 || this._opensCloses.length > 0;
};

DB.prototype._processQueue = function () {
  var self = this;

  // not already processing or closed?
  if (!self._processingQueue && !self._closed) {
    self._processingQueue = true; // allow others to know that we are processing the queue

    // Make sure the DB is open
    return self._opened.then(function () {
      // First process any opens/closes
      return self._processOpensCloses();
    }).then(function () {
      // Then process any executing transactions if not closed
      if (!self._closed) {
        return self._processTransactions();
      }

      return null; // prevent runaway promise warning
    }).then(function () {
      self._processingQueue = false; // allow others to know we are done

      // Has anything been queued since we started processing?
      if (self._moreToProcess()) {
        self._processQueue(); // process again
      }

      return null; // prevent runaway promise warning
    });
  }
};

DB.prototype._transaction = function (promise) {
  var self = this;
  return new Promise(function (resolve, reject) {
    self._queueTransaction(function () {
      // Resolve after promise resolves so that processQueue() can wait for resolution
      return promise().then(function () {
        resolve(arguments[0]); // Return promise so caller can wait for resolution
      }).catch(function (err) {
        // Don't throw error here so that processQueue() can continue processing
        reject(err); // Reject with error so that caller can receive error
      });
    });
    self._processQueue();
  });
};

DB.prototype._openClose = function (promise) {
  var self = this;
  return new Promise(function (resolve, reject) {
    self._queueOpenClose(function () {
      // Resolve after promise resolves so that processQueue() can wait for resolution
      return promise().then(function () {
        resolve(arguments[0]); // Return promise so caller can wait for resolution
      }).catch(function (err) {
        // Don't throw error here so that processQueue() can continue processing
        reject(err); // Reject with error so that caller can receive error
      });
    });
    self._processQueue();
  });
};

// We need to retry when deleting the DB in browsers like IE. We serialize all our transactions and
// if these browsers implemented the IndexedDB spec properly, the onsuccess method for our
// transactions would only be called after the transactions have completed. Unfortunately, this is
// not the case so we may need to make several attempts to destroy the database as we have no
// reliable way to determine that the transactions have completed.
DB.MAX_DESTROY_RETRIES = 5;
DB.DESTROY_RETRY_SLEEP_MS = 500;

DB.prototype._destroy = function (retries) {
  var self = this;
  return new Promise(function (resolve, reject) {

    var req = idbUtils.indexedDB().deleteDatabase(self._name);

    req.onsuccess = function () {
      resolve();
    };

    // TODO: fake indexedDB to unit test
    /* istanbul ignore next */
    req.onerror = function () {
      reject(new Error("Couldn't destroy database " + self._name + ": " + req.err));
    };

    // TODO: fake indexedDB to unit test
    /* istanbul ignore next */
    req.onblocked = function () {
      retries = retries ? retries : 0;
      if (retries <= DB.MAX_DESTROY_RETRIES) { // Retry?
        var promise = utils.timeout(DB.DESTROY_RETRY_SLEEP_MS).then(function () {
          return self._destroy(retries + 1);
        });
        resolve(promise);
      } else {
        reject(new Error("Couldn't destroy database " + self._name + " as blocked: err=" +
          req.err));
      }
    };
  });
};

DB.prototype._closeDestroyUnregister = function () {
  var self = this;
  self._closed = true; // prevent any more queue processing
  // The DB must be closed before we destroy it
  return self._close().then(function () {
    return self._destroy();
  }).then(function () {
    return self._adapter._unregister(self._name);
  });
};

DB.prototype.destroy = function () {
  var self = this;
  // We wait for the store to be loaded before closing the store as we wait for this same event
  // when creating a store and we don't want to try to close a store before we have opened it.
  return self._loaded.then(function () {
    // The Safari/IE IndexedDB implementations still have some bugs and we need to sleep for a
    // little bit before destroying the DB to try to avoid generating blocking errors from
    // transactions that have yet to complete. In IE, if we generate these errors "too early" then
    // IE cannot recover.
    return utils.timeout(DB._SLEEP_MS);
  }).then(function () {
    return self._openClose(function () {
      return self._closeDestroyUnregister();
    });
  });
};

DB.prototype._closeDBAndDestroyCol = function (colName) {
  // Handle the destroying at the DB layer as we need to first close and then reopen the DB before
  // destroying the col. Oh the joys of IDB!
  var self = this;

  var onUpgradeNeeded = function () {
    self._db.deleteObjectStore(colName);
  };

  var onSuccess = function (request, resolve) {
    resolve();
  };

  // Close will coordinate with any existing DB transactions and by the time it resolves there will
  // be a clear path to reopen the DB
  return self._close().then(function () { // Close any existing connection
    self._version++; // Increment the version so that we can trigger an onupgradeneeded
    return self._open(onUpgradeNeeded, onSuccess);
  });
};

DB.prototype._destroyCol = function (colName) {
  var self = this;
  // We wait for the store to be loaded before closing the store as we wait for this same event when
  // creating a store and we don't want to try to close a store before we have opened it.
  return self._loaded.then(function () {
    return self._openClose(function () {
      return self._closeDBAndDestroyCol(colName);
    });
  });
};

DB.prototype.all = function (callback) {
  utils.each(this._cols, callback);
};

DB.prototype._load = function () {
  var self = this,
    promises = [];
  // Init DB store and then load object stores
  return self._initStore().then(function () {
    utils.each(self._db.objectStoreNames, function (name, i) {
      // indexeddbshim creates a 'length' attr that should be ignored
      if (i !== 'length') {
        promises.push(self.col(name));
      }
    });
    return Promise.all(promises).then(function () {
      self.emit('load');
    });
  });
};

module.exports = DB;
