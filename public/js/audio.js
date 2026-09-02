/* 使用 Web Audio API 產生短音效，不需要下載外部聲音檔。 */
(function (w) {
  'use strict';
  var context = null;
  var musicTimer = null;
  var musicStep = 0;

  function unlock() {
    if (!context) {
      var AudioContext = w.AudioContext || w.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
    }
    if (context.state === 'suspended') context.resume();
    return context;
  }

  function tone(frequency, duration, type, volume, enabled) {
    if (enabled === undefined) enabled = w.Store.sound();
    if (!enabled) return;
    var ctx = unlock();
    if (!ctx) return;
    var oscillator = ctx.createOscillator();
    var gain = ctx.createGain();
    oscillator.type = type || 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(volume || 0.045, ctx.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    oscillator.connect(gain); gain.connect(ctx.destination);
    oscillator.start(); oscillator.stop(ctx.currentTime + duration + 0.02);
  }

  function play(name) {
    if (name === 'collect') { tone(620, 0.1, 'sine', 0.05); setTimeout(function () { tone(820, 0.1, 'sine', 0.04); }, 55); }
    else if (name === 'wrong') tone(190, 0.13, 'triangle', 0.035);
    else if (name === 'checkout') { tone(520, 0.12, 'sine', 0.05); setTimeout(function () { tone(690, 0.16, 'sine', 0.05); }, 90); }
    else if (name === 'win') { [520, 660, 780].forEach(function (f, i) { setTimeout(function () { tone(f, 0.2, 'sine', 0.05); }, i * 110); }); }
    else if (name === 'click') tone(380, 0.06, 'sine', 0.025);
  }

  function startMusic() {
    if (!w.Store.music() || musicTimer) return;
    unlock();
    var notes = [262, 330, 392, 330, 294, 349, 440, 349];
    musicTimer = setInterval(function () {
      if (w.Store.music()) tone(notes[musicStep++ % notes.length], 0.22, 'sine', 0.012, true);
    }, 620);
  }
  function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
  w.GameAudio = { unlock: unlock, play: play, startMusic: startMusic, stopMusic: stopMusic };
}(window));
