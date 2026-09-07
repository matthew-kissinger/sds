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
  it('thins birds as the dog agitates sheep', () => {
    const calm = measureSoundscape(createSoundscapeFrame(), sim(90));
    const active = measureSoundscape(createSoundscapeFrame(), sim(2));
    expect(active.agitation).toBeGreaterThan(calm.agitation);
    expect(active.birds).toBeLessThan(calm.birds);
  });

  it('includes the tail of a 75-sheep flock in agitation summaries', () => {
    const positions = new Float32Array(75 * 2);
    for (let i = 0; i < 75; i++) positions[i * 2] = -80;
    const flock = { ...sim(0), positions };
    const before = measureSoundscape(createSoundscapeFrame(), flock);
    // Previously the final eleven sheep were never sampled at this flock size.
    for (let i = 64; i < 75; i++) positions[i * 2] = 0;
    const after = measureSoundscape(createSoundscapeFrame(), flock);
    expect(after.agitation).toBeGreaterThan(0.1);
    expect(after.birds).toBeLessThan(before.birds);
  });

  it('keeps empty and single-sheep summaries finite', () => {
    for (const positions of [new Float32Array(), new Float32Array([12, -8])]) {
      const frame = measureSoundscape(createSoundscapeFrame(), { ...sim(0), positions });
      expect(Object.values(frame).every(Number.isFinite)).toBe(true);
    }
  });

  it('raises pant with fatigue', () => {
    const far = measureSoundscape(createSoundscapeFrame(), sim(50));
    const near = measureSoundscape(createSoundscapeFrame(), sim(50, 0.3));
    expect(far.pant).toBe(0);
    expect(near.pant).toBeGreaterThan(far.pant);
  });

  it('routes both approved layers without creating a second mixer', () => {
    const calls: string[] = [];
    const sink: LoopLevelSink = {
      setLoopLevel(id) { calls.push(id); },
    };
    applySoundscape(sink, createSoundscapeFrame(), sim(0));
    expect(calls).toEqual([
      'birds-loop',
      'pant-loop',
    ]);
  });
});
