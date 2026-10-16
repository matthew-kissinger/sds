// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Bringing the Kiln-authored farmhouse into this game's shading.
 *
 * IT LIVES IN `lab/` ON PURPOSE. This is a route evaluation, not a shipped
 * asset: the production build is `vite.config.ts` with `app/` as its root and it
 * never references `lab/`, so nothing here can reach `dist/`. The game has never
 * loaded a GLB at runtime - `tests/treeline-assets.spec.ts` asserts the treeline
 * does not - and that decision is not being reversed by a prototype.
 *
 * WHAT THE IMPORT HAS TO DO, AND WHY IT IS THE WHOLE QUESTION. Kiln exports PBR
 * materials, one glTF material per authored material, over 162 separate meshes.
 * This game shades through one toon ramp whose three band colours are solved
 * backwards through the tone map and the post grade
 * (app/src/scene/farmhouse/bands.ts), and it draws the whole homestead in one
 * buffer per band set. So the import does three things, and all three are
 * mechanical:
 *
 *  1. WELD BY MATERIAL NAME. Every mesh is baked to world space and merged into
 *     one buffer per band set. 162 nodes become five draws - the same shape
 *     `farmhouse/shell.ts` builds by hand - and the authored material names are
 *     the band sets' own names, so the mapping is a lookup rather than a guess.
 *  2. REBUILD THE TWO UV CHANNELS. In this game `uv` is not a texture
 *     coordinate: `uv.x` names WHICH surface a triangle is and `uv.y` carries a
 *     distance the material needs - metres below a roof edge on a wall, metres
 *     up the slope on slate (farmhouse/shell.ts). glTF cannot carry that, and
 *     Kiln's export has no custom-attribute channel, so both are recomputed here
 *     from world position. This is the one lossy step in the trip and the one
 *     that would need authoring support to do exactly.
 *  3. HAND THE RESULT TO THE EXISTING MATERIALS, UNCHANGED. No new shader, no
 *     material fork. `makeFarmhouseSurfaceMaterial` is the shipped graph, and it
 *     draws this geometry because step 2 gave it the channels it reads.
 */

import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeFarmhouseSurfaceMaterial } from '@app/scene/farmhouse/surfaceMaterial';
import { makeLampMaterial, makeOpeningMaterial } from '@app/scene/farmhouse/materials';
/** Where the asset is. See lab/src/glb-url.d.ts for why this is a `?url`
 *  import where the game would write `new URL(..., import.meta.url)`. */
import HOUSE_URL from '../../assets/house/farmhouse.glb?url';

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

/**
 * Which band set each authored material becomes, and what `uv.x` selects inside
 * it. The dressings graph carries two sets - plinth stone at 0, chimney masonry
 * at 1 - so those two authored materials weld into ONE buffer and cost one draw
 * between them.
 */
type Surface = 'wall' | 'roof' | 'timber' | 'dress' | 'opening' | 'lamp';
const BINDING: Record<string, { readonly surface: Surface; readonly u: number }> = {
  limewash: { surface: 'wall', u: 0 },
  slate: { surface: 'roof', u: 0 },
  timber: { surface: 'timber', u: 0 },
  stone: { surface: 'dress', u: 0 },
  masonry: { surface: 'dress', u: 1 },
  opening: { surface: 'opening', u: 0 },
  lamp: { surface: 'lamp', u: 0 },
};

export interface KilnHouse {
  readonly geometry: Partial<Record<Surface, THREE.BufferGeometry>>;
  readonly triangles: number;
  readonly sourceNodes: number;
}

/**
 * How far below a roof edge this vertex sits, or how far up a slope, depending
 * on which surface it belongs to. The wall materials darken the first half metre
 * of the former; the slate's courses and sky ramp run on the latter.
 *
 * It is an approximation and the comment is the honest part: a wall under a rake
 * wants the distance to the RAKE, and this returns the distance to the eave for
 * every wall vertex. On the long elevations - which is most of this building and
 * all of what the approach sees - the two agree.
 */
function channelV(surface: Surface, y: number, z: number): number {
  if (surface === 'wall') return Math.max(0, WALL_H - y);
  if (surface === 'roof') {
    // Distance up the pitch from the eave line. Anything lying flat (the porch
    // has none, but the fascia boards do) resolves near zero, which is where a
    // course would start anyway.
    const up = (y - EAVE_Y) / Math.sin(PITCH);
    return Math.max(0, Math.min(up, (ROOF_HALF + OVERHANG) / Math.cos(PITCH)));
  }
  // Masonry takes the stone course lines, which are driven by world height
  // rather than by uv.y, so everything else is simply left alone.
  void z;
  return OPEN_SKY;
}

/** One merged, world-space, non-indexed buffer out of many baked meshes. */
function weld(
  parts: readonly { readonly mesh: THREE.Mesh; readonly u: number }[],
  surface: Surface,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const normalMatrix = new THREE.Matrix3();
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();

  for (const part of parts) {
    const source = part.mesh.geometry.index === null
      ? part.mesh.geometry
      : part.mesh.geometry.toNonIndexed();
    const position = source.getAttribute('position');
    const normal = source.getAttribute('normal');
    part.mesh.updateWorldMatrix(true, false);
    normalMatrix.getNormalMatrix(part.mesh.matrixWorld);
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(part.mesh.matrixWorld);
      positions.push(point.x, point.y, point.z);
      direction.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
      normals.push(direction.x, direction.y, direction.z);
      uvs.push(part.u, channelV(surface, point.y, point.z));
    }
    if (source !== part.mesh.geometry) source.dispose();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Load the GLB and return one buffer per band set, already in world space.
 *
 * The asset is authored at the origin with +X along the ridge and +Y up, which
 * is the frame this game uses, so nothing is rotated or rescaled on the way in.
 * Placement is the caller's.
 */
export async function loadKilnHouse(): Promise<KilnHouse> {
  const response = await fetch(HOUSE_URL);
  if (!response.ok) throw new Error(`farmhouse.glb: ${response.status}`);
  const bytes = await response.arrayBuffer();
  const loader = new GLTFLoader();
  const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => {
    loader.parse(bytes, '', (result) => resolve(result as { scene: THREE.Object3D }), reject);
  });

  const buckets = new Map<Surface, { readonly mesh: THREE.Mesh; readonly u: number }[]>();
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
    const position = mesh.geometry.getAttribute('position');
    triangles += (mesh.geometry.index?.count ?? position.count) / 3;
  });

  const geometry: Partial<Record<Surface, THREE.BufferGeometry>> = {};
  for (const [surface, parts] of buckets) geometry[surface] = weld(parts, surface);

  // The source scene has served its purpose; every buffer below is a new one.
  gltf.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry.dispose();
  });

  return { geometry, triangles, sourceNodes };
}

/** The shipped material for each band set. No fork, no new graph. */
export function kilnHouseMaterials(level: number): Record<Surface, THREE.Material> {
  return {
    wall: makeFarmhouseSurfaceMaterial('wall', level),
    roof: makeFarmhouseSurfaceMaterial('roof'),
    timber: makeFarmhouseSurfaceMaterial('timber'),
    dress: makeFarmhouseSurfaceMaterial('dress'),
    opening: makeOpeningMaterial(),
    lamp: makeLampMaterial(),
  };
}
