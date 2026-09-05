// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { CpuDeterministicSim } from '@sim/FlockSim';
import { HOME_FIELD } from '@sim/field';
import { DOG_MAX_SPEED, FIXED_DT } from '@sim/tuning';

function speedAfter(x: number, z: number) {
  const sim = new CpuDeterministicSim(HOME_FIELD, 25, 7103);
  for (let tick = 0; tick < 75; tick++) {
    sim.step([{ direction: { x, z }, sprint: false, bark: false }], FIXED_DT);
  }
  return { speed: sim.state.dogs[0]!.velocity.magnitude(), sim };
}

describe('proportional dog control', () => {
  it('settles at proportional walking speeds for partial stick travel', () => {
    expect(speedAfter(0, 0.25).speed).toBeCloseTo(DOG_MAX_SPEED * 0.25, 4);
    expect(speedAfter(0, 0.5).speed).toBeCloseTo(DOG_MAX_SPEED * 0.5, 4);
    expect(speedAfter(0, 1).speed).toBeCloseTo(DOG_MAX_SPEED, 4);
  });
  it('caps digital diagonals and out-of-range intent at the existing top speed', () => {
    expect(speedAfter(1, 1).speed).toBeCloseTo(DOG_MAX_SPEED, 4);
    expect(speedAfter(0, 4).speed).toBeCloseTo(DOG_MAX_SPEED, 4);
  });
  it('still brakes to rest on release and reproduces the same partial-input run', () => {
    const a = speedAfter(0.3, 0.4).sim;
    const b = speedAfter(0.3, 0.4).sim;
    expect(a.state.dogs[0]!.position).toEqual(b.state.dogs[0]!.position);
    for (let tick = 0; tick < 60; tick++) {
      a.step([{ direction: { x: 0, z: 0 }, sprint: false, bark: false }], FIXED_DT);
    }
    expect(a.state.dogs[0]!.velocity.magnitude()).toBeLessThan(0.001);
  });
});
