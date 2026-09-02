(function (w) {
  'use strict';
  var PREFIX = 'little-supermarket:';
  function get(key, fallback) { try { var value = localStorage.getItem(PREFIX + key); return value === null ? fallback : value; } catch (e) { return fallback; } }
  function set(key, value) { try { localStorage.setItem(PREFIX + key, String(value)); } catch (e) {} }
  function flag(key, fallback) { return get(key, fallback ? '1' : '0') === '1'; }
  function setFlag(key, value) { set(key, value ? '1' : '0'); }
  function clientId() {
    var id = get('client-id', '');
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      set('client-id', id);
    }
    return id;
  }
  w.Store = {
    clientId: clientId,
    nick: function (value) { if (value === undefined) return get('nick', '小店員'); set('nick', value); return value; },
    difficulty: function (value) { if (value === undefined) return get('difficulty', 'normal'); set('difficulty', value); return value; },
    music: function (value) { if (value === undefined) return flag('music', true); setFlag('music', value); return value; },
    sound: function (value) { if (value === undefined) return flag('sound', true); setFlag('sound', value); return value; },
    vibrate: function (value) { if (value === undefined) return flag('vibrate', true); setFlag('vibrate', value); return value; },
    reduceMotion: function (value) { if (value === undefined) return flag('reduce-motion', false); setFlag('reduce-motion', value); return value; },
    resetDefaults: function () { setFlag('music', true); setFlag('sound', true); setFlag('vibrate', true); setFlag('reduce-motion', false); }
  };
}(window));
