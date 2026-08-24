// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('initial decorative shader compile budget', () => {
  const ownedPaths = [
    'app/src/scene/farmhouse/materials.ts',
    'app/src/scene/scatter/flowers.ts',
    'app/src/scene/scatter/rocks.ts',
    'app/src/scene/scatter/crust.ts',
    'app/src/scene/scatter/bandedMaterial.ts',
  ] as const;

  it('keeps startup-visible decorative paint off MaterialX noise helpers', () => {
    for (const path of ownedPaths) expect(source(path), path).not.toContain('mx_noise_float');
  });

  it('retains the deterministic crossed-brush field and authored effects', () => {
    const bands = source('app/src/scene/scatter/bandedMaterial.ts');
    const flowers = source('app/src/scene/scatter/flowers.ts');
    const rocks = source('app/src/scene/scatter/rocks.ts');
    const yard = source('app/src/scene/farmhouse/materials.ts');

    expect(bands).toContain('export function paintedField');
    expect(bands.match(/\bsin\(/g)).toHaveLength(2);
    expect(bands).toContain('quantisedNoise');
    expect(flowers).toContain('BARK_WAVE_WIDTH');
    expect(flowers).toContain('springDrop');
    expect(rocks).toContain("outline: { color: OUTLINE_COLOR");
    expect(rocks).toContain('colony.patch');
    expect(yard).toContain('const ragged = cover.add(mottle');
    expect(yard).toContain('const scuffField = paintedField');
    expect(yard).toContain('color(CONTACT)');
  });
});
