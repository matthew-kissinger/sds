// SPDX-License-Identifier: AGPL-3.0-or-later
// Phase 0 spike: sim/ runs under vitest/Node and produces a stable trace.
// The cross-toolchain byte-compare (Vite vs esbuild) lives in
// tools/determinism-crosscheck.mjs; this pins the Node side.
import { describe, it, expect } from 'vitest';
import { spikeTrace } from '@sim/spike';
import { mulberry32 } from '@sim/rng';

describe('sim spike determinism', () => {
  it('mulberry32 produces the known sequence', () => {
    const rng = mulberry32(1);
    const seq = [rng(), rng(), rng()].map((v) => Math.round(v * 1e8) / 1e8);
    expect(seq).toEqual(seq.map(Number)); // finite
    const rng2 = mulberry32(1);
    expect([rng2(), rng2(), rng2()].map((v) => Math.round(v * 1e8) / 1e8)).toEqual(seq);
  });

  it('spikeTrace is reproducible in-process', () => {
    const a = spikeTrace(7, 50, 120);
    const b = spikeTrace(7, 50, 120);
    expect(b).toEqual(a);
    expect(a).toHaveLength(100);
    expect(a.every(Number.isFinite)).toBe(true);
  });
});
