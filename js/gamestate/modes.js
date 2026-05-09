/**
 * Mode dispatch tables — Cycle 29 Stream B1.
 *
 * Single edit-point for "what does mode X do." Replaces inline
 * `if (this.gameMode === 'competitive')` branches scattered across
 * GameState's getGate / getPasture / updateUI / updatePlayerScore /
 * getPlayerScore / submitScoreToLeaderboard.
 *
 * Adding a new gameMode is now a one-row table edit instead of four
 * call-site edits.
 *
 * Pure data + pure helpers. No side effects. No imports from js/.
 */

/**
 * Solo singlePlayerMode → totalSheep count. Cycle 9 Phase 1 lockdown:
 * the per-mode count is owned by mode (not scene def) for solo runs.
 * Multiplayer reads from room.sheepCount instead.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const SOLO_MODE_SHEEP_COUNT = Object.freeze({
    practice: 30,
    classic: 200,
    extreme: 1000,
    insane: 3000,
    chaos: 5000,
});

/**
 * Solo singlePlayerMode → leaderboard slug. Cycle 8 Phase 2b lookup
 * — replaces the prior `extreme ? 'soloExtreme' : 'soloClassic'` ternary
 * that silently dumped insane (3000) and chaos (5000) runs into the
 * soloClassic leaderboard. Practice has no leaderboard (gated separately
 * in submitScoreToLeaderboard).
 *
 * @type {Readonly<Record<string, string>>}
 */
export const SOLO_MODE_TO_LEADERBOARD = Object.freeze({
    classic: 'soloClassic',
    extreme: 'soloExtreme',
    insane: 'soloInsane',
    chaos: 'soloChaos',
});

/**
 * Solo modes that opt into the spatial-hash extreme boid path.
 * Sandbox separately sets `useExtremeBoids` from its config.
 *
 * @type {ReadonlySet<string>}
 */
export const EXTREME_BOID_SOLO_MODES = Object.freeze(new Set(['extreme', 'insane', 'chaos']));

/**
 * @param {string | undefined} singlePlayerMode
 * @returns {boolean}
 */
export function isExtremeBoidMode(singlePlayerMode) {
    return EXTREME_BOID_SOLO_MODES.has(singlePlayerMode);
}

/**
 * Capability descriptor for a top-level gameMode.
 *
 * @typedef {object} ModeCapabilities
 * @property {boolean} tracksPlayerScores  — playerScores[playerId] is read/written
 * @property {boolean} usesCompetitiveGates — getGate/getPasture return the array, not the single
 * @property {'cooperative' | 'competitive' | 'timed'} uiVariant — which updateXxxUI to dispatch
 * @property {boolean} submitsToLeaderboard — false for sandbox (practice gated separately by singlePlayerMode)
 */

/**
 * @type {Readonly<Record<string, ModeCapabilities>>}
 */
export const MODE_CAPABILITIES = Object.freeze({
    solo: Object.freeze({
        tracksPlayerScores: false,
        usesCompetitiveGates: false,
        uiVariant: 'cooperative',
        submitsToLeaderboard: true,
    }),
    multiplayer: Object.freeze({
        tracksPlayerScores: false,
        usesCompetitiveGates: false,
        uiVariant: 'cooperative',
        submitsToLeaderboard: true,
    }),
    competitive: Object.freeze({
        tracksPlayerScores: true,
        usesCompetitiveGates: true,
        uiVariant: 'competitive',
        submitsToLeaderboard: true,
    }),
    timed: Object.freeze({
        // Timed shares cooperative gates (one shared gate for all players)
        // but tracks per-player scores and runs the timed UI variant.
        tracksPlayerScores: true,
        usesCompetitiveGates: false,
        uiVariant: 'timed',
        submitsToLeaderboard: true,
    }),
    sandbox: Object.freeze({
        tracksPlayerScores: false,
        usesCompetitiveGates: false,
        uiVariant: 'cooperative',
        submitsToLeaderboard: false,
    }),
});

const DEFAULT_CAPABILITIES = MODE_CAPABILITIES.solo;

/**
 * Lookup with safe fallback. Unknown gameModes get the solo defaults
 * (single-gate, cooperative UI, leaderboard-eligible) — defensive against
 * a stray string from an old save or a bad room state.
 *
 * @param {string | undefined} gameMode
 * @returns {ModeCapabilities}
 */
export function getModeCapabilities(gameMode) {
    return MODE_CAPABILITIES[gameMode] || DEFAULT_CAPABILITIES;
}
