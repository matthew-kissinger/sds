// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../app/src/scene/Terrain.tsx', import.meta.url), 'utf8');

describe('terrain material compile budget', () => {
  it('takes its breakup from the shared painted field, not a copy', () => {
    // The scales themselves are asserted where they now live, in
    // tests/painted-field.spec.ts. What matters here is that the ground reads
    // the same field as the grass standing on it instead of its own.
    expect(source).toContain("import { paintedBlend } from '@app/tsl/paintedField'");
    expect(source).toContain('paintedBlend(positionWorld.xz)');
    expect(source).not.toContain('function paintedField');
    expect(source).not.toContain('PATCH_SCALE');
    expect(source).not.toContain('MOTTLE_SCALE');
    expect(source).not.toContain('mx_noise_float');
  });

  it('retains the field edge and relief palette treatment', () => {
    expect(source).toContain('bounds.minX - FIELD_EDGE');
    expect(source).toContain('bounds.maxZ + FIELD_EDGE');
    expect(source).toContain('PALETTE.skyHorizon');
    expect(source).toContain('PALETTE.skyZenith');
  });
});
