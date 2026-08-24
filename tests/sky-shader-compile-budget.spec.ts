// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const code = readFileSync(resolve(process.cwd(), 'app/src/tsl/sky.ts'), 'utf8');

describe('initial sky shader compile budget', () => {
  it('shares one compact three-wave field across both cloud samples', () => {
    expect(code).not.toContain('mx_fractal_noise_float');
    expect(code).toContain('const cloudField = Fn(');
    expect(code.match(/\bsin\(/g)).toHaveLength(3);
    expect(code).toContain('const density = cloudField(sample);');
    expect(code).toContain('const towardSun = cloudField(sample.add(sunward));');
  });

  it('uses warped oblique directions rather than repeating axis bands', () => {
    const directions = [...code.matchAll(/dot\(point, vec3\(([^)]+)\)\)/g)]
      .map((match) => match[1]!.split(',').map(Number));

    expect(directions).toHaveLength(3);
    for (const direction of directions) {
      expect(direction).toHaveLength(3);
      expect(direction.every((component) => Math.abs(component) > 0.2)).toBe(true);
    }
    expect(new Set(directions.map((direction) => direction.join(','))).size).toBe(3);
    expect(code).toContain('.add(warp.mul(float(0.64)))');
    expect(code).toContain('.sub(warp.mul(float(0.31)))');
  });

  it('retains authored coverage, fades, cloud palette, and sun math', () => {
    expect(code).toContain('smoothstep(float(COVERAGE_LO), float(COVERAGE_HI), density)');
    expect(code).toContain('smoothstep(float(HORIZON_FADE_LO), float(HORIZON_FADE_HI), height)');
    expect(code).toContain('smoothstep(float(ZENITH_FADE_LO), float(ZENITH_FADE_HI), height)');
    expect(code).toContain('mix(color(PALETTE.cloudShade), color(PALETTE.cloudLit), litEdge)');
    expect(code).toContain('const toSun = clamp(dot(ray, sun), float(0), float(1));');
    expect(code).toContain('smoothstep(float(DISC_OUTER), float(DISC_INNER), toSun)');
  });
});
