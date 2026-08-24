// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Body collision, and above all the per-tick push caps.
 *
 * The caps are the reason the flock looks like animals and not like billiard
 * balls: a sheep wedged between four neighbours is unstuck over several ticks
 * instead of being fired out of the pile. Uncapping them is the single easiest
 * way to make the sim look wrong, so the caps get their own tests.
 */

import { describe, expect, it } from 'vitest';
import {
  DOG_SHEEP_MIN_DISTANCE,
  MAX_DOG_SHEEP_PUSH_PER_TICK,
  MAX_SHEEP_SHEEP_PUSH_PER_TICK,
  SHEEP_SHEEP_MIN_DISTANCE,
  createSheepCollisionScratch,
  resolveDogSheepCollision,
  resolveDogSheepCollisions,
  resolveSheepSheepCollisions,
} from '@sim/EntityCollision';
import { Vector2D } from '@sim/Vector2D';

function body(x: number, z: number, id = 0) {
  return { id, position: new Vector2D(x, z), velocity: new Vector2D(0, 0), state: 'active' as const };
}

describe('dog against sheep', () => {
  it('ignores a sheep that is not touching', () => {
    const s = body(0, DOG_SHEEP_MIN_DISTANCE + 0.01);
    expect(resolveDogSheepCollision(s, { x: 0, z: 0 })).toBe(false);
    expect(s.position.z).toBe(DOG_SHEEP_MIN_DISTANCE + 0.01);
  });

  it('pushes an overlapping sheep straight away from the dog', () => {
    const s = body(0, 1);
    expect(resolveDogSheepCollision(s, { x: 0, z: 0 })).toBe(true);
    expect(s.position.x).toBe(0);
    expect(s.position.z).toBeGreaterThan(1);
    expect(s.position.z).toBeLessThanOrEqual(DOG_SHEEP_MIN_DISTANCE);
  });

  it('never moves a sheep further than the cap in one tick', () => {
    const s = body(0, 0.0001);
    resolveDogSheepCollision(s, { x: 0, z: 0 });
    expect(Math.hypot(s.position.x, s.position.z - 0.0001)).toBeLessThanOrEqual(
      MAX_DOG_SHEEP_PUSH_PER_TICK + 1e-9,
    );
  });

  it('unstacks two bodies at the same point deterministically', () => {
    const first = body(0, 0, 3);
    const second = body(0, 0, 3);
    resolveDogSheepCollision(first, { x: 0, z: 0 });
    resolveDogSheepCollision(second, { x: 0, z: 0 });
    expect(second.position.x).toBe(first.position.x);
    expect(second.position.z).toBe(first.position.z);
    expect(Math.hypot(first.position.x, first.position.z)).toBeGreaterThan(0);
  });

  it('cancels only the velocity that pointed into the dog', () => {
    const s = body(0, 1);
    s.velocity.set(0.1, -0.1); // sideways, and straight at the dog
    resolveDogSheepCollision(s, { x: 0, z: 0 });
    expect(s.velocity.z).toBeCloseTo(0, 12);
    expect(s.velocity.x).toBeCloseTo(0.1, 12);
  });

  it('leaves a velocity that was already running away alone', () => {
    const s = body(0, 1);
    s.velocity.set(0, 0.1);
    resolveDogSheepCollision(s, { x: 0, z: 0 });
    expect(s.velocity.z).toBeCloseTo(0.1, 12);
  });

  it('resolves against every dog in the co-op flock', () => {
    const s = body(0, 0.5);
    const pushed = resolveDogSheepCollisions(s, [{ position: { x: 0, z: 0 } }, { position: { x: 0, z: 40 } }]);
    expect(pushed).toBe(true);
    expect(s.position.z).toBeGreaterThan(0.5);
  });
});

describe('sheep against sheep', () => {
  it('separates an overlapping pair, both of them, by no more than the cap', () => {
    const flock = [body(0, 0, 0), body(0.5, 0, 1)];
    const result = resolveSheepSheepCollisions(flock, { scratch: createSheepCollisionScratch() });
    expect(result.pairs).toBe(1);
    expect(result.moved).toBe(2);
    expect(flock[0]!.position.x).toBeLessThan(0);
    expect(flock[1]!.position.x).toBeGreaterThan(0.5);
    expect(Math.abs(flock[0]!.position.x)).toBeLessThanOrEqual(MAX_SHEEP_SHEEP_PUSH_PER_TICK + 1e-9);
    expect(flock[1]!.position.x - 0.5).toBeLessThanOrEqual(MAX_SHEEP_SHEEP_PUSH_PER_TICK + 1e-9);
  });

  it('caps a sheep buried in a pile, however many neighbours push it', () => {
    const middle = body(0, 0, 0);
    const flock = [
      middle,
      body(0.3, 0, 1),
      body(-0.3, 0, 2),
      body(0, 0.3, 3),
      body(0, -0.3, 4),
      body(0.2, 0.2, 5),
      body(-0.2, -0.2, 6),
    ];
    resolveSheepSheepCollisions(flock, { scratch: createSheepCollisionScratch() });
    expect(Math.hypot(middle.position.x, middle.position.z)).toBeLessThanOrEqual(
      MAX_SHEEP_SHEEP_PUSH_PER_TICK + 1e-9,
    );
  });

  it('takes several ticks to clear a pile, which is the point of the cap', () => {
    const flock = [body(0, 0, 0), body(0.05, 0, 1)];
    const scratch = createSheepCollisionScratch();
    let ticks = 0;
    while (ticks < 200) {
      const r = resolveSheepSheepCollisions(flock, { scratch });
      if (r.pairs === 0) break;
      ticks++;
    }
    expect(ticks).toBeGreaterThan(1);
    expect(ticks).toBeLessThan(200);
    const gap = Math.hypot(
      flock[0]!.position.x - flock[1]!.position.x,
      flock[0]!.position.z - flock[1]!.position.z,
    );
    expect(gap).toBeGreaterThanOrEqual(SHEEP_SHEEP_MIN_DISTANCE - 1e-9);
  });

  it('ignores sheep that are not touching', () => {
    const flock = [body(0, 0, 0), body(SHEEP_SHEEP_MIN_DISTANCE + 0.01, 0, 1)];
    const result = resolveSheepSheepCollisions(flock, { scratch: createSheepCollisionScratch() });
    expect(result.pairs).toBe(0);
    expect(result.moved).toBe(0);
  });

  it('is order-independent for the same flock, and allocation-free across ticks', () => {
    const scratch = createSheepCollisionScratch();
    const build = () => [body(0, 0, 0), body(0.5, 0, 1), body(0.2, 0.4, 2)];
    const first = build();
    resolveSheepSheepCollisions(first, { scratch });
    const second = build();
    const result = resolveSheepSheepCollisions(second, { scratch });
    expect(second.map((s) => [s.position.x, s.position.z])).toEqual(
      first.map((s) => [s.position.x, s.position.z]),
    );
    // The same scratch object is handed back, not a fresh result each tick.
    expect(resolveSheepSheepCollisions(build(), { scratch })).toBe(result);
  });

  it('handles an empty flock without allocating a result', () => {
    const scratch = createSheepCollisionScratch();
    const result = resolveSheepSheepCollisions([], { scratch });
    expect(result.pairs).toBe(0);
    expect(result).toBe(scratch.result);
  });
});
