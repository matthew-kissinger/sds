// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Pure wolf-AI helpers.
 *
 * Cycle 67 P1: PROMOTED to `shared/survival/` (was `js/gamestate/wolfBehavior.js`
 * in Cycle 66) so the Worker `GameSim` can run the wolf decision math for co-op
 * survival. `js/gamestate/wolfBehavior.js` is a one-line re-export shim so every
 * existing client import keeps working.
 *
 * No DOM, no Three, no `Math.random` here - the wolf state machine
 * (`shared/survival/wolves.js`, Cycle 67 P2) passes a seeded RNG in where
 * randomness is needed. `Math.hypot` is sqrt-based (IEEE-754 pinned) and fine.
 */

/**
 * How many wolves spawn on a given survival night. Escalates per day from a
 * small starter pack to a hard ceiling (2 on night one, +1/day, cap 8). Exposed
 * as opts so Matt's feel pass can retune without code change.
 * @param {number} day            1-based survival day.
 * @param {Object} [opts]
 * @param {number} [opts.base=2]   wolves on night one.
 * @param {number} [opts.perDay=1] additional wolves per day after the first.
 * @param {number} [opts.max=8]    hard ceiling on pack size.
 * @returns {number}
 */
export function spawnCountForDay(day, opts = {}) {
    const base = opts.base ?? 2;
    const perDay = opts.perDay ?? 1;
    const max = opts.max ?? 8;
    const d = Math.max(1, Math.floor(day) || 1);
    return Math.max(0, Math.min(max, base + (d - 1) * perDay));
}

/**
 * Index of the nearest huntable sheep to a point, or -1 if none. O(n) scan over
 * the flock; the pack runs it per wolf per frame (a few wolves x tens of sheep
 * is trivial). `isHuntable(sheep)` gates protection (penned / inside the pen /
 * already killed are not huntable).
 * @param {number} x
 * @param {number} z
 * @param {Array<{position?:{x:number,z:number}}>} sheep
 * @param {(s:any)=>boolean} isHuntable
 * @returns {number}
 */
export function nearestHuntableIndex(x, z, sheep, isHuntable) {
    if (!Array.isArray(sheep)) return -1;
    let best = -1;
    let bestD2 = Infinity;
    for (let i = 0; i < sheep.length; i++) {
        const s = sheep[i];
        const p = s && s.position;
        if (!p || !isHuntable(s)) continue;
        const dx = p.x - x, dz = p.z - z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; best = i; }
    }
    return best;
}

/**
 * Steer a body toward a target at `speed`, capped so it never overshoots in one
 * step. Returns the new {x,z} plus the planar `speed` actually travelled (for
 * the gait blend). Pure: caller integrates.
 * @param {number} x
 * @param {number} z
 * @param {number} tx
 * @param {number} tz
 * @param {number} speed  m/s
 * @param {number} dt     s
 * @returns {{x:number, z:number, moved:number, dirX:number, dirZ:number}}
 */
export function stepToward(x, z, tx, tz, speed, dt) {
    const dx = tx - x, dz = tz - z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-5) return { x, z, moved: 0, dirX: 0, dirZ: 0 };
    const dirX = dx / d, dirZ = dz / d;
    const adv = Math.min(d, speed * dt);
    return { x: x + dirX * adv, z: z + dirZ * adv, moved: adv / Math.max(dt, 1e-5), dirX, dirZ };
}

/**
 * Steer a body directly AWAY from a point (bark repel / dawn retreat) at
 * `speed`. Returns the same shape as stepToward. If the body sits exactly on the
 * origin a stable fallback direction (+x) is used so it still flees.
 * @param {number} x
 * @param {number} z
 * @param {number} ox  origin to flee from
 * @param {number} oz
 * @param {number} speed
 * @param {number} dt
 * @returns {{x:number, z:number, moved:number, dirX:number, dirZ:number}}
 */
export function stepAway(x, z, ox, oz, speed, dt) {
    let dx = x - ox, dz = z - oz;
    let d = Math.hypot(dx, dz);
    if (d < 1e-5) { dx = 1; dz = 0; d = 1; }
    const dirX = dx / d, dirZ = dz / d;
    const adv = speed * dt;
    return { x: x + dirX * adv, z: z + dirZ * adv, moved: speed, dirX, dirZ };
}
