'use strict';

var AdapterTest = require('./adapter-test'),
  utils = require('deltadb-common-utils');

var AdapterTests = function () {};

AdapterTests.prototype.test = function (adapters) {
  utils.each(adapters, function (Adapter, name) {
    var adapterTest = new AdapterTest(Adapter, name);
    adapterTest.test();
  });
};

module.exports = new AdapterTests();
