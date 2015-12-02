'use strict';

var adapterTests = require('./adapter-tests'),
  adapters = require('../../../scripts/adapters/browser');

describe('browser', function () {

  // Common tests
  if (global.deltaDBORMNoSQLNoIDB) { // don't test IndexedDB? Not all browsers support it
    delete adapters['indexed-db'];
  }
  adapterTests.test(adapters);

  // Custom tests
  if (!global.deltaDBORMNoSQLNoIDB) { // test IndexedDB? Not all browsers support it
    require('./indexed-db');
  }
  require('./mem');

});
