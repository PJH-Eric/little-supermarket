'use strict';

const crypto = require('crypto');

const MAX_PLAYERS = 4;
const MAX_OBSERVERS = 8;

function sanitizeName(value, fallback = '小店員') {
  const name = String(value || '').replace(/[<>]/g, '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 20);
  return name || fallback;
}

function sanitizeChat(value) {
  return String(value || '').replace(/[<>]/g, '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120);
}

function code() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function token() {
  return crypto.randomBytes(18).toString('base64url');
}

class Room {
  constructor({ name, ownerId, ownerName, difficulty = 'normal', isPrivate = false, now = Date.now(), inviteTtlMs = 86400000 }) {
    this.code = code();
    this.name = sanitizeName(name, '歡迎來逛超市');
    this.ownerId = ownerId;
    this.difficulty = difficulty;
    this.private = !!isPrivate;
    this.createdAt = now;
    this.lastActivityAt = now;
    this.inviteTtlMs = inviteTtlMs;
    this.players = new Map();
    this.observers = new Map();
    this.invites = new Map();
    this.game = null;
    this.addPlayer(ownerId, ownerName, now);
    this.players.get(ownerId).ready = false;
    this.issueInvite('player', now);
    this.issueInvite('observer', now);
  }

  touch(now = Date.now()) { this.lastActivityAt = now; }

  issueInvite(role, now = Date.now()) {
    const invite = { token: token(), role, createdAt: now, expiresAt: now + this.inviteTtlMs, revoked: false };
    this.invites.set(role, invite);
    this.touch(now);
    return invite;
  }

  revokeInvites(now = Date.now()) {
    this.invites.forEach((invite) => { invite.revoked = true; });
    this.issueInvite('player', now);
    this.issueInvite('observer', now);
  }

  validateInvite(value, role, now = Date.now()) {
    const invite = this.invites.get(role);
    return !!invite && value === invite.token && !invite.revoked && invite.expiresAt > now;
  }

  addPlayer(id, name, now = Date.now()) {
    if (this.players.has(id)) return { ok: false, code: 'already-in-room', error: '你已經在這個房間裡了。' };
    if (this.players.size >= MAX_PLAYERS) return { ok: false, code: 'full', error: '玩家席位已滿，可以選擇觀戰。' };
    this.players.set(id, { id, name: sanitizeName(name), role: 'player', ready: false, connected: true, score: 0, collected: 0, joinedAt: now });
    this.touch(now);
    return { ok: true };
  }

  addObserver(id, name, now = Date.now()) {
    if (this.players.has(id) || this.observers.has(id)) return { ok: false, code: 'already-in-room', error: '你已經在這個房間裡了。' };
    if (this.observers.size >= MAX_OBSERVERS) return { ok: false, code: 'observer-full', error: '觀戰席已滿，請稍後再試。' };
    this.observers.set(id, { id, name: sanitizeName(name), role: 'observer', connected: true, joinedAt: now });
    this.touch(now);
    return { ok: true };
  }

  reconnect(id, name, now = Date.now()) {
    const member = this.member(id);
    if (!member) return null;
    member.name = sanitizeName(name, member.name);
    member.connected = true;
    this.touch(now);
    return member;
  }

  disconnect(id, now = Date.now()) {
    const member = this.member(id);
    if (member) { member.connected = false; this.touch(now); }
  }

  remove(id, now = Date.now()) {
    const existed = this.players.delete(id) || this.observers.delete(id);
    if (existed && this.ownerId === id) {
      const next = this.players.values().next();
      this.ownerId = next.done ? null : next.value.id;
    }
    if (existed) this.touch(now);
    return existed;
  }

  member(id) { return this.players.get(id) || this.observers.get(id) || null; }

  isEmpty() { return this.players.size === 0 && this.observers.size === 0; }

  summary() {
    const owner = this.member(this.ownerId);
    return {
      code: this.code,
      name: this.name,
      ownerId: this.ownerId,
      private: this.private,
      players: this.players.size,
      maxPlayers: MAX_PLAYERS,
      observers: this.observers.size,
      maxObservers: MAX_OBSERVERS,
      status: this.game ? this.game.status : 'waiting',
      difficulty: this.difficulty,
      ownerName: owner ? owner.name : '店長'
    };
  }

  viewFor(id, rules) {
    const member = this.member(id);
    return {
      room: this.summary(),
      me: member ? { id: member.id, name: member.name, role: member.role, ready: !!member.ready, connected: !!member.connected } : null,
      isOwner: this.ownerId === id,
      players: Array.from(this.players.values()).map((player) => ({
        id: player.id, name: player.name, role: player.role, ready: !!player.ready,
        connected: !!player.connected, score: player.score || 0, collected: player.collected || 0
      })),
      observers: Array.from(this.observers.values()).map((observer) => ({ id: observer.id, name: observer.name, connected: !!observer.connected })),
      game: this.game ? rules.snapshot(this.game) : null
    };
  }
}

class RoomStore {
  constructor(options = {}) {
    this.rooms = new Map();
    this.idleMs = Number(options.idleMs || 1800000);
    this.inviteTtlMs = Number(options.inviteTtlMs || 86400000);
  }

  create(options) {
    const room = new Room({ ...options, inviteTtlMs: this.inviteTtlMs });
    this.rooms.set(room.code, room);
    return room;
  }

  get(roomCode) { return this.rooms.get(String(roomCode || '').toUpperCase()) || null; }

  remove(roomCode) { return this.rooms.delete(String(roomCode || '').toUpperCase()); }

  findByMember(id) {
    for (const room of this.rooms.values()) if (room.member(id)) return room;
    return null;
  }

  list() {
    return Array.from(this.rooms.values())
      .filter((room) => !room.isEmpty())
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((room) => room.summary());
  }

  cleanup(now = Date.now()) {
    const removed = [];
    for (const [key, room] of this.rooms) {
      const finished = room.game && room.game.status === 'finished';
      const ttl = finished ? Math.min(this.idleMs, 600000) : this.idleMs;
      if ((room.isEmpty() && now - room.lastActivityAt > 60000) || now - room.lastActivityAt > ttl) {
        this.rooms.delete(key); removed.push(key);
      }
    }
    return removed;
  }
}

module.exports = { Room, RoomStore, sanitizeName, sanitizeChat, MAX_PLAYERS, MAX_OBSERVERS };
