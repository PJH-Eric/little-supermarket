/* 全站唯一的伺服器設定入口。頁面元件不可自行讀取網址或環境設定。 */
(function (w) {
  'use strict';

  var runtime = w.__LITTLE_SUPERMARKET_CONFIG__ || {};
  var loc = w.location || { search: '', protocol: 'file:', origin: '' };

  function query(search, keys) {
    var params = new URLSearchParams(search || '');
    for (var i = 0; i < keys.length; i++) {
      var value = params.get(keys[i]);
      if (value) return value.trim();
    }
    return '';
  }

  function validateHttp(raw, source) {
    if (!raw) return { url: null, status: 'unset', source: source, error: null };
    var parsed;
    try { parsed = new URL(raw); } catch (error) {
      return { url: null, status: 'invalid', source: source, error: '伺服器網址不是合法的完整網址。' };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { url: null, status: 'invalid', source: source, error: '伺服器網址只能使用 http 或 https。' };
    }
    if (loc.protocol === 'https:' && parsed.protocol === 'http:') {
      return { url: null, status: 'invalid', source: source, error: 'HTTPS 頁面不能連線到 HTTP 伺服器。' };
    }
    return { url: parsed.origin + parsed.pathname.replace(/\/+$/, ''), status: 'ok', source: source, error: null };
  }

  function deriveWs(httpUrl) {
    if (!httpUrl) return { url: null, status: 'unset', error: null };
    var parsed = new URL(httpUrl);
    parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    return { url: parsed.toString().replace(/\/$/, ''), status: 'ok', error: null };
  }

  var queryServer = query(loc.search, ['serverUrl', 'server']);
  var httpRaw = queryServer || String(runtime.serverUrl || '').trim();
  var httpSource = queryServer ? 'query' : (runtime.serverUrl ? 'injected' : 'none');
  var http = validateHttp(httpRaw, httpSource);
  /* 只在設定邊界由已驗證的 HTTP URL 映射協定，元件不自行猜測。 */
  var ws = deriveWs(http.url);

  var entryParams = new URLSearchParams(loc.search || '');
  var room = String(entryParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  var invite = String(entryParams.get('invite') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96);
  var role = entryParams.get('role') === 'observer' ? 'observer' : 'player';

  var Config = {
    serverUrl: http.url,
    wsUrl: ws.url,
    status: http.status,
    source: http.source,
    error: http.error,
    isOnlineEnabled: function () { return http.status === 'ok' && ws.status === 'ok'; },
    url: function (pathname) {
      if (!http.url) return null;
      var suffix = String(pathname || '');
      if (suffix && suffix.charAt(0) !== '/') suffix = '/' + suffix;
      return http.url + suffix;
    },
    entry: function () { return { room: room, invite: invite, role: role }; },
    describe: function () {
      if (http.status === 'invalid' || ws.status === 'invalid') return '設定有誤，線上功能已停用';
      if (!http.url) return '未設定，只能玩單機';
      return http.url.replace(/^https?:\/\//, '') + (http.source === 'query' ? '（網址參數）' : '');
    },
    inviteUrl: function (code, token, inviteRole) {
      var base = loc.origin + (loc.pathname || '/');
      var qs = [
        'room=' + encodeURIComponent(code),
        'invite=' + encodeURIComponent(token),
        'role=' + encodeURIComponent(inviteRole || 'player')
      ];
      if (http.url && http.source === 'query') qs.push('serverUrl=' + encodeURIComponent(http.url));
      return base + '?' + qs.join('&');
    },
    checkHealth: function (callback) {
      if (!Config.isOnlineEnabled()) return callback(Config.status);
      callback('checking');
      var timer = setTimeout(function () { callback('fail'); }, 10000);
      fetch(Config.url('/health'), { cache: 'no-store' }).then(function (response) {
        clearTimeout(timer); callback(response.ok ? 'ok' : 'fail');
      }).catch(function () { clearTimeout(timer); callback('fail'); });
    },
    _validateHttp: validateHttp
  };

  w.GameConfig = Config;
}(typeof window !== 'undefined' ? window : this));
