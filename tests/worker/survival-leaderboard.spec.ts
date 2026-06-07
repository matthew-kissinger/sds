// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Cycle 66 P6 - Newsheepdogland survival leaderboard against a real SQLite engine.
//
// Survival sits beside the counting path: the peak flock size is the score
// (higher better, ranked descending), the board partitions by (game_mode,
// scene_id) and ignores sheep_count, and there is NO D1 migration - rows live in
// the existing score_submissions.score column under the 'survival' game_mode,
// with no materialized players-row column. These tests run the production submit
// + read functions against the committed migrations to prove store->read for real.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestD1, sqliteAvailable, type TestD1 } from './helpers/d1-sqlite';
import {
  registerPlayer,
  submitScore,
  getLeaderboard,
  getAllLeaderboards,
} from '../../worker/src/d1';

// Mirror the additionalData initWorld.js sends on a survival death: mode
// 'survival', the island scene id, and the peak flock as sheepCount (unused for
// the partition, the score carries it). Survival is not a time mode, so no
// duration floor applies.
function survivalPayload(over: Record<string, unknown> = {}) {
  return {
    gameMode: 'survival',
    sceneId: 'newsheepdogland',
    sheepCount: 25,
    day: 4,
    ...over,
  };
}

describe.skipIf(!sqliteAvailable)('Survival leaderboard (Cycle 66 P6)', () => {
  let h: TestD1;
  beforeEach(() => { h = createTestD1(); });
  afterEach(() => { h.close(); });

  async function reg(name: string, id: string) {
    await registerPlayer(h.db, id, name, 'custom');
    return id;
  }

  it('stores a survival submission in score_submissions with no materialized column (no migration)', async () => {
    const id = await reg('Survivor', 'pid-s1');
    const res = await submitScore(h.db, id, 'survival', 35, survivalPayload({ sheepCount: 35 }));
    // No materialized best column for survival -> updated stays false.
    expect(res.updated).toBe(false);

    const rows = h.query<{ game_mode: string; score: number; scene_id: string }>(
      'SELECT game_mode, score, scene_id FROM score_submissions WHERE persistent_id = ?',
      id,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].game_mode).toBe('survival');
    expect(rows[0].score).toBe(35);
    expect(rows[0].scene_id).toBe('newsheepdogland');
  });

  it('ranks the survival board by peak flock descending', async () => {
    const a = await reg('Small', 'pid-a');
    const b = await reg('Big', 'pid-b');
    const c = await reg('Mid', 'pid-c');
    await submitScore(h.db, a, 'survival', 15, survivalPayload({ sheepCount: 15 }));
    await submitScore(h.db, b, 'survival', 95, survivalPayload({ sheepCount: 95 }));
    await submitScore(h.db, c, 'survival', 40, survivalPayload({ sheepCount: 40 }));

    const board = await getLeaderboard(h.db, 'survival', 10, { sceneId: 'newsheepdogland' });
    expect(board.map((e) => e.displayName)).toEqual(['Big', 'Mid', 'Small']);
    expect(board.map((e) => e.score)).toEqual([95, 40, 15]);
    expect(board[0].rank).toBe(1);
    expect(board[0].formattedScore).toBe('95 sheep');
  });

  it('takes a player\'s best (max) peak across runs', async () => {
    const id = await reg('Repeat', 'pid-rep');
    await submitScore(h.db, id, 'survival', 20, survivalPayload({ sheepCount: 20 }));
    await submitScore(h.db, id, 'survival', 60, survivalPayload({ sheepCount: 60 }));
    await submitScore(h.db, id, 'survival', 45, survivalPayload({ sheepCount: 45 }));
    const board = await getLeaderboard(h.db, 'survival', 10, { sceneId: 'newsheepdogland' });
    expect(board).toHaveLength(1);
    expect(board[0].score).toBe(60);
  });

  it('ignores sheep_count when partitioning the survival board', async () => {
    const a = await reg('A', 'pid-sa');
    const b = await reg('B', 'pid-sb');
    await submitScore(h.db, a, 'survival', 50, survivalPayload({ sheepCount: 50 }));
    await submitScore(h.db, b, 'survival', 30, survivalPayload({ sheepCount: 30 }));
    // A sheepCount filter must NOT narrow a survival board.
    const filtered = await getLeaderboard(h.db, 'survival', 10, { sceneId: 'newsheepdogland', sheepCount: 50 });
    expect(filtered.map((e) => e.displayName)).toEqual(['A', 'B']);
  });

  it('hard-rejects an out-of-bounds survival score', async () => {
    const id = await reg('OOB', 'pid-soob');
    await expect(submitScore(h.db, id, 'survival', -1, survivalPayload({ sheepCount: 0 }))).rejects.toThrow(/out of bounds/);
    await expect(submitScore(h.db, id, 'survival', 1_000_000, survivalPayload())).rejects.toThrow(/out of bounds/);
    const rows = h.query('SELECT 1 FROM score_submissions WHERE persistent_id = ?', id);
    expect(rows).toHaveLength(0);
  });

  it('emits a survival board from getAllLeaderboards and does not leak into solo boards', async () => {
    const survivor = await reg('Survivor', 'pid-surv');
    await submitScore(h.db, survivor, 'survival', 70, survivalPayload({ sheepCount: 70 }));

    const all = await getAllLeaderboards(h.db, 10, { sceneId: 'newsheepdogland' });
    expect(Object.keys(all)).toContain('survival');
    expect(all['survival'].map((e) => e.displayName)).toEqual(['Survivor']);
    const soloKeys = Object.keys(all).filter((k) => k.startsWith('solo:'));
    for (const k of soloKeys) {
      expect(all[k].every((e) => e.displayName !== 'Survivor')).toBe(true);
    }
  });

  // Cycle 67 P7: co-op survival partitions by party_size.
  it('partitions co-op survival (party_size) separately from solo', async () => {
    const solo = await reg('SoloPlayer', 'pid-solo7');
    const coop = await reg('CoopPlayer', 'pid-coop7');
    await submitScore(h.db, solo, 'survival', 30, survivalPayload({ sheepCount: 30 })); // party 1 (default)
    await submitScore(h.db, coop, 'survival', 80, survivalPayload({ sheepCount: 80, partySize: 2 }));
    const soloBoard = await getLeaderboard(h.db, 'survival', 10, { sceneId: 'newsheepdogland', partySize: 1 });
    expect(soloBoard.map((e) => e.displayName)).toEqual(['SoloPlayer']);
    const coopBoard = await getLeaderboard(h.db, 'survival', 10, { sceneId: 'newsheepdogland', partySize: 2 });
    expect(coopBoard.map((e) => e.displayName)).toEqual(['CoopPlayer']);
  });

  it('emits solo + co-op survival board keys from getAllLeaderboards without cross-leak', async () => {
    const solo = await reg('Solo', 'pid-a7');
    const coop = await reg('Coop', 'pid-b7');
    await submitScore(h.db, solo, 'survival', 25, survivalPayload({ sheepCount: 25 }));
    await submitScore(h.db, coop, 'survival', 75, survivalPayload({ sheepCount: 75, partySize: 3 }));
    const all = await getAllLeaderboards(h.db, 10, { sceneId: 'newsheepdogland' });
    expect(Object.keys(all)).toContain('survival');
    expect(Object.keys(all)).toContain('survival:3');
    expect(all['survival'].map((e) => e.displayName)).toEqual(['Solo']);
    expect(all['survival:3'].map((e) => e.displayName)).toEqual(['Coop']);
    expect(all['survival:2']).toEqual([]); // no party-2 runs
  });

  it('defaults a survival submission with no partySize to party 1 (the solo board)', async () => {
    const id = await reg('Defaulter', 'pid-def7');
    await submitScore(h.db, id, 'survival', 40, survivalPayload({ sheepCount: 40 }));
    const rows = h.query<{ party_size: number }>(
      'SELECT party_size FROM score_submissions WHERE persistent_id = ?',
      id,
    );
    expect(rows[0].party_size).toBe(1);
  });
});
