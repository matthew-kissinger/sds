// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three/webgpu';
import { readFenceKit } from '@app/scene/fence/fenceKit';
import { buildFenceField, fenceFieldPlacements } from '@app/scene/fence/fenceField';
import { HOME_FIELD } from '@sim/field';
import { decodeHeightfield } from '@app/world/heightfieldSampler';
import { TERRAIN_MANIFEST } from '@app/world/terrainLayout';

const bytes = readFileSync(new URL('../assets/fence/fence-kit.glb', import.meta.url));
const parsed = new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');

describe('Kiln runtime fence kit', () => {
  it('keeps source and exported geometry pinned, with no image textures', () => {
    const ledger = JSON.parse(readFileSync(new URL('../assets/fence/asset-manifest.json', import.meta.url), 'utf8'));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(ledger.artifact.sha256);
    const recipe = readFileSync(new URL('../assets/fence/fence-kit.kiln.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    expect(createHash('sha256').update(recipe).digest('hex')).toBe(ledger.recipe.sha256);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    expect(json.textures ?? []).toHaveLength(0);
    expect(json.images ?? []).toHaveLength(0);
  });

  it('renders the full field and pen in two timber batches and one shadow batch', async () => {
    const kit = readFenceKit((await parsed).scene);
    const built = buildFenceField(kit, () => 0);
    expect(built.posts.length).toBeGreaterThan(150);
    expect(Math.min(...built.posts.map(p => p.x))).toBe(-100);
    expect(Math.max(...built.posts.map(p => p.z))).toBe(130);
    expect(built.objects).toHaveLength(3);
    expect(built.objects.filter(m => m instanceof THREE.InstancedMesh)).toHaveLength(2);
    expect(built.objects.every(m => !Array.isArray(m.material) && m.geometry.groups.length === 0)).toBe(true);
    expect(kit.modules.find(m => m.id === 'corner')!.posts.filter(p => p.x === 0 && p.z === 0)).toHaveLength(1);
    const rail = built.railBatch.meshes[0]!;
    const initial = rail.instanceMatrix.array.slice();
    const shadowInitial = built.objects[2]!.geometry.getAttribute('position').array.slice();
    const staticLength = built.rails.length * 16;
    for (const progress of [0.25, 0.5, 0.75, 1]) {
      built.updateGate(progress);
      expect([...rail.instanceMatrix.array].every(Number.isFinite)).toBe(true);
      expect(rail.instanceMatrix.array.slice(0, staticLength)).toEqual(initial.slice(0, staticLength));
    }
    expect(rail.instanceMatrix.array.slice(staticLength)).not.toEqual(initial.slice(staticLength));
    expect(built.objects[2]!.geometry.getAttribute('position').array).not.toEqual(shadowInitial);
    for (const mesh of built.objects) {
      mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
      if (mesh instanceof THREE.InstancedMesh) mesh.dispose();
    }
    kit.post.dispose(); kit.rail.dispose();
  });

  it('refuses an export that lost its assembly contract', async () => {
    const scene = (await parsed).scene.clone(true);
    scene.traverse(node => { if (node.userData.fenceKit) node.userData.fenceKit = { version: 0 }; });
    expect(() => readFenceKit(scene)).toThrow('requires v1 stock');
  });

  it('keeps both moving leaves above the committed terrain throughout closing and reopening', async () => {
    const terrainBytes = readFileSync(new URL('../assets/terrain/heightfield.bin', import.meta.url));
    const terrain = decodeHeightfield(terrainBytes.buffer.slice(terrainBytes.byteOffset,
      terrainBytes.byteOffset + terrainBytes.byteLength), TERRAIN_MANIFEST);
    const kit = readFenceKit((await parsed).scene);
    const built = buildFenceField(kit, (x, z) => terrain.groundY(x, z));
    const mesh = built.railBatch.meshes[0]!;
    const points = mesh.geometry.getAttribute('position');
    const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
    const initialMatrices = mesh.instanceMatrix.array.slice();
    const shadow = built.objects[2]!.geometry.getAttribute('position') as THREE.BufferAttribute;
    const initialShadow = shadow.array.slice();
    let minClearance = Infinity;
    try {
      for (let step = 0; step <= 48; step++) {
        built.updateGate(step / 48);
        for (let i = built.rails.length; i < mesh.count; i++) {
          mesh.getMatrixAt(i, matrix);
          for (let v = 0; v < points.count; v++) {
            point.fromBufferAttribute(points, v).applyMatrix4(matrix);
            minClearance = Math.min(minClearance, point.y - terrain.groundY(point.x, point.z));
          }
        }
      }
      expect(minClearance).toBeGreaterThan(0.02);
      built.updateGate(0);
      expect(mesh.instanceMatrix.array).toEqual(initialMatrices);
      expect(shadow.array).toEqual(initialShadow);
      const versions = [mesh.instanceMatrix.version, shadow.version];
      built.updateGate(0);
      expect([mesh.instanceMatrix.version, shadow.version]).toEqual(versions);
    } finally {
      for (const object of built.objects) {
        object.geometry.dispose(); (object.material as THREE.Material).dispose();
        if (object instanceof THREE.InstancedMesh) object.dispose();
      }
      kit.post.dispose(); kit.rail.dispose();
    }
  });

  it('joins the pen to divided perimeter bays through one common post', async () => {
    const kit = readFenceKit((await parsed).scene);
    try {
      const { posts, rails } = fenceFieldPlacements(kit, () => 0);
      const front = HOME_FIELD.bounds.maxZ;
      for (const x of [HOME_FIELD.pen.minX, HOME_FIELD.pen.maxX]) {
        expect(posts.filter(p => Math.hypot(p.x - x, p.z - front) < 1e-7)).toHaveLength(1);
        const meets = rails.filter(r =>
          Math.hypot(r.ax - x, r.az - front) < 1e-7
          || Math.hypot(r.bx - x, r.bz - front) < 1e-7,
        );
        // Three levels from each of the two perimeter bays and the pen side.
        expect(meets).toHaveLength(9);
        // No unsplit perimeter panel passes behind the common post.
        expect(rails.some(r => Math.abs(r.az - front) < 1e-7
          && Math.abs(r.bz - front) < 1e-7
          && Math.min(r.ax, r.bx) < x - 1e-7 && Math.max(r.ax, r.bx) > x + 1e-7)).toBe(false);
      }
      // Includes gate strainers: a stray old subdivision must not survive beside
      // a shared junction, and no two sections may duplicate a post.
      for (let a = 0; a < posts.length; a++) for (let b = a + 1; b < posts.length; b++) {
        expect(Math.hypot(posts[a]!.x - posts[b]!.x, posts[a]!.z - posts[b]!.z)).toBeGreaterThan(3.5);
      }
    } finally { kit.post.dispose(); kit.rail.dispose(); }
  });

  it('keeps one continuous front rail outside the exact eight-metre mouth', async () => {
    const kit = readFenceKit((await parsed).scene);
    try {
      const { rails, posts } = fenceFieldPlacements(kit, () => 0);
      const { position, width } = HOME_FIELD.gate;
      const left = position.x - width / 2, right = position.x + width / 2;
      // Take just the middle rail level, excluding knees and diagonal strainers.
      const front = rails.filter(r => Math.abs(r.az - position.z) < 1e-7
        && Math.abs(r.bz - position.z) < 1e-7 && Math.abs(r.ay - 0.83) < 1e-7)
        .map(r => [Math.min(r.ax, r.bx), Math.max(r.ax, r.bx)] as const)
        .sort((a, b) => a[0] - b[0]);
      const before = front.filter(r => r[1] <= left + 1e-7);
      const after = front.filter(r => r[0] >= right - 1e-7);
      expect(before.length + after.length).toBe(front.length);
      for (const [run, min, max] of [[before, HOME_FIELD.bounds.minX, left],
        [after, right, HOME_FIELD.bounds.maxX]] as const) {
        expect(run[0]![0]).toBe(min);
        expect(run.at(-1)![1]).toBeCloseTo(max, 10);
        for (let i = 1; i < run.length; i++) expect(run[i]![0]).toBeCloseTo(run[i - 1]![1], 10);
      }
      for (const rail of rails) for (const [x, z] of [[rail.ax, rail.az], [rail.bx, rail.bz]]) {
        if (Math.abs(z! - position.z) < 1) expect(x! <= left + 1e-7 || x! >= right - 1e-7).toBe(true);
      }
      for (const p of posts.filter(p => Math.abs(p.z - position.z) < 1)) {
        expect(p.x + p.girth / 2 <= left || p.x - p.girth / 2 >= right).toBe(true);
      }
    } finally { kit.post.dispose(); kit.rail.dispose(); }
  });
});
