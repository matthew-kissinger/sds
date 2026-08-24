// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The pen: a real fence with one hole in it, and the three-state lifecycle that
 * runs behind it.
 *
 * The whole design rests on one geometric claim - the only way to be inside the
 * box is to have come through the gate - so these tests attack that claim from
 * every side before they check the lifecycle it justifies.
 *
 * Note the shape of a "blocked" case below: the sheep starts OUTSIDE the box,
 * leaning on the wall. Dropping one straight into the interior is a teleport,
 * which no part of the sim does, and the barrier answers it by retiring the
 * sheep - the inside test runs before the keep-out push, deliberately, so that a
 * sheep which really did come through the gap is never ejected back out.
 */

import { describe, expect, it } from 'vitest';
import { PenBarrier } from '@sim/PenBarrier';
import type { PenSheep } from '@sim/PenBarrier';
import { Vector2D } from '@sim/Vector2D';
import { HOME_FIELD } from '@sim/field';
import { FIXED_DT, PEN_BARRIER } from '@sim/tuning';

const GATE = { x: HOME_FIELD.gate.position.x, z: HOME_FIELD.pen.minZ, width: HOME_FIELD.gate.width };

function barrier(): PenBarrier {
  return new PenBarrier(HOME_FIELD.pen, GATE, { ...PEN_BARRIER, settleSeed: 7 });
}

function sheep(x: number, z: number, id = 0): PenSheep & { position: Vector2D; velocity: Vector2D } {
  return { id, position: new Vector2D(x, z), velocity: new Vector2D(0, 0), state: 'active', settleTarget: null };
}

describe('the fence', () => {
  it('blocks a sheep that walks at the pen wall away from the gate', () => {
    const pen = barrier();
    const s = sheep(-25, 101.9);
    pen.update([s], null, true, FIXED_DT);
    expect(s.state).toBe('active');
    expect(s.position.z).toBeLessThan(HOME_FIELD.pen.minZ);
  });

  it('blocks the side walls too', () => {
    const pen = barrier();
    const s = sheep(-30.4, 115);
    pen.update([s], null, true, FIXED_DT);
    expect(s.state).toBe('active');
    expect(s.position.x).toBeLessThan(HOME_FIELD.pen.minX);
  });

  it('kills the velocity component that ran into the wall', () => {
    const pen = barrier();
    const s = sheep(-25, 101.9);
    s.velocity.set(0, 0.12);
    pen.update([s], null, true, FIXED_DT);
    expect(s.velocity.z).toBe(0);
  });

  it('lets a sheep in through the gap, and only through the gap', () => {
    const pen = barrier();
    const through = sheep(0, 102.5);
    pen.update([through], null, true, FIXED_DT);
    expect(through.state).toBe('retiring');

    const beside = sheep(HOME_FIELD.gate.width / 2 + 3, 101.9);
    pen.update([beside], null, true, FIXED_DT);
    expect(beside.state).toBe('active');
    expect(beside.position.z).toBeLessThan(HOME_FIELD.pen.minZ);
  });

  it('closes the gap when the gate is shut', () => {
    const pen = barrier();
    const s = sheep(0, 101.9);
    pen.update([s], null, false, FIXED_DT);
    expect(s.state).toBe('active');
    expect(s.position.z).toBeLessThan(HOME_FIELD.pen.minZ);
  });
});

describe('the lifecycle', () => {
  it('runs active -> retiring -> penned and stops there', () => {
    const pen = barrier();
    const s = sheep(0, 103);
    s.velocity.set(0.05, 0.05);

    pen.update([s], null, true, FIXED_DT);
    expect(s.state).toBe('retiring');
    expect(s.settleTarget).not.toBeNull();
    // Crossing the gate hands position over to the settle walk.
    expect(s.velocity.x).toBe(0);
    expect(s.velocity.z).toBe(0);

    const target = new Vector2D(s.settleTarget!.x, s.settleTarget!.z);
    let ticks = 0;
    while (s.state === 'retiring' && ticks < 6000) {
      pen.update([s], null, true, FIXED_DT);
      ticks++;
    }
    expect(s.state).toBe('penned');
    expect(ticks).toBeLessThan(6000);
    expect(Math.hypot(s.position.x - target.x, s.position.z - target.z)).toBeLessThan(0.4);
    expect(s.settleTarget).toBeNull();

    const restingX = s.position.x;
    const restingZ = s.position.z;
    for (let i = 0; i < 60; i++) pen.update([s], null, true, FIXED_DT);
    expect(s.state).toBe('penned');
    expect(s.position.x).toBe(restingX);
    expect(s.position.z).toBe(restingZ);
  });

  it('gives each sheep its own settle spot, inside the pen, from the seed', () => {
    const pen = barrier();
    const flock = [sheep(0, 103, 0), sheep(1, 103, 1), sheep(-1, 103, 2)];
    pen.update(flock, null, true, FIXED_DT);
    const spots = flock.map((s) => s.settleTarget!);
    for (const spot of spots) {
      expect(spot.x).toBeGreaterThan(HOME_FIELD.pen.minX);
      expect(spot.x).toBeLessThan(HOME_FIELD.pen.maxX);
      expect(spot.z).toBeGreaterThan(HOME_FIELD.pen.minZ);
      expect(spot.z).toBeLessThan(HOME_FIELD.pen.maxZ);
    }
    expect(new Set(spots.map((s) => `${s.x},${s.z}`)).size).toBe(3);

    // Same seed, same id, same spot: the settle layout is reproducible.
    const twin = barrier();
    const again = sheep(0, 103, 1);
    twin.update([again], null, true, FIXED_DT);
    expect(again.settleTarget!.x).toBe(spots[1]!.x);
    expect(again.settleTarget!.z).toBe(spots[1]!.z);
  });

  it('counts retiring and penned alike, because both are in the pen', () => {
    const pen = barrier();
    const walking = sheep(0, 103, 0);
    const outside = sheep(0, 50, 1);
    expect(pen.update([walking, outside], null, true, FIXED_DT)).toBe(1);
    expect(pen.pennedCount).toBe(1);

    while (walking.state === 'retiring') pen.update([walking, outside], null, true, FIXED_DT);
    expect(walking.state).toBe('penned');
    expect(pen.update([walking, outside], null, true, FIXED_DT)).toBe(1);
  });

  it('keeps a penned sheep in the pen even if something shoves it at the wall', () => {
    const pen = barrier();
    const s = sheep(0, 103);
    pen.update([s], null, true, FIXED_DT);
    s.position.set(0, 200);
    pen.update([s], null, true, FIXED_DT);
    expect(s.position.z).toBeLessThanOrEqual(HOME_FIELD.pen.maxZ);
  });

  it('releaseAll puts the whole flock back to active', () => {
    const pen = barrier();
    const flock = [sheep(0, 103, 0), sheep(1, 104, 1)];
    pen.update(flock, null, true, FIXED_DT);
    expect(pen.pennedCount).toBe(2);
    pen.releaseAll(flock);
    expect(pen.pennedCount).toBe(0);
    for (const s of flock) {
      expect(s.state).toBe('active');
      expect(s.settleTarget).toBeNull();
    }
  });
});

describe('the dog and the fence', () => {
  it('is blocked outside, let in through the gate, and then held inside', () => {
    const pen = barrier();
    const memory = { inside: false };

    const atTheWall = new Vector2D(-25, 101.5);
    pen.containDog(atTheWall, true, memory);
    expect(memory.inside).toBe(false);
    expect(atTheWall.z).toBeLessThan(HOME_FIELD.pen.minZ);

    const inTheGap = new Vector2D(0, 103);
    pen.containDog(inTheGap, true, memory);
    expect(memory.inside).toBe(true);

    const shovedOut = new Vector2D(0, 200);
    pen.containDog(shovedOut, true, memory);
    expect(shovedOut.z).toBeLessThanOrEqual(HOME_FIELD.pen.maxZ);
  });
});
