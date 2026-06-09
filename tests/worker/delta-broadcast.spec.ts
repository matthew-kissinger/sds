// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * P2-DELTA-IMPL: RoomDO broadcast cohorts + keyframe paths
 * (docs/hardening/delta-protocol-design.md sections 4-6).
 *
 * Locks, with the socket-stub harness from room-do-messages.spec.ts:
 *   - a session that joined with protocolVersion >= 3 receives the keyframe
 *     (full gameStateUpdate, tick-stamped) / gameStateDelta cadence;
 *   - a v2 session and a session with NO version receive ONLY full
 *     gameStateUpdate frames every broadcast interval, byte-compatible with
 *     v2 except the additive `tick` field (per-client soft-degrade);
 *   - a mixed room serves both cohorts correctly from one interval;
 *   - gameStarted carries the tick-stamped snapshot (the first keyframe);
 *   - a socket binding mid-game is unicast a keyframe immediately;
 *   - player records rehydrated from DO storage without a protocolVersion
 *     are treated as legacy (full frames).
 */
import { describe, it, expect } from 'vitest';
import { decode } from '@msgpack/msgpack';
import { RoomDO } from '../../worker/src/RoomDO.ts';
import { PROTOCOL_VERSION, KEYFRAME_INTERVAL_TICKS } from '../../shared/protocol.js';

// ---- DurableObject mocks (mirror room-do-messages.spec.ts) ------------------

class FakeStorage {
  map = new Map<string, unknown>();
  alarmAt: number | null = null;
  async get(key: string) { return this.map.get(key); }
  async put(key: string, val: unknown) { this.map.set(key, val); }
  async delete(key: string) { this.map.delete(key); }
  async getAlarm() { return this.alarmAt; }
  setAlarm(ts: number) { this.alarmAt = ts; }
}

function makeFakeState(storage = new FakeStorage()) {
  return {
    storage,
    blockConcurrencyWhile: async (fn: () => unknown) => { await fn(); },
  } as any;
}

function makeFakeEnv() {
  return { ROOM_DO: {}, LOBBY_DO: {}, DB: {}, JWT_SECRET: 'test-secret' } as any;
}

class FakeSocket {
  readyState = 1;
  sent: any[] = [];
  listeners = new Map<string, ((evt: any) => void)[]>();
  addEventListener(type: string, cb: (evt: any) => void) {
    const arr = this.listeners.get(type) ?? [];
    arr.push(cb);
    this.listeners.set(type, arr);
  }
  send(buf: ArrayBuffer | Uint8Array) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBuffer);
    this.sent.push(decode(bytes));
  }
  close() {}
  framesOfType(t: string) { return this.sent.filter((m) => m && m.t === t); }
}

// ---- room setup --------------------------------------------------------------

async function initRoom(room: any, hostProtocolVersion?: number, storageBacked = false) {
  void storageBacked;
  const body = {
    roomCode: 'TESTRM',
    hostId: 'host-sess',
    hostName: 'Alice',
    hostDogType: 'jep',
    hostPersistentId: 'pid-host',
    hostDisplayName: 'Alice',
    ...(hostProtocolVersion !== undefined ? { hostProtocolVersion } : {}),
    roomSettings: { isPublic: false, gameMode: 'cooperative', sceneId: 'field', sheepCount: 200 },
  };
  const res = await room.fetch(new Request('http://room/init', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }));
  expect(res.status).toBe(200);
}

async function joinRoom(room: any, sessionId: string, protocolVersion?: number) {
  const body: Record<string, unknown> = {
    playerId: sessionId,
    playerName: sessionId,
    dogType: 'jep',
    persistentId: `pid-${sessionId}`,
    displayName: sessionId,
  };
  if (protocolVersion !== undefined) body.protocolVersion = protocolVersion;
  const res = await room.fetch(new Request('http://room/join', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }));
  expect(res.status).toBe(200);
}

// Mixed room: host v3, one v2 guest, one no-version guest, all bound + live.
async function startMixedGame(room: any) {
  await initRoom(room, PROTOCOL_VERSION);
  await joinRoom(room, 'guest-v2', 2);
  await joinRoom(room, 'guest-novers');
  const sockets = {
    v3: new FakeSocket(),
    v2: new FakeSocket(),
    legacy: new FakeSocket(),
  };
  room.bindSocket('host-sess', sockets.v3);
  room.bindSocket('guest-v2', sockets.v2);
  room.bindSocket('guest-novers', sockets.legacy);
  room.handleClientMessage('host-sess', { t: 'startGame' });
  expect(room.simulation).not.toBeNull();
  // Stop the real intervals; tests drive ticks + broadcasts manually.
  room.simulation.stop();
  room.stopBroadcastLoop();
  return sockets;
}

function tickN(room: any, n: number) {
  room.simulation.isRunning = true;
  try {
    for (let i = 0; i < n; i++) room.simulation.tick();
  } finally {
    room.simulation.isRunning = false;
  }
}

// One broadcast interval (the setInterval body, driven by hand).
function broadcastOnce(room: any) {
  room.broadcastGameFrame();
}

// The exact v2 full-frame key set for a cooperative field room, plus the
// additive `tick`. Anything else on a legacy frame is a byte-compat break.
const LEGACY_FRAME_KEYS = new Set([
  't', 'v', 'tick', 'timestamp', 'sheepRetired', 'totalSheep',
  'gameCompleted', 'isCompetitive', 'isTimedMode', 'sheep', 'sheepdogs',
]);

describe('P2-DELTA: broadcast cohort split', () => {
  it('serves keyframe/delta cadence to v3 and full frames to v2/no-version from the same intervals', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    const sockets = await startMixedGame(room);
    for (const s of Object.values(sockets)) s.sent.length = 0;

    // Drive KEYFRAME_INTERVAL_TICKS + 5 broadcast frames, hand-advanced (the
    // wire tick + a single moved sheep per frame, no physics tick) so the
    // cadence is observable without the 85% degenerate rule firing - a fresh
    // sim's whole flock legitimately moves for the first several real ticks,
    // which delta-protocol.spec.ts covers; THIS test pins the cohort routing.
    const total = KEYFRAME_INTERVAL_TICKS + 5;
    for (let t = 1; t <= total; t++) {
      room.simulation.tickCount = t;
      room.simulation.gameState.sheep[t % 200].position.x += 0.5;
      room.simulation.broadcastGameState();
      broadcastOnce(room);
    }

    // v3 cohort: keyframes exactly at the cadence (tick 1 = first frame with
    // no basis, tick 60 = cadence), deltas everywhere else.
    const v3Keyframes = sockets.v3.framesOfType('gameStateUpdate');
    const v3Deltas = sockets.v3.framesOfType('gameStateDelta');
    expect(v3Keyframes.map((f: any) => f.tick)).toEqual([1, KEYFRAME_INTERVAL_TICKS]);
    expect(v3Deltas).toHaveLength(total - 2);
    for (const d of v3Deltas) {
      expect(Array.isArray(d.changed)).toBe(true);
      expect(typeof d.tick).toBe('number');
      expect(typeof d.baseTick).toBe('number');
      // Deltas chain: each diffs against the immediately previous broadcast.
      expect(d.baseTick).toBe(d.tick - 1);
    }

    // Legacy cohorts: a full gameStateUpdate EVERY interval, never a delta.
    for (const s of [sockets.v2, sockets.legacy]) {
      expect(s.framesOfType('gameStateDelta')).toHaveLength(0);
      const fulls = s.framesOfType('gameStateUpdate');
      expect(fulls).toHaveLength(total);
      for (const f of fulls) {
        expect(new Set(Object.keys(f))).toEqual(LEGACY_FRAME_KEYS);
        expect(f.sheep).toHaveLength(200);
        expect(f.v).toBe(PROTOCOL_VERSION);
      }
    }

    // On a keyframe interval all three sockets received the SAME full frame.
    const kf60v3 = v3Keyframes[1];
    const kf60v2 = sockets.v2.framesOfType('gameStateUpdate')[KEYFRAME_INTERVAL_TICKS - 1];
    expect(kf60v2.tick).toBe(KEYFRAME_INTERVAL_TICKS);
    expect(kf60v3).toEqual(kf60v2);
  });

  it('delta frames contain exactly the changed sheep, keyed by array index', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    const sockets = await startMixedGame(room);
    // Establish a basis (first frame = keyframe).
    tickN(room, 1);
    broadcastOnce(room);
    sockets.v3.sent.length = 0;

    // Park the whole sim quiet (no tick), then move exactly two sheep and
    // re-broadcast a hand-advanced frame.
    room.simulation.tickCount = 2;
    room.simulation.gameState.sheep[7].position.x += 0.5;
    room.simulation.gameState.sheep[42].position.z -= 0.25;
    room.simulation.broadcastGameState();
    broadcastOnce(room);

    const deltas = sockets.v3.framesOfType('gameStateDelta');
    expect(deltas).toHaveLength(1);
    const changed = deltas[0].changed;
    expect(changed.map((c: any) => c.i).sort((a: number, b: number) => a - b)).toEqual([7, 42]);
    // Full quantized record per changed sheep (id rides along; i is the key).
    expect(changed[0]).toHaveProperty('x');
    expect(changed[0]).toHaveProperty('vx');
    expect(changed[0]).toHaveProperty('state');
  });

  it('duplicate intervals (loop outpacing the sim) send empty deltas to v3 and full frames to legacy', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    const sockets = await startMixedGame(room);
    tickN(room, 1);
    broadcastOnce(room);
    for (const s of Object.values(sockets)) s.sent.length = 0;

    // Two more intervals with NO sim tick in between.
    broadcastOnce(room);
    broadcastOnce(room);

    const dups = sockets.v3.framesOfType('gameStateDelta');
    expect(dups).toHaveLength(2);
    for (const d of dups) {
      expect(d.changed).toEqual([]);
      expect(d.baseTick).toBe(d.tick);
    }
    // The legacy cohort still gets its full frame every interval.
    expect(sockets.v2.framesOfType('gameStateUpdate')).toHaveLength(2);
  });
});

describe('P2-DELTA: keyframe-on-start and keyframe-on-bind', () => {
  it('gameStarted carries the tick-stamped snapshot (tick 0, the first keyframe)', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    const sockets = await startMixedGame(room);
    const started = sockets.v3.framesOfType('gameStarted');
    expect(started).toHaveLength(1);
    expect(started[0].gameState.tick).toBe(0);
    expect(started[0].gameState.v).toBe(PROTOCOL_VERSION);
  });

  it('unicasts a tick-stamped keyframe to a socket that binds mid-game', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    const sockets = await startMixedGame(room);
    tickN(room, 5);
    broadcastOnce(room);

    // The v2 guest reconnects mid-game on a fresh socket.
    const rebound = new FakeSocket();
    room.bindSocket('guest-v2', rebound);
    const keyframes = rebound.framesOfType('gameStateUpdate');
    expect(keyframes).toHaveLength(1);
    expect(keyframes[0].tick).toBe(5);
    expect(keyframes[0].sheep).toHaveLength(200);
    // The bind still sends roomUpdated first (existing contract).
    expect(rebound.framesOfType('roomUpdated')).toHaveLength(1);
    void sockets;
  });

  it('does not unicast a keyframe on a lobby-state bind (no sim yet)', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    await initRoom(room, PROTOCOL_VERSION);
    const ws = new FakeSocket();
    room.bindSocket('host-sess', ws);
    expect(ws.framesOfType('gameStateUpdate')).toHaveLength(0);
    expect(ws.framesOfType('roomUpdated')).toHaveLength(1);
  });
});

describe('P2-DELTA: protocolVersion storage + rehydration', () => {
  it('stores the create/join protocolVersion on the player record and persists it', async () => {
    const storage = new FakeStorage();
    const room: any = new RoomDO(makeFakeState(storage), makeFakeEnv());
    await initRoom(room, PROTOCOL_VERSION);
    await joinRoom(room, 'guest-v2', 2);
    await joinRoom(room, 'guest-novers');

    expect(room.players.get('host-sess').protocolVersion).toBe(PROTOCOL_VERSION);
    expect(room.players.get('guest-v2').protocolVersion).toBe(2);
    expect(room.players.get('guest-novers').protocolVersion).toBeUndefined();

    // Persisted: a rehydrated DO sees the same cohort assignments.
    const rehydrated: any = new RoomDO(makeFakeState(storage), makeFakeEnv());
    await new Promise((r) => setTimeout(r, 0)); // let blockConcurrencyWhile settle
    expect(rehydrated.players.get('host-sess').protocolVersion).toBe(PROTOCOL_VERSION);
    expect(rehydrated.isDeltaCapable('host-sess')).toBe(true);
    expect(rehydrated.isDeltaCapable('guest-v2')).toBe(false);
    expect(rehydrated.isDeltaCapable('guest-novers')).toBe(false);
  });

  it('treats player records persisted BEFORE the delta protocol (no protocolVersion field) as legacy', async () => {
    const storage = new FakeStorage();
    // Simulate a pre-deploy persisted room: players carry no protocolVersion.
    storage.map.set('room', {
      meta: {
        roomCode: 'OLDROOM', hostId: 'old-sess', name: 'Old', maxPlayers: 4,
        isPublic: false, gameMode: 'cooperative', sceneId: 'field', sheepCount: 200,
        seed: 42, modeLocked: false, state: 'waiting', createdAt: 1, lastActivity: 1,
      },
      players: [['old-sess', {
        id: 'old-sess', name: 'Old', dogType: 'jep', isHost: true, isReady: true,
        persistentId: 'pid-old', displayName: 'Old', joinedAt: 1,
      }]],
    });
    const room: any = new RoomDO(makeFakeState(storage), makeFakeEnv());
    await new Promise((r) => setTimeout(r, 0));
    expect(room.players.get('old-sess')).toBeDefined();
    expect(room.players.get('old-sess').protocolVersion).toBeUndefined();
    expect(room.isDeltaCapable('old-sess')).toBe(false);
  });

  it('drops a non-finite protocolVersion instead of storing it', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    await initRoom(room);
    const res = await room.fetch(new Request('http://room/join', {
      method: 'POST',
      body: JSON.stringify({
        playerId: 'evil-sess', playerName: 'Evil', dogType: 'jep',
        persistentId: 'pid-evil', displayName: 'Evil', protocolVersion: 'Infinity',
      }),
      headers: { 'content-type': 'application/json' },
    }));
    expect(res.status).toBe(200);
    expect(room.players.get('evil-sess').protocolVersion).toBeUndefined();
    expect(room.isDeltaCapable('evil-sess')).toBe(false);
  });
});
