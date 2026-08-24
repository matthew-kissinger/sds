// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../app/src/scene/Terrain.tsx', import.meta.url), 'utf8');

describe('terrain material compile budget', () => {
  it('keeps both authored breakup scales without MaterialX noise', () => {
    expect(source).toContain('paintedField(positionWorld.xz, PATCH_SCALE');
    expect(source).toContain('paintedField(positionWorld.xz, MOTTLE_SCALE');
    expect(source).toContain('MOTTLE_WEIGHT = 0.45');
    expect(source).not.toContain('mx_noise_float');
  });

  it('retains the field edge and relief palette treatment', () => {
    expect(source).toContain('bounds.minX - FIELD_EDGE');
    expect(source).toContain('bounds.maxZ + FIELD_EDGE');
    expect(source).toContain('PALETTE.skyHorizon');
    expect(source).toContain('PALETTE.skyZenith');
  });
});
