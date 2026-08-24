// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import {
  DOG_IDLE_SIT_DELAY,
  advanceDogMotion,
  createDogMotion,
} from '@app/scene/dog/dogMotion';
import {
  advanceSheepResponse,
  createSheepResponseState,
} from '@app/scene/flock/sheepResponse';

describe('animal presentation response', () => {
  it('settles the dog only after five continuous idle seconds', () => {
    const motion = createDogMotion();
    for (let i = 0; i < (DOG_IDLE_SIT_DELAY - 0.1) * 60; i++) {
      advanceDogMotion(motion, 1 / 60, 0, 0, 1);
    }
    expect(motion.sit).toBe(0);

    for (let i = 0; i < 60; i++) advanceDogMotion(motion, 1 / 60, 0, 0, 1);
    expect(motion.sit).toBeGreaterThan(0.5);
    expect(Math.abs(motion.headTilt)).toBeGreaterThan(0.01);

    advanceDogMotion(motion, 1 / 60, 4, 0, 1);
    expect(motion.idleSeconds).toBe(0);
  });

  it('softens the dog head motion when reduced motion is requested', () => {
    const full = createDogMotion();
    const reduced = createDogMotion();
    for (let i = 0; i < 360; i++) {
      advanceDogMotion(full, 1 / 60, 0, 0, 1, 1);
      advanceDogMotion(reduced, 1 / 60, 0, 0, 1, 0.25);
    }
    expect(Math.abs(reduced.headTilt)).toBeLessThan(Math.abs(full.headTilt) * 0.4);
  });

  it('turns sudden movement into one decaying sheep response envelope', () => {
    const state = createSheepResponseState(1);
    expect(advanceSheepResponse(state, 0, 0, 0, 1 / 60, false)).toBe(0);
    const startled = advanceSheepResponse(state, 0, 4, 0, 1 / 60, false);
    expect(startled).toBeGreaterThan(0.8);

    let settled = startled;
    for (let i = 0; i < 60; i++) {
      settled = advanceSheepResponse(state, 0, 4, 0, 1 / 60, false);
    }
    expect(settled).toBe(0);
    expect(advanceSheepResponse(state, 0, 4, 0, 1 / 60, true)).toBe(1);
  });
});
