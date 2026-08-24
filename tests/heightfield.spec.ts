// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The sampler, against the committed bytes. `groundY` is the single source of
 * truth every ground-sitting object reads (spec/04), so what is worth pinning
 * is that it agrees with the grid at the vertices, interpolates between them,
 * is genuinely flat on the structure pads, and answers off the footprint
 * instead of returning NaN and floating a sheep into the sky.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HOME_FIELD } from '@sim/field';
import {
  Heightfield,
  decodeHeightfield,
  flatHeightfield,
  type HeightfieldManifest,
} from '@app/world/heightfieldSampler';

const terrain = fileURLToPath(new URL('../assets/terrain/', import.meta.url));
const manifest = JSON.parse(
  readFileSync(join(terrain, 'manifest.json'), 'utf8'),
) as HeightfieldManifest;
const bytes = readFileSync(join(terrain, 'heightfield.bin'));
const field = decodeHeightfield(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  manifest,
);

const { width, worldSize, spacing } = manifest;
const half = worldSize / 2;
const at = (ix: number, iz: number) => field.data[iz * width + ix]!;
const world = (index: number) => -half + index * spacing;

describe('decode', () => {
  it('rejects a byte length the manifest does not agree with', () => {
    expect(() => decodeHeightfield(new ArrayBuffer(8), manifest)).toThrow(/bytes/);
  });

  it('rejects a grid whose length is not width * height', () => {
    expect(() => new Heightfield(new Float32Array(3), manifest)).toThrow(RangeError);
  });
});

describe('groundY at the grid vertices', () => {
  it('returns the stored height exactly at a sample point', () => {
    for (const [ix, iz] of [
      [40, 40],
      [80, 80],
      [17, 121],
      [128, 33],
    ] as const) {
      expect(field.groundY(world(ix), world(iz))).toBe(at(ix, iz));
    }
  });

  it('returns the corner samples at the four corners of the footprint', () => {
    const last = width - 1;
    expect(field.groundY(-half, -half)).toBe(at(0, 0));
    expect(field.groundY(half, -half)).toBe(at(last, 0));
    expect(field.groundY(-half, half)).toBe(at(0, last));
    expect(field.groundY(half, half)).toBe(at(last, last));
  });

  it('clamps to the edge outside the footprint instead of going undefined', () => {
    for (const [x, z] of [
      [-1e4, 0],
      [1e4, 0],
      [0, -1e4],
      [0, 1e4],
      [1e4, 1e4],
    ] as const) {
      expect(Number.isFinite(field.groundY(x, z))).toBe(true);
    }
    // The bake fades the edge to zero, so off the footprint the ground is the
    // flat skirt the terrain mesh draws out to the horizon.
    expect(field.groundY(-600, 240)).toBe(0);
  });
});

describe('bilinear sample', () => {
  it('is the average of two neighbours at the midpoint of an edge', () => {
    const ix = 55;
    const iz = 90;
    const midX = world(ix) + spacing / 2;
    expect(field.sample(midX, world(iz))).toBeCloseTo((at(ix, iz) + at(ix + 1, iz)) / 2, 6);
    const midZ = world(iz) + spacing / 2;
    expect(field.sample(world(ix), midZ)).toBeCloseTo((at(ix, iz) + at(ix, iz + 1)) / 2, 6);
  });

  it('is the average of four neighbours at the centre of a cell', () => {
    const ix = 61;
    const iz = 47;
    const centre = field.sample(world(ix) + spacing / 2, world(iz) + spacing / 2);
    const mean = (at(ix, iz) + at(ix + 1, iz) + at(ix, iz + 1) + at(ix + 1, iz + 1)) / 4;
    expect(centre).toBeCloseTo(mean, 6);
  });

  it('is NOT the drawn surface, which is why the split exists', () => {
    // This is the sds lesson made a number. Bilinear curves through a cell;
    // the renderer draws two flat triangles across it. On this gentle ground
    // they still part company by more than a centimetre inside a single 2.5 m
    // quad - enough to float a rock or sink a fence post, and exactly the
    // intermittent-floating bug class spec/04 says one groundY ends. So
    // groundY is meshSampleY, and sample() is kept for the smooth work
    // (gradients, normals) that wants a curve rather than facets.
    let worst = 0;
    for (let x = -100; x <= 100; x += 1.1) {
      for (let z = -100; z <= 100; z += 1.1) {
        expect(field.groundY(x, z)).toBe(field.meshSampleY(x, z));
        worst = Math.max(worst, Math.abs(field.sample(x, z) - field.meshSampleY(x, z)));
      }
    }
    expect(worst).toBeGreaterThan(0.01);
    expect(worst).toBeLessThan(0.05);
  });
});

describe('structure pads', () => {
  it('are flat everywhere inside the rect, not only at the centre', () => {
    for (const pad of manifest.pads) {
      for (let x = pad.minX; x <= pad.maxX; x += 1.7) {
        for (let z = pad.minZ; z <= pad.maxZ; z += 1.7) {
          expect(field.groundY(x, z)).toBeCloseTo(pad.level, 5);
        }
      }
    }
  });

  it('puts the pen, the gate and the corridor at one height', () => {
    const { gate, pen, bounds } = HOME_FIELD;
    const level = manifest.pads[0]!.level;
    for (const [x, z] of [
      [gate.position.x, bounds.maxZ],
      [gate.position.x, pen.minZ],
      [gate.position.x, (bounds.maxZ + pen.minZ) / 2],
      [pen.minX, pen.maxZ],
      [pen.maxX, pen.minZ],
    ] as const) {
      expect(field.groundY(x, z)).toBeCloseTo(level, 5);
    }
  });

  it('eases back into the roll over the rim rather than stepping', () => {
    const pad = manifest.pads[0]!;
    // Walking south out of the pad, no single 2.5 m step exceeds the gradient
    // budget the bake enforces.
    let previous = field.groundY(0, pad.minZ);
    for (let z = pad.minZ - spacing; z >= pad.minZ - pad.rim - 10; z -= spacing) {
      const here = field.groundY(0, z);
      expect(Math.abs(here - previous) / spacing).toBeLessThan(0.18);
      previous = here;
    }
  });
});

describe('normals', () => {
  it('points up on a pad and tilts off it, allocating nothing', () => {
    const out = { x: 0, y: 0, z: 0 };
    field.normal(0, 116, out);
    expect(out.y).toBeCloseTo(1, 9);

    let steepest = 1;
    for (let x = -90; x <= 90; x += 7) {
      for (let z = -90; z <= 90; z += 7) {
        field.normal(x, z, out);
        expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(1, 9);
        steepest = Math.min(steepest, out.y);
      }
    }
    expect(steepest).toBeLessThan(1);
  });
});

describe('the flat stand-in', () => {
  it('has the same footprint and answers zero everywhere', () => {
    const flat = flatHeightfield(manifest);
    expect(flat.manifest.worldSize).toBe(worldSize);
    expect(flat.groundY(0, 0)).toBe(0);
    expect(flat.groundY(-73, 41)).toBe(0);
    expect(flat.groundY(1e6, -1e6)).toBe(0);
  });
});
