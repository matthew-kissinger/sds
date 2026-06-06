// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/**
 * Deterministic hard-body separation between flock bodies.
 *
 * Cycle 56: before this, the dog only influenced sheep through the soft flee
 * steering force, so a dog charging a tight cluster would visibly pass through
 * the flock. This module gives the dog a body the sheep cannot occupy: a
 * post-integration positional correction that pushes any overlapping sheep out
 * to the sum of body radii, mirroring the dog<->tree/rock push-out in
 * js/Sheepdog.js.
 *
 * Pure + deterministic (Math.sqrt only; no trig, no Math.random, no DOM), so
 * the Worker authoritative tick, the client predictor/solo path, and the
 * sim-baseline harness all produce the identical correction.
 *
 * The correction is one-directional: the dog pushes sheep, sheep never push
 * the player-controlled dog (shoving the dog back would fight player input).
 */

// Body radii (metres). Dog/sheep contact gets a slightly more conservative
// sheep radius than obstacle avoidance because the visual sheep mesh is long
// front-to-back; the old 0.6m center radius still let heads/backs read through
// the dog.
export const DOG_BODY_RADIUS = 1.2;
export const SHEEP_BODY_RADIUS = 0.78;
export const DOG_SHEEP_MIN_DISTANCE = DOG_BODY_RADIUS + SHEEP_BODY_RADIUS;
export const SHEEP_SHEEP_MIN_DISTANCE = 1.35;

// Cap the per-tick positional correction so a deep overlap (a frame spike, a
// dog teleport, a sheep spawned under the dog) resolves over a few ticks
// instead of snapping. Keeps the separation from reading as a jitter/pop.
export const MAX_DOG_SHEEP_PUSH_PER_TICK = 0.42;
export const MAX_SHEEP_SHEEP_PUSH_PER_TICK = 0.14;

const COLLISION_EPSILON = 1e-6;
const INV_SQRT2 = 0.7071067811865476;
const FALLBACK_NORMALS = [
    [1, 0],
    [INV_SQRT2, INV_SQRT2],
    [0, 1],
    [-INV_SQRT2, INV_SQRT2],
    [-1, 0],
    [-INV_SQRT2, -INV_SQRT2],
    [0, -1],
    [INV_SQRT2, -INV_SQRT2]
];

function stableEntityId(entity, fallback) {
    return Number.isFinite(entity?.id) ? entity.id : fallback;
}

function fallbackNormal(a, b) {
    const mixed = ((a * 73856093) ^ (b * 19349663)) >>> 0;
    return FALLBACK_NORMALS[mixed & 7];
}

function zigzag(n) {
    return n >= 0 ? n * 2 : -n * 2 - 1;
}

function cellKey(cx, cz) {
    const x = zigzag(cx);
    const z = zigzag(cz);
    const sum = x + z;
    return (sum * (sum + 1)) / 2 + z;
}

function isCollidableSheep(sheep) {
    return !!sheep &&
        sheep.state === 0 &&
        !sheep.isRetiring &&
        !sheep.isAscending &&
        !!sheep.position;
}

function resetScratch(scratch, count) {
    scratch.heads.clear();
    scratch.activeIndices.length = 0;
    scratch.movedIndices.length = 0;
    scratch.result.pairs = 0;
    scratch.result.moved = 0;
    scratch.result.pairChecks = 0;

    for (let i = 0; i < count; i++) {
        scratch.next[i] = -1;
        scratch.cellX[i] = 0;
        scratch.cellZ[i] = 0;
        scratch.pushX[i] = 0;
        scratch.pushZ[i] = 0;
        scratch.velX[i] = 0;
        scratch.velZ[i] = 0;
    }
}

function applyCappedVector(x, z, maxMagnitude) {
    const magSq = x * x + z * z;
    if (magSq <= maxMagnitude * maxMagnitude || magSq <= COLLISION_EPSILON) {
        return [x, z];
    }
    const scale = maxMagnitude / Math.sqrt(magSq);
    return [x * scale, z * scale];
}

/**
 * Push one sheep out of one dog's body. Corrects the position along the
 * contact normal, then removes the velocity component pointing into the dog so
 * the sheep settles against the body instead of grinding back through it next
 * tick. Mutates `sheep.position` and `sheep.velocity` in place.
 *
 * @param {{position: {x:number,z:number}, velocity?: {x:number,z:number}}} sheep
 * @param {{x:number, z:number}} dogPos - dog body centre
 * @param {number} [minDistance=DOG_SHEEP_MIN_DISTANCE] - sum of body radii
 * @param {number} [maxPush=MAX_DOG_SHEEP_PUSH_PER_TICK]
 * @returns {boolean} true when a correction was applied
 */
export function resolveDogSheepCollision(
    sheep,
    dogPos,
    minDistance = DOG_SHEEP_MIN_DISTANCE,
    maxPush = MAX_DOG_SHEEP_PUSH_PER_TICK
) {
    if (!sheep || !sheep.position || !dogPos) return false;

    const dx = sheep.position.x - dogPos.x;
    const dz = sheep.position.z - dogPos.z;
    const distSq = dx * dx + dz * dz;

    if (distSq >= minDistance * minDistance) return false;

    let dist = 0;
    let nx;
    let nz;
    if (distSq <= COLLISION_EPSILON) {
        [nx, nz] = fallbackNormal(stableEntityId(sheep, 0), -1);
    } else {
        dist = Math.sqrt(distSq);
        const inv = 1 / dist;
        nx = dx * inv;
        nz = dz * inv;
    }

    const overlap = Math.min(minDistance - dist, maxPush);

    sheep.position.x += nx * overlap;
    sheep.position.z += nz * overlap;

    if (sheep.velocity) {
        const vDotN = sheep.velocity.x * nx + sheep.velocity.z * nz;
        if (vDotN < 0) {
            sheep.velocity.x -= vDotN * nx;
            sheep.velocity.z -= vDotN * nz;
        }
    }

    return true;
}

/**
 * Resolve one sheep against every dog in an iterable. Deterministic given a
 * stable iteration order: Map.values() insertion order on the Worker, the
 * [sheepdog, sheepdog2] order on the client.
 *
 * @param {Object} sheep
 * @param {Iterable<{position:{x:number,z:number}}>} dogs
 * @returns {boolean} true when any dog corrected the sheep
 */
export function resolveDogSheepCollisions(sheep, dogs) {
    if (!dogs) return false;
    let pushed = false;
    for (const dog of dogs) {
        if (dog && dog.position && resolveDogSheepCollision(sheep, dog.position)) {
            pushed = true;
        }
    }
    return pushed;
}

export function createSheepCollisionScratch() {
    return {
        heads: new Map(),
        next: [],
        cellX: [],
        cellZ: [],
        pushX: [],
        pushZ: [],
        velX: [],
        velZ: [],
        activeIndices: [],
        movedIndices: [],
        result: { pairs: 0, moved: 0, pairChecks: 0 }
    };
}

/**
 * Resolve active sheep against nearby active sheep using a deterministic
 * spatial hash. Mutates positions and velocities in place.
 *
 * @param {Array<Object>} sheepArray
 * @param {Object} [options]
 * @param {number} [options.count=sheepArray.length]
 * @param {Object} [options.scratch]
 * @param {number} [options.minDistance=SHEEP_SHEEP_MIN_DISTANCE]
 * @param {number} [options.maxPush=MAX_SHEEP_SHEEP_PUSH_PER_TICK]
 * @returns {{pairs:number,moved:number,pairChecks:number}}
 */
export function resolveSheepSheepCollisions(sheepArray, options = {}) {
    if (!Array.isArray(sheepArray) || sheepArray.length === 0) {
        const scratch = options.scratch || createSheepCollisionScratch();
        scratch.result.pairs = 0;
        scratch.result.moved = 0;
        scratch.result.pairChecks = 0;
        scratch.movedIndices.length = 0;
        return scratch.result;
    }

    const count = Math.min(options.count ?? sheepArray.length, sheepArray.length);
    const minDistance = options.minDistance ?? SHEEP_SHEEP_MIN_DISTANCE;
    const maxPush = options.maxPush ?? MAX_SHEEP_SHEEP_PUSH_PER_TICK;
    const maxVelocityCorrection = options.maxVelocityCorrection ?? maxPush;
    const scratch = options.scratch || createSheepCollisionScratch();
    const minDistanceSq = minDistance * minDistance;
    const cellSize = minDistance;

    resetScratch(scratch, count);

    for (let i = 0; i < count; i++) {
        const sheep = sheepArray[i];
        if (!isCollidableSheep(sheep)) continue;

        const cx = Math.floor(sheep.position.x / cellSize);
        const cz = Math.floor(sheep.position.z / cellSize);
        const key = cellKey(cx, cz);
        const head = scratch.heads.has(key) ? scratch.heads.get(key) : -1;

        scratch.cellX[i] = cx;
        scratch.cellZ[i] = cz;
        scratch.next[i] = head;
        scratch.heads.set(key, i);
        scratch.activeIndices.push(i);
    }

    for (const ai of scratch.activeIndices) {
        const a = sheepArray[ai];
        const cx = scratch.cellX[ai];
        const cz = scratch.cellZ[ai];

        for (let oz = -1; oz <= 1; oz++) {
            for (let ox = -1; ox <= 1; ox++) {
                let bi = scratch.heads.get(cellKey(cx + ox, cz + oz));
                while (bi !== undefined && bi !== -1) {
                    if (bi > ai) {
                        scratch.result.pairChecks++;
                        const b = sheepArray[bi];
                        const dx = a.position.x - b.position.x;
                        const dz = a.position.z - b.position.z;
                        const distSq = dx * dx + dz * dz;

                        if (distSq < minDistanceSq) {
                            let dist = 0;
                            let nx;
                            let nz;
                            if (distSq <= COLLISION_EPSILON) {
                                [nx, nz] = fallbackNormal(
                                    stableEntityId(a, ai),
                                    stableEntityId(b, bi)
                                );
                            } else {
                                dist = Math.sqrt(distSq);
                                const inv = 1 / dist;
                                nx = dx * inv;
                                nz = dz * inv;
                            }

                            const half = (minDistance - dist) * 0.5;
                            scratch.pushX[ai] += nx * half;
                            scratch.pushZ[ai] += nz * half;
                            scratch.pushX[bi] -= nx * half;
                            scratch.pushZ[bi] -= nz * half;

                            const av = a.velocity;
                            const bv = b.velocity;
                            if (av && bv) {
                                const rel = (av.x - bv.x) * nx + (av.z - bv.z) * nz;
                                if (rel < 0) {
                                    const impulse = -rel * 0.5;
                                    scratch.velX[ai] += nx * impulse;
                                    scratch.velZ[ai] += nz * impulse;
                                    scratch.velX[bi] -= nx * impulse;
                                    scratch.velZ[bi] -= nz * impulse;
                                }
                            }

                            scratch.result.pairs++;
                        }
                    }
                    bi = scratch.next[bi];
                }
            }
        }
    }

    for (const i of scratch.activeIndices) {
        const sheep = sheepArray[i];
        const [px, pz] = applyCappedVector(scratch.pushX[i], scratch.pushZ[i], maxPush);
        const [vx, vz] = applyCappedVector(scratch.velX[i], scratch.velZ[i], maxVelocityCorrection);

        if (px !== 0 || pz !== 0) {
            sheep.position.x += px;
            sheep.position.z += pz;
            scratch.movedIndices.push(i);
            scratch.result.moved++;
        }

        if (sheep.velocity && (vx !== 0 || vz !== 0)) {
            sheep.velocity.x += vx;
            sheep.velocity.z += vz;
        }
    }

    return scratch.result;
}
