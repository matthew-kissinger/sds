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
  // P-SEC-1: device-local auth. hex(SHA-256(authSecret)); NULL = not yet bound
  // (grandfather-eligible). Set once on first register, then required to match
  // on every subsequent register. auth_bound_at is the ms-epoch it was bound.
  auth_secret_hash?: string | null;
  auth_bound_at?: number | null;
}

// P-SEC-1: thrown by registerPlayer when a row's secret is already bound and
// the caller does not present a matching secret. The route handler maps this to
// a 401 so a leaked persistent_id alone can never mint an impersonating token.
export class AuthError extends Error {
  constructor(message = 'auth required') {
    super(message);
    this.name = 'AuthError';
  }
}

const _hexEnc = new TextEncoder();

/**
 * P-SEC-1: hex(SHA-256(secret)) via the Workers-native WebCrypto digest. No new
 * dependency - crypto.subtle is available on the Worker (V8 isolate) and in the
 * Node test runtime. Only the hash is persisted to D1; the plaintext secret
 * lives client-side in localStorage.
 */
export async function hashSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', _hexEnc.encode(secret));
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

/**
 * P-SEC-1: constant-time comparison of two hex strings. Reuses the
 * XOR-accumulate pattern from jwt.ts verifyJwt so a length-mismatch or any
 * differing byte fails without an early-exit timing side channel. Inputs are
 * the lowercase hex digests produced by hashSecret.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * P-SEC-1: mint a fresh device secret - base64url of 32 random bytes from the
 * CSPRNG. Returned to the client exactly once (on issue); only its hash is
 * stored. base64url so it rides JSON / localStorage without escaping.
 */
export function generateAuthSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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

// ---------------------------------------------------------------------------
// P-SEC-5: daily-challenge authority.
//
// The daily mode partitions the leaderboard by date (`daily-YYYY-MM-DD`) and
// each date deterministically fixes the sheep count via the same FNV-1a hash
// the client uses (js/utils/dailySeed.js). Because the partition + sheep count
// are forgeable by a client (it posts the mode string + sheepCount), the
// server re-derives the canonical sheep count for the claimed date and refuses
// a submission whose date is outside today's window or whose sheep count does
// not match.
//
// The FNV-1a constants + lerp here are duplicated from js/utils/dailySeed.js by
// design: the shared-sim boundary forbids worker imports from js/ (which pulls
// Three.js transitively). This is a one-shot integrity check at submit time,
// not a per-tick sim path, so the small duplication is acceptable; the paired
// spec pins it against the client module's outputs so the two cannot drift.
// ---------------------------------------------------------------------------

const DAILY_SHEEP_SEED_MIN = 50;
const DAILY_SHEEP_SEED_MAX = 200;

/** FNV-1a 32-bit. Byte-identical to js/utils/dailySeed.js fnv1a. */
export function dailyFnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The canonical sheep count for a `YYYY-MM-DD` date key, reproducing
 * dailySeedFor(date).sheepCount. `dateKey` is the bare date (no `daily-`
 * prefix).
 */
export function dailySheepCountForDate(dateKey: string): number {
  const hSheep = (dailyFnv1a(`${dateKey}:sheep`) % 1000) / 1000;
  // lerp(min, max, t), rounded — matches dailySeed.js exactly.
  return Math.round(DAILY_SHEEP_SEED_MIN + (DAILY_SHEEP_SEED_MAX - DAILY_SHEEP_SEED_MIN) * hSheep);
}

/** UTC `YYYY-MM-DD` for a ms-epoch. Mirrors dailySeed.js dailyKey (UTC-rooted). */
export function utcDateKey(nowMs: number): string {
  const d = new Date(nowMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export interface DailyValidationResult {
  ok: boolean;
  reason?: string;
}

/**
 * P-SEC-5: validate a `daily-YYYY-MM-DD` submission against the server clock
 * and the deterministic sheep count for that date.
 *
 *  - The claimed date must equal today's UTC date, or fall within
 *    `graceDays` on either side (default 1 day) to absorb UTC-midnight skew
 *    between a client that started a run just before rollover and a server
 *    that stamps the POST just after. Anything further past/future is a
 *    forged partition.
 *  - The claimed sheep count must equal dailySheepCountForDate(date). A
 *    mismatch means the client lied about the challenge it played.
 *
 * Returns { ok: true } on success, or { ok: false, reason } describing the
 * first failed check. Non-daily modes are not the caller's concern here.
 */
export function validateDailySubmission(
  mode: `daily-${string}`,
  sheepCount: number,
  nowMs: number,
  graceDays = 1,
): DailyValidationResult {
  const dateKey = mode.slice('daily-'.length); // 'YYYY-MM-DD'
  // Parse as a UTC midnight epoch so the day delta is timezone-stable.
  const [y, m, d] = dateKey.split('-').map(Number);
  const claimedMidnightUtc = Date.UTC(y, m - 1, d);
  if (!Number.isFinite(claimedMidnightUtc)) {
    return { ok: false, reason: 'daily partition date unparseable' };
  }
  const todayKey = utcDateKey(nowMs);
  const [ty, tm, td] = todayKey.split('-').map(Number);
  const todayMidnightUtc = Date.UTC(ty, tm - 1, td);
  const dayMs = 86_400_000;
  const dayDelta = Math.round((todayMidnightUtc - claimedMidnightUtc) / dayMs);
  if (dayDelta > graceDays) {
    return { ok: false, reason: `daily partition ${dateKey} is in the past beyond grace` };
  }
  if (dayDelta < -graceDays) {
    return { ok: false, reason: `daily partition ${dateKey} is in the future` };
  }
  const expectedSheep = dailySheepCountForDate(dateKey);
  if (sheepCount !== expectedSheep) {
    return {
      ok: false,
      reason: `daily sheep_count ${sheepCount} does not match seed (${expectedSheep}) for ${dateKey}`,
    };
  }
  return { ok: true };
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

// P-SEC-1: result of the auth-aware register. `authSecret` is the plaintext
// device secret and is present ONLY when freshly issued (new row, or a
// trust-on-first-use bind of a legacy NULL-hash row). On a successful
// re-register with a matching secret it is omitted - the client already holds
// it. The route handler surfaces it to the JSON body only when present.
export interface RegisterResult {
  player: PlayerRow;
  authSecret?: string;
}

/**
 * P-SEC-1: auth-aware player registration. Three-way fork on the existing row
 * and its auth_secret_hash:
 *
 *   1. row ABSENT - the caller supplies a server-minted persistentId (the
 *      route mints it via crypto.randomUUID, never trusting a client value).
 *      Mint a fresh authSecret, INSERT with auth_secret_hash = hash(secret),
 *      and return { player, authSecret }.
 *   2. row PRESENT, hash IS NULL (legacy / grandfather) - trust-on-first-use:
 *      mint a fresh authSecret, UPDATE auth_secret_hash + auth_bound_at, and
 *      return { player, authSecret } so the device captures it.
 *   3. row PRESENT, hash NOT NULL - require the provided secret. Missing, or a
 *      non-matching hash (constant-time compare), throws AuthError. On match,
 *      return { player } with NO authSecret.
 *
 * `providedSecret` is the secret the returning client claims to hold; ignored
 * for the absent / grandfather paths.
 */
export async function registerPlayer(
  db: D1Database,
  persistentId: string,
  requestedName: string,
  nameType: 'custom' | 'random' | 'anonymous',
  providedSecret?: string | null,
): Promise<RegisterResult> {
  const existing = await db
    .prepare('SELECT * FROM players WHERE persistent_id = ?')
    .bind(persistentId)
    .first<PlayerRow>();

  if (existing) {
    const now = Date.now();

    // Fork 3: secret already bound - the returning client must prove it holds
    // the matching secret. A leaked persistent_id alone gets nothing.
    if (existing.auth_secret_hash != null) {
      if (!providedSecret) throw new AuthError();
      const providedHash = await hashSecret(providedSecret);
      if (!timingSafeEqualHex(providedHash, existing.auth_secret_hash)) {
        throw new AuthError();
      }
      await db
        .prepare('UPDATE players SET last_active = ? WHERE persistent_id = ?')
        .bind(now, persistentId)
        .run();
      existing.last_active = now;
      return { player: existing };
    }

    // Fork 2: legacy row with no secret yet - trust-on-first-use bind. The
    // first caller to register this id claims it by receiving a fresh secret.
    const authSecret = generateAuthSecret();
    const authHash = await hashSecret(authSecret);
    await db
      .prepare(
        'UPDATE players SET last_active = ?, auth_secret_hash = ?, auth_bound_at = ? WHERE persistent_id = ?',
      )
      .bind(now, authHash, now, persistentId)
      .run();
    existing.last_active = now;
    existing.auth_secret_hash = authHash;
    existing.auth_bound_at = now;
    return { player: existing, authSecret };
  }

  // Fork 1: brand-new row. The persistentId here was server-minted by the
  // route. Mint a fresh secret and store only its hash.
  let displayName = requestedName;
  if (nameType === 'random') displayName = generateRandomName();
  else if (nameType === 'anonymous') displayName = 'Player';

  const discriminator = await allocateDiscriminator(db, displayName);
  const fullName = `${displayName}#${discriminator}`;
  const now = Date.now();
  const authSecret = generateAuthSecret();
  const authHash = await hashSecret(authSecret);

  await db
    .prepare(
      `INSERT INTO players
       (persistent_id, display_name, discriminator, full_name, created_at, last_active,
        solo_classic_best, solo_extreme_best, solo_insane_best, solo_chaos_best,
        timed_best, competitive_wins, cooperative_best, auth_secret_hash, auth_bound_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, 0, NULL, ?, ?)`,
    )
    .bind(persistentId, displayName, discriminator, fullName, now, now, authHash, now)
    .run();

  return {
    player: {
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
      auth_secret_hash: authHash,
      auth_bound_at: now,
    },
    authSecret,
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

  // P-SEC-5: daily-challenge authority. A daily submission claims a date
  // partition AND a sheep count; both are forgeable on the wire. Re-derive the
  // canonical sheep count for the claimed UTC date and reject a stale/future
  // partition or a mismatched count. The throw lands in score_errors via the
  // submitScore wrapper, same as every other hard reject.
  if (isDailyMode(gameMode)) {
    const daily = validateDailySubmission(gameMode, sheepCount, now);
    if (!daily.ok) {
      throw new Error(daily.reason || `invalid daily submission for ${gameMode}`);
    }
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
  // P-SEC-5: the public READ path leaves this unset so anomaly-flagged rows
  // (score_anomalies IS NOT NULL — see detectScoreAnomalies + migration 0003)
  // are hidden from the board. Only a trusted/admin caller passes `true` to
  // include flagged rows for review. Default = false = exclude flagged.
  includeFlagged?: boolean;
}

/**
 * Cycle 8 Phase 3 + Cycle 35 Phase 4: get leaderboard for a (mode, scene)
 * pair. Scene is now required at the API boundary — Field, Sheep Dog
 * Island, and Open Country have different geometry, navigation, and time
 * distributions, so cross-scene boards never composed. Always queries
 * `score_submissions` with GROUP BY; the materialized fast path (queried
 * scene-blind on `players.*`) is gone.
 *
 * P-SEC-5: by default the query excludes rows whose `score_anomalies` column
 * is non-null (flagged by detectScoreAnomalies at submit time). The
 * migration-0003 partial index makes the predicate cheap. Pass
 * `filters.includeFlagged = true` only from a trusted admin readout.
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
  // P-SEC-5: hide flagged submissions from the public board by default. A
  // submission that tripped any anomaly heuristic carries a non-null
  // score_anomalies blob; excluding it here keeps a forged-but-bounds-passing
  // time off the leaderboard without a hard reject at submit time.
  if (!filters.includeFlagged) {
    where.push('s.score_anomalies IS NULL');
  }
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
      // P-SEC-5: preserve includeFlagged when we strip the sheepCount filter
      // for fixed-count modes — otherwise an admin readout would silently
      // re-hide flagged rows for solo/timed boards.
      const perMode: LeaderboardFilters = MODES_WITH_FIXED_SHEEP_COUNT.has(m)
        ? { sceneId: filters.sceneId, includeFlagged: filters.includeFlagged }
        : filters;
      return getLeaderboard(db, m, limit, perMode);
    }),
  );
  const out: Record<string, LeaderboardEntry[]> = {};
  for (let i = 0; i < ALL_GAME_MODES.length; i++) out[ALL_GAME_MODES[i]] = results[i];
  return out;
}
