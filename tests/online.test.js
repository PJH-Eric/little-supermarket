'use strict';

const assert = require('assert');
const WebSocket = require('ws');
const { createServer } = require('../server.js');

class TestClient {
  constructor(url, name) {
    this.name = name;
    this.ws = new WebSocket(url);
    this.waiters = [];
    this.messages = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
    this.ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      this.messages.push(message);
      this.pump();
    });
  }

  async hello() { await this.ready; this.send('hello', { clientId: `test-${this.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: this.name }); return this.wait('hello:ok'); }
  send(type, payload = {}) { this.ws.send(JSON.stringify({ type, payload })); }
  wait(type, predicate, timeout = 3000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeout);
      this.waiters.push({ type, predicate, resolve: (value) => { clearTimeout(timer); resolve(value); } });
      this.pump();
    });
  }
  pump() {
    for (let waiterIndex = 0; waiterIndex < this.waiters.length; waiterIndex += 1) {
      const waiter = this.waiters[waiterIndex];
      const messageIndex = this.messages.findIndex((message) => message.type === waiter.type && (!waiter.predicate || waiter.predicate(message)));
      if (messageIndex < 0) continue;
      const [message] = this.messages.splice(messageIndex, 1);
      this.waiters.splice(waiterIndex, 1);
      waiter.resolve(message);
      waiterIndex -= 1;
    }
  }
  close() { this.ws.close(); }
}

(async () => {
  const instance = createServer({ port: 0, host: '127.0.0.1', allowedOrigin: '*' });
  const address = await instance.start();
  const url = `ws://127.0.0.1:${address.port}`;
  const one = new TestClient(url, '甲');
  const two = new TestClient(url, '乙');
  const watcher = new TestClient(url, '觀察員');
  try {
    await Promise.all([one.hello(), two.hello(), watcher.hello()]);
    one.send('room:create', { roomName: '彩虹超市', difficulty: 'easy', private: false });
    const created = await one.wait('room:created');
    const initial = await one.wait('room:state');
    assert.strictEqual(created.role, 'player');
    assert.strictEqual(initial.state.room.players, 1);
    assert.ok(created.credentials.playerToken);
    console.log('✓ 建立房間與玩家邀請憑證');

    two.send('room:join', { code: created.code, role: 'player' });
    const joined = await two.wait('room:joined');
    const joinedState = await two.wait('room:state');
    assert.strictEqual(joined.role, 'player');
    assert.strictEqual(joinedState.state.players.length, 2);
    console.log('✓ 第二位玩家加入房間');

    one.send('room:ready', { ready: true }); two.send('room:ready', { ready: true });
    await one.wait('room:state', (message) => message.state.players.every((player) => player.ready));
    one.send('room:start');
    const started = await one.wait('room:state', (message) => !!message.state.game && message.state.game.status === 'playing');
    assert.strictEqual(started.state.game.currentRound, 1);
    console.log('✓ 準備與開始遊戲');

    watcher.send('room:join', { code: created.code, role: 'observer', invite: created.credentials.observerToken });
    const observerState = await watcher.wait('room:state');
    assert.strictEqual(observerState.state.me.role, 'observer');
    watcher.send('game:collect', { productKey: Object.keys(started.state.game.order)[0] });
    const observerError = await watcher.wait('room:error');
    assert.strictEqual(observerError.code, 'not-player');
    console.log('✓ 觀戰者不能執行購物操作');

    const productKey = Object.keys(started.state.game.order)[0];
    one.send('game:collect', { productKey });
    const changed = await one.wait('room:state', (message) => !!message.state.game && message.state.game.totalCollected === 1);
    assert.strictEqual(changed.state.game.collected[productKey], 1);
    one.send('chat:send', { text: '<b>大家加油</b>' });
    const chat = await one.wait('room:chat');
    assert.strictEqual(chat.message.text.includes('<'), false);
    console.log('✓ 伺服器權威購物與聊天室消毒');

    const health = await fetch(`http://127.0.0.1:${address.port}/health`).then((response) => response.json());
    assert.strictEqual(health.ok, true);
    assert.strictEqual(health.service, 'little-supermarket');
    console.log('✓ /health 可供 Render 健康檢查');
    console.log('Online tests passed.');
  } finally {
    one.close(); two.close(); watcher.close();
    await instance.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
