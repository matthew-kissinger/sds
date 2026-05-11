// Cycle 12 Phase 6 + Cycle 35 Phase 4: pure-helper coverage for the
// leaderboard worker.
//   - isValidGameMode rejects unknown strings (was a 500 D1_ERROR pre-fix).
//   - getLeaderboard always queries the partitioned slow path (the scene-
//     blind materialized fast path + isNaturalPartition fallback were
//     dropped in Cycle 35 Phase 4 — Field, Sheep Dog Island, and Open
//     Country are different games).
//
// Unit tests over exported functions in worker/src/d1.ts. The db-touching
// helpers are integration-tested separately (tests/integration/) against
// a running worker.

import { describe, expect, test } from 'vitest';
import {
  isValidGameMode,
  getLeaderboard,
  ALL_GAME_MODES,
} from '../worker/src/d1';

describe('isValidGameMode', () => {
  test('accepts every known mode', () => {
    for (const m of ALL_GAME_MODES) {
      expect(isValidGameMode(m)).toBe(true);
    }
  });

  test.each([
    'bogus',
    '',
    'soloclassic', // wrong casing
    'SoloClassic',
    'soloClassic ', // trailing space
    'soloClassic2026',
  ])('rejects %j', (input) => {
    expect(isValidGameMode(input)).toBe(false);
  });

  test('rejects non-strings', () => {
    expect(isValidGameMode(undefined)).toBe(false);
    expect(isValidGameMode(null)).toBe(false);
    expect(isValidGameMode(42)).toBe(false);
    expect(isValidGameMode({})).toBe(false);
  });
});

// Mock D1: every `prepare(...).bind(...).all()` returns the configured
// row set. We track which SQL ran so we can assert the partitioned path
// is used and the fast path is gone.
function makeMockDb(opts: {
  rows?: any[];
}): { db: any; calls: { sql: string; binds: any[] }[] } {
  const calls: { sql: string; binds: any[] }[] = [];
  const db: any = {
    prepare(sql: string) {
      let bound: any[] = [];
      const stmt: any = {
        bind(...args: any[]) {
          bound = args;
          calls.push({ sql, binds: args });
          return stmt;
        },
        async all() {
          return { results: opts.rows ?? [] };
        },
      };
      return stmt;
    },
  };
  return { db, calls };
}

describe('getLeaderboard always uses the partitioned path (Cycle 35 Phase 4)', () => {
  test('soloClassic + scene=field with rows returns those rows', async () => {
    const { db, calls } = makeMockDb({
      rows: [{
        persistent_id: 'p2', display_name: 'slow', full_name: 'slow#0001',
        last_active: 1700000000000, best_score: 47.0,
      }],
    });
    const out = await getLeaderboard(db, 'soloClassic', 10, {
      sceneId: 'field', sheepCount: 200,
    });
    // Exactly one query against score_submissions, no fast-path fallback.
    expect(calls).toHaveLength(1);
    expect(/score_submissions/i.test(calls[0].sql)).toBe(true);
    expect(/SELECT \* FROM players/i.test(calls[0].sql)).toBe(false);
    expect(out).toHaveLength(1);
    expect(out[0].displayName).toBe('slow');
    expect(out[0].score).toBe(47.0);
  });

  test('soloClassic + scene=open-country with no rows returns empty (no fallback)', async () => {
    const { db, calls } = makeMockDb({ rows: [] });
    const out = await getLeaderboard(db, 'soloClassic', 10, {
      sceneId: 'open-country',
    });
    // The partitioned query runs exactly once, then we surface the empty
    // result truthfully instead of falling back to a cross-scene mash-up.
    expect(calls).toHaveLength(1);
    expect(/score_submissions/i.test(calls[0].sql)).toBe(true);
    expect(out).toEqual([]);
  });

  test('soloClassic + scene=rolling-hills with no rows returns empty', async () => {
    const { db, calls } = makeMockDb({ rows: [] });
    const out = await getLeaderboard(db, 'soloClassic', 10, {
      sceneId: 'rolling-hills',
    });
    expect(calls).toHaveLength(1);
    expect(out).toEqual([]);
  });

  test('competitive + scene=field with no rows returns empty', async () => {
    const { db, calls } = makeMockDb({ rows: [] });
    const out = await getLeaderboard(db, 'competitive', 10, {
      sceneId: 'field', sheepCount: 200,
    });
    expect(calls).toHaveLength(1);
    expect(out).toEqual([]);
  });

  test('time-mode partitioned query orders ASC (lower score = better time)', async () => {
    const { db, calls } = makeMockDb({ rows: [] });
    await getLeaderboard(db, 'soloClassic', 10, { sceneId: 'field' });
    expect(/ORDER BY best_score ASC/i.test(calls[0].sql)).toBe(true);
  });

  test('competitive partitioned query orders DESC (higher wins = better)', async () => {
    const { db, calls } = makeMockDb({ rows: [] });
    await getLeaderboard(db, 'competitive', 10, { sceneId: 'field' });
    expect(/ORDER BY best_score DESC/i.test(calls[0].sql)).toBe(true);
  });
});

// Phase 4 also drops isNaturalPartition entirely. This guard test makes
// the regression loud: if someone re-exports it later we should think
// twice.
describe('Phase 4 invariants', () => {
  test('isNaturalPartition is no longer exported from worker/src/d1', async () => {
    const mod = await import('../worker/src/d1');
    expect((mod as any).isNaturalPartition).toBeUndefined();
  });
});
