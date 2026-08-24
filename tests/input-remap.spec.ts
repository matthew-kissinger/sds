// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { bindingMove } from '@app/input/keyboard';
import { DEFAULT_INPUT_BINDINGS } from '@app/state/store';
import {
  beginTouchStick,
  endTouchStick,
  setTouchStick,
  touchActive,
  touchAxis,
  touchSprint,
} from '@app/input/touch';

describe('remapped keyboard input', () => {
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
    setTouchStick(0.75, -0.4, true);
    endTouchStick();
    expect(touchActive()).toBe(false);
    expect(touchSprint()).toBe(false);
    expect(touchAxis()).toEqual({ right: 0, forward: 0 });
  });
});
