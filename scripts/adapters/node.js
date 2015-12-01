'use strict';

// Register all adapters that can be used in node.

var Adapters = {};

Adapters['mem'] = require('./mem');

// TODO: update mongo adapter--this adapter is experimental and probably outdated
// Adapters['mongo'] = require('./mongo');

module.exports = Adapters;
