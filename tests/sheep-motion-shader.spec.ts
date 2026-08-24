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
    expect(motionSource).toContain('.mul(agitation)\n    .mul(float(JIGGLE_RUN))');
    expect(motionSource).not.toContain('const headBone =');
    expect(motionSource).not.toContain('const articulatedHead = vec3(');
    expect(motionSource).not.toContain('const grazingRuff = vec3(');
    expect(motionSource).not.toContain('const grazeTuck = vec3(');
    expect(motionSource).not.toContain('NOD_CARRIAGE');
    expect(motionSource).not.toContain('HEAD_RETRACTION');
  });
});
