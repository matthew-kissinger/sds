// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { CpuDeterministicSim } from '@sim/FlockSim';
import { HOME_FIELD } from '@sim/field';
import { FIXED_DT } from '@sim/tuning';
import { createCameraSubject } from '@app/camera/subject';

describe('camera presentation subject', () => {
  it('advances within a tick interval without changing authoritative dog position', () => {
    const sim = new CpuDeterministicSim(HOME_FIELD, 25, 8);
    const subject = createCameraSubject();
    const start = subject.sample(sim, 0)!.position.z;
    sim.step([{ direction: { x: 0, z: 1 }, bark: false, sprint: false }], FIXED_DT);
    const authoritative = sim.state.dogs[0]!.position.z;
    const a = subject.sample(sim, FIXED_DT)!.position.z;
    const b = subject.sample(sim, FIXED_DT / 2)!.position.z;
    expect(a).toBeCloseTo(start, 4);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(authoritative);
    expect(sim.state.dogs[0]!.position.z).toBe(authoritative);
  });
  it('reuses its subject but discards old endpoints when a run is replaced', () => {
    const subject = createCameraSubject();
    const sim = new CpuDeterministicSim(HOME_FIELD, 25, 8);
    const first = subject.sample(sim, 0);
    expect(subject.sample(sim, FIXED_DT)).toBe(first);
    const next = new CpuDeterministicSim(HOME_FIELD, 75, 8);
    const reset = subject.sample(next, 0)!;
    expect(reset.position.x).toBeCloseTo(next.state.dogs[0]!.position.x, 4);
    expect(reset.position.z).toBeCloseTo(next.state.dogs[0]!.position.z, 4);
    expect(reset.position).not.toBe(next.state.dogs[0]!.position);
  });
});
