// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 67 P3: the DO-authoritative survival tick in GameSimulation.
 *
 * Drives a survival room through the day clock and asserts the authoritative
 * survival subsystem: startFlock active + a dormant pool, wolves spawning at
 * nightfall (seeded from room.seed), the pen protecting penned sheep, the bark
 * wolf-repel, the run ending on a 45%+ night loss with each player's peak flock
 * submitted, flock growth on a surviving dawn, and the additive survival/wolves
 * snapshot blocks (absent on non-survival rooms).
 *
 * The day clock is forced by setting the survival `elapsed` accumulator directly
 * so a phase change happens in one tick instead of ~18k real ticks.
 */
import { describe, it, expect } from 'vitest';
import { GameSimulation } from '../../worker/src/GameSim.js';

function makeRoomAdapter(
  gameMode: string = 'survival',
  playerIds: string[] = ['p1', 'p2'],
  sceneId: string = 'newsheepdogland',
) {
  const players = new Map(
    playerIds.map((id) => [
      id,
      { id, name: id.toUpperCase(), dogType: 'jep', isHost: id === playerIds[0], isReady: true, joinedAt: 0 },
    ]),
  );
  const submitted: Array<{ scores: Record<string, number>; data: any }> = [];
  const room = {
    roomCode: 'SURVRM',
    isPublic: false,
    modeLocked: true,
    gameMode,
    sceneId,
    sheepCount: 200,
    seed: 12345,
    state: 'in-game',
    lastActivity: 0,
    simulation: null,
    players,
    getPlayer: (id: string) => players.get(id),
    broadcastToRoom: () => {},
    finishGame: () => {},
    getSerializableState: () => ({}),
    resolvePlayerName: (id: string) => id.toUpperCase(),
    onSubmitScores: (scores: Record<string, number>, data: any) => { submitted.push({ scores, data }); },
  };
  return { room, submitted };
}

/**
 * Force the survival clock to a target normalized time-of-day on the next tick.
 * `dayWraps` adds whole days so a night->morning (dawn) transition can be driven.
 */
function forcePhaseTo(sim: any, targetT: number, dayWraps = 0) {
  const sd = sim.scene.dayNight?.secondsPerDay ?? 600;
  const initialT = sim.scene.dayNight?.initialT ?? 0.28;
  let frac = targetT - initialT;
  while (frac < 0) frac += 1;
  // _tickSurvival adds one step before reading the clock; pre-subtract it.
  sim._survival.elapsed = (frac + dayWraps) * sd - (1 / 60);
}

describe('GameSim survival tick (Cycle 67 P3)', () => {
  it('initializes startFlock active sheep + a dormant pool sized to maxFlock', () => {
    const { room } = makeRoomAdapter();
    const sim = new GameSimulation(room as any);
    try {
      expect(sim.isSurvival).toBe(true);
      expect(sim._survival).toBeTruthy();
      expect(sim.gameState.sheep.length).toBe(200); // maxFlock pool
      expect(sim._countActiveSurvivalSheep()).toBe(10); // startFlock
    } finally {
      sim.cleanup?.();
    }
  });

  it('spawns a seeded wolf pack at nightfall', () => {
    const { room } = makeRoomAdapter();
    const sim = new GameSimulation(room as any);
    try {
      forcePhaseTo(sim, 0.85); // night
      sim._tickSurvival(1 / 60);
      expect(sim._survival.phase).toBe('night');
      expect(sim._survival.wolves.count).toBe(2); // spawnCountForDay(1)
      // Reproducible: a second sim with the same seed lays the pack identically.
      const sim2 = new GameSimulation(makeRoomAdapter().room as any);
      try {
        forcePhaseTo(sim2, 0.85);
        sim2._tickSurvival(1 / 60);
        expect(sim2._survival.wolves.wolves[0].x).toBe(sim._survival.wolves.wolves[0].x);
        expect(sim2._survival.wolves.wolves[0].z).toBe(sim._survival.wolves.wolves[0].z);
      } finally { sim2.cleanup?.(); }
    } finally {
      sim.cleanup?.();
    }
  });

  it('keeps a sheep inside the closed pen unhuntable', () => {
    const { room } = makeRoomAdapter();
    const sim = new GameSimulation(room as any);
    try {
      const pen = sim.scene.pen;
      const s0 = sim.gameState.sheep[0];
      s0.position.set(pen.center.x, pen.center.z); // drop it in the pen
      forcePhaseTo(sim, 0.85);
      sim._tickSurvival(1 / 60); // pen retires it; wolves spawn outside
      expect(sim._survival.wolves._isHuntable(s0)).toBe(false);
    } finally {
      sim.cleanup?.();
    }
  });

  it('breaks wolf pursuit when a player barks nearby', () => {
    const { room } = makeRoomAdapter();
    const sim = new GameSimulation(room as any);
    try {
      forcePhaseTo(sim, 0.85);
      sim._tickSurvival(1 / 60);
      expect(sim._survival.wolves.count).toBeGreaterThan(0);
      const dog = sim.sheepdogs.get('p1');
      const w = sim._survival.wolves.wolves[0];
      w.x = dog.position.x + 2; w.z = dog.position.z; // park a wolf next to the dog
      sim.applyPlayerInput('p1', {
        direction: { x: 1, z: 0 }, sprint: false, inputSequence: 1, bark: true, timestamp: 1,
      });
      expect(w.state).toBe('flee');
    } finally {
      sim.cleanup?.();
    }
  });

  it('ends the run + submits each player peak flock on a 45%+ night loss', () => {
    const { room, submitted } = makeRoomAdapter();
    const sim = new GameSimulation(room as any);
    try {
      forcePhaseTo(sim, 0.85);
      sim._tickSurvival(1 / 60); // nightfall (nightStartFlock = 10)
      expect(sim._survival.run.flock).toBe(10);
      for (let i = 0; i < 5; i++) sim._survival.run.recordKill(); // 5/10 = 50% >= 45%
      forcePhaseTo(sim, 0.28, 1); // dawn (next morning)
      sim._tickSurvival(1 / 60);
      expect(sim._survival.ended).toBe(true);
      expect(sim.gameState.gameCompleted).toBe(true);
      expect(submitted).toHaveLength(1);
      expect(submitted[0].data.isSurvival).toBe(true);
      expect(submitted[0].data.partySize).toBe(2);
      expect(submitted[0].scores.p1).toBe(10); // peak before the fatal night
      expect(submitted[0].scores.p2).toBe(10);
    } finally {
      sim.cleanup?.();
    }
  });

  it('grows the active flock on a surviving dawn', () => {
    const { room } = makeRoomAdapter();
    const sim = new GameSimulation(room as any);
    try {
      forcePhaseTo(sim, 0.85);
      sim._tickSurvival(1 / 60); // night, no kills
      forcePhaseTo(sim, 0.28, 1); // survive to dawn
      sim._tickSurvival(1 / 60);
      expect(sim._survival.run.isAlive()).toBe(true);
      expect(sim._survival.run.day).toBe(2);
      expect(sim._survival.run.flock).toBe(16);
      expect(sim._countActiveSurvivalSheep()).toBe(16);
    } finally {
      sim.cleanup?.();
    }
  });

  it('exposes additive survival + wolves snapshot blocks (with killed-flagged dormant sheep)', () => {
    const { room } = makeRoomAdapter();
    const sim = new GameSimulation(room as any);
    try {
      forcePhaseTo(sim, 0.85);
      sim._tickSurvival(1 / 60);
      const snap = sim.createGameStateSnapshot();
      expect(snap.survival).toBeTruthy();
      expect(snap.survival.phase).toBe('night');
      expect(snap.survival.flock).toBe(10);
      expect(Array.isArray(snap.wolves)).toBe(true);
      expect(snap.wolves).toHaveLength(2);
      // Active sheep carry no killed flag; dormant sheep are flagged killed.
      expect(snap.sheep[0]).not.toHaveProperty('killed');
      expect(snap.sheep.some((s: any) => s.killed === true)).toBe(true);
    } finally {
      sim.cleanup?.();
    }
  });

  it('leaves a non-survival co-op snapshot free of survival/wolves blocks', () => {
    const { room } = makeRoomAdapter('cooperative');
    const sim = new GameSimulation(room as any);
    try {
      expect(sim.isSurvival).toBe(false);
      expect(sim._survival).toBeUndefined();
      const snap = sim.createGameStateSnapshot();
      expect(snap.survival).toBeUndefined();
      expect(snap.wolves).toBeUndefined();
      expect(snap.sheep[0]).not.toHaveProperty('killed');
    } finally {
      sim.cleanup?.();
    }
  });
});
