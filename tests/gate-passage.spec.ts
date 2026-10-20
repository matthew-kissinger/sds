// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { HOME_FIELD } from '@sim/field';
import { createSimState, createTickRng } from '@sim/state';
import { step } from '@sim/step';

describe('the visible gate is the pen threshold', () => {
  it.each([-3.8, 0, 3.8])('counts a sheep crossing at x=%s before it can turn back', (x) => {
    const state = createSimState(HOME_FIELD, 1, 7);
    const sheep = state.sheep[0]!;
    sheep.position.set(x, 99.95);
    sheep.velocity.set(0, 0.12);
    step(state, [], createTickRng(7));
    expect(sheep.position.z).toBeGreaterThan(100);
    expect(sheep.state).toBe('retiring');
    expect(state.pennedCount).toBe(1);
  });

  it.each([-1, 1])('does not yank an oblique crossing back at side %s', (side) => {
    const state = createSimState(HOME_FIELD, 1, 7);
    const sheep = state.sheep[0]!;
    sheep.position.set(side * 3.7, 99.9);
    sheep.velocity.set(side * 0.1, 0.12);
    const rng = createTickRng(7);
    for (let t = 0; t < 8; t++) {
      step(state, [], rng);
      expect(sheep.position.z).toBeGreaterThan(100);
    }
    expect(sheep.state).not.toBe('active');
  });

  it.each([-20, -5, 5, 20])('does not count a sheep pressing the fence at x=%s', (x) => {
    const state = createSimState(HOME_FIELD, 1, 7);
    const sheep = state.sheep[0]!;
    sheep.position.set(x, 98.5);
    state.dogs[0]!.position.set(x, 95);
    const rng = createTickRng(7);
    for (let t = 0; t < 30; t++) step(state, [], rng);
    expect(sheep.state).toBe('active');
    expect(sheep.position.z).toBeLessThan(100);
    expect(state.pennedCount).toBe(0);
  });
});
