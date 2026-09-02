'use strict';

const assert = require('assert');
const Rules = require('../public/js/rules.js');
const AI = require('../public/js/ai.js');

function log(message) { console.log(`✓ ${message}`); }

const first = Rules.createGame({ seed: 'repeatable', difficulty: 'normal', players: [{ id: 'p1', name: '小花' }], now: 1 });
const second = Rules.createGame({ seed: 'repeatable', difficulty: 'normal', players: [{ id: 'p1', name: '小花' }], now: 1 });
assert.deepStrictEqual(Rules.snapshot(first).order, Rules.snapshot(second).order);
log('相同 seed 產生相同購物清單');

const firstOrder = Rules.snapshot(first).order;
const wrong = Rules.PRODUCT_ORDER.find((key) => !firstOrder[key]);
const invalid = Rules.collect(first, 'p1', wrong);
assert.strictEqual(invalid.ok, false);
assert.strictEqual(invalid.code, 'not-needed');
assert.strictEqual(Rules.snapshot(first).totalCollected, 0);
log('不在清單的商品不會改變狀態');

Object.entries(firstOrder).forEach(([key, quantity]) => {
  for (let i = 0; i < quantity; i += 1) {
    const result = Rules.collect(first, 'p1', key);
    assert.strictEqual(result.ok, true);
  }
});
assert.strictEqual(first.status, 'ready-checkout');
assert.strictEqual(Rules.snapshot(first).totalCollected, Rules.snapshot(first).totalNeeded);
assert.strictEqual(first.players.p1.score, Rules.totalNeeded(first) * 10);
log('合法拿取會增加數量與分數，買齊後進入結帳狀態');

const next = Rules.checkout(first, 'p1');
assert.strictEqual(next.ok, true);
assert.strictEqual(first.currentRound, 2);
assert.strictEqual(first.status, 'playing');
assert.strictEqual(Rules.checkout(first, 'p1').ok, false);
log('只能在買齊清單後結帳，結帳會進入下一張清單');

while (first.status !== 'finished') {
  Object.entries(first.order.items).forEach(([key, quantity]) => {
    for (let i = first.collected[key] || 0; i < quantity; i += 1) Rules.collect(first, 'p1', key);
  });
  const result = Rules.checkout(first, 'p1');
  if (first.status !== 'finished') assert.strictEqual(result.finished, false);
}
assert.strictEqual(first.status, 'finished');
log('最後一張清單結帳後完成整局');

const varied = Rules.createGame({ seed: 'varied-tasks', difficulty: 'hard', players: [{ id: 'p1' }], now: 1 });
const taskTypes = [];
while (varied.status !== 'finished') {
  const task = Rules.snapshot(varied);
  taskTypes.push(task.task.type);
  Object.entries(task.order).forEach(([key, quantity]) => {
    for (let i = 0; i < quantity; i += 1) Rules.collect(varied, 'p1', key);
  });
  Rules.checkout(varied, 'p1');
}
assert.deepStrictEqual(taskTypes, ['shopping', 'category', 'counting', 'shopping', 'category']);
log('同一局會輪替購物、分類與數數任務');

const aiGame = Rules.createGame({ seed: 'ai-seed', difficulty: 'hard', players: [{ id: 'p1' }, { id: 'helper' }], now: 0 });
const brain = AI.createBrain('hard', 'ai-seed');
const move = brain.step(Rules.snapshot(aiGame), 1000);
assert.ok(move && aiGame.order.items[move.productKey]);
assert.strictEqual(Rules.collect(aiGame, 'helper', move.productKey).ok, true);
log('小幫手只會產生清單中的合法商品');

console.log('Rules tests passed.');
