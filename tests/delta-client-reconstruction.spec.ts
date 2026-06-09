// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * P2-DELTA-CLIENT: NetworkManager delta reconstruction
 * (docs/hardening/delta-protocol-design.md sections 7 + 9, client unit plan).
 *
 * Drives the REAL server builder (a live GameSimulation, the
 * delta-protocol.spec.ts pattern) and feeds its frames through the REAL
 * client decode path (msgpack encode -> NetworkManager._onWsMessage), so the
 * proof covers the actual wire bytes, not hand-mirrored shapes. Locks:
 *   - round-trip: the reconstructed snapshot deep-equals the server's full
 *     snapshot at EVERY tick across a herding-input run (keyframes + deltas),
 *     including conditional-key gain-then-lose (a changed record replaces the
 *     sheep record wholesale - key presence included);
 *   - any full gameStateUpdate is a keyframe: replace wholesale, reset
 *     lastAppliedTick (drift resets to zero);
 *   - no aliasing: previousServerState and lastServerState never share the
 *     same sheep array after a delta apply (fresh array per apply; unchanged
 *     records share references, changed records are fresh objects);
 *   - gap handling: a baseTick mismatch discards the delta, sends
 *     requestKeyframe at most once per 500 ms (fake timers), and ignores
 *     deltas (even matching ones) until a keyframe lands;
 *   - legacy DO: full v2 frames (no tick, no deltas) play through unchanged.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { encode as msgpackEncode, decode as msgpackDecode } from '@msgpack/msgpack';
import { GameSimulation } from '../worker/src/GameSim.js';
import { NetworkManager } from '../js/NetworkManager.js';

function makeRoomAdapter(
  sceneId: string,
  gameMode: string = 'cooperative',
  sheepCount = 30,
  playerIds: string[] = ['p1'],
) {
  const players = new Map(
    playerIds.map((id) => [
      id,
      { id, name: id.toUpperCase(), dogType: 'jep', isHost: id === playerIds[0], isReady: true, joinedAt: Date.now() },
    ]),
  );
  return {
    roomCode: 'TESTRM',
    isPublic: false,
    modeLocked: false,
    gameMode,
    sceneId,
    sheepCount,
    seed: 12345, // deterministic spawn so the suite is stable
    state: 'in-game',
    lastActivity: Date.now(),
    simulation: null,
    players,
    getPlayer: (id: string) => players.get(id),
    broadcastToRoom: () => {},
    finishGame: () => {},
    getSerializableState: () => ({}),
    resolvePlayerName: (id: string) => id.toUpperCase(),
    onSubmitScores: async () => {},
  };
}

// Drive N real sim ticks without the setInterval (the dos-caps pattern).
function tickN(sim: any, n: number) {
  sim.isRunning = true;
  try {
    for (let i = 0; i < n; i++) sim.tick();
  } finally {
    sim.isRunning = false;
  }
}

// One broadcast step driven by hand: advance the wire tick WITHOUT running
// the physics tick body, rebuild the snapshot, and return the delta-path
// frame (the delta-protocol.spec.ts pattern).
function manualBroadcast(sim: any, tickValue: number) {
  sim.tickCount = tickValue;
  sim.broadcastGameState();
  return sim.getDeltaPathFrame();
}

// A real NetworkManager with a stub socket that captures outbound messages
// (decoded), plus a notification log. Nothing inside the manager is mocked.
function makeClient() {
  const nm: any = new NetworkManager();
  const sent: any[] = [];
  nm.ws = {
    readyState: 1,
    send: (buf: Uint8Array) => { sent.push(msgpackDecode(buf)); },
  };
  nm.connected = true;
  const notified: any[] = [];
  nm.onGameStateUpdate = (s: any) => notified.push(s);
  return { nm, sent, notified };
}

// Deliver a frame the way the DO does: msgpack-encode { t, ...payload } and
// hand the ArrayBuffer to the real WS message handler.
function deliver(nm: any, t: string, payload: any) {
  const u8 = msgpackEncode({ t, ...payload });
  const data = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  nm._onWsMessage({ data });
}

function deliverPath(nm: any, path: any) {
  if (path.kind === 'keyframe') deliver(nm, 'gameStateUpdate', path.state);
  else deliver(nm, 'gameStateDelta', path.frame);
}

const keyframeRequests = (sent: any[]) => sent.filter((m) => m.t === 'requestKeyframe').length;

// The server snapshot as the client actually receives it: through the
// production msgpack encoder. The only value-level effect is that -0 (a
// stopped sheep's wire velocity) encodes as integer 0, identically on the
// keyframe and delta paths, so wire-delivered equality is the exact
// "downstream consumers receive the identical shape they receive today"
// claim. (The server's Object.is record compare still ships a 0 <-> -0
// flip, so the delta path never misses the update either.)
const overWire = (state: any) => msgpackDecode(msgpackEncode(state));

// Minimal hand-built frames for the timing tests (no sim needed).
function tinyKeyframe(tick: number) {
  return {
    v: 3, tick, timestamp: Date.now(), sheepRetired: 0, totalSheep: 1,
    gameCompleted: false, isCompetitive: false, isTimedMode: false,
    sheep: [{ id: 0, x: 1, z: 1, vx: 0, vz: 0, state: 0, facing: 0, hasPassedGate: false, isRetiring: false }],
    sheepdogs: [],
  };
}

function tinyDelta(tick: number, baseTick: number) {
  return {
    v: 3, tick, baseTick, timestamp: Date.now(), sheepRetired: 0, totalSheep: 1,
    gameCompleted: false, isCompetitive: false, isTimedMode: false,
    changed: [], sheepdogs: [],
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('P2-DELTA-CLIENT: round-trip against the real server builder', () => {
  it('reconstructs a snapshot deep-equal to the server snapshot at every tick across 200 herding ticks', () => {
    const sim: any = new GameSimulation(makeRoomAdapter('field', 'cooperative', 30, ['p1', 'p2']) as any);
    const { nm, sent } = makeClient();
    try {
      let keyframes = 0;
      let deltas = 0;
      for (let t = 1; t <= 200; t++) {
        // Herding pressure so the changed-set is non-trivial (the server
        // round-trip spec's input script).
        sim.handlePlayerInput('p1', { direction: { x: 1, z: 0.3 }, sprint: t % 50 < 20, inputSequence: t });
        sim.handlePlayerInput('p2', { direction: { x: -0.5, z: 1 }, sprint: false, inputSequence: t });
        tickN(sim, 1);
        const state = sim.getLatestGameState();
        const path = sim.getDeltaPathFrame();
        expect(path).not.toBeNull();
        if (path.kind === 'keyframe') keyframes++;
        else deltas++;
        deliverPath(nm, path);
        // The downstream-facing snapshot equals the server's as wire-
        // delivered through the production msgpack encoder.
        expect(nm.lastServerState).toEqual(overWire(state));
        expect(Object.keys(nm.lastServerState).sort()).toEqual(Object.keys(state).sort());
        expect(nm.lastAppliedTick).toBe(state.tick);
      }
      // Both frame kinds must have occurred for the proof to mean anything.
      expect(keyframes).toBeGreaterThanOrEqual(4);
      expect(deltas).toBeGreaterThanOrEqual(10);
      // A clean stream never triggers a keyframe request.
      expect(keyframeRequests(sent)).toBe(0);
    } finally {
      sim.cleanup?.();
    }
  });

  it('replaces a changed sheep record wholesale: conditional keys gained then lost disappear from the reconstruction', () => {
    const sim: any = new GameSimulation(makeRoomAdapter('field', 'cooperative', 30) as any);
    const { nm } = makeClient();
    try {
      deliverPath(nm, manualBroadcast(sim, 1)); // keyframe (no basis)
      const sheep = sim.gameState.sheep[3];

      // GAIN: retirement target + assignedGate appear on the wire record.
      sheep.assignedGate = 2;
      sheep.retirementTarget = { x: 5.55555, z: -7.77777 };
      let path = manualBroadcast(sim, 2);
      expect(path.kind).toBe('delta');
      deliverPath(nm, path);
      expect(nm.lastServerState).toEqual(overWire(sim.getLatestGameState()));
      expect(nm.lastServerState.sheep[3]).toMatchObject({ assignedGate: 2, targetX: 5.56, targetZ: -7.78 });

      // LOSE: the keys disappear. The client must drop them too - a changed
      // entry REPLACES the record (key presence included), it is not merged.
      sheep.assignedGate = null;
      sheep.retirementTarget = null;
      path = manualBroadcast(sim, 3);
      expect(path.kind).toBe('delta');
      deliverPath(nm, path);
      expect(nm.lastServerState).toEqual(overWire(sim.getLatestGameState()));
      expect(nm.lastServerState.sheep[3]).not.toHaveProperty('assignedGate');
      expect(nm.lastServerState.sheep[3]).not.toHaveProperty('targetX');
      expect(nm.lastServerState.sheep[3]).not.toHaveProperty('targetZ');

      // KILL then quiet: the killed flag round-trips, and the index `i` key
      // never leaks into the reconstructed record.
      sheep.killed = true;
      path = manualBroadcast(sim, 4);
      deliverPath(nm, path);
      expect(nm.lastServerState).toEqual(overWire(sim.getLatestGameState()));
      expect(nm.lastServerState.sheep[3]).toMatchObject({ killed: true });
      expect(nm.lastServerState.sheep[3]).not.toHaveProperty('i');
    } finally {
      sim.cleanup?.();
    }
  });
});

describe('P2-DELTA-CLIENT: no aliasing across delta applies', () => {
  it('previousServerState and lastServerState never share a sheep array; unchanged records share references', () => {
    const sim: any = new GameSimulation(makeRoomAdapter('field', 'cooperative', 30) as any);
    const { nm } = makeClient();
    try {
      deliverPath(nm, manualBroadcast(sim, 1)); // keyframe

      // Empty delta (nothing moved): fresh top-level object, FRESH sheep
      // array, same record references.
      let path = manualBroadcast(sim, 2);
      expect(path.kind).toBe('delta');
      expect(path.frame.changed).toEqual([]);
      deliverPath(nm, path);
      expect(nm.lastServerState).not.toBe(nm.previousServerState);
      expect(nm.lastServerState.sheep).not.toBe(nm.previousServerState.sheep);
      for (let i = 0; i < nm.lastServerState.sheep.length; i++) {
        expect(nm.lastServerState.sheep[i]).toBe(nm.previousServerState.sheep[i]);
      }

      // Changed delta: the changed index gets a fresh record object; the
      // previous snapshot's record is untouched (interpolation lerps prev
      // against curr by index - in-place mutation would flatten it).
      const beforeRecord = nm.lastServerState.sheep[5];
      const beforeX = beforeRecord.x;
      sim.gameState.sheep[5].position.x += 1;
      path = manualBroadcast(sim, 3);
      expect(path.kind).toBe('delta');
      deliverPath(nm, path);
      expect(nm.lastServerState.sheep).not.toBe(nm.previousServerState.sheep);
      expect(nm.lastServerState.sheep[5]).not.toBe(beforeRecord);
      expect(nm.previousServerState.sheep[5]).toBe(beforeRecord);
      expect(nm.previousServerState.sheep[5].x).toBe(beforeX);
      expect(nm.lastServerState.sheep[5].x).toBeCloseTo(beforeX + 1, 5);
    } finally {
      sim.cleanup?.();
    }
  });
});

describe('P2-DELTA-CLIENT: gap handling + keyframe drift reset', () => {
  it('discards a mismatched delta, requests a keyframe, ignores deltas until a keyframe lands, then converges with zero residual diff', () => {
    const sim: any = new GameSimulation(makeRoomAdapter('field', 'cooperative', 30) as any);
    const { nm, sent, notified } = makeClient();
    try {
      deliverPath(nm, manualBroadcast(sim, 1)); // keyframe, lastAppliedTick = 1
      expect(nm.lastAppliedTick).toBe(1);
      const notifiedBefore = notified.length;

      // Drop the tick-2 delta on the floor (a client-local frame drop).
      sim.gameState.sheep[0].position.x += 1;
      const dropped = manualBroadcast(sim, 2);
      expect(dropped.kind).toBe('delta');

      // The tick-3 delta now has baseTick 2 !== lastAppliedTick 1: discard,
      // request a keyframe, notify nothing.
      sim.gameState.sheep[1].position.x += 1;
      const gapDelta = manualBroadcast(sim, 3);
      expect(gapDelta.kind).toBe('delta');
      deliverPath(nm, gapDelta);
      expect(notified.length).toBe(notifiedBefore);
      expect(nm.lastAppliedTick).toBe(1);
      expect(keyframeRequests(sent)).toBe(1);

      // While awaiting, even a delta whose baseTick matches lastAppliedTick
      // is ignored (its basis snapshot is not the one we hold reliable).
      deliver(nm, 'gameStateDelta', { ...gapDelta.frame, baseTick: 1 });
      expect(notified.length).toBe(notifiedBefore);

      // The DO's unicast keyframe reply: replace wholesale, drift resets to
      // zero (deep-equal to the server snapshot), deltas resume.
      deliver(nm, 'gameStateUpdate', sim.getLatestGameState());
      expect(nm.lastAppliedTick).toBe(3);
      expect(nm.lastServerState).toEqual(overWire(sim.getLatestGameState()));
      expect((nm as any)._awaitingKeyframe).toBe(false);

      sim.gameState.sheep[2].position.x += 1;
      const resumed = manualBroadcast(sim, 4);
      expect(resumed.kind).toBe('delta');
      expect(resumed.frame.baseTick).toBe(3);
      deliverPath(nm, resumed);
      expect(nm.lastAppliedTick).toBe(4);
      expect(nm.lastServerState).toEqual(overWire(sim.getLatestGameState()));
    } finally {
      sim.cleanup?.();
    }
  });

  it('sends requestKeyframe at most once per 500 ms regardless of how many deltas arrive (fake timers)', () => {
    vi.useFakeTimers({
      toFake: ['performance', 'Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
    const { nm, sent } = makeClient();

    deliver(nm, 'gameStateUpdate', tinyKeyframe(1));
    expect(nm.lastAppliedTick).toBe(1);

    // Mismatch storm: only the first send goes out inside the window.
    deliver(nm, 'gameStateDelta', tinyDelta(8, 7));
    expect(keyframeRequests(sent)).toBe(1);
    deliver(nm, 'gameStateDelta', tinyDelta(9, 8));
    expect(keyframeRequests(sent)).toBe(1);

    vi.advanceTimersByTime(499);
    deliver(nm, 'gameStateDelta', tinyDelta(10, 9));
    expect(keyframeRequests(sent)).toBe(1);

    vi.advanceTimersByTime(2); // 501 ms since the first send
    deliver(nm, 'gameStateDelta', tinyDelta(11, 10));
    expect(keyframeRequests(sent)).toBe(2);

    // A keyframe clears the awaiting flag; a fresh gap inside the cooldown
    // window still does not send again until the window elapses.
    vi.advanceTimersByTime(100);
    deliver(nm, 'gameStateUpdate', tinyKeyframe(20));
    deliver(nm, 'gameStateDelta', tinyDelta(30, 25));
    expect(keyframeRequests(sent)).toBe(2);
    vi.advanceTimersByTime(500);
    deliver(nm, 'gameStateDelta', tinyDelta(31, 30));
    expect(keyframeRequests(sent)).toBe(3);
  });
});

describe('P2-DELTA-CLIENT: legacy (v2 / pre-tick) DO compatibility', () => {
  it('plays normally on full snapshots with no tick field and never requires a delta', () => {
    const { nm, sent, notified } = makeClient();

    // A truly old DO: no tick, and on the oldest frames no v either.
    const v2Frame = (x: number, withV: boolean) => ({
      ...(withV ? { v: 2 } : {}),
      timestamp: Date.now(),
      sheepRetired: 0,
      totalSheep: 2,
      gameCompleted: false,
      isCompetitive: false,
      isTimedMode: false,
      sheep: [
        { id: 0, x, z: 1, vx: 0.5, vz: 0, state: 1, facing: 0, hasPassedGate: false, isRetiring: false },
        { id: 1, x: -x, z: 2, vx: -0.5, vz: 0, state: 1, facing: 3.14, hasPassedGate: false, isRetiring: false },
      ],
      sheepdogs: [{ playerId: 'p1', dogType: 'jep', x: 0, z: 0, vx: 0, vz: 0, rotation: 0 }],
    });

    deliver(nm, 'gameStateUpdate', v2Frame(1, false));
    deliver(nm, 'gameStateUpdate', v2Frame(2, true));
    deliver(nm, 'gameStateUpdate', v2Frame(3, true));

    expect(notified.length).toBe(3);
    expect(nm.lastAppliedTick).toBeNull();
    expect(nm.lastServerState.sheep[0].x).toBe(3);
    expect(nm.previousServerState.sheep[0].x).toBe(2);
    // The dog-reconciliation read path sees the usual shape.
    expect(nm.lastServerState.sheepdogs[0].playerId).toBe('p1');
    // Interpolation works across plain full snapshots, exactly as today.
    const interp = nm.getInterpolatedGameState();
    expect(interp.sheep[0].x).toBeGreaterThanOrEqual(2);
    expect(interp.sheep[0].x).toBeLessThanOrEqual(3);
    // No deltas ever arrived, no keyframe was ever requested.
    expect(keyframeRequests(sent)).toBe(0);
  });

  it('safely discards a delta that arrives before any tick-stamped frame', () => {
    const { nm, sent, notified } = makeClient();
    deliver(nm, 'gameStateDelta', tinyDelta(5, 4));
    expect(notified.length).toBe(0);
    expect(keyframeRequests(sent)).toBe(1);
    // A later full snapshot recovers playback.
    deliver(nm, 'gameStateUpdate', tinyKeyframe(6));
    expect(notified.length).toBe(1);
    expect(nm.lastAppliedTick).toBe(6);
  });
});
