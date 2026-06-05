// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 58 — solo difficulty ladder resolver.
 *
 * Single source of truth for "how many sheep does difficulty <id> spawn on
 * scene <X>, and is that rung ranked." Replaces the flat per-id
 * `SOLO_MODE_SHEEP_COUNT` table (js/gamestate/modes.js, now a back-compat
 * re-export of the legacy default below) so the two islands can run smaller,
 * faster tiers than Home Field without touching Home Field's ranked counts.
 *
 * Pure data + pure helpers. No DOM, no imports from `js/`, no Three.js — this
 * module is consumed by BOTH the client (entrance + GameState) and the Worker
 * (submit allow-list + leaderboard count tabs), so it lives in `shared/` under
 * the deterministic-sim import discipline (.claude/rules/shared-sim.md).
 *
 * Leaderboard identity is `(scene_id, count)`, NOT the id. The id is just the
 * armed `singlePlayerMode` handle; two biomes may reuse an id for different
 * counts, and the same count is one comparable board across whatever ids share
 * it. See docs/cycle-58-plan.md.
 */

/**
 * Legacy default ladder for scenes that declare no `soloLadder`. Reproduces the
 * pre-Cycle-58 flat counts exactly (practice 30 / classic 200 / extreme 1000 /
 * insane 3000 / chaos 5000) with practice unranked, so any opt-out scene
 * behaves byte-identically to today.
 *
 * @type {ReadonlyArray<import('./scenes/types.js').SoloLadderEntry>}
 */
export const LEGACY_SOLO_LADDER = Object.freeze([
    Object.freeze({ id: 'practice', count: 30, ranked: false, label: 'Just Play' }),
    Object.freeze({ id: 'classic', count: 200, ranked: true, label: 'Classic' }),
    Object.freeze({ id: 'extreme', count: 1000, ranked: true, label: 'Extreme' }),
    Object.freeze({ id: 'insane', count: 3000, ranked: true, label: 'Insane' }),
    Object.freeze({ id: 'chaos', count: 5000, ranked: true, label: 'Chaos' }),
]);

/**
 * The ordered solo ladder for a scene. Returns the scene's own `soloLadder`
 * when present and non-empty, else the legacy default. Defensive against a
 * null/blank scene (returns the legacy default) so callers never crash on a
 * pre-boot or unknown scene.
 *
 * @param {import('./scenes/types.js').SceneDef | null | undefined} scene
 * @returns {ReadonlyArray<import('./scenes/types.js').SoloLadderEntry>}
 */
export function getSoloLadder(scene) {
    if (scene && Array.isArray(scene.soloLadder) && scene.soloLadder.length > 0) {
        return scene.soloLadder;
    }
    return LEGACY_SOLO_LADDER;
}

/**
 * The ladder entry for a difficulty id on a scene, or undefined if the scene's
 * ladder has no such id.
 *
 * @param {import('./scenes/types.js').SceneDef | null | undefined} scene
 * @param {string | undefined} id
 * @returns {import('./scenes/types.js').SoloLadderEntry | undefined}
 */
export function getLadderEntry(scene, id) {
    return getSoloLadder(scene).find((e) => e.id === id);
}

/**
 * The sheep count (totalSheep) for a difficulty id on a scene. Falls back, in
 * order, to: the legacy default for that id, then the scene's first ranked
 * count, then 200 — so a stale stored id (e.g. localStorage 'insane' while an
 * island without that rung is armed) still resolves to a sane, playable count
 * instead of NaN.
 *
 * @param {import('./scenes/types.js').SceneDef | null | undefined} scene
 * @param {string | undefined} id
 * @returns {number}
 */
export function getSoloCount(scene, id) {
    const entry = getLadderEntry(scene, id);
    if (entry) return entry.count;
    const legacy = LEGACY_SOLO_LADDER.find((e) => e.id === id);
    if (legacy) return legacy.count;
    const ranked = getRankedCounts(scene);
    return ranked.length > 0 ? ranked[0] : 200;
}

/**
 * The ranked sheep counts for a scene, in ladder order. This is the
 * leaderboard partition set for the scene (each count is one `(scene, count)`
 * board) AND the Worker submit allow-list (a solo `(scene, count)` submission
 * is valid iff its count is in this list). De-duplicated defensively.
 *
 * @param {import('./scenes/types.js').SceneDef | null | undefined} scene
 * @returns {number[]}
 */
export function getRankedCounts(scene) {
    const seen = new Set();
    const out = [];
    for (const e of getSoloLadder(scene)) {
        if (e.ranked && !seen.has(e.count)) {
            seen.add(e.count);
            out.push(e.count);
        }
    }
    return out;
}

/**
 * Whether a difficulty id is a ranked rung on a scene (leaderboard-eligible).
 * Unranked rungs (Just Play) never submit. An unknown id is treated as
 * unranked.
 *
 * @param {import('./scenes/types.js').SceneDef | null | undefined} scene
 * @param {string | undefined} id
 * @returns {boolean}
 */
export function isRankedDifficulty(scene, id) {
    const entry = getLadderEntry(scene, id);
    return entry ? entry.ranked === true : false;
}
