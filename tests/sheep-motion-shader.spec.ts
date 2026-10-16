// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const motionSource = readFileSync(
  new URL('../app/src/scene/flock/sheepMotion.ts', import.meta.url),
  'utf8',
);
const materialSource = readFileSync(
  new URL('../app/src/scene/flock/sheepMaterial.ts', import.meta.url),
  'utf8',
);

describe('sheep motion shader compile budget', () => {
  it('keeps seeded broad and fine fleece on one compact body-and-outline field', () => {
    expect(motionSource).not.toContain('mx_noise_float');
    expect(motionSource).toContain('function paintedFleeceField(point: TSLNode)');
    expect(motionSource).toContain('seed.mul(float(23.1)).add(float(4.2))');
    expect(motionSource).toContain('FLEECE_BROAD_AMP = 0.066');
    expect(motionSource).toContain('FLEECE_FINE_AMP = 0.02');
    expect(motionSource).toContain('paintedFleeceField(\n    positionLocal.mul(float(FLEECE_BROAD * TAU))');
    expect(motionSource).toContain('.mul(float(FLEECE_FINE * TAU))');

    const helper = motionSource.match(
      /function paintedFleeceField\(point: TSLNode\): TSLNode \{[\s\S]*?\n\}/,
    )?.[0];
    expect(helper).toBeDefined();
    expect(helper?.match(/\bsin\(/g)).toHaveLength(3);

    expect(materialSource.match(/sheepAnimation\(nodes, motionScale, terrainOffsets\)\.displace\(/g))
      .toHaveLength(2);
  });

  it('keeps the unsupported head static instead of detaching it on the title scene', () => {
    expect(motionSource).not.toContain('NOD_MAX');
    expect(motionSource).not.toContain('NOD_RATE');
    expect(motionSource).not.toContain('nodArg');
    expect(motionSource).not.toContain('GRAZE_DROP');
    expect(motionSource).not.toContain('GRAZE_RETRACT');
    expect(motionSource).not.toContain('RUFF_NOD_SHARE');
    expect(motionSource).toContain('const fleeceLifeMask = masks.x.mul(');
    expect(motionSource).not.toContain('JIGGLE_REST');
    // The invariant is that an idle sheep's fleece is PERFECTLY STILL, because
    // the title scene stands one in front of the camera doing nothing. Both
    // gains are gated - one on agitation, one on the response envelope - and
    // there is no third, un-gated term. That is what JIGGLE_REST was, and why
    // its absence is asserted just above. This line used to pin the literal
    // formatting of the old vertical jiggle; it now pins the property that
    // formatting was standing in for, so the fleece can be re-rigged without
    // the test holding an opinion about layout.
    expect(motionSource).toContain('agitation.mul(float(FLEECE_SWELL_RUN))');
    expect(motionSource).toContain('response.mul(float(FLEECE_SWELL_RESPONSE))');
    // And that the fleece travels along its own normal rather than the world
    // axis: the swell scales the lump, and `rise` carries locomotion only.
    expect(motionSource).toContain('lump.mul(masks.x).mul(float(1).add(fleeceSwell))');
    expect(motionSource).toContain('const rise = hoof.add(bodyBob);');
    expect(motionSource).not.toContain('const headBone =');
    expect(motionSource).not.toContain('const articulatedHead = vec3(');
    expect(motionSource).not.toContain('const grazingRuff = vec3(');
    expect(motionSource).not.toContain('const grazeTuck = vec3(');
    expect(motionSource).not.toContain('NOD_CARRIAGE');
    expect(motionSource).not.toContain('HEAD_RETRACTION');
  });
});
