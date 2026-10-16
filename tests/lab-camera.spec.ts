// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// THE LAB CAMERA HAS TO HONOUR THE INTERPOLATION CONTRACT, and for a while it
// did not, which cost more review time than any defect it was built to find.
//
// `sim.positions` and `sim.dogPositions` advance once per tick. Every renderer
// that draws a body draws it at previous + (current - previous) * alpha,
// somewhere between two ticks - `Flock.tsx` for the flock, and
// `app/src/camera/subject.ts` for the game's own follow camera, whose comment
// has said "the same interpolation contract as the dog renderer" all along.
//
// The lab camera aimed at the STEPPED position instead. The subject therefore
// slid back and forth inside the frame once per tick, by a whole tick of travel
// - 0.12 m at full sheep speed, around ten pixels at review distance - and on
// frames where no tick landed the camera did not move at all, so it was a
// stutter rather than a lag.
//
// What made it expensive is that a camera fault is not legible as a camera
// fault. It reads as the SUBJECT twitching, it reads that way for every subject
// equally, and the lab is the instrument the animation work is judged on. Hours
// went into the sheep's gait, fleece and facing against a jitter that was the
// instrument and not the animal. The tell, in the end, was that the dog did it
// too.
//
// This is a source guard rather than a behavioural one because `lab/` sits
// outside the root tsconfig (see tsconfig.lab.json) and cannot be imported for
// types here. It is still worth having: it is cheap, and it fails loudly if
// anyone reaches for the stepped arrays again.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const camera = readFileSync(join(process.cwd(), 'lab', 'src', 'LabCamera.tsx'), 'utf8');

describe('lab camera', () => {
  it('aims through the presentation buffers, not the stepped sim arrays', () => {
    expect(camera).toContain('advancePositionPresentationBuffers');
    expect(camera).toContain('resetPositionPresentationBuffers');
    expect(camera).toContain('interpolationAlpha');
  });

  it('never reads a tick-stepped position straight into the aim point', () => {
    // The sim arrays may still be READ - the centroid is summed from them, and
    // interpolating a mean is the same as the mean of the interpolations - but
    // what reaches targetX/targetZ has to come off the buffers.
    const aim = camera.slice(camera.indexOf('const targetX'));
    expect(aim).toContain('previousPositions');
    expect(aim).toContain('currentPositions');
    expect(aim).not.toMatch(/targetX\s*=\s*sim\./);
    expect(aim).not.toMatch(/targetZ\s*=\s*sim\./);
  });

  it('resets rather than lerping across a discontinuity', () => {
    // A restart swaps the sim object and rewinds the tick; changing subject
    // moves the target somewhere unrelated. Interpolating through any of those
    // would sweep the camera across the field.
    expect(camera).toMatch(/tracked\.current\?\.sim !== sim/);
    expect(camera).toMatch(/sim\.tick < tracked\.current\.tick/);
    expect(camera).toMatch(/tracked\.current\.target !== subject\.target\.kind/);
  });
});
