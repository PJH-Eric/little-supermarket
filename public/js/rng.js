/* Deterministic random helpers shared by the game rules and tests. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SupermarketRng = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function hashSeed(seed) {
    var text = String(seed === undefined ? '' : seed);
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function create(seed) {
    var value = hashSeed(seed) || 0x9e3779b9;
    return function () {
      value += 0x6d2b79f5;
      var t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomSeed() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  return {
    create: create,
    randomSeed: randomSeed,
    hashSeed: hashSeed,
    int: function (rng, max) { return Math.floor(rng() * max); },
    pick: function (rng, list) { return list[Math.min(list.length - 1, Math.floor(rng() * list.length))]; }
  };
}));
