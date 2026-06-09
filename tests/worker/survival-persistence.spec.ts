// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 68 P4: survival run persistence across a worker redeploy / DO eviction.
 *
 * The DO loses the in-flight sim on eviction (it snaps back to 'waiting' - see
 * RoomDO constructor), so the multi-DAY run is checkpointed at day granularity:
 * GameSim.serializeSurvival() captures {day, flock, peak} on each surviving dawn,
 * RoomDO persists it to storage, and a fresh GameSim resumes from it (via the
 * adapter's survivalResume) instead of resetting to day 1. The in-flight night
 * (wolf positions, within-day clock) is intentionally not captured.
 */
import { describe, it, expect } from 'vitest';
import { GameSimulation } from '../../worker/src/GameSim.js';
import { spawnCountForDay } from '../../shared/survival/wolfBehavior.js';

function makeRoomAdapter(opts: { gameMode?: string; survivalResume?: any } = {}) {
  const gameMode = opts.gameMode ?? 'survival';
  const playerIds = ['p1', 'p2'];
  const players = new Map(
    playerIds.map((id) => [
      id,
      { id, name: id.toUpperCase(), dogType: 'jep', isHost: id === playerIds[0], isReady: true, joinedAt: 0 },
    ]),
  );
  const progress: any[] = [];
  const room = {
    roomCode: 'SURVRM',
    isPublic: false,
    modeLocked: true,
    gameMode,
    sceneId: 'newsheepdogland',
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
    onSubmitScores: () => {},
    survivalResume: opts.survivalResume ?? null,
    onSurvivalProgress: (p: any) => { progress.push(p); },
  };
  return { room, progress };
}

function forcePhaseTo(sim: any, targetT: number, dayWraps = 0) {
  const sd = sim.scene.dayNight?.secondsPerDay ?? 600;
  const initialT = sim.scene.dayNight?.initialT ?? 0.28;
  let frac = targetT - initialT;
  while (frac < 0) frac += 1;
  sim._survival.elapsed = (frac + dayWraps) * sd - (1 / 60);
}

/** Drive one full day -> night -> dawn cycle with `kills` wolf kills that night. */
function runNight(sim: any, kills = 0) {
  forcePhaseTo(sim, 0.85); // night
  sim._tickSurvival(1 / 60); // nightfall
  for (let i = 0; i < kills; i++) sim._survival.run.recordKill();
  forcePhaseTo(sim, 0.28, 1); // dawn (next morning)
  sim._tickSurvival(1 / 60);
}

describe('GameSim survival persistence (Cycle 68 P4)', () => {
  it('checkpoints run progress to the adapter on a surviving dawn', () => {
    const { room, progress } = makeRoomAdapter();
    const sim = new GameSimulation(room as any);
    try {
      runNight(sim, 0); // survive day 1 -> day 2, flock 16
      expect(sim._survival.run.day).toBe(2);
      expect(progress.at(-1)).toEqual({ day: 2, flock: 16, peak: 16, dead: false });
    } finally { sim.cleanup?.(); }
  });

  it('resumes a persisted multi-day run instead of resetting to day 1', () => {
    const { room } = makeRoomAdapter({ survivalResume: { day: 4, flock: 25, peak: 25, dead: false } });
    const sim = new GameSimulation(room as any);
    try {
      expect(sim._survival.run.day).toBe(4);
      expect(sim._survival.run.flock).toBe(25);
      expect(sim._survival.run.peak).toBe(25);
      // The rendered active flock is grown to match the resumed run.
      expect(sim._countActiveSurvivalSheep()).toBe(25);
    } finally { sim.cleanup?.(); }
  });

  it('keeps wolf-count continuity for the resumed day', () => {
    const { room } = makeRoomAdapter({ survivalResume: { day: 4, flock: 25, peak: 25, dead: false } });
    const sim = new GameSimulation(room as any);
    try {
      forcePhaseTo(sim, 0.85);
      sim._tickSurvival(1 / 60);
      // Day 4 pack, not a day-1 reset: spawnCountForDay(4) = 2 + 3 = 5.
      expect(sim._survival.wolves.count).toBe(spawnCountForDay(4));
      expect(sim._survival.wolves.count).toBe(5);
    } finally { sim.cleanup?.(); }
  });

  it('round-trips serialize -> fresh GameSim -> continuity', () => {
    const { room: roomA } = makeRoomAdapter();
    const simA = new GameSimulation(roomA as any);
    let saved: any;
    try {
      runNight(simA, 0); // -> day 2, flock 16
      runNight(simA, 0); // -> day 3, flock 22
      saved = simA.serializeSurvival();
      expect(saved).toEqual({ day: 3, flock: 22, peak: 22, dead: false });
    } finally { simA.cleanup?.(); }

    const { room: roomB } = makeRoomAdapter({ survivalResume: saved });
    const simB = new GameSimulation(roomB as any);
    try {
      expect(simB._survival.run.day).toBe(3);
      expect(simB._survival.run.flock).toBe(22);
      expect(simB._countActiveSurvivalSheep()).toBe(22);
    } finally { simB.cleanup?.(); }
  });

  it('clears persisted progress on death (dead:true checkpoint)', () => {
    const { room, progress } = makeRoomAdapter();
    const sim = new GameSimulation(room as any);
    try {
      runNight(sim, 5); // 5/10 = 50% >= 45% -> death
      expect(sim._survival.ended).toBe(true);
      expect(progress.at(-1).dead).toBe(true);
    } finally { sim.cleanup?.(); }
  });

  it('serializeSurvival returns null outside a survival run', () => {
    const { room } = makeRoomAdapter({ gameMode: 'cooperative' });
    const sim = new GameSimulation(room as any);
    try {
      expect(sim.serializeSurvival()).toBeNull();
    } finally { sim.cleanup?.(); }
  });

  it('does not alter the broadcast snapshot shape (no protocol bump)', () => {
    const { room } = makeRoomAdapter({ survivalResume: { day: 2, flock: 15, peak: 15, dead: false } });
    const sim = new GameSimulation(room as any);
    try {
      const snap = sim.createGameStateSnapshot();
      // Same additive blocks as before P4; nothing persistence-related on the wire.
      expect(snap.survival).toBeTruthy();
      expect(snap.survival).not.toHaveProperty('resume');
      expect(snap).not.toHaveProperty('survivalProgress');
    } finally { sim.cleanup?.(); }
  });
});
