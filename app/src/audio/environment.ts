// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import type { FlockSim } from '@sim/FlockSim';
import type { AudioLoopId } from './types';

const MAX_AGITATION_SAMPLES = 64;

export interface LoopLevelSink {
  setLoopLevel(id: AudioLoopId, level: number, x?: number, z?: number): void;
}

export interface SoundscapeFrame {
  birds: number;
  pant: number;
  agitation: number;
}

export function createSoundscapeFrame(): SoundscapeFrame {
  return {
    birds: 0,
    pant: 0,
    agitation: 0,
  };
}

/** Writes a stable, sampled summary rather than scanning thousands of sheep. */
export function measureSoundscape(
  frame: SoundscapeFrame,
  sim: FlockSim,
): SoundscapeFrame {
  const count = sim.positions.length / 2;
  const sampleCount = Math.min(count, MAX_AGITATION_SAMPLES);
  const dogX = sim.dogPositions[0] ?? 0;
  const dogZ = sim.dogPositions[1] ?? 0;
  let agitation = 0;
  let sampled = 0;
  for (let sample = 0; sample < sampleCount; sample++) {
    // Include both ends of the flock array within the fixed sample budget.
    const i = sampleCount > 1 ? Math.round(sample * (count - 1) / (sampleCount - 1)) : 0;
    const x = sim.positions[i * 2]!;
    const z = sim.positions[i * 2 + 1]!;
    const dx = x - dogX;
    const dz = z - dogZ;
    const distance = Math.sqrt(dx * dx + dz * dz);
    agitation += Math.max(0, 1 - distance / 34);
    sampled += 1;
  }
  agitation = sampled > 0 ? agitation / sampled : 0;

  const staminaDebt = 1 - (sim.dogStamina[0] ?? 1);

  frame.birds = 0.52 * (1 - agitation * 0.82);
  // Healthy walking stays quiet; exertion fades out with stamina recovery.
  frame.pant = Math.max(0, Math.min(0.8, (staminaDebt - 0.12) * 1.1));
  frame.agitation = agitation;
  return frame;
}

export function applySoundscape(
  sink: LoopLevelSink,
  frame: SoundscapeFrame,
  sim: FlockSim,
): void {
  sink.setLoopLevel('birds-loop', frame.birds);
  sink.setLoopLevel(
    'pant-loop',
    frame.pant,
    sim.dogPositions[0] ?? 0,
    sim.dogPositions[1] ?? 0,
  );
}
