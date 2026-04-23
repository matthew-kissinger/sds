import { Vector2D } from './Vector2D';

/**
 * Pure flocking algorithm functions
 * Stateless and deterministic - no external dependencies
 */

export interface Boid {
  position: Vector2D;
  velocity: Vector2D;
  fleeRadius?: number;
}

export interface FlockingConfig {
  separationDistance?: number;
  separationWeight?: number;
  alignmentWeight?: number;
  cohesionWeight?: number;
  maxSpeed?: number;
  maxForce?: number;
}

/**
 * Apply flocking behavior (separation, alignment, cohesion) to a boid
 */
export function calculateFlockingForce(boid: Boid, neighbors: Boid[], config: FlockingConfig): Vector2D {
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

  const separation = calculateSeparation(boid, neighbors, separationDistance, maxSpeed, maxForce);
  const alignment = calculateAlignment(boid, neighbors, maxSpeed, maxForce);
  const cohesion = calculateCohesion(boid, neighbors, maxSpeed, maxForce);

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
 */
export function calculateSeparation(boid: Boid, neighbors: Boid[], desiredSeparation: number, maxSpeed: number, maxForce: number): Vector2D {
  const steer = new Vector2D(0, 0);
  let count = 0;

  for (const neighbor of neighbors) {
    const distance = boid.position.distanceTo(neighbor.position);

    if (distance > 0 && distance < desiredSeparation) {
      const diff = boid.position.clone().subtract(neighbor.position);
      diff.normalize();
      diff.divide(distance);
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
 */
export function calculateAlignment(boid: Boid, neighbors: Boid[], maxSpeed: number, maxForce: number): Vector2D {
  const sum = new Vector2D(0, 0);

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
 */
export function calculateCohesion(boid: Boid, neighbors: Boid[], maxSpeed: number, maxForce: number): Vector2D {
  const sum = new Vector2D(0, 0);

  for (const neighbor of neighbors) {
    sum.add(neighbor.position);
  }

  sum.divide(neighbors.length);
  return calculateSeek(boid, sum, maxSpeed, maxForce);
}

/**
 * Seek a target position
 */
export function calculateSeek(boid: Boid, target: Vector2D, maxSpeed: number, maxForce: number): Vector2D {
  const desired = target.clone().subtract(boid.position);
  desired.normalize();
  desired.multiply(maxSpeed);

  const steer = desired.subtract(boid.velocity);
  steer.limit(maxForce);

  return steer;
}

/**
 * Flee from a target position
 */
export function calculateFlee(boid: Boid, target: Vector2D, fleeRadius: number, maxSpeed: number, maxForce: number): Vector2D {
  const distance = boid.position.distanceTo(target);

  if (distance < fleeRadius) {
    const desired = boid.position.clone().subtract(target);
    desired.normalize();
    desired.multiply(maxSpeed);

    const steer = desired.subtract(boid.velocity);
    steer.limit(maxForce * 2);

    return steer;
  }

  return new Vector2D(0, 0);
}

/**
 * Get neighboring boids within perception radius
 */
export function getNeighbors(boid: Boid, allBoids: Boid[], perceptionRadius: number): Boid[] {
  const neighbors: Boid[] = [];

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
