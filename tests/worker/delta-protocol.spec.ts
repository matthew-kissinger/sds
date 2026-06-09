// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * P2-DELTA-IMPL: the GameSim delta builder
 * (docs/hardening/delta-protocol-design.md sections 3-4, test plan section 9).
 *
 * Locks, against the REAL producer (a live GameSimulation):
 *   - round-trip: keyframe + delta sequence reconstructs the full snapshot
 *     exactly (a reference apply function, deep-equal per tick), including
 *     conditional-key gain-then-lose, survival kill/dormancy, and an id
 *     change in a reused slot (the competitive respawn shape);
 *   - changed-set correctness: a stationary sheep produces no entry; a move
 *     below the 0.01 wire quantum produces no entry; a 0.01-quantum move
 *     produces exactly one, keyed by array index;
 *   - the 85% degenerate-frame rule flips a delta to a keyframe;
 *   - keyframe cadence at tick % KEYFRAME_INTERVAL_TICKS === 0, plus the
 *     keyframe-when-no-basis case;
 *   - duplicate-tick frames (broadcast loop outpacing the sim) are empty
 *     deltas with baseTick === tick;
 *   - the index-stability invariant: gameState.sheep never reorders, grows,
 *     or shrinks during a round, per mode (the delta layer keys on index).
 */
import { describe, it, expect } from 'vitest';
import { GameSimulation } from '../../worker/src/GameSim.js';
import { KEYFRAME_INTERVAL_TICKS } from '../../shared/protocol.js';

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

// Reference client-side apply: a NEW top-level object with a NEW sheep array;
// unchanged entries share the previous records, changed entries are the
// delta's records with `i` stripped, placed at index i. Scalars, sheepdogs,
// and conditional blocks come from the delta (design section 7).
function applyDelta(prev: any, frame: any) {
  const sheep = prev.sheep.slice();
  for (const c of frame.changed) {
    const { i, ...rec } = c;
    sheep[i] = rec;
  }
  const next: any = {
    v: frame.v,
    tick: frame.tick,
    timestamp: frame.timestamp,
    sheepRetired: frame.sheepRetired,
    totalSheep: frame.totalSheep,
    gameCompleted: frame.gameCompleted,
    isCompetitive: frame.isCompetitive,
    isTimedMode: frame.isTimedMode,
    sheep,
    sheepdogs: frame.sheepdogs,
  };
  for (const k of ['competitive', 'timedMode', 'objective', 'survival', 'wolves']) {
    if (k in frame) next[k] = frame[k];
  }
  return next;
}

// One broadcast step driven by hand: advance the wire tick WITHOUT running the
// physics tick body, rebuild the snapshot, and return the delta-path frame.
// Gives the changed-set tests precise control over what moved between frames.
function manualBroadcast(sim: any, tickValue: number) {
  sim.tickCount = tickValue;
  sim.broadcastGameState();
  return sim.getDeltaPathFrame();
}

describe('P2-DELTA: delta builder round-trip', () => {
  it('reconstructs the full snapshot exactly across 200 real ticks with herding input', () => {
    const sim: any = new GameSimulation(makeRoomAdapter('field', 'cooperative', 30, ['p1', 'p2']) as any);
    try {
      let reconstructed: any = null;
      let keyframes = 0;
      let deltas = 0;
      for (let t = 1; t <= 200; t++) {
        // Herding pressure: both dogs steer toward the flock so sheep flee
        // and the changed-set is non-trivial.
        sim.handlePlayerInput('p1', { direction: { x: 1, z: 0.3 }, sprint: t % 50 < 20, inputSequence: t });
        sim.handlePlayerInput('p2', { direction: { x: -0.5, z: 1 }, sprint: false, inputSequence: t });
        tickN(sim, 1);
        const state = sim.getLatestGameState();
        const path = sim.getDeltaPathFrame();
        expect(path).not.toBeNull();
        if (path.kind === 'keyframe') {
          keyframes++;
          reconstructed = path.state;
        } else {
          deltas++;
          expect(reconstructed, 'delta before any keyframe').not.toBeNull();
          expect(path.frame.baseTick).toBe(reconstructed.tick);
          reconstructed = applyDelta(reconstructed, path.frame);
        }
        expect(reconstructed).toEqual(state);
      }
      // The run produced a real mix. Early round ticks legitimately flip the
      // 85% degenerate rule (the whole flock adjusts at spawn - exactly the
      // mass-movement case the rule exists for), so the split is not pinned;
      // both kinds must occur, and every frame round-tripped above.
      expect(keyframes).toBeGreaterThanOrEqual(4);
      expect(deltas).toBeGreaterThanOrEqual(10);
    } finally {
      sim.cleanup?.();
    }
  });

  it('round-trips conditional-key gain-then-lose, a survival-style kill, and an id change in a reused slot', () => {
    const sim: any = new GameSimulation(makeRoomAdapter('field', 'cooperative', 30) as any);
    try {
      let reconstructed: any = manualBroadcast(sim, 1).state; // keyframe (no basis)
      const sheep = sim.gameState.sheep[3];

      // GAIN: retirement target + assignedGate appear.
      sheep.assignedGate = 2;
      sheep.retirementTarget = { x: 5.55555, z: -7.77777 };
      let path = manualBroadcast(sim, 2);
      expect(path.kind).toBe('delta');
      let entry = path.frame.changed.find((c: any) => c.i === 3);
      expect(entry).toMatchObject({ assignedGate: 2, targetX: 5.56, targetZ: -7.78 });
      reconstructed = applyDelta(reconstructed, path.frame);
      expect(reconstructed).toEqual(sim.getLatestGameState());

      // LOSE: both conditional keys disappear - key-presence difference, so
      // the sheep ships again and the reconstructed record drops the keys.
      sheep.assignedGate = null;
      sheep.retirementTarget = null;
      path = manualBroadcast(sim, 3);
      expect(path.kind).toBe('delta');
      entry = path.frame.changed.find((c: any) => c.i === 3);
      expect(entry).toBeDefined();
      expect(entry).not.toHaveProperty('assignedGate');
      expect(entry).not.toHaveProperty('targetX');
      reconstructed = applyDelta(reconstructed, path.frame);
      expect(reconstructed).toEqual(sim.getLatestGameState());

      // KILL (survival shape): the killed flag appears on the wire record.
      sheep.killed = true;
      path = manualBroadcast(sim, 4);
      entry = path.frame.changed.find((c: any) => c.i === 3);
      expect(entry).toMatchObject({ killed: true });
      reconstructed = applyDelta(reconstructed, path.frame);
      expect(reconstructed).toEqual(sim.getLatestGameState());

      // RESPAWN (competitive slot reuse): the id changes in place - an index-
      // keyed value difference, no special-casing.
      sheep.killed = false;
      sheep.id = 999;
      path = manualBroadcast(sim, 5);
      entry = path.frame.changed.find((c: any) => c.i === 3);
      expect(entry).toMatchObject({ id: 999 });
      expect(entry).not.toHaveProperty('killed');
      reconstructed = applyDelta(reconstructed, path.frame);
      expect(reconstructed).toEqual(sim.getLatestGameState());

      // A retired/killed sheep that then stops changing stops shipping.
      path = manualBroadcast(sim, 6);
      expect(path.kind).toBe('delta');
      expect(path.frame.changed.find((c: any) => c.i === 3)).toBeUndefined();
    } finally {
      sim.cleanup?.();
    }
  });
});

describe('P2-DELTA: changed-set correctness', () => {
  it('omits stationary sheep, ignores sub-quantum motion, ships a 0.01-quantum move keyed by index', () => {
    const sim: any = new GameSimulation(makeRoomAdapter('field', 'cooperative', 30) as any);
    try {
      expect(manualBroadcast(sim, 1).kind).toBe('keyframe');

      // Nothing moved: empty changed-set.
      let path = manualBroadcast(sim, 2);
      expect(path.kind).toBe('delta');
      expect(path.frame.changed).toEqual([]);

      // Sub-quantum drift (0.004 < half the 0.01 wire quantum): the quantized
      // record is identical, so the sheep does not ship. No second epsilon.
      sim.gameState.sheep[5].position.x += 0.004;
      path = manualBroadcast(sim, 3);
      expect(path.frame.changed).toEqual([]);

      // A full-quantum move ships exactly one record, keyed by array index.
      sim.gameState.sheep[5].position.x += 0.01;
      path = manualBroadcast(sim, 4);
      expect(path.frame.changed).toHaveLength(1);
      expect(path.frame.changed[0].i).toBe(5);
      expect(path.frame.changed[0].id).toBe(sim.gameState.sheep[5].id);
    } finally {
      sim.cleanup?.();
    }
  });

  it('flips to a keyframe when the changed count exceeds 85% of the flock (and not at exactly 85%)', () => {
    const sim: any = new GameSimulation(makeRoomAdapter('field', 'cooperative', 20) as any);
    try {
      expect(manualBroadcast(sim, 1).kind).toBe('keyframe');

      // Exactly 85% (17 of 20): still a delta ("exceeds", strict).
      for (let i = 0; i < 17; i++) sim.gameState.sheep[i].position.x += 1;
      let path = manualBroadcast(sim, 2);
      expect(path.kind).toBe('delta');
      expect(path.frame.changed).toHaveLength(17);

      // 18 of 20 (90%): degenerate - keyframe instead of a delta.
      for (let i = 0; i < 18; i++) sim.gameState.sheep[i].position.x += 1;
      path = manualBroadcast(sim, 3);
      expect(path.kind).toBe('keyframe');
      expect(path.state.tick).toBe(3);

      // The degenerate keyframe rebuilt the basis: the next quiet frame is a
      // normal empty delta diffed against tick 3.
      path = manualBroadcast(sim, 4);
      expect(path.kind).toBe('delta');
      expect(path.frame.baseTick).toBe(3);
      expect(path.frame.changed).toEqual([]);
    } finally {
      sim.cleanup?.();
    }
  });
});

describe('P2-DELTA: keyframe cadence + duplicate-tick frames', () => {
  it('keyframes when there is no basis and at every tick % KEYFRAME_INTERVAL_TICKS === 0', () => {
    const sim: any = new GameSimulation(makeRoomAdapter('field', 'cooperative', 30) as any);
    try {
      const kinds = new Map<number, string>();
      for (let t = 1; t <= 2 * KEYFRAME_INTERVAL_TICKS + 5; t++) {
        const path = manualBroadcast(sim, t);
        kinds.set(t, path.kind);
      }
      expect(kinds.get(1)).toBe('keyframe'); // no basis yet
      for (let t = 2; t <= 2 * KEYFRAME_INTERVAL_TICKS + 5; t++) {
        const expected = t % KEYFRAME_INTERVAL_TICKS === 0 ? 'keyframe' : 'delta';
        expect(kinds.get(t), `tick ${t}`).toBe(expected);
      }
    } finally {
      sim.cleanup?.();
    }
  });

  it('emits an empty delta with baseTick === tick when the broadcast loop outpaces the sim', () => {
    const sim: any = new GameSimulation(makeRoomAdapter('field', 'cooperative', 30) as any);
    try {
      manualBroadcast(sim, 1); // keyframe, basis = tick 1
      // Loop fires again before the sim ticked: same lastGameState, same tick.
      const dup = sim.getDeltaPathFrame();
      expect(dup.kind).toBe('delta');
      expect(dup.frame.tick).toBe(1);
      expect(dup.frame.baseTick).toBe(1);
      expect(dup.frame.changed).toEqual([]);
      // Duplicate frames hold even on a keyframe-cadence tick (a duplicate of
      // tick 60 must not re-send a 20.8 kB keyframe).
      for (let t = 2; t <= KEYFRAME_INTERVAL_TICKS; t++) manualBroadcast(sim, t);
      const dup60 = sim.getDeltaPathFrame();
      expect(dup60.kind).toBe('delta');
      expect(dup60.frame.tick).toBe(KEYFRAME_INTERVAL_TICKS);
      expect(dup60.frame.baseTick).toBe(KEYFRAME_INTERVAL_TICKS);
      expect(dup60.frame.changed).toEqual([]);
    } finally {
      sim.cleanup?.();
    }
  });

  it('returns null before the first snapshot exists', () => {
    const sim: any = new GameSimulation(makeRoomAdapter('field', 'cooperative', 30) as any);
    try {
      expect(sim.getDeltaPathFrame()).toBeNull();
    } finally {
      sim.cleanup?.();
    }
  });
});

describe('P2-DELTA: index-stability invariant (design 3.5)', () => {
  const modes: Array<[string, string, number, string[]]> = [
    ['cooperative', 'field', 30, ['p1', 'p2']],
    ['competitive', 'field', 30, ['p1', 'p2']],
    ['timed', 'field', 30, ['p1', 'p2']],
    ['survival', 'newsheepdogland', 200, ['p1', 'p2']],
  ];

  for (const [gameMode, sceneId, sheepCount, playerIds] of modes) {
    it(`${gameMode}: gameState.sheep never reorders, grows, or shrinks across a driven round`, () => {
      const sim: any = new GameSimulation(makeRoomAdapter(sceneId, gameMode, sheepCount, playerIds) as any);
      try {
        const slots = sim.gameState.sheep.slice(); // capture object identities
        const len = sim.gameState.sheep.length;
        for (let t = 1; t <= 120; t++) {
          sim.handlePlayerInput('p1', { direction: { x: Math.sin(t / 10), z: Math.cos(t / 10) }, sprint: false, inputSequence: t });
          sim.handlePlayerInput('p2', { direction: { x: -1, z: 0.5 }, sprint: true, inputSequence: t });
          tickN(sim, 1);
          expect(sim.gameState.sheep.length).toBe(len);
        }
        // Slot object identity: removal/respawn/dormancy reuse the slot in
        // place; a splice or rebuild anywhere fails here loudly.
        for (let i = 0; i < len; i++) {
          expect(sim.gameState.sheep[i]).toBe(slots[i]);
        }
      } finally {
        sim.cleanup?.();
      }
    });
  }
});
