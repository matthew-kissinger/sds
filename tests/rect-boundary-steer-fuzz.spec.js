// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, it, expect } from 'vitest';
import { Vector2D } from '../shared/Vector2D.js';
import {
    calculateBoundaryAvoidance,
    calculateBoundaryAvoidanceWithGate,
    calculateBoundaryAvoidanceWithMultipleGates,
} from '../shared/BoundaryCollision.js';

/**
 * rectBoundarySteer bit-exactness fuzz [upkeep A3].
 *
 * Commit 2d34a2b (P3-BOUNDARY-DRY) collapsed three near-duplicate inline
 * rect-force implementations into the shared rectBoundarySteer core in
 * shared/BoundaryCollision.js. The original verification was a throwaway
 * 600k-pair fuzz that was never committed (review dossier
 * docs/hardening/review-dossiers-2026-06-09.md, "GSV split +
 * BoundaryCollision DRY", flag: "claim not re-runnable"). This spec is the
 * re-runnable replacement.
 *
 * The three pre-DRY reimplementations below are copied faithfully from the
 * rect paths of the 2d34a2b parent commit
 * (b638e7204236eee9ef19047c6f13fc998075bdfb, i.e.
 * `git show 2d34a2b^:shared/BoundaryCollision.js`):
 *
 *   1. calculateRectAvoidance      - defaults margin 10 / maxSpeed 1.5 /
 *                                    maxForce 0.05, config-driven
 *                                    forceMultiplier (default 1.5), no gate.
 *   2. ...WithGate rect path       - defaults margin 3 / maxSpeed 0.1 /
 *                                    maxForce 0.02, HARDCODED 1.5 final
 *                                    multiplier, nearSouthGateX /
 *                                    nearNorthGateX carve-outs on minZ/maxZ.
 *   3. ...WithMultipleGates        - defaults margin 3 / maxSpeed 0.1 /
 *                                    maxForce 0.02, HARDCODED 1.5 final
 *                                    multiplier, direction-keyed carve-outs
 *                                    on all four sides.
 *
 * Every randomized input is driven through both the shipped exported entry
 * point (which routes through rectBoundarySteer) and the inline pre-DRY
 * copy; outputs must match under Object.is per component, so -0 vs 0 and
 * NaN divergences are caught. The PRNG is seeded (mulberry32, matching
 * tests/coastline-field.spec.js); do not introduce Math.random here.
 *
 * shared/ is NOT modified by this spec. The historical math lives only in
 * this file, by design.
 */

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32, same shape as tests/coastline-field.spec.js).
// ---------------------------------------------------------------------------
function mulberry32(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---------------------------------------------------------------------------
// Pre-DRY inline reimplementations, copied from
// git show 2d34a2b^:shared/BoundaryCollision.js (parent b638e72).
// Only mechanical changes: function renamed, dispatcher branches dropped
// (we drive rect-only inputs), `boundary` renamed back to `bounds` where the
// original rect path aliased it. Float operations and their order are
// untouched.
// ---------------------------------------------------------------------------

// Variant 1: pre-DRY calculateRectAvoidance (2d34a2b^ lines 87-127).
function preDryRectAvoidance(entity, bounds, config = {}) {
    const {
        margin = 10,
        maxSpeed = 1.5,
        maxForce = 0.05,
        forceMultiplier = 1.5
    } = config;

    const steer = new Vector2D(0, 0);
    const position = entity.position;

    const distToMinX = position.x - bounds.minX;
    const distToMaxX = bounds.maxX - position.x;
    const distToMinZ = position.z - bounds.minZ;
    const distToMaxZ = bounds.maxZ - position.z;

    if (distToMinX < margin) {
        const force = (margin - distToMinX) / margin;
        steer.x = maxSpeed * force * 1.2;
    } else if (distToMaxX < margin) {
        const force = (margin - distToMaxX) / margin;
        steer.x = -maxSpeed * force * 1.2;
    }

    if (distToMinZ < margin) {
        const force = (margin - distToMinZ) / margin;
        steer.z = maxSpeed * force * 1.2;
    } else if (distToMaxZ < margin) {
        const force = (margin - distToMaxZ) / margin;
        steer.z = -maxSpeed * force * 1.2;
    }

    if (steer.magnitude() > 0) {
        steer.normalize();
        steer.multiply(maxSpeed * forceMultiplier);
        steer.subtract(entity.velocity);
        steer.limit(maxForce * 2.5);
    }

    return steer;
}

// Variant 2: pre-DRY calculateBoundaryAvoidanceWithGate rect path
// (2d34a2b^ lines 215-263). Note the hardcoded `maxSpeed * 1.5` final
// multiplier and the gate carve-outs evaluated inside the minZ/maxZ
// margin branches.
function preDryWithGate(entity, bounds, gate, config = {}) {
    const {
        margin = 3,
        maxSpeed = 0.1,
        maxForce = 0.02
    } = config;

    const steer = new Vector2D(0, 0);
    const position = entity.position;

    const distToMinX = position.x - bounds.minX;
    const distToMaxX = bounds.maxX - position.x;
    const distToMinZ = position.z - bounds.minZ;
    const distToMaxZ = bounds.maxZ - position.z;

    if (distToMinX < margin) {
        const force = (margin - distToMinX) / margin;
        steer.x = maxSpeed * force * 1.2;
    } else if (distToMaxX < margin) {
        const force = (margin - distToMaxX) / margin;
        steer.x = -maxSpeed * force * 1.2;
    }

    if (distToMinZ < margin) {
        const nearSouthGateX = gate && gate.position.z <= bounds.minZ + 5 ?
            Math.abs(position.x - gate.position.x) < gate.width / 2 + 2 : false;
        if (!nearSouthGateX) {
            const force = (margin - distToMinZ) / margin;
            steer.z = maxSpeed * force * 1.2;
        }
    } else if (distToMaxZ < margin) {
        const nearNorthGateX = gate && gate.position.z >= bounds.maxZ - 5 ?
            Math.abs(position.x - gate.position.x) < gate.width / 2 + 2 : false;
        if (!nearNorthGateX) {
            const force = (margin - distToMaxZ) / margin;
            steer.z = -maxSpeed * force * 1.2;
        }
    }

    if (steer.magnitude() > 0) {
        steer.normalize();
        steer.multiply(maxSpeed * 1.5);
        steer.subtract(entity.velocity);
        steer.limit(maxForce * 2.5);
    }

    return steer;
}

// Variant 3: pre-DRY calculateBoundaryAvoidanceWithMultipleGates
// (2d34a2b^ lines 273-366). Hardcoded `maxSpeed * 1.5` final multiplier;
// isNearGateOnBoundary carve-outs on all four sides.
function preDryWithMultipleGates(entity, bounds, competitiveGates, config = {}) {
    const {
        margin = 3,
        maxSpeed = 0.1,
        maxForce = 0.02
    } = config;

    const steer = new Vector2D(0, 0);
    const position = entity.position;

    const distToMinX = position.x - bounds.minX;
    const distToMaxX = bounds.maxX - position.x;
    const distToMinZ = position.z - bounds.minZ;
    const distToMaxZ = bounds.maxZ - position.z;

    const isNearGateOnBoundary = (boundaryType) => {
        if (!competitiveGates || !Array.isArray(competitiveGates)) {
            return false;
        }

        for (const gate of competitiveGates) {
            let isNearGate = false;

            switch (boundaryType) {
                case 'west':
                    if (gate.direction === 'west' && gate.position.x <= bounds.minX + 5) {
                        isNearGate = Math.abs(position.z - gate.position.z) < gate.width / 2;
                    }
                    break;
                case 'east':
                    if (gate.direction === 'east' && gate.position.x >= bounds.maxX - 5) {
                        isNearGate = Math.abs(position.z - gate.position.z) < gate.width / 2;
                    }
                    break;
                case 'south':
                    if (gate.direction === 'south' && gate.position.z <= bounds.minZ + 5) {
                        isNearGate = Math.abs(position.x - gate.position.x) < gate.width / 2;
                    }
                    break;
                case 'north':
                    if (gate.direction === 'north' && gate.position.z >= bounds.maxZ - 5) {
                        isNearGate = Math.abs(position.x - gate.position.x) < gate.width / 2;
                    }
                    break;
            }

            if (isNearGate) {
                return true;
            }
        }

        return false;
    };

    if (distToMinX < margin) {
        if (!isNearGateOnBoundary('west')) {
            const force = (margin - distToMinX) / margin;
            steer.x = maxSpeed * force * 1.2;
        }
    } else if (distToMaxX < margin) {
        if (!isNearGateOnBoundary('east')) {
            const force = (margin - distToMaxX) / margin;
            steer.x = -maxSpeed * force * 1.2;
        }
    }

    if (distToMinZ < margin) {
        if (!isNearGateOnBoundary('south')) {
            const force = (margin - distToMinZ) / margin;
            steer.z = maxSpeed * force * 1.2;
        }
    } else if (distToMaxZ < margin) {
        if (!isNearGateOnBoundary('north')) {
            const force = (margin - distToMaxZ) / margin;
            steer.z = -maxSpeed * force * 1.2;
        }
    }

    if (steer.magnitude() > 0) {
        steer.normalize();
        steer.multiply(maxSpeed * 1.5);
        steer.subtract(entity.velocity);
        steer.limit(maxForce * 2.5);
    }

    return steer;
}

// ---------------------------------------------------------------------------
// Input generators.
// ---------------------------------------------------------------------------

// 200k per config = 600k pairs total, matching the scale of the original
// throwaway verification. Measured ~0.6s on the dev workstation; the budget
// is ~2s, so there is headroom on slower CI.
const ITERATIONS_PER_CONFIG = 200000;

function randomBounds(rnd) {
    const cx = (rnd() - 0.5) * 100;
    const cz = (rnd() - 0.5) * 100;
    const halfW = 10 + rnd() * 140;
    const halfH = 10 + rnd() * 140;
    return {
        minX: cx - halfW,
        maxX: cx + halfW,
        minZ: cz - halfH,
        maxZ: cz + halfH,
    };
}

// Position sampler covering deep-inside, margin bands, exact edges, exact
// corners, and outside the rect. `alignX` / `alignZ` (optional) bias some
// samples onto a gate axis so carve-out predicates actually fire.
function randomPosition(rnd, bounds, margin, alignX, alignZ) {
    const span = (lo, hi) => lo + rnd() * (hi - lo);
    const pick = rnd();
    let x;
    let z;

    if (pick < 0.35) {
        // Uniform across an inflated rect: inside, margin band, and outside.
        x = span(bounds.minX - 2 * margin, bounds.maxX + 2 * margin);
        z = span(bounds.minZ - 2 * margin, bounds.maxZ + 2 * margin);
    } else if (pick < 0.55) {
        // Inside one of the four margin bands.
        const side = Math.floor(rnd() * 4);
        if (side === 0) {
            x = span(bounds.minX, bounds.minX + margin);
            z = span(bounds.minZ, bounds.maxZ);
        } else if (side === 1) {
            x = span(bounds.maxX - margin, bounds.maxX);
            z = span(bounds.minZ, bounds.maxZ);
        } else if (side === 2) {
            x = span(bounds.minX, bounds.maxX);
            z = span(bounds.minZ, bounds.minZ + margin);
        } else {
            x = span(bounds.minX, bounds.maxX);
            z = span(bounds.maxZ - margin, bounds.maxZ);
        }
    } else if (pick < 0.65) {
        // Exactly on an edge or exactly margin-distance from it (boundary of
        // the strict `dist < margin` comparison).
        const xEdges = [bounds.minX, bounds.maxX, bounds.minX + margin, bounds.maxX - margin];
        const zEdges = [bounds.minZ, bounds.maxZ, bounds.minZ + margin, bounds.maxZ - margin];
        x = rnd() < 0.5 ? xEdges[Math.floor(rnd() * 4)] : span(bounds.minX, bounds.maxX);
        z = rnd() < 0.5 ? zEdges[Math.floor(rnd() * 4)] : span(bounds.minZ, bounds.maxZ);
    } else if (pick < 0.75) {
        // Exact corners.
        x = rnd() < 0.5 ? bounds.minX : bounds.maxX;
        z = rnd() < 0.5 ? bounds.minZ : bounds.maxZ;
    } else if (pick < 0.9 && (alignX !== undefined || alignZ !== undefined)) {
        // Gate-aligned: land in/near the carve-out window of a gate axis,
        // inside a margin band so the suppress predicate is reached.
        x = alignX !== undefined ? alignX + (rnd() - 0.5) * 8 : span(bounds.minX, bounds.maxX);
        z = alignZ !== undefined ? alignZ + (rnd() - 0.5) * 8 : span(bounds.minZ, bounds.maxZ);
        if (alignX !== undefined) {
            z = rnd() < 0.5 ? span(bounds.minZ, bounds.minZ + margin) : span(bounds.maxZ - margin, bounds.maxZ);
        } else {
            x = rnd() < 0.5 ? span(bounds.minX, bounds.minX + margin) : span(bounds.maxX - margin, bounds.maxX);
        }
    } else {
        // Deep inside (zero-force path).
        x = span(bounds.minX + margin, bounds.maxX - margin);
        z = span(bounds.minZ + margin, bounds.maxZ - margin);
    }

    return new Vector2D(x, z);
}

function randomVelocity(rnd) {
    if (rnd() < 0.1) {
        return new Vector2D(0, 0);
    }
    return new Vector2D((rnd() - 0.5) * 4, (rnd() - 0.5) * 4);
}

function assertBitExact(shared, preDry, label, sample) {
    if (!Object.is(shared.x, preDry.x) || !Object.is(shared.z, preDry.z)) {
        expect.fail(
            `${label}: shared (${shared.x}, ${shared.z}) != pre-DRY ` +
            `(${preDry.x}, ${preDry.z}) for input ${JSON.stringify(sample)}`
        );
    }
}

// ---------------------------------------------------------------------------
// The fuzz.
// ---------------------------------------------------------------------------

describe('rectBoundarySteer bit-exactness fuzz vs pre-DRY inline math (2d34a2b)', () => {
    it('variant 1: calculateBoundaryAvoidance rect path matches pre-DRY calculateRectAvoidance', () => {
        const rnd = mulberry32(0xA3_0001);
        let nonZero = 0;
        let zero = 0;

        for (let i = 0; i < ITERATIONS_PER_CONFIG; i++) {
            const bounds = randomBounds(rnd);
            // Half default config, half randomized (this site's
            // forceMultiplier is config-driven, so randomize it too).
            const config = rnd() < 0.5 ? {} : {
                margin: 0.5 + rnd() * 19.5,
                maxSpeed: 0.05 + rnd() * 2.95,
                maxForce: 0.005 + rnd() * 0.095,
                forceMultiplier: 0.5 + rnd() * 2.5,
            };
            const margin = config.margin ?? 10;
            const entity = {
                position: randomPosition(rnd, bounds, margin),
                velocity: randomVelocity(rnd),
            };

            const shared = calculateBoundaryAvoidance(entity, bounds, config);
            const preDry = preDryRectAvoidance(entity, bounds, config);

            assertBitExact(shared, preDry, 'variant 1', {
                i, bounds, config,
                pos: { x: entity.position.x, z: entity.position.z },
                vel: { x: entity.velocity.x, z: entity.velocity.z },
            });

            if (shared.x === 0 && shared.z === 0) zero++; else nonZero++;
        }

        // Coverage sanity: the sampler must exercise both branches heavily.
        expect(nonZero).toBeGreaterThan(1000);
        expect(zero).toBeGreaterThan(1000);
    });

    it('variant 2: calculateBoundaryAvoidanceWithGate rect path matches pre-DRY inline (hardcoded 1.5, gate carve-outs)', () => {
        const rnd = mulberry32(0xA3_0002);
        let nonZero = 0;
        let zero = 0;
        let carveOutHits = 0;

        for (let i = 0; i < ITERATIONS_PER_CONFIG; i++) {
            const bounds = randomBounds(rnd);
            const config = rnd() < 0.5 ? {} : {
                margin: 0.5 + rnd() * 19.5,
                maxSpeed: 0.05 + rnd() * 2.95,
                maxForce: 0.005 + rnd() * 0.095,
            };
            const margin = config.margin ?? 3;

            // Gate: usually present; z placed near minZ, near maxZ, or in the
            // interior (so the `<= minZ + 5` / `>= maxZ - 5` predicates see
            // true and false cases). x uniform across the rect; width 1-12.
            let gate = null;
            if (rnd() < 0.75) {
                const zPick = rnd();
                let gz;
                if (zPick < 0.4) {
                    gz = bounds.minZ + (rnd() - 0.2) * 10; // straddles minZ + 5
                } else if (zPick < 0.8) {
                    gz = bounds.maxZ - (rnd() - 0.2) * 10; // straddles maxZ - 5
                } else {
                    gz = bounds.minZ + rnd() * (bounds.maxZ - bounds.minZ);
                }
                gate = {
                    position: new Vector2D(bounds.minX + rnd() * (bounds.maxX - bounds.minX), gz),
                    width: 1 + rnd() * 11,
                };
            }

            const entity = {
                position: randomPosition(rnd, bounds, margin, gate ? gate.position.x : undefined),
                velocity: randomVelocity(rnd),
            };

            const shared = calculateBoundaryAvoidanceWithGate(entity, bounds, gate, config);
            const preDry = preDryWithGate(entity, bounds, gate, config);

            assertBitExact(shared, preDry, 'variant 2', {
                i, bounds, config, gate,
                pos: { x: entity.position.x, z: entity.position.z },
                vel: { x: entity.velocity.x, z: entity.velocity.z },
            });

            if (shared.x === 0 && shared.z === 0) zero++; else nonZero++;

            // Independent count of carve-out activations (same comparisons as
            // the inline predicate) so we know the suppress path was hit.
            if (gate) {
                const p = entity.position;
                const inMinZBand = p.z - bounds.minZ < margin;
                const inMaxZBand = !inMinZBand && bounds.maxZ - p.z < margin;
                const aligned = Math.abs(p.x - gate.position.x) < gate.width / 2 + 2;
                if ((inMinZBand && gate.position.z <= bounds.minZ + 5 && aligned) ||
                    (inMaxZBand && gate.position.z >= bounds.maxZ - 5 && aligned)) {
                    carveOutHits++;
                }
            }
        }

        expect(nonZero).toBeGreaterThan(1000);
        expect(zero).toBeGreaterThan(1000);
        expect(carveOutHits).toBeGreaterThan(200);
    });

    it('variant 3: calculateBoundaryAvoidanceWithMultipleGates matches pre-DRY inline (hardcoded 1.5, four-side carve-outs)', () => {
        const rnd = mulberry32(0xA3_0003);
        const DIRECTIONS = ['west', 'east', 'south', 'north'];
        let nonZero = 0;
        let zero = 0;
        let carveOutHits = 0;

        for (let i = 0; i < ITERATIONS_PER_CONFIG; i++) {
            const bounds = randomBounds(rnd);
            const config = rnd() < 0.5 ? {} : {
                margin: 0.5 + rnd() * 19.5,
                maxSpeed: 0.05 + rnd() * 2.95,
                maxForce: 0.005 + rnd() * 0.095,
            };
            const margin = config.margin ?? 3;

            // Gates: 0-3, occasionally null instead of an array to exercise
            // the !competitiveGates guard. Each gate sits near its direction's
            // edge with jitter that sometimes crosses the +-5 placement
            // predicate; sometimes the direction and position disagree.
            let gates = null;
            if (rnd() < 0.85) {
                const count = Math.floor(rnd() * 4);
                gates = [];
                for (let g = 0; g < count; g++) {
                    const direction = DIRECTIONS[Math.floor(rnd() * 4)];
                    const jitter = (rnd() - 0.2) * 10; // straddles the 5m predicate
                    let gx;
                    let gz;
                    if (direction === 'west') {
                        gx = bounds.minX + jitter;
                        gz = bounds.minZ + rnd() * (bounds.maxZ - bounds.minZ);
                    } else if (direction === 'east') {
                        gx = bounds.maxX - jitter;
                        gz = bounds.minZ + rnd() * (bounds.maxZ - bounds.minZ);
                    } else if (direction === 'south') {
                        gx = bounds.minX + rnd() * (bounds.maxX - bounds.minX);
                        gz = bounds.minZ + jitter;
                    } else {
                        gx = bounds.minX + rnd() * (bounds.maxX - bounds.minX);
                        gz = bounds.maxZ - jitter;
                    }
                    gates.push({
                        direction,
                        position: new Vector2D(gx, gz),
                        width: 1 + rnd() * 11,
                    });
                }
            }

            // Bias some positions onto a gate's along-edge axis.
            let alignX;
            let alignZ;
            if (gates && gates.length > 0 && rnd() < 0.6) {
                const g = gates[Math.floor(rnd() * gates.length)];
                if (g.direction === 'west' || g.direction === 'east') {
                    alignZ = g.position.z;
                } else {
                    alignX = g.position.x;
                }
            }

            const entity = {
                position: randomPosition(rnd, bounds, margin, alignX, alignZ),
                velocity: randomVelocity(rnd),
            };

            const shared = calculateBoundaryAvoidanceWithMultipleGates(entity, bounds, gates, config);
            const preDry = preDryWithMultipleGates(entity, bounds, gates, config);

            assertBitExact(shared, preDry, 'variant 3', {
                i, bounds, config, gates,
                pos: { x: entity.position.x, z: entity.position.z },
                vel: { x: entity.velocity.x, z: entity.velocity.z },
            });

            if (shared.x === 0 && shared.z === 0) zero++; else nonZero++;

            // Independent carve-out activation count (same comparisons as the
            // inline isNearGateOnBoundary, scoped to bands actually reached).
            if (gates) {
                const p = entity.position;
                for (const g of gates) {
                    const hit =
                        (p.x - bounds.minX < margin && g.direction === 'west' &&
                            g.position.x <= bounds.minX + 5 &&
                            Math.abs(p.z - g.position.z) < g.width / 2) ||
                        (bounds.maxX - p.x < margin && g.direction === 'east' &&
                            g.position.x >= bounds.maxX - 5 &&
                            Math.abs(p.z - g.position.z) < g.width / 2) ||
                        (p.z - bounds.minZ < margin && g.direction === 'south' &&
                            g.position.z <= bounds.minZ + 5 &&
                            Math.abs(p.x - g.position.x) < g.width / 2) ||
                        (bounds.maxZ - p.z < margin && g.direction === 'north' &&
                            g.position.z >= bounds.maxZ - 5 &&
                            Math.abs(p.x - g.position.x) < g.width / 2);
                    if (hit) {
                        carveOutHits++;
                        break;
                    }
                }
            }
        }

        expect(nonZero).toBeGreaterThan(1000);
        expect(zero).toBeGreaterThan(1000);
        expect(carveOutHits).toBeGreaterThan(200);
    });
});
