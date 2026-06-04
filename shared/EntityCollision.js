// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/**
 * Deterministic hard-body separation between the dog and the sheep.
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
 * sim-baseline harness all produce the identical correction. The Vector2D
 * import keeps this in the shared/ dependency graph (it has no other deps).
 *
 * The correction is one-directional: the dog pushes sheep, sheep never push
 * the player-controlled dog (shoving the dog back would fight player input).
 */

// Body radii (metres). DOG_BODY_RADIUS sits a touch under the 1.2m DOG_RADIUS
// used for tree/rock avoidance so the contact reads as a body, not a force
// field. SHEEP_BODY_RADIUS matches the existing 0.6m sheep convention
// (OptimizedSheep SHEEP_RADIUS / MovementPhysics comments).
export const DOG_BODY_RADIUS = 1.1;
export const SHEEP_BODY_RADIUS = 0.6;
export const DOG_SHEEP_MIN_DISTANCE = DOG_BODY_RADIUS + SHEEP_BODY_RADIUS;

// Cap the per-tick positional correction so a deep overlap (a frame spike, a
// dog teleport, a sheep spawned under the dog) resolves over a few ticks
// instead of snapping. Keeps the separation from reading as a jitter/pop.
export const MAX_DOG_SHEEP_PUSH_PER_TICK = 0.35;

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

    // No overlap, or exactly co-located (no defined push direction — leave it
    // to the next tick once flocking/flee nudges the sheep off-centre).
    if (distSq >= minDistance * minDistance || distSq <= 1e-6) return false;

    const dist = Math.sqrt(distSq);
    const overlap = Math.min(minDistance - dist, maxPush);
    const inv = 1 / dist;
    const nx = dx * inv;
    const nz = dz * inv;

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
