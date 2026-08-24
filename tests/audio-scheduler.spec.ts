// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import type { FlockSim } from '@sim/FlockSim';
import { FlockAudioScheduler, scheduleStoreAudio, type AudioStoreSnapshot } from '@app/audio/scheduler';

function snapshot(patch: Partial<AudioStoreSnapshot> = {}): AudioStoreSnapshot {
  return {
    gamePhase: 'playing',
    uiPanel: 'none',
    acceptedBark: null,
    penSerial: 0,
    penDelta: 0,
    pennedCount: 0,
    completionTick: -1,
    ...patch,
  };
}

function fakeSim(): FlockSim {
  return {
    authoritative: true,
    step() {},
    positions: new Float32Array([4, 4, 24, 10, -8, -3]),
    headings: new Float32Array(3),
    stateFlags: new Uint8Array([0, 0, 2]),
    dogPositions: new Float32Array([3, 3]),
    dogVelocities: new Float32Array(2),
    dogHeadings: new Float32Array(1),
    dogStamina: new Float32Array(1),
    acceptedBarkSerial: 0,
    acceptedBarkTick: -1,
    acceptedBarkDog: -1,
  };
}

describe('discrete audio scheduling', () => {
  it('round-robins accepted bark media without machine-gunning duplicate serials', () => {
    const before = snapshot();
    const bark = snapshot({ acceptedBark: { serial: 2, tick: 60, dog: 0, x: 7, z: 9 } });
    expect(scheduleStoreAudio(before, bark)).toContainEqual(expect.objectContaining({
      kind: 'asset', assetId: 'bark-02', point: { x: 7, z: 9 },
    }));
    expect(scheduleStoreAudio(bark, bark)).toHaveLength(0);
  });

  it('composes pen increments and the final resolve from ordinal state', () => {
    const commands = scheduleStoreAudio(
      snapshot({ pennedCount: 3, penSerial: 3 }),
      snapshot({ gamePhase: 'complete', pennedCount: 5, penSerial: 4, penDelta: 2, completionTick: 900 }),
    );
    expect(commands.filter((command) => command.kind === 'tone' && command.delaySeconds === 0)).toHaveLength(1);
    expect(commands.filter((command) => command.kind === 'tone')).toHaveLength(6);
    const final = commands.at(-1);
    expect(final).toEqual(expect.objectContaining({ frequencyHz: 587.33 }));
    if (final?.kind !== 'tone') throw new Error('expected completion tone');
    expect(final.delaySeconds).toBeCloseTo(0.86);
  });
});

describe('flock audio scheduling', () => {
  it('is seed-stable and reads typed positions for spatial voice commands', () => {
    const a = new FlockAudioScheduler(731, 3);
    const b = new FlockAudioScheduler(731, 3);
    const sim = fakeSim();
    const first: import('@app/audio/types').AudioCommand[] = [];
    const second: import('@app/audio/types').AudioCommand[] = [];
    a.scheduleFrame(sim, 10_000, 0, 0, first);
    b.scheduleFrame(sim, 10_000, 0, 0, second);
    expect(first).toEqual(second);
    expect(first).toContainEqual(expect.objectContaining({
      kind: 'asset', bus: 'flock', point: { x: 4, z: 4 },
    }));
  });

  it('spaces emissions globally even when several sheep are due', () => {
    const scheduler = new FlockAudioScheduler(92, 3);
    const sim = fakeSim();
    const first: import('@app/audio/types').AudioCommand[] = [];
    const second: import('@app/audio/types').AudioCommand[] = [];
    scheduler.scheduleFrame(sim, 10_000, 0, 0, first);
    scheduler.scheduleFrame(sim, 10_001, 0, 0, second);
    expect(first.some((command) => command.kind === 'asset' && command.bus === 'flock')).toBe(true);
    expect(second.some((command) => command.kind === 'asset' && command.assetId.startsWith('baa'))).toBe(false);
  });

  it('paces alternating footsteps and emits one huff after five idle seconds', () => {
    const scheduler = new FlockAudioScheduler(18, 3);
    const sim = fakeSim();
    sim.dogVelocities[0] = 12;
    const first: import('@app/audio/types').AudioCommand[] = [];
    scheduler.scheduleFrame(sim, 1, 0, 0, first);
    expect(first).toContainEqual(expect.objectContaining({ assetId: 'footfall-01' }));
    const duplicate: import('@app/audio/types').AudioCommand[] = [];
    scheduler.scheduleFrame(sim, 1, 0, 0, duplicate);
    expect(duplicate).toHaveLength(0);

    sim.dogVelocities[0] = 0;
    scheduler.scheduleFrame(sim, 2, 0, 0, []);
    const huff: import('@app/audio/types').AudioCommand[] = [];
    scheduler.scheduleFrame(sim, 302, 0, 0, huff);
    expect(huff).toContainEqual(expect.objectContaining({ assetId: 'huff' }));
    const noRepeat: import('@app/audio/types').AudioCommand[] = [];
    scheduler.scheduleFrame(sim, 602, 0, 0, noRepeat);
    expect(noRepeat.some((command) => command.kind === 'asset' && command.assetId === 'huff')).toBe(false);
  });
});
