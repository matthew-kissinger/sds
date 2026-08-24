// SPDX-License-Identifier: AGPL-3.0-or-later
// The device-space -> world-space mapping is where a sign error turns into a
// dog that runs the wrong way, and it is the one part of input that is testable
// without a browser. These pin both framings: Classic's constant world basis
// (spec/06: top-down input stays world-axis) and Follow's camera-relative one.
import { describe, it, expect } from 'vitest';
import {
  axisMagnitude,
  worldFromAxis,
  CLASSIC_FORWARD_X,
  CLASSIC_FORWARD_Z,
} from '@app/input/axis';

/** Assert a mapped move, sign-exact but tolerant of float dust (and of -0). */
function expectMove(
  axis: { right: number; forward: number },
  forwardX: number,
  forwardZ: number,
  expected: { x: number; z: number },
): void {
  const move = worldFromAxis(axis, forwardX, forwardZ, { x: 0, z: 0 });
  expect(move.x).toBeCloseTo(expected.x, 12);
  expect(move.z).toBeCloseTo(expected.z, 12);
}

function expectClassic(
  right: number,
  forward: number,
  expected: { x: number; z: number },
): void {
  expectMove({ right, forward }, CLASSIC_FORWARD_X, CLASSIC_FORWARD_Z, expected);
}

describe('classic framing (world-axis)', () => {
  it('sends forward up the field, toward the gate at z = 100', () => {
    expectClassic(0, 1, { x: 0, z: 1 });
    expectClassic(0, -1, { x: 0, z: -1 });
  });

  it('sends right toward -x, which is screen right under a camera looking up +z', () => {
    expectClassic(1, 0, { x: -1, z: 0 });
    expectClassic(-1, 0, { x: 1, z: 0 });
  });

  it('clamps a two-key diagonal to unit length', () => {
    expectClassic(1, 1, { x: -Math.SQRT1_2, z: Math.SQRT1_2 });
  });

  it('keeps partial deflection partial', () => {
    expectClassic(0, 0.4, { x: 0, z: 0.4 });
  });

  it('ignores the camera basis entirely', () => {
    // The same forward press under a camera aimed down -x still goes up +z.
    expectMove({ right: 0, forward: 1 }, -1, 0, { x: -1, z: 0 });
    expectClassic(0, 1, { x: 0, z: 1 });
  });
});

describe('follow framing (camera-relative yaw)', () => {
  it('rotates forward onto the camera yaw', () => {
    expectMove({ right: 0, forward: 1 }, 1, 0, { x: 1, z: 0 });
  });

  it('puts screen right at cross(forward, up)', () => {
    // Camera aimed down +x: screen right is +z.
    expectMove({ right: 1, forward: 0 }, 1, 0, { x: 0, z: 1 });
  });

  it('normalizes the incoming forward vector', () => {
    expectMove({ right: 0, forward: 1 }, 0, 17, { x: 0, z: 1 });
  });

  it('falls back to the world basis when the camera looks straight down', () => {
    expectMove({ right: 0, forward: 1 }, 0, 0, { x: 0, z: 1 });
  });
});

describe('axisMagnitude', () => {
  it('measures the deflection the merge rule and the deadzones test', () => {
    expect(axisMagnitude({ right: 0, forward: 0 })).toBe(0);
    expect(axisMagnitude({ right: 3, forward: 4 })).toBe(5);
  });
});
