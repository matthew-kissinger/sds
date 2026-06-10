// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 86 Phase 2: worker fixes from the P4-CHAOS findings.
 *
 * Fix 1 - full-room rehydration 409 lockout. After a DO eviction a room that
 * rehydrates full used to refuse ALL rejoins with 409 until the 60s idle
 * alarm fired, locking out the very players whose identities sit in the
 * persisted players map. A join that re-proves a PERSISTED identity
 * (persistentId already present in the players map; the Worker router only
 * forwards a persistentId derived from a verified JWT, which is minted only
 * after the P-SEC-1 persistent_id + auth_secret proof) is a RECONNECTION:
 *   - it bypasses the room-full check and reclaims the existing slot under
 *     the fresh sessionId (no duplicate entry, count never exceeds capacity);
 *   - a genuinely NEW persistentId still gets the 409 when the room is full;
 *   - the host identity's reconnection re-points hostId at the new session.
 *
 * Fix 2 - host_migration's `reclaimedByOriginal` log field was computed
 * AFTER hostPersistentId was re-pinned to the new host, so it always logged
 * true. It must reflect the actual reclaim state.
 *
 * Harness mirrors tests/worker/backpressure.spec.ts (FakeStorage / FakeSocket
 * / fetch-driven init+join), plus a rehydration step: a second RoomDO
 * constructed over the SAME storage replays the constructor hydration path
 * production takes on eviction (in-game snaps back to 'waiting').
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RoomDO } from '../../worker/src/RoomDO.ts';
import { PROTOCOL_VERSION } from '../../shared/protocol.js';

// ---- DurableObject mocks (mirror backpressure.spec.ts) ----------------------

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
  bufferedAmount = 0;
  closed: { code?: number; reason?: string } | null = null;
  listeners = new Map<string, ((evt: any) => void)[]>();
  addEventListener(type: string, cb: (evt: any) => void) {
    const arr = this.listeners.get(type) ?? [];
    arr.push(cb);
    this.listeners.set(type, arr);
  }
  send(_buf: ArrayBuffer | Uint8Array) { this.sent.push(_buf); }
  close(code?: number, reason?: string) { this.closed = { code, reason }; }
}

// ---- room setup --------------------------------------------------------------

async function initRoom(room: any, maxPlayers = 4) {
  const body = {
    roomCode: 'TESTRM',
    hostId: 'host-sess',
    hostName: 'Alice',
    hostDogType: 'jep',
    hostPersistentId: 'pid-host',
    hostDisplayName: 'Alice',
    hostProtocolVersion: PROTOCOL_VERSION,
    roomSettings: { isPublic: false, gameMode: 'cooperative', sceneId: 'field', sheepCount: 200, maxPlayers },
  };
  const res = await room.fetch(new Request('http://room/init', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }));
  expect(res.status).toBe(200);
}

async function joinRoom(room: any, sessionId: string, persistentId: string): Promise<Response> {
  return room.fetch(new Request('http://room/join', {
    method: 'POST',
    body: JSON.stringify({
      playerId: sessionId,
      playerName: sessionId,
      dogType: 'pip',
      persistentId,
      displayName: sessionId,
      protocolVersion: PROTOCOL_VERSION,
    }),
    headers: { 'content-type': 'application/json' },
  }));
}

// Build a FULL 4-player in-game room over `storage`, then drop it (the sim is
// stopped; the persisted state is what matters), and rehydrate a fresh RoomDO
// over the same storage - the exact constructor path a production eviction
// replays. Returns the rehydrated room.
async function rehydratedFullRoom(storage: FakeStorage) {
  const room1: any = new RoomDO(makeFakeState(storage), makeFakeEnv());
  await initRoom(room1);
  for (const g of ['g1', 'g2', 'g3']) {
    const res = await joinRoom(room1, `${g}-sess`, `pid-${g}`);
    expect(res.status).toBe(200);
  }
  // Bind sockets + start so the persisted state is 'in-game' (the eviction
  // scenario: a live game dies with the DO memory).
  for (const sid of ['host-sess', 'g1-sess', 'g2-sess', 'g3-sess']) {
    room1.bindSocket(sid, new FakeSocket());
  }
  room1.handleClientMessage('host-sess', { t: 'startGame' });
  expect(room1.meta.state).toBe('in-game');
  room1.simulation.stop();
  room1.stopBroadcastLoop();
  await room1.persist();

  const room2: any = new RoomDO(makeFakeState(storage), makeFakeEnv());
  // Constructor hydration runs inside blockConcurrencyWhile; flush it.
  await new Promise((r) => setTimeout(r, 0));
  expect(room2.meta.state).toBe('waiting'); // in-game snapped back on hydration
  expect(room2.players.size).toBe(4);       // rehydrated FULL
  return room2;
}

function logLines(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls
    .map((call: any[]) => { try { return JSON.parse(call[0]); } catch { return null; } })
    .filter(Boolean) as any[];
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---- Fix 1: full-room rehydration rejoin --------------------------------------

describe('Cycle 86 Fix 1: full rehydrated room accepts persisted-identity rejoins', () => {
  it('accepts a persisted-identity rejoin into a full rehydrated room (no 409) and never exceeds capacity', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {}); // do_evicted_midgame
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const room = await rehydratedFullRoom(new FakeStorage());

    const res = await joinRoom(room, 'g1-newsess', 'pid-g1');
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.playerId).toBe('g1-newsess');
    expect(body.isHost).toBe(false);

    // The slot was RECLAIMED, not duplicated: count stays at capacity, the
    // new session is in, the stale session is gone.
    expect(room.players.size).toBe(4);
    expect(room.players.has('g1-newsess')).toBe(true);
    expect(room.players.has('g1-sess')).toBe(false);
    expect(room.players.get('g1-newsess').persistentId).toBe('pid-g1');
  });

  it('accepts ALL four persisted identities back; count never exceeds maxPlayers', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const room = await rehydratedFullRoom(new FakeStorage());

    const rejoins: Array<[string, string]> = [
      ['host-newsess', 'pid-host'],
      ['g1-newsess', 'pid-g1'],
      ['g2-newsess', 'pid-g2'],
      ['g3-newsess', 'pid-g3'],
    ];
    for (const [sess, pid] of rejoins) {
      const res = await joinRoom(room, sess, pid);
      expect(res.status).toBe(200);
      expect(room.players.size).toBeLessThanOrEqual(room.meta.maxPlayers);
    }
    expect(room.players.size).toBe(4);
    const pids = Array.from(room.players.values()).map((p: any) => p.persistentId).sort();
    expect(pids).toEqual(['pid-g1', 'pid-g2', 'pid-g3', 'pid-host']);
  });

  it('still 409s a genuinely NEW persistentId when the room is full (room-full semantics unchanged)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const room = await rehydratedFullRoom(new FakeStorage());

    const res = await joinRoom(room, 'stranger-sess', 'pid-stranger');
    expect(res.status).toBe(409);
    const body = await res.json<any>();
    expect(body.error).toBe('Room is full');
    expect(room.players.size).toBe(4);
    expect(room.players.has('stranger-sess')).toBe(false);
  });

  it('the host identity reconnection reclaims the host slot (isHost true, hostId re-pointed, pin unchanged)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const room = await rehydratedFullRoom(new FakeStorage());

    const res = await joinRoom(room, 'host-newsess', 'pid-host');
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.isHost).toBe(true);
    expect(room.meta.hostId).toBe('host-newsess');
    expect(room.meta.hostPersistentId).toBe('pid-host');
    expect(room.players.get('host-newsess').isHost).toBe(true);
    // Exactly one host flag set across the map.
    const hostFlags = Array.from(room.players.values()).filter((p: any) => p.isHost);
    expect(hostFlags.length).toBe(1);
    // The reclaimed host passes the host-only startGame gate under the new session.
    room.handleClientMessage('host-newsess', { t: 'startGame' });
    expect(room.meta.state).toBe('in-game');
    room.simulation.stop();
    room.stopBroadcastLoop();
  });

  it('a reconnection into a NON-full room replaces the stale entry instead of duplicating it', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const room: any = new RoomDO(makeFakeState(new FakeStorage()), makeFakeEnv());
    await initRoom(room);
    expect((await joinRoom(room, 'g1-sess', 'pid-g1')).status).toBe(200);
    expect(room.players.size).toBe(2);

    const res = await joinRoom(room, 'g1-newsess', 'pid-g1');
    expect(res.status).toBe(200);
    expect(room.players.size).toBe(2);
    expect(room.players.has('g1-sess')).toBe(false);
    expect(room.players.has('g1-newsess')).toBe(true);
  });

  it('a genuinely new joiner into a NON-full room is unaffected (joins as a new player)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const room: any = new RoomDO(makeFakeState(new FakeStorage()), makeFakeEnv());
    await initRoom(room);
    const res = await joinRoom(room, 'g1-sess', 'pid-g1');
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.isHost).toBe(false);
    expect(room.players.size).toBe(2);
  });
});

// ---- Fix 2: reclaimedByOriginal reflects the actual reclaim state -------------

describe('Cycle 86 Fix 2: host_migration reclaimedByOriginal', () => {
  async function inGameRoom() {
    const room: any = new RoomDO(makeFakeState(new FakeStorage()), makeFakeEnv());
    await initRoom(room);
    expect((await joinRoom(room, 'guest-sess', 'pid-guest')).status).toBe(200);
    room.bindSocket('host-sess', new FakeSocket());
    room.bindSocket('guest-sess', new FakeSocket());
    room.handleClientMessage('host-sess', { t: 'startGame' });
    expect(room.meta.state).toBe('in-game');
    room.simulation.stop();
    room.stopBroadcastLoop();
    return room;
  }

  it('logs reclaimedByOriginal: false when a non-original host takes over', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const room = await inGameRoom();

    // The host leaves for good; the guest (a different identity) takes over.
    room.handlePlayerLeave('host-sess');

    const migration = logLines(logSpy).find((l) => l.event === 'host_migration');
    expect(migration).toBeDefined();
    expect(migration.newHostId).toBe('guest-sess');
    expect(migration.reclaimedByOriginal).toBe(false);
    // The pin DID migrate to the guest - that is what made the old
    // after-the-re-pin comparison always log true.
    expect(room.meta.hostPersistentId).toBe('pid-guest');
  });

  it('logs reclaimedByOriginal: true when a session holding the original host identity reclaims', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const room = await inGameRoom();

    // A second session sharing the pinned host identity (the shape the
    // reclaim branch was written for: an original host back under a new
    // sessionId while the old session entry is still present).
    room.players.set('host-newsess', {
      id: 'host-newsess',
      name: 'Alice',
      dogType: 'jep',
      isHost: false,
      isReady: true,
      persistentId: 'pid-host',
      displayName: 'Alice',
      joinedAt: Date.now(),
    });
    room.bindSocket('host-newsess', new FakeSocket());

    room.handlePlayerLeave('host-sess');

    const migration = logLines(logSpy).find((l) => l.event === 'host_migration');
    expect(migration).toBeDefined();
    expect(migration.newHostId).toBe('host-newsess');
    expect(migration.reclaimedByOriginal).toBe(true);
    expect(room.meta.hostPersistentId).toBe('pid-host');
  });
});
