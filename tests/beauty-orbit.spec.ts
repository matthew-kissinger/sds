// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The beauty orbit's one promise, pinned without a renderer: the pose is a pure
 * function of (tick, sim buffers).
 *
 * That is what makes tools/beauty-shots.mjs' manifest honest. spec/09 wants a
 * golden to carry the exact camera, time and seed that produced it; the tool
 * records seed and tick, and it can only record the camera by recording those
 * two if the camera is derived from them and from nothing else - not from a
 * wall clock, not from a frame delta, not from how long the page took to boot.
 */

import { describe, expect, it } from 'vitest';
import { createBeautyOrbit } from '@app/camera/beautyOrbit';
import { SHEEP_STATE_FLAG } from '@sim/FlockSim';
import { TICK_HZ } from '@sim/tuning';

/** Four sheep on a 10 m square centred on (12, -4). */
function flock(): { positions: Float32Array; flags: Uint8Array } {
  return {
    positions: new Float32Array([7, -9, 17, -9, 17, 1, 7, 1]),
    flags: new Uint8Array([
      SHEEP_STATE_FLAG.active,
      SHEEP_STATE_FLAG.active,
      SHEEP_STATE_FLAG.active,
      SHEEP_STATE_FLAG.active,
    ]),
  };
}

describe('beauty orbit', () => {
  it('aims at the centroid of the active flock', () => {
    const orbit = createBeautyOrbit();
    const { positions, flags } = flock();
    orbit.update(0, positions, flags);
    expect(orbit.aim.x).toBeCloseTo(12, 6);
    expect(orbit.aim.z).toBeCloseTo(-4, 6);
  });

  it('ignores penned sheep, which sit up-field behind the gate', () => {
    const orbit = createBeautyOrbit();
    const { positions, flags } = flock();
    const withPenned = new Float32Array([...positions, 0, 116]);
    const pennedFlags = new Uint8Array([...flags, SHEEP_STATE_FLAG.penned]);
    orbit.update(0, withPenned, pennedFlags);
    expect(orbit.aim.x).toBeCloseTo(12, 6);
    expect(orbit.aim.z).toBeCloseTo(-4, 6);
  });

  it('falls back to the whole set once nothing is loose', () => {
    const orbit = createBeautyOrbit();
    const positions = new Float32Array([-6, 116, 6, 116]);
    const flags = new Uint8Array([SHEEP_STATE_FLAG.penned, SHEEP_STATE_FLAG.penned]);
    orbit.update(0, positions, flags);
    expect(orbit.aim.x).toBeCloseTo(0, 6);
    expect(orbit.aim.z).toBeCloseTo(116, 6);
  });

  it('holds a fixed low distance from the flock', () => {
    const orbit = createBeautyOrbit();
    const { positions, flags } = flock();
    for (const tick of [0, 137, 2400, 9000]) {
      orbit.update(tick, positions, flags);
      const ground = Math.hypot(orbit.position.x - 12, orbit.position.z + 4);
      expect(ground).toBeCloseTo(36, 4);
      expect(orbit.position.y).toBeCloseTo(9, 6);
      // Low: the elevation above the aim point stays well under the gameplay
      // cameras' look-down, or it stops being a beauty angle.
      expect(Math.atan2(orbit.position.y - orbit.aim.y, ground)).toBeLessThan(0.3);
    }
  });

  it('is a pure function of the tick, not of the clock', () => {
    const a = createBeautyOrbit();
    const b = createBeautyOrbit();
    const { positions, flags } = flock();
    // Different histories, same tick: the tool re-captures the same frame even
    // if one run booted slower or dropped frames on the way.
    a.update(11, positions, flags);
    a.update(600, positions, flags);
    a.update(2400, positions, flags);
    b.update(2400, positions, flags);
    expect(a.position.toArray()).toEqual(b.position.toArray());
    expect(a.aim.toArray()).toEqual(b.aim.toArray());
  });

  it('walks a full turn per minute of sim time', () => {
    const orbit = createBeautyOrbit();
    const { positions, flags } = flock();
    orbit.update(0, positions, flags);
    const start = orbit.position.clone();
    orbit.update(60 * TICK_HZ, positions, flags);
    expect(orbit.position.distanceTo(start)).toBeLessThan(1e-3);
    // Quarter turn at 15 s: a slow authored move, not a whip around the flock.
    orbit.update(15 * TICK_HZ, positions, flags);
    expect(orbit.position.distanceTo(start)).toBeCloseTo(36 * Math.SQRT2, 3);
  });
});
