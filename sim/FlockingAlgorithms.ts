// SPDX-License-Identifier: AGPL-3.0-or-later
// Lifted from sds/shared/FlockingAlgorithms.js; same license and copyright holder.
import { Vector2D } from './Vector2D';

/**
 * Pure flocking algorithm functions
 * Stateless and deterministic - no external dependencies
 */

/** Minimal structural shape the flocking math reads off an entity. */
export interface Boid {
    position: Vector2D;
    velocity: Vector2D;
}

/**
 * Flocking tuning. Every field is optional: the destructuring defaults below
 * are the sds values and are part of the feel.
 */
export interface FlockingConfig {
    separationDistance?: number;
    separationWeight?: number;
    alignmentWeight?: number;
    cohesionWeight?: number;
    maxSpeed?: number;
    maxForce?: number;
}

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
 * @param boid - The boid to apply flocking to (with position, velocity)
 * @param neighbors - Array of neighboring boids
 * @param config - Flocking configuration
 * @returns Combined flocking force
 */
export function calculateFlockingForce(
    boid: Boid,
    neighbors: readonly Boid[],
    config: FlockingConfig
): Vector2D {
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
 * @param boid - The boid
 * @param neighbors - Neighboring boids
 * @param desiredSeparation - Desired separation distance
 * @param maxSpeed - Maximum speed
 * @param maxForce - Maximum force
 * @returns Separation force
 */
export function calculateSeparation(
    boid: Boid,
    neighbors: readonly Boid[],
    desiredSeparation: number,
    maxSpeed: number,
    maxForce: number
): Vector2D {
    const steer = _sepSteer.set(0, 0);
    let count = 0;

    for (const neighbor of neighbors) {
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
 * @param boid - The boid
 * @param neighbors - Neighboring boids
 * @param maxSpeed - Maximum speed
 * @param maxForce - Maximum force
 * @returns Alignment force
 */
export function calculateAlignment(
    boid: Boid,
    neighbors: readonly Boid[],
    maxSpeed: number,
    maxForce: number
): Vector2D {
    const sum = _alignSum.set(0, 0);

    for (const neighbor of neighbors) {
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
 * @param boid - The boid
 * @param neighbors - Neighboring boids
 * @param maxSpeed - Maximum speed
 * @param maxForce - Maximum force
 * @returns Cohesion force
 */
export function calculateCohesion(
    boid: Boid,
    neighbors: readonly Boid[],
    maxSpeed: number,
    maxForce: number
): Vector2D {
    const sum = _cohesionSum.set(0, 0);

    for (const neighbor of neighbors) {
        sum.add(neighbor.position);
    }

    sum.divide(neighbors.length);
    return calculateSeek(boid, sum, maxSpeed, maxForce);
}

/**
 * Seek a target position
 * @param boid - The boid
 * @param target - Target position
 * @param maxSpeed - Maximum speed
 * @param maxForce - Maximum force
 * @returns Seek force
 */
export function calculateSeek(
    boid: Boid,
    target: Vector2D,
    maxSpeed: number,
    maxForce: number
): Vector2D {
    const desired = _seekDesired.set(target.x, target.z).subtract(boid.position);
    desired.normalize();
    desired.multiply(maxSpeed);

    const steer = desired.subtract(boid.velocity);
    steer.limit(maxForce);

    return steer;
}

/**
 * Flee from a target position
 * @param boid - The boid
 * @param target - Target position to flee from
 * @param fleeRadius - Radius within which to flee
 * @param maxSpeed - Maximum speed
 * @param maxForce - Maximum force
 * @returns Flee force
 */
export function calculateFlee(
    boid: Boid,
    target: Vector2D,
    fleeRadius: number,
    maxSpeed: number,
    maxForce: number
): Vector2D {
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
 * @param boid - The boid
 * @param allBoids - All boids in the system
 * @param perceptionRadius - Perception radius
 * @returns Array of neighboring boids
 */
export function getNeighbors<T extends Boid>(
    boid: Boid,
    allBoids: readonly T[],
    perceptionRadius: number
): T[] {
    const neighbors: T[] = [];

    for (const otherBoid of allBoids) {
        if (otherBoid !== boid) {
            const distance = boid.position.distanceTo(otherBoid.position);
            if (distance < perceptionRadius) {
                neighbors.push(otherBoid);
            }
        }
    }

    return neighbors;
}
