// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (path: string): string =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

const source = read('../app/src/tsl/paintedField.ts');
const terrain = read('../app/src/scene/Terrain.tsx');
const grass = read('../app/src/scene/grass/grassMaterial.ts');

describe('the painted field', () => {
  it('keeps both authored breakup scales without MaterialX noise', () => {
    // ~14 m patches broken by ~4 m mottling. One octave alone reads as
    // camouflage blobs from the Classic camera.
    expect(source).toContain('PATCH_SCALE = 0.07');
    expect(source).toContain('MOTTLE_SCALE = 0.26');
    expect(source).toContain('MOTTLE_WEIGHT = 0.45');
    expect(source).not.toContain('mx_noise_float');
  });

  it('is lattice value noise with a quintic fade', () => {
    expect(source).toContain('floor(rotated)');
    expect(source).toContain('fract(rotated)');
    // 6t^5 - 15t^4 + 10t^3: zero first AND second derivative at both ends, so
    // neighbouring cells meet without a crease. A cubic smoothstep leaves a
    // faint grid at these feature sizes.
    expect(source).toMatch(/float\(6\)\)\.sub\(float\(15\)\)\)\.add\(float\(10\)\)/);
    // One definition and the four corners of one cell.
    expect(source.match(/latticeValue\(/g)).toHaveLength(5);
  });

  it('is the only copy, which is the whole reason it exists', () => {
    // It lived twice - as `paintedField` in Terrain.tsx and `sineHashField` in
    // grassMaterial.ts - at matching frequencies, with a comment in each saying
    // so, and drifted inner constants saying otherwise. A clump standing on a
    // browner patch has to be browner, and that only holds if there is one
    // function to be right about.
    expect(terrain).toContain("from '@app/tsl/paintedField'");
    expect(grass).toContain("from '@app/tsl/paintedField'");
    for (const consumer of [terrain, grass]) {
      expect(consumer).not.toContain('function paintedField');
      expect(consumer).not.toContain('function sineHashField');
      expect(consumer).not.toContain('latticeValue');
    }
  });

  it('stays out of the simulation and off Three directly', () => {
    expect(source).toMatch(/from '\.\/nodes'/);
    expect(source).not.toMatch(/from 'three'|from 'three\/webgpu'|from 'three\/tsl'/);
  });
});
