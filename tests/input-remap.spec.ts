// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { responseCurve } from '@app/input/axis';
import { bindingMove } from '@app/input/keyboard';
import { DEFAULT_INPUT_BINDINGS, restoreInputBindings } from '@app/state/store';
import {
  DEADZONE,
  SATURATION,
  STICK_RADIUS,
  beginTouchStick,
  endAllTouch,
  endTouchStick,
  setTouchOffset,
  setTouchSprint,
  touchActive,
  touchAxis,
  touchSprint,
} from '@app/input/touch';

/**
 * What the shaper owes a raw deflection: radial dead zone with rescale, outer
 * saturation, then the shared response curve. Written out here rather than
 * asserted as literals, because the point of these cases is that the pixels
 * reach the shaper at all - the shaping law itself is pinned in input-axis.
 */
function shaped(right: number, forward: number): { right: number; forward: number } {
  const deflection = Math.hypot(right, forward);
  const effort = responseCurve(Math.min(1, (deflection - DEADZONE) / (SATURATION - DEADZONE)));
  return { right: (right / deflection) * effort, forward: (forward / deflection) * effort };
}

/** A thumb `right`/`forward` of the way to the rim, as the overlay sends it. */
function push(right: number, forward: number): void {
  // Client y grows downward and the stick's forward is up the screen, so a
  // forward push is a negative dy. The timestamp is the event's own.
  setTouchOffset(right * STICK_RADIUS, -forward * STICK_RADIUS, 0);
}

describe('remapped keyboard input', () => {
  it.each(['forward', 'sprint', 'bark', 'camera'] as const)('gives walk a free key when an older layout already used the default for %s', action => {
    // Keyed off the default rather than a letter. The default moved from E to
    // V once, and a test that spells the letter out fails on the move while
    // saying nothing about whether the property survived it. The property is
    // that adding walk to a saved layout never steals a key that layout is
    // already using, whatever the default happens to be.
    const taken = DEFAULT_INPUT_BINDINGS.walk;
    const restored = restoreInputBindings({ [action]: taken });
    expect(restored[action]).toBe(taken);
    expect(restored.walk).not.toBe(taken);
    const others = Object.entries(restored)
      .filter(([name]) => name !== 'walk')
      .map(([, code]) => code);
    expect(others).not.toContain(restored.walk);
  });
  it('uses the selected physical key while arrows remain available', () => {
    const bindings = { ...DEFAULT_INPUT_BINDINGS, forward: 'KeyE' };
    expect(bindingMove('KeyE', bindings)).toEqual([0, 1]);
    expect(bindingMove('KeyW', bindings)).toBeUndefined();
    expect(bindingMove('ArrowUp', bindings)).toEqual([0, 1]);
  });
});

describe('touch cancellation state', () => {
  it('clears movement and sprint when a pointer is released or cancelled', () => {
    beginTouchStick();
    push(0.75, -0.4);
    const held = shaped(0.75, -0.4);
    expect(touchAxis().right).toBeCloseTo(held.right, 12);
    expect(touchAxis().forward).toBeCloseTo(held.forward, 12);
    setTouchSprint(true);
    endTouchStick();
    expect(touchActive()).toBe(false);
    expect(touchSprint()).toBe(true);
    expect(touchAxis()).toEqual({ right: 0, forward: 0 });
    endAllTouch();
    expect(touchSprint()).toBe(false);
  });

  it('keeps sprint independent from the movement pointer', () => {
    setTouchSprint(true);
    beginTouchStick();
    push(-0.5, 0.8);
    expect(touchSprint()).toBe(true);
    const moving = shaped(-0.5, 0.8);
    expect(touchAxis().right).toBeCloseTo(moving.right, 12);
    expect(touchAxis().forward).toBeCloseTo(moving.forward, 12);
    setTouchSprint(false);
    expect(touchActive()).toBe(true);
    endAllTouch();
  });

  it('reads the thumb in pixels against the stick radius', () => {
    // The entry point takes pixels, not a deflection, and there is deliberately
    // no shim that takes the old normalised pair: 0.9 of the dead zone is 0.44
    // mm of travel and must read as no direction at all, where the same number
    // as a deflection would be nearly full effort.
    beginTouchStick();
    setTouchOffset(0, -STICK_RADIUS * DEADZONE * 0.9, 0);
    expect(touchAxis()).toEqual({ right: 0, forward: 0 });

    // Past the rim the clamp is radial, so reach beyond full deflection buys
    // effort but never a direction the thumb did not ask for.
    beginTouchStick();
    setTouchOffset(0, -STICK_RADIUS * 2, 0);
    expect(touchAxis().forward).toBeCloseTo(1, 12);
    expect(touchAxis().right).toBeCloseTo(0, 12);
    endAllTouch();
  });
});
