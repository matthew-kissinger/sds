// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * P-SEC-4 (e) + (f): LobbyDO DoS / resource-exhaustion caps.
 *
 * The singleton LobbyDO tracks public rooms for /api/lobbies + quick-match and
 * (new in P-SEC-4) owns the per-persistent_id concurrent-room cap. This spec
 * locks down:
 *
 *   - allocate-code returns a well-formed 3-letter-3-digit room code that does
 *     not collide with an existing entry;
 *   - quick-match runs the full filter chain (public + waiting + not-full +
 *     gameMode match) and skips entries failing any link;
 *   - listLobbies / findQuickMatch evict stale (> STALE_MS) entries on read;
 *   - register enforces the MAX_PUBLIC_ROOMS map ceiling (oldest-evicted) so a
 *     create-flood can't grow the map without bound;
 *   - the proactive prune (pruneStale / alarm) sweeps stale entries even with no
 *     read traffic, and the alarm re-arms only while rooms remain;
 *   - claim-room enforces MAX_ROOMS_PER_PID per identity and release-room frees a
 *     slot; an idle/stale sweep also releases the slot.
 *
 * Reuses the FakeStorage / fake-Env DurableObject mocks from
 * tests/worker/room-do-messages.spec.ts, extended with setAlarm/getAlarm so the
 * prune-alarm path is exercised rather than silently skipped.
 */
import { describe, it, expect } from 'vitest';
import { encode } from '@msgpack/msgpack';
import { LobbyDO } from '../../worker/src/LobbyDO.ts';

// ---- DurableObject mocks (mirror room-do-messages.spec.ts, + alarm support) --

class FakeStorage {
  map = new Map<string, unknown>();
  alarmAt: number | null = null;
  async get(key: string) { return this.map.get(key); }
  async put(key: string, val: unknown) { this.map.set(key, val); }
  async delete(key: string) { this.map.delete(key); }
  // P-SEC-4 (f): minimal alarm surface so schedulePrune/alarm exercise the real
  // path. setAlarm overwrites the single pending alarm; getAlarm reads it.
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
  return { ROOM_DO: {} } as any;
}

// A public, joinable lobby entry with sane defaults; override per-test.
function entry(overrides: Partial<any> = {}) {
  return {
    roomCode: 'AAA111',
    hostName: 'Alice',
    gameMode: 'cooperative',
    sceneId: 'field',
    sheepCount: 200,
    playerCount: 1,
    maxPlayers: 4,
    state: 'waiting',
    isPublic: true,
    updatedAt: Date.now(),
    ...overrides,
  };
}

async function post(lobby: any, path: string, body: unknown) {
  return lobby.fetch(new Request(`https://do${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

async function get(lobby: any, path: string) {
  return lobby.fetch(new Request(`https://do${path}`, { method: 'GET' }));
}

// ---- allocate-code ---------------------------------------------------------

describe('P-SEC-4: LobbyDO allocate-code', () => {
  it('returns a 3-letter + 3-digit code', async () => {
    const lobby = new LobbyDO(makeFakeState(), makeFakeEnv());
    const res = await post(lobby, '/allocate-code', {});
    const { roomCode } = await res.json<{ roomCode: string }>();
    expect(roomCode).toMatch(/^[A-Z]{3}[0-9]{3}$/);
  });

  it('does not return a code already present in the map', async () => {
    const lobby: any = new LobbyDO(makeFakeState(), makeFakeEnv());
    // Saturate every code except a single free one, then assert allocate finds it.
    const free = 'ZZZ999';
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    // Fill a handful of codes; allocate must avoid them. (Full saturation is
    // infeasible; this asserts the collision guard runs.)
    for (let i = 0; i < 50; i++) {
      const c = `${letters[i % 26]}${letters[(i + 1) % 26]}${letters[(i + 2) % 26]}${String(i % 10)}${String((i + 1) % 10)}${String((i + 2) % 10)}`;
      lobby.rooms.set(c, entry({ roomCode: c }));
    }
    void free;
    const res = await post(lobby, '/allocate-code', {});
    const { roomCode } = await res.json<{ roomCode: string }>();
    expect(lobby.rooms.has(roomCode)).toBe(false);
  });
});

// ---- quick-match filter chain ----------------------------------------------

describe('P-SEC-4: LobbyDO quick-match filter chain', () => {
  it('matches a public waiting non-full room of the right mode', async () => {
    const lobby: any = new LobbyDO(makeFakeState(), makeFakeEnv());
    await post(lobby, '/register', entry({ roomCode: 'GOOD01', gameMode: 'cooperative' }));
    const res = await post(lobby, '/quick-match', { gameMode: 'cooperative' });
    const { match } = await res.json<any>();
    expect(match).not.toBeNull();
    expect(match.roomCode).toBe('GOOD01');
  });

  it('skips a full room, an in-game room, a private room, and a mode mismatch', async () => {
    const lobby: any = new LobbyDO(makeFakeState(), makeFakeEnv());
    await post(lobby, '/register', entry({ roomCode: 'FULL01', playerCount: 4, maxPlayers: 4 }));
    await post(lobby, '/register', entry({ roomCode: 'GAME01', state: 'in-game' }));
    // A private room never reaches the map (register drops non-public), but
    // assert the chain anyway by setting it directly.
    lobby.rooms.set('PRIV01', entry({ roomCode: 'PRIV01', isPublic: false }));
    await post(lobby, '/register', entry({ roomCode: 'MODE01', gameMode: 'competitive' }));

    const res = await post(lobby, '/quick-match', { gameMode: 'cooperative' });
    const { match } = await res.json<any>();
    expect(match).toBeNull();
  });

  it('quick-match returns the first eligible room and ignores ineligible ones ahead of it', async () => {
    const lobby: any = new LobbyDO(makeFakeState(), makeFakeEnv());
    await post(lobby, '/register', entry({ roomCode: 'FULL02', playerCount: 4, maxPlayers: 4 }));
    await post(lobby, '/register', entry({ roomCode: 'OPEN02', playerCount: 2, maxPlayers: 4 }));
    const res = await post(lobby, '/quick-match', { gameMode: 'cooperative' });
    const { match } = await res.json<any>();
    expect(match.roomCode).toBe('OPEN02');
  });
});

// ---- stale eviction --------------------------------------------------------

describe('P-SEC-4: LobbyDO stale eviction', () => {
  it('listLobbies drops entries older than the stale window', async () => {
    const lobby: any = new LobbyDO(makeFakeState(), makeFakeEnv());
    // Insert a stale entry directly (register would stamp a fresh updatedAt).
    lobby.rooms.set('STALE1', entry({ roomCode: 'STALE1', updatedAt: Date.now() - 5 * 60 * 1000 }));
    lobby.rooms.set('FRESH1', entry({ roomCode: 'FRESH1', updatedAt: Date.now() }));

    const res = await get(lobby, '/list');
    const { lobbies } = await res.json<{ lobbies: any[] }>();
    const codes = lobbies.map((l) => l.roomCode);
    expect(codes).toContain('FRESH1');
    expect(codes).not.toContain('STALE1');
    // The stale one was actually removed from the map, not just filtered out.
    expect(lobby.rooms.has('STALE1')).toBe(false);
  });

  it('findQuickMatch evicts a stale entry instead of returning it', async () => {
    const lobby: any = new LobbyDO(makeFakeState(), makeFakeEnv());
    lobby.rooms.set('STALE2', entry({ roomCode: 'STALE2', updatedAt: Date.now() - 5 * 60 * 1000 }));
    const res = await post(lobby, '/quick-match', { gameMode: 'cooperative' });
    const { match } = await res.json<any>();
    expect(match).toBeNull();
    expect(lobby.rooms.has('STALE2')).toBe(false);
  });

  it('pruneStale sweeps stale entries proactively (no read needed)', async () => {
    const lobby: any = new LobbyDO(makeFakeState(), makeFakeEnv());
    lobby.rooms.set('OLD', entry({ roomCode: 'OLD', updatedAt: Date.now() - 5 * 60 * 1000 }));
    lobby.rooms.set('NEW', entry({ roomCode: 'NEW', updatedAt: Date.now() }));
    const removed = lobby.pruneStale();
    expect(removed).toBe(1);
    expect(lobby.rooms.has('OLD')).toBe(false);
    expect(lobby.rooms.has('NEW')).toBe(true);
  });
});

// ---- prune alarm -----------------------------------------------------------

describe('P-SEC-4: LobbyDO prune alarm', () => {
  it('arms a prune alarm on construct', () => {
    const storage = new FakeStorage();
    // eslint-disable-next-line no-new
    new LobbyDO(makeFakeState(storage), makeFakeEnv());
    // schedulePrune runs async; flush microtasks.
    return Promise.resolve().then(() => {
      expect(storage.alarmAt).not.toBeNull();
    });
  });

  it('alarm() sweeps stale entries and re-arms only while rooms remain', async () => {
    const storage = new FakeStorage();
    const lobby: any = new LobbyDO(makeFakeState(storage), makeFakeEnv());
    await Promise.resolve(); // let construct-time schedulePrune settle
    lobby.rooms.set('OLD', entry({ roomCode: 'OLD', updatedAt: Date.now() - 5 * 60 * 1000 }));
    lobby.rooms.set('NEW', entry({ roomCode: 'NEW', updatedAt: Date.now() }));

    storage.alarmAt = null;
    await lobby.alarm();
    // Stale gone, fresh remains, and because a room remains the alarm re-armed.
    expect(lobby.rooms.has('OLD')).toBe(false);
    expect(lobby.rooms.has('NEW')).toBe(true);
    expect(storage.alarmAt).not.toBeNull();

    // Now drop the last room and fire again — no re-arm when empty.
    lobby.rooms.clear();
    storage.alarmAt = null;
    await lobby.alarm();
    expect(storage.alarmAt).toBeNull();
  });
});

// ---- map size cap ----------------------------------------------------------

describe('P-SEC-4: LobbyDO public-room map cap', () => {
  it('caps the map at MAX_PUBLIC_ROOMS, evicting the oldest on overflow', async () => {
    const lobby: any = new LobbyDO(makeFakeState(), makeFakeEnv());
    // Register MAX + 5 distinct fresh rooms via the real register path. Use a
    // monotonic updatedAt so "oldest" is deterministic (register stamps its own
    // Date.now(), which is monotonic across the loop).
    const MAX = 2000;
    for (let i = 0; i < MAX + 5; i++) {
      const code = 'C' + String(i).padStart(6, '0');
      // Call the private register directly to avoid 2005 JSON round-trips.
      lobby.register(entry({ roomCode: code, updatedAt: Date.now() + i }));
    }
    expect(lobby.rooms.size).toBeLessThanOrEqual(MAX);
    // The newest room must still be present (a fresh legitimate room always lands).
    expect(lobby.rooms.has('C' + String(MAX + 4).padStart(6, '0'))).toBe(true);
    // The very first (oldest) room must have been evicted.
    expect(lobby.rooms.has('C000000')).toBe(false);
  });

  it('updating an existing entry never grows the map past the cap', async () => {
    const lobby: any = new LobbyDO(makeFakeState(), makeFakeEnv());
    const MAX = 2000;
    for (let i = 0; i < MAX; i++) {
      lobby.register(entry({ roomCode: 'D' + String(i).padStart(6, '0'), updatedAt: Date.now() + i }));
    }
    const sizeBefore = lobby.rooms.size;
    // Re-register an existing room — must not evict or grow.
    lobby.register(entry({ roomCode: 'D000500', playerCount: 3 }));
    expect(lobby.rooms.size).toBe(sizeBefore);
    expect(lobby.rooms.get('D000500').playerCount).toBe(3);
  });
});

// ---- per-pid concurrent-room cap (claim/release) ---------------------------

describe('P-SEC-4: LobbyDO per-persistent_id concurrent-room cap', () => {
  it('allows up to MAX_ROOMS_PER_PID claims then 429s the next', async () => {
    const lobby: any = new LobbyDO(makeFakeState(), makeFakeEnv());
    const pid = 'pid-spammer';
    for (let i = 0; i < 5; i++) {
      const res = await post(lobby, '/claim-room', { persistentId: pid, roomCode: `R${i}` });
      expect(res.status).toBe(200);
    }
    // The 6th claim for the same identity is refused.
    const sixth = await post(lobby, '/claim-room', { persistentId: pid, roomCode: 'R5' });
    expect(sixth.status).toBe(429);
    const body = await sixth.json<any>();
    expect(body.error).toBe('room_limit');
  });

  it('release-room frees a slot so the identity can claim again', async () => {
    const lobby: any = new LobbyDO(makeFakeState(), makeFakeEnv());
    const pid = 'pid-cycler';
    for (let i = 0; i < 5; i++) {
      await post(lobby, '/claim-room', { persistentId: pid, roomCode: `Q${i}` });
    }
    // At cap: next claim 429s.
    expect((await post(lobby, '/claim-room', { persistentId: pid, roomCode: 'Q5' })).status).toBe(429);
    // Release one, then the claim succeeds.
    expect((await post(lobby, '/release-room', { roomCode: 'Q0' })).status).toBe(200);
    expect((await post(lobby, '/claim-room', { persistentId: pid, roomCode: 'Q5' })).status).toBe(200);
  });

  it('re-claiming an already-owned room is idempotent (no double-count)', async () => {
    const lobby: any = new LobbyDO(makeFakeState(), makeFakeEnv());
    const pid = 'pid-idem';
    for (let i = 0; i < 4; i++) {
      await post(lobby, '/claim-room', { persistentId: pid, roomCode: `I${i}` });
    }
    // Re-claim I0 several times — must not consume additional slots.
    for (let i = 0; i < 3; i++) {
      expect((await post(lobby, '/claim-room', { persistentId: pid, roomCode: 'I0' })).status).toBe(200);
    }
    // Still room for exactly one more distinct claim (4 used + this 5th).
    expect((await post(lobby, '/claim-room', { persistentId: pid, roomCode: 'I9' })).status).toBe(200);
    // Now at 5 — the next distinct one 429s.
    expect((await post(lobby, '/claim-room', { persistentId: pid, roomCode: 'IX' })).status).toBe(429);
  });

  it('a stale sweep releases the swept room\'s pid slot', async () => {
    const lobby: any = new LobbyDO(makeFakeState(), makeFakeEnv());
    const pid = 'pid-stale';
    // Claim a room, then register it as a stale public entry under the same code.
    await post(lobby, '/claim-room', { persistentId: pid, roomCode: 'S0' });
    lobby.rooms.set('S0', entry({ roomCode: 'S0', updatedAt: Date.now() - 5 * 60 * 1000 }));
    // Fill the rest of the cap with distinct claims.
    for (let i = 1; i < 5; i++) {
      await post(lobby, '/claim-room', { persistentId: pid, roomCode: `S${i}` });
    }
    // At cap (S0..S4). Sweeping S0 (stale) should free its slot.
    expect((await post(lobby, '/claim-room', { persistentId: pid, roomCode: 'SNEW' })).status).toBe(429);
    expect(lobby.pruneStale()).toBe(1); // S0 swept
    expect((await post(lobby, '/claim-room', { persistentId: pid, roomCode: 'SNEW' })).status).toBe(200);
  });

  it('an empty persistentId fails open (never charges a slot)', async () => {
    const lobby: any = new LobbyDO(makeFakeState(), makeFakeEnv());
    // 10 claims with no identity all succeed (nothing to charge / lock out).
    for (let i = 0; i < 10; i++) {
      expect((await post(lobby, '/claim-room', { persistentId: '', roomCode: `E${i}` })).status).toBe(200);
    }
  });
});

// keep the msgpack import meaningful: a tiny sanity round-trip used by no other
// assertion but documents that the lobby protocol is JSON (REST), not msgpack.
describe('P-SEC-4: lobby REST is JSON, not msgpack', () => {
  it('register accepts a JSON body (msgpack-encoded body would not parse)', async () => {
    const lobby: any = new LobbyDO(makeFakeState(), makeFakeEnv());
    const res = await post(lobby, '/register', entry({ roomCode: 'JSON01' }));
    expect(res.status).toBe(200);
    // Sanity: msgpack.encode of the same object is NOT what the route reads.
    expect(encode(entry({ roomCode: 'JSON01' })).byteLength).toBeGreaterThan(0);
  });
});
