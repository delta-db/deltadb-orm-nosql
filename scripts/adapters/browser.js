'use strict';

// Register all adapters that can be used in the browser.

var Adapters = {};

Adapters['indexed-db'] = require('./indexed-db');
Adapters['mem'] = require('./mem');

module.exports = Adapters;
