// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The rectangle maths under the fence, unit by unit. The trace fixtures pin
 * what the boundary does inside a whole tick; these pin what each piece of it
 * means, so a fixture diff can be read.
 */

import { describe, expect, it } from 'vitest';
import {
  applyHardBoundaryConstraints,
  calculateBoundaryAvoidanceWithGate,
  calculateRectAvoidance,
  isWithinArea,
} from '@sim/boundary';
import { Vector2D } from '@sim/Vector2D';
import { HOME_FIELD } from '@sim/field';
import { HARD_BOUNDARY, SHEEP_BOUNDARY } from '@sim/tuning';

const BOUNDS = HOME_FIELD.bounds;

function entity(x: number, z: number, vx = 0, vz = 0) {
  return { position: new Vector2D(x, z), velocity: new Vector2D(vx, vz) };
}

describe('rect avoidance', () => {
  it('is silent in open field', () => {
    const steer = calculateRectAvoidance(entity(0, 0), BOUNDS, SHEEP_BOUNDARY);
    expect(steer.x).toBe(0);
    expect(steer.z).toBe(0);
  });

  it('pushes inward, and only on the side that is close', () => {
    const west = calculateRectAvoidance(entity(-95, 0), BOUNDS, SHEEP_BOUNDARY);
    expect(west.x).toBeGreaterThan(0);
    expect(west.z).toBe(0);

    const south = calculateRectAvoidance(entity(0, -95), BOUNDS, SHEEP_BOUNDARY);
    expect(south.z).toBeGreaterThan(0);
    expect(south.x).toBe(0);
  });

  it('saturates at its force cap anywhere inside the margin', () => {
    // Proximity sets the DIRECTION, not the strength: the per-axis ramp is
    // normalized away, the result is scaled to maxSpeed * 1.5, and that already
    // exceeds the maxForce * 2.5 limit at sheep tuning - so the fence pushes at
    // exactly the cap from the moment a sheep enters the margin. Depth matters
    // only where two edges compete (below).
    const cap = SHEEP_BOUNDARY.maxForce * 2.5;
    for (const x of [-91, -95, -99]) {
      expect(calculateRectAvoidance(entity(x, 0), BOUNDS, SHEEP_BOUNDARY).magnitude()).toBeCloseTo(cap, 12);
    }
  });

  it('pushes diagonally out of a corner, leaning away from the nearer fence', () => {
    const steer = calculateRectAvoidance(entity(-95, -95), BOUNDS, SHEEP_BOUNDARY);
    expect(steer.x).toBeGreaterThan(0);
    expect(steer.z).toBeGreaterThan(0);
    expect(steer.x).toBeCloseTo(steer.z, 12); // equidistant corner, equal push

    const closerToTheWestFence = calculateRectAvoidance(entity(-98, -92), BOUNDS, SHEEP_BOUNDARY);
    expect(closerToTheWestFence.x).toBeGreaterThan(closerToTheWestFence.z);
  });

  it('never exceeds its force cap', () => {
    const steer = calculateRectAvoidance(entity(-99.9, -99.9, -5, -5), BOUNDS, SHEEP_BOUNDARY);
    expect(steer.magnitude()).toBeLessThanOrEqual(SHEEP_BOUNDARY.maxForce * 2.5 + 1e-9);
  });
});

describe('the gate carve-out', () => {
  const gate = HOME_FIELD.gate;

  it('lets a sheep standing in the mouth of the gate keep going north', () => {
    const inMouth = calculateBoundaryAvoidanceWithGate(entity(0, 96), BOUNDS, gate, SHEEP_BOUNDARY);
    expect(inMouth.z).toBe(0);
  });

  it('still turns back a sheep at the same depth but off to one side', () => {
    const offToTheSide = calculateBoundaryAvoidanceWithGate(entity(40, 96), BOUNDS, gate, SHEEP_BOUNDARY);
    expect(offToTheSide.z).toBeLessThan(0);
  });

  it('suppresses only the gate edge, never the side fences', () => {
    const cornerOfTheGateEdge = calculateBoundaryAvoidanceWithGate(entity(-96, 96), BOUNDS, gate, SHEEP_BOUNDARY);
    expect(cornerOfTheGateEdge.x).toBeGreaterThan(0);
  });

  it('is the plain rect force when there is no gate', () => {
    const withNull = calculateBoundaryAvoidanceWithGate(entity(0, 96), BOUNDS, null, SHEEP_BOUNDARY);
    expect(withNull.z).toBeLessThan(0);
  });
});

describe('the hard clamp', () => {
  it('returns a new vector and leaves the entity alone', () => {
    const e = entity(500, 500);
    const clamped = applyHardBoundaryConstraints(e, BOUNDS, HOME_FIELD.gate, HARD_BOUNDARY);
    expect(clamped).not.toBe(e.position);
    expect(e.position.x).toBe(500);
    expect(clamped.x).toBe(BOUNDS.maxX - HARD_BOUNDARY.margin);
    expect(clamped.z).toBe(BOUNDS.maxZ - HARD_BOUNDARY.margin);
  });

  it('leaves an entity in open field untouched', () => {
    const clamped = applyHardBoundaryConstraints(entity(12, -34), BOUNDS, HOME_FIELD.gate, HARD_BOUNDARY);
    expect(clamped.x).toBe(12);
    expect(clamped.z).toBe(-34);
  });

  it('lets a sheep through the gate mouth, clamped to the opening width', () => {
    const throughTheGate = applyHardBoundaryConstraints(
      entity(1, 101),
      BOUNDS,
      HOME_FIELD.gate,
      HARD_BOUNDARY,
    );
    // Past the fence line, which is the entire point of the gate.
    expect(throughTheGate.z).toBe(101);
    expect(throughTheGate.x).toBe(1);

    const squeezed = applyHardBoundaryConstraints(entity(3.9, 101), BOUNDS, HOME_FIELD.gate, HARD_BOUNDARY);
    expect(squeezed.x).toBeLessThanOrEqual(HOME_FIELD.gate.width / 2);
  });

  it('holds the fence line when gate passage is off', () => {
    const clamped = applyHardBoundaryConstraints(entity(1, 101), BOUNDS, HOME_FIELD.gate, {
      margin: HARD_BOUNDARY.margin,
      allowGatePassage: false,
    });
    expect(clamped.z).toBe(BOUNDS.maxZ - HARD_BOUNDARY.margin);
  });
});

describe('isWithinArea', () => {
  it('includes the edges', () => {
    expect(isWithinArea({ x: -30, z: 102 }, HOME_FIELD.pen)).toBe(true);
    expect(isWithinArea({ x: 30, z: 130 }, HOME_FIELD.pen)).toBe(true);
  });

  it('excludes a point just outside', () => {
    expect(isWithinArea({ x: -30.001, z: 110 }, HOME_FIELD.pen)).toBe(false);
    expect(isWithinArea({ x: 0, z: 101.999 }, HOME_FIELD.pen)).toBe(false);
  });
});
