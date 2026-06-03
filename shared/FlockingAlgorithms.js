// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { Vector2D } from './Vector2D.js';

/**
 * Pure flocking algorithm functions
 * Stateless and deterministic - no external dependencies
 */

/**
 * Per-tick allocation pool (P-PERF-1). These module-level scratch vectors
 * replace per-call `new Vector2D(0,0)` accumulators and `.clone()` temporaries
 * in the hot flocking path. Each is reset (`.set(...)`) at the top of its use
 * so no state leaks across calls. The math is byte-identical: `.set(a.x, a.z)`
 * assigns the same components a `clone()` copy would, and the accumulators start
 * from `(0,0)` exactly as the originals did.
 *
 * Instances MUST stay distinct where their lifetimes overlap. Inside
 * `calculateFlockingForce`, the separation/alignment/cohesion results and the
 * combined total are all live at once, so they use four different scratches.
 * `calculateSeek`'s `_seekDesired` is distinct from `_cohesionSum` because
 * `calculateCohesion` passes its sum in as `target`, which is read on the same
 * line `desired` is written. `calculateFlee` uses its own `_fleeDesired`.
 * Single-threaded by contract (Worker DO tick + client predictor), so reuse is
 * safe; each function fully consumes its scratch before any sibling call runs.
 */
const _sepDiff = new Vector2D(0, 0);
const _sepSteer = new Vector2D(0, 0);
const _alignSum = new Vector2D(0, 0);
const _cohesionSum = new Vector2D(0, 0);
const _seekDesired = new Vector2D(0, 0);
const _fleeDesired = new Vector2D(0, 0);
const _totalForce = new Vector2D(0, 0);

/**
 * Apply flocking behavior (separation, alignment, cohesion) to a boid
 * @param {Object} boid - The boid to apply flocking to (with position, velocity)
 * @param {Array} neighbors - Array of neighboring boids
 * @param {Object} config - Flocking configuration
 * @returns {Vector2D} - Combined flocking force
 */
export function calculateFlockingForce(boid, neighbors, config) {
    const {
        separationDistance = 2.0,
        separationWeight = 1.5,
        alignmentWeight = 1.0,
        cohesionWeight = 1.0,
        maxSpeed = 1.5,
        maxForce = 0.05
    } = config;
    
    if (neighbors.length === 0) {
        return new Vector2D(0, 0);
    }
    
    // Calculate individual forces
    const separation = calculateSeparation(boid, neighbors, separationDistance, maxSpeed, maxForce);
    const alignment = calculateAlignment(boid, neighbors, maxSpeed, maxForce);
    const cohesion = calculateCohesion(boid, neighbors, maxSpeed, maxForce);
    
    // Weight and combine forces
    separation.multiply(separationWeight);
    alignment.multiply(alignmentWeight);
    cohesion.multiply(cohesionWeight);
    
    const totalForce = _totalForce.set(0, 0);
    totalForce.add(separation);
    totalForce.add(alignment);
    totalForce.add(cohesion);

    return totalForce;
}

/**
 * Separation: steer to avoid crowding local flockmates
 * @param {Object} boid - The boid
 * @param {Array} neighbors - Neighboring boids
 * @param {number} desiredSeparation - Desired separation distance
 * @param {number} maxSpeed - Maximum speed
 * @param {number} maxForce - Maximum force
 * @returns {Vector2D} - Separation force
 */
export function calculateSeparation(boid, neighbors, desiredSeparation, maxSpeed, maxForce) {
    const steer = _sepSteer.set(0, 0);
    let count = 0;

    for (let neighbor of neighbors) {
        const distance = boid.position.distanceTo(neighbor.position);

        if (distance > 0 && distance < desiredSeparation) {
            // Calculate vector pointing away from neighbor
            const diff = _sepDiff.set(boid.position.x, boid.position.z).subtract(neighbor.position);
            diff.normalize();
            diff.divide(distance); // Weight by distance (closer = stronger)
            steer.add(diff);
            count++;
        }
    }

    if (count > 0) {
        steer.divide(count);
        steer.normalize();
        steer.multiply(maxSpeed);
        steer.subtract(boid.velocity);
        steer.limit(maxForce);
    }

    return steer;
}

/**
 * Alignment: steer towards the average heading of local flockmates
 * @param {Object} boid - The boid
 * @param {Array} neighbors - Neighboring boids
 * @param {number} maxSpeed - Maximum speed
 * @param {number} maxForce - Maximum force
 * @returns {Vector2D} - Alignment force
 */
export function calculateAlignment(boid, neighbors, maxSpeed, maxForce) {
    const sum = _alignSum.set(0, 0);

    for (let neighbor of neighbors) {
        sum.add(neighbor.velocity);
    }
    
    sum.divide(neighbors.length);
    sum.normalize();
    sum.multiply(maxSpeed);
    
    const steer = sum.subtract(boid.velocity);
    steer.limit(maxForce);
    
    return steer;
}

/**
 * Cohesion: steer to move toward the average position of local flockmates
 * @param {Object} boid - The boid
 * @param {Array} neighbors - Neighboring boids
 * @param {number} maxSpeed - Maximum speed
 * @param {number} maxForce - Maximum force
 * @returns {Vector2D} - Cohesion force
 */
export function calculateCohesion(boid, neighbors, maxSpeed, maxForce) {
    const sum = _cohesionSum.set(0, 0);

    for (let neighbor of neighbors) {
        sum.add(neighbor.position);
    }
    
    sum.divide(neighbors.length);
    return calculateSeek(boid, sum, maxSpeed, maxForce);
}

/**
 * Seek a target position
 * @param {Object} boid - The boid
 * @param {Vector2D} target - Target position
 * @param {number} maxSpeed - Maximum speed
 * @param {number} maxForce - Maximum force
 * @returns {Vector2D} - Seek force
 */
export function calculateSeek(boid, target, maxSpeed, maxForce) {
    const desired = _seekDesired.set(target.x, target.z).subtract(boid.position);
    desired.normalize();
    desired.multiply(maxSpeed);
    
    const steer = desired.subtract(boid.velocity);
    steer.limit(maxForce);
    
    return steer;
}

/**
 * Flee from a target position
 * @param {Object} boid - The boid
 * @param {Vector2D} target - Target position to flee from
 * @param {number} fleeRadius - Radius within which to flee
 * @param {number} maxSpeed - Maximum speed
 * @param {number} maxForce - Maximum force
 * @returns {Vector2D} - Flee force
 */
export function calculateFlee(boid, target, fleeRadius, maxSpeed, maxForce) {
    const distance = boid.position.distanceTo(target);
    
    if (distance < fleeRadius) {
        const desired = _fleeDesired.set(boid.position.x, boid.position.z).subtract(target);
        desired.normalize();
        desired.multiply(maxSpeed);
        
        const steer = desired.subtract(boid.velocity);
        steer.limit(maxForce * 2); // Stronger flee force
        
        return steer;
    }
    
    return new Vector2D(0, 0);
}

/**
 * Get neighboring boids within perception radius
 * @param {Object} boid - The boid
 * @param {Array} allBoids - All boids in the system
 * @param {number} perceptionRadius - Perception radius
 * @returns {Array} - Array of neighboring boids
 */
export function getNeighbors(boid, allBoids, perceptionRadius) {
    const neighbors = [];
    
    for (let otherBoid of allBoids) {
        if (otherBoid !== boid) {
            const distance = boid.position.distanceTo(otherBoid.position);
            if (distance < perceptionRadius) {
                neighbors.push(otherBoid);
            }
        }
    }
    
    return neighbors;
} 