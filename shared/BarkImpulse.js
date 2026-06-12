// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/**
 * Deterministic bark steering.
 *
 * A bark does not push sheep by editing velocity. It marks active sheep inside
 * the dog's forward cone with a short steering intent. The ordinary sheep tick
 * then adds a decaying acceleration in that direction, so the existing max-speed
 * clamp and smoothing own the final movement.
 *
 * Determinism contract (.claude/rules/shared-sim.md): pure, no DOM/Three/window,
 * no Math.random, no Date.now, and no trig in the body. The forward-cone test is
 * a dot product against a hardcoded cos(halfAngle) constant. Only +, -, *, / and
 * Math.sqrt appear here.
 */

export const DEFAULT_BARK_CONFIG = {
    range: 24,
    minDot: 0.6427876096865393, // cos(50 deg)
    steerForce: 0.16,
    durationTicks: 30,
    cooldownMs: 2500,
};

function isBarkSteerable(sheep) {
    return sheep
        && sheep.position
        && sheep.acceleration
        && (sheep.state === undefined || sheep.state === 0)
        && sheep.isRetiring !== true
        && sheep.isAscending !== true
        && sheep.dormant !== true
        && sheep.killed !== true;
}

function clearBarkSteering(sheep) {
    sheep.barkSteerTicks = 0;
    sheep.barkSteerDurationTicks = 0;
    sheep.barkSteerForce = 0;
}

/**
 * Start a short forward steering intent for every active sheep inside the dog's
 * bark cone. Sheep outside the cone/range are untouched.
 *
 * @param {Array<{position:{x:number,z:number}, acceleration:{x:number,z:number}}>} sheep
 * @param {{x:number,z:number}} origin
 * @param {{x:number,z:number}} forward
 * @param {{range:number,minDot:number,steerForce:number,durationTicks:number}} [config]
 * @returns {number} count of sheep that received steering intent.
 */
export function startBarkSteering(sheep, origin, forward, config = DEFAULT_BARK_CONFIG) {
    if (!sheep || sheep.length === 0) return 0;

    const range = config.range;
    const minDot = config.minDot;
    const steerForce = config.steerForce;
    const durationTicks = config.durationTicks;
    const rangeSq = range * range;
    const fx = forward.x;
    const fz = forward.z;
    let steered = 0;

    for (let i = 0; i < sheep.length; i++) {
        const s = sheep[i];
        if (!isBarkSteerable(s)) continue;

        const dx = s.position.x - origin.x;
        const dz = s.position.z - origin.z;
        const distSq = dx * dx + dz * dz;
        if (distSq > rangeSq) continue;

        const dist = Math.sqrt(distSq);
        let falloff;
        if (dist < 1e-6) {
            // Point-blank: full steering force straight along facing (cone test moot).
            falloff = 1;
        } else {
            // Cone test: dot of (dog->sheep) unit vector against the forward unit.
            const dot = (dx / dist) * fx + (dz / dist) * fz;
            if (dot < minDot) continue;
            falloff = 1 - dist / range; // linear, in (0, 1]
        }

        s.barkSteerTicks = durationTicks;
        s.barkSteerDurationTicks = durationTicks;
        s.barkSteerX = fx;
        s.barkSteerZ = fz;
        s.barkSteerForce = steerForce * falloff;
        steered++;
    }

    return steered;
}

/**
 * Apply one tick of a pending bark steering intent. Mutates acceleration only;
 * normal movement integration applies speed limits and smoothing.
 *
 * @param {{acceleration:{x:number,z:number}, barkSteerTicks?:number, barkSteerDurationTicks?:number, barkSteerX?:number, barkSteerZ?:number, barkSteerForce?:number}} sheep
 * @returns {boolean} true when a steering force was applied.
 */
export function tickBarkSteering(sheep) {
    if (!sheep || (sheep.barkSteerTicks ?? 0) <= 0) return false;
    if (!isBarkSteerable(sheep)) {
        clearBarkSteering(sheep);
        return false;
    }

    const decay = sheep.barkSteerTicks / sheep.barkSteerDurationTicks;
    const force = sheep.barkSteerForce * decay;
    sheep.acceleration.x += sheep.barkSteerX * force;
    sheep.acceleration.z += sheep.barkSteerZ * force;
    sheep.barkSteerTicks--;
    if (sheep.barkSteerTicks <= 0) clearBarkSteering(sheep);
    return true;
}
