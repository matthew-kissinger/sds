/**
 * P-SEC-3: server input trust boundary + tick safety.
 *
 * The DO is authoritative but a client can send any MessagePack payload over
 * the playerInput channel. Before this phase three shapes were not handled:
 *
 *   - a `direction` that is missing / not an object / carries a non-finite x|z
 *     flowed straight into Vector2D and poisoned sheepdog.position with NaN,
 *     which desyncs every client a few seconds later;
 *   - a non-finite `inputSequence` (Infinity slipped through RoomDO's `?? 0`
 *     chain) passed the `<=` freshness check once and then latched
 *     sheepdog.inputSequence at Infinity, freezing the dog for the rest of the
 *     game (every subsequent finite input failed the check);
 *   - any throw inside tick() aborted the setInterval callback, so a single bad
 *     input stopped broadcastGameState for the WHOLE room.
 *
 * This spec locks down the replacements at two altitudes:
 *   1. RoomDO.handleClientMessage drops a hostile playerInput at ingress and
 *      the live sim keeps ticking + broadcasting.
 *   2. The GameSim guards (isValidInputDirection, coerceInputSequence,
 *      applyPlayerInput, and the tick() try/catch) are exercised directly so
 *      the contract holds even when applyPlayerInput is reached via the
 *      pendingInputs queue rather than the DO handler.
 *
 * Reuses the FakeStorage / fake-Env / FakeSocket DurableObject mocks from
 * tests/worker/room-do-messages.spec.ts (P-SEC-2).
 */
import { describe, it, expect } from 'vitest';
import { decode } from '@msgpack/msgpack';
import { RoomDO } from '../../worker/src/RoomDO.ts';
import {
  GameSimulation,
  isValidInputDirection,
  coerceInputSequence,
} from '../../worker/src/GameSim.js';

// ---- DurableObject mocks (mirror room-do-messages.spec.ts) -----------------

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

// Records listeners + captures every encoded frame the DO sends. readyState=1
// (OPEN) so send() proceeds.
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

// ---- room setup helpers ----------------------------------------------------

async function initRoom(room: any) {
  const body = {
    roomCode: 'TESTRM',
    hostId: 'host-sess',
    hostName: 'Alice',
    hostDogType: 'jep',
    hostPersistentId: 'pid-host',
    hostDisplayName: 'Alice',
    roomSettings: { isPublic: false, gameMode: 'cooperative', sceneId: 'field', sheepCount: 200 },
  };
  const res = await room.fetch(new Request('http://room/init', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }));
  expect(res.status).toBe(200);
}

// Bring a room to a live, ticking sim with the host's dog present. Returns the
// host's bound FakeSocket so the test can inspect broadcast traffic.
async function startLiveGame(room: any): Promise<FakeSocket> {
  await initRoom(room);
  const hostWs = new FakeSocket();
  room.bindSocket('host-sess', hostWs);
  // Host starts the game (isHostSession true → sim constructed + loop started).
  room.handleClientMessage('host-sess', { t: 'startGame' });
  expect(room.simulation).not.toBeNull();
  expect(room.getSerializableState().state).toBe('in-game');
  // startGame() spins two real 60Hz setIntervals (the GameSim tick loop and the
  // DO broadcast loop). The tests drive ticks manually, so stop both here to
  // keep the run deterministic and avoid leaking timers across the suite.
  room.simulation.stop();
  room.stopBroadcastLoop();
  hostWs.sent.length = 0; // drop gameStarted + initial frames
  return hostWs;
}

// Run N sim ticks deterministically. tick() early-returns unless isRunning, so
// flip it on for the manual drive (stop() above cleared the real interval).
function tickN(room: any, n: number) {
  room.simulation.isRunning = true;
  try {
    for (let i = 0; i < n; i++) room.simulation.tick();
  } finally {
    room.simulation.isRunning = false;
  }
}

// ---- 1. RoomDO ingress drops hostile playerInput; sim keeps ticking --------

describe('P-SEC-3: RoomDO drops malformed playerInput at ingress', () => {
  it('a playerInput with a MISSING direction is dropped and the sim keeps ticking', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    await startLiveGame(room);

    const dog = room.simulation.sheepdogs.get('host-sess');
    const posBefore = { x: dog.position.x, z: dog.position.z };
    const seqBefore = dog.inputSequence;

    // No direction field at all.
    room.handleClientMessage('host-sess', { t: 'playerInput', sequence: 1, sprint: false });

    // Nothing was queued, so the dog's input sequence never advanced.
    expect(dog.pendingInputs).toHaveLength(0);
    expect(dog.inputSequence).toBe(seqBefore);

    // The sim still advances + broadcasts after the bad input.
    expect(() => tickN(room, 3)).not.toThrow();
    expect(Number.isFinite(dog.position.x)).toBe(true);
    expect(Number.isFinite(dog.position.z)).toBe(true);
    // Position did not get poisoned to NaN by the dropped input.
    expect(dog.position.x).toBe(posBefore.x);
    expect(dog.position.z).toBe(posBefore.z);
    expect(room.simulation.getLatestGameState()).not.toBeNull();
  });

  it('a playerInput whose direction is NON-OBJECT (a number) is dropped', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    await startLiveGame(room);
    const dog = room.simulation.sheepdogs.get('host-sess');

    room.handleClientMessage('host-sess', { t: 'playerInput', direction: 42, sequence: 1 });

    expect(dog.pendingInputs).toHaveLength(0);
    expect(() => tickN(room, 2)).not.toThrow();
    expect(Number.isFinite(dog.position.x)).toBe(true);
    expect(Number.isFinite(dog.position.z)).toBe(true);
  });

  it('a playerInput whose direction carries a non-finite component (NaN) is dropped', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    await startLiveGame(room);
    const dog = room.simulation.sheepdogs.get('host-sess');

    room.handleClientMessage('host-sess', {
      t: 'playerInput', direction: { x: Number.NaN, z: 0 }, sequence: 1,
    });

    expect(dog.pendingInputs).toHaveLength(0);
    expect(() => tickN(room, 2)).not.toThrow();
    expect(Number.isFinite(dog.position.x)).toBe(true);
    expect(Number.isFinite(dog.position.z)).toBe(true);
  });

  it('a playerInput with a NON-FINITE sequence (Infinity) is rejected — the dog is not latched', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    await startLiveGame(room);
    const dog = room.simulation.sheepdogs.get('host-sess');

    // Hostile: a valid direction but sequence=Infinity. The old `?? 0` chain
    // let Infinity through, which would latch sheepdog.inputSequence.
    room.handleClientMessage('host-sess', {
      t: 'playerInput', direction: { x: 1, z: 0 }, sequence: Infinity,
    });

    // Rejected at ingress: nothing queued, sequence untouched (still finite 0).
    expect(dog.pendingInputs).toHaveLength(0);
    expect(dog.inputSequence).toBe(0);
    expect(Number.isFinite(dog.inputSequence)).toBe(true);

    // A subsequent well-formed input is still accepted (proves no latch).
    room.handleClientMessage('host-sess', {
      t: 'playerInput', direction: { x: 1, z: 0 }, sequence: 5,
    });
    expect(dog.pendingInputs).toHaveLength(1);
    tickN(room, 1);
    expect(dog.inputSequence).toBe(5);
    expect(Number.isFinite(dog.position.x)).toBe(true);
  });

  it('a well-formed playerInput is still queued and applied (the guard is not over-eager)', async () => {
    const room: any = new RoomDO(makeFakeState(), makeFakeEnv());
    const hostWs = await startLiveGame(room);
    const dog = room.simulation.sheepdogs.get('host-sess');

    room.handleClientMessage('host-sess', {
      t: 'playerInput', direction: { x: 1, z: 0 }, sequence: 3, sprint: true,
    });
    expect(dog.pendingInputs).toHaveLength(1);

    tickN(room, 2);
    expect(dog.inputSequence).toBe(3);
    // The room broadcast a game-state snapshot during those ticks.
    expect(room.simulation.getLatestGameState()).not.toBeNull();
    void hostWs;
  });
});

// ---- 2. GameSim guards, exercised directly ---------------------------------

describe('P-SEC-3: isValidInputDirection', () => {
  it('accepts an object of two finite numbers', () => {
    expect(isValidInputDirection({ x: 0, z: 0 })).toBe(true);
    expect(isValidInputDirection({ x: -1.5, z: 2.25 })).toBe(true);
  });
  it('rejects missing / non-object / non-finite shapes', () => {
    expect(isValidInputDirection(undefined)).toBe(false);
    expect(isValidInputDirection(null)).toBe(false);
    expect(isValidInputDirection(42 as any)).toBe(false);
    expect(isValidInputDirection('1,0' as any)).toBe(false);
    expect(isValidInputDirection({ x: 0 } as any)).toBe(false); // z missing
    expect(isValidInputDirection({ x: Number.NaN, z: 0 })).toBe(false);
    expect(isValidInputDirection({ x: 0, z: Infinity })).toBe(false);
    expect(isValidInputDirection({ x: '1' as any, z: 0 })).toBe(false);
  });
});

describe('P-SEC-3: coerceInputSequence', () => {
  it('coerces finite numerics to a non-negative integer', () => {
    expect(coerceInputSequence(0)).toBe(0);
    expect(coerceInputSequence(7)).toBe(7);
    expect(coerceInputSequence(7.9)).toBe(7); // floors
    expect(coerceInputSequence(-3)).toBe(0);  // clamps
    expect(coerceInputSequence('5')).toBe(5); // numeric string
  });
  it('returns null for non-finite / non-numeric values', () => {
    expect(coerceInputSequence(Infinity)).toBeNull();
    expect(coerceInputSequence(-Infinity)).toBeNull();
    expect(coerceInputSequence(Number.NaN)).toBeNull();
    expect(coerceInputSequence('abc')).toBeNull();
    expect(coerceInputSequence(undefined)).toBeNull();
    expect(coerceInputSequence({} as any)).toBeNull();
  });
});

// A minimal room adapter sufficient to construct a GameSimulation in node
// (mirrors tests/worker-objective-snapshot.spec.js).
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

describe('P-SEC-3: applyPlayerInput is a no-op on hostile input (defence in depth)', () => {
  it('a non-finite direction never reaches the physics (position stays finite)', () => {
    const sim: any = new GameSimulation(makeRoomAdapter());
    try {
      const dog = sim.sheepdogs.get('p1');
      const before = { x: dog.position.x, z: dog.position.z, seq: dog.inputSequence };

      sim.applyPlayerInput('p1', {
        direction: { x: Number.NaN, z: 0 }, sprint: false, inputSequence: 1, timestamp: Date.now(),
      });

      expect(Number.isFinite(dog.position.x)).toBe(true);
      expect(Number.isFinite(dog.position.z)).toBe(true);
      expect(dog.position.x).toBe(before.x);
      expect(dog.position.z).toBe(before.z);
      // The sequence was NOT advanced by the rejected input.
      expect(dog.inputSequence).toBe(before.seq);
    } finally {
      sim.cleanup?.();
    }
  });

  it('an Infinity inputSequence does not latch the dog: a later finite input still applies', () => {
    const sim: any = new GameSimulation(makeRoomAdapter());
    try {
      const dog = sim.sheepdogs.get('p1');

      sim.applyPlayerInput('p1', {
        direction: { x: 1, z: 0 }, sprint: false, inputSequence: Infinity, timestamp: Date.now(),
      });
      // Rejected: sequence not pinned at Infinity.
      expect(dog.inputSequence).toBe(0);

      sim.applyPlayerInput('p1', {
        direction: { x: 1, z: 0 }, sprint: false, inputSequence: 2, timestamp: Date.now(),
      });
      expect(dog.inputSequence).toBe(2);
    } finally {
      sim.cleanup?.();
    }
  });

  it('a valid input advances the sequence and keeps the position finite', () => {
    const sim: any = new GameSimulation(makeRoomAdapter());
    try {
      const dog = sim.sheepdogs.get('p1');
      sim.applyPlayerInput('p1', {
        direction: { x: 1, z: 0 }, sprint: false, inputSequence: 4, timestamp: Date.now(),
      });
      expect(dog.inputSequence).toBe(4);
      expect(Number.isFinite(dog.position.x)).toBe(true);
      expect(Number.isFinite(dog.position.z)).toBe(true);
    } finally {
      sim.cleanup?.();
    }
  });
});

describe('P-SEC-3: tick() try/catch keeps the room alive', () => {
  it('a throw inside a per-tick subsystem is swallowed and the loop continues', () => {
    const sim: any = new GameSimulation(makeRoomAdapter());
    try {
      sim.isRunning = true;
      // Force a throw deep inside the tick body exactly once, then restore so
      // the next tick succeeds — proves tick() doesn't propagate (which would
      // kill the setInterval callback and stop broadcasting for the room).
      const realUpdateSheep = sim.updateSheep.bind(sim);
      let thrown = false;
      sim.updateSheep = () => {
        if (!thrown) { thrown = true; throw new Error('boom from a bad input'); }
        return realUpdateSheep();
      };

      expect(() => sim.tick()).not.toThrow(); // first tick throws internally
      expect(thrown).toBe(true);

      // Second tick runs the real subsystem and broadcasts a fresh snapshot.
      sim.updateSheep = realUpdateSheep;
      expect(() => sim.tick()).not.toThrow();
      expect(sim.getLatestGameState()).not.toBeNull();
    } finally {
      sim.isRunning = false;
      sim.cleanup?.();
    }
  });
});
