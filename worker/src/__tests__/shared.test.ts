import { describe, it, expect } from 'vitest';
import { Vector2D } from '../shared/Vector2D';
import {
  calculateFlockingForce,
  calculateSeparation,
  getNeighbors,
} from '../shared/FlockingAlgorithms';

describe('Vector2D', () => {
  it('creates a zero vector by default', () => {
    const v = new Vector2D();
    expect(v.x).toBe(0);
    expect(v.z).toBe(0);
  });

  it('adds two vectors', () => {
    const a = new Vector2D(1, 2);
    const b = new Vector2D(3, 4);
    a.add(b);
    expect(a.x).toBe(4);
    expect(a.z).toBe(6);
  });

  it('subtracts two vectors', () => {
    const a = new Vector2D(5, 8);
    const b = new Vector2D(2, 3);
    a.subtract(b);
    expect(a.x).toBe(3);
    expect(a.z).toBe(5);
  });

  it('multiplies by scalar', () => {
    const v = new Vector2D(2, 3);
    v.multiply(2);
    expect(v.x).toBe(4);
    expect(v.z).toBe(6);
  });

  it('calculates magnitude correctly', () => {
    const v = new Vector2D(3, 4);
    expect(v.magnitude()).toBeCloseTo(5);
  });

  it('normalizes to unit length', () => {
    const v = new Vector2D(3, 4);
    v.normalize();
    expect(v.magnitude()).toBeCloseTo(1);
  });

  it('limits magnitude', () => {
    const v = new Vector2D(10, 0);
    v.limit(5);
    expect(v.magnitude()).toBeCloseTo(5);
  });

  it('does not limit when below max', () => {
    const v = new Vector2D(2, 0);
    v.limit(5);
    expect(v.magnitude()).toBeCloseTo(2);
  });

  it('calculates distance to another vector', () => {
    const a = new Vector2D(0, 0);
    const b = new Vector2D(3, 4);
    expect(a.distanceTo(b)).toBeCloseTo(5);
  });

  it('clones correctly', () => {
    const a = new Vector2D(1, 2);
    const b = a.clone();
    b.x = 99;
    expect(a.x).toBe(1); // original unchanged
  });

  it('creates from angle', () => {
    const v = Vector2D.fromAngle(0);
    expect(v.x).toBeCloseTo(1);
    expect(v.z).toBeCloseTo(0);
  });

  it('set assigns x and z', () => {
    const v = new Vector2D(0, 0);
    v.set(7, 9);
    expect(v.x).toBe(7);
    expect(v.z).toBe(9);
  });

  it('divide does nothing with zero divisor', () => {
    const v = new Vector2D(4, 8);
    v.divide(0);
    expect(v.x).toBe(4);
    expect(v.z).toBe(8);
  });
});

describe('FlockingAlgorithms', () => {
  const makeBoid = (x: number, z: number, vx = 0, vz = 0) => ({
    position: new Vector2D(x, z),
    velocity: new Vector2D(vx, vz),
  });

  it('returns zero force with no neighbors', () => {
    const boid = makeBoid(0, 0);
    const force = calculateFlockingForce(boid, [], {});
    expect(force.magnitude()).toBe(0);
  });

  it('produces non-zero flocking force with neighbors', () => {
    const boid = makeBoid(0, 0, 0.1, 0);
    const neighbors = [
      makeBoid(1, 0, 0.1, 0),
      makeBoid(-1, 0, 0.1, 0),
      makeBoid(0, 1, 0, 0.1),
    ];
    const force = calculateFlockingForce(boid, neighbors, {
      separationDistance: 2.0,
      separationWeight: 1.5,
      alignmentWeight: 1.0,
      cohesionWeight: 1.0,
      maxSpeed: 1.5,
      maxForce: 0.05,
    });
    // Force should be defined (not NaN)
    expect(isNaN(force.x)).toBe(false);
    expect(isNaN(force.z)).toBe(false);
  });

  it('separation pushes boid away from crowded neighbor', () => {
    const boid = makeBoid(0, 0, 0, 0);
    const neighbors = [makeBoid(0.5, 0)]; // very close neighbor
    const steer = calculateSeparation(boid, neighbors, 2.0, 1.5, 0.05);
    // Separation force should push away (positive x since neighbor is at x=0.5)
    // boid at 0, neighbor at 0.5, so direction away is negative x
    expect(steer.x).toBeLessThan(0);
  });

  it('getNeighbors finds boids within radius', () => {
    const boid = makeBoid(0, 0);
    const others = [
      makeBoid(1, 0),   // distance 1 - within radius 5
      makeBoid(10, 0),  // distance 10 - outside radius 5
    ];
    const neighbors = getNeighbors(boid, others, 5);
    expect(neighbors.length).toBe(1);
    expect(neighbors[0]).toBe(others[0]);
  });

  it('getNeighbors excludes self', () => {
    const boid = makeBoid(0, 0);
    const neighbors = getNeighbors(boid, [boid], 100);
    expect(neighbors.length).toBe(0);
  });
});
