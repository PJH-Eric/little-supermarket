(function (w) {
  'use strict';

  var Config = w.GameConfig;
  var $ = function (id) { return document.getElementById(id); };
  var app = {
    mode: 'solo',
    screen: 'home',
    local: { game: null, playerId: 'local-player', ai: null, timer: null },
    online: { room: null, role: null, credentials: null, pendingInvite: null, entryPrepared: false },
    toastTimer: null,
    lastSettingsFocus: null
  };

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function productSvg(key, size) {
    var p = SupermarketRules.productOf(key) || { color: '#d9aa79' };
    var color = p.color;
    var body = '';
    if (key === 'apple') body = '<circle cx="38" cy="42" r="22" fill="' + color + '"/><path d="M39 19c5-9 13-10 18-9-2 8-8 12-17 11" fill="#6aaa76"/><path d="M38 21v-8" stroke="#8a6041" stroke-width="4" stroke-linecap="round"/>';
    else if (key === 'banana') body = '<path d="M18 29c3 30 40 37 48 2-10 15-28 14-37-5z" fill="' + color + '" stroke="#d49a36" stroke-width="3"/><path d="M18 29l-3-5m51 7l3-4" stroke="#8a6041" stroke-width="4" stroke-linecap="round"/>';
    else if (key === 'milk') body = '<path d="M24 18h28l5 10v37H19V28z" fill="#fff" stroke="#83b5d4" stroke-width="3"/><path d="M24 18l5-7h18l5 7" fill="#8cc7e2"/><path d="M21 39h34v16H21z" fill="' + color + '"/><path d="M31 46h14" stroke="#fff" stroke-width="3" stroke-linecap="round"/>';
    else if (key === 'bread') body = '<path d="M17 67V32c0-13 10-22 22-22s22 9 22 22v35z" fill="' + color + '" stroke="#b77543" stroke-width="3"/><path d="M28 28c0-6 4-10 8-10m10 10c0-6-4-10-8-10" fill="none" stroke="#f1ca91" stroke-width="4" stroke-linecap="round"/>';
    else if (key === 'carrot') body = '<path d="M38 27c-10 10-17 25-14 37 11 6 25 5 35-2-1-14-9-27-21-35z" fill="' + color + '" stroke="#d47643" stroke-width="3"/><path d="M37 28c-6-9-4-15 0-20m4 21c3-10 9-13 14-14" fill="none" stroke="#6aaa76" stroke-width="6" stroke-linecap="round"/>';
    else if (key === 'fish') body = '<path d="M15 43c13-20 40-20 54 0-14 20-41 20-54 0z" fill="' + color + '" stroke="#4b91b2" stroke-width="3"/><path d="M69 43l12-12v24z" fill="#70a9c2" stroke="#4b91b2" stroke-width="3"/><circle cx="32" cy="38" r="3" fill="#4f3d3a"/><path d="M46 31c4 8 4 16 0 24" fill="none" stroke="#fff" stroke-width="3" opacity=".65"/>';
    else if (key === 'cookie') body = '<circle cx="42" cy="43" r="28" fill="' + color + '" stroke="#b77d51" stroke-width="3"/><circle cx="29" cy="31" r="4" fill="#a96b45"/><circle cx="48" cy="28" r="4" fill="#a96b45"/><circle cx="55" cy="48" r="4" fill="#a96b45"/><circle cx="34" cy="55" r="4" fill="#a96b45"/>';
    else body = '<path d="M14 26h58L58 68H27z" fill="' + color + '" stroke="#d59a39" stroke-width="3"/><circle cx="33" cy="39" r="4" fill="#fff1b4"/><circle cx="53" cy="52" r="4" fill="#fff1b4"/><circle cx="57" cy="35" r="3" fill="#fff1b4"/>';
    return '<svg class="svg-icon" width="' + (size || 70) + '" height="' + (size || 70) + '" viewBox="0 0 84 84" aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  function customerSvg() {
    return '<svg class="customer-svg" viewBox="0 0 80 80" aria-hidden="true"><path d="M17 29L11 8l20 12M63 29l6-21-20 12" fill="#f4bb98" stroke="#df9879" stroke-width="4" stroke-linejoin="round"/><circle cx="40" cy="42" r="29" fill="#f6c5a4" stroke="#df9879" stroke-width="4"/><circle cx="30" cy="40" r="3.5" fill="#4f3d3a"/><circle cx="50" cy="40" r="3.5" fill="#4f3d3a"/><path d="M33 52c5 5 10 5 15 0" fill="none" stroke="#b96d68" stroke-width="3.5" stroke-linecap="round"/></svg>';
  }

  function basketSvg() {
    return '<svg viewBox="0 0 60 52" aria-hidden="true"><path d="M11 20h38l-5 25H16z" fill="#83c7ab" stroke="#539a83" stroke-width="3"/><path d="M20 20c0-17 20-17 20 0" fill="none" stroke="#539a83" stroke-width="4" stroke-linecap="round"/><path d="M19 28h22M18 36h24" stroke="#fff" stroke-width="2" opacity=".75"/></svg>';
  }

  function showScreen(name) {
    ['Home', 'Lobby', 'Room', 'Game', 'Result'].forEach(function (screen) {
      $('screen' + screen).classList.toggle('active', screen.toLowerCase() === name);
    });
    app.screen = name;
    window.scrollTo({ top: 0, behavior: Store.reduceMotion() ? 'auto' : 'smooth' });
  }

  function toast(message) {
    var node = $('toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(app.toastTimer);
    app.toastTimer = setTimeout(function () { node.classList.remove('show'); }, 3000);
  }

  function vibrate(pattern) {
    if (Store.vibrate() && navigator.vibrate) navigator.vibrate(pattern || 18);
  }

  function setConnection(status, message) {
    var pill = $('connectionPill');
    pill.className = 'connection-pill ' + (status === 'connected' ? '' : status === 'error' ? 'error' : 'connecting');
    pill.textContent = status === 'connected' ? '線上已連線' : status === 'connecting' ? (message || '正在連線…') : status === 'error' ? '線上連線有問題' : '單機準備好了';
  }

  function updateHomeMode() {
    document.querySelectorAll('.mode-option').forEach(function (button) { button.classList.toggle('selected', button.dataset.mode === app.mode); });
    $('difficultyRow').hidden = app.mode !== 'ai';
    $('homeActionButton').textContent = app.mode === 'solo' ? '開始自己逛' : app.mode === 'ai' ? '找小幫手來玩' : '進入超市大廳';
  }

  function openDialog(dialog, focusTarget) {
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    if (focusTarget) setTimeout(function () { focusTarget.focus(); }, 20);
  }

  function stopLocal() {
    if (app.local.timer) { clearInterval(app.local.timer); app.local.timer = null; }
    app.local.ai = null;
    GameAudio.stopMusic();
  }

  function startLocal(withAi) {
    GameAudio.unlock(); GameAudio.startMusic();
    stopLocal();
    var difficulty = $('difficulty').value;
    Store.difficulty(difficulty);
    var seed = 'local-' + Date.now().toString(36);
    var players = [{ id: app.local.playerId, name: Store.nick() }];
    if (withAi) players.push({ id: 'helper', name: '小幫手' });
    app.local.game = SupermarketRules.createGame({ seed: seed, difficulty: difficulty, players: players, now: Date.now() });
    app.local.ai = withAi ? SupermarketAI.createBrain(difficulty, seed) : null;
    showScreen('game');
    renderGame(SupermarketRules.snapshot(app.local.game), false);
    if (app.local.ai) {
      app.local.timer = setInterval(function () {
        if (!app.local.game || app.local.game.status !== 'playing') return;
        var move = app.local.ai.step(SupermarketRules.snapshot(app.local.game), Date.now());
        if (move) {
          var result = SupermarketRules.collect(app.local.game, 'helper', move.productKey);
          if (result.ok) renderGame(SupermarketRules.snapshot(app.local.game), false);
        }
      }, 120);
    }
  }

  function currentGame() {
    return app.screen === 'game' || app.screen === 'result' ? app.online.room && app.online.room.game ? app.online.room.game : (app.local.game ? SupermarketRules.snapshot(app.local.game) : null) : null;
  }

  function renderSummary(state, online) {
    var task = state.task || { label: '購物清單', instruction: '清單上的商品都要找到喔！' };
    var roleText = online ? (app.online.role === 'observer' ? '你正在觀戰，只能看大家購物。' : '你是購物員，可以點商品和結帳。') : (app.local.ai ? '小幫手會慢慢幫你找商品。' : '自己慢慢找，找對就會放進購物籃。');
    var progress = state.totalNeeded ? Math.round(state.totalCollected / state.totalNeeded * 100) : 0;
    var scores = (state.players || []).map(function (player) { return '<div class="score-line"><span>' + escapeHtml(player.name) + '</span><strong>' + player.score + ' 分</strong></div>'; }).join('');
    $('summaryBox').innerHTML = '<span class="summary-label">現在的任務</span><strong class="summary-value">' + escapeHtml(task.label) + '</strong><span class="summary-value task-instruction">' + escapeHtml(task.instruction) + '</span><div class="summary-meter" aria-label="購物進度"><i style="width:' + progress + '%"></i></div><span class="summary-label" style="margin-top:8px">購物進度 ' + state.totalCollected + ' / ' + state.totalNeeded + '</span><p class="summary-value" style="font-size:.8rem;margin:13px 0 0">' + roleText + '</p><div class="score-list">' + scores + '</div>';
  }

  function renderGame(state, online) {
    if (!state) return;
    var task = state.task || { type: 'shopping', label: '購物清單', title: '請幫我找：', instruction: '清單上的商品都要找到喔！' };
    GameAudio.startMusic();
    var observer = online && app.online.role === 'observer';
    $('gameEyebrow').textContent = (online ? (observer ? '線上合作｜觀戰中' : '線上合作任務') : (app.local.ai ? '和小幫手一起' : '今天的客人')) + '｜' + task.label;
    $('gameTitle').textContent = task.label;
    $('roundChip').textContent = '第 ' + state.currentRound + ' / ' + state.maxRounds + ' 張';
    $('customerBubble').textContent = state.customer + '說：「' + task.instruction + '」';
    $('customerCharacter').innerHTML = customerSvg();
    var keys = SupermarketRules.PRODUCT_ORDER.filter(function (key) { return state.order[key]; });
    var total = state.totalNeeded || 0;
    $('listProgress').textContent = state.totalCollected + ' / ' + total;
    $('listTitle').textContent = task.title || '請幫我找：';
    $('listInstruction').textContent = task.instruction || '清單上的商品都要找到喔！';
    $('shelfInstruction').textContent = task.type === 'category' ? '找出同一類的商品' : task.type === 'counting' ? '數一數，點到指定數量' : '找到商品，點一下放進籃子';
    $('orderItems').innerHTML = keys.map(function (key) {
      var got = state.collected[key] || 0; var need = state.order[key]; var p = SupermarketRules.productOf(key);
      return '<div class="order-item ' + (got >= need ? 'done' : '') + '">' + '<span class="order-icon">' + productSvg(key, 36) + '</span><span><strong>' + p.label + '</strong><small>' + got + ' / ' + need + ' 個</small></span></div>';
    }).join('');
    $('basketCounter').innerHTML = basketSvg() + '<strong>' + state.totalCollected + '</strong>';
    $('productGrid').innerHTML = SupermarketRules.PRODUCT_ORDER.map(function (key) {
      var p = SupermarketRules.productOf(key); var got = state.collected[key] || 0; var need = state.order[key] || 0;
      var disabled = observer || state.status !== 'playing' || (need > 0 && got >= need);
      return '<button class="product-card ' + (got > 0 ? 'in-cart' : '') + '" data-product="' + key + '" aria-label="拿一個' + p.label + '" ' + (disabled ? 'disabled' : '') + '>' + (got > 0 ? '<span class="item-count">' + got + '</span>' : '') + '<span class="product-icon">' + productSvg(key, 68) + '</span><strong>' + p.label + '</strong><small>' + p.category + '</small></button>';
    }).join('');
    var ready = state.status === 'ready-checkout';
    $('checkoutButton').disabled = !ready || observer;
    $('checkoutMessage').textContent = observer ? '觀戰中，看大家一起買齊！' : ready ? '全部買好了，可以去結帳！' : '還有商品要找找看喔！';
    $('checkoutSubmessage').textContent = observer ? '你可以在聊天室為大家加油。' : ready ? '按下按鈕完成這張購物清單。' : '不急，慢慢找就好。';
    renderSummary(state, online);
    $('chatBox').hidden = !online;
    if (online) $('chatRoomLabel').textContent = app.online.room ? '房間 ' + app.online.room.room.code : '線上';
    document.querySelectorAll('.product-card').forEach(function (button) { button.addEventListener('click', handleProduct); });
    $('checkoutButton').onclick = handleCheckout;
  }

  function handleProduct(event) {
    var key = event.currentTarget.dataset.product;
    GameAudio.unlock();
    if (app.online.room && app.online.room.game && app.screen === 'game') {
      if (app.online.role !== 'player') return toast('觀戰者不能拿商品，但可以幫大家加油！');
      Online.send('game:collect', { productKey: key });
      return;
    }
    if (!app.local.game) return;
    var result = SupermarketRules.collect(app.local.game, app.local.playerId, key);
    if (result.ok) { GameAudio.play('collect'); vibrate(16); renderGame(SupermarketRules.snapshot(app.local.game), false); }
    else { GameAudio.play('wrong'); vibrate([10, 20, 10]); toast(result.error); }
  }

  function handleCheckout() {
    GameAudio.unlock();
    if (app.online.room && app.online.room.game && app.screen === 'game') {
      if (app.online.role !== 'player') return toast('觀戰者不能結帳。');
      Online.send('game:checkout'); return;
    }
    if (!app.local.game) return;
    var result = SupermarketRules.checkout(app.local.game, app.local.playerId);
    if (!result.ok) return toast(result.error);
    GameAudio.play(result.finished ? 'win' : 'checkout'); vibrate(result.finished ? [30, 40, 30] : 20);
    if (result.finished) showResult(SupermarketRules.snapshot(app.local.game), false);
    else { if (app.local.ai) app.local.ai.reset(); renderGame(SupermarketRules.snapshot(app.local.game), false); }
  }

  function showResult(state, online) {
    stopLocal();
    showScreen('result');
    var stars = online ? 3 : Math.max(1, Math.min(3, 3 - Math.floor((state.mistakes || 0) / 3)));
    $('resultStars').textContent = '★ '.repeat(stars) + '☆ '.repeat(3 - stars);
    $('resultStars').setAttribute('aria-label', '得到 ' + stars + ' 顆星');
    $('resultTitle').textContent = online ? '大家都是超市大明星！' : '今天的超市大明星！';
    $('resultMessage').textContent = online ? '大家一起把購物清單全部買齊了！' : '你把客人的購物清單全部買齊了！';
    $('resultScores').innerHTML = (state.players || []).map(function (player) { return '<div class="result-score"><span>' + escapeHtml(player.name) + '</span><strong>' + player.score + ' 分</strong></div>'; }).join('');
  }

  function renderRoom(state) {
    app.online.room = state;
    app.online.role = state.me && state.me.role;
    $('roomCodeText').textContent = state.room.code;
    $('roomNameText').textContent = state.room.name + '｜' + (state.room.difficulty === 'easy' ? '簡單' : state.room.difficulty === 'hard' ? '困難' : '普通') + '難度';
    $('roomRoleBadge').textContent = app.online.role === 'observer' ? '觀戰者' : state.isOwner ? '店長／購物員' : '購物員';
    $('playerCountText').textContent = state.players.length + ' / ' + state.room.maxPlayers;
    $('observerLine').textContent = '觀戰者 ' + state.observers.length + ' 人';
    $('seatList').innerHTML = state.players.map(function (player, index) {
      return '<div class="seat"><span class="seat-avatar" style="background:' + playerColor(index) + '">' + escapeHtml(player.name.slice(0, 1)) + '</span><span class="seat-info"><strong>' + escapeHtml(player.name) + (player.id === state.room.ownerId ? '（店長）' : '') + '</strong><small>' + (player.connected ? '已連線' : '暫時離開') + '</small></span><span class="seat-state">' + (player.ready ? '已準備' : '等待中') + '</span></div>';
    }).join('');
    var isPlayer = app.online.role === 'player';
    var roomWaiting = state.room.status === 'waiting' || state.room.status === 'finished';
    var ready = state.me && state.me.ready;
    $('readyButton').hidden = !isPlayer || !roomWaiting;
    $('readyButton').textContent = ready ? '取消準備' : '準備好了';
    $('startRoomButton').hidden = !state.isOwner || !roomWaiting;
    $('roomHint').textContent = app.online.role === 'observer' ? '你可以看大家購物，也可以在聊天室加油。' : state.isOwner ? '所有購物員都準備好後，就可以開始。' : '準備好了就按下面的按鈕。';
    updateInviteBox(state);
  }

  function playerColor(index) { return ['#7a9fd2', '#e69485', '#76b99b', '#a48fdb'][index % 4]; }

  function updateInviteBox(state) {
    var credentials = app.online.credentials;
    var box = $('inviteBox');
    if (!credentials || !state.isOwner) { box.hidden = true; return; }
    box.hidden = false;
  }

  function renderLobby(rooms) {
    rooms = rooms || [];
    $('lobbyStatus').textContent = Config.isOnlineEnabled() ? '可以加入公開房間，或自己開一間。' : '伺服器尚未設定，請使用 ?serverUrl=...';
    $('roomEmpty').hidden = rooms.length > 0;
    $('roomList').innerHTML = rooms.map(function (room) {
      var status = room.status === 'playing' ? '遊戲中' : '等待中';
      return '<div class="room-tile"><div class="room-tile-head"><h3>' + escapeHtml(room.name) + '</h3><span class="room-status">' + status + '</span></div><small>店長：' + escapeHtml(room.ownerName) + '</small><div class="room-meta"><span>購物員 ' + room.players + ' / ' + room.maxPlayers + '</span><span>' + (room.private ? '私人房' : '公開房') + '</span></div><div style="display:flex;gap:8px"><button class="primary-button room-join" data-code="' + room.code + '" data-role="player">加入購物</button><button class="secondary-button room-join" data-code="' + room.code + '" data-role="observer">觀戰</button></div></div>';
    }).join('');
    document.querySelectorAll('.room-join').forEach(function (button) { button.addEventListener('click', function () { joinOnlineRoom(button.dataset.code, button.dataset.role); }); });
  }

  function prepareInvite(entry) {
    app.online.pendingInvite = { code: entry.room, invite: entry.invite || '', role: entry.role || 'player' };
    $('lobby-nick').value = Store.nick();
    $('invite-gate').hidden = false;
    $('invite-gate-note').textContent = entry.invite
      ? '正在確認邀請連結；請先設定你的暱稱，再加入這間超市。'
      : '請先設定你的暱稱，再加入這間超市。';
  }

  function joinPendingInvite() {
    var invite = app.online.pendingInvite;
    if (!invite) return;
    var name = $('lobby-nick').value.trim().slice(0, 20);
    if (!name) {
      toast('請先輸入暱稱，再加入邀請房間。');
      $('lobby-nick').focus();
      return;
    }
    Store.nick(name);
    joinOnlineRoom(invite.code, invite.role, invite.invite);
  }

  function connectOnline() {
    if (!Config.isOnlineEnabled()) { toast(Config.error || '尚未設定線上伺服器。請在設定或網址參數提供 serverUrl。'); openDialog($('settingsDialog'), $('musicToggle')); return; }
    var entry = Config.entry();
    if (entry.room && !app.online.entryPrepared) {
      prepareInvite(entry);
      app.online.entryPrepared = true;
    }
    var name = Store.nick();
    return Online.connect({ clientId: Store.clientId(), name: name }).then(function () {
      Online.send('lobby:subscribe');
    }).catch(function (error) { toast(error.message); throw error; });
  }

  function enterLobby() { showScreen('lobby'); connectOnline().catch(function () {}); }

  function createRoom() {
    if (!Online.connected()) return connectOnline();
    var roomName = window.prompt('幫這間超市取個名字吧！', Store.nick() + ' 的超市') || '彩虹小超市';
    Online.send('room:create', { roomName: roomName, difficulty: $('difficulty').value || 'normal', private: false });
  }

  function joinOnlineRoom(code, role, invite) {
    var sendJoin = function () {
      Online.send('room:join', {
        code: code, role: role || 'player', invite: invite || '', name: Store.nick()
      });
    };
    if (!Online.connected()) return connectOnline().then(sendJoin).catch(function () {});
    sendJoin();
  }

  function leaveRoom(toHome) {
    if (Online.connected() && app.online.room) Online.send('room:leave');
    app.online.room = null; app.online.credentials = null; app.online.role = null;
    if (toHome) { Online.disconnect(); showScreen('home'); }
    else { showScreen('lobby'); Online.send('lobby:subscribe'); }
  }

  function copyText(value) {
    if (!value) return toast('邀請連結還沒準備好。');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(function () { toast('邀請連結已複製！'); }).catch(function () { toast(value); });
    else { window.prompt('請複製這個邀請連結：', value); }
  }

  function appendChat(message) {
    var list = $('chatMessages');
    var node = document.createElement('div'); node.className = 'chat-message';
    node.innerHTML = '<strong>' + escapeHtml(message.name) + '</strong>：' + escapeHtml(message.text);
    list.appendChild(node); while (list.children.length > 40) list.removeChild(list.firstChild); list.scrollTop = list.scrollHeight;
  }

  function bindEvents() {
    $('playerName').value = Store.nick();
    $('difficulty').value = Store.difficulty();
    $('serverDescription').textContent = Config.describe(); $('settingsServerText').textContent = Config.describe();
    updateHomeMode();
    document.querySelectorAll('.mode-option').forEach(function (button) { button.addEventListener('click', function () { app.mode = button.dataset.mode; updateHomeMode(); GameAudio.play('click'); }); });
    $('playerName').addEventListener('input', function () { Store.nick($('playerName').value.trim() || '小店員'); });
    $('lobby-nick').value = Store.nick();
    $('lobby-nick').addEventListener('input', function () { Store.nick($('lobby-nick').value.trim().slice(0, 20)); });
    $('homeActionButton').addEventListener('click', function () { GameAudio.unlock(); if (app.mode === 'online') enterLobby(); else startLocal(app.mode === 'ai'); });
    $('tutorialButton').addEventListener('click', function () { app.lastSettingsFocus = $('tutorialButton'); openDialog($('tutorialDialog'), $('tutorialStartButton')); });
    $('tutorialClose').addEventListener('click', function () { $('tutorialDialog').close(); });
    $('tutorialStartButton').addEventListener('click', function () { $('tutorialDialog').close(); if (app.mode === 'online') enterLobby(); else startLocal(app.mode === 'ai'); });
    $('brandHome').addEventListener('click', function () { if (app.online.room) leaveRoom(true); else { stopLocal(); showScreen('home'); } });
    document.querySelectorAll('[data-action="home"]').forEach(function (button) { button.addEventListener('click', function () { Online.disconnect(); showScreen('home'); }); });
    document.querySelector('[data-action="leave-room"]').addEventListener('click', function () { leaveRoom(false); });
    $('refreshLobby').addEventListener('click', function () { Online.send('lobby:subscribe'); }); $('createRoomButton').addEventListener('click', createRoom);
    $('joinInviteButton').addEventListener('click', function () { GameAudio.play('click'); joinPendingInvite(); });
    $('readyButton').addEventListener('click', function () { var ready = app.online.room && app.online.room.me && app.online.room.me.ready; Online.send('room:ready', { ready: !ready }); });
    $('startRoomButton').addEventListener('click', function () { Online.send('room:start'); });
    $('copyInviteButton').addEventListener('click', function () { var c = app.online.credentials; copyText(c && Config.inviteUrl(app.online.room.room.code, c.playerToken, 'player')); });
    $('copyObserverButton').addEventListener('click', function () { var c = app.online.credentials; copyText(c && Config.inviteUrl(app.online.room.room.code, c.observerToken, 'observer')); });
    $('refreshInviteButton').addEventListener('click', function () { Online.send('room:revoke-invites'); });
    $('playAgainButton').addEventListener('click', function () { if (app.online.room) { showScreen('room'); renderRoom(app.online.room); } else startLocal(app.mode === 'ai'); });
    $('resultHomeButton').addEventListener('click', function () { if (app.online.room) leaveRoom(true); else { stopLocal(); showScreen('home'); } });
    $('openSidebar').addEventListener('click', function () { $('infoSidebar').classList.add('open'); }); $('closeSidebar').addEventListener('click', function () { $('infoSidebar').classList.remove('open'); });
    $('chatForm').addEventListener('submit', function (event) { event.preventDefault(); var text = $('chatInput').value.trim(); if (!text) return; Online.send('chat:send', { text: text }); $('chatInput').value = ''; });
    $('settingsButton').addEventListener('click', function () { app.lastSettingsFocus = document.activeElement; $('musicToggle').checked = Store.music(); $('soundToggle').checked = Store.sound(); $('vibrateToggle').checked = Store.vibrate(); $('motionToggle').checked = Store.reduceMotion(); openDialog($('settingsDialog'), $('musicToggle')); });
    $('musicToggle').addEventListener('change', function () { Store.music(this.checked); if (this.checked) GameAudio.startMusic(); else GameAudio.stopMusic(); }); $('soundToggle').addEventListener('change', function () { Store.sound(this.checked); }); $('vibrateToggle').addEventListener('change', function () { Store.vibrate(this.checked); }); $('motionToggle').addEventListener('change', function () { Store.reduceMotion(this.checked); });
    $('resetSettingsButton').addEventListener('click', function () { Store.resetDefaults(); $('musicToggle').checked = Store.music(); $('soundToggle').checked = Store.sound(); $('vibrateToggle').checked = Store.vibrate(); $('motionToggle').checked = Store.reduceMotion(); GameAudio.startMusic(); toast('設定已恢復預設。'); });
    $('settingsDialog').addEventListener('close', function () { if (app.lastSettingsFocus && app.lastSettingsFocus.focus) app.lastSettingsFocus.focus(); });
  }

  function bindOnline() {
    Online.on('status', function (event) { setConnection(event.status, event.message); });
    Online.on('lobby:rooms', function (event) { renderLobby(event.rooms || []); });
    Online.on('room:created', function (event) { app.online.credentials = event.credentials; app.online.role = event.role; toast('房間開好了，邀請朋友一起來吧！'); });
    Online.on('room:credentials', function (event) { app.online.credentials = event.credentials; toast('邀請連結已更新。'); });
    Online.on('room:joined', function (event) {
      app.online.role = event.role;
      app.online.pendingInvite = null;
      $('invite-gate').hidden = true;
    });
    Online.on('room:state', function (event) {
      var state = event.state; if (!state) return;
      app.online.role = state.me && state.me.role;
      if (!state.game) { showScreen('room'); renderRoom(state); return; }
      app.online.room = state;
      if (state.game.status === 'finished') showResult(state.game, true); else { showScreen('game'); renderGame(state.game, true); }
    });
    Online.on('game:event', function (event) { if (event.event && event.event.type === 'collect') GameAudio.play('collect'); if (event.event && event.event.type === 'checkout') GameAudio.play('checkout'); });
    Online.on('room:chat', function (event) { if (event.message) appendChat(event.message); });
    Online.on('room:error', function (event) { toast(event.message || '操作失敗，請再試一次。'); });
    Online.on('connected', function () { setConnection('connected'); if (!app.online.room) Online.send('lobby:subscribe'); });
  }

  bindEvents(); bindOnline();
  setTimeout(function () { if (Config.entry().room && Config.isOnlineEnabled()) enterLobby(); }, 80);
}(window));
