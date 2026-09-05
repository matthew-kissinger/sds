// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import type { FlockSim } from '@sim/FlockSim';
import {
  applySoundscape,
  createSoundscapeFrame,
  measureSoundscape,
  type LoopLevelSink,
} from '@app/audio/environment';

function sim(dogX: number, stamina = 1): FlockSim {
  return {
    authoritative: true,
    step() {},
    positions: new Float32Array([0, 0, 4, 2, 50, 50, -40, -30]),
    headings: new Float32Array(4),
    stateFlags: new Uint8Array(4),
    dogPositions: new Float32Array([dogX, 0]),
    dogVelocities: new Float32Array([12, 0]),
    dogHeadings: new Float32Array(1),
    dogStamina: new Float32Array([stamina]),
    acceptedBarkSerial: 0,
    acceptedBarkTick: -1,
    acceptedBarkDog: -1,
  };
}

describe('state-driven soundscape', () => {
  it('thins birds and raises the flock bed as the dog agitates sheep', () => {
    const calm = measureSoundscape(createSoundscapeFrame(), sim(90), 300, 0, 0);
    const active = measureSoundscape(createSoundscapeFrame(), sim(2), 300, 0, 0);
    expect(active.agitation).toBeGreaterThan(calm.agitation);
    expect(active.birds).toBeLessThan(calm.birds);
    expect(active.crowd).toBeGreaterThan(calm.crowd);
  });

  it('includes the tail of a 75-sheep flock in position and agitation summaries', () => {
    const positions = new Float32Array(75 * 2);
    for (let i = 0; i < 75; i++) positions[i * 2] = -80;
    const flock = { ...sim(0), positions };
    const before = measureSoundscape(createSoundscapeFrame(), flock, 300, 0, 0);
    // Previously the final eleven sheep were never sampled at this flock size.
    for (let i = 64; i < 75; i++) positions[i * 2] = 0;
    const after = measureSoundscape(createSoundscapeFrame(), flock, 300, 0, 0);
    expect(after.flockX).toBeGreaterThan(before.flockX + 8);
    expect(after.agitation).toBeGreaterThan(0.1);
    expect(after.crowd).toBeGreaterThan(before.crowd);
    expect(after.birds).toBeLessThan(before.birds);
  });

  it('keeps empty and single-sheep summaries finite', () => {
    for (const positions of [new Float32Array(), new Float32Array([12, -8])]) {
      const frame = measureSoundscape(createSoundscapeFrame(), { ...sim(0), positions }, 0, 0, 0);
      expect(Object.values(frame).every(Number.isFinite)).toBe(true);
      expect(frame.flockX).toBe(positions[0] ?? 0);
      expect(frame.flockZ).toBe(positions[1] ?? 0);
    }
  });

  it('raises leaves near the treeline and pant with fatigue', () => {
    const far = measureSoundscape(createSoundscapeFrame(), sim(50), 600, 0, 0);
    const near = measureSoundscape(createSoundscapeFrame(), sim(50, 0.3), 600, 92, 0);
    expect(near.leaves).toBeGreaterThan(far.leaves);
    expect(near.pant).toBeGreaterThan(far.pant);
  });

  it('routes all five accepted continuous layers without creating a second mixer', () => {
    const calls: string[] = [];
    const sink: LoopLevelSink = {
      setLoopLevel(id) { calls.push(id); },
    };
    applySoundscape(sink, createSoundscapeFrame(), sim(0));
    expect(calls).toEqual([
      'birds-loop', 'leaves-loop', 'crowd-loop', 'farmhouse-chime-loop',
      'pant-loop',
    ]);
  });
});
