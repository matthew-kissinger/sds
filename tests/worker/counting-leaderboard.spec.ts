// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Cycle 59 Phase 5 - Counting Sheep leaderboard against a real SQLite engine.
//
// Counting sits BESIDE the Cycle 58 solo path: the count is the score (higher
// better, ranked descending), boards partition by (game_mode, scene_id) and
// ignore sheep_count, and there is NO D1 migration - rows live in the existing
// score_submissions.score column under new game_mode strings, with no
// materialized players-row column. These tests run the production submit + read
// functions against the committed migrations (no counting migration among them)
// to prove all of that store->read for real.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestD1, sqliteAvailable, type TestD1 } from './helpers/d1-sqlite';
import {
  registerPlayer,
  submitScore,
  getLeaderboard,
  getAllLeaderboards,
} from '../../worker/src/d1';

const START = 1_700_000_000_000;

// Mirror the additionalData js/gamestate/completion.js sends for a counting
// bank: gameMode 'counting' (top-level), the curve on singlePlayerMode, the
// 5000 totalSheep as sheepCount, and the client time window. The default window
// (120s active) clears the soft herding floor for any moderate counted total.
function countingPayload(over: Record<string, unknown> = {}) {
  const startedAt = START;
  const activeMs = 120_000;
  const base: Record<string, unknown> = {
    gameMode: 'counting',
    singlePlayerMode: 'exponential',
    sceneId: 'rolling-hills',
    sheepCount: 5000,
    totalSheep: 5000,
    clientStartedAt: startedAt,
    clientFinishedAt: startedAt + activeMs,
    pausedMs: 0,
    ...over,
  };
  if (base.pausedMs === null) delete base.pausedMs;
  return base;
}

describe.skipIf(!sqliteAvailable)('Counting Sheep leaderboard (Cycle 59 P5)', () => {
  let h: TestD1;
  beforeEach(() => { h = createTestD1(); });
  afterEach(() => { h.close(); });

  async function reg(name: string, id: string) {
    await registerPlayer(h.db, id, name, 'custom');
    return id;
  }

  it('stores a counting submission in score_submissions with no materialized column (no migration)', async () => {
    const id = await reg('Counter', 'pid-c1');
    const res = await submitScore(h.db, id, 'counting-exponential', 137, countingPayload());
    // No materialized best column for counting -> updated stays false.
    expect(res.updated).toBe(false);

    const rows = h.query<{ game_mode: string; score: number; score_anomalies: string | null }>(
      'SELECT game_mode, score, score_anomalies FROM score_submissions WHERE persistent_id = ?',
      id,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].game_mode).toBe('counting-exponential');
    expect(rows[0].score).toBe(137);
    expect(rows[0].score_anomalies).toBeNull();

    // No counting_* column exists on players; the solo bests stay null/untouched.
    const player = h.query<{ solo_classic_best: number | null }>(
      'SELECT solo_classic_best FROM players WHERE persistent_id = ?',
      id,
    );
    expect(player[0].solo_classic_best).toBeNull();
  });

  it('ranks the counting board by counted descending', async () => {
    const a = await reg('Small', 'pid-a');
    const b = await reg('Big', 'pid-b');
    const c = await reg('Mid', 'pid-c');
    await submitScore(h.db, a, 'counting-exponential', 137, countingPayload());
    await submitScore(h.db, b, 'counting-exponential', 511, countingPayload());
    await submitScore(h.db, c, 'counting-exponential', 300, countingPayload());

    const board = await getLeaderboard(h.db, 'counting-exponential', 10, { sceneId: 'rolling-hills' });
    expect(board.map((e) => e.displayName)).toEqual(['Big', 'Mid', 'Small']);
    expect(board.map((e) => e.score)).toEqual([511, 300, 137]);
    expect(board[0].rank).toBe(1);
  });

  it('keeps the two curves and the two scenes as separate partitions', async () => {
    const inc = await reg('IncRunner', 'pid-inc');
    const exp = await reg('ExpRunner', 'pid-exp');
    const field = await reg('FieldRunner', 'pid-field');
    await submitScore(h.db, inc, 'counting-incremental', 80, countingPayload({ singlePlayerMode: 'incremental' }));
    await submitScore(h.db, exp, 'counting-exponential', 250, countingPayload());
    await submitScore(h.db, field, 'counting-exponential', 999, countingPayload({ sceneId: 'field', singlePlayerMode: 'exponential' }));

    // Incremental board (rolling-hills): only the incremental runner.
    const incBoard = await getLeaderboard(h.db, 'counting-incremental', 10, { sceneId: 'rolling-hills' });
    expect(incBoard.map((e) => e.displayName)).toEqual(['IncRunner']);

    // Exponential board (rolling-hills): only the RH exponential runner, not the field one.
    const expRH = await getLeaderboard(h.db, 'counting-exponential', 10, { sceneId: 'rolling-hills' });
    expect(expRH.map((e) => e.displayName)).toEqual(['ExpRunner']);

    // Exponential board (field): only the field runner.
    const expField = await getLeaderboard(h.db, 'counting-exponential', 10, { sceneId: 'field' });
    expect(expField.map((e) => e.displayName)).toEqual(['FieldRunner']);
  });

  it('ignores sheep_count when partitioning a counting board', async () => {
    const a = await reg('FiveK', 'pid-5k');
    const b = await reg('ThreeK', 'pid-3k');
    // Same (mode, scene) but different submitted sheep_count - both must appear.
    await submitScore(h.db, a, 'counting-exponential', 400, countingPayload({ sheepCount: 5000 }));
    await submitScore(h.db, b, 'counting-exponential', 200, countingPayload({ sheepCount: 3000 }));

    const board = await getLeaderboard(h.db, 'counting-exponential', 10, { sceneId: 'rolling-hills' });
    expect(board.map((e) => e.displayName)).toEqual(['FiveK', 'ThreeK']);
    // Even passing a sheepCount filter does not narrow a counting board.
    const filtered = await getLeaderboard(h.db, 'counting-exponential', 10, { sceneId: 'rolling-hills', sheepCount: 5000 });
    expect(filtered.map((e) => e.displayName)).toEqual(['FiveK', 'ThreeK']);
  });

  it('soft-flags an implausibly fast counted total and hides it from the public board', async () => {
    const honest = await reg('Honest', 'pid-honest');
    const cheat = await reg('Cheater', 'pid-cheat');
    await submitScore(h.db, honest, 'counting-exponential', 300, countingPayload());
    // Claim 5000 counted in a 120s window. Floor is 5000 * 0.05 = 250s > 120s.
    await submitScore(h.db, cheat, 'counting-exponential', 5000, countingPayload());

    const cheatRow = h.query<{ score_anomalies: string | null }>(
      'SELECT score_anomalies FROM score_submissions WHERE persistent_id = ?',
      cheat,
    );
    expect(cheatRow[0].score_anomalies).toContain('counting_too_fast');

    // Public board hides the flagged row; admin (includeFlagged) sees it ranked first.
    const pub = await getLeaderboard(h.db, 'counting-exponential', 10, { sceneId: 'rolling-hills' });
    expect(pub.map((e) => e.displayName)).toEqual(['Honest']);
    const admin = await getLeaderboard(h.db, 'counting-exponential', 10, { sceneId: 'rolling-hills', includeFlagged: true });
    expect(admin.map((e) => e.displayName)).toEqual(['Cheater', 'Honest']);
  });

  it('hard-rejects a counted total outside [0, 5000]', async () => {
    const id = await reg('OutOfBounds', 'pid-oob');
    await expect(submitScore(h.db, id, 'counting-exponential', 6000, countingPayload())).rejects.toThrow(/out of bounds/);
    await expect(submitScore(h.db, id, 'counting-exponential', -1, countingPayload())).rejects.toThrow(/out of bounds/);
    // Nothing stored.
    const rows = h.query('SELECT 1 FROM score_submissions WHERE persistent_id = ?', id);
    expect(rows).toHaveLength(0);
  });

  it('emits both counting boards from getAllLeaderboards and does not leak into solo boards', async () => {
    const counter = await reg('Counter', 'pid-counter');
    const solo = await reg('Soloist', 'pid-solo');
    await submitScore(h.db, counter, 'counting-exponential', 256, countingPayload());
    // A normal solo run on the same scene/count must stay on its own board.
    await submitScore(h.db, solo, 'soloClassic', 600, {
      gameMode: 'solo', singlePlayerMode: 'classic', sceneId: 'rolling-hills',
      sheepCount: 200, totalSheep: 200,
      clientStartedAt: START, clientFinishedAt: START + 600_000, pausedMs: 0,
    });

    const all = await getAllLeaderboards(h.db, 10, { sceneId: 'rolling-hills' });
    expect(Object.keys(all)).toContain('counting-incremental');
    expect(Object.keys(all)).toContain('counting-exponential');
    expect(all['counting-exponential'].map((e) => e.displayName)).toEqual(['Counter']);
    expect(all['counting-incremental']).toEqual([]);
    // The counting run does not appear on any solo:<count> board.
    const soloKeys = Object.keys(all).filter((k) => k.startsWith('solo:'));
    for (const k of soloKeys) {
      expect(all[k].every((e) => e.displayName !== 'Counter')).toBe(true);
    }
  });
});
