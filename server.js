'use strict';

const http = require('http');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const Rules = require('./public/js/rules.js');
const { RoomStore, sanitizeName, sanitizeChat } = require('./lib/rooms.js');

function createServer(options = {}) {
  const port = Number(options.port ?? process.env.PORT ?? 3030);
  const host = options.host || process.env.HOST || '0.0.0.0';
  const allowed = String(options.allowedOrigin ?? process.env.GAME_ALLOWED_ORIGIN ?? '*')
    .split(',').map((value) => value.trim()).filter(Boolean);
  const allowAll = allowed.includes('*');
  const store = options.store || new RoomStore({
    idleMs: Number(process.env.ROOM_IDLE_MS || 1800000),
    inviteTtlMs: Number(process.env.INVITE_TTL_MS || 86400000)
  });
  const app = express();
  const startedAt = Date.now();
  const sessions = new Map();
  const lobbySubscribers = new Set();
  let cleanupTimer = null;

  function originAllowed(origin) { return allowAll || !origin || allowed.includes(origin); }
  function send(socket, type, payload = {}) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, ...payload }));
  }
  function fail(socket, message, code = 'invalid') { send(socket, 'room:error', { message, code }); }
  function sessionOf(socket) { return sessions.get(socket) || null; }
  function roomOf(socket) {
    const session = sessionOf(socket);
    return session && session.roomCode ? store.get(session.roomCode) : null;
  }
  function broadcastLobby() {
    const payload = { rooms: store.list() };
    lobbySubscribers.forEach((socket) => send(socket, 'lobby:rooms', payload));
  }
  function broadcastRoom(room, type, payloadFactory) {
    for (const [socket, session] of sessions) {
      if (session.roomCode === room.code) send(socket, type, typeof payloadFactory === 'function' ? payloadFactory(session) : payloadFactory);
    }
  }
  function broadcastState(room) {
    broadcastRoom(room, 'room:state', (session) => ({ state: room.viewFor(session.clientId, Rules) }));
  }
  function removeSessionFromRoom(session, { remove = false } = {}) {
    const room = session.roomCode ? store.get(session.roomCode) : null;
    if (!room) { session.roomCode = null; session.role = null; return null; }
    if (remove) room.remove(session.clientId);
    else room.disconnect(session.clientId);
    session.roomCode = null;
    session.role = null;
    broadcastState(room);
    broadcastLobby();
    return room;
  }
  function credentials(room) {
    return {
      playerToken: room.invites.get('player')?.token,
      observerToken: room.invites.get('observer')?.token,
      inviteExpiresAt: room.invites.get('player')?.expiresAt
    };
  }
  function setMemberScore(room) {
    if (!room.game) return;
    for (const player of room.players.values()) {
      const score = room.game.players[player.id];
      if (score) { player.score = score.score; player.collected = score.collected; }
    }
  }

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && originAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', allowAll ? '*' : origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  /* Render 同源部署時動態回傳自己的公開網址；GitHub Pages 則使用建置產生的靜態檔。 */
  app.get('/runtime-config.js', (req, res) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const origin = `${protocol}://${req.get('host')}`;
    res.type('application/javascript').set('Cache-Control', 'no-cache').send(
      `window.__LITTLE_SUPERMARKET_CONFIG__ = { serverUrl: ${JSON.stringify(origin)} };`
    );
  });
  app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
  app.get('/health', (_req, res) => res.json({
    ok: true, service: 'little-supermarket', uptimeSec: Math.round((Date.now() - startedAt) / 1000), rooms: store.list().length
  }));
  app.get('/api/rooms', (_req, res) => res.json({ rooms: store.list() }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({
    server,
    maxPayload: 10000,
    verifyClient: ({ origin }, done) => done(originAllowed(origin), originAllowed(origin) ? undefined : 'Origin 不在允許清單中')
  });

  function hello(socket, payload) {
    const previous = sessionOf(socket) || {};
    let clientId = String(payload.clientId || '').trim();
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(clientId)) clientId = `c${crypto.randomBytes(12).toString('hex')}`;
    const name = sanitizeName(payload.name, previous.name || '小店員');
    for (const [other, otherSession] of sessions) {
      if (other !== socket && otherSession.clientId === clientId) {
        send(other, 'room:error', { message: '這個裝置已在另一個分頁重新連線。', code: 'replaced' });
        other.close();
      }
    }
    const session = { clientId, name, roomCode: null, role: null, chatAt: 0 };
    sessions.set(socket, session);
    const room = store.findByMember(clientId);
    if (room) {
      const member = room.reconnect(clientId, name);
      session.roomCode = room.code;
      session.role = member.role;
      broadcastState(room);
    }
    send(socket, 'hello:ok', { clientId, name, serverTime: Date.now(), roomCode: session.roomCode, role: session.role });
  }

  function createRoom(socket, payload) {
    const session = sessionOf(socket);
    if (!session) return fail(socket, '請先連線準備好。', 'nosession');
    removeSessionFromRoom(session, { remove: true });
    const room = store.create({
      name: payload.roomName,
      ownerId: session.clientId,
      ownerName: session.name,
      difficulty: Rules.difficultyOf(payload.difficulty).key,
      isPrivate: !!payload.private,
      now: Date.now()
    });
    session.roomCode = room.code; session.role = 'player';
    send(socket, 'room:created', { code: room.code, credentials: credentials(room), role: 'player' });
    broadcastState(room); broadcastLobby();
  }

  function joinRoom(socket, payload) {
    const session = sessionOf(socket);
    if (!session) return fail(socket, '請先連線準備好。', 'nosession');
    const room = store.get(String(payload.code || '').toUpperCase());
    if (!room) return fail(socket, '找不到這個房間，可能已經關閉。', 'gone');
    const requestedRole = payload.role === 'observer' ? 'observer' : 'player';
    let role = requestedRole;
    const invite = String(payload.invite || '');
    if (invite) {
      if (room.validateInvite(invite, 'player')) role = 'player';
      else if (room.validateInvite(invite, 'observer')) role = 'observer';
      else return fail(socket, '邀請連結已過期、撤銷或無效。', 'invite-invalid');
    }
    if (room.private && !invite) return fail(socket, '這是私人房間，請使用店長提供的邀請連結。', 'invite-required');
    removeSessionFromRoom(session, { remove: true });
    const result = role === 'observer'
      ? room.addObserver(session.clientId, session.name)
      : room.addPlayer(session.clientId, session.name);
    if (!result.ok) return fail(socket, result.error, result.code);
    session.roomCode = room.code; session.role = role;
    send(socket, 'room:joined', { code: room.code, role });
    broadcastState(room); broadcastLobby();
  }

  function setReady(socket, payload) {
    const session = sessionOf(socket); const room = roomOf(socket);
    if (!session || !room) return fail(socket, '你目前不在房間裡。', 'no-room');
    const member = room.players.get(session.clientId);
    if (!member) return fail(socket, '觀戰者不能準備。', 'not-player');
    if (room.game && room.game.status !== 'finished') return fail(socket, '遊戲開始後不能改變準備狀態。', 'started');
    member.ready = payload.ready !== false; room.touch(); broadcastState(room);
  }

  function startRoom(socket) {
    const session = sessionOf(socket); const room = roomOf(socket);
    if (!session || !room) return fail(socket, '你目前不在房間裡。', 'no-room');
    if (room.ownerId !== session.clientId) return fail(socket, '只有店長可以開始遊戲。', 'not-owner');
    if (!room.players.size) return fail(socket, '至少需要一位購物員。', 'no-player');
    const allReady = Array.from(room.players.values()).every((player) => player.ready);
    if (!allReady) return fail(socket, '請等所有購物員按下「準備好了」。', 'not-ready');
    room.game = Rules.createGame({
      seed: crypto.randomBytes(8).toString('hex'),
      difficulty: room.difficulty,
      now: Date.now(),
      players: Array.from(room.players.values()).map((player) => ({ id: player.id, name: player.name }))
    });
    room.players.forEach((player) => { player.score = 0; player.collected = 0; });
    broadcastRoom(room, 'room:started', { state: room.viewFor(session.clientId, Rules) });
    broadcastState(room); broadcastLobby();
  }

  function collect(socket, payload) {
    const session = sessionOf(socket); const room = roomOf(socket);
    if (!session || !room || !room.game) return fail(socket, '遊戲還沒有開始。', 'not-playing');
    if (session.role !== 'player') return fail(socket, '觀戰者不能拿商品。', 'not-player');
    const result = Rules.collect(room.game, session.clientId, String(payload.productKey || ''));
    if (!result.ok) return fail(socket, result.error, result.code);
    setMemberScore(room); room.touch();
    broadcastRoom(room, 'game:event', { event: result.event, state: room.viewFor(session.clientId, Rules) });
    broadcastState(room);
  }

  function checkout(socket) {
    const session = sessionOf(socket); const room = roomOf(socket);
    if (!session || !room || !room.game) return fail(socket, '遊戲還沒有開始。', 'not-playing');
    if (session.role !== 'player') return fail(socket, '觀戰者不能結帳。', 'not-player');
    const result = Rules.checkout(room.game, session.clientId);
    if (!result.ok) return fail(socket, result.error, result.code);
    setMemberScore(room); room.touch();
    broadcastRoom(room, 'game:event', { event: result.event, state: room.viewFor(session.clientId, Rules) });
    broadcastState(room); broadcastLobby();
  }

  function sendChat(socket, payload) {
    const session = sessionOf(socket); const room = roomOf(socket);
    if (!session || !room) return fail(socket, '請先加入房間。', 'no-room');
    const now = Date.now();
    if (now - session.chatAt < 500) return fail(socket, '訊息太快了，請稍等一下。', 'rate-limit');
    const text = sanitizeChat(payload.text);
    if (!text) return fail(socket, '請輸入一點內容。', 'empty-message');
    session.chatAt = now; room.touch();
    broadcastRoom(room, 'room:chat', { message: { id: crypto.randomBytes(6).toString('hex'), name: session.name, role: session.role, text, at: now } });
  }

  wss.on('connection', (socket) => {
    sessions.set(socket, { clientId: null, name: '小店員', roomCode: null, role: null, chatAt: 0 });
    socket.on('message', (raw) => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch (error) { return fail(socket, '訊息格式不正確。', 'bad-message'); }
      const payload = message && message.payload && typeof message.payload === 'object' ? message.payload : {};
      switch (message.type) {
        case 'hello': return hello(socket, payload);
        case 'lobby:subscribe': lobbySubscribers.add(socket); return send(socket, 'lobby:rooms', { rooms: store.list() });
        case 'lobby:unsubscribe': return lobbySubscribers.delete(socket);
        case 'room:create': return createRoom(socket, payload);
        case 'room:join': return joinRoom(socket, payload);
        case 'room:leave': return removeSessionFromRoom(sessionOf(socket), { remove: true });
        case 'room:ready': return setReady(socket, payload);
        case 'room:start': return startRoom(socket);
        case 'game:collect': return collect(socket, payload);
        case 'game:checkout': return checkout(socket);
        case 'chat:send': return sendChat(socket, payload);
        case 'room:revoke-invites': {
          const session = sessionOf(socket); const room = roomOf(socket);
          if (!session || !room || room.ownerId !== session.clientId) return fail(socket, '只有店長可以更新邀請連結。', 'not-owner');
          room.revokeInvites(); send(socket, 'room:credentials', { credentials: credentials(room) }); return;
        }
        default: return fail(socket, '不認識這個操作。', 'unknown-action');
      }
    });
    socket.on('close', () => {
      const session = sessionOf(socket);
      if (session) {
        lobbySubscribers.delete(socket);
        const room = session.roomCode ? store.get(session.roomCode) : null;
        if (room) { room.disconnect(session.clientId); broadcastState(room); broadcastLobby(); }
      }
      sessions.delete(socket);
    });
  });

  function start() {
    return new Promise((resolve, reject) => {
      const onError = (error) => { server.off('listening', onListening); reject(error); };
      const onListening = () => { server.off('error', onError); resolve(server.address()); };
      server.once('error', onError); server.once('listening', onListening); server.listen(port, host);
    });
  }
  function close() {
    if (cleanupTimer) clearInterval(cleanupTimer);
    for (const socket of sessions.keys()) socket.close();
    return new Promise((resolve) => wss.close(() => server.close(() => resolve())));
  }
  cleanupTimer = setInterval(() => { if (store.cleanup().length) broadcastLobby(); }, 60000);
  cleanupTimer.unref();

  return { app, server, wss, store, start, close, originAllowed };
}

if (require.main === module) {
  const instance = createServer();
  instance.start().then((address) => console.log(`小小超市伺服器已啟動：http://${address.address}:${address.port}`))
    .catch((error) => { console.error(error); process.exitCode = 1; });
}

module.exports = { createServer };
