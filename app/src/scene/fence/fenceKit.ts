// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// Kiln assemblies become shared stock and instance placements, never one draw per node.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadAssetBytes } from '@app/boot/loadAsset';
import type { GateLeafAssembly } from './gateKit';
import type { PostPlacement, RailPlacement } from './placement';

export interface FenceModule {
  id: string;
  posts: PostPlacement[];
  rails: RailPlacement[];
  leaves: { hingeX: number; hingeZ: number; closeTurn: number; parts: RailPlacement[] }[];
}
export interface FenceKit {
  modules: FenceModule[];
  post: THREE.BufferGeometry;
  rail: THREE.BufferGeometry;
}

/** Keep hard surface normals; share corner directions on the reversed hull. */
function outlinedStock(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const solid = source.index ? source.toNonIndexed() : source.clone();
  const p = solid.getAttribute('position'), n = solid.getAttribute('normal');
  if (!p || !n || p.count % 3) throw new Error('Fence kit stock needs triangle positions and normals');
  const key = (i: number) => [p.getX(i), p.getY(i), p.getZ(i)].map(v => v.toFixed(5)).join(',');
  const sums = new Map<string, THREE.Vector3>();
  // Count each distinct face direction once, irrespective of triangle topology.
  const seen = new Set<string>();
  for (let i = 0; i < p.count; i++) {
    const k = key(i), normal = new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i));
    const face = `${k}/${normal.toArray().join(',')}`;
    if (seen.has(face)) continue;
    seen.add(face);
    if (!sums.has(k)) sums.set(k, new THREE.Vector3());
    sums.get(k)!.add(normal);
  }
  const positions: number[] = [], normals: number[] = [], uv: number[] = [];
  for (const hull of [false, true]) for (let t = 0; t < p.count; t += 3) {
    for (const i of hull ? [t, t + 2, t + 1] : [t, t + 1, t + 2]) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      if (hull) normals.push(...sums.get(key(i))!.clone().normalize().toArray());
      else normals.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(hull ? 1 : 0, 0);
    }
  }
  solid.dispose();
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return result;
}

/** Exported metadata is the assembly contract; fail if Kiln dropped any of it. */
export function readFenceKit(scene: THREE.Object3D): FenceKit {
  let version = 0;
  const modules: FenceModule[] = [];
  const stocks: Partial<Record<'post' | 'rail', THREE.BufferGeometry>> = {};
  scene.traverse(node => {
    if (node.userData.fenceKit) version = node.userData.fenceKit.version;
    if (!node.userData.fenceModule) return;
    const module: FenceModule = {
      id: node.userData.fenceModule, posts: [], rails: [],
      leaves: (node.userData.fenceLeaves ?? []).map((leaf: GateLeafAssembly) => ({ ...leaf, parts: [] })),
    };
    node.traverse(part => {
      const kind = part.userData.fenceStock as 'post' | 'rail' | undefined;
      if (!kind) return;
      const data = part.userData.fencePart;
      if (!data || Object.values(data).some(v => typeof v !== 'number' || !Number.isFinite(v))) {
        throw new Error(`Fence kit has invalid placement on ${part.name}`);
      }
      if (!stocks[kind]) part.traverse(child => {
        if (!stocks[kind] && child instanceof THREE.Mesh) stocks[kind] = outlinedStock(child.geometry);
      });
      if (kind === 'post') module.posts.push(data as PostPlacement);
      else if (part.userData.fenceLeaf >= 0) {
        const leaf = module.leaves[part.userData.fenceLeaf];
        if (!leaf) throw new Error('Fence kit rail references a missing leaf');
        leaf.parts.push(data as RailPlacement);
      } else module.rails.push(data as RailPlacement);
    });
    modules.push(module);
  });
  if (version !== 1 || !stocks.post || !stocks.rail
    || modules.map(m => m.id).sort().join(',') !== 'corner,gate,straight'
    || modules.some(m => !m.posts.length || !m.rails.length)
    || modules.find(m => m.id === 'gate')!.leaves.length !== 2) {
    throw new Error('Fence kit requires v1 stock, straight, corner and a two-leaf gate');
  }
  return { modules, post: stocks.post, rail: stocks.rail };
}

let pending: Promise<FenceKit | null> | undefined;
export function loadFenceKit(): Promise<FenceKit | null> {
  const url = new URL('../../../../assets/fence/fence-kit.glb', import.meta.url).href;
  return pending ??= loadAssetBytes(url, 'fence-kit.glb')
    .then(bytes => new GLTFLoader().parseAsync(bytes, ''))
    .then(gltf => {
      const kit = readFenceKit(gltf.scene);
      gltf.scene.traverse(node => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose();
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
        }
      });
      return kit;
    }).catch((error: unknown) => {
      console.error('The Kiln fence did not load; drawing the procedural one.', error);
      return null;
    });
}

