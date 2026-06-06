// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/**
 * Cycle 61 Phase 4 - deterministic bark impulse.
 *
 * The dog's bark drives nearby sheep forward along the dog's facing: a tactical
 * burst to push a cluster through a gate, split a jam, or nudge stragglers at
 * range. This module is the single source of that math so solo and multiplayer
 * feel identical - the solo sheep path, the Worker authoritative sim, and the
 * client predictor all call applyBarkImpulse with the same config.
 *
 * Determinism contract (.claude/rules/shared-sim.md): pure, no DOM/Three/window,
 * no Math.random, no Date.now, and NO trig in the body. The forward-cone test is
 * a dot product against a hardcoded cos(halfAngle) constant, and the push is
 * along a caller-supplied unit `forward` vector (derived from a velocity via
 * sqrt-normalize, which IS spec-pinned across engines). Only +, -, *, / and
 * Math.sqrt appear here. With no bark fired on a tick this module is never
 * called, so the sim is byte-identical to pre-bark and every committed
 * sim-baseline trace is unchanged.
 */

/**
 * Default bark feel constants (Q2 strawman, tuned in Phase 7). One place so the
 * cone / range / strength is a single taste knob shared by every consumer.
 * - range: metres the bark reaches.
 * - minDot: cos(50 deg), the forward half-cone. Hardcoded literal so no trig
 *   runs even at module load (a load-time Math.cos could differ by a ULP across
 *   engines and shift a boundary sheep in/out of the cone).
 * - strength: velocity units added point-blank; scales linearly to 0 at the edge.
 */
export const DEFAULT_BARK_CONFIG = {
    range: 12,
    minDot: 0.6427876096865393, // cos(50 deg)
    strength: 6,
    cooldownMs: 2500, // the single bark gate (Q2); client + DO both read this
};

/**
 * Apply a one-shot forward bark impulse to every sheep inside the dog's forward
 * cone. Mutates each affected sheep's velocity in place. The impulse is ADDED
 * (not assigned), so the existing per-tick speed clamp turns it into a
 * directional drive rather than a launch: in-cone sheep get their movement
 * aimed along the dog's facing. Sheep outside the cone or beyond range are
 * untouched.
 *
 * @param {Array<{position:{x:number,z:number}, velocity:{x:number,z:number}}>} sheep
 * @param {{x:number,z:number}} origin   Dog position (the bark source).
 * @param {{x:number,z:number}} forward  Unit vector of the dog's facing.
 * @param {{range:number,minDot:number,strength:number}} [config]
 * @returns {number} count of sheep pushed (for tests / telemetry).
 */
export function applyBarkImpulse(sheep, origin, forward, config = DEFAULT_BARK_CONFIG) {
    if (!sheep || sheep.length === 0) return 0;

    const range = config.range;
    const minDot = config.minDot;
    const strength = config.strength;
    const rangeSq = range * range;
    const fx = forward.x;
    const fz = forward.z;
    let pushed = 0;

    for (let i = 0; i < sheep.length; i++) {
        const s = sheep[i];
        if (!s || !s.position || !s.velocity) continue;

        const dx = s.position.x - origin.x;
        const dz = s.position.z - origin.z;
        const distSq = dx * dx + dz * dz;
        if (distSq > rangeSq) continue;

        const dist = Math.sqrt(distSq);
        let falloff;
        if (dist < 1e-6) {
            // Point-blank: full strength straight along facing (cone test moot).
            falloff = 1;
        } else {
            // Cone test: dot of (dog->sheep) unit vector against the forward unit.
            const dot = (dx / dist) * fx + (dz / dist) * fz;
            if (dot < minDot) continue;
            falloff = 1 - dist / range; // linear, in (0, 1]
        }

        const mag = strength * falloff;
        s.velocity.x += fx * mag;
        s.velocity.z += fz * mag;
        pushed++;
    }

    return pushed;
}
