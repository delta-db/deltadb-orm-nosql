'use strict';

// Provides a mechanism for checking for IndexedDB support without including any IndexedDB dependent
// code

var Utils = function () {};

Utils.prototype.indexedDB = function () {

  // Return null if the browser doesn't support IndexedDB or WebSQL
  // TODO: fake window.indexedDB, etc... and remove the ignore statement below
  /* istanbul ignore next */
  if (!window.indexedDB && !window.mozIndexedDB && !window.webkitIndexedDB && !window.msIndexedDB &&
    !window.openDatabase) {
    return null;
  }

  // The Safari implementation of IndexedDB has some serious issues such as the fact that fact that
  // you cannot create object stores in separate transactions, which means that you cannot create
  // object stores dynamically: http://stackoverflow.com/questions/34124846
  var isSafari = navigator.userAgent.indexOf('Safari') !== -1 && navigator.userAgent.indexOf(
    'Chrome') === -1;

  // TODO: fake window.indexedDB, etc... and remove the ignore statement below
  /* istanbul ignore next */
  if (isSafari) {
    return window.shimIndexedDB;
  } else {
    return window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB ||
      window.msIndexedDB || window.shimIndexedDB;
  }
};

module.exports = new Utils();
