'use strict';

var adapterTests = require('./adapter-tests'),
  adapters = require('../../../scripts/adapters/browser');

describe('browser', function () {

  // Common tests
  adapterTests.test(adapters);

  // Custom tests
  require('./indexed-db');
  require('./mem');

});
