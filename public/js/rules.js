/*
 * 小小超市規則核心：Node server、單機與測試共用。
 * 渲染層只呈現狀態；所有購物與結帳都從這個模組進入。
 */
(function (root, factory) {
  'use strict';
  var Rng = (typeof module === 'object' && module.exports)
    ? require('./rng.js')
    : root.SupermarketRng;
  var api = factory(Rng);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SupermarketRules = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Rng) {
  'use strict';

  var MAX_PLAYERS = 4;
  var MAX_ROUNDS = 5;
  var PRODUCT_ORDER = ['apple', 'banana', 'milk', 'bread', 'carrot', 'fish', 'cookie', 'cheese'];
  var PRODUCTS = {
    apple: { key: 'apple', label: '蘋果', category: '水果', color: '#ef7d72', icon: 'apple' },
    banana: { key: 'banana', label: '香蕉', category: '水果', color: '#f3c85b', icon: 'banana' },
    milk: { key: 'milk', label: '牛奶', category: '冷藏', color: '#b9d8f0', icon: 'milk' },
    bread: { key: 'bread', label: '麵包', category: '麵包', color: '#d99a5e', icon: 'bread' },
    carrot: { key: 'carrot', label: '紅蘿蔔', category: '蔬菜', color: '#ee9a5e', icon: 'carrot' },
    fish: { key: 'fish', label: '小魚', category: '海鮮', color: '#75b9d7', icon: 'fish' },
    cookie: { key: 'cookie', label: '餅乾', category: '點心', color: '#d9aa79', icon: 'cookie' },
    cheese: { key: 'cheese', label: '起司', category: '冷藏', color: '#f3c85b', icon: 'cheese' }
  };
  var TASK_TYPES = ['shopping', 'category', 'counting'];
  var CATEGORY_TASKS = [
    { category: '水果', keys: ['apple', 'banana'] },
    { category: '冷藏', keys: ['milk', 'cheese'] }
  ];

  var DIFFICULTIES = {
    easy: { key: 'easy', label: '簡單', rounds: 3, items: 2, maxQuantity: 2, aiDelay: 1350 },
    normal: { key: 'normal', label: '普通', rounds: 4, items: 3, maxQuantity: 2, aiDelay: 820 },
    hard: { key: 'hard', label: '困難', rounds: 5, items: 4, maxQuantity: 3, aiDelay: 420 }
  };

  function difficultyOf(value) { return DIFFICULTIES[value] || DIFFICULTIES.normal; }
  function productOf(key) { return PRODUCTS[key] || null; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function makeOrder(rng, difficulty, round) {
    var config = difficultyOf(difficulty);
    var keys = PRODUCT_ORDER.slice();
    var order = {};
    for (var i = keys.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var swap = keys[i]; keys[i] = keys[j]; keys[j] = swap;
    }
    var taskType = TASK_TYPES[(round - 1) % TASK_TYPES.length];
    var task;
    if (taskType === 'category') {
      var categoryTask = CATEGORY_TASKS[Math.floor(rng() * CATEGORY_TASKS.length)];
      categoryTask.keys.forEach(function (key) { order[key] = 1; });
      task = {
        type: taskType,
        label: '分類小達人',
        title: '請找出：',
        instruction: '請找出所有' + categoryTask.category + '商品！',
        category: categoryTask.category
      };
    } else if (taskType === 'counting') {
      var targetKey = keys[0];
      var quantity = 1 + Math.floor(rng() * config.maxQuantity);
      order[targetKey] = quantity;
      task = {
        type: taskType,
        label: '數數小高手',
        title: '請數到：',
        instruction: '請幫我數出 ' + quantity + ' 個' + PRODUCTS[targetKey].label + '！',
        targetKey: targetKey,
        targetQuantity: quantity
      };
    } else {
      for (var n = 0; n < config.items; n++) {
        order[keys[n]] = 1 + Math.floor(rng() * config.maxQuantity);
      }
      task = {
        type: taskType,
        label: '購物清單',
        title: '請幫我找：',
        instruction: '清單上的商品都要找到喔！'
      };
    }
    return {
      round: round,
      items: order,
      task: task,
      customer: ['兔兔', '小熊', '企鵝', '小貓', '小狐狸'][(round - 1) % 5]
    };
  }

  function newPlayer(player, index) {
    return {
      id: String(player.id),
      name: String(player.name || ('玩家' + (index + 1))).slice(0, 20),
      role: 'player',
      score: 0,
      collected: 0,
      color: ['#7a9fd2', '#e69485', '#76b99b', '#c2a0db'][index % 4]
    };
  }

  function totalNeeded(state) {
    var total = 0;
    Object.keys(state.order.items).forEach(function (key) { total += state.order.items[key]; });
    return total;
  }

  function totalCollected(state) {
    var total = 0;
    Object.keys(state.order.items).forEach(function (key) { total += state.collected[key] || 0; });
    return total;
  }

  function isOrderComplete(state) { return totalCollected(state) >= totalNeeded(state); }

  function createGame(options) {
    var opts = options || {};
    var difficulty = difficultyOf(opts.difficulty);
    var seed = opts.seed || Rng.randomSeed();
    var rng = Rng.create(seed);
    var players = {};
    var order = [];
    (opts.players || []).slice(0, MAX_PLAYERS).forEach(function (player, index) {
      var p = newPlayer(player, index);
      players[p.id] = p;
      order.push(p.id);
    });
    var state = {
      seed: String(seed),
      difficulty: difficulty.key,
      maxRounds: difficulty.rounds,
      currentRound: 1,
      status: 'playing',
      startedAt: Number(opts.now || Date.now()),
      players: players,
      playerOrder: order,
      order: makeOrder(rng, difficulty.key, 1),
      collected: {},
      mistakes: 0,
      lastEvent: null,
      rngState: null
    };
    Object.keys(state.order.items).forEach(function (key) { state.collected[key] = 0; });
    return state;
  }

  function collect(state, playerId, productKey) {
    if (!state || state.status !== 'playing') {
      return { ok: false, code: 'phase', error: '現在要先完成這張購物清單。' };
    }
    var player = state.players[String(playerId)];
    if (!player) return { ok: false, code: 'not-player', error: '只有購物員可以拿商品。' };
    var product = productOf(productKey);
    if (!product) return { ok: false, code: 'unknown-product', error: '找不到這個商品。' };
    var needed = state.order.items[product.key] || 0;
    var got = state.collected[product.key] || 0;
    if (!needed) {
      state.mistakes += 1;
      var wrongTaskError = state.order.task.type === 'category'
        ? '這不是這次要找的分類，換一個看看。'
        : '這個商品不在清單裡，看看其他需要的商品。';
      return { ok: false, code: 'not-needed', error: wrongTaskError };
    }
    if (got >= needed) {
      state.mistakes += 1;
      return { ok: false, code: 'not-needed', error: '這樣商品已經買夠了，看看清單上的其他商品。' };
    }
    state.collected[product.key] = got + 1;
    player.score += 10;
    player.collected += 1;
    state.lastEvent = { type: 'collect', by: player.id, product: product.key, gain: 10 };
    if (isOrderComplete(state)) state.status = 'ready-checkout';
    return {
      ok: true,
      event: clone(state.lastEvent),
      complete: state.status === 'ready-checkout',
      remaining: Math.max(0, needed - state.collected[product.key])
    };
  }

  function checkout(state, playerId) {
    if (!state || state.status !== 'ready-checkout') {
      return { ok: false, code: 'not-ready', error: '先把購物清單買齊，再來結帳。' };
    }
    if (!state.players[String(playerId)]) {
      return { ok: false, code: 'not-player', error: '只有購物員可以結帳。' };
    }
    var finishedRound = state.currentRound;
    if (finishedRound >= state.maxRounds) {
      state.status = 'finished';
      state.lastEvent = { type: 'finish', by: String(playerId), round: finishedRound };
      return { ok: true, finished: true, event: clone(state.lastEvent) };
    }
    state.currentRound += 1;
    var rng = Rng.create(state.seed + ':' + state.currentRound);
    state.order = makeOrder(rng, state.difficulty, state.currentRound);
    state.collected = {};
    Object.keys(state.order.items).forEach(function (key) { state.collected[key] = 0; });
    state.status = 'playing';
    state.lastEvent = { type: 'checkout', by: String(playerId), round: finishedRound };
    return { ok: true, finished: false, event: clone(state.lastEvent) };
  }

  function snapshot(state) {
    if (!state) return null;
    var players = state.playerOrder.map(function (id) { return state.players[id]; }).filter(Boolean);
    return {
      seed: state.seed,
      difficulty: state.difficulty,
      maxRounds: state.maxRounds,
      currentRound: state.currentRound,
      status: state.status,
      startedAt: state.startedAt,
      customer: state.order.customer,
      task: clone(state.order.task),
      order: clone(state.order.items),
      collected: clone(state.collected),
      mistakes: state.mistakes,
      players: clone(players),
      totalNeeded: totalNeeded(state),
      totalCollected: totalCollected(state),
      lastEvent: clone(state.lastEvent)
    };
  }

  function describeEvent(event, playerName) {
    if (!event) return '';
    var name = playerName || '小店員';
    if (event.type === 'collect') return name + ' 找到了商品，太棒了！';
    if (event.type === 'checkout') return '購物清單完成，準備下一位客人！';
    if (event.type === 'finish') return '今天的超市任務完成了！';
    return '';
  }

  return {
    MAX_PLAYERS: MAX_PLAYERS,
    MAX_ROUNDS: MAX_ROUNDS,
    PRODUCT_ORDER: PRODUCT_ORDER,
    PRODUCTS: PRODUCTS,
    TASK_TYPES: TASK_TYPES,
    DIFFICULTIES: DIFFICULTIES,
    difficultyOf: difficultyOf,
    productOf: productOf,
    createGame: createGame,
    collect: collect,
    checkout: checkout,
    snapshot: snapshot,
    totalNeeded: totalNeeded,
    totalCollected: totalCollected,
    isOrderComplete: isOrderComplete,
    describeEvent: describeEvent,
    _makeOrder: makeOrder
  };
}));
