// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { pollGamepad } from '@app/input/gamepad';

const axis = { right: 0, forward: 0 };
let pads: (Gamepad | null)[] = [];
function pad() {
  return { connected: true, axes: [0, 0],
    buttons: Array.from({ length: 8 }, () => ({ pressed: false, touched: false, value: 0 })),
  } as unknown as Gamepad;
}
function button(gamepad: Gamepad, index: number, value: number) {
  Object.assign(gamepad.buttons[index]!, { pressed: value >= 0.5, value });
}
beforeEach(() => {
  pads = [];
  vi.stubGlobal('navigator', { getGamepads: () => pads });
  pollGamepad(axis);
});
afterEach(() => { pads = []; pollGamepad(axis); vi.unstubAllGlobals(); });

it('stops held movement and sprint on disconnect and accepts a fresh action after reconnect', () => {
  const device = pad(); pads = [device];
  (device.axes as number[])[1] = -1;
  button(device, 7, 1); button(device, 1, 1);
  expect(pollGamepad(axis)).toMatchObject({ present: true, sprint: true, barkPressed: true });
  expect(axis).toEqual({ right: 0, forward: 1 });
  expect(pollGamepad(axis).barkPressed).toBe(false);
  pads = [null];
  expect(pollGamepad(axis)).toEqual({ present: false, sprint: false, barkPressed: false, cameraPressed: false });
  expect(axis).toEqual({ right: 0, forward: 0 });
  pads = [device];
  expect(pollGamepad(axis).barkPressed).toBe(true);
});

it('ignores resting-stick drift and triggers camera/bark once per hold', () => {
  const device = pad(); pads = [null, device];
  (device.axes as number[])[0] = 0.1;
  button(device, 3, 1); button(device, 2, 1);
  expect(pollGamepad(axis)).toMatchObject({ cameraPressed: true, barkPressed: true, sprint: false });
  expect(axis).toEqual({ right: 0, forward: 0 });
  expect(pollGamepad(axis)).toMatchObject({ cameraPressed: false, barkPressed: false });
  button(device, 3, 0); button(device, 2, 0); pollGamepad(axis);
  button(device, 3, 1); button(device, 0, 1);
  expect(pollGamepad(axis)).toMatchObject({ cameraPressed: true, sprint: true });
});

it('returns neutral input when the browser has no Gamepad API', () => {
  vi.stubGlobal('navigator', {});
  Object.assign(axis, { right: 1, forward: 1 });
  expect(pollGamepad(axis)).toMatchObject({ present: false, sprint: false });
  expect(axis).toEqual({ right: 0, forward: 0 });
});
