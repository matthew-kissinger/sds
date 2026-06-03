// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * P-SEC-2: WebSocket identity binding + host authority.
 *
 * Before this phase the /ws upgrade authorized on a bare ?playerId= session id
 * with no proof of identity, host-only actions gated on a sessionId==hostId
 * string compare, and host migration promoted whoever happened to sit at
 * Map-insertion-order[0]. This spec locks down the replacements:
 *
 *   - handleWebSocket rejects an unknown session id (403) and a session id whose
 *     stored persistentId does not match the verified X-Auth-Persistent-Id the
 *     Worker forwards (403). The success path can't run here: WebSocketPair is a
 *     Workers-runtime global that doesn't exist in the node test runtime, and
 *     both rejections return before it is touched.
 *   - a non-host identity's startGame / setModeLock is a no-op (state + modeLock
 *     unchanged, no broadcast), while the host's setModeLock takes effect.
 *   - handlePlayerLeave migrates the host by the new identity-first policy: a
 *     reconnecting original host (same persistentId, new sessionId) reclaims;
 *     otherwise the oldest remaining player by joinedAt is promoted and the
 *     pinned host identity is re-pointed at them.
 *
 * Reuses the FakeStorage / fake-Env DurableObject mocks from
 * tests/worker-allowed-modes.spec.js (the constructor only needs
 * blockConcurrencyWhile + a storage.get/put round-trip).
 */
import { describe, it, expect } from 'vitest';
import { decode } from '@msgpack/msgpack';
import { RoomDO } from '../../worker/src/RoomDO.ts';

// ---- DurableObject mocks (mirror worker-allowed-modes.spec.js) -------------

class FakeStorage {
  map = new Map<string, unknown>();
  async get(key: string) { return this.map.get(key); }
  async put(key: string, val: unknown) { this.map.set(key, val); }
  async delete(key: string) { this.map.delete(key); }
}

function makeFakeState() {
  const storage = new FakeStorage();
  return {
    storage,
    blockConcurrencyWhile: async (fn: () => unknown) => { await fn(); },
  } as any;
}

function makeFakeEnv() {
  return { ROOM_DO: {}, LOBBY_DO: {}, DB: {}, JWT_SECRET: 'test-secret' } as any;
}

// A fake WebSocket good enough for bindSocket: it records listeners (so we can
// fire close ourselves) and captures every encoded frame the DO sends so we can
// assert which broadcasts fired. readyState=1 (OPEN) so send() proceeds.
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
  // Decoded frames whose tag matches `t`.
  framesOfType(t: string) { return this.sent.filter((m) => m && m.t === t); }
}

// ---- room setup helpers ----------------------------------------------------

interface HostOpts { roomCode?: string; sessionId?: string; persistentId?: string; isPublic?: boolean; }

async function initRoom(room: any, opts: HostOpts = {}) {
  const body = {
    roomCode: opts.roomCode ?? 'TESTRM',
    hostId: opts.sessionId ?? 'host-sess',
    hostName: 'Alice',
    hostDogType: 'jep',
    hostPersistentId: opts.persistentId ?? 'pid-host',
    hostDisplayName: 'Alice',
    roomSettings: { isPublic: opts.isPublic ?? false, gameMode: 'cooperative', sceneId: 'field' },
  };
  const res = await room.fetch(new Request('http://room/init', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }));
  expect(res.status).toBe(200);
}

async function joinRoom(room: any, sessionId: string, persistentId: string, name = 'Guest') {
  const res = await room.fetch(new Request('http://room/join', {
    method: 'POST',
    body: JSON.stringify({ playerId: sessionId, playerName: name, dogType: 'jep', persistentId, displayName: name }),
    headers: { 'content-type': 'application/json' },
  }));
  expect(res.status).toBe(200);
}

function wsRequest(playerId: string | null, authPid: string | null) {
  const url = `http://room/ws?${playerId !== null ? `playerId=${encodeURIComponent(playerId)}` : ''}`;
  const headers: Record<string, string> = { Upgrade: 'websocket' };
  if (authPid !== null) headers['X-Auth-Persistent-Id'] = authPid;
  return new Request(url, { headers });
}

// ---- handleWebSocket identity binding --------------------------------------

describe('P-SEC-2: handleWebSocket identity binding', () => {
  it('rejects an upgrade for an unknown session id (403)', async () => {
    const room = new RoomDO(makeFakeState(), makeFakeEnv());
    await initRoom(room);
    const res = await room.fetch(wsRequest('does-not-exist', 'pid-host'));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('unknown playerId');
  });

  it('rejects an upgrade whose verified persistentId does not match the stored session identity (403)', async () => {
    const room = new RoomDO(makeFakeState(), makeFakeEnv());
    await initRoom(room, { sessionId: 'host-sess', persistentId: 'pid-host' });
    await joinRoom(room, 'guest-sess', 'pid-guest');

    // The session belongs to pid-guest, but the forwarded token says pid-attacker.
    const res = await room.fetch(wsRequest('guest-sess', 'pid-attacker'));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('identity mismatch');
  });

  it('rejects an upgrade that carries no verified persistentId header against a bound session (403)', async () => {
    const room = new RoomDO(makeFakeState(), makeFakeEnv());
    await initRoom(room, { sessionId: 'host-sess', persistentId: 'pid-host' });
    // No X-Auth-Persistent-Id at all -> still a mismatch against pid-host.
    const res = await room.fetch(wsRequest('host-sess', null));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('identity mismatch');
  });

  it('passes the identity gate when the verified persistentId matches (reaches the runtime-only WS pairing)', async () => {
    const room = new RoomDO(makeFakeState(), makeFakeEnv());
    await initRoom(room, { sessionId: 'host-sess', persistentId: 'pid-host' });
    // A matching identity clears every guard. The next step constructs a
    // WebSocketPair, which only exists on the Workers runtime - in node it
    // throws. Reaching that throw (rather than a 403 Response) is the proof the
    // identity assertion accepted the request.
    let reachedPairing = false;
    try {
      const res = await room.fetch(wsRequest('host-sess', 'pid-host'));
      // If we somehow got a Response, it must not be one of our auth rejections.
      expect(res.status).not.toBe(403);
    } catch (e: any) {
      reachedPairing = /WebSocketPair/.test(String(e?.message ?? e)) || e instanceof ReferenceError;
      expect(reachedPairing).toBe(true);
    }
  });
});

// ---- host-only action authority --------------------------------------------

describe('P-SEC-2: host-only actions gate on the authenticated identity', () => {
  it('ignores startGame from a non-host session (state stays waiting, no sim)', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    await initRoom(room, { sessionId: 'host-sess', persistentId: 'pid-host' });
    await joinRoom(room, 'guest-sess', 'pid-guest');

    room.handleClientMessage('guest-sess', { t: 'startGame' });

    expect(room.getSerializableState().state).toBe('waiting');
    expect(room.simulation).toBeNull();
  });

  it('ignores setModeLock from a non-host session (modeLock unchanged, no broadcast)', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    await initRoom(room, { sessionId: 'host-sess', persistentId: 'pid-host' });
    await joinRoom(room, 'guest-sess', 'pid-guest');

    // Bind a socket for the guest so we could observe a broadcast if one fired.
    const guestWs = new FakeSocket();
    room.bindSocket('guest-sess', guestWs);
    guestWs.sent.length = 0; // drop the initial roomUpdated send from bindSocket

    room.handleClientMessage('guest-sess', { t: 'setModeLock', locked: true });

    expect(room.getSerializableState().modeLocked).toBe(false);
    expect(guestWs.framesOfType('modeLockChanged')).toHaveLength(0);
  });

  it('honours setModeLock from the host session (modeLock set + broadcast fired)', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    await initRoom(room, { sessionId: 'host-sess', persistentId: 'pid-host' });

    const hostWs = new FakeSocket();
    room.bindSocket('host-sess', hostWs);
    hostWs.sent.length = 0;

    room.handleClientMessage('host-sess', { t: 'setModeLock', locked: true });

    expect(room.getSerializableState().modeLocked).toBe(true);
    const frames = hostWs.framesOfType('modeLockChanged');
    expect(frames).toHaveLength(1);
    expect(frames[0].modeLocked).toBe(true);
  });

  it('the host gate follows the persistent identity, not the session id', async () => {
    // isHostSession is the single predicate both host-only cases route through;
    // assert it directly so the contract is pinned even if a caller is added.
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    await initRoom(room, { sessionId: 'host-sess', persistentId: 'pid-host' });
    await joinRoom(room, 'guest-sess', 'pid-guest');

    expect(room.isHostSession('host-sess')).toBe(true);
    expect(room.isHostSession('guest-sess')).toBe(false);
  });
});

// ---- host migration by the new policy --------------------------------------

describe('P-SEC-2: handlePlayerLeave migrates host by identity-first policy', () => {
  it('promotes the oldest remaining player and re-pins the host identity', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    await initRoom(room, { sessionId: 'host-sess', persistentId: 'pid-host' });
    // Two guests, distinct identities; guest-early joins before guest-late.
    await joinRoom(room, 'guest-early', 'pid-early');
    await joinRoom(room, 'guest-late', 'pid-late');

    // Host departs. No remaining session shares pid-host, so the oldest joiner
    // (guest-early) is promoted and the pinned identity moves to pid-early.
    room.handlePlayerLeave('host-sess');

    expect(room.getSerializableState().hostId).toBe('guest-early');
    expect(room.meta.hostPersistentId).toBe('pid-early');
    // Exactly one player carries isHost in the serialized view.
    const hosts = room.getSerializableState().players.filter((p: any) => p.isHost);
    expect(hosts).toHaveLength(1);
    expect(hosts[0].id).toBe('guest-early');
  });

  it('lets a reconnecting original host reclaim: same persistentId on a new sessionId', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    await initRoom(room, { sessionId: 'host-old', persistentId: 'pid-host' });
    await joinRoom(room, 'guest-sess', 'pid-guest');
    // Original host reconnects under a fresh session id (same persistent id).
    await joinRoom(room, 'host-new', 'pid-host', 'Alice');

    // The stale original-host session leaves (grace eviction). Because a session
    // sharing pid-host is still present, it reclaims rather than handing the
    // room to the guest.
    room.handlePlayerLeave('host-old');

    expect(room.getSerializableState().hostId).toBe('host-new');
    expect(room.meta.hostPersistentId).toBe('pid-host'); // identity unchanged
    expect(room.isHostSession('host-new')).toBe(true);
    expect(room.isHostSession('guest-sess')).toBe(false);
  });

  it('tears the room down (no host churn) when the last player leaves', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    await initRoom(room, { sessionId: 'host-sess', persistentId: 'pid-host' });
    room.handlePlayerLeave('host-sess');
    expect(room.meta).toBeNull();
    expect(room.getSerializableState()).toBeNull();
  });
});
