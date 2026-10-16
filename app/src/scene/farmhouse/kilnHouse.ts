// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The Kiln-authored farmhouse, brought into this game's shading.
 *
 * It reaches the page as assets/house/farmhouse.glb, baked from the recipe
 * beside it (assets/house/README.md), and it is the only GLB the runtime loads.
 * `FARMHOUSE_SOURCE` (farmhouse/source.ts) decides whether it is loaded at all.
 *
 * WHAT THE IMPORT HAS TO DO, AND WHY IT IS THE WHOLE QUESTION. Kiln exports PBR
 * materials, one glTF material per authored material, over 282 separate meshes.
 * This game shades through one toon ramp whose three band colours are solved
 * backwards through the tone map and the post grade (farmhouse/bands.ts), and it
 * draws the homestead in one buffer per band set. So the import does two things,
 * both mechanical:
 *
 *  1. SORT BY MATERIAL NAME. Every mesh is baked to the house's frame and sorted
 *     into one list per band set. The authored material names are the band sets'
 *     own names, so the mapping is a lookup and not a guess.
 *  2. REBUILD THE TWO UV CHANNELS. In this game `uv` is not a texture
 *     coordinate: `uv.x` names WHICH surface a triangle is and `uv.y` carries a
 *     distance the material needs - metres below a roof edge on a wall, metres up
 *     the slope on slate (farmhouse/shell.ts). glTF cannot carry that and Kiln's
 *     export has no custom-attribute channel, so both are recomputed here from
 *     position. This is the one lossy step in the trip: it is exact on the long
 *     walls and the main slopes, and an approximation on everything else.
 *
 * The result is welded into the cluster's own buffers by `buildFarmhouse`
 * (farmhouse/cluster.ts), so the shipped materials draw it unchanged and the
 * house costs triangles, not draw calls. No new shader, no texture, nothing
 * sampled.
 */

import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadAssetBytes } from '@app/boot/loadAsset';

/**
 * The authored dimensions the uv rebuild needs, from assets/house/farmhouse.kiln.js.
 * They are repeated rather than imported because that file is a Kiln program
 * evaluated in Kiln's sandbox, not a module this app can import.
 */
const SPAN_Z = 8.6;
const WALL_T = 0.55;
const WALL_H = 5.8;
const RISE = 4.9;
const OVERHANG = 0.45;
const ROOF_LIFT = 0.02;

/** Half the roof's bearing span, the pitch, and where the eave line sits. */
const ROOF_HALF = (SPAN_Z + WALL_T) / 2;
const PITCH = Math.atan2(RISE, ROOF_HALF);
const EAVE_Y = WALL_H + ROOF_LIFT - (OVERHANG * RISE) / ROOF_HALF;

/** `uv.y` for a surface with no roof edge over it, as `farmhouse/parts.ts` uses. */
const OPEN_SKY = 9;

export type KilnSurface = 'wall' | 'roof' | 'timber' | 'dress' | 'opening' | 'lamp';

/**
 * Which band set each authored material becomes, and what `uv.x` selects inside
 * it. The dressings graph carries two sets - plinth stone at 0, chimney masonry
 * at 1 - so those two authored materials weld into one buffer.
 */
const BINDING: Readonly<Record<string, { readonly surface: KilnSurface; readonly u: number }>> = {
  limewash: { surface: 'wall', u: 0 },
  slate: { surface: 'roof', u: 0 },
  timber: { surface: 'timber', u: 0 },
  stone: { surface: 'dress', u: 0 },
  masonry: { surface: 'dress', u: 1 },
  opening: { surface: 'opening', u: 0 },
  lamp: { surface: 'lamp', u: 0 },
};

/** One band set's triangles, non-indexed, in the house's own frame. */
export interface KilnPart {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
}

export interface KilnHouse {
  readonly parts: Readonly<Partial<Record<KilnSurface, KilnPart>>>;
  readonly triangles: number;
  readonly sourceNodes: number;
}

/**
 * How far below a roof edge this vertex sits, or how far up a slope, depending
 * on which surface it belongs to. The wall materials darken the first half metre
 * of the former; the slate's courses and sky ramp run on the latter.
 *
 * A wall under a rake wants the distance to the RAKE, and this returns the
 * distance to the eave for every wall vertex. On the long elevations - most of
 * this building and all of what the approach sees - the two agree.
 */
function channelV(surface: KilnSurface, y: number): number {
  if (surface === 'wall') return Math.max(0, WALL_H - y);
  if (surface === 'roof') {
    // Distance up the pitch from the eave line. Anything lying flat resolves
    // near zero, which is where a course would start anyway.
    const up = (y - EAVE_Y) / Math.sin(PITCH);
    return Math.max(0, Math.min(up, (ROOF_HALF + OVERHANG) / Math.cos(PITCH)));
  }
  // Masonry takes its course lines from world height rather than from uv.y.
  return OPEN_SKY;
}

interface Source {
  readonly mesh: THREE.Mesh;
  readonly u: number;
}

/** Bake every source mesh to the house frame into one flat triangle list. */
function weld(sources: readonly Source[], surface: KilnSurface): KilnPart {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const normalMatrix = new THREE.Matrix3();
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();

  for (const { mesh, u } of sources) {
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const index = geometry.index;
    mesh.updateWorldMatrix(true, false);
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    const count = index === null ? position.count : index.count;
    for (let n = 0; n < count; n++) {
      const i = index === null ? n : index.getX(n);
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      positions.push(point.x, point.y, point.z);
      direction.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
      normals.push(direction.x, direction.y, direction.z);
      uvs.push(u, channelV(surface, point.y));
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
  };
}

/**
 * Parse the GLB and return one triangle list per band set.
 *
 * The asset is authored at the origin with +X along the ridge and +Y up, which
 * is the frame this game uses, so nothing is rotated or rescaled on the way in.
 * Placement is the caller's.
 */
export async function parseKilnHouse(bytes: ArrayBuffer): Promise<KilnHouse> {
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  const buckets = new Map<KilnSurface, Source[]>();
  let triangles = 0;
  let sourceNodes = 0;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((node) => {
    if (!(node as THREE.Mesh).isMesh) return;
    const mesh = node as THREE.Mesh;
    sourceNodes += 1;
    const name = (mesh.material as THREE.Material).name;
    const binding = BINDING[name];
    if (binding === undefined) throw new Error(`farmhouse.glb: unbound material "${name}"`);
    const list = buckets.get(binding.surface) ?? [];
    list.push({ mesh, u: binding.u });
    buckets.set(binding.surface, list);
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
  });

  const parts: Partial<Record<KilnSurface, KilnPart>> = {};
  for (const [surface, sources] of buckets) parts[surface] = weld(sources, surface);

  // The source scene has served its purpose; every array above is a new one.
  gltf.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry.dispose();
  });
  return { parts, triangles, sourceNodes };
}

let pending: Promise<KilnHouse | null> | null = null;

/**
 * Fetch and parse once. Repeat calls share the first promise.
 *
 * A missing or damaged file resolves to null after a loud console error, and the
 * caller draws the procedural house: 175 kB of static scenery must not be able
 * to take the field down with it.
 */
export function loadKilnHouse(): Promise<KilnHouse | null> {
  // Vite rewrites this literal to the hashed asset URL at build, as for the other
  // bakes. It sits inside the function, not at module level, so that a bundle
  // which never calls the loader has no stray reference left over.
  const url = new URL('../../../../assets/house/farmhouse.glb', import.meta.url).href;
  pending ??= loadAssetBytes(url, 'farmhouse.glb')
    .then(parseKilnHouse)
    .catch((error: unknown) => {
      console.error('The Kiln farmhouse did not load; drawing the procedural one.', error);
      return null;
    });
  return pending;
}
