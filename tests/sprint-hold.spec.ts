// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest';
import { CpuDeterministicSim } from '@sim/FlockSim';
import { HOME_FIELD } from '@sim/field';
import { FIXED_DT, MIN_STAMINA_TO_SPRINT } from '@sim/tuning';
import { clearIntent, currentIntent, resetSprintExhaustion, resolveSprintForTick,
  setMoveDirection, setSprint } from '@app/input/intent';

afterEach(clearIntent);
describe('exhausted sprint hold', () => {
  it('stays off through recovery and repeated device samples until release', () => {
    clearIntent();
    setSprint(true);
    resolveSprintForTick(100);
    expect(currentIntent().sprint).toBe(true);
    resolveSprintForTick(MIN_STAMINA_TO_SPRINT - 0.5);
    for (let stamina = 10; stamina <= 100; stamina++) {
      setSprint(true);
      resolveSprintForTick(stamina);
      expect(currentIntent().sprint).toBe(false);
    }
    setSprint(false);
    setSprint(true);
    resolveSprintForTick(100);
    expect(currentIntent().sprint).toBe(true);
  });
  it('cannot miss exhaustion between multiple fixed ticks in one render frame', () => {
    clearIntent();
    const sim = new CpuDeterministicSim(HOME_FIELD, 25, 7103);
    const dog = sim.state.dogs[0]!;
    dog.stamina = MIN_STAMINA_TO_SPRINT + 0.5;
    dog.velocity.set(0, 15);
    setMoveDirection(0, 1);
    setSprint(true);
    for (let frame = 0; frame < 24; frame++) {
      setSprint(true); // Every input device supplies the same held level.
      for (let tick = 0; tick < 5; tick++) {
        resolveSprintForTick(dog.stamina);
        sim.step([currentIntent()], FIXED_DT);
        if (frame > 0) expect(dog.sprinting).toBe(false);
      }
    }
    expect(dog.stamina).toBeGreaterThan(MIN_STAMINA_TO_SPRINT + 10);
    setSprint(false); setSprint(true);
    resolveSprintForTick(dog.stamina);
    sim.step([currentIntent()], FIXED_DT);
    expect(dog.sprinting).toBe(true);
  });
  it('rejects a fresh press without usable stamina and resets for a replacement run', () => {
    clearIntent();
    setSprint(true); resolveSprintForTick(0);
    expect(currentIntent().sprint).toBe(false);
    resetSprintExhaustion(); resolveSprintForTick(100);
    expect(currentIntent().sprint).toBe(true);
    clearIntent(); resolveSprintForTick(100);
    expect(currentIntent().sprint).toBe(false);
  });
});
