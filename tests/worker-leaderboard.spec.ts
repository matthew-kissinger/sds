// Cycle 12 Phase 6: pure-helper coverage for the leaderboard worker fixes.
//   - isValidGameMode rejects unknown strings (was a 500 D1_ERROR pre-fix).
//   - isNaturalPartition decides when an empty slow-path query is allowed
//     to fall through to the fast path so pre-Cycle-8 entries stay visible.
//
// These are unit tests over exported functions in worker/src/d1.ts. The
// db-touching helpers are integration-tested separately (tests/integration/)
// against a running worker.

import { describe, expect, test } from 'vitest';
import {
  isValidGameMode,
  isNaturalPartition,
  getLeaderboard,
  ALL_GAME_MODES,
  type GameMode,
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

describe('isNaturalPartition', () => {
  test('soloClassic + (field, 200) is natural', () => {
    expect(isNaturalPartition('soloClassic', { sceneId: 'field', sheepCount: 200 })).toBe(true);
  });

  test('soloClassic + no filters is natural (empty filters fall through)', () => {
    expect(isNaturalPartition('soloClassic', {})).toBe(true);
  });

  test('soloClassic + scene=any is natural (any === unfiltered)', () => {
    expect(isNaturalPartition('soloClassic', { sceneId: 'any' })).toBe(true);
  });

  test('soloClassic + non-matching scene is NOT natural', () => {
    expect(isNaturalPartition('soloClassic', { sceneId: 'rolling-hills' })).toBe(false);
  });

  test('soloClassic + non-matching sheepCount is NOT natural', () => {
    expect(isNaturalPartition('soloClassic', { sheepCount: 250 })).toBe(false);
  });

  test('soloExtreme natural is (field, 1000)', () => {
    expect(isNaturalPartition('soloExtreme', { sceneId: 'field', sheepCount: 1000 })).toBe(true);
    expect(isNaturalPartition('soloExtreme', { sceneId: 'field', sheepCount: 200 })).toBe(false);
  });

  test('soloInsane natural is (field, 3000)', () => {
    expect(isNaturalPartition('soloInsane', { sheepCount: 3000 })).toBe(true);
    expect(isNaturalPartition('soloInsane', { sheepCount: 200 })).toBe(false);
  });

  test('soloChaos natural is (field, 5000)', () => {
    expect(isNaturalPartition('soloChaos', { sheepCount: 5000 })).toBe(true);
    expect(isNaturalPartition('soloChaos', { sheepCount: 200 })).toBe(false);
  });

  test('timed natural is (field, 200)', () => {
    expect(isNaturalPartition('timed', { sceneId: 'field', sheepCount: 200 })).toBe(true);
  });

  test('competitive has NO natural partition (every filter is meaningful)', () => {
    expect(isNaturalPartition('competitive', {})).toBe(false);
    expect(isNaturalPartition('competitive', { sceneId: 'field', sheepCount: 200 })).toBe(false);
  });

  test('cooperative has NO natural partition', () => {
    expect(isNaturalPartition('cooperative', {})).toBe(false);
    expect(isNaturalPartition('cooperative', { sheepCount: 1000 })).toBe(false);
  });

  test('matrix: every solo+timed mode at its natural pair is natural', () => {
    const pairs: Array<[GameMode, number]> = [
      ['soloClassic', 200],
      ['soloExtreme', 1000],
      ['soloInsane', 3000],
      ['soloChaos', 5000],
      ['timed', 200],
    ];
    for (const [mode, count] of pairs) {
      expect(isNaturalPartition(mode, { sceneId: 'field', sheepCount: count })).toBe(true);
      expect(isNaturalPartition(mode, { sceneId: 'rolling-hills', sheepCount: count })).toBe(false);
    }
  });
});

// Slow-path -> fast-path fallback. Pre-Cycle-8 entries materialize on
// `players.solo_classic_best` but have no row in `score_submissions`; the
// partitioned slow-path query against (mode, scene, sheep_count) returns
// empty even when the requested partition matches the mode's natural one.
// Cycle 12 Phase 6 falls through to the fast path in exactly that case.
//
// Mock D1: `players.*` queries return a row; `score_submissions` joins
// return no rows. We assert the function recovers and returns the
// materialized row instead of [].
function makeMockDb(opts: {
  fastPathRow?: any;
  slowPathRow?: any;
}): { db: any; fastCalls: any[]; slowCalls: any[] } {
  const fastCalls: any[] = [];
  const slowCalls: any[] = [];
  const db = {
    prepare(sql: string) {
      const isSlowPath = /score_submissions/i.test(sql);
      const target = isSlowPath ? slowCalls : fastCalls;
      let bound: any[] = [];
      const result = isSlowPath
        ? (opts.slowPathRow ? [opts.slowPathRow] : [])
        : (opts.fastPathRow ? [opts.fastPathRow] : []);
      const stmt: any = {
        bind(...args: any[]) {
          bound = args;
          target.push({ sql, binds: args });
          return stmt;
        },
        async all() {
          return { results: result };
        },
      };
      return stmt;
    },
  };
  return { db, fastCalls, slowCalls };
}

describe('getLeaderboard slow-path -> fast-path fallback', () => {
  test('soloClassic with no filters takes fast path directly', async () => {
    const { db, fastCalls, slowCalls } = makeMockDb({
      fastPathRow: {
        persistent_id: 'p1', display_name: 'dev', full_name: 'dev#0001',
        last_active: 1700000000000, solo_classic_best: 56.5,
      },
    });
    const out = await getLeaderboard(db, 'soloClassic', 10, {});
    expect(slowCalls).toHaveLength(0);
    expect(fastCalls).toHaveLength(1);
    expect(out).toHaveLength(1);
    expect(out[0].displayName).toBe('dev');
    expect(out[0].score).toBe(56.5);
  });

  test('soloClassic + scene=field + sheepCount=200 falls through when score_submissions is empty', async () => {
    const { db, fastCalls, slowCalls } = makeMockDb({
      fastPathRow: {
        persistent_id: 'p1', display_name: 'dev', full_name: 'dev#0001',
        last_active: 1700000000000, solo_classic_best: 56.5,
      },
      // slowPathRow undefined -> empty results from score_submissions join
    });
    const out = await getLeaderboard(db, 'soloClassic', 10, {
      sceneId: 'field', sheepCount: 200,
    });
    // Slow path tried first, then fast path on fallback.
    expect(slowCalls).toHaveLength(1);
    expect(fastCalls).toHaveLength(1);
    expect(out).toHaveLength(1);
    expect(out[0].displayName).toBe('dev');
  });

  test('soloClassic + non-natural scene does NOT fall through (returns empty)', async () => {
    const { db, fastCalls, slowCalls } = makeMockDb({
      fastPathRow: {
        persistent_id: 'p1', display_name: 'dev', full_name: 'dev#0001',
        last_active: 1700000000000, solo_classic_best: 56.5,
      },
      // empty slow path
    });
    const out = await getLeaderboard(db, 'soloClassic', 10, {
      sceneId: 'rolling-hills',
    });
    expect(slowCalls).toHaveLength(1);
    // No fall-through because rolling-hills is not the natural partition.
    expect(fastCalls).toHaveLength(0);
    expect(out).toEqual([]);
  });

  test('competitive + scene filter does NOT fall through (no natural partition)', async () => {
    const { db, fastCalls, slowCalls } = makeMockDb({
      fastPathRow: {
        persistent_id: 'p1', display_name: 'comp', full_name: 'comp#0001',
        last_active: 1700000000000, competitive_wins: 5,
      },
      // empty slow path
    });
    const out = await getLeaderboard(db, 'competitive', 10, {
      sceneId: 'field', sheepCount: 200,
    });
    expect(slowCalls).toHaveLength(1);
    expect(fastCalls).toHaveLength(0);
    expect(out).toEqual([]);
  });

  test('partitioned query with rows returns slow-path results without fallback', async () => {
    const { db, fastCalls, slowCalls } = makeMockDb({
      fastPathRow: {
        persistent_id: 'p1', display_name: 'fast', full_name: 'fast#0001',
        last_active: 1700000000000, solo_classic_best: 999,
      },
      slowPathRow: {
        persistent_id: 'p2', display_name: 'slow', full_name: 'slow#0001',
        last_active: 1700000000000, best_score: 47.0,
      },
    });
    const out = await getLeaderboard(db, 'soloClassic', 10, {
      sceneId: 'field', sheepCount: 200,
    });
    expect(slowCalls).toHaveLength(1);
    expect(fastCalls).toHaveLength(0);
    expect(out).toHaveLength(1);
    expect(out[0].displayName).toBe('slow');
    expect(out[0].score).toBe(47.0);
  });
});
