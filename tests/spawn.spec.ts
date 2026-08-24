// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Spawn determinism. The seed is the whole contract: a Worker and a client that
 * agree on the seed must agree on where every sheep started, or every tick after
 * tick zero is already a divergence.
 *
 * Spawn is also the one place in the sim where trig is allowed (it draws a point
 * on a circle, once per sheep, before the clock starts), so it is worth pinning
 * that it really does run only there - `createSimState` is the only caller.
 */

import { describe, expect, it } from 'vitest';
import { generateInitialSheepPositions } from '@sim/spawn';
import { mulberry32 } from '@sim/rng';
import { createSimState } from '@sim/state';
import { HOME_FIELD } from '@sim/field';

const SPAWN_CONFIG = {
  spreadRadius: HOME_FIELD.spawn.spreadRadius,
  centerX: HOME_FIELD.spawn.center.x,
  centerZ: HOME_FIELD.spawn.center.z,
};

describe('spawn', () => {
  it('gives the same layout for the same seed, every time', () => {
    const first = generateInitialSheepPositions(25, HOME_FIELD.bounds, SPAWN_CONFIG, mulberry32(4242));
    const second = generateInitialSheepPositions(25, HOME_FIELD.bounds, SPAWN_CONFIG, mulberry32(4242));
    expect(second.map((p) => [p.x, p.z])).toEqual(first.map((p) => [p.x, p.z]));
  });

  it('gives a different layout for a different seed', () => {
    const a = generateInitialSheepPositions(25, HOME_FIELD.bounds, SPAWN_CONFIG, mulberry32(1));
    const b = generateInitialSheepPositions(25, HOME_FIELD.bounds, SPAWN_CONFIG, mulberry32(2));
    expect(b.map((p) => [p.x, p.z])).not.toEqual(a.map((p) => [p.x, p.z]));
  });

  it('produces exactly the requested count', () => {
    for (const n of [1, 7, 25, 60]) {
      expect(generateInitialSheepPositions(n, HOME_FIELD.bounds, SPAWN_CONFIG, mulberry32(9)).length).toBe(n);
    }
  });

  it('keeps every sheep on the field, clear of the fence', () => {
    const positions = generateInitialSheepPositions(200, HOME_FIELD.bounds, SPAWN_CONFIG, mulberry32(11));
    for (const p of positions) {
      expect(p.x).toBeGreaterThanOrEqual(HOME_FIELD.bounds.minX + 5);
      expect(p.x).toBeLessThanOrEqual(HOME_FIELD.bounds.maxX - 5);
      expect(p.z).toBeGreaterThanOrEqual(HOME_FIELD.bounds.minZ + 5);
      expect(p.z).toBeLessThanOrEqual(HOME_FIELD.bounds.maxZ - 5);
    }
  });

  it('clusters around the spawn centre', () => {
    const positions = generateInitialSheepPositions(50, HOME_FIELD.bounds, SPAWN_CONFIG, mulberry32(13));
    for (const p of positions) {
      const r = Math.hypot(p.x - SPAWN_CONFIG.centerX, p.z - SPAWN_CONFIG.centerZ);
      expect(r).toBeLessThanOrEqual(SPAWN_CONFIG.spreadRadius + 1e-9);
    }
  });

  it('stays out of an avoid area', () => {
    const avoid = { minX: -40, maxX: 0, minZ: -40, maxZ: 0 };
    const positions = generateInitialSheepPositions(
      40,
      HOME_FIELD.bounds,
      { ...SPAWN_CONFIG, avoidAreas: [avoid] },
      mulberry32(17),
    );
    const inside = positions.filter(
      (p) => p.x >= avoid.minX && p.x <= avoid.maxX && p.z >= avoid.minZ && p.z <= avoid.maxZ,
    );
    // Rejection sampling accepts its last attempt after 50 tries rather than
    // shipping a short flock, so a handful of strays is the documented cost.
    expect(inside.length).toBeLessThan(positions.length * 0.2);
  });
});

describe('createSimState', () => {
  it('is the one factory, and it is reproducible end to end', () => {
    const a = createSimState(HOME_FIELD, 25, 20260821);
    const b = createSimState(HOME_FIELD, 25, 20260821);
    expect(b.sheep.map((s) => [s.position.x, s.position.z])).toEqual(
      a.sheep.map((s) => [s.position.x, s.position.z]),
    );
    expect(b.dogs[0]!.position.x).toBe(a.dogs[0]!.position.x);
    expect(b.dogs[0]!.position.z).toBe(a.dogs[0]!.position.z);
  });

  it('starts every sheep active, still, and unpenned', () => {
    const state = createSimState(HOME_FIELD, 25, 3);
    expect(state.tick).toBe(0);
    expect(state.pennedCount).toBe(0);
    expect(state.completed).toBe(false);
    for (const s of state.sheep) {
      expect(s.state).toBe('active');
      expect(s.velocity.magnitude()).toBe(0);
      expect(s.settleTarget).toBeNull();
    }
  });

  it('numbers sheep by their index, which is what the SoA buffers assume', () => {
    const state = createSimState(HOME_FIELD, 10, 5);
    expect(state.sheep.map((s) => s.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('puts the dog where the field says, with full stamina', () => {
    const state = createSimState(HOME_FIELD, 5, 5);
    const dog = state.dogs[0]!;
    expect(dog.position.x).toBe(HOME_FIELD.dogSpawn.x);
    expect(dog.position.z).toBe(HOME_FIELD.dogSpawn.z);
    expect(dog.stamina).toBe(100);
    expect(dog.sprinting).toBe(false);
    expect(Math.hypot(dog.heading.x, dog.heading.z)).toBeCloseTo(1, 12);
  });
});
