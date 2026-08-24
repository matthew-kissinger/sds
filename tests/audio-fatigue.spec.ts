// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import type { FlockSim } from '@sim/FlockSim';
import { FlockAudioScheduler } from '@app/audio/scheduler';
import { LOOP_PLAYBACK_RATES } from '@app/audio/soundscape';
import type { AudioCommand } from '@app/audio/types';

function quietFlock(count: number): FlockSim {
  const positions = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    positions[i * 2] = -45 + (i % 15) * 6;
    positions[i * 2 + 1] = -25 + Math.floor(i / 15) * 5;
  }
  return {
    authoritative: true,
    step() {},
    positions,
    headings: new Float32Array(count),
    stateFlags: new Uint8Array(count),
    dogPositions: new Float32Array([80, 80]),
    dogVelocities: new Float32Array(2),
    dogHeadings: new Float32Array(1),
    dogStamina: new Float32Array([1]),
    acceptedBarkSerial: 0,
    acceptedBarkTick: -1,
    acceptedBarkDog: -1,
  };
}

describe('ten-minute fatigue envelope', () => {
  it('keeps deterministic flock events bounded and globally spaced for 36,000 ticks', () => {
    const sim = quietFlock(75);
    const scheduler = new FlockAudioScheduler(20260821, 75);
    const commands: AudioCommand[] = [];
    const baaTicks: number[] = [];
    const bellTicks: number[] = [];
    let huffs = 0;
    let maxAtOneTick = 0;
    for (let tick = 0; tick <= 36_000; tick++) {
      commands.length = 0;
      scheduler.scheduleFrame(sim, tick, 0, 0, commands);
      maxAtOneTick = Math.max(maxAtOneTick, commands.length);
      for (const command of commands) {
        if (command.kind !== 'asset') continue;
        if (command.assetId.startsWith('baa-')) baaTicks.push(tick);
        if (command.assetId === 'bellwether') bellTicks.push(tick);
        if (command.assetId === 'huff') huffs += 1;
      }
    }
    expect(baaTicks.length).toBeGreaterThan(40);
    expect(baaTicks.length).toBeLessThan(1_300);
    for (let i = 1; i < baaTicks.length; i++) expect(baaTicks[i]! - baaTicks[i - 1]!).toBeGreaterThanOrEqual(28);
    for (let i = 1; i < bellTicks.length; i++) expect(bellTicks[i]! - bellTicks[i - 1]!).toBeGreaterThanOrEqual(420);
    expect(huffs).toBe(1);
    expect(maxAtOneTick).toBeLessThanOrEqual(3);
  });

  it('de-correlates loop periods without audible pitch extremes', () => {
    const rates = Object.values(LOOP_PLAYBACK_RATES);
    expect(new Set(rates).size).toBe(rates.length);
    for (const rate of rates) expect(rate).toBeGreaterThanOrEqual(0.975);
    for (const rate of rates) expect(rate).toBeLessThanOrEqual(1.025);
  });
});
