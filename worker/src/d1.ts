// D1 leaderboard operations. Ports server/LeaderboardManager.js semantics:
//   - register inserts a players row (bug 3 fix)
//   - submitScore updates materialized best in one statement (bug 2 fix)

export interface PlayerRow {
  persistent_id: string;
  display_name: string;
  discriminator: string;
  full_name: string;
  created_at: number;
  last_active: number;
  solo_classic_best: number | null;
  solo_extreme_best: number | null;
  // Cycle 8: separate materialized bests per solo difficulty so a 5000-sheep
  // chaos run no longer pollutes the soloClassic board (prior bug).
  solo_insane_best: number | null;
  solo_chaos_best: number | null;
  timed_best: number | null;
  competitive_wins: number;
  cooperative_best: number | null;
}

export type GameMode =
  | 'soloClassic'
  | 'soloExtreme'
  | 'soloInsane'
  | 'soloChaos'
  | 'timed'
  | 'competitive'
  | 'cooperative'
  // Cycle 27 Phase D: per-day challenge partition. The literal here is the
  // template; the actual stored value is `daily-${YYYY-MM-DD}`. Validation
  // accepts the templated form via isDailyMode + isValidGameMode below.
  | `daily-${string}`;

// Cycle 8 Phase 3: known scenes for leaderboard partitioning. 'any' is a
// pseudo-key the API accepts on read paths; never stored.
export type SceneId = 'field' | 'rolling-hills' | 'open-country';

// The fixed enum members. `daily-*` is dynamic and validated separately.
export const ALL_GAME_MODES: GameMode[] = [
  'soloClassic',
  'soloExtreme',
  'soloInsane',
  'soloChaos',
  'timed',
  'competitive',
  'cooperative',
];

const ALL_GAME_MODES_SET: ReadonlySet<string> = new Set(ALL_GAME_MODES);

// `daily-YYYY-MM-DD` is the per-day partition key. UTC-rooted; the
// client (js/utils/dailySeed.js) constructs the same string off `new Date()`.
const DAILY_MODE_REGEX = /^daily-\d{4}-\d{2}-\d{2}$/;

export function isDailyMode(mode: unknown): mode is `daily-${string}` {
  return typeof mode === 'string' && DAILY_MODE_REGEX.test(mode);
}

export function isValidGameMode(mode: unknown): mode is GameMode {
  return typeof mode === 'string' && (ALL_GAME_MODES_SET.has(mode) || isDailyMode(mode));
}

// Cycle 35 Phase 4: solo + timed modes have a fixed intrinsic sheep count
// per mode (soloClassic = 200, soloExtreme = 1000, soloInsane = 3000,
// soloChaos = 5000, timed = 200). Multiplayer modes (competitive,
// cooperative) and daily-* legitimately vary by sheep count. The bulk
// leaderboards endpoint suppresses the sheepCount filter for the fixed-
// count modes so picking "250 sheep" in the dropdown does not blank every
// solo board.
const MODES_WITH_FIXED_SHEEP_COUNT: ReadonlySet<string> = new Set([
  'soloClassic',
  'soloExtreme',
  'soloInsane',
  'soloChaos',
  'timed',
]);

const ADJECTIVES = [
  'Swift', 'Clever', 'Brave', 'Mighty', 'Gentle', 'Wise', 'Bold', 'Quick',
  'Steady', 'Silent', 'Golden', 'Silver', 'Shadow', 'Storm', 'Wind',
  'Mountain', 'Valley', 'River', 'Forest', 'Meadow', 'Highland', 'Prairie',
  'Noble', 'Keen', 'Fierce', 'Calm', 'Sharp', 'Bright', 'Strong', 'Fast',
];

const HERDER_NAMES = [
  'Shepherd', 'Herder', 'Ranger', 'Guardian', 'Warden', 'Guide', 'Scout',
  'Driver', 'Keeper', 'Walker', 'Runner', 'Chaser', 'Leader', 'Master',
  'Whisperer', 'Friend', 'Helper', 'Trainer', 'Handler', 'Border', 'Collie',
  'Aussie', 'Corgi', 'Sheepdog', 'Herdsman', 'Drover', 'Cowboy', 'Rancher',
];

export function generateRandomName(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const h = HERDER_NAMES[Math.floor(Math.random() * HERDER_NAMES.length)];
  return `${a}${h}`;
}

async function allocateDiscriminator(db: D1Database, displayName: string): Promise<string> {
  const { results } = await db
    .prepare('SELECT discriminator FROM discriminators WHERE display_name = ?')
    .bind(displayName)
    .all<{ discriminator: string }>();
  const used = new Set((results || []).map(r => r.discriminator));
  for (let i = 1; i <= 9999; i++) {
    const disc = String(i).padStart(4, '0');
    if (!used.has(disc)) {
      await db
        .prepare('INSERT INTO discriminators (display_name, discriminator) VALUES (?, ?)')
        .bind(displayName, disc)
        .run();
      return disc;
    }
  }
  return '9999';
}

export async function registerPlayer(
  db: D1Database,
  persistentId: string,
  requestedName: string,
  nameType: 'custom' | 'random' | 'anonymous',
): Promise<PlayerRow> {
  const existing = await db
    .prepare('SELECT * FROM players WHERE persistent_id = ?')
    .bind(persistentId)
    .first<PlayerRow>();
  if (existing) {
    const now = Date.now();
    await db
      .prepare('UPDATE players SET last_active = ? WHERE persistent_id = ?')
      .bind(now, persistentId)
      .run();
    existing.last_active = now;
    return existing;
  }

  let displayName = requestedName;
  if (nameType === 'random') displayName = generateRandomName();
  else if (nameType === 'anonymous') displayName = 'Player';

  const discriminator = await allocateDiscriminator(db, displayName);
  const fullName = `${displayName}#${discriminator}`;
  const now = Date.now();

  await db
    .prepare(
      `INSERT INTO players
       (persistent_id, display_name, discriminator, full_name, created_at, last_active,
        solo_classic_best, solo_extreme_best, solo_insane_best, solo_chaos_best,
        timed_best, competitive_wins, cooperative_best)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, 0, NULL)`,
    )
    .bind(persistentId, displayName, discriminator, fullName, now, now)
    .run();

  return {
    persistent_id: persistentId,
    display_name: displayName,
    discriminator,
    full_name: fullName,
    created_at: now,
    last_active: now,
    solo_classic_best: null,
    solo_extreme_best: null,
    solo_insane_best: null,
    solo_chaos_best: null,
    timed_best: null,
    competitive_wins: 0,
    cooperative_best: null,
  };
}

export async function getPlayer(db: D1Database, persistentId: string): Promise<PlayerRow | null> {
  return (
    (await db
      .prepare('SELECT * FROM players WHERE persistent_id = ?')
      .bind(persistentId)
      .first<PlayerRow>()) || null
  );
}

export interface SubmitScoreResult {
  updated: boolean;
  isNewRecord: boolean;
  player: PlayerRow | null;
}

// Cycle 8 Phase 3: time-modes vs win-mode for submission/leaderboard direction.
// Time-modes (lower = better) match by score < best; competitive accumulates.
// Insane and Chaos use the same time-based scoring as Classic and Extreme.
// Cycle 27 Phase D: daily-* is a time mode (lower-better duration).
const FIXED_TIME_MODES: GameMode[] = [
  'soloClassic',
  'soloExtreme',
  'soloInsane',
  'soloChaos',
  'cooperative',
];
const FIXED_TIME_MODES_SET: ReadonlySet<string> = new Set(FIXED_TIME_MODES);

export function isTimeMode(mode: GameMode): boolean {
  return FIXED_TIME_MODES_SET.has(mode) || isDailyMode(mode);
}

// Back-compat alias used heavily inside the file.
const TIME_MODES = { includes: (mode: GameMode) => isTimeMode(mode) };

export function submissionScoreBoundsOk(mode: GameMode, score: number): boolean {
  if (isTimeMode(mode)) return score >= 30 && score <= 3600;
  if (mode === 'timed') return Number.isInteger(score) && score >= 0 && score <= 500;
  if (mode === 'competitive') return score === 0 || score === 1;
  return false;
}

// Cycle 10 Phase 6: cross-field plausibility. Allowed (mode, sheep_count)
// pairings — anything outside this set is hard-rejected at the worker
// boundary alongside out-of-bounds scores.
// Cycle 27 Phase D: daily-* uses a numeric range matching the
// dailySeed.js [50, 200] sheep window. Any count in that band is
// accepted; outside it is hard-rejected.
const ALLOWED_MODE_SHEEPCOUNT: Record<Exclude<GameMode, `daily-${string}`>, number[] | 'any'> = {
  soloClassic: [200],
  soloExtreme: [1000],
  soloInsane: [3000],
  soloChaos: [5000],
  timed: [200],
  competitive: 'any',
  cooperative: 'any',
};

const DAILY_SHEEP_MIN = 50;
const DAILY_SHEEP_MAX = 200;

export function modeSheepCountOk(mode: GameMode, sheepCount: number): boolean {
  if (isDailyMode(mode)) {
    return sheepCount >= DAILY_SHEEP_MIN && sheepCount <= DAILY_SHEEP_MAX;
  }
  const allowed = ALLOWED_MODE_SHEEPCOUNT[mode as Exclude<GameMode, `daily-${string}`>];
  if (allowed === 'any') return true;
  return allowed.includes(sheepCount);
}

// Cycle 10 Phase 6: minimum-plausible-duration heuristic for time modes.
// Floor on score (=duration in seconds) given the claimed sheep_count.
// A 5000-sheep Chaos run completing in 30s is implausible regardless of
// skill; if claimed, hard-reject. The floors below are intentionally
// generous: better to under-flag than over-flag when the leaderboard
// is also a marketing surface. Tighten with telemetry data over time.
const MIN_PLAUSIBLE_DURATION_BY_COUNT: Array<[number, number]> = [
  // [sheepCount, minSeconds]
  [200, 30],     // soloClassic / timed floor stays at 30s (existing bound)
  [1000, 90],    // soloExtreme — 1000 sheep can't realistically be herded in <90s
  [3000, 180],   // soloInsane — 3 minute floor
  [5000, 240],   // soloChaos — 4 minute floor
];

export function durationFloorForCount(sheepCount: number): number {
  // Pick the largest entry whose count <= sheepCount; defaults to 30s.
  let floor = 30;
  for (const [count, minSec] of MIN_PLAUSIBLE_DURATION_BY_COUNT) {
    if (sheepCount >= count) floor = minSec;
  }
  return floor;
}

export function plausibleScoreForCount(
  mode: GameMode,
  score: number,
  sheepCount: number,
): boolean {
  if (!TIME_MODES.includes(mode)) return true;
  return score >= durationFloorForCount(sheepCount);
}

export interface ScoreAnomaly {
  tag: string;
  detail?: Record<string, unknown>;
}

// Cycle 10 Phase 6: telemetry-driven soft signals. Returned alongside
// the (already-passed) bounds + plausibility checks. Anomalies are stored
// on the audit row, NOT used to reject — leaderboard query layers gate
// on score_anomalies IS NULL by default.
export function detectScoreAnomalies(input: {
  mode: GameMode;
  score: number;
  sheepCount: number;
  clientStartedAt?: number | null;
  clientFinishedAt?: number | null;
  serverNow: number;
}): ScoreAnomaly[] {
  const anomalies: ScoreAnomaly[] = [];

  // 1) Client clock skew: if start/finish timestamps were submitted, compare
  //    their delta against the claimed score (= duration in seconds for time
  //    modes). >10s divergence is a soft flag — could be a paused tab, could
  //    be a tampered submission.
  if (
    typeof input.clientStartedAt === 'number' &&
    typeof input.clientFinishedAt === 'number' &&
    TIME_MODES.includes(input.mode)
  ) {
    const clientDurationSec = (input.clientFinishedAt - input.clientStartedAt) / 1000;
    const skew = Math.abs(clientDurationSec - input.score);
    if (skew > 10) {
      anomalies.push({
        tag: 'client_clock_skew',
        detail: {
          claimed_score: input.score,
          client_duration_sec: Math.round(clientDurationSec * 10) / 10,
          skew_sec: Math.round(skew * 10) / 10,
        },
      });
    }
  }

  // 2) Fast-for-count: passes the hard plausibility floor but still falls
  //    in the bottom 10% of the floor range (e.g. 95s for soloExtreme).
  //    Soft signal — informs future floor tuning.
  if (TIME_MODES.includes(input.mode)) {
    const floor = durationFloorForCount(input.sheepCount);
    const fastBand = floor * 1.1;
    if (input.score < fastBand) {
      anomalies.push({
        tag: 'fast_for_count',
        detail: {
          score: input.score,
          sheep_count: input.sheepCount,
          floor_seconds: floor,
        },
      });
    }
  }

  return anomalies;
}

/**
 * Cycle 35 Phase 2: public submitScore wrapper. Any throw from the inner
 * implementation (validation reject, D1 batch failure, "player not found")
 * lands one row in `score_errors` before re-throwing so the route handler
 * still returns 4xx/5xx as today. The table is observability, not flow
 * control — see hard stop #2 in cycle-35-plan.md.
 */
export async function submitScore(
  db: D1Database,
  persistentId: string,
  gameMode: GameMode,
  score: number,
  additionalData: Record<string, unknown> = {},
): Promise<SubmitScoreResult> {
  try {
    return await submitScoreInner(db, persistentId, gameMode, score, additionalData);
  } catch (err: any) {
    // Best-effort observability: capture context, then re-throw the
    // original error so the route handler still returns 4xx/5xx.
    try {
      const claimedSheepCount = Number.isInteger(additionalData.sheepCount as number)
        ? (additionalData.sheepCount as number)
        : null;
      const claimedSceneId = typeof additionalData.sceneId === 'string'
        ? (additionalData.sceneId as string)
        : null;
      const reason = (err?.message || String(err) || 'unknown').slice(0, 500);
      await db.prepare(
        'INSERT INTO score_errors (persistent_id, claimed_mode, claimed_score, claimed_sheep_count, claimed_scene_id, reason, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        persistentId, gameMode, Number.isFinite(score) ? score : null,
        claimedSheepCount, claimedSceneId, reason, Date.now(),
      ).run();
    } catch (logErr: any) {
      // Don't double-throw if the score_errors insert itself fails (D1
      // unavailable, table missing pre-migration). Log and let the
      // original error propagate.
      console.error('[score_errors] insert failed:', logErr?.message);
    }
    throw err;
  }
}

async function submitScoreInner(
  db: D1Database,
  persistentId: string,
  gameMode: GameMode,
  score: number,
  additionalData: Record<string, unknown> = {},
): Promise<SubmitScoreResult> {
  const player = await getPlayer(db, persistentId);
  if (!player) throw new Error('Player not found. Please register first.');

  if (!submissionScoreBoundsOk(gameMode, score)) {
    throw new Error(`score out of bounds for mode ${gameMode}`);
  }

  const now = Date.now();
  let updated = false;
  let isNewRecord = false;
  const roomCode = typeof additionalData.roomCode === 'string' ? additionalData.roomCode : null;

  // Cycle 8 Phase 3: lift sceneId + sheepCount into dedicated columns so
  // leaderboard queries can partition by them. Defaults match the pre-Cycle-8
  // assumption that everything ran on Field at 200 sheep, except for
  // soloExtreme which always ran at 1000.
  const sceneId = typeof additionalData.sceneId === 'string'
    ? additionalData.sceneId
    : 'field';
  const sheepCount = Number.isInteger(additionalData.sheepCount as number)
    ? (additionalData.sheepCount as number)
    : (gameMode === 'soloExtreme' ? 1000 : 200);

  // Cycle 10 Phase 6: cross-field plausibility — hard rejects.
  if (!modeSheepCountOk(gameMode, sheepCount)) {
    throw new Error(`sheep_count ${sheepCount} not allowed for mode ${gameMode}`);
  }
  if (!plausibleScoreForCount(gameMode, score, sheepCount)) {
    throw new Error(`score ${score} implausibly low for ${gameMode} at ${sheepCount} sheep`);
  }

  // Cycle 10 Phase 6: soft signals. Stored on the audit row; do NOT reject.
  const clientStartedAt = typeof additionalData.clientStartedAt === 'number'
    ? (additionalData.clientStartedAt as number)
    : null;
  const clientFinishedAt = typeof additionalData.clientFinishedAt === 'number'
    ? (additionalData.clientFinishedAt as number)
    : null;
  const anomalies = detectScoreAnomalies({
    mode: gameMode,
    score,
    sheepCount,
    clientStartedAt,
    clientFinishedAt,
    serverNow: now,
  });
  const anomaliesJson = anomalies.length > 0 ? JSON.stringify(anomalies) : null;

  // Audit row + materialized-best in a D1 batch so they land together.
  const stmts: D1PreparedStatement[] = [];
  stmts.push(
    db.prepare(
      'INSERT INTO score_submissions (persistent_id, game_mode, score, submitted_at, room_code, additional_data, sheep_count, scene_id, score_anomalies) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      persistentId, gameMode, score, now, roomCode,
      JSON.stringify(additionalData || {}),
      sheepCount, sceneId, anomaliesJson,
    ),
  );

  switch (gameMode) {
    case 'soloClassic':
      if (player.solo_classic_best === null || score < player.solo_classic_best) {
        stmts.push(
          db.prepare('UPDATE players SET solo_classic_best = ?, last_active = ? WHERE persistent_id = ?')
            .bind(score, now, persistentId),
        );
        player.solo_classic_best = score;
        updated = true;
        isNewRecord = true;
      }
      break;
    case 'soloExtreme':
      if (player.solo_extreme_best === null || score < player.solo_extreme_best) {
        stmts.push(
          db.prepare('UPDATE players SET solo_extreme_best = ?, last_active = ? WHERE persistent_id = ?')
            .bind(score, now, persistentId),
        );
        player.solo_extreme_best = score;
        updated = true;
        isNewRecord = true;
      }
      break;
    case 'soloInsane':
      if (player.solo_insane_best === null || score < player.solo_insane_best) {
        stmts.push(
          db.prepare('UPDATE players SET solo_insane_best = ?, last_active = ? WHERE persistent_id = ?')
            .bind(score, now, persistentId),
        );
        player.solo_insane_best = score;
        updated = true;
        isNewRecord = true;
      }
      break;
    case 'soloChaos':
      if (player.solo_chaos_best === null || score < player.solo_chaos_best) {
        stmts.push(
          db.prepare('UPDATE players SET solo_chaos_best = ?, last_active = ? WHERE persistent_id = ?')
            .bind(score, now, persistentId),
        );
        player.solo_chaos_best = score;
        updated = true;
        isNewRecord = true;
      }
      break;
    case 'timed':
      if (player.timed_best === null || score > player.timed_best) {
        stmts.push(
          db.prepare('UPDATE players SET timed_best = ?, last_active = ? WHERE persistent_id = ?')
            .bind(score, now, persistentId),
        );
        player.timed_best = score;
        updated = true;
        isNewRecord = true;
      }
      break;
    case 'competitive':
      stmts.push(
        db.prepare('UPDATE players SET competitive_wins = competitive_wins + ?, last_active = ? WHERE persistent_id = ?')
          .bind(score, now, persistentId),
      );
      player.competitive_wins += score;
      updated = true;
      isNewRecord = false;
      break;
    case 'cooperative':
      if (player.cooperative_best === null || score < player.cooperative_best) {
        stmts.push(
          db.prepare('UPDATE players SET cooperative_best = ?, last_active = ? WHERE persistent_id = ?')
            .bind(score, now, persistentId),
        );
        player.cooperative_best = score;
        updated = true;
        isNewRecord = true;
      }
      break;
  }

  await db.batch(stmts);

  if (updated) player.last_active = now;
  return { updated, isNewRecord, player };
}

export function scoreColumn(mode: GameMode): string {
  switch (mode) {
    case 'soloClassic': return 'solo_classic_best';
    case 'soloExtreme': return 'solo_extreme_best';
    case 'soloInsane': return 'solo_insane_best';
    case 'soloChaos': return 'solo_chaos_best';
    case 'timed': return 'timed_best';
    case 'competitive': return 'competitive_wins';
    case 'cooperative': return 'cooperative_best';
  }
}

export function formatScore(mode: GameMode, score: number | null): string {
  if (score === null || score === undefined || Number.isNaN(score)) return 'No score';
  if (TIME_MODES.includes(mode)) {
    const m = Math.floor(score / 60);
    const s = Math.floor(score % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  switch (mode) {
    case 'timed':
      return `${score} sheep`;
    case 'competitive':
      return `${score} wins`;
  }
  return String(score);
}

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  fullName: string;
  score: number;
  formattedScore: string;
  persistent_id: string;
  lastActive: number;
}

export interface LeaderboardFilters {
  sceneId?: string;
  sheepCount?: number;
}

/**
 * Cycle 8 Phase 3 + Cycle 35 Phase 4: get leaderboard for a (mode, scene)
 * pair. Scene is now required at the API boundary — Field, Sheep Dog
 * Island, and Open Country have different geometry, navigation, and time
 * distributions, so cross-scene boards never composed. Always queries
 * `score_submissions` with GROUP BY; the materialized fast path (queried
 * scene-blind on `players.*`) is gone.
 */
export async function getLeaderboard(
  db: D1Database,
  mode: GameMode,
  limit = 10,
  filters: LeaderboardFilters = {},
): Promise<LeaderboardEntry[]> {
  // Partitioned path: filter score_submissions by (mode, scene, sheepCount)
  // and aggregate per player. For TIME_MODES we want MIN(score). For 'timed'
  // we want MAX(score). For 'competitive' we want COUNT of wins (score=1
  // submissions). Join back to players for display fields.
  const isTimeMode = TIME_MODES.includes(mode);
  const isCompetitive = mode === 'competitive';
  const aggSql = isCompetitive
    ? 'SUM(s.score)'
    : (isTimeMode ? 'MIN(s.score)' : 'MAX(s.score)');
  const orderDir = isCompetitive
    ? 'DESC'
    : (isTimeMode ? 'ASC' : 'DESC');

  const where: string[] = ['s.game_mode = ?'];
  const binds: any[] = [mode];
  if (filters.sceneId && filters.sceneId !== 'any') {
    where.push('s.scene_id = ?');
    binds.push(filters.sceneId);
  }
  if (typeof filters.sheepCount === 'number' && filters.sheepCount > 0) {
    where.push('s.sheep_count = ?');
    binds.push(filters.sheepCount);
  }
  binds.push(limit);

  const sql = `
    SELECT p.persistent_id, p.display_name, p.full_name, p.last_active,
           ${aggSql} AS best_score
    FROM score_submissions s
    JOIN players p ON p.persistent_id = s.persistent_id
    WHERE ${where.join(' AND ')}
    GROUP BY s.persistent_id
    ORDER BY best_score ${orderDir}
    LIMIT ?
  `;

  type Row = {
    persistent_id: string;
    display_name: string;
    full_name: string;
    last_active: number;
    best_score: number;
  };
  const { results } = await db.prepare(sql).bind(...binds).all<Row>();
  // Cycle 35 Phase 4: dropped the natural-partition fast-path fallback.
  // Pre-Cycle-8 backfill is no longer load-bearing (~15 submission rows at
  // cycle plan time), and the cross-scene mash-up was the bug we set out
  // to fix. An empty partitioned query is now the truthful answer.
  return (results || []).map((p, i) => ({
    rank: i + 1,
    displayName: p.display_name,
    fullName: p.full_name,
    score: p.best_score,
    formattedScore: formatScore(mode, p.best_score),
    persistent_id: p.persistent_id,
    lastActive: p.last_active,
  }));
}

export async function getAllLeaderboards(
  db: D1Database,
  limit = 10,
  filters: LeaderboardFilters = {},
): Promise<Record<string, LeaderboardEntry[]>> {
  // Cycle 12 Phase 6 + Cycle 35 Phase 4: per-mode filter dispatch. Solo +
  // timed modes have a fixed intrinsic sheep count, so the dropdown is
  // meaningful only for competitive/cooperative. Drop it for the others —
  // otherwise picking "250 sheep" in the dropdown blanks every solo board
  // even though those modes never partition by that count.
  const results = await Promise.all(
    ALL_GAME_MODES.map(m => {
      const perMode: LeaderboardFilters = MODES_WITH_FIXED_SHEEP_COUNT.has(m)
        ? { sceneId: filters.sceneId }
        : filters;
      return getLeaderboard(db, m, limit, perMode);
    }),
  );
  const out: Record<string, LeaderboardEntry[]> = {};
  for (let i = 0; i < ALL_GAME_MODES.length; i++) out[ALL_GAME_MODES[i]] = results[i];
  return out;
}
