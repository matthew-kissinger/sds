// Cycle 35 Phase 2: score_errors observability path. Verifies that every
// throw from submitScore lands a row in score_errors before re-throwing.
// Three failure modes covered: validation reject (bounds), sheep-count
// mismatch, and "player not found".
//
// Pattern mirrors tests/worker-leaderboard.spec.ts: mock D1 with a
// `.prepare(...).bind(...).run()/.first()/.all()` chain and assert which
// SQL statements the function reached for.

import { describe, expect, test } from 'vitest';
import { submitScore, type GameMode } from '../worker/src/d1';

interface MockCall {
  sql: string;
  binds: any[];
}

function makeMockDb(opts: {
  player?: any;            // returned by getPlayer (.first())
  insertThrows?: boolean;  // if true, the score_errors INSERT itself rejects
}): { db: any; calls: MockCall[] } {
  const calls: MockCall[] = [];
  const db: any = {
    prepare(sql: string) {
      const isPlayerSelect = /SELECT \* FROM players/i.test(sql);
      const isScoreErrorsInsert = /INSERT INTO score_errors/i.test(sql);
      let bound: any[] = [];
      const stmt: any = {
        bind(...args: any[]) {
          bound = args;
          calls.push({ sql, binds: args });
          return stmt;
        },
        async first() {
          if (isPlayerSelect) return opts.player ?? null;
          return null;
        },
        async run() {
          if (isScoreErrorsInsert && opts.insertThrows) {
            throw new Error('D1 unavailable');
          }
          return { success: true };
        },
        async all() {
          return { results: [] };
        },
      };
      return stmt;
    },
    async batch(stmts: any[]) {
      // Not exercised by these specs (all reject before reaching the batch).
      void stmts;
      return [];
    },
  };
  return { db, calls };
}

describe('submitScore observability (Cycle 35 Phase 2)', () => {
  test('player-not-found logs to score_errors and re-throws', async () => {
    const { db, calls } = makeMockDb({ player: null });
    await expect(
      submitScore(db, 'unknown_pid', 'soloClassic' as GameMode, 90, { sceneId: 'field', sheepCount: 200 }),
    ).rejects.toThrow(/player not found/i);
    const inserts = calls.filter(c => /INSERT INTO score_errors/i.test(c.sql));
    expect(inserts).toHaveLength(1);
    const [pid, mode, scoreVal, sheep, scene, reason] = inserts[0].binds;
    expect(pid).toBe('unknown_pid');
    expect(mode).toBe('soloClassic');
    expect(scoreVal).toBe(90);
    expect(sheep).toBe(200);
    expect(scene).toBe('field');
    expect(String(reason).toLowerCase()).toContain('player not found');
  });

  test('out-of-bounds score logs to score_errors and re-throws', async () => {
    const { db, calls } = makeMockDb({
      player: {
        persistent_id: 'p1', display_name: 'dev', full_name: 'dev#0001',
        last_active: 1700000000000, solo_classic_best: null,
        solo_extreme_best: null, solo_insane_best: null, solo_chaos_best: null,
        timed_best: null, competitive_wins: 0, cooperative_best: null,
      },
    });
    // soloClassic bounds reject — score wildly out of range (negative).
    await expect(
      submitScore(db, 'p1', 'soloClassic' as GameMode, -5, { sceneId: 'field', sheepCount: 200 }),
    ).rejects.toThrow(/out of bounds/i);
    const inserts = calls.filter(c => /INSERT INTO score_errors/i.test(c.sql));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].binds[1]).toBe('soloClassic');
    expect(inserts[0].binds[2]).toBe(-5);
    expect(String(inserts[0].binds[5]).toLowerCase()).toContain('out of bounds');
  });

  test('sheep_count mismatch for mode logs to score_errors and re-throws', async () => {
    const { db, calls } = makeMockDb({
      player: {
        persistent_id: 'p1', display_name: 'dev', full_name: 'dev#0001',
        last_active: 1700000000000, solo_classic_best: null,
        solo_extreme_best: null, solo_insane_best: null, solo_chaos_best: null,
        timed_best: null, competitive_wins: 0, cooperative_best: null,
      },
    });
    // soloClassic with 5000 sheep is rejected by modeSheepCountOk.
    await expect(
      submitScore(db, 'p1', 'soloClassic' as GameMode, 120, { sceneId: 'field', sheepCount: 5000 }),
    ).rejects.toThrow(/sheep_count.*not allowed/i);
    const inserts = calls.filter(c => /INSERT INTO score_errors/i.test(c.sql));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].binds[3]).toBe(5000);
    expect(String(inserts[0].binds[5]).toLowerCase()).toContain('not allowed');
  });

  test('failure of the score_errors INSERT itself does not double-throw (hard stop #2)', async () => {
    const { db, calls } = makeMockDb({ player: null, insertThrows: true });
    // The original error must still propagate even if observability fails.
    await expect(
      submitScore(db, 'whoever', 'soloClassic' as GameMode, 90, {}),
    ).rejects.toThrow(/player not found/i);
    // The INSERT was attempted exactly once.
    expect(calls.filter(c => /INSERT INTO score_errors/i.test(c.sql))).toHaveLength(1);
  });
});
