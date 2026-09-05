// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { makeSkyMaterial, SKY_DOME_RADIUS } from '@app/tsl/sky';

const code = readFileSync(resolve(process.cwd(), 'app/src/tsl/sky.ts'), 'utf8');

describe('initial sky authoring and material budget', () => {
  it('keeps startup-visible clouds off expensive MaterialX noise and texture loading', () => {
    expect(code).not.toMatch(/\bmx_(?:fractal_)?noise_\w+/);
    expect(code).not.toMatch(/\b(?:TextureLoader|CubeTextureLoader|texture3D|texture)\s*\(/);
    // Each authored mass expands into shader work. Keep the small ellipse-union
    // kernel bounded while allowing its shape and shading to be art-directed.
    expect((code.match(/\bellipse\(/g) ?? []).length).toBeLessThanOrEqual(6);
  });

  it('bounds the authored cloud population and keeps projection divisors finite and positive', () => {
    const recipe = code.match(/const CLOUDS = (\[[\s\S]*?\]) as const;/)?.[1];
    expect(recipe, 'sky must expose a bounded static authoring table').toBeDefined();
    // The recipe is a literal numeric table; remove its optional trailing comma
    // without executing authoring source in the test process.
    const clouds = JSON.parse(recipe!.replace(/,\s*\]/g, ']')) as number[][];
    expect(clouds.length).toBeGreaterThan(0);
    expect(clouds.length).toBeLessThanOrEqual(8);
    for (const cloud of clouds) {
      expect(cloud).toHaveLength(5);
      expect(cloud.every(Number.isFinite)).toBe(true);
      const [azimuth, base, width, tower, lean] = cloud as [number, number, number, number, number];
      expect(Math.abs(azimuth)).toBeLessThanOrEqual(Math.PI);
      expect(base).toBeGreaterThan(0);
      expect(base).toBeLessThan(1);
      for (const divisor of [width, tower]) {
        expect(divisor).toBeGreaterThan(0.001);
        expect(divisor).toBeLessThan(1);
      }
      expect(Math.abs(lean)).toBeLessThanOrEqual(1);
    }
  });

  it('builds one opaque texture-free inside-dome material without depth or fog feedback', () => {
    const material = makeSkyMaterial();
    try {
      expect(material).toBeInstanceOf(THREE.MeshBasicNodeMaterial);
      expect(material.side).toBe(THREE.BackSide);
      expect(material.transparent).toBe(false);
      expect(material.opacity).toBe(1);
      expect(material.depthWrite).toBe(false);
      expect(material.fog).toBe(false);
      expect(material.map).toBeNull();
      expect(material.alphaMap).toBeNull();
      expect(material.colorNode).not.toBeNull();
      expect(SKY_DOME_RADIUS).toBeGreaterThan(400);
      expect(SKY_DOME_RADIUS).toBeLessThan(1200);
    } finally {
      material.dispose();
    }
  });
});
