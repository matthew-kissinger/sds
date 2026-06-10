// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Upkeep A4 (review dossier F6): unicast keyframe backpressure guard.
 *
 * The broadcast loop skips frames for sockets whose bufferedAmount exceeds
 * BACKPRESSURE_MAX_BUFFERED_BYTES, but the two UNICAST keyframe paths (the
 * keyframe-on-bind and the requestKeyframe reply) used to bypass that skip.
 * This spec locks the guard at both sites, with the socket-stub harness from
 * delta-broadcast.spec.ts extended with a controllable bufferedAmount:
 *   - a requestKeyframe from a saturated socket gets NO reply (no queue, no
 *     retry; the client re-requests or picks up the cadence keyframe);
 *   - a requestKeyframe from a healthy socket still gets its keyframe;
 *   - a socket exactly AT the ceiling still gets its keyframe (the broadcast
 *     loop's comparison is `buffered <= cap`, so the guard matches);
 *   - a saturated socket binding mid-game gets roomUpdated but NO keyframe;
 *   - a healthy socket binding mid-game still gets its keyframe.
 */
import { describe, it, expect } from 'vitest';
import { decode } from '@msgpack/msgpack';
import { RoomDO, BACKPRESSURE_MAX_BUFFERED_BYTES } from '../../worker/src/RoomDO.ts';
import { PROTOCOL_VERSION } from '../../shared/protocol.js';

// ---- DurableObject mocks (mirror delta-broadcast.spec.ts) -------------------

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
  bufferedAmount = 0;
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

async function initRoom(room: any) {
  const body = {
    roomCode: 'TESTRM',
    hostId: 'host-sess',
    hostName: 'Alice',
    hostDogType: 'jep',
    hostPersistentId: 'pid-host',
    hostDisplayName: 'Alice',
    hostProtocolVersion: PROTOCOL_VERSION,
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

// Live game with a v3 host socket bound, intervals stopped, and a broadcast
// basis established at tick 1 (so getBasisKeyframeState returns a snapshot).
async function startLiveGame(room: any) {
  await initRoom(room);
  await joinRoom(room, 'guest-v3', PROTOCOL_VERSION);
  const host = new FakeSocket();
  room.bindSocket('host-sess', host);
  room.handleClientMessage('host-sess', { t: 'startGame' });
  expect(room.simulation).not.toBeNull();
  // Stop the real intervals; tests drive broadcasts by hand.
  room.simulation.stop();
  room.stopBroadcastLoop();
  room.simulation.tickCount = 1;
  room.simulation.broadcastGameState();
  room.broadcastGameFrame();
  host.sent.length = 0;
  return host;
}

describe('upkeep A4: requestKeyframe honors the backpressure skip', () => {
  it('skips the unicast reply when the requesting socket is saturated', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    const host = await startLiveGame(room);

    host.bufferedAmount = BACKPRESSURE_MAX_BUFFERED_BYTES + 1;
    room.handleClientMessage('host-sess', { t: 'requestKeyframe' });

    expect(host.framesOfType('gameStateUpdate')).toHaveLength(0);
    expect(host.sent).toHaveLength(0); // no queue, no retry, no substitute frame
  });

  it('still replies with the basis keyframe on a healthy socket (happy path)', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    const host = await startLiveGame(room);

    host.bufferedAmount = 0;
    room.handleClientMessage('host-sess', { t: 'requestKeyframe' });

    const replies = host.framesOfType('gameStateUpdate');
    expect(replies).toHaveLength(1);
    expect(replies[0].tick).toBe(1); // basis-aligned (review F1) is preserved
    expect(replies[0].sheep).toHaveLength(200);
  });

  it('replies when bufferedAmount is exactly at the ceiling (matches the broadcast <= comparison)', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    const host = await startLiveGame(room);

    host.bufferedAmount = BACKPRESSURE_MAX_BUFFERED_BYTES;
    room.handleClientMessage('host-sess', { t: 'requestKeyframe' });

    expect(host.framesOfType('gameStateUpdate')).toHaveLength(1);
  });
});

describe('upkeep A4: keyframe-on-bind honors the backpressure skip', () => {
  it('skips the bind-time keyframe when the binding socket is saturated', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    await startLiveGame(room);

    const rebound = new FakeSocket();
    rebound.bufferedAmount = BACKPRESSURE_MAX_BUFFERED_BYTES + 1;
    room.bindSocket('guest-v3', rebound);

    expect(rebound.framesOfType('gameStateUpdate')).toHaveLength(0);
    // roomUpdated is not part of the guard (existing bind contract intact).
    expect(rebound.framesOfType('roomUpdated')).toHaveLength(1);
  });

  it('still unicasts the bind-time keyframe to a healthy socket (happy path)', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    await startLiveGame(room);

    const rebound = new FakeSocket();
    room.bindSocket('guest-v3', rebound);

    const keyframes = rebound.framesOfType('gameStateUpdate');
    expect(keyframes).toHaveLength(1);
    expect(keyframes[0].tick).toBe(1); // basis-aligned (review F1) is preserved
    expect(rebound.framesOfType('roomUpdated')).toHaveLength(1);
  });
});
