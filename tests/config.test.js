'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync(require.resolve('../public/js/config.js'), 'utf8');

function loadConfig({ protocol, search, serverUrl }) {
  const window = {
    __LITTLE_SUPERMARKET_CONFIG__: { serverUrl },
    location: { protocol, search, origin: 'https://example.github.io', pathname: '/little-supermarket/' }
  };
  vm.runInNewContext(source, { URL, URLSearchParams, window });
  return window.GameConfig;
}

const production = loadConfig({ protocol: 'https:', search: '', serverUrl: 'https://supermarket.onrender.com' });
assert.strictEqual(production.wsUrl, 'wss://supermarket.onrender.com');
assert.strictEqual(production.isOnlineEnabled(), true);
console.log('✓ GAME_SERVER_URL 會自動推導 HTTPS/WSS');

const local = loadConfig({ protocol: 'http:', search: '', serverUrl: 'http://localhost:3030/' });
assert.strictEqual(local.wsUrl, 'ws://localhost:3030');
assert.strictEqual(local.isOnlineEnabled(), true);
console.log('✓ GAME_SERVER_URL 會自動推導 HTTP/WS');

const query = loadConfig({ protocol: 'https:', search: '?serverUrl=https%3A%2F%2Fquery.example.com', serverUrl: '' });
const inviteUrl = query.inviteUrl('ABC123', 'token', 'player');
assert.ok(inviteUrl.includes('serverUrl=https%3A%2F%2Fquery.example.com'));
assert.strictEqual(inviteUrl.includes('wsUrl='), false);
console.log('✓ 邀請連結只保留 GAME_SERVER_URL 設定');

console.log('Config tests passed.');
