// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// D1 leaderboard operations. Ports server/LeaderboardManager.js semantics:
//   - register inserts a players row (bug 3 fix)
//   - submitScore updates materialized best in one statement (bug 2 fix)

// Cycle 58: solo leaderboard identity is (scene, count). The submit allow-list
// and the leaderboard partition derive the ranked counts for a scene from its
// soloLadder via these pure shared modules (no DOM / Three.js — safe in the
// Worker isolate, same import the router already uses for scene validation).
import { getSceneById } from '../../shared/scenes/index.js';
import { getRankedCounts } from '../../shared/difficulty.js';
// Cycle 59 (Counting Sheep): the counting leaderboard modes + ceiling. Shared
// with the client so the board keys (counting-incremental / counting-exponential)
// and the 0..5000 bound cannot drift between submit and read.
import {
  COUNTING_LEADERBOARD_MODES,
  isCountingLeaderboardMode,
  COUNTING_HARD_CEILING,
} from '../../shared/countingModes.js';
// Cycle 66 P6: the Newsheepdogland survival board. A live-read mode partitioned
// by (game_mode='survival', scene_id), ranked by peak flock size DESC. No
// materialized players-row column (reads straight from score_submissions like
// counting). Shared with the client so the board key + bound cannot drift.
import {
  SURVIVAL_LEADERBOARD_MODE,
  isSurvivalLeaderboardMode,
  SURVIVAL_MAX_SCORE,
} from '../../shared/survivalModes.js';

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

// Cycle 57: thrown by renamePlayer / sanitizeDisplayName on an invalid name.
// `code` is a stable machine string the route maps to a 400 and the client
// maps to an identity.* i18n message. Distinct from AuthError so the route
// can branch cleanly.
export class ValidationError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.name = 'ValidationError';
    this.code = code;
  }
}

// Cycle 57: thrown by renamePlayer when the authenticated persistent_id has no
// players row (e.g. a DB reset between register and rename). Route maps to 404.
export class NotFoundError extends Error {
  constructor(message = 'not found') {
    super(message);
    this.name = 'NotFoundError';
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
  // Cycle 59 (Counting Sheep): round-based solo modes where the COUNT is the
  // score (higher better, ranked descending). They partition by (game_mode,
  // scene_id), ignore sheep_count, and have no materialized players-row column
  // (they read live from score_submissions, like the daily partition).
  | 'counting-incremental'
  | 'counting-exponential'
  // Cycle 66 P6: the survival board. Live-read, partitioned by (game_mode,
  // scene_id), ranked by peak flock size DESC. No materialized players column.
  | 'survival'
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
  return typeof mode === 'string'
    && (ALL_GAME_MODES_SET.has(mode) || isDailyMode(mode)
      || isCountingLeaderboardMode(mode) || isSurvivalLeaderboardMode(mode));
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

/**
 * Cycle 57: server-side display-name validation. The client gate was removed
 * in Cycle 51, so this is now the authority. Strips C0/C1 control and
 * zero-width / BOM characters, collapses internal whitespace, trims, and
 * bounds length by Unicode code points (an emoji counts as one). Permissive on
 * Unicode letters for international names. Returns the cleaned name or throws
 * ValidationError('name_empty' | 'name_too_long').
 */
export function sanitizeDisplayName(raw: unknown): string {
  if (typeof raw !== 'string') throw new ValidationError('name_empty');
  // Drop control chars (C0/C1), zero-width chars, and BOM; collapse whitespace.
  let cleaned = '';
  for (const ch of raw) {
    const cp = ch.codePointAt(0) ?? 0;
    const isControl = cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f);
    const isZeroWidth = (cp >= 0x200b && cp <= 0x200d) || cp === 0xfeff;
    if (!isControl && !isZeroWidth) cleaned += ch;
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) throw new ValidationError('name_empty');
  if (Array.from(cleaned).length > 20) throw new ValidationError('name_too_long');
  return cleaned;
}

/**
 * Cycle 57: rename an existing player's display name. Authenticated callers
 * only - the route derives persistentId from the verified token, never from
 * the request body, so a player can rename only their own row. Validates the
 * name, is idempotent on the current name (no discriminator burned), and
 * otherwise allocates a fresh discriminator for the new name and updates
 * display_name + discriminator + full_name. UPDATE of existing columns only -
 * no migration. The old (name, discriminator) pair is left in `discriminators`
 * (harmless; reclaiming it would race a concurrent allocation).
 */
export async function renamePlayer(
  db: D1Database,
  persistentId: string,
  requestedName: string,
): Promise<PlayerRow> {
  const cleaned = sanitizeDisplayName(requestedName);
  const existing = await db
    .prepare('SELECT * FROM players WHERE persistent_id = ?')
    .bind(persistentId)
    .first<PlayerRow>();
  if (!existing) throw new NotFoundError('player not found');

  const now = Date.now();

  // Idempotent: renaming to the current name is a no-op success - don't burn a
  // discriminator or rewrite full_name, just bump last_active.
  if (cleaned === existing.display_name) {
    await db
      .prepare('UPDATE players SET last_active = ? WHERE persistent_id = ?')
      .bind(now, persistentId)
      .run();
    existing.last_active = now;
    return existing;
  }

  const discriminator = await allocateDiscriminator(db, cleaned);
  const fullName = `${cleaned}#${discriminator}`;
  await db
    .prepare(
      'UPDATE players SET display_name = ?, discriminator = ?, full_name = ?, last_active = ? WHERE persistent_id = ?',
    )
    .bind(cleaned, discriminator, fullName, now, persistentId)
    .run();

  existing.display_name = cleaned;
  existing.discriminator = discriminator;
  existing.full_name = fullName;
  existing.last_active = now;
  return existing;
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

// Cycle 58: the four solo difficulty slugs. Their leaderboard identity is
// (scene, count) — the slug only selects the (now display-only) materialized
// best column. Used to route submit validation + the leaderboard read through
// the per-scene ladder instead of the fixed per-slug count table.
const SOLO_MODES_SET: ReadonlySet<string> = new Set([
  'soloClassic',
  'soloExtreme',
  'soloInsane',
  'soloChaos',
]);

export function isSoloMode(mode: unknown): boolean {
  return typeof mode === 'string' && SOLO_MODES_SET.has(mode);
}

// Back-compat alias used heavily inside the file.
const TIME_MODES = { includes: (mode: GameMode) => isTimeMode(mode) };

export function submissionScoreBoundsOk(mode: GameMode, score: number): boolean {
  // Cycle 59 (Counting Sheep): the counted total is the score - an integer in
  // [0, 5000] (the proven capacity ceiling). No upper-bound time check; counting
  // is not duration-scored.
  if (isCountingLeaderboardMode(mode)) {
    return Number.isInteger(score) && score >= 0 && score <= COUNTING_HARD_CEILING;
  }
  // Cycle 66 P6: survival score is the peak flock size - a non-negative integer
  // bounded generously (the real ceiling is the scene's maxFlock; a loose bound
  // here means a feel-pass retune needs no Worker change).
  if (isSurvivalLeaderboardMode(mode)) {
    return Number.isInteger(score) && score >= 0 && score <= SURVIVAL_MAX_SCORE;
  }
  // Cycle 58: the lower bound on time-mode scores drops 30 -> 10. The real
  // per-(scene, count) plausibility floor is now `plausibleScoreForCount`
  // (graduated 12-26s for the islands' small solo tiers, unchanged 30s+ for the
  // legacy counts), so this is only a coarse absolute-sanity bound. Existing
  // modes are unaffected: their plausibility floor stays >= 30, so the effective
  // floor (max of the two) is unchanged; only the new small solo tiers can land
  // between their per-count floor and 30s.
  if (isTimeMode(mode)) return score >= 10 && score <= 3600;
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
// Cycle 58: the solo entries here are retained only to satisfy the exhaustive
// key type; solo (scene, count) validation now routes through the per-scene
// ranked ladder (see modeSheepCountOk), not this fixed per-slug table. timed /
// competitive / cooperative still use it.
const ALLOWED_MODE_SHEEPCOUNT: Record<
  Exclude<GameMode, `daily-${string}` | 'counting-incremental' | 'counting-exponential' | 'survival'>,
  number[] | 'any'
> = {
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

/**
 * Cross-field plausibility: is this (mode, sheep_count) pairing allowed?
 *
 * Cycle 58: solo modes validate against the SUBMITTED SCENE'S ranked ladder
 * (`getRankedCounts`) rather than a fixed per-slug count — a solo `(scene,
 * count)` is valid iff `count` is a ranked rung on that scene. An unknown or
 * absent scene falls back to the legacy ranked set ([200, 1000, 3000, 5000]),
 * so a pre-scene or stale client still validates against the old anchors. daily
 * / timed / competitive / cooperative are unchanged.
 */
export function modeSheepCountOk(mode: GameMode, sheepCount: number, sceneId?: string | null): boolean {
  // Cycle 59 (Counting Sheep): sheep_count is not part of the counting board
  // identity (the count is the score, not a fixed tier), so any submitted value
  // is accepted - the column is simply unused for these rows.
  if (isCountingLeaderboardMode(mode)) return true;
  // Cycle 66 P6: survival's identity is (scene, mode); the score IS the flock
  // size, so the submitted sheep_count is unused for these rows.
  if (isSurvivalLeaderboardMode(mode)) return true;
  if (isDailyMode(mode)) {
    return sheepCount >= DAILY_SHEEP_MIN && sheepCount <= DAILY_SHEEP_MAX;
  }
  if (isSoloMode(mode)) {
    const scene = sceneId ? getSceneById(sceneId) : undefined;
    return getRankedCounts(scene).includes(sheepCount);
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

// Cycle 58: solo-mode floors, graduated down for the islands' smaller ranked
// tiers (25 / 50 / 75 / 150 / 600) so a clean fast small-flock run is not
// hard-rejected, while the legacy 200/1000/3000/5000 floors stay exactly as
// before. Scoped to solo modes (see durationFloorForCount) so daily-* keeps its
// own 30s-for-<200 floor and the 50-200 daily window is unchanged.
const SOLO_DURATION_FLOORS: Array<[number, number]> = [
  [25, 12],
  [50, 16],
  [75, 20],
  [150, 26],
  [200, 30],
  [600, 60],
  [1000, 90],
  [3000, 180],
  [5000, 240],
];

export function durationFloorForCount(sheepCount: number, mode?: GameMode): number {
  // Solo modes use the graduated small-tier floors; everything else (daily,
  // cooperative) uses the legacy table. Pick the largest entry whose
  // count <= sheepCount; defaults to 30s.
  const table = mode && isSoloMode(mode) ? SOLO_DURATION_FLOORS : MIN_PLAUSIBLE_DURATION_BY_COUNT;
  let floor = 30;
  for (const [count, minSec] of table) {
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
  return score >= durationFloorForCount(sheepCount, mode);
}

export interface ScoreAnomaly {
  tag: string;
  detail?: Record<string, unknown>;
}

// Cycle 59 (Counting Sheep): a soft lower bound on how fast a counted total can
// physically be herded. Generous by design (0.05s per counted sheep -> a banked
// 5000 implies >= ~250s, mirroring the Chaos duration floor), so a legitimate run
// never trips while a forged "counted 5000 in 8 seconds" gets a soft flag and is
// hidden from the public board. Soft signal only; never a hard reject.
const COUNTING_MIN_SEC_PER_SHEEP = 0.05;

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
  pausedMs?: number | null;
  serverNow: number;
}): ScoreAnomaly[] {
  const anomalies: ScoreAnomaly[] = [];

  // 1) Client clock skew: the claimed `score` is pause-subtracted active play
  //    time (the client GameTimer subtracts pausedTime), so it must be compared
  //    against the ACTIVE wall-clock window, not the raw one. Subtract the
  //    client-reported pause before measuring divergence — otherwise any
  //    legitimate run with >10s of pause (pause menu, backgrounded tab) reads
  //    as a 10s+ skew and gets hidden from the board (the leaderboard query
  //    gates on score_anomalies IS NULL). Credit the reported pause only if it
  //    is a sane minority of the window (<=80%); a forged fast score padded
  //    with a huge pausedMs gets zero credit and still trips. Pre-pausedMs
  //    clients omit the field entirely; skip the check for them rather than
  //    re-introduce the false positive (hard rejects + fast_for_count remain).
  if (
    typeof input.clientStartedAt === 'number' &&
    typeof input.clientFinishedAt === 'number' &&
    typeof input.pausedMs === 'number' &&
    TIME_MODES.includes(input.mode)
  ) {
    const rawWindowMs = input.clientFinishedAt - input.clientStartedAt;
    const guardOk = input.pausedMs >= 0 && input.pausedMs <= rawWindowMs * 0.8;
    const creditedPauseMs = guardOk ? input.pausedMs : 0;
    const activeDurationSec = (rawWindowMs - creditedPauseMs) / 1000;
    const skew = Math.abs(activeDurationSec - input.score);
    if (skew > 10) {
      anomalies.push({
        tag: 'client_clock_skew',
        detail: {
          claimed_score: input.score,
          active_duration_sec: Math.round(activeDurationSec * 10) / 10,
          paused_ms: input.pausedMs,
          credited_pause_ms: creditedPauseMs,
          skew_sec: Math.round(skew * 10) / 10,
        },
      });
    }
  }

  // 2) Fast-for-count: passes the hard plausibility floor but still falls
  //    in the bottom 10% of the floor range (e.g. 95s for soloExtreme).
  //    Soft signal — informs future floor tuning.
  if (TIME_MODES.includes(input.mode)) {
    const floor = durationFloorForCount(input.sheepCount, input.mode);
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

  // 3) Counting-too-fast: the counted total (= score) implies a physical herding
  //    floor; an active window shorter than that is implausible. Counting is not
  //    a TIME_MODE, so the checks above skip it - this is its dedicated soft
  //    signal. Same pause-credit handling as the clock-skew check.
  if (
    isCountingLeaderboardMode(input.mode) &&
    typeof input.clientStartedAt === 'number' &&
    typeof input.clientFinishedAt === 'number'
  ) {
    const rawWindowMs = input.clientFinishedAt - input.clientStartedAt;
    const pausedMs = typeof input.pausedMs === 'number' ? input.pausedMs : 0;
    const guardOk = pausedMs >= 0 && pausedMs <= rawWindowMs * 0.8;
    const creditedPauseMs = guardOk ? pausedMs : 0;
    const activeDurationSec = (rawWindowMs - creditedPauseMs) / 1000;
    const floorSec = input.score * COUNTING_MIN_SEC_PER_SHEEP;
    if (activeDurationSec < floorSec) {
      anomalies.push({
        tag: 'counting_too_fast',
        detail: {
          counted: input.score,
          active_duration_sec: Math.round(activeDurationSec * 10) / 10,
          floor_seconds: Math.round(floorSec * 10) / 10,
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

  // Cycle 10 Phase 6 + Cycle 58: cross-field plausibility — hard rejects. Solo
  // modes validate the count against the submitted scene's ranked ladder.
  if (!modeSheepCountOk(gameMode, sheepCount, sceneId)) {
    throw new Error(`sheep_count ${sheepCount} not allowed for mode ${gameMode} on scene ${sceneId}`);
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
  // Cycle 57 Phase 1: active-play pause window. Absent on pre-Cycle-57
  // clients -> the skew check is skipped rather than run against the raw
  // (pause-inclusive) window.
  const pausedMs = typeof additionalData.pausedMs === 'number'
    ? (additionalData.pausedMs as number)
    : null;
  const anomalies = detectScoreAnomalies({
    mode: gameMode,
    score,
    sheepCount,
    clientStartedAt,
    clientFinishedAt,
    pausedMs,
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
  // The only remaining GameMode member is `daily-${string}`, which has no
  // materialized player-row column (it partitions by date in score_submissions).
  // It has no fixed column to return, so this is unreachable for any real caller.
  throw new Error(`scoreColumn: no column for game mode ${mode}`);
}

export function formatScore(mode: GameMode | 'solo', score: number | null): string {
  if (score === null || score === undefined || Number.isNaN(score)) return 'No score';
  // Cycle 58: 'solo' is the (scene, count) aggregate read pseudo-mode; it is
  // time-based (lower is better), so it formats mm:ss like the slug modes.
  if (mode === 'solo' || TIME_MODES.includes(mode as GameMode)) {
    const m = Math.floor(score / 60);
    const s = Math.floor(score % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  // Cycle 59 (Counting Sheep): the counted total reads as a sheep tally.
  if (isCountingLeaderboardMode(mode)) {
    return `${score} sheep`;
  }
  // Cycle 66 P6: survival score is the peak flock size, read as a sheep tally.
  if (isSurvivalLeaderboardMode(mode)) {
    return `${score} sheep`;
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
  mode: GameMode | 'solo',
  limit = 10,
  filters: LeaderboardFilters = {},
): Promise<LeaderboardEntry[]> {
  // Partitioned path: filter score_submissions by (mode, scene, sheepCount)
  // and aggregate per player. For TIME_MODES we want MIN(score). For 'timed'
  // we want MAX(score). For 'competitive' we want COUNT of wins (score=1
  // submissions). Join back to players for display fields.
  //
  // Cycle 58: 'solo' is the aggregate read pseudo-mode. Solo leaderboard
  // identity is (scene_id, sheep_count), so a solo board spans ALL four solo
  // slugs at the requested count and is keyed on the count, not the slug. This
  // is behavior-preserving for existing rows: each legacy (scene, slug) is
  // count-homogeneous (Field classic is always 200, etc.), so grouping by count
  // across the slugs yields the identical membership the per-slug query did
  // (proven byte-identical in tests/worker/leaderboard-partition.spec.ts).
  const isSolo = mode === 'solo';
  const isTimeMode = isSolo || TIME_MODES.includes(mode as GameMode);
  const isCompetitive = mode === 'competitive';
  const aggSql = isCompetitive
    ? 'SUM(s.score)'
    : (isTimeMode ? 'MIN(s.score)' : 'MAX(s.score)');
  const orderDir = isCompetitive
    ? 'DESC'
    : (isTimeMode ? 'ASC' : 'DESC');

  const where: string[] = [];
  const binds: any[] = [];
  if (isSolo) {
    // Constant slug set — inlined literals (no user input), so no bind needed.
    where.push("s.game_mode IN ('soloClassic', 'soloExtreme', 'soloInsane', 'soloChaos')");
  } else {
    where.push('s.game_mode = ?');
    binds.push(mode);
  }
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
  // Cycle 59 (Counting Sheep): counting partitions by (game_mode, scene_id) and
  // ignores sheep_count entirely, so never narrow a counting board by it even if
  // a caller passes a count (defensive; getAllLeaderboards already omits it).
  // Cycle 66 P6: survival, like counting, partitions by (game_mode, scene_id)
  // and ignores sheep_count, so never narrow a survival board by it.
  if (!isCountingLeaderboardMode(mode) && !isSurvivalLeaderboardMode(mode)
      && typeof filters.sheepCount === 'number' && filters.sheepCount > 0) {
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
  const out: Record<string, LeaderboardEntry[]> = {};

  // Cycle 58: solo boards are now keyed `solo:<count>` and partition by
  // (scene, count) instead of by the four difficulty slugs — one board per
  // ranked rung of the REQUESTED scene's ladder. The four `soloClassic` etc.
  // keys are gone from the response (the UI builds count tabs from the ladder).
  // For an existing anchor count (e.g. field/200) `solo:200` is byte-identical
  // to the old `soloClassic` board.
  const nonSolo = ALL_GAME_MODES.filter(m => !isSoloMode(m)); // timed, competitive, cooperative
  const nonSoloResults = await Promise.all(
    nonSolo.map(m => {
      // Cycle 12 Phase 6 + Cycle 35 Phase 4: per-mode filter dispatch. 'timed'
      // has a fixed intrinsic sheep count, so the dropdown is meaningful only
      // for competitive/cooperative — strip it for timed (preserving
      // includeFlagged) so picking "250 sheep" doesn't blank the timed board.
      const perMode: LeaderboardFilters = MODES_WITH_FIXED_SHEEP_COUNT.has(m)
        ? { sceneId: filters.sceneId, includeFlagged: filters.includeFlagged }
        : filters;
      return getLeaderboard(db, m, limit, perMode);
    }),
  );
  nonSolo.forEach((m, i) => { out[m] = nonSoloResults[i]; });

  // One solo board per ranked count on the requested scene's ladder.
  const scene = filters.sceneId && filters.sceneId !== 'any'
    ? getSceneById(filters.sceneId)
    : undefined;
  const counts = getRankedCounts(scene);
  const soloResults = await Promise.all(
    counts.map(c => getLeaderboard(db, 'solo', limit, {
      sceneId: filters.sceneId,
      sheepCount: c,
      includeFlagged: filters.includeFlagged,
    })),
  );
  counts.forEach((c, i) => { out[`solo:${c}`] = soloResults[i]; });

  // Cycle 59 (Counting Sheep): one board per curve, keyed by the counting mode
  // string, partitioned by (game_mode, scene_id) and ranked by counted DESC. No
  // sheep-count dropdown (the count is the score), so pass only the scene. This
  // is purely additive - existing solo / non-solo boards above are untouched. For
  // a scene that does not offer counting (Open Country) the board is simply
  // empty; the client decides whether to surface the tabs from the scene family.
  const countingResults = await Promise.all(
    COUNTING_LEADERBOARD_MODES.map(m => getLeaderboard(db, m as GameMode, limit, {
      sceneId: filters.sceneId,
      includeFlagged: filters.includeFlagged,
    })),
  );
  COUNTING_LEADERBOARD_MODES.forEach((m, i) => { out[m] = countingResults[i]; });

  // Cycle 66 P6: the survival board (one key), partitioned by (game_mode, scene_id)
  // and ranked by peak flock DESC. Additive; empty for non-survival scenes, so the
  // client decides whether to surface the tab from the scene family.
  out[SURVIVAL_LEADERBOARD_MODE] = await getLeaderboard(db, SURVIVAL_LEADERBOARD_MODE as GameMode, limit, {
    sceneId: filters.sceneId,
    includeFlagged: filters.includeFlagged,
  });

  return out;
}
