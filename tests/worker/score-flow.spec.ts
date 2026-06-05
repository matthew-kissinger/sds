// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Cycle 57 P8 — end-to-end "mock a win" scenario against a real SQLite engine.
//
// This is the test that would have caught the incident. A real 12-minute
// soloClassic run on Sheep Dog Island recorded a score row but never showed on
// the leaderboard: the anti-cheat compared the pause-subtracted score against a
// raw (pause-inclusive) wall-clock window, false-flagged client_clock_skew, and
// the board's `score_anomalies IS NULL` read filter hid the row. None of the
// pre-existing worker specs caught it because they mocked D1 with canned rows —
// the SQL filter that does the hiding never ran.
//
// Here the actual production functions (registerPlayer → submitScore →
// getLeaderboard → renamePlayer) run against the REAL committed migrations on an
// in-memory SQLite DB (node:sqlite). The submit payload mirrors what
// js/gamestate/completion.js sends. Each test builds its own world so the
// scenario is isolated and repeatable.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestD1, sqliteAvailable, type TestD1 } from './helpers/d1-sqlite';
import {
  registerPlayer,
  submitScore,
  getLeaderboard,
  renamePlayer,
} from '../../worker/src/d1';

// The incident shape: a ~12.9-minute wall-clock window containing 14s of pause,
// so the active (pause-subtracted) play time is 759s == the claimed score.
const INCIDENT_START = 1_700_000_000_000;
const INCIDENT_WINDOW_MS = 773_000; // 759s active + 14s paused
const INCIDENT_SCORE = 759;

/**
 * Mirror the `additionalData` object js/gamestate/completion.js builds for
 * `window.submitGameScore(leaderboardMode, score, additionalData)`. Overridable
 * per test. `pausedMs: null` models a pre-Cycle-57 client that omits the field.
 */
function winPayload(over: Record<string, unknown> = {}) {
  const startedAt = INCIDENT_START;
  const finishedAt = startedAt + INCIDENT_WINDOW_MS;
  const base: Record<string, unknown> = {
    gameMode: 'solo',
    singlePlayerMode: 'classic',
    sceneId: 'rolling-hills',
    sheepCount: 200,
    totalSheep: 200,
    timestamp: finishedAt,
    clientStartedAt: startedAt,
    clientFinishedAt: finishedAt,
    pausedMs: 14_000,
    ...over,
  };
  // A null pausedMs means "field absent on the wire" — strip it so the worker
  // sees the pre-Cycle-57 shape (typeof additionalData.pausedMs !== 'number').
  if (base.pausedMs === null) delete base.pausedMs;
  return base;
}

describe.skipIf(!sqliteAvailable)('score flow — mock a win end-to-end (Cycle 57 P8)', () => {
  let h: TestD1;
  beforeEach(() => {
    h = createTestD1();
  });
  afterEach(() => {
    h.close();
  });

  async function registerShepherd(name = 'Shepherd', id = 'pid-shepherd') {
    const res = await registerPlayer(h.db, id, name, 'custom');
    return { id, ...res };
  }

  it('records a paused win and shows it on the leaderboard (the incident, fixed)', async () => {
    const { id } = await registerShepherd();

    const result = await submitScore(h.db, id, 'soloClassic', INCIDENT_SCORE, winPayload());
    expect(result.isNewRecord).toBe(true);

    // Stored row carries no anomaly — the pause was credited.
    const rows = h.query<{ score: number; score_anomalies: string | null }>(
      'SELECT score, score_anomalies FROM score_submissions WHERE persistent_id = ?',
      id,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(INCIDENT_SCORE);
    expect(rows[0].score_anomalies).toBeNull();

    // The public board shows the run.
    const board = await getLeaderboard(h.db, 'soloClassic', 10, {
      sceneId: 'rolling-hills',
      sheepCount: 200,
    });
    expect(board).toHaveLength(1);
    expect(board[0].displayName).toBe('Shepherd');
    expect(board[0].fullName).toBe('Shepherd#0001');
    expect(board[0].score).toBe(INCIDENT_SCORE);
    expect(board[0].rank).toBe(1);
  });

  it('hides a forged fast run with padded pause from the public board, but admin can still see it', async () => {
    const honest = await registerShepherd('Shepherd', 'pid-honest');
    await submitScore(h.db, honest.id, 'soloClassic', INCIDENT_SCORE, winPayload());

    // Cheater claims a 40s finish but the wall-clock window is 600s, padded
    // with 580s of "pause" (>80% of the window → zero credit). The active
    // window is still 600s vs the 40s claim → client_clock_skew flagged.
    const cheaterId = 'pid-cheater';
    await registerPlayer(h.db, cheaterId, 'Cheater', 'custom');
    await submitScore(
      h.db,
      cheaterId,
      'soloClassic',
      40,
      winPayload({
        clientStartedAt: INCIDENT_START,
        clientFinishedAt: INCIDENT_START + 600_000,
        pausedMs: 580_000,
      }),
    );

    // The forged row is stored AND flagged.
    const cheatRows = h.query<{ score_anomalies: string | null }>(
      'SELECT score_anomalies FROM score_submissions WHERE persistent_id = ?',
      cheaterId,
    );
    expect(cheatRows[0].score_anomalies).toContain('client_clock_skew');

    // Public board: the cheater's "better" 40s is hidden; only the honest run shows.
    const publicBoard = await getLeaderboard(h.db, 'soloClassic', 10, {
      sceneId: 'rolling-hills',
      sheepCount: 200,
    });
    expect(publicBoard.map((e) => e.displayName)).toEqual(['Shepherd']);

    // Admin read (includeFlagged) reveals the flagged row, ranked first by its
    // forged time — proving the filter is what hides it, not a storage failure.
    const adminBoard = await getLeaderboard(h.db, 'soloClassic', 10, {
      sceneId: 'rolling-hills',
      sheepCount: 200,
      includeFlagged: true,
    });
    expect(adminBoard.map((e) => e.displayName)).toEqual(['Cheater', 'Shepherd']);
  });

  it('does not re-break a pre-Cycle-57 client that omits pausedMs', async () => {
    const { id } = await registerShepherd('OldClient', 'pid-old');

    // Same diverging incident window, but the field is absent on the wire.
    // The skew check is skipped rather than run against the raw window, so the
    // run is NOT false-flagged.
    await submitScore(
      h.db,
      id,
      'soloClassic',
      INCIDENT_SCORE,
      winPayload({ pausedMs: null }),
    );

    const rows = h.query<{ score_anomalies: string | null }>(
      'SELECT score_anomalies FROM score_submissions WHERE persistent_id = ?',
      id,
    );
    expect(rows[0].score_anomalies).toBeNull();

    const board = await getLeaderboard(h.db, 'soloClassic', 10, {
      sceneId: 'rolling-hills',
      sheepCount: 200,
    });
    expect(board.map((e) => e.displayName)).toEqual(['OldClient']);
  });

  it('keeps the better run and reflects a Settings rename on the board', async () => {
    const { id } = await registerShepherd();

    // Two runs: the slower one first, then a personal best. Time mode keeps MIN.
    await submitScore(h.db, id, 'soloClassic', INCIDENT_SCORE, winPayload());
    const better = await submitScore(
      h.db,
      id,
      'soloClassic',
      612,
      winPayload({
        clientStartedAt: INCIDENT_START,
        clientFinishedAt: INCIDENT_START + 612_000,
        pausedMs: 0,
      }),
    );
    expect(better.isNewRecord).toBe(true);

    let board = await getLeaderboard(h.db, 'soloClassic', 10, {
      sceneId: 'rolling-hills',
      sheepCount: 200,
    });
    expect(board).toHaveLength(1);
    expect(board[0].score).toBe(612); // MIN of {759, 612}
    expect(board[0].displayName).toBe('Shepherd');

    // The player sets a new name in Settings (Cycle 57 P5). It must propagate
    // to the board via the players JOIN.
    const renamed = await renamePlayer(h.db, id, 'BorderColliePro');
    expect(renamed.display_name).toBe('BorderColliePro');
    expect(renamed.full_name).toBe('BorderColliePro#0001');

    board = await getLeaderboard(h.db, 'soloClassic', 10, {
      sceneId: 'rolling-hills',
      sheepCount: 200,
    });
    expect(board).toHaveLength(1);
    expect(board[0].displayName).toBe('BorderColliePro');
    expect(board[0].fullName).toBe('BorderColliePro#0001');
    expect(board[0].score).toBe(612); // score history preserved across rename
  });

  it('partitions by scene — a pasture run does not leak onto the island board', async () => {
    const { id } = await registerShepherd();
    // Win on Home Field (pasture), not Sheep Dog Island.
    await submitScore(
      h.db,
      id,
      'soloClassic',
      INCIDENT_SCORE,
      winPayload({ sceneId: 'field' }),
    );

    const island = await getLeaderboard(h.db, 'soloClassic', 10, {
      sceneId: 'rolling-hills',
      sheepCount: 200,
    });
    expect(island).toEqual([]);

    const pasture = await getLeaderboard(h.db, 'soloClassic', 10, {
      sceneId: 'field',
      sheepCount: 200,
    });
    expect(pasture.map((e) => e.displayName)).toEqual(['Shepherd']);
  });
});
