/* 原生 WebSocket 連線包裝。所有 server URL 都從 GameConfig 取得。 */
(function (w) {
  'use strict';
  var socket = null;
  var identity = null;
  var listeners = {};
  var reconnectTimer = null;
  var intentionalClose = false;
  var state = 'idle';

  function emit(event, payload) {
    (listeners[event] || []).slice().forEach(function (handler) {
      try { handler(payload); } catch (error) { console.error('[online]', error); }
    });
  }
  function on(event, handler) {
    (listeners[event] || (listeners[event] = [])).push(handler);
    return function () { var list = listeners[event] || []; var index = list.indexOf(handler); if (index >= 0) list.splice(index, 1); };
  }
  function setState(next, message) { state = next; emit('status', { status: next, message: message || '' }); }

  function connect(nextIdentity) {
    identity = nextIdentity;
    if (!w.GameConfig.isOnlineEnabled()) {
      var error = w.GameConfig.error || '目前沒有可用的遊戲伺服器。';
      setState('offline', error);
      return Promise.reject(new Error(error));
    }
    if (socket && socket.readyState === WebSocket.OPEN) return Promise.resolve();
    intentionalClose = false;
    setState('connecting');
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (!settled) { settled = true; reject(new Error('伺服器回應太慢，可能正在從休眠中啟動，請再試一次。')); }
      }, 12000);
      try { socket = new WebSocket(w.GameConfig.wsUrl); } catch (error) {
        clearTimeout(timer); settled = true; setState('error', error.message); reject(error); return;
      }
      socket.onopen = function () {
        setState('connected');
        send('hello', identity);
        emit('connected', {});
        if (!settled) { settled = true; clearTimeout(timer); resolve(); }
      };
      socket.onmessage = function (event) {
        var message;
        try { message = JSON.parse(event.data); } catch (error) { return; }
        emit(message.type, message);
        if (message.type === 'hello:ok') emit('hello', message);
      };
      socket.onerror = function () { setState('error', '無法連線到遊戲伺服器。'); };
      socket.onclose = function () {
        if (!intentionalClose) {
          setState('connecting', '連線中斷，正在嘗試重新連線…');
          scheduleReconnect();
        } else setState('idle');
        emit('disconnected', {});
      };
    });
  }

  function scheduleReconnect() {
    if (reconnectTimer || !identity || intentionalClose) return;
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      connect(identity).catch(function () { scheduleReconnect(); });
    }, 1600);
  }

  function send(type, payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      emit('room:error', { message: '目前尚未連線，請稍候再試。', code: 'offline' });
      return false;
    }
    socket.send(JSON.stringify({ type: type, payload: payload || {} }));
    return true;
  }

  function disconnect() {
    intentionalClose = true;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (socket) socket.close();
    socket = null; setState('idle');
  }

  w.Online = {
    on: on,
    connect: connect,
    send: send,
    disconnect: disconnect,
    status: function () { return state; },
    connected: function () { return !!socket && socket.readyState === WebSocket.OPEN; }
  };
}(window));
