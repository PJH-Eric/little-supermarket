'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const configSource = fs.readFileSync(require.resolve('../public/js/config.js'), 'utf8');
const appSource = fs.readFileSync(require.resolve('../public/js/app.js'), 'utf8');

function createElement(id) {
  return {
    id,
    value: '',
    textContent: '',
    hidden: false,
    className: '',
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    appendChild() {},
    focus() {},
    close() {},
    showModal() {},
    setAttribute() {}
  };
}

function createContext() {
  const elements = new Map();
  const document = {
    activeElement: createElement('active'),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement(id));
      return elements.get(id);
    },
    querySelector() { return createElement('query'); },
    querySelectorAll() { return []; }
  };
  const window = {
    __LITTLE_SUPERMARKET_CONFIG__: { serverUrl: '' },
    location: { protocol: 'http:', search: '', origin: 'http://localhost:3030', pathname: '/' },
    scrollTo() {}
  };

  return {
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    window,
    document,
    Store: {
      nick: () => '小店員',
      difficulty: () => 'normal',
      music: () => true,
      sound: () => true,
      vibrate: () => false,
      reduceMotion: () => false,
      resetDefaults() {}
    },
    GameAudio: { unlock() {}, startMusic() {}, stopMusic() {}, play() {} },
    Online: { on() {}, connected: () => false, disconnect() {}, send() {} },
    SupermarketRules: { PRODUCT_ORDER: [], productOf() {} },
    SupermarketAI: {}
  };
}

const context = createContext();
vm.runInNewContext(configSource, context);
const html = fs.readFileSync(require.resolve('../public/index.html'), 'utf8');
assert.ok(html.includes('id="lobby-nick"') && html.includes('id="invite-gate"') && html.includes('id="joinInviteButton"'),
  '大廳必須提供邀請者確認暱稱的入口');
assert.doesNotThrow(() => vm.runInNewContext(appSource, context), 'app.js 應能在瀏覽器啟動');
console.log('✓ app.js 啟動時能取得 GameConfig');
