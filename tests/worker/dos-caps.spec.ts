// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * P-SEC-4: DoS / resource-exhaustion caps on the live game path.
 *
 * The DO is authoritative and single-threaded, so the inbound WS channel + the
 * per-tick sim are both amplification levers a hostile client can pull. This
 * spec locks down the caps added in P-SEC-4:
 *
 *   (a) inbound decode hardening in RoomDO.bindSocket's message handler:
 *        - a pre-decode byte-length cap drops an oversized frame before decode;
 *        - the bounded @msgpack/msgpack Decoder rejects a hostile length prefix
 *          (a tiny payload claiming a giant string) without allocating it;
 *        - an explicit depth bound drops an over-nested frame;
 *       and in every case the live sim keeps ticking + broadcasting.
 *   (b) GameSim caps sheepdog.pendingInputs at enqueue (newest-8) and processes
 *       at most one input per dog per tick.
 *   (c) a per-connection inbound message-rate limit drops excess frames in a
 *       window and closes the socket past the sustained-abuse threshold.
 *   (d) startGame caps a high-sheep-count room down when too few players are
 *       connected (the O(n^2) solo-room CPU lever).
 *
 * Reuses the FakeStorage / fake-Env / FakeSocket mocks + startLiveGame helper
 * shape from tests/worker/room-do-input-trust.spec.ts.
 */
import { describe, it, expect } from 'vitest';
import { encode, decode } from '@msgpack/msgpack';
import { RoomDO } from '../../worker/src/RoomDO.ts';
import { GameSimulation, MAX_PENDING_INPUTS } from '../../worker/src/GameSim.js';

// ---- DurableObject mocks ----------------------------------------------------

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
  // LOBBY_DO has no idFromName here, so RoomDO.releaseLobbyRoom is a safe no-op
  // (it guards on typeof idFromName === 'function').
  return { ROOM_DO: {}, LOBBY_DO: {}, DB: {}, JWT_SECRET: 'test-secret' } as any;
}

// Captures encoded frames + records listeners so we can drive message/close.
class FakeSocket {
  readyState = 1;
  sent: any[] = [];
  closed: { code?: number; reason?: string } | null = null;
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
  close(code?: number, reason?: string) { this.closed = { code, reason }; }
  framesOfType(t: string) { return this.sent.filter((m) => m && m.t === t); }
  // Fire the registered message listener(s) with a raw payload (ArrayBuffer).
  async fireMessage(payload: Uint8Array) {
    const ab = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
    for (const cb of this.listeners.get('message') ?? []) {
      await cb({ data: ab });
    }
  }
}

// ---- room setup helpers (mirror room-do-input-trust.spec.ts) ----------------

async function initRoom(room: any, sheepCount = 200) {
  const body = {
    roomCode: 'TESTRM',
    hostId: 'host-sess',
    hostName: 'Alice',
    hostDogType: 'jep',
    hostPersistentId: 'pid-host',
    hostDisplayName: 'Alice',
    roomSettings: { isPublic: false, gameMode: 'cooperative', sceneId: 'field', sheepCount },
  };
  const res = await room.fetch(new Request('http://room/init', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }));
  expect(res.status).toBe(200);
}

async function startLiveGame(room: any): Promise<FakeSocket> {
  await initRoom(room);
  const hostWs = new FakeSocket();
  room.bindSocket('host-sess', hostWs);
  room.handleClientMessage('host-sess', { t: 'startGame' });
  expect(room.simulation).not.toBeNull();
  // Stop the real intervals; tests drive ticks manually.
  room.simulation.stop();
  room.stopBroadcastLoop();
  hostWs.sent.length = 0;
  return hostWs;
}

function tickN(room: any, n: number) {
  room.simulation.isRunning = true;
  try {
    for (let i = 0; i < n; i++) room.simulation.tick();
  } finally {
    room.simulation.isRunning = false;
  }
}

// ---- (a) inbound decode hardening ------------------------------------------

describe('P-SEC-4 (a): RoomDO inbound decode caps', () => {
  it('drops an oversized frame (> byte cap) before decode; sim keeps ticking', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    const hostWs = await startLiveGame(room);
    const dog = room.simulation.sheepdogs.get('host-sess');
    const seqBefore = dog.inputSequence;

    // A validly-encoded but huge playerInput: pad with a big string field so the
    // encoded length blows past the 8KB pre-decode cap.
    const huge = encode({ t: 'playerInput', direction: { x: 1, z: 0 }, sequence: 9, pad: 'x'.repeat(20_000) });
    expect(huge.byteLength).toBeGreaterThan(8 * 1024);
    await hostWs.fireMessage(huge);

    // Dropped: nothing queued, sequence untouched.
    expect(dog.pendingInputs).toHaveLength(0);
    expect(dog.inputSequence).toBe(seqBefore);
    expect(() => tickN(room, 2)).not.toThrow();
    expect(room.simulation.getLatestGameState()).not.toBeNull();
  });

  it('rejects a hostile length-prefix (claimed-giant string) without allocating it', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    const hostWs = await startLiveGame(room);
    const dog = room.simulation.sheepdogs.get('host-sess');

    // msgpack str32: 0xdb + 4-byte big-endian length, then NO payload bytes. A
    // naive decoder would try to read ~4GB; the bounded Decoder rejects it. The
    // tiny frame (6 bytes) is under the byte cap, so this exercises the decoder
    // limit specifically, not the byte cap.
    const evil = new Uint8Array([0xdb, 0xff, 0xff, 0xff, 0xff]);
    expect(evil.byteLength).toBeLessThan(8 * 1024);
    await hostWs.fireMessage(evil);

    // The decode threw and was caught: nothing queued, no crash, sim alive.
    expect(dog.pendingInputs).toHaveLength(0);
    expect(() => tickN(room, 2)).not.toThrow();
    expect(room.simulation.getLatestGameState()).not.toBeNull();
  });

  it('drops an over-nested frame (depth bound) but accepts a normal flat input', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    const hostWs = await startLiveGame(room);
    const dog = room.simulation.sheepdogs.get('host-sess');

    // Build a deeply nested object well past MAX_DECODE_DEPTH (8).
    let nested: any = { t: 'playerInput', direction: { x: 1, z: 0 }, sequence: 3 };
    let cursor = nested;
    for (let i = 0; i < 20; i++) { cursor.child = {}; cursor = cursor.child; }
    const deep = encode(nested);
    expect(deep.byteLength).toBeLessThan(8 * 1024);
    await hostWs.fireMessage(deep);
    expect(dog.pendingInputs).toHaveLength(0); // dropped on depth

    // A normal flat playerInput (depth 2) still goes through.
    await hostWs.fireMessage(encode({ t: 'playerInput', direction: { x: 1, z: 0 }, sequence: 4 }));
    expect(dog.pendingInputs).toHaveLength(1);
    tickN(room, 1);
    expect(dog.inputSequence).toBe(4);
  });

  it('a normal-sized well-formed frame still routes through the message handler', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    const hostWs = await startLiveGame(room);
    const dog = room.simulation.sheepdogs.get('host-sess');

    await hostWs.fireMessage(encode({ t: 'playerInput', direction: { x: 1, z: 0 }, sequence: 7, sprint: true }));
    expect(dog.pendingInputs).toHaveLength(1);
    tickN(room, 1);
    expect(dog.inputSequence).toBe(7);
  });
});

// ---- (c) per-connection inbound rate limit ---------------------------------

describe('P-SEC-4 (c): per-connection inbound rate limit', () => {
  it('drops frames past the per-window ceiling and closes the socket on sustained abuse', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    const hostWs = await startLiveGame(room);
    const dog = room.simulation.sheepdogs.get('host-sess');

    // Hammer far past 4x the 600/window ceiling with valid frames in a single
    // window (Date.now stays effectively constant across this synchronous loop).
    // Each carries a strictly increasing sequence; with the rate limit off, the
    // queue would track them. With it on, only the first MAX_MSGS_PER_WINDOW are
    // accepted and the socket is closed once it crosses 4x.
    let seq = 1;
    for (let i = 0; i < 3000; i++) {
      await hostWs.fireMessage(encode({ t: 'playerInput', direction: { x: 1, z: 0 }, sequence: seq++ }));
    }

    // The socket was closed for rate abuse (code 1008) and dropped from sessions.
    expect(hostWs.closed?.code).toBe(1008);
    expect(room.sessions.has('host-sess')).toBe(false);
    // pendingInputs is bounded by MAX_PENDING_INPUTS regardless (cap (b)).
    expect(dog.pendingInputs.length).toBeLessThanOrEqual(MAX_PENDING_INPUTS);
  });

  it('allows a normal burst (well under the ceiling) without dropping or closing', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    const hostWs = await startLiveGame(room);

    // 150 frames in a window ~= a 144Hz client's one-second peak. Must all be
    // accepted (none dropped by rate), socket stays open.
    let seq = 1;
    for (let i = 0; i < 150; i++) {
      await hostWs.fireMessage(encode({ t: 'playerInput', direction: { x: 1, z: 0 }, sequence: seq++ }));
      // Drain so the queue cap doesn't mask acceptance.
      tickN(room, 1);
    }
    expect(hostWs.closed).toBeNull();
    expect(room.sessions.has('host-sess')).toBe(true);
    // The last input we sent was accepted and applied.
    const dog = room.simulation.sheepdogs.get('host-sess');
    expect(dog.inputSequence).toBe(150);
  });
});

// ---- (d) min-connected-players gate for high sheep counts ------------------

describe('P-SEC-4 (d): high-sheep-count solo gate', () => {
  it('caps a 5000-sheep room down when only one player is connected', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    await initRoom(room, 5000);
    expect(room.meta.sheepCount).toBe(5000);
    // One connected socket (solo).
    room.bindSocket('host-sess', new FakeSocket());
    room.handleClientMessage('host-sess', { t: 'startGame' });
    try {
      // The effective count was capped to the high-count cap (1000).
      expect(room.meta.sheepCount).toBe(1000);
      expect(room.getSerializableState().sheepCount).toBe(1000);
      // The sim was built at the capped size.
      expect(room.simulation.gameState.totalSheep).toBe(1000);
    } finally {
      room.simulation?.stop();
      room.stopBroadcastLoop();
    }
  });

  it('caps a 3000-sheep room down when solo (threshold is inclusive)', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    await initRoom(room, 3000);
    room.bindSocket('host-sess', new FakeSocket());
    room.handleClientMessage('host-sess', { t: 'startGame' });
    try {
      expect(room.meta.sheepCount).toBe(1000);
    } finally {
      room.simulation?.stop();
      room.stopBroadcastLoop();
    }
  });

  it('does NOT cap a 5000-sheep room when two players are connected', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    await initRoom(room, 5000);
    // Two players join + connect sockets.
    await room.fetch(new Request('http://room/join', {
      method: 'POST',
      body: JSON.stringify({ playerId: 'guest-sess', playerName: 'Bob', dogType: 'jep', persistentId: 'pid-guest', displayName: 'Bob' }),
      headers: { 'content-type': 'application/json' },
    }));
    room.bindSocket('host-sess', new FakeSocket());
    room.bindSocket('guest-sess', new FakeSocket());
    room.handleClientMessage('host-sess', { t: 'startGame' });
    try {
      // Two connected players clears the gate — full 5000 honored.
      expect(room.meta.sheepCount).toBe(5000);
      expect(room.simulation.gameState.totalSheep).toBe(5000);
    } finally {
      room.simulation?.stop();
      room.stopBroadcastLoop();
    }
  });

  it('leaves a common-case 1000-sheep solo room untouched', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    await initRoom(room, 1000);
    room.bindSocket('host-sess', new FakeSocket());
    room.handleClientMessage('host-sess', { t: 'startGame' });
    try {
      expect(room.meta.sheepCount).toBe(1000);
    } finally {
      room.simulation?.stop();
      room.stopBroadcastLoop();
    }
  });
});

// ---- P2-DELTA: requestKeyframe unicast reply + per-client cap ----------------
// Keyframe-on-demand is a ~20.8 kB egress amplification per request at 200
// sheep, so it gets its own 2/s per-client cap UNDER the P-SEC-4 inbound rate
// limit (these requests ride the same bounded-decode message path as
// everything above).

describe('P2-DELTA: requestKeyframe cap', () => {
  it('replies to requestKeyframe with a unicast tick-stamped full keyframe', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    const hostWs = await startLiveGame(room);
    tickN(room, 3); // a snapshot now exists (tick 3)

    await hostWs.fireMessage(encode({ t: 'requestKeyframe' }));

    const frames = hostWs.framesOfType('gameStateUpdate');
    expect(frames).toHaveLength(1);
    expect(frames[0].tick).toBe(3);
    expect(Array.isArray(frames[0].sheep)).toBe(true);
    expect(frames[0].sheep).toHaveLength(200);
  });

  it('drops requests past 2 per second per client', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    const hostWs = await startLiveGame(room);
    tickN(room, 1);

    // 6 rapid requests inside one fixed window: exactly 2 replies.
    for (let i = 0; i < 6; i++) {
      await hostWs.fireMessage(encode({ t: 'requestKeyframe' }));
    }
    expect(hostWs.framesOfType('gameStateUpdate')).toHaveLength(2);
  });

  it('grants a fresh budget once the window rolls', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    const hostWs = await startLiveGame(room);
    tickN(room, 1);

    for (let i = 0; i < 4; i++) {
      await hostWs.fireMessage(encode({ t: 'requestKeyframe' }));
    }
    expect(hostWs.framesOfType('gameStateUpdate')).toHaveLength(2);

    // Age the window past 1s (the same trick checkRateLimit tests would need:
    // Date.now() is effectively constant across this synchronous test body).
    const win = room.keyframeRequestWindows.get('host-sess');
    win.windowStart -= 1001;

    await hostWs.fireMessage(encode({ t: 'requestKeyframe' }));
    expect(hostWs.framesOfType('gameStateUpdate')).toHaveLength(3);
  });

  it('ignores requestKeyframe outside a live game (no sim, no reply)', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    await initRoom(room);
    const ws = new FakeSocket();
    room.bindSocket('host-sess', ws);
    ws.sent.length = 0;

    await ws.fireMessage(encode({ t: 'requestKeyframe' }));
    expect(ws.framesOfType('gameStateUpdate')).toHaveLength(0);
  });
});

// ---- (b) GameSim pendingInputs cap + one-per-tick ---------------------------

function makeRoomAdapter() {
  return {
    roomCode: 'TESTRM',
    isPublic: false,
    modeLocked: false,
    gameMode: 'cooperative',
    sceneId: 'field',
    sheepCount: 50,
    seed: 12345,
    state: 'in-game',
    lastActivity: Date.now(),
    simulation: null,
    players: new Map([['p1', { id: 'p1', name: 'A', dogType: 'jep', isHost: true, isReady: true, joinedAt: Date.now() }]]),
    getPlayer: (id: string) => ({ id, name: 'A', dogType: 'jep', isHost: true, isReady: true, joinedAt: Date.now() }),
    broadcastToRoom: () => {},
    finishGame: () => {},
    getSerializableState: () => ({}),
    resolvePlayerName: () => 'A',
    onSubmitScores: async () => {},
  };
}

describe('P-SEC-4 (b): GameSim pendingInputs cap', () => {
  it('caps the per-dog pending queue at MAX_PENDING_INPUTS, keeping the newest', () => {
    const sim: any = new GameSimulation(makeRoomAdapter());
    try {
      const dog = sim.sheepdogs.get('p1');
      // Flood far past the cap with strictly increasing sequences.
      for (let s = 1; s <= 100; s++) {
        sim.handlePlayerInput('p1', { direction: { x: 1, z: 0 }, sprint: false, inputSequence: s });
      }
      expect(dog.pendingInputs.length).toBe(MAX_PENDING_INPUTS);
      // Newest-wins: the queue holds the last MAX_PENDING_INPUTS sequences.
      const seqs = dog.pendingInputs.map((i: any) => i.inputSequence);
      expect(seqs[seqs.length - 1]).toBe(100);
      expect(seqs[0]).toBe(100 - MAX_PENDING_INPUTS + 1);
    } finally {
      sim.cleanup?.();
    }
  });

  it('processes at most one input per dog per tick', () => {
    const sim: any = new GameSimulation(makeRoomAdapter());
    try {
      const dog = sim.sheepdogs.get('p1');
      // Queue the full cap of fresh inputs.
      for (let s = 1; s <= MAX_PENDING_INPUTS; s++) {
        sim.handlePlayerInput('p1', { direction: { x: 1, z: 0 }, sprint: false, inputSequence: s });
      }
      expect(dog.pendingInputs.length).toBe(MAX_PENDING_INPUTS);

      // One tick drains exactly one input (queue shrinks by 1, sequence is the
      // first/oldest queued one).
      sim.isRunning = true;
      sim.processPlayerInputs();
      sim.isRunning = false;
      expect(dog.pendingInputs.length).toBe(MAX_PENDING_INPUTS - 1);
      expect(dog.inputSequence).toBe(1);

      // A second tick drains one more.
      sim.isRunning = true;
      sim.processPlayerInputs();
      sim.isRunning = false;
      expect(dog.pendingInputs.length).toBe(MAX_PENDING_INPUTS - 2);
      expect(dog.inputSequence).toBe(2);
    } finally {
      sim.cleanup?.();
    }
  });
});
