// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The Kiln-authored oak, brought into the treeline.
 *
 * It reaches the page as assets/treeline/kiln/oak.glb, baked from the recipe
 * beside it (assets/treeline/kiln/README.md). `TREE_SOURCE` (treeline/source.ts)
 * decides whether it is loaded at all.
 *
 * THE IMPORT IS THE HOUSE'S, FOR A DIFFERENT CONSUMER. Kiln exports one glTF
 * material per authored material; the treeline draws every tree in one
 * instanced call per role. So, as for the Kiln farmhouse
 * (farmhouse/kilnHouse.ts):
 *
 *  1. SORT BY MATERIAL NAME. Each material is named after the band set that
 *     shades it - `leaf` is the crown, `bark` the wood - so the binding is a
 *     lookup, and every mesh of a role is baked into one buffer in the tree's
 *     frame. The PBR colours Kiln wrote are discarded.
 *  2. CARRY THE CHANNELS ACROSS, NEVER RECONSTRUCT THEM. The recipe bakes what
 *     the canopy material cannot know from one vertex: a seed per leaf cluster
 *     (TEXCOORD_0.x), the normal of the lobe each leaf vertex belongs to
 *     (TANGENT.xyz, beside the cluster's own NORMAL), and Kiln's exposure bake
 *     (`_CAVITY`). It says so on its root node (`treeChannels`, version 1). A
 *     bake without that record, a mesh without TEXCOORD_0 or `_CAVITY`, or a
 *     crown without its lobe normals is refused with an error that says which.
 *
 * AND ONE THING THE HOUSE NEVER HAD TO DO: FIT THE PLACEMENT'S BOX. The house
 * stands in a box drawn for it. A tree stands in 139 boxes, one per stand of the
 * placement manifest (assets/treeline/manifest.json), each with its own width,
 * height and depth, and the treeline scales one unit tree into each of them. So
 * the oak, authored in metres, is mapped here into that unit frame: the foot of
 * its roots to y 0, and its crown's reach either way across, along and up to
 * the share of the box the procedural crown fills (`CROWN_FILL`), less the most
 * the canopy material may swell it (`CROWN_SWELL`). The fit is derived from the
 * bake's own bounds, so a re-authored crown re-fits itself; nothing here repeats
 * a recipe number.
 *
 * Every variant of the family is a node carrying `treeVariant` in its extras.
 * There is one now, the spreading oak; the structure takes more without
 * re-homing anything.
 */

import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadAssetBytes } from '@app/boot/loadAsset';

const FILE = 'oak.glb';

/** The channel record the recipe writes on its root node, and its version. */
const CHANNELS_KEY = 'treeChannels';
const CHANNELS_VERSION = 1;
/** The extras key that marks a variant's node. */
const VARIANT_KEY = 'treeVariant';
/** GLTFLoader lowercases custom attributes: glTF `_CAVITY` arrives as this. */
const CAVITY = '_cavity';

/**
 * How far the crown may reach from the bole, across and along, as a share of
 * the placement box: the procedural crown's own reach. With the swell added,
 * the Kiln crown's plan is the box's ellipse too, so every stand keeps the
 * visible air the placement left round it.
 */
export const CROWN_FILL = 0.47;

/**
 * The most the canopy material pushes a leaf vertex out along its cluster's
 * normal, in the unit frame (treeline/kilnTreeMaterials.ts). The fit leaves
 * this much room on every side and over the top, so the swollen outline still
 * ends where `CROWN_FILL` says.
 */
export const CROWN_SWELL = 0.016;

export type KilnTreeRole = 'crown' | 'wood';

/** Which treeline role each authored material becomes. */
const BINDING: Readonly<Record<string, KilnTreeRole>> = {
  leaf: 'crown',
  bark: 'wood',
};

/** One role's triangles, indexed, in the unit frame. */
export interface KilnTreePart {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** The crown's lobe normals; the wood has none. */
  readonly lobeNormals: Float32Array | null;
  /** Two channels per vertex; the crown's `x` is its cluster seed. */
  readonly uvs: Float32Array;
  readonly cavity: Float32Array;
  readonly index: Uint32Array;
}

/**
 * The whole crown as one mass: the ellipsoid inside its bounds, in the unit
 * frame. The canopy material lights the crown's outer shell against the sun
 * from it, and takes a share of its light from it (kilnTreeMaterials.ts).
 */
export interface KilnCrownEnvelope {
  readonly center: readonly [number, number, number];
  readonly radii: readonly [number, number, number];
}

export interface KilnTreeVariant {
  readonly name: string;
  readonly crown: KilnTreePart;
  readonly wood: KilnTreePart;
  readonly envelope: KilnCrownEnvelope;
}

export interface KilnTree {
  readonly variants: readonly KilnTreeVariant[];
  /** Triangles per tree, crown and wood of the first variant. */
  readonly triangles: { readonly crown: number; readonly wood: number };
  readonly sourceNodes: number;
}

/**
 * Refuse a bake that does not say its channels are the tree's. Kiln writes a
 * TEXCOORD_0 of its own on most helpers, so the attribute being present proves
 * nothing. GLTFLoader hands node extras over as `userData`.
 */
function requireChannelRecord(scene: THREE.Object3D): void {
  let record: unknown;
  scene.traverse((node) => {
    record ??= (node.userData as Record<string, unknown>)[CHANNELS_KEY];
  });
  if (record === undefined) {
    throw new Error(
      `${FILE}: no "${CHANNELS_KEY}" record in the node extras, so its channels are not the tree's; re-bake assets/treeline/kiln/oak.kiln.js`,
    );
  }
  const { version, attribute, lobeNormal } = record as Record<string, unknown>;
  if (version !== CHANNELS_VERSION || attribute !== 'TEXCOORD_0' || lobeNormal !== 'TANGENT') {
    throw new Error(
      `${FILE}: "${CHANNELS_KEY}" is version ${String(version)} with seeds in ${String(attribute)} and lobe normals in ${String(lobeNormal)}; this loader reads version ${CHANNELS_VERSION}, TEXCOORD_0 and TANGENT`,
    );
  }
}

interface Gathered {
  positions: number[];
  normals: number[];
  lobeNormals: number[];
  uvs: number[];
  cavity: number[];
  index: number[];
}

const gathered = (): Gathered => ({
  positions: [], normals: [], lobeNormals: [], uvs: [], cavity: [], index: [],
});

/** Bake one mesh into a role's lists in the tree's frame, keeping its index. */
function gather(into: Gathered, mesh: THREE.Mesh, role: KilnTreeRole): void {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const cavity = geometry.getAttribute(CAVITY);
  const lobe = role === 'crown' ? geometry.getAttribute('tangent') : null;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const base = into.positions.length / 3;
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    into.positions.push(point.x, point.y, point.z);
    direction.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
    into.normals.push(direction.x, direction.y, direction.z);
    if (lobe !== null) {
      direction.set(lobe.getX(i), lobe.getY(i), lobe.getZ(i)).applyMatrix3(normalMatrix).normalize();
      into.lobeNormals.push(direction.x, direction.y, direction.z);
    }
    into.uvs.push(uv.getX(i), uv.getY(i));
    into.cavity.push(cavity.getX(i));
  }
  const index = geometry.index;
  const count = index === null ? position.count : index.count;
  for (let n = 0; n < count; n++) into.index.push(base + (index === null ? n : index.getX(n)));
}

/**
 * Map a variant from metres into the placement's unit frame: the roots' foot
 * to y 0, the crown top to `1 - CROWN_SWELL`, and the crown's furthest reach
 * either way to `CROWN_FILL - CROWN_SWELL` across (x) and along (z). Normals of
 * both kinds take the inverse transpose of the same scale, so the light falls
 * on the unit tree as it fell on the authored one, and the instance's own box
 * scale then puts it right again.
 */
function fit(crown: Gathered, wood: Gathered): [KilnTreePart, KilnTreePart] {
  let reachX = 0;
  let reachZ = 0;
  for (let i = 0; i < crown.positions.length; i += 3) {
    reachX = Math.max(reachX, Math.abs(crown.positions[i]!));
    reachZ = Math.max(reachZ, Math.abs(crown.positions[i + 2]!));
  }
  let foot = Number.POSITIVE_INFINITY;
  let top = Number.NEGATIVE_INFINITY;
  for (const list of [crown.positions, wood.positions]) {
    for (let i = 1; i < list.length; i += 3) {
      foot = Math.min(foot, list[i]!);
      top = Math.max(top, list[i]!);
    }
  }
  const reach = CROWN_FILL - CROWN_SWELL;
  const scale = [reach / reachX, (1 - CROWN_SWELL) / (top - foot), reach / reachZ] as const;
  const directions = (from: readonly number[]): Float32Array => {
    const out = new Float32Array(from.length);
    for (let i = 0; i < from.length; i += 3) {
      const x = from[i]! / scale[0];
      const y = from[i + 1]! / scale[1];
      const z = from[i + 2]! / scale[2];
      const length = Math.hypot(x, y, z);
      out[i] = x / length;
      out[i + 1] = y / length;
      out[i + 2] = z / length;
    }
    return out;
  };
  const part = (from: Gathered): KilnTreePart => {
    const positions = new Float32Array(from.positions.length);
    for (let i = 0; i < from.positions.length; i += 3) {
      positions[i] = from.positions[i]! * scale[0];
      positions[i + 1] = (from.positions[i + 1]! - foot) * scale[1];
      positions[i + 2] = from.positions[i + 2]! * scale[2];
    }
    return {
      positions,
      normals: directions(from.normals),
      lobeNormals: from.lobeNormals.length > 0 ? directions(from.lobeNormals) : null,
      uvs: Float32Array.from(from.uvs),
      cavity: Float32Array.from(from.cavity),
      index: Uint32Array.from(from.index),
    };
  };
  return [part(crown), part(wood)];
}

/** The ellipsoid inside a fitted crown's bounds. */
function envelopeOf(positions: Float32Array): KilnCrownEnvelope {
  const low = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const high = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      low[k] = Math.min(low[k]!, positions[i + k]!);
      high[k] = Math.max(high[k]!, positions[i + k]!);
    }
  }
  const at = (k: number): [number, number] => [(low[k]! + high[k]!) / 2, (high[k]! - low[k]!) / 2];
  const [x, y, z] = [at(0), at(1), at(2)];
  return { center: [x[0], y[0], z[0]], radii: [x[1], y[1], z[1]] };
}

/** Parse the GLB into its variants, each fitted to the unit tree frame. */
export async function parseKilnTree(bytes: ArrayBuffer): Promise<KilnTree> {
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  requireChannelRecord(gltf.scene);
  gltf.scene.updateMatrixWorld(true);

  const roots: THREE.Object3D[] = [];
  gltf.scene.traverse((node) => {
    if (typeof (node.userData as Record<string, unknown>)[VARIANT_KEY] === 'string') roots.push(node);
  });
  if (roots.length === 0) throw new Error(`${FILE}: no node carries "${VARIANT_KEY}" in its extras`);

  let sourceNodes = 0;
  const variants = roots.map((root): KilnTreeVariant => {
    const name = String((root.userData as Record<string, unknown>)[VARIANT_KEY]);
    const lists: Record<KilnTreeRole, Gathered> = { crown: gathered(), wood: gathered() };
    root.traverse((node) => {
      if (!(node as THREE.Mesh).isMesh) return;
      const mesh = node as THREE.Mesh;
      sourceNodes += 1;
      const material = (mesh.material as THREE.Material).name;
      const role = BINDING[material];
      if (role === undefined) throw new Error(`${FILE}: unbound material "${material}" on "${mesh.name}"`);
      const has = (attribute: string): boolean =>
        (mesh.geometry.getAttribute(attribute) as THREE.BufferAttribute | undefined) !== undefined;
      // GLTFLoader names TEXCOORD_0 `uv` and TANGENT `tangent`. Absent means this
      // mesh was never given its channels, and there is nothing honest to draw
      // it with.
      if (!has('uv')) {
        throw new Error(`${FILE}: mesh "${mesh.name}" has no TEXCOORD_0 (uv) attribute, which carries the tree's channels`);
      }
      if (!has(CAVITY)) {
        throw new Error(`${FILE}: mesh "${mesh.name}" has no _CAVITY attribute; the recipe bakes it with bakeSurfaceAttributes`);
      }
      if (role === 'crown' && !has('tangent')) {
        throw new Error(`${FILE}: crown mesh "${mesh.name}" has no TANGENT attribute, which carries its lobe normals`);
      }
      gather(lists[role], mesh, role);
    });
    if (lists.crown.index.length === 0 || lists.wood.index.length === 0) {
      throw new Error(`${FILE}: variant "${name}" needs both a leaf crown and bark wood`);
    }
    const [crown, wood] = fit(lists.crown, lists.wood);
    return { name, crown, wood, envelope: envelopeOf(crown.positions) };
  });

  // The source scene has served its purpose; every array above is a new one.
  gltf.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry.dispose();
  });
  const first = variants[0]!;
  return {
    variants,
    triangles: { crown: first.crown.index.length / 3, wood: first.wood.index.length / 3 },
    sourceNodes,
  };
}

/** One role of one variant as a geometry the treeline instances. */
export function kilnTreeGeometry(part: KilnTreePart): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3));
  if (part.lobeNormals !== null) geometry.setAttribute('lobeNormal', new THREE.BufferAttribute(part.lobeNormals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(part.uvs, 2));
  geometry.setAttribute('cavity', new THREE.BufferAttribute(part.cavity, 1));
  geometry.setIndex(new THREE.BufferAttribute(part.index, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

let pending: Promise<KilnTree | null> | null = null;

/**
 * Fetch and parse once. Repeat calls share the first promise.
 *
 * A missing or damaged file - including a bake without its channels - resolves
 * to null after a loud console error naming what was wrong, and the treeline
 * draws the procedural oak: scenery must not be able to take the field down
 * with it.
 */
export function loadKilnTree(): Promise<KilnTree | null> {
  // Vite rewrites this literal to the hashed asset URL at build, as for the
  // other bakes. It sits inside the function, not at module level, so that a
  // bundle which never calls the loader has no stray reference left over.
  const url = new URL('../../../../assets/treeline/kiln/oak.glb', import.meta.url).href;
  pending ??= loadAssetBytes(url, FILE)
    .then(parseKilnTree)
    .catch((error: unknown) => {
      console.error('The Kiln oak did not load; drawing the procedural one.', error);
      return null;
    });
  return pending;
}
