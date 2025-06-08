import { Vector2D } from './Vector2D.js';

/**
 * Pure flocking algorithm functions
 * Stateless and deterministic - no external dependencies
 */

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
    
    const totalForce = new Vector2D(0, 0);
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
    const steer = new Vector2D(0, 0);
    let count = 0;

    for (let neighbor of neighbors) {
        const distance = boid.position.distanceTo(neighbor.position);
        
        if (distance > 0 && distance < desiredSeparation) {
            // Calculate vector pointing away from neighbor
            const diff = boid.position.clone().subtract(neighbor.position);
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
    const sum = new Vector2D(0, 0);
    
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
    const sum = new Vector2D(0, 0);
    
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
    const desired = target.clone().subtract(boid.position);
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
        const desired = boid.position.clone().subtract(target);
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