'use strict';

var adapterTests = require('./adapter-tests'),
  adapters = require('../../../scripts/adapters/node');

describe('node', function () {

  // Common tests
  adapterTests.test(adapters);

  // Custom tests
  require('./mem');

});
