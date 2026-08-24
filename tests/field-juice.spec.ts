// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import {
  BARK_PULSE_SECONDS,
  BARK_RING_SECONDS,
  BarkEdgeTracker,
  barkPulseFrame,
  barkRingFrame,
  createBarkPulseField,
} from '@app/scene/juice/barkPulse';
import { advanceCompletion, smoothArrival } from '@app/scene/juice/completionMotion';
import { gateKitPlacements } from '@app/scene/fence/gateKit';
import type { FenceOpening } from '@app/scene/fenceGeometry';
import type { PostPlacement, RailPlacement } from '@app/scene/fence/placement';

const NORTH_GATE: FenceOpening = {
  ax: -4,
  az: 100,
  bx: 4,
  bz: 100,
  ux: 1,
  uz: 0,
  nx: 0,
  nz: -1,
  width: 8,
  kit: true,
};

describe('accepted bark presentation edge', () => {
  it('emits each accepted store event once and rearms after reset', () => {
    const tracker = new BarkEdgeTracker();
    expect(tracker.sample(null)).toBeNull();
    const event = { serial: 1, tick: 120, dog: 0, x: 3, z: -8 };
    expect(tracker.sample(event)).toEqual({ tick: 120, x: 3, z: -8 });
    expect(tracker.sample(event)).toBeNull();
    expect(tracker.sample(null)).toBeNull();
    expect(tracker.sample(event)).toEqual({ tick: 120, x: 3, z: -8 });
  });

  it('packs a fast outward wave and clamps reduced motion to a quiet halo', () => {
    const pulse = createBarkPulseField();
    const floats = (pulse.texture.image as { data: Float32Array }).data;
    pulse.update(0, null, false);
    pulse.update(0, { serial: 1, tick: 4, dog: 0, x: 7, z: 11 }, false);
    expect([...floats]).toEqual([7, 11, 0, 1]);
    pulse.update(1 / 60, { serial: 1, tick: 4, dog: 0, x: 7, z: 11 }, false);
    expect(floats[2]).toBeCloseTo(4, 5);
    expect(floats[3]).toBe(1);
    pulse.dispose();

    const reduced = barkPulseFrame(0.05, true);
    expect(reduced.radius).toBe(10);
    expect(reduced.amplitude).toBeLessThan(0.22);
    expect(barkPulseFrame(BARK_PULSE_SECONDS, false).visible).toBe(false);
  });

  it('keeps the visible echo readable after the gameplay front has crossed the field', () => {
    const mid = barkRingFrame(0.4, false);
    expect(mid.visible).toBe(true);
    expect(mid.radius).toBeGreaterThan(30);
    expect(mid.amplitude).toBeGreaterThan(0.8);
    expect(barkRingFrame(BARK_RING_SECONDS, false).visible).toBe(false);

    const reduced = barkRingFrame(0.05, true);
    expect(reduced.radius).toBe(10);
    expect(reduced.amplitude).toBeLessThanOrEqual(0.2);
  });
});

describe('completion choreography', () => {
  it('arrives smoothly and uses the reduced-motion clamp', () => {
    expect(smoothArrival(0)).toBe(0);
    expect(smoothArrival(0.5)).toBe(0.5);
    expect(smoothArrival(1)).toBe(1);
    expect(advanceCompletion(0, true, 0.18, 3, true)).toBe(1);
    expect(advanceCompletion(0, true, 0.18, 3, false)).toBeCloseTo(0.06, 6);
  });

  it('builds two leaves folded fully back against the fence line', () => {
    const posts: PostPlacement[] = [];
    const rails: RailPlacement[] = [];
    const leaves = gateKitPlacements(NORTH_GATE, () => 0, posts, rails);
    expect(leaves).toHaveLength(2);
    expect(leaves[0]!.parts).toHaveLength(leaves[1]!.parts.length);
    expect(leaves[0]!.closeTurn).toBeCloseTo(-leaves[1]!.closeTurn, 8);

    for (const [index, leaf] of leaves.entries()) {
      const bar = leaf.parts[0]!;
      const dx = bar.bx - bar.ax;
      const dz = bar.bz - bar.az;
      expect(Math.abs(dz)).toBeLessThan(1e-8);
      expect(dx * (index === 0 ? -1 : 1)).toBeGreaterThan(0);
      const c = Math.cos(leaf.closeTurn);
      const s = Math.sin(leaf.closeTurn);
      const closedZ = dx * s + dz * c;
      expect(Math.abs(closedZ)).toBeLessThan(1e-8);
    }
  });
});
