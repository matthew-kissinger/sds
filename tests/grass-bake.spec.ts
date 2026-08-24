// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The grass scatter is a recipe, and a recipe that does not reproduce is an
 * opaque binary with extra steps (AGENTS.md rule 11). This rebakes into a temp
 * directory and byte-compares against what is committed under assets/grass/.
 *
 * A red byte-compare is a DECISION, not a chore: read the diff, decide whether
 * the meadow was meant to move, and if it was, commit the rebaked bytes and say
 * in the same commit which recipe number changed and why. Never rerun the bake
 * to turn this green.
 *
 * Everything after the byte-compare is a promise the field makes to code that
 * cannot see the bake: that the two tiers tile the world without overlapping,
 * that nothing grows through the drawn pen floor, that every tuft sits on the
 * one committed ground, and - the one the reduced preset lives on - that ANY
 * PREFIX of a group is an evenly spread subset of it.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GRASS_PRESETS } from '@app/scene/grass/density';
import {
  Heightfield,
  decodeHeightfield,
  type HeightfieldManifest,
} from '@app/world/heightfieldSampler';
import { HOME_FIELD } from '@sim/field';

const repo = fileURLToPath(new URL('..', import.meta.url));
const committed = join(repo, 'assets', 'grass');

interface GrassManifest {
  version: number;
  recipe: string;
  seed: number;
  format: string;
  stride: number;
  terrainSeed: number;
  encoding: { xzRange: number; yRange: number; heightMin: number; heightMax: number };
  footprint: {
    fieldHalf: number;
    surroundOuter: number;
    treelineInner: number;
    treelineOuter: number;
  };
  groups: { id: string; offset: number; count: number }[];
}

const manifest = JSON.parse(readFileSync(join(committed, 'manifest.json'), 'utf8')) as GrassManifest;
const bytes = readFileSync(join(committed, 'tufts.bin'));
const records = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const { stride, encoding, footprint } = manifest;
const XZ = encoding.xzRange / 32767;
const Y = encoding.yRange / 32767;
/** Half a quantisation step on each axis, plus float slack. */
const QUANTUM = XZ * 0.5 + 1e-6;

const group = (id: string) => {
  const hit = manifest.groups.find((candidate) => candidate.id === id);
  if (!hit) throw new Error(`no group ${id}`);
  return hit;
};

interface Tuft {
  x: number;
  z: number;
  y: number;
  height: number;
  vigour: number;
}

function tuftAt(index: number): Tuft {
  const at = index * stride;
  return {
    x: records.getInt16(at, true) * XZ,
    z: records.getInt16(at + 2, true) * XZ,
    y: records.getInt16(at + 4, true) * Y,
    height:
      encoding.heightMin +
      (encoding.heightMax - encoding.heightMin) * (records.getUint8(at + 10) / 255),
    vigour: records.getUint8(at + 11) / 255,
  };
}

function tuftsOf(id: string): Tuft[] {
  const { offset, count } = group(id);
  const out: Tuft[] = [];
  for (let i = 0; i < count; i++) out.push(tuftAt(offset + i));
  return out;
}

const chebyshev = (t: Tuft) => Math.max(Math.abs(t.x), Math.abs(t.z));

describe('grass bake', () => {
  let rebaked: string;

  beforeAll(() => {
    rebaked = mkdtempSync(join(tmpdir(), 'herd-grass-bake-'));
    execFileSync(process.execPath, [join(repo, 'tools', 'bake-grass.mjs'), '--out', rebaked], {
      cwd: repo,
      stdio: 'pipe',
    });
  }, 180_000);

  afterAll(() => {
    if (rebaked) rmSync(rebaked, { recursive: true, force: true });
  });

  it('reproduces the committed scatter byte for byte', () => {
    expect(readFileSync(join(rebaked, 'tufts.bin')).equals(bytes)).toBe(true);
  });

  it('reproduces the committed manifest byte for byte', () => {
    expect(readFileSync(join(rebaked, 'manifest.json'), 'utf8')).toBe(
      readFileSync(join(committed, 'manifest.json'), 'utf8'),
    );
  });
});

describe('the committed scatter', () => {
  it('is the file the manifest describes', () => {
    expect(manifest.format).toBe('tuft12');
    expect(stride).toBe(12);
    const declared = manifest.groups.reduce((sum, g) => sum + g.count, 0);
    expect(bytes.byteLength).toBe(declared * stride);
    // Groups are contiguous from zero, because decodeTufts reads a prefix of a
    // group by (offset + i) and nothing re-bases it.
    let cursor = 0;
    for (const g of manifest.groups) {
      expect(g.offset).toBe(cursor);
      cursor += g.count;
    }
  });

  it('splits the two tiers at the fence line and never overlaps them', () => {
    const field = tuftsOf('field');
    const surround = tuftsOf('surround');
    expect(field.length).toBeGreaterThan(50_000);
    expect(surround.length).toBeGreaterThan(5_000);
    let fieldOuter = 0;
    for (const t of field) fieldOuter = Math.max(fieldOuter, chebyshev(t));
    expect(fieldOuter).toBeLessThan(footprint.fieldHalf + QUANTUM);
    let surroundInner = Infinity;
    let surroundOuter = 0;
    for (const t of surround) {
      const r = chebyshev(t);
      if (r < surroundInner) surroundInner = r;
      if (r > surroundOuter) surroundOuter = r;
    }
    expect(surroundInner).toBeGreaterThan(footprint.fieldHalf - QUANTUM);
    expect(surroundOuter).toBeLessThan(footprint.surroundOuter + QUANTUM);
    // The interactive tier has to reach past the fence, or the player walks the
    // dog to the boundary and the grass ends before the world does.
    expect(footprint.fieldHalf).toBeGreaterThan(HOME_FIELD.bounds.maxX);
    // ...and the treeline ring has to stand on grass, not past it.
    expect(footprint.treelineInner).toBeGreaterThan(footprint.fieldHalf);
    expect(footprint.treelineOuter).toBeLessThan(footprint.surroundOuter);
  });

  it('grows nothing through the drawn pen floor or the gate corridor', () => {
    const { pen, gate, bounds } = HOME_FIELD;
    const halfGate = gate.width / 2;
    let trespassers = 0;
    for (let i = 0; i < bytes.byteLength / stride; i++) {
      const t = tuftAt(i);
      const inPen = t.x > pen.minX && t.x < pen.maxX && t.z > pen.minZ && t.z < pen.maxZ;
      const inCorridor =
        t.x > gate.position.x - halfGate &&
        t.x < gate.position.x + halfGate &&
        t.z > bounds.maxZ &&
        t.z < pen.minZ;
      if (inPen || inCorridor) trespassers++;
    }
    expect(trespassers).toBe(0);
  });

  it('stands every tuft on the one committed ground', () => {
    const terrain = fileURLToPath(new URL('../assets/terrain/', import.meta.url));
    const terrainManifest = JSON.parse(
      readFileSync(join(terrain, 'manifest.json'), 'utf8'),
    ) as HeightfieldManifest;
    expect(manifest.terrainSeed).toBe(terrainManifest.seed);
    const raw = readFileSync(join(terrain, 'heightfield.bin'));
    const decoded = decodeHeightfield(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
      terrainManifest,
    );
    const heightfield = new Heightfield(decoded.data, terrainManifest);
    // Every 97th tuft: enough of the field to catch a sampler that has drifted,
    // cheap enough to stay a unit test.
    for (let i = 0; i < bytes.byteLength / stride; i += 97) {
      const t = tuftAt(i);
      // The tuft's XZ is itself quantised, so compare against the ground under
      // the quantised spot with the Y quantum plus the worst slope over half a
      // position step as the tolerance.
      expect(Math.abs(t.y - heightfield.groundY(t.x, t.z))).toBeLessThan(Y + XZ * 0.2);
    }
  });

  it('keeps every tuft inside the declared height and vigour ranges', () => {
    let shortest = Infinity;
    let tallest = 0;
    let feeblest = Infinity;
    let lushest = 0;
    for (let i = 0; i < bytes.byteLength / stride; i++) {
      const t = tuftAt(i);
      shortest = Math.min(shortest, t.height);
      tallest = Math.max(tallest, t.height);
      feeblest = Math.min(feeblest, t.vigour);
      lushest = Math.max(lushest, t.vigour);
    }
    expect(shortest).toBeGreaterThanOrEqual(encoding.heightMin - 1e-6);
    expect(tallest).toBeLessThanOrEqual(encoding.heightMax + 1e-6);
    expect(feeblest).toBeGreaterThan(0);
    expect(lushest).toBeLessThanOrEqual(1);
    // The range has to be USED, or the encoding is carrying bytes for nothing.
    expect(tallest - shortest).toBeGreaterThan((encoding.heightMax - encoding.heightMin) * 0.9);
  });

  /**
   * The reduced density preset is a smaller instance count over the same
   * buffer, so a PREFIX of a group has to be a fair sample of the whole group.
   * If the shuffle ever came out, the first third of the field would be one
   * corner of the meadow and the low preset would render a wedge.
   */
  it('makes any prefix of a group an evenly spread subset of it', () => {
    const field = tuftsOf('field');
    const BINS = 8;
    const half = footprint.fieldHalf;
    const histogram = (sample: Tuft[]) => {
      const counts = new Float64Array(BINS * BINS);
      for (const t of sample) {
        const bx = Math.min(BINS - 1, Math.floor(((t.x + half) / (half * 2)) * BINS));
        const bz = Math.min(BINS - 1, Math.floor(((t.z + half) / (half * 2)) * BINS));
        counts[bz * BINS + bx]! += 1 / sample.length;
      }
      return counts;
    };

    const whole = histogram(field);
    const prefix = histogram(field.slice(0, Math.round(field.length * GRASS_PRESETS.low.field)));
    let worst = 0;
    for (let i = 0; i < whole.length; i++) {
      worst = Math.max(worst, Math.abs(whole[i]! - prefix[i]!));
    }
    // Each of the 64 bins holds roughly 1.6% of the field. A prefix that
    // misplaces more than a fifth of a bin's share is a prefix with a bias.
    expect(worst).toBeLessThan(0.016 * 0.2);
  });
});
