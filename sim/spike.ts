// SPDX-License-Identifier: AGPL-3.0-or-later
// Phase 0 spike: a deliberately tiny deterministic step function used only to
// prove that sim/ TypeScript runs byte-identically under Vite, esbuild
// (the wrangler path), and vitest/Node. Replaced by the real sim in phase 1.

import { mulberry32, type Rng } from './rng';

export interface SpikeState {
  positions: Float64Array; // x,z pairs
  tick: number;
}

export function createSpikeState(count: number, seed: number): SpikeState {
  const rng = mulberry32(seed);
  const positions = new Float64Array(count * 2);
  for (let i = 0; i < count * 2; i++) {
    positions[i] = (rng() - 0.5) * 100;
  }
  return { positions, tick: 0 };
}

export function spikeStep(state: SpikeState, rng: Rng): SpikeState {
  const positions = new Float64Array(state.positions);
  const n = positions.length / 2;
  for (let i = 0; i < n; i++) {
    const x = positions[i * 2]!;
    const z = positions[i * 2 + 1]!;
    // sqrt-only math, no trig (spec/02 determinism rules)
    const d = Math.sqrt(x * x + z * z) + 1e-9;
    positions[i * 2] = x - (x / d) * 0.01 + (rng() - 0.5) * 0.001;
    positions[i * 2 + 1] = z - (z / d) * 0.01 + (rng() - 0.5) * 0.001;
  }
  return { positions, tick: state.tick + 1 };
}

/** Run a fixed trace and return 4-decimal-rounded samples for cross-toolchain compare. */
export function spikeTrace(seed: number, count: number, ticks: number): number[] {
  let state = createSpikeState(count, seed);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  for (let t = 0; t < ticks; t++) state = spikeStep(state, rng);
  const out: number[] = [];
  for (let i = 0; i < state.positions.length; i++) {
    out.push(Math.round(state.positions[i]! * 10000) / 10000);
  }
  return out;
}
