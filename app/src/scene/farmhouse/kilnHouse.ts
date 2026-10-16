// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The Kiln-authored farmhouse, brought into this game's shading.
 *
 * It reaches the page as assets/house/farmhouse.glb, baked from the recipe
 * beside it (assets/house/README.md), and it is the only GLB the runtime loads.
 * `FARMHOUSE_SOURCE` (farmhouse/source.ts) decides whether it is loaded at all.
 *
 * WHAT THE IMPORT HAS TO DO. Kiln exports PBR materials, one glTF material per
 * authored material, over separate meshes. This game shades through one toon
 * ramp whose three band colours are solved backwards through the tone map and
 * the post grade (farmhouse/bands.ts), and it draws the homestead in one buffer
 * per band set. So the import does two things, both mechanical:
 *
 *  1. SORT BY MATERIAL NAME. Every mesh is baked to the house's frame and sorted
 *     into one list per band set. The authored material names are the band sets'
 *     own names, so the mapping is a lookup and not a guess.
 *  2. CARRY THE TWO SURFACE CHANNELS ACROSS. In this game `uv` is not a texture
 *     coordinate: `uv.x` selects a surface inside a band set and `uv.y` carries
 *     a distance the material needs - metres below a roof edge on a wall, metres
 *     up the slope on slate (farmhouse/surfaceMaterial.ts). The recipe computes
 *     both per face from its own parts and writes them into TEXCOORD_0, and says
 *     so in the root node's extras (`surfaceChannels`). They are read here, not
 *     reconstructed. A bake without that record, or a mesh without TEXCOORD_0,
 *     is refused with an error that names what is missing: a guess from world
 *     height is what flattened every roof below the main eave in Release 1.
 *
 * The result is welded into the cluster's own buffers by `buildFarmhouse`
 * (farmhouse/cluster.ts), so the shipped materials draw it unchanged and the
 * house costs triangles, not draw calls. No new shader, no texture, nothing
 * sampled.
 */

import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadAssetBytes } from '@app/boot/loadAsset';

/** The channel record the recipe writes on its root node, and its version. */
const CHANNELS_KEY = 'surfaceChannels';
const CHANNELS_VERSION = 1;

export type KilnSurface = 'wall' | 'roof' | 'timber' | 'dress' | 'opening' | 'lamp';

/**
 * Which band set each authored material becomes. The dressings graph carries two
 * sets - plinth stone and chimney masonry, told apart by the baked `uv.x` - so
 * those two authored materials weld into one buffer.
 */
const BINDING: Readonly<Record<string, KilnSurface>> = {
  limewash: 'wall',
  slate: 'roof',
  timber: 'timber',
  stone: 'dress',
  masonry: 'dress',
  opening: 'opening',
  lamp: 'lamp',
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
 * Refuse a bake that does not say its TEXCOORD_0 is the surface channels.
 *
 * Every Kiln part carries a TEXCOORD_0 of its own - box and panel UVs in 0..1 -
 * so the attribute being present proves nothing. The recipe writes a record on
 * its root node naming the attribute and the version of the convention, and
 * GLTFLoader hands node extras over as `userData`.
 */
function requireChannelRecord(scene: THREE.Object3D): void {
  let record: unknown;
  scene.traverse((node) => {
    record ??= (node.userData as Record<string, unknown>)[CHANNELS_KEY];
  });
  const { version, attribute } = (record ?? {}) as { version?: unknown; attribute?: unknown };
  if (record === undefined) {
    throw new Error(
      `farmhouse.glb: no "${CHANNELS_KEY}" record in the node extras, so its TEXCOORD_0 is not the surface channels; re-bake assets/house/farmhouse.kiln.js`,
    );
  }
  if (version !== CHANNELS_VERSION || attribute !== 'TEXCOORD_0') {
    throw new Error(
      `farmhouse.glb: "${CHANNELS_KEY}" is version ${String(version)} in ${String(attribute)}; this loader reads version ${CHANNELS_VERSION} in TEXCOORD_0`,
    );
  }
}

/** Bake every source mesh to the house frame into one flat triangle list. */
function weld(sources: readonly THREE.Mesh[]): KilnPart {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const normalMatrix = new THREE.Matrix3();
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();

  for (const mesh of sources) {
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
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
      uvs.push(uv.getX(i), uv.getY(i));
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
  requireChannelRecord(gltf.scene);
  const buckets = new Map<KilnSurface, THREE.Mesh[]>();
  let triangles = 0;
  let sourceNodes = 0;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((node) => {
    if (!(node as THREE.Mesh).isMesh) return;
    const mesh = node as THREE.Mesh;
    sourceNodes += 1;
    const name = (mesh.material as THREE.Material).name;
    const surface = BINDING[name];
    if (surface === undefined) throw new Error(`farmhouse.glb: unbound material "${name}"`);
    // GLTFLoader names TEXCOORD_0 `uv`. Absent means this mesh was never given
    // its channels, and there is nothing honest to draw it with.
    if (!(mesh.geometry.getAttribute('uv') as THREE.BufferAttribute | undefined)) {
      throw new Error(
        `farmhouse.glb: mesh "${mesh.name}" has no TEXCOORD_0 (uv) attribute, which carries the surface channels`,
      );
    }
    const list = buckets.get(surface) ?? [];
    list.push(mesh);
    buckets.set(surface, list);
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
  });

  const parts: Partial<Record<KilnSurface, KilnPart>> = {};
  for (const [surface, sources] of buckets) parts[surface] = weld(sources);

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
 * A missing or damaged file - including a bake without its surface channels -
 * resolves to null after a loud console error naming what was wrong, and the
 * caller draws the procedural house: 190 kB of static scenery must not be able
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
