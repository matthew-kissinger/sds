// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { advanceDogMotion, createDogMotion } from '@app/scene/dog/dogMotion';

describe('stationary dog presentation', () => {
  it('does not repeatedly bounce a stationary body at the gait frequency', () => {
    const motion = createDogMotion();
    for (let frame = 0; frame < 600; frame++) {
      advanceDogMotion(motion, 1 / 60, 0, 0, 1);
      expect(Math.abs(motion.bob)).toBe(0);
    }
  });
  it('retains locomotion bounce and settles after stopping', () => {
    const motion = createDogMotion();
    let movingPeak = 0;
    for (let frame = 0; frame < 120; frame++) {
      advanceDogMotion(motion, 1 / 60, 8, 0, 1);
      movingPeak = Math.max(movingPeak, Math.abs(motion.bob));
    }
    expect(movingPeak).toBeGreaterThan(0.005);
    for (let frame = 0; frame < 120; frame++) advanceDogMotion(motion, 1 / 60, 0, 0, 1);
    expect(Math.abs(motion.bob)).toBeLessThan(0.00001);
  });
});
