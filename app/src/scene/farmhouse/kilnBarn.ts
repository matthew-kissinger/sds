// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The Kiln-authored barn, brought into this game's shading.
 *
 * It reaches the page as assets/barn/barn.glb, baked from the recipe beside it
 * (assets/barn/README.md). `BARN_SOURCE` (farmhouse/barnSource.ts) decides
 * whether it is loaded at all, independently of the house.
 *
 * THE IMPORT IS THE HOUSE'S, AND THAT IS DELIBERATE. Kiln exports one glTF
 * material per authored material over separate meshes; this game draws the
 * homestead in one buffer per band set through one toon ramp. So, exactly as
 * for the Kiln farmhouse (farmhouse/kilnHouse.ts):
 *
 *  1. SORT BY MATERIAL NAME. Every mesh is baked to the barn's frame and sorted
 *     into one list per band set. The recipe names its materials after the sets
 *     (`boards` is the rust-red BARN set), so the mapping is a lookup.
 *  2. CARRY THE TWO SURFACE CHANNELS ACROSS. `uv.x` selects a surface inside a
 *     band set and `uv.y` carries the distance the material needs - metres below
 *     the roof's underside on boards and timber, metres up the slate from its
 *     eave edge on the roof (farmhouse/surfaceMaterial.ts). The recipe computes
 *     both from its own parts, writes them into TEXCOORD_0 and records that on
 *     its root node (`surfaceChannels`, version 1). They are read here, never
 *     reconstructed, and a bake without the record or a mesh without TEXCOORD_0
 *     is refused with an error that says which.
 *
 * `weld` is the house loader's line for line. `requireChannelRecord` is too,
 * except that it takes the file's name rather than spelling it and finds its
 * record through `nodeRecord`, which the envelope reader shares. Folding the two
 * loaders into one building loader - a table of { file, url, binding, records }
 * and one parse - is a mechanical follow-up, not done here so that this change
 * cannot move the house.
 *
 * The result is welded into the cluster's own buffers by `buildFarmhouse`
 * (farmhouse/cluster.ts), so the barn costs triangles, not draw calls.
 */

import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadAssetBytes } from '@app/boot/loadAsset';
import type { OutlineEnvelope } from './hull';
import type { KilnPart } from './kilnHouse';

const FILE = 'barn.glb';

/** The channel record the recipe writes on its root node, and its version. */
const CHANNELS_KEY = 'surfaceChannels';
const CHANNELS_VERSION = 1;

/** The outline's masses, recorded beside the channels (farmhouse/hull.ts). */
const ENVELOPE_KEY = 'outlineEnvelope';
const ENVELOPE_VERSION = 1;

/** The cluster buffers the barn welds into: the house's, with boards for wall. */
export type KilnBarnSurface = 'barn' | 'roof' | 'timber' | 'dress' | 'opening' | 'lamp';

/**
 * Which band set each authored material becomes. `slate` carries `uv.x` = 1,
 * which is the barn's browner slate inside the shared roof set.
 */
const BINDING: Readonly<Record<string, KilnBarnSurface>> = {
  boards: 'barn',
  slate: 'roof',
  timber: 'timber',
  stone: 'dress',
  opening: 'opening',
  lamp: 'lamp',
};

export interface KilnBarn {
  readonly parts: Readonly<Partial<Record<KilnBarnSurface, KilnPart>>>;
  /** What the outline is grown from: the slab, walls and cupola as baked. */
  readonly envelope: OutlineEnvelope;
  readonly triangles: number;
  readonly sourceNodes: number;
}

/** The first value under `key` in any node's extras, or undefined. */
function nodeRecord(scene: THREE.Object3D, key: string): unknown {
  let record: unknown;
  scene.traverse((node) => {
    record ??= (node.userData as Record<string, unknown>)[key];
  });
  return record;
}

/**
 * The outline's masses, checked shape by shape. The envelope is derived from the
 * bake rather than copied into plan.ts, so a bake that does not carry it, or
 * carries something else under its name, is refused like a bake without its
 * channels: the outline of a building that is not there is worse than none.
 */
function readEnvelope(scene: THREE.Object3D, file: string): OutlineEnvelope {
  const record = nodeRecord(scene, ENVELOPE_KEY) as Record<string, unknown> | undefined;
  const fail = (what: string): never => {
    throw new Error(`${file}: "${ENVELOPE_KEY}" ${what}; re-bake its recipe`);
  };
  if (record === undefined) fail('is missing from the node extras');
  if (record!.version !== ENVELOPE_VERSION) {
    fail(`is version ${String(record!.version)}, and this loader reads version ${ENVELOPE_VERSION}`);
  }
  const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
  const pair = (value: unknown, name: string): readonly [number, number] =>
    Array.isArray(value) && value.length === 2 && value.every(finite)
      ? [value[0] as number, value[1] as number]
      : fail(`${name} is not a pair of numbers`);
  const list = (value: unknown, name: string): readonly unknown[] =>
    Array.isArray(value) ? value : fail(`${name} is not a list`);
  const slab = (record!.slab ?? {}) as Record<string, unknown>;
  const top = list(slab.top, 'slab.top').map((p, i) => pair(p, `slab.top[${i}]`));
  const under = list(slab.under, 'slab.under').map((p, i) => pair(p, `slab.under[${i}]`));
  if (top.length < 3 || top.length !== under.length) {
    fail(`slab has ${top.length} top and ${under.length} underside corners`);
  }
  const boxes = list(record!.boxes, 'boxes').map((value, i) => {
    const b = value as Record<string, unknown>;
    return { x: pair(b.x, `boxes[${i}].x`), y: pair(b.y, `boxes[${i}].y`), z: pair(b.z, `boxes[${i}].z`) };
  });
  const caps = list(record!.caps, 'caps').map((value, i) => {
    const c = value as Record<string, unknown>;
    const apex = Array.isArray(c.apex) && c.apex.length === 3 && c.apex.every(finite)
      ? ([c.apex[0], c.apex[1], c.apex[2]] as [number, number, number])
      : fail(`caps[${i}].apex is not a point`);
    if (!finite(c.y)) fail(`caps[${i}].y is not a number`);
    return { x: pair(c.x, `caps[${i}].x`), z: pair(c.z, `caps[${i}].z`), y: c.y as number, apex };
  });
  return { slab: { x: pair(slab.x, 'slab.x'), top, under }, boxes, caps };
}

/**
 * Refuse a bake that does not say its TEXCOORD_0 is the surface channels.
 *
 * Every Kiln part carries a TEXCOORD_0 of its own, so the attribute being
 * present proves nothing. GLTFLoader hands node extras over as `userData`.
 */
function requireChannelRecord(scene: THREE.Object3D, file: string): void {
  const record = nodeRecord(scene, CHANNELS_KEY);
  const { version, attribute } = (record ?? {}) as { version?: unknown; attribute?: unknown };
  if (record === undefined) {
    throw new Error(
      `${file}: no "${CHANNELS_KEY}" record in the node extras, so its TEXCOORD_0 is not the surface channels; re-bake its recipe`,
    );
  }
  if (version !== CHANNELS_VERSION || attribute !== 'TEXCOORD_0') {
    throw new Error(
      `${file}: "${CHANNELS_KEY}" is version ${String(version)} in ${String(attribute)}; this loader reads version ${CHANNELS_VERSION} in TEXCOORD_0`,
    );
  }
}

/** Bake every source mesh to the building's frame into one flat triangle list. */
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
 * The barn is authored at its footprint's centre on the pad, +X along the
 * ridge, -Z out of the cart door and +Y up - the frame `BARN_AT` and `BARN_YAW`
 * place - so nothing is rotated or rescaled on the way in. The cart doors and
 * the hay door stand open on hinge nodes; their transforms are baked here like
 * any other node's.
 */
export async function parseKilnBarn(bytes: ArrayBuffer): Promise<KilnBarn> {
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  requireChannelRecord(gltf.scene, FILE);
  const envelope = readEnvelope(gltf.scene, FILE);
  const buckets = new Map<KilnBarnSurface, THREE.Mesh[]>();
  let triangles = 0;
  let sourceNodes = 0;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((node) => {
    if (!(node as THREE.Mesh).isMesh) return;
    const mesh = node as THREE.Mesh;
    sourceNodes += 1;
    const name = (mesh.material as THREE.Material).name;
    const surface = BINDING[name];
    if (surface === undefined) throw new Error(`${FILE}: unbound material "${name}"`);
    // GLTFLoader names TEXCOORD_0 `uv`. Absent means this mesh was never given
    // its channels, and there is nothing honest to draw it with.
    if (!(mesh.geometry.getAttribute('uv') as THREE.BufferAttribute | undefined)) {
      throw new Error(
        `${FILE}: mesh "${mesh.name}" has no TEXCOORD_0 (uv) attribute, which carries the surface channels`,
      );
    }
    const list = buckets.get(surface) ?? [];
    list.push(mesh);
    buckets.set(surface, list);
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
  });

  const parts: Partial<Record<KilnBarnSurface, KilnPart>> = {};
  for (const [surface, sources] of buckets) parts[surface] = weld(sources);

  // The source scene has served its purpose; every array above is a new one.
  gltf.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry.dispose();
  });
  return { parts, envelope, triangles, sourceNodes };
}

let pending: Promise<KilnBarn | null> | null = null;

/**
 * Fetch and parse once. Repeat calls share the first promise.
 *
 * A missing or damaged file - including a bake without its surface channels -
 * resolves to null after a loud console error naming what was wrong, and the
 * caller draws the procedural barn: static scenery must not be able to take the
 * field down with it.
 */
export function loadKilnBarn(): Promise<KilnBarn | null> {
  // Vite rewrites this literal to the hashed asset URL at build, as for the other
  // bakes. It sits inside the function, not at module level, so that a bundle
  // which never calls the loader has no stray reference left over.
  const url = new URL('../../../../assets/barn/barn.glb', import.meta.url).href;
  pending ??= loadAssetBytes(url, FILE)
    .then(parseKilnBarn)
    .catch((error: unknown) => {
      console.error('The Kiln barn did not load; drawing the procedural one.', error);
      return null;
    });
  return pending;
}
