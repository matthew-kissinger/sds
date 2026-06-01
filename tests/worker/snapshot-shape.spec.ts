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
});
