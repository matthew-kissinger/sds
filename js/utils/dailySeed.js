/**
 * Cycle 27 Phase D — daily-seed micro-challenge.
 *
 * Given a Date, returns a deterministic challenge config: which scene,
 * how many sheep, time-of-day, target duration. The seed string is the
 * date stamp itself, hashed via FNV-1a so the same UTC day always
 * produces the same challenge across timezones, devices, and refreshes.
 *
 * Daily resets at UTC midnight — documented in the cycle plan; no
 * per-region rollover.
 *
 * The output drives:
 *   - the "Today's Challenge" tile on the start screen
 *   - the leaderboard partition (`daily-${dateKey}`)
 *   - GameState mode dispatch when the player picks the daily tile
 */

const SCENE_IDS = ['rolling-hills', 'open-country', 'field'];

const SHEEP_MIN = 50;
const SHEEP_MAX = 200;
const DURATION_MIN_SEC = 60;
const DURATION_MAX_SEC = 180;

/**
 * UTC-based YYYY-MM-DD key for a Date. `lastDailySeen` localStorage
 * compares against this — flipping at UTC midnight, NOT local midnight.
 */
export function dailyKey(date = new Date()) {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * FNV-1a 32-bit hash. Standard, deterministic, fork-safe across
 * platforms (no 64-bit wrap weirdness, no timezone drift).
 */
export function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Derive a challenge config from a Date. All ranges are inclusive
 * lower / exclusive upper, except where rounded to integers below.
 *
 * @param {Date} [date]
 * @returns {{
 *   dateKey: string,
 *   seedString: string,
 *   sceneId: string,
 *   sheepCount: number,
 *   timeOfDay: number,
 *   durationSec: number,
 *   leaderboardPartition: string,
 * }}
 */
export function dailySeedFor(date = new Date()) {
    const dateKey = dailyKey(date);
    const hash = fnv1a(dateKey);
    // Pull four independent variates by re-hashing with a salt suffix
    // — keeps each axis from being correlated to the others.
    const hScene = fnv1a(`${dateKey}:scene`) % SCENE_IDS.length;
    const hSheep = (fnv1a(`${dateKey}:sheep`) % 1000) / 1000;
    const hTod = (fnv1a(`${dateKey}:tod`) % 1000) / 1000;
    const hDur = (fnv1a(`${dateKey}:dur`) % 1000) / 1000;

    const sceneId = SCENE_IDS[hScene];
    const sheepCount = Math.round(lerp(SHEEP_MIN, SHEEP_MAX, hSheep));
    // Avoid hard-noon (0.5) and hard-night extremes — the play window
    // is roughly 0.15..0.85 across the dawn→dusk arc.
    const timeOfDay = lerp(0.15, 0.85, hTod);
    const durationSec = Math.round(lerp(DURATION_MIN_SEC, DURATION_MAX_SEC, hDur));

    return {
        dateKey,
        seedString: dateKey,
        sceneId,
        sheepCount,
        timeOfDay,
        durationSec,
        leaderboardPartition: `daily-${dateKey}`,
        // Surfaced so callers (start-screen tile, completion-screen
        // labels) don't need to recompute.
        rawHash: hash,
    };
}

export const __TEST_ONLY__ = { SCENE_IDS, SHEEP_MIN, SHEEP_MAX, DURATION_MIN_SEC, DURATION_MAX_SEC };
