// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The one baked heightfield, bound to the one committed asset.
 *
 * assets/terrain/heightfield.bin and manifest.json are produced by
 * tools/bake-terrain.mjs and committed (spec/04: nothing is generated at
 * runtime, no scatter pass, no bake on load). The manifest is imported, so it
 * is inlined in the bundle and the pads are readable synchronously; only the
 * 101 kB of float data is fetched, once, cold, before first interaction.
 *
 * HOW CONSUMERS USE THIS. Two calls, and the order matters:
 *
 *   const field = useHeightfield();   // suspends until the bytes are in
 *   ...
 *   field.groundY(x, z)               // in the frame write, per object
 *
 * `useHeightfield` is the Suspense gate. Everything inside FieldScene's
 * boundary calls it, so no ground-sitting object can render before the ground
 * it stands on exists. The free `groundY(x, z)` is the same function for
 * callers that are not components - it reads the same module singleton.
 *
 * BEFORE THE BYTES ARRIVE the singleton is a flat field of the same footprint.
 * That is not a silent fallback for entities: entities are gated by the
 * Suspense boundary and cannot observe it. It exists for the two callers that
 * run OUTSIDE the boundary on purpose - the camera rig (App.tsx mounts it
 * outside so the framing is settled before the first drawn frame) and the node
 * camera tests - and for them a flat world is the correct answer, because at
 * that moment there is no world drawn to be above.
 */

import { use } from 'react';
import {
  Heightfield,
  decodeHeightfield,
  flatHeightfield,
  type HeightfieldManifest,
  type TerrainPad,
} from './heightfieldSampler';
import { TERRAIN_MANIFEST, TERRAIN_PADS } from './terrainLayout';
import { loadAssetBytes, type LoadProgress } from '@app/boot/loadAsset';

export type { TerrainPad, HeightfieldManifest };
export { Heightfield };

/** The committed bake, as data. Dims, extent, amplitude, seed, pads. */
export { TERRAIN_MANIFEST, TERRAIN_PADS };

/**
 * The flattened rects. A pad is both where a structure stands and a scatter
 * keep-out (spec/04); one list so terrain and scatter cannot disagree.
 */

/**
 * Vite rewrites this to the hashed asset URL at build and to a dev-server path
 * in dev. A `new URL` literal rather than a `?url` import so this module still
 * imports cleanly in node, where the camera tests reach it through ridgeClamp.
 */
const HEIGHTFIELD_URL = new URL('../../../assets/terrain/heightfield.bin', import.meta.url).href;

let field: Heightfield = flatHeightfield(TERRAIN_MANIFEST);
let pending: Promise<Heightfield> | null = null;

/** Fetch and decode once. Repeat calls share the first promise. */
export function loadHeightfield(onProgress?: LoadProgress): Promise<Heightfield> {
  pending ??= loadAssetBytes(HEIGHTFIELD_URL, 'heightfield.bin', onProgress)
    .then((bytes) => {
      field = decodeHeightfield(bytes, TERRAIN_MANIFEST);
      return field;
    });
  return pending;
}

/**
 * The Suspense gate. Returns the loaded field, or suspends the component until
 * it is loaded. Every ground-sitting component calls this before its first
 * `groundY`.
 */
export function useHeightfield(): Heightfield {
  return use(loadHeightfield());
}

/**
 * The ground height at (x, z), in metres. THE single source of truth for every
 * ground-sitting object (spec/04). Components should hold the `useHeightfield`
 * result and call `field.groundY` in their frame write; this free form is for
 * callers that are not components, like the camera's ridge clamp.
 */
export function groundY(x: number, z: number): number {
  return field.groundY(x, z);
}
