// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The contract everything downstream reads: the FlockSim buffers, the fixed
 * tick, and the one win predicate.
 *
 * A second backend (GpuComputeSim, spec/01) will be held to exactly these
 * tests, which is why they are written against the interface rather than
 * against CpuDeterministicSim's internals - the buffers are the API, the sim
 * state behind them is not.
 */

import { describe, expect, it } from 'vitest';
import { CpuDeterministicSim, SHEEP_STATE_FLAG } from '@sim/FlockSim';
import type { FlockSim } from '@sim/FlockSim';
import { HOME_FIELD } from '@sim/field';
import { FIXED_DT } from '@sim/tuning';
import type { PlayerInputs } from '@sim/types';
import { createHerdingDriver } from './helpers/herding-driver';

const IDLE: PlayerInputs = { direction: { x: 0, z: 0 }, sprint: false, bark: false };
const RUN_NORTH: PlayerInputs = { direction: { x: 0, z: 1 }, sprint: false, bark: false };

function sim(flockSize = 25, seed = 20260821): CpuDeterministicSim {
  return new CpuDeterministicSim(HOME_FIELD, flockSize, seed);
}

describe('the buffer contract', () => {
  it('sizes every buffer off the flock', () => {
    const s: FlockSim = sim(25);
    expect(s.positions.length).toBe(50);
    expect(s.headings.length).toBe(25);
    expect(s.stateFlags.length).toBe(25);
    expect(s.authoritative).toBe(true);
  });

  it('is filled before the first step, not after it', () => {
    const s = sim(25);
    let allZero = true;
    for (const v of s.positions) if (v !== 0) allZero = false;
    expect(allZero).toBe(false);
    expect(s.tick).toBe(0);
  });

  it('reuses the same arrays every tick', () => {
    const s = sim(10);
    const positions = s.positions;
    const flags = s.stateFlags;
    s.step([IDLE], FIXED_DT);
    expect(s.positions).toBe(positions);
    expect(s.stateFlags).toBe(flags);
  });

  it('encodes the lifecycle the renderer will switch on', () => {
    expect(SHEEP_STATE_FLAG).toEqual({ active: 0, retiring: 1, penned: 2 });
    const s = sim(5);
    for (const flag of s.stateFlags) expect(flag).toBe(SHEEP_STATE_FLAG.active);
  });

  it('refuses any dt but the fixed one', () => {
    const s = sim(1);
    expect(() => s.step([IDLE], 1 / 30)).toThrow(/fixed-rate/);
    expect(() => s.step([IDLE], FIXED_DT)).not.toThrow();
  });
});

describe('determinism', () => {
  it('two instances on one seed stay bit-identical for a thousand ticks', () => {
    const a = sim(25, 777);
    const b = sim(25, 777);
    const drive = createHerdingDriver();
    const driveB = createHerdingDriver();
    for (let t = 0; t < 1000; t++) {
      a.step([drive(a.state)], FIXED_DT);
      b.step([driveB(b.state)], FIXED_DT);
    }
    expect(Array.from(b.positions)).toEqual(Array.from(a.positions));
    expect(Array.from(b.headings)).toEqual(Array.from(a.headings));
    expect(Array.from(b.stateFlags)).toEqual(Array.from(a.stateFlags));
  });

  it('different seeds diverge', () => {
    const a = sim(25, 1);
    const b = sim(25, 2);
    for (let t = 0; t < 60; t++) {
      a.step([RUN_NORTH], FIXED_DT);
      b.step([RUN_NORTH], FIXED_DT);
    }
    expect(Array.from(b.positions)).not.toEqual(Array.from(a.positions));
  });

  it('counts ticks, one per step', () => {
    const s = sim(3);
    for (let t = 0; t < 17; t++) s.step([IDLE], FIXED_DT);
    expect(s.tick).toBe(17);
  });
});

describe('the win predicate', () => {
  it('is one comparison: every sheep in the pen', () => {
    const s = sim(5, 1);
    expect(s.completed).toBe(false);
    for (const sheep of s.state.sheep) {
      sheep.state = 'penned';
      sheep.settleTarget = null;
    }
    s.step([IDLE], FIXED_DT);
    expect(s.pennedCount).toBe(5);
    expect(s.completed).toBe(true);
  });

  it('does not fire while one sheep is still out', () => {
    const s = sim(5, 1);
    for (const sheep of s.state.sheep.slice(1)) {
      sheep.state = 'penned';
      sheep.settleTarget = null;
    }
    s.step([IDLE], FIXED_DT);
    expect(s.pennedCount).toBe(4);
    expect(s.completed).toBe(false);
  });

  it('keeps running after completion rather than latching anything else', () => {
    const s = sim(2, 1);
    for (const sheep of s.state.sheep) {
      sheep.state = 'penned';
      sheep.settleTarget = null;
    }
    s.step([IDLE], FIXED_DT);
    const tickAtWin = s.tick;
    s.step([RUN_NORTH], FIXED_DT);
    expect(s.completed).toBe(true);
    expect(s.tick).toBe(tickAtWin + 1);
  });
});

describe('the dog, through the front door', () => {
  it('moves the way the input asks and points where it moves', () => {
    const s = sim(1, 1);
    const start = s.state.dogs[0]!.position.z;
    for (let t = 0; t < 60; t++) s.step([RUN_NORTH], FIXED_DT);
    const dog = s.state.dogs[0]!;
    expect(dog.position.z).toBeGreaterThan(start);
    expect(dog.heading.z).toBeGreaterThan(0.9);
    expect(Math.hypot(dog.heading.x, dog.heading.z)).toBeCloseTo(1, 6);
  });

  it('spends stamina sprinting and gets it back standing still', () => {
    const s = sim(1, 1);
    const dog = s.state.dogs[0]!;
    for (let t = 0; t < 60; t++) s.step([{ ...RUN_NORTH, sprint: true }], FIXED_DT);
    const spent = dog.stamina;
    expect(spent).toBeLessThan(100);
    for (let t = 0; t < 120; t++) s.step([IDLE], FIXED_DT);
    expect(dog.stamina).toBeGreaterThan(spent);
  });

  it('holds the bark on cooldown', () => {
    const s = sim(25, 1);
    const dog = s.state.dogs[0]!;
    s.step([{ ...IDLE, bark: true }], FIXED_DT);
    expect(dog.barkCooldownTicks).toBeGreaterThan(0);
    expect(s.acceptedBarkSerial).toBe(1);
    expect(s.acceptedBarkTick).toBe(s.tick);
    expect(s.acceptedBarkDog).toBe(0);
    expect(Array.from(s.dogPositions)).toEqual([
      dog.position.x,
      dog.position.z,
    ]);
    expect(s.dogStamina[0]).toBeCloseTo(dog.stamina / 100, 6);
    const remaining = dog.barkCooldownTicks;
    s.step([{ ...IDLE, bark: true }], FIXED_DT);
    expect(dog.barkCooldownTicks).toBe(remaining - 1);
    expect(s.acceptedBarkSerial).toBe(1);
  });

  it('never leaves the field', () => {
    const s = sim(1, 1);
    for (let t = 0; t < 600; t++) {
      s.step([{ direction: { x: -1, z: -1 }, sprint: true, bark: false }], FIXED_DT);
    }
    const dog = s.state.dogs[0]!;
    expect(dog.position.x).toBeGreaterThanOrEqual(HOME_FIELD.bounds.minX);
    expect(dog.position.z).toBeGreaterThanOrEqual(HOME_FIELD.bounds.minZ);
  });
});

describe('the flock, through the front door', () => {
  it('flees a dog that walks into it', () => {
    const s = sim(25, 1);
    const dog = s.state.dogs[0]!;
    const nearest = s.state.sheep.reduce((best, sheep) =>
      Math.hypot(sheep.position.x - dog.position.x, sheep.position.z - dog.position.z) <
      Math.hypot(best.position.x - dog.position.x, best.position.z - dog.position.z)
        ? sheep
        : best,
    );
    dog.position.set(nearest.position.x, nearest.position.z - 3);
    const before = Math.hypot(nearest.position.x - dog.position.x, nearest.position.z - dog.position.z);
    for (let t = 0; t < 60; t++) s.step([IDLE], FIXED_DT);
    const after = Math.hypot(nearest.position.x - dog.position.x, nearest.position.z - dog.position.z);
    expect(after).toBeGreaterThan(before);
  });

  it('flees whichever dog is near, whichever slot it sits in', () => {
    // The co-op rule: no sheep has an owner. A dog in slot 1 must scare a sheep
    // exactly as much as the same dog in slot 0, or the flock would flinch
    // differently depending on which player joined first.
    function displacement(nearFirst: boolean): [number, number] {
      const s = sim(1, 1);
      const sheep = s.state.sheep[0]!;
      const near = s.state.dogs[0]!;
      const far = {
        ...near,
        id: 1,
        position: near.position.clone(),
        velocity: near.velocity.clone(),
        acceleration: near.acceleration.clone(),
        heading: near.heading.clone(),
        penMemory: { inside: false },
      };
      near.position.set(sheep.position.x - 3, sheep.position.z);
      far.position.set(0, -95);
      s.state.dogs.length = 0;
      s.state.dogs.push(...(nearFirst ? [near, far] : [far, near]));

      const startX = sheep.position.x;
      const startZ = sheep.position.z;
      for (let t = 0; t < 30; t++) s.step([IDLE, IDLE], FIXED_DT);
      return [sheep.position.x - startX, sheep.position.z - startZ];
    }

    const [ax, az] = displacement(true);
    const [bx, bz] = displacement(false);
    expect(ax).toBeGreaterThan(0); // shoved east, away from the near dog
    expect(bx).toBe(ax);
    expect(bz).toBe(az);
  });
});
