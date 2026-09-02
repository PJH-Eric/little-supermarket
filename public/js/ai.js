/* 小幫手 AI：只從規則允許的缺口中拿商品，差異在反應與選擇策略。 */
(function (root, factory) {
  'use strict';
  var Rules = (typeof module === 'object' && module.exports) ? require('./rules.js') : root.SupermarketRules;
  var api = factory(Rules);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SupermarketAI = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Rules) {
  'use strict';

  var LEVELS = {
    easy: { key: 'easy', label: '慢慢來', delay: 1350 },
    normal: { key: 'normal', label: '小幫手', delay: 820 },
    hard: { key: 'hard', label: '快手店員', delay: 420 }
  };

  function createBrain(level, seed) {
    var config = LEVELS[level] || LEVELS.normal;
    var lastActionAt = 0;
    var seedBias = String(seed || '').length % 2;
    function choose(snap) {
      var candidates = Object.keys(snap.order || {}).filter(function (key) {
        return (snap.collected[key] || 0) < snap.order[key];
      });
      if (!candidates.length) return null;
      if (config.key === 'easy') return candidates[seedBias % candidates.length];
      if (config.key === 'hard') return candidates.sort(function (a, b) {
        return (snap.order[b] - (snap.collected[b] || 0)) - (snap.order[a] - (snap.collected[a] || 0));
      })[0];
      return candidates.sort(function (a, b) { return a.localeCompare(b); })[0];
    }
    return {
      level: config.key,
      config: config,
      reset: function () { lastActionAt = 0; },
      step: function (snap, now) {
        if (!snap || snap.status !== 'playing') return null;
        if (now - lastActionAt < config.delay) return null;
        var key = choose(snap);
        if (!key) return null;
        lastActionAt = now;
        return { productKey: key };
      }
    };
  }

  return { LEVELS: LEVELS, createBrain: createBrain };
}));
