// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { CpuDeterministicSim } from '@sim/FlockSim';
import { HOME_FIELD } from '@sim/field';
import { FIXED_DT } from '@sim/tuning';

describe('dog reversal heading', () => {
  it.each([[0, 1], [1, 0], [0, -1], [-1, 0]])(
    'turns smoothly from heading (%s, %s) into exact reverse velocity', (x, z) => {
      const sim = new CpuDeterministicSim(HOME_FIELD, 25, 7103);
      const dog = sim.state.dogs[0]!;
      dog.position.set(60, 0);
      dog.heading.set(x!, z!);
      dog.velocity.set(-x! * 15, -z! * 15);
      let previousX = dog.heading.x;
      let previousZ = dog.heading.z;
      for (let tick = 0; tick < 90; tick++) {
        sim.step([{ direction: { x: -x!, z: -z! }, sprint: false, bark: false }], FIXED_DT);
        expect(dog.heading.magnitude()).toBeCloseTo(1, 10);
        // Under twelve degrees per tick; no instant half-turn or zero heading.
        expect(dog.heading.x * previousX + dog.heading.z * previousZ).toBeGreaterThan(0.98);
        if (tick === 0) {
          expect(dog.heading.x * z! - dog.heading.z * x!).toBeGreaterThan(0);
        }
        previousX = dog.heading.x;
        previousZ = dog.heading.z;
      }
      expect(dog.heading.x * -x! + dog.heading.z * -z!).toBeGreaterThan(0.999);
    },
  );
});
