/**
 * P-SEC-5: leaderboard score authority.
 *
 * Closes three holes on the score surface:
 *
 *   1. The public POST /api/score must refuse 'competitive' and 'timed' —
 *      those are multiplayer outcomes written ONLY by RoomDO.onSubmitScores
 *      after a DO-validated match. A client posting them is forging a result.
 *   2. The public leaderboard READ hides anomaly-flagged rows by default
 *      (score_anomalies IS NOT NULL), so a forged-but-bounds-passing time
 *      that tripped a heuristic never displays.
 *   3. A 'daily-YYYY-MM-DD' submission claims a date partition AND a sheep
 *      count, both forgeable on the wire. The server re-derives the canonical
 *      sheep count for the claimed UTC date (same FNV-1a seed the client uses)
 *      and rejects a stale/future partition or a mismatched count.
 *
 *   Plus a per-persistent_id submission rate limit on the score route.
 *
 * The route-level tests drive the worker's default `fetch` export with a fake
 * Env + a stateful fake D1 in the spirit of tests/worker/auth-register.spec.ts
 * and tests/worker/dos-caps.spec.ts. A valid session token is minted with the
 * real signJwt against the fake Env's JWT_SECRET.
 */
import { describe, it, expect } from 'vitest';
import worker from '../../worker/src/index.ts';
import {
  getLeaderboard,
  getAllLeaderboards,
  validateDailySubmission,
  dailySheepCountForDate,
  dailyFnv1a,
  utcDateKey,
  type PlayerRow,
} from '../../worker/src/d1.ts';
import { signJwt } from '../../worker/src/jwt.ts';
// Tests may import from js/ — only worker SOURCE is fenced from js/, not the
// test tree. We pin the worker's duplicated daily formula against the client's.
import { dailySeedFor, dailyKey } from '../../js/utils/dailySeed.js';

// ---- fake D1 ----------------------------------------------------------------

interface SubmissionRow {
  persistent_id: string;
  game_mode: string;
  score: number;
  sheep_count: number;
  scene_id: string;
  score_anomalies: string | null;
}

function basePlayer(pid: string, overrides: Partial<PlayerRow> = {}): PlayerRow {
  return {
    persistent_id: pid,
    display_name: 'Tester',
    discriminator: '0001',
    full_name: 'Tester#0001',
    created_at: 1_600_000_000_000,
    last_active: 1_600_000_000_000,
    solo_classic_best: null,
    solo_extreme_best: null,
    solo_insane_best: null,
    solo_chaos_best: null,
    timed_best: null,
    competitive_wins: 0,
    cooperative_best: null,
    auth_secret_hash: 'deadbeef',
    auth_bound_at: 1_600_000_000_000,
    ...overrides,
  };
}

// Records every prepared SQL + bind so route tests can assert on writes, and
// answers the SELECT/JOIN reads getLeaderboard + submitScoreInner perform.
function makeFakeDb(opts: {
  players?: PlayerRow[];
  submissions?: SubmissionRow[];
} = {}) {
  const players = new Map<string, PlayerRow>();
  for (const p of opts.players ?? []) players.set(p.persistent_id, { ...p });
  const submissions = [...(opts.submissions ?? [])];
  const calls: { sql: string; binds: unknown[] }[] = [];
  const scoreErrorInserts: unknown[][] = [];

  const db: any = {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const stmt: any = {
        bind(...args: unknown[]) {
          binds = args;
          calls.push({ sql, binds: args });
          return stmt;
        },
        async first<T = any>(): Promise<T | null> {
          if (/SELECT \* FROM players WHERE persistent_id/i.test(sql)) {
            const row = players.get(binds[0] as string);
            return row ? ({ ...row } as unknown as T) : null;
          }
          return null;
        },
        async all<T = any>(): Promise<{ results: T[] }> {
          // getLeaderboard aggregate query against score_submissions. We honour
          // the score_anomalies IS NULL clause (the property under test) by
          // filtering the in-memory rows on the SQL's presence of that clause.
          if (/FROM score_submissions/i.test(sql)) {
            const excludeFlagged = /score_anomalies IS NULL/i.test(sql);
            const mode = binds[0] as string;
            const rows = submissions.filter(
              (s) => s.game_mode === mode && (!excludeFlagged || s.score_anomalies == null),
            );
            // Collapse to one row per player, surfacing the raw score as
            // best_score (ordering/aggregation specifics aren't under test here).
            const byPid = new Map<string, SubmissionRow>();
            for (const r of rows) if (!byPid.has(r.persistent_id)) byPid.set(r.persistent_id, r);
            const out = [...byPid.values()].map((r) => {
              const p = players.get(r.persistent_id) ?? basePlayer(r.persistent_id);
              return {
                persistent_id: r.persistent_id,
                display_name: p.display_name,
                full_name: p.full_name,
                last_active: p.last_active,
                best_score: r.score,
              };
            });
            return { results: out as unknown as T[] };
          }
          return { results: [] };
        },
        async run() {
          if (/INSERT INTO score_errors/i.test(sql)) scoreErrorInserts.push(binds);
          return { success: true };
        },
      };
      return stmt;
    },
    async batch(stmts: unknown[]) { void stmts; return []; },
    _players: players,
    _submissions: submissions,
    _calls: calls,
    _scoreErrorInserts: scoreErrorInserts,
  };
  return db;
}

// ---- fake Env + request helpers --------------------------------------------

const JWT_SECRET = 'test-secret-p-sec-5';

function makeEnv(db: any) {
  return { ROOM_DO: {}, LOBBY_DO: {}, DB: db, JWT_SECRET } as any;
}

const noopCtx = { waitUntil() {}, passThroughOnException() {} } as any;

async function postScore(
  db: any,
  token: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const req = new Request('https://worker.test/api/score', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, ...payload }),
  });
  return worker.fetch(req, makeEnv(db), noopCtx);
}

// ---- (1) public /api/score rejects multiplayer modes ------------------------

describe('P-SEC-5: public /api/score rejects competitive + timed', () => {
  it('rejects gameMode "competitive" with 403 and writes no score row', async () => {
    const pid = 'pid-comp-' + crypto.randomUUID();
    const db = makeFakeDb({ players: [basePlayer(pid)] });
    const token = await signJwt({ persistent_id: pid }, JWT_SECRET);

    const res = await postScore(db, token, { gameMode: 'competitive', score: 1 });
    expect(res.status).toBe(403);

    // Refused at the boundary: no players UPDATE / score_submissions INSERT ran.
    const wroteScore = db._calls.some(
      (c: any) => /UPDATE players SET competitive_wins/i.test(c.sql) || /INSERT INTO score_submissions/i.test(c.sql),
    );
    expect(wroteScore).toBe(false);
  });

  it('rejects gameMode "timed" with 403', async () => {
    const pid = 'pid-timed-' + crypto.randomUUID();
    const db = makeFakeDb({ players: [basePlayer(pid)] });
    const token = await signJwt({ persistent_id: pid }, JWT_SECRET);

    const res = await postScore(db, token, { gameMode: 'timed', score: 42 });
    expect(res.status).toBe(403);
  });

  it('still accepts a legitimate solo mode (soloClassic) with 200', async () => {
    const pid = 'pid-solo-' + crypto.randomUUID();
    const db = makeFakeDb({ players: [basePlayer(pid)] });
    const token = await signJwt({ persistent_id: pid }, JWT_SECRET);

    const res = await postScore(db, token, {
      gameMode: 'soloClassic',
      score: 60,
      additionalData: { sheepCount: 200, sceneId: 'field' },
    });
    expect(res.status).toBe(200);
    const json = await res.json<any>();
    expect(json.success).toBe(true);
  });
});

// ---- (2) leaderboard READ excludes anomaly-flagged rows ---------------------

describe('P-SEC-5: leaderboard read hides anomaly-flagged rows', () => {
  const cleanPid = 'pid-clean';
  const flaggedPid = 'pid-flagged';

  function seededDb() {
    return makeFakeDb({
      players: [
        basePlayer(cleanPid, { display_name: 'Clean', full_name: 'Clean#0001' }),
        basePlayer(flaggedPid, { display_name: 'Flagged', full_name: 'Flagged#0002' }),
      ],
      submissions: [
        { persistent_id: cleanPid, game_mode: 'soloClassic', score: 55, sheep_count: 200, scene_id: 'field', score_anomalies: null },
        { persistent_id: flaggedPid, game_mode: 'soloClassic', score: 31, sheep_count: 200, scene_id: 'field', score_anomalies: JSON.stringify([{ tag: 'fast_for_count' }]) },
      ],
    });
  }

  it('default read emits the score_anomalies IS NULL clause and drops the flagged player', async () => {
    const db = seededDb();
    const out = await getLeaderboard(db, 'soloClassic', 10, { sceneId: 'field', sheepCount: 200 });

    // The guarding clause is present in the executed SQL.
    expect(db._calls).toHaveLength(1);
    expect(/score_anomalies IS NULL/i.test(db._calls[0].sql)).toBe(true);

    // Only the clean player survives.
    const ids = out.map((e) => e.persistent_id);
    expect(ids).toContain(cleanPid);
    expect(ids).not.toContain(flaggedPid);
  });

  it('includeFlagged:true drops the clause and surfaces the flagged player too', async () => {
    const db = seededDb();
    const out = await getLeaderboard(db, 'soloClassic', 10, {
      sceneId: 'field', sheepCount: 200, includeFlagged: true,
    });
    expect(/score_anomalies IS NULL/i.test(db._calls[0].sql)).toBe(false);
    const ids = out.map((e) => e.persistent_id);
    expect(ids).toContain(cleanPid);
    expect(ids).toContain(flaggedPid);
  });

  it('getAllLeaderboards default also excludes flagged rows on every board', async () => {
    const db = seededDb();
    const boards = await getAllLeaderboards(db, 10, { sceneId: 'field' });
    // Every executed query carried the guard.
    expect(db._calls.length).toBeGreaterThan(0);
    for (const c of db._calls) {
      expect(/score_anomalies IS NULL/i.test(c.sql)).toBe(true);
    }
    const soloIds = (boards.soloClassic || []).map((e) => e.persistent_id);
    expect(soloIds).not.toContain(flaggedPid);
  });
});

// ---- (3) daily-* authority: date window + sheep-count cross-check -----------

describe('P-SEC-5: validateDailySubmission', () => {
  // A fixed "server now": 2026-05-15 12:00 UTC.
  const nowMs = Date.UTC(2026, 4, 15, 12, 0, 0);
  const todayKey = utcDateKey(nowMs); // '2026-05-15'
  const todaySheep = dailySheepCountForDate(todayKey);

  it("accepts today's partition with the correct seed sheep count", () => {
    const r = validateDailySubmission(`daily-${todayKey}`, todaySheep, nowMs);
    expect(r.ok).toBe(true);
  });

  it('rejects a future-dated partition (beyond grace)', () => {
    const futureKey = '2026-05-20'; // 5 days ahead
    const r = validateDailySubmission(`daily-${futureKey}`, dailySheepCountForDate(futureKey), nowMs);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/future/i);
  });

  it('rejects a stale partition (beyond grace)', () => {
    const staleKey = '2026-05-10'; // 5 days behind
    const r = validateDailySubmission(`daily-${staleKey}`, dailySheepCountForDate(staleKey), nowMs);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/past/i);
  });

  it('absorbs a one-day UTC-midnight skew within the grace window', () => {
    const yesterday = '2026-05-14';
    const tomorrow = '2026-05-16';
    expect(validateDailySubmission(`daily-${yesterday}`, dailySheepCountForDate(yesterday), nowMs).ok).toBe(true);
    expect(validateDailySubmission(`daily-${tomorrow}`, dailySheepCountForDate(tomorrow), nowMs).ok).toBe(true);
  });

  it('rejects a sheep count that does not match the seed for the date', () => {
    const wrong = todaySheep === 123 ? 124 : 123; // any count != the seed value
    const r = validateDailySubmission(`daily-${todayKey}`, wrong, nowMs);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/sheep_count/i);
  });
});

describe('P-SEC-5: daily formula matches the client dailySeed.js (no drift)', () => {
  it('dailyFnv1a matches js/utils/dailySeed.js fnv1a indirectly via sheep count', () => {
    // dailySheepCountForDate reproduces dailySeedFor(date).sheepCount exactly.
    const dates = [
      Date.UTC(2026, 0, 1), Date.UTC(2026, 4, 8), Date.UTC(2026, 4, 15),
      Date.UTC(2026, 6, 4), Date.UTC(2026, 11, 31), Date.UTC(2027, 2, 17),
    ];
    for (const ms of dates) {
      const key = dailyKey(new Date(ms));
      expect(dailySheepCountForDate(key)).toBe(dailySeedFor(new Date(ms)).sheepCount);
    }
  });

  it('utcDateKey matches the client dailyKey', () => {
    const ms = Date.UTC(2026, 4, 15, 23, 30, 0);
    expect(utcDateKey(ms)).toBe(dailyKey(new Date(ms)));
  });

  it('dailyFnv1a is a stable 32-bit hash', () => {
    const h = dailyFnv1a('2026-05-15:sheep');
    expect(h).toBe(h >>> 0);
    expect(dailyFnv1a('2026-05-15:sheep')).toBe(h);
  });
});

// ---- (3b) forged daily submission rejected at the route --------------------

describe('P-SEC-5: forged daily submission rejected at /api/score', () => {
  it('rejects a future-dated daily partition with 400 and writes no score', async () => {
    const pid = 'pid-daily-future-' + crypto.randomUUID();
    const db = makeFakeDb({ players: [basePlayer(pid)] });
    const token = await signJwt({ persistent_id: pid }, JWT_SECRET);

    // Far-future date the server clock can't be near. Use a real seed count so
    // the ONLY failing check is the date window.
    const futureKey = '2099-01-01';
    const res = await postScore(db, token, {
      gameMode: `daily-${futureKey}`,
      score: 90,
      additionalData: { sheepCount: dailySheepCountForDate(futureKey), sceneId: 'field' },
    });
    expect(res.status).toBe(400);
    const body = await res.json<any>();
    expect(String(body.error)).toMatch(/future/i);

    // No materialized write happened.
    const wrote = db._calls.some((c: any) => /INSERT INTO score_submissions/i.test(c.sql));
    expect(wrote).toBe(false);
  });

  it('rejects a daily submission whose sheep count does not match the seed', async () => {
    const pid = 'pid-daily-sheep-' + crypto.randomUUID();
    const db = makeFakeDb({ players: [basePlayer(pid)] });
    const token = await signJwt({ persistent_id: pid }, JWT_SECRET);

    // Use today's UTC date so the date window passes; only the count is wrong.
    const todayKey = utcDateKey(Date.now());
    const seed = dailySheepCountForDate(todayKey);
    const forged = seed === 200 ? 199 : 200; // a value in [50,200] that isn't the seed
    const res = await postScore(db, token, {
      gameMode: `daily-${todayKey}`,
      score: 90,
      additionalData: { sheepCount: forged, sceneId: 'field' },
    });
    expect(res.status).toBe(400);
    const body = await res.json<any>();
    expect(String(body.error)).toMatch(/sheep_count/i);
  });
});

// ---- (4) per-persistent_id score-submission rate limit ----------------------

describe('P-SEC-5: per-persistent_id score-submission rate limit', () => {
  it('429s once the per-identity bucket is drained, but a fresh identity is unaffected', async () => {
    const pid = 'pid-rl-' + crypto.randomUUID();
    const db = makeFakeDb({ players: [basePlayer(pid)] });
    const token = await signJwt({ persistent_id: pid }, JWT_SECRET);

    const valid = {
      gameMode: 'soloClassic',
      score: 60,
      additionalData: { sheepCount: 200, sceneId: 'field' },
    };

    // The bucket capacity is 10 (SCORE_BUCKET_CAPACITY). Within this synchronous
    // burst Date.now() barely advances so refill (~0.2/s) is negligible: the
    // first 10 succeed, then we hit a 429.
    let saw429 = false;
    let okCount = 0;
    for (let i = 0; i < 14; i++) {
      const res = await postScore(db, token, valid);
      if (res.status === 200) okCount++;
      else if (res.status === 429) { saw429 = true; break; }
      else throw new Error(`unexpected status ${res.status}`);
    }
    expect(okCount).toBe(10);
    expect(saw429).toBe(true);

    // A different identity still gets through (limit is per-pid, not global).
    const pid2 = 'pid-rl2-' + crypto.randomUUID();
    const db2 = makeFakeDb({ players: [basePlayer(pid2)] });
    const token2 = await signJwt({ persistent_id: pid2 }, JWT_SECRET);
    const res2 = await postScore(db2, token2, valid);
    expect(res2.status).toBe(200);
  });
});
