// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * P-PERF-2: wire-shape lock for createGameStateSnapshot.
 *
 * GameSim's per-tick allocation reduction (hoisting the active-sheep filter,
 * sharing the validateEntityState fallback constants, and the deliberately-
 * NOT-taken snapshot pooling option) must not change the SERIALIZED snapshot
 * the DO broadcasts. The MessagePack output is wire-frozen; an extra or stale
 * key silently desyncs the client predictor.
 *
 * These tests assert createGameStateSnapshot against the REAL producer (a live
 * GameSimulation), not a fictional hand-rolled shape. They lock:
 *   - sheep coordinates / velocity / facing quantized to 2 decimals;
 *   - sheepdog stamina is an integer;
 *   - assignedGate / retirementTarget appear ONLY when set on the entity,
 *     INCLUDING a gain-then-lose case across ticks (the exact staleness trap a
 *     pooled snapshot object-map would hit if a reused slot kept the old key);
 *   - the sheepdog entry carries the expected key set.
 *
 * If snapshot pooling is ever introduced, the gain-then-lose case fails the
 * moment a recycled slot leaks a conditional field. That is the point.
 */
import { describe, it, expect } from 'vitest';
import { GameSimulation } from '../../worker/src/GameSim.js';
import { PROTOCOL_VERSION } from '../../shared/protocol.js';

// Minimal RoomDO-shaped adapter — same surface the existing
// worker-objective-snapshot.spec.js drives the sim with.
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
    state: 'waiting',
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

// True when x is a number quantized to at most 2 decimal places, matching
// the Math.round(v * 100) / 100 the producer applies. Multiply back by 100
// and assert the result is integral (within fp epsilon).
function isQuantized2dp(x: unknown): boolean {
  if (typeof x !== 'number' || !Number.isFinite(x)) return false;
  const scaled = x * 100;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

describe('P-PERF-2: createGameStateSnapshot wire shape', () => {
  it('quantizes sheep coordinates/velocity/facing to 2 decimals and keeps stamina integer', () => {
    const sim = new GameSimulation(makeRoomAdapter('field', 'cooperative', 30) as any);
    try {
      // Nudge an entity onto an awkward sub-2dp coordinate so rounding is
      // actually exercised (not trivially already-rounded at spawn).
      sim.gameState.sheep[0].position.set(12.34567, -8.99899);
      sim.gameState.sheep[0].velocity.set(0.123456, -0.654321);
      sim.gameState.sheep[0].facingDirection = 1.23456;

      const dog = sim.sheepdogs.get('p1');
      dog.position.set(3.14159, 2.71828);
      dog.velocity.set(-1.4142, 1.7320);
      dog.stamina = 87.6543;

      const snap = sim.createGameStateSnapshot();

      for (const s of snap.sheep) {
        expect(isQuantized2dp(s.x), `sheep ${s.id} x not 2dp: ${s.x}`).toBe(true);
        expect(isQuantized2dp(s.z), `sheep ${s.id} z not 2dp: ${s.z}`).toBe(true);
        expect(isQuantized2dp(s.vx)).toBe(true);
        expect(isQuantized2dp(s.vz)).toBe(true);
        expect(isQuantized2dp(s.facing)).toBe(true);
      }

      // Specific rounded values for the entity we set.
      expect(snap.sheep[0].x).toBe(12.35);
      expect(snap.sheep[0].z).toBe(-9);
      expect(snap.sheep[0].facing).toBe(1.23);

      for (const d of snap.sheepdogs) {
        expect(isQuantized2dp(d.x)).toBe(true);
        expect(isQuantized2dp(d.z)).toBe(true);
        expect(isQuantized2dp(d.rotation)).toBe(true);
        expect(Number.isInteger(d.stamina), `stamina not integer: ${d.stamina}`).toBe(true);
      }
      expect(snap.sheepdogs[0].stamina).toBe(88); // Math.round(87.6543)
    } finally {
      sim.cleanup?.();
    }
  });

  it('includes assignedGate / retirementTarget ONLY when set, and drops them when an entity loses them across ticks', () => {
    const sim = new GameSimulation(makeRoomAdapter('field', 'cooperative', 30) as any);
    try {
      const sheep = sim.gameState.sheep[0];

      // --- Tick A: entity has NEITHER conditional field. ---
      sheep.assignedGate = null;
      sheep.retirementTarget = null;
      const a = sim.createGameStateSnapshot();
      const entryA = a.sheep.find((s: any) => s.id === sheep.id);
      expect(entryA).toBeDefined();
      expect(entryA).not.toHaveProperty('assignedGate');
      expect(entryA).not.toHaveProperty('targetX');
      expect(entryA).not.toHaveProperty('targetZ');

      // --- Tick B: entity GAINS both conditional fields. ---
      sheep.assignedGate = 2;
      sheep.retirementTarget = { x: 5.55555, z: -7.77777 };
      const b = sim.createGameStateSnapshot();
      const entryB = b.sheep.find((s: any) => s.id === sheep.id);
      expect(entryB).toHaveProperty('assignedGate', 2);
      expect(entryB).toHaveProperty('targetX', 5.56);
      expect(entryB).toHaveProperty('targetZ', -7.78);

      // --- Tick C: entity LOSES both conditional fields again. ---
      // This is the staleness trap: a pooled/reused snapshot slot that forgot
      // to clear the old keys would still serialize assignedGate / targetX/Z.
      // With fresh literals (snapshotPooled=false) the keys must be gone.
      sheep.assignedGate = null;
      sheep.retirementTarget = null;
      const c = sim.createGameStateSnapshot();
      const entryC = c.sheep.find((s: any) => s.id === sheep.id);
      expect(entryC).not.toHaveProperty('assignedGate');
      expect(entryC).not.toHaveProperty('targetX');
      expect(entryC).not.toHaveProperty('targetZ');

      // assignedGate === 0 is a valid gate id and must still serialize
      // (the producer guards on !== null, not on truthiness).
      sheep.assignedGate = 0;
      const d = sim.createGameStateSnapshot();
      const entryD = d.sheep.find((s: any) => s.id === sheep.id);
      expect(entryD).toHaveProperty('assignedGate', 0);
    } finally {
      sim.cleanup?.();
    }
  });

  it('emits the expected sheepdog entry key set keyed by playerId', () => {
    const sim = new GameSimulation(makeRoomAdapter('field', 'cooperative', 30) as any);
    try {
      const snap = sim.createGameStateSnapshot();
      expect(snap.sheepdogs).toHaveLength(1);

      const dog = snap.sheepdogs[0];
      expect(new Set(Object.keys(dog))).toEqual(
        new Set([
          'playerId',
          'dogType',
          'x',
          'z',
          'vx',
          'vz',
          'rotation',
          'stamina',
          'sprinting',
          'sequence',
          'interpolatingToClient',
        ]),
      );
      expect(dog.playerId).toBe('p1');
      expect(dog.dogType).toBe('jep');
    } finally {
      sim.cleanup?.();
    }
  });

  it('emits the expected always-present sheep entry keys (conditional fields excluded)', () => {
    const sim = new GameSimulation(makeRoomAdapter('field', 'cooperative', 30) as any);
    try {
      const sheep = sim.gameState.sheep[0];
      sheep.assignedGate = null;
      sheep.retirementTarget = null;

      const snap = sim.createGameStateSnapshot();
      const entry = snap.sheep.find((s: any) => s.id === sheep.id);

      expect(new Set(Object.keys(entry))).toEqual(
        new Set(['id', 'x', 'z', 'vx', 'vz', 'state', 'facing', 'hasPassedGate', 'isRetiring']),
      );
    } finally {
      sim.cleanup?.();
    }
  });

  // Cycle 67 P5: the protocol version tag + the additive survival/wolves blocks.
  it('stamps the protocol version and omits survival/wolves on a non-survival frame', () => {
    const sim = new GameSimulation(makeRoomAdapter('field', 'cooperative', 30) as any);
    try {
      const snap = sim.createGameStateSnapshot();
      expect(snap.v).toBe(PROTOCOL_VERSION);
      expect(snap.survival).toBeUndefined();
      expect(snap.wolves).toBeUndefined();
      // A non-survival sheep carries no killed flag (byte-compatible entry).
      expect(snap.sheep[0]).not.toHaveProperty('killed');
    } finally {
      sim.cleanup?.();
    }
  });

  // P2-DELTA: the additive tick stamp + the full-frame top-level key set.
  // The legacy cohort receives exactly this frame, so the key set IS the
  // v2-byte-compat contract (v2 keys + the additive `tick`, nothing else).
  it('stamps the additive sim tick and keeps the full-frame top-level key set v2-compatible', () => {
    const sim: any = new GameSimulation(makeRoomAdapter('field', 'cooperative', 30) as any);
    try {
      const snap0 = sim.createGameStateSnapshot();
      expect(snap0.tick).toBe(0); // pre-first-tick (the gameStarted frame)

      sim.isRunning = true;
      sim.tick();
      sim.tick();
      sim.isRunning = false;
      const snap2 = sim.getLatestGameState();
      expect(snap2.tick).toBe(2);
      expect(Number.isInteger(snap2.tick)).toBe(true);

      expect(new Set(Object.keys(snap2))).toEqual(
        new Set([
          'v', 'tick', 'timestamp', 'sheepRetired', 'totalSheep',
          'gameCompleted', 'isCompetitive', 'isTimedMode', 'sheep', 'sheepdogs',
        ]),
      );
    } finally {
      sim.cleanup?.();
    }
  });

  it('locks the survival + wolves block shape (quantized, keyed) on a survival frame', () => {
    const sim = new GameSimulation(makeRoomAdapter('newsheepdogland', 'survival', 200) as any);
    try {
      // Put wolves on the wire without driving the whole clock.
      sim._survival.wolves.spawnNight(1, sim.gameState.sheep);
      sim._survival.wolves.wolves[0].x = 12.34567; // exercise rounding
      sim._survival.wolves.wolves[0].z = -8.99899;

      const snap = sim.createGameStateSnapshot();
      expect(snap.v).toBe(PROTOCOL_VERSION);
      expect(new Set(Object.keys(snap.survival))).toEqual(
        new Set(['day', 'phase', 'flock', 'peak', 't', 'gateOpen', 'alive', 'pennedCount']),
      );
      expect(Array.isArray(snap.wolves)).toBe(true);
      expect(snap.wolves.length).toBeGreaterThan(0);
      for (const w of snap.wolves) {
        expect(new Set(Object.keys(w))).toEqual(new Set(['id', 'x', 'z', 'state']));
        expect(isQuantized2dp(w.x)).toBe(true);
        expect(isQuantized2dp(w.z)).toBe(true);
      }
      expect(snap.wolves[0].x).toBe(12.35);
      expect(snap.wolves[0].z).toBe(-9);
      // Dormant pool sheep carry the killed flag so the client hides them.
      expect(snap.sheep.some((s: any) => s.killed === true)).toBe(true);
    } finally {
      sim.cleanup?.();
    }
  });

  // P2-DELTA: the gameStateDelta frame shape lock (design doc section 3.3).
  it('locks the gameStateDelta key set: changed[j] carries i plus exactly the snapshot record keys', () => {
    const sim: any = new GameSimulation(makeRoomAdapter('field', 'cooperative', 30) as any);
    try {
      // Establish a basis (first delta-path frame is a keyframe), then move
      // one plain sheep and one with both conditional keys set.
      sim.tickCount = 1;
      sim.broadcastGameState();
      expect(sim.getDeltaPathFrame().kind).toBe('keyframe');

      sim.gameState.sheep[0].position.x += 0.5;
      sim.gameState.sheep[1].position.x += 0.5;
      sim.gameState.sheep[1].assignedGate = 1;
      sim.gameState.sheep[1].retirementTarget = { x: 1.234, z: -5.678 };
      sim.tickCount = 2;
      sim.broadcastGameState();
      const path = sim.getDeltaPathFrame();
      expect(path.kind).toBe('delta');
      const frame = path.frame;

      // Top-level delta key set (field coop: no conditional blocks).
      expect(new Set(Object.keys(frame))).toEqual(
        new Set([
          'v', 'tick', 'baseTick', 'timestamp', 'sheepRetired', 'totalSheep',
          'gameCompleted', 'isCompetitive', 'isTimedMode', 'changed', 'sheepdogs',
        ]),
      );
      expect(frame.v).toBe(PROTOCOL_VERSION);
      expect(frame.tick).toBe(2);
      expect(frame.baseTick).toBe(1);

      // A plain changed sheep: `i` plus exactly the always-present record keys.
      const plain = frame.changed.find((c: any) => c.i === 0);
      expect(new Set(Object.keys(plain))).toEqual(
        new Set(['i', 'id', 'x', 'z', 'vx', 'vz', 'state', 'facing', 'hasPassedGate', 'isRetiring']),
      );

      // Conditional keys ride the record exactly as on a full snapshot,
      // quantized the same way, only when set.
      const cond = frame.changed.find((c: any) => c.i === 1);
      expect(new Set(Object.keys(cond))).toEqual(
        new Set([
          'i', 'id', 'x', 'z', 'vx', 'vz', 'state', 'facing', 'hasPassedGate', 'isRetiring',
          'assignedGate', 'targetX', 'targetZ',
        ]),
      );
      expect(cond.assignedGate).toBe(1);
      expect(cond.targetX).toBe(1.23);
      expect(cond.targetZ).toBe(-5.68);

      // Quantization on the changed records matches the snapshot producer.
      for (const c of frame.changed) {
        expect(isQuantized2dp(c.x)).toBe(true);
        expect(isQuantized2dp(c.z)).toBe(true);
        expect(isQuantized2dp(c.vx)).toBe(true);
        expect(isQuantized2dp(c.vz)).toBe(true);
        expect(isQuantized2dp(c.facing)).toBe(true);
      }

      // The full sheepdogs array rides every delta, snapshot-identical.
      expect(frame.sheepdogs).toEqual(sim.getLatestGameState().sheepdogs);
    } finally {
      sim.cleanup?.();
    }
  });

  it('carries the conditional survival + wolves blocks on every survival delta frame', () => {
    const sim: any = new GameSimulation(makeRoomAdapter('newsheepdogland', 'survival', 200) as any);
    try {
      sim._survival.wolves.spawnNight(1, sim.gameState.sheep);
      sim.tickCount = 1;
      sim.broadcastGameState();
      expect(sim.getDeltaPathFrame().kind).toBe('keyframe');

      sim.gameState.sheep[0].position.x += 0.5;
      sim.tickCount = 2;
      sim.broadcastGameState();
      const path = sim.getDeltaPathFrame();
      expect(path.kind).toBe('delta');
      expect(path.frame.survival).toEqual(sim.getLatestGameState().survival);
      expect(path.frame.wolves).toEqual(sim.getLatestGameState().wolves);
    } finally {
      sim.cleanup?.();
    }
  });
});
