// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import type { FlockSim } from '@sim/FlockSim';
import type { AudioLoopId } from './types';

const FIELD_EDGE = 100;
const FARMHOUSE_X = 45.6;
const FARMHOUSE_Z = 113;
const MAX_AGITATION_SAMPLES = 64;

export interface LoopLevelSink {
  setLoopLevel(id: AudioLoopId, level: number, x?: number, z?: number): void;
}

export interface SoundscapeFrame {
  birds: number;
  leaves: number;
  crowd: number;
  pant: number;
  agitation: number;
  flockX: number;
  flockZ: number;
}

export function createSoundscapeFrame(): SoundscapeFrame {
  return {
    birds: 0,
    leaves: 0,
    crowd: 0,
    pant: 0,
    agitation: 0,
    flockX: 0,
    flockZ: 0,
  };
}

/** Writes a stable, sampled summary rather than scanning thousands of sheep. */
export function measureSoundscape(
  frame: SoundscapeFrame,
  sim: FlockSim,
  tick: number,
  listenerX: number,
  listenerZ: number,
): SoundscapeFrame {
  const count = sim.positions.length / 2;
  const sampleCount = Math.min(count, MAX_AGITATION_SAMPLES);
  const dogX = sim.dogPositions[0] ?? 0;
  const dogZ = sim.dogPositions[1] ?? 0;
  let agitation = 0;
  let flockX = 0;
  let flockZ = 0;
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
    flockX += x;
    flockZ += z;
    sampled += 1;
  }
  agitation = sampled > 0 ? agitation / sampled : 0;
  flockX = sampled > 0 ? flockX / sampled : 0;
  flockZ = sampled > 0 ? flockZ / sampled : 0;

  const edgeDistance = FIELD_EDGE - Math.max(Math.abs(listenerX), Math.abs(listenerZ));
  const treelineNear = Math.max(0, Math.min(1, (34 - edgeDistance) / 28));
  const dogVx = sim.dogVelocities[0] ?? 0;
  const dogVz = sim.dogVelocities[1] ?? 0;
  const dogSpeed = Math.sqrt(dogVx * dogVx + dogVz * dogVz);
  const staminaDebt = 1 - (sim.dogStamina[0] ?? 1);

  frame.birds = 0.52 * (1 - agitation * 0.82);
  frame.leaves = 0.25 * treelineNear;
  // Long, unequal phrases let the distant flock bed rest without tying its
  // loudness to the number of sheep. Nearby calls carry individual activity.
  const seconds = tick / 60;
  const crowdPhrase = Math.max(0, Math.sin(seconds * 0.071) * 0.55
    + Math.sin(seconds * 0.113 + 1.7) * 0.45 - 0.12);
  frame.crowd = (0.045 + agitation * 0.10) * crowdPhrase;
  frame.pant = Math.max(0, Math.min(0.46, staminaDebt * 0.5 + dogSpeed / 85 - 0.06));
  frame.agitation = agitation;
  frame.flockX = flockX;
  frame.flockZ = flockZ;
  return frame;
}

export function applySoundscape(
  sink: LoopLevelSink,
  frame: SoundscapeFrame,
  sim: FlockSim,
): void {
  sink.setLoopLevel('birds-loop', frame.birds);
  sink.setLoopLevel('leaves-loop', frame.leaves);
  sink.setLoopLevel('crowd-loop', frame.crowd, frame.flockX, frame.flockZ);
  sink.setLoopLevel('farmhouse-chime-loop', 0.3, FARMHOUSE_X, FARMHOUSE_Z);
  sink.setLoopLevel(
    'pant-loop',
    frame.pant,
    sim.dogPositions[0] ?? 0,
    sim.dogPositions[1] ?? 0,
  );
}
