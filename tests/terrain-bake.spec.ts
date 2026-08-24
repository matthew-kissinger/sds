// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The terrain bake is a recipe, and a recipe that does not reproduce is an
 * opaque binary with extra steps (AGENTS.md rule 11). This rebakes into a temp
 * directory and byte-compares against what is committed under assets/terrain/.
 *
 * A red test here means the recipe and the committed world have parted ways.
 * That is a DECISION, exactly like a trace fixture: read the diff, decide
 * whether the world was meant to move, and if it was, commit the rebaked bytes
 * and say in the same commit which recipe number changed and why. Never rerun
 * the bake to turn this green.
 *
 * It also holds the promises the manifest makes about the shape of the world -
 * gentle gradient, declared amplitude, flat pads - because "gently rolling" is
 * a number or it is nothing.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HeightfieldManifest } from '@app/world/heightfieldSampler';

const repo = fileURLToPath(new URL('..', import.meta.url));
const committed = join(repo, 'assets', 'terrain');

const manifest = JSON.parse(
  readFileSync(join(committed, 'manifest.json'), 'utf8'),
) as HeightfieldManifest;
const bytes = readFileSync(join(committed, 'heightfield.bin'));

describe('terrain bake', () => {
  let rebaked: string;

  beforeAll(() => {
    rebaked = mkdtempSync(join(tmpdir(), 'herd-terrain-bake-'));
    execFileSync(process.execPath, [join(repo, 'tools', 'bake-terrain.mjs'), '--out', rebaked], {
      cwd: repo,
      stdio: 'pipe',
    });
  }, 60_000);

  afterAll(() => {
    if (rebaked) rmSync(rebaked, { recursive: true, force: true });
  });

  it('reproduces the committed heightfield byte for byte', () => {
    expect(readFileSync(join(rebaked, 'heightfield.bin')).equals(bytes)).toBe(true);
  });

  it('reproduces the committed manifest byte for byte', () => {
    expect(readFileSync(join(rebaked, 'manifest.json'), 'utf8')).toBe(
      readFileSync(join(committed, 'manifest.json'), 'utf8'),
    );
  });
});

describe('the committed world', () => {
  const heights = new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );

  it('is the grid the manifest describes', () => {
    expect(manifest.format).toBe('r32f');
    expect(heights.length).toBe(manifest.width * manifest.height);
    expect(manifest.spacing).toBeCloseTo(manifest.worldSize / (manifest.width - 1), 12);
    expect(heights.every(Number.isFinite)).toBe(true);
  });

  it('stays inside the declared amplitude', () => {
    let peak = 0;
    for (const h of heights) peak = Math.max(peak, Math.abs(h));
    expect(peak).toBeLessThanOrEqual(manifest.amplitude + 1e-5);
  });

  it('rolls gently: no slope a sheep could hide behind', () => {
    const { width, spacing } = manifest;
    let worst = 0;
    for (let iz = 0; iz < width; iz++) {
      for (let ix = 0; ix < width; ix++) {
        const h = heights[iz * width + ix]!;
        if (ix + 1 < width) {
          worst = Math.max(worst, Math.abs(heights[iz * width + ix + 1]! - h) / spacing);
        }
        if (iz + 1 < width) {
          worst = Math.max(worst, Math.abs(heights[(iz + 1) * width + ix]! - h) / spacing);
        }
      }
    }
    expect(worst).toBeCloseTo(manifest.maxGradient, 3);
    // The Classic camera looks down at 50 degrees (tan 1.19). A ground slope an
    // order of magnitude under that cannot put a sheep behind a rise.
    expect(worst).toBeLessThan(0.18);
  });

  it('fades to flat at the footprint edge, so the skirt meets it seamlessly', () => {
    const { width } = manifest;
    for (let i = 0; i < width; i++) {
      expect(heights[i]).toBe(0);
      expect(heights[(width - 1) * width + i]).toBe(0);
      expect(heights[i * width]).toBe(0);
      expect(heights[i * width + width - 1]).toBe(0);
    }
  });

  it('declares the three structure pads, the gate approach among them', () => {
    expect(manifest.pads.map((pad) => pad.id)).toEqual([
      'pen-and-gate',
      'farmhouse',
      'barn',
    ]);
    const [penPad] = manifest.pads;
    // The pad has to reach across the gate line, or the perimeter fence and the
    // pen fence stand at different heights and the corridor develops a step.
    expect(penPad!.minZ).toBeLessThan(100);
    expect(penPad!.minX).toBeLessThanOrEqual(-30);
    expect(penPad!.maxX).toBeGreaterThanOrEqual(30);
    expect(penPad!.maxZ).toBeGreaterThanOrEqual(130);
    for (const pad of manifest.pads) expect(pad.rim).toBeGreaterThan(0);
  });
});
