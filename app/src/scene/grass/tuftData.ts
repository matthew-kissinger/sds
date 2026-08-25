// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The committed tuft scatter, turned into the two buffers a draw call needs.
 *
 * assets/grass/tufts.bin and manifest.json are produced by tools/bake-grass.mjs
 * and committed (spec/04: the runtime never scatters). This module is the only
 * thing that reads those bytes. It fetches once, decodes once, and hands back
 * an instance matrix array and one packed per-tuft attribute; nothing here runs
 * again after the field is up.
 *
 * THE DENSITY TIER IS A PREFIX. The bake shuffles each group after placing it,
 * so the first N records of a group are an evenly spread subset of it. That is
 * why there is no second asset and no second bake for the reduced preset
 * (spec/08): `decodeTufts` is told how many to take and takes them off the
 * front. Cutting density cannot move a single blade that survives the cut,
 * which is what makes the two presets look like the same field.
 */

import { use } from 'react';
import manifestJson from '../../../../assets/grass/manifest.json';
import { loadAssetBytes, type LoadProgress } from '@app/boot/loadAsset';

export interface GrassGroupManifest {
  readonly id: string;
  /** First record of this group, in whole records from the start of the file. */
  readonly offset: number;
  readonly count: number;
}

export interface GrassManifest {
  readonly version: number;
  readonly recipe: string;
  readonly seed: number;
  readonly format: string;
  readonly stride: number;
  readonly terrainSeed: number;
  readonly encoding: {
    readonly xzRange: number;
    readonly yRange: number;
    readonly heightMin: number;
    readonly heightMax: number;
  };
  readonly footprint: {
    readonly fieldHalf: number;
    readonly surroundOuter: number;
    readonly treelineInner: number;
    readonly treelineOuter: number;
  };
  readonly groups: readonly GrassGroupManifest[];
}

export const GRASS_MANIFEST = manifestJson as GrassManifest;

/** Same shape as the terrain loader's: a URL literal, so node can import this
 *  module without a bundler rewriting a `?url` import out from under it. */
const TUFTS_URL = new URL('../../../../assets/grass/tufts.bin', import.meta.url).href;

let pending: Promise<DataView> | null = null;

/** Fetch and hold the raw records. Repeat calls share the first promise. */
export function loadTufts(onProgress?: LoadProgress): Promise<DataView> {
  pending ??= loadAssetBytes(TUFTS_URL, 'tufts.bin', onProgress)
    .then((bytes) => {
      const records = bytes.byteLength / GRASS_MANIFEST.stride;
      const declared = GRASS_MANIFEST.groups.reduce((sum, group) => sum + group.count, 0);
      if (records !== declared) {
        throw new Error(`tufts.bin holds ${records} records, the manifest declares ${declared}`);
      }
      return new DataView(bytes);
    });
  return pending;
}

/** The Suspense gate. Grass cannot draw before the scatter it draws exists. */
export function useTufts(): DataView {
  return use(loadTufts());
}

export function grassGroup(id: string): GrassGroupManifest {
  const group = GRASS_MANIFEST.groups.find((candidate) => candidate.id === id);
  if (!group) throw new Error(`assets/grass/manifest.json has no group "${id}"`);
  return group;
}

export interface TuftBuffers {
  /** Column-major 4x4 per tuft: yaw, uniform scale, and the baked ground spot. */
  readonly matrices: Float32Array;
  /**
   * Per tuft, in one vec4: (worldX, worldZ, seed, vigour).
   *
   * The world XZ is here as well as in the matrix because the shader needs the
   * tuft's ROOT to sample wind and to look up the interaction grid, and every
   * blade in the clump must sample the same spot or the tuft shears instead of
   * swaying. Reading it back out of the instance matrix is not possible: three
   * consumes that matrix inside its own instancing node.
   */
  readonly tufts: Float32Array;
  readonly count: number;
}

/**
 * Decode the first `count` records of a group. Runs once per group at load.
 *
 * `spread` widens every tuft horizontally without making it taller, which is
 * how the reduced preset covers the same ground with fewer clumps (density.ts).
 */
export function decodeTufts(
  records: DataView,
  group: GrassGroupManifest,
  count: number,
  spread = 1,
): TuftBuffers {
  const take = Math.min(count, group.count);
  const { stride, encoding } = GRASS_MANIFEST;
  const xzScale = encoding.xzRange / 32767;
  const yScale = encoding.yRange / 32767;
  const yawScale = (Math.PI * 2) / 65536;
  const heightSpan = encoding.heightMax - encoding.heightMin;

  const matrices = new Float32Array(take * 16);
  const tufts = new Float32Array(take * 4);

  for (let i = 0; i < take; i++) {
    const at = (group.offset + i) * stride;
    const x = records.getInt16(at, true) * xzScale;
    const z = records.getInt16(at + 2, true) * xzScale;
    const y = records.getInt16(at + 4, true) * yScale;
    const yaw = records.getUint16(at + 6, true) * yawScale;
    const seed = records.getUint16(at + 8, true) / 65536;
    const scale = encoding.heightMin + (heightSpan * records.getUint8(at + 10)) / 255;
    const vigour = records.getUint8(at + 11) / 255;

    const wide = scale * spread;
    const cos = Math.cos(yaw) * wide;
    const sin = Math.sin(yaw) * wide;
    const m = i * 16;
    matrices[m] = cos;
    matrices[m + 2] = -sin;
    matrices[m + 5] = scale;
    matrices[m + 8] = sin;
    matrices[m + 10] = cos;
    matrices[m + 12] = x;
    matrices[m + 13] = y;
    matrices[m + 14] = z;
    matrices[m + 15] = 1;

    const t = i * 4;
    tufts[t] = x;
    tufts[t + 1] = z;
    tufts[t + 2] = seed;
    tufts[t + 3] = vigour;
  }

  return { matrices, tufts, count: take };
}
