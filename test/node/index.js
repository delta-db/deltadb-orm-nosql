'use strict';

var chai = require('chai');
chai.use(require('chai-as-promised'));
chai.should(); // var should = chai.should();

describe('node', function () {

  require('../spec');
  require('../spec/adapters/node');

});
