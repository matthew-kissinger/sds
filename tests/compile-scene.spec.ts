// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { compileMountedScene } from '@app/scene/compileScene';

function fixture() {
  const scene = new THREE.Scene();
  const near = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const far = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  near.frustumCulled = true;
  far.frustumCulled = false;
  scene.add(near, far);
  const camera = new THREE.PerspectiveCamera();
  return { scene, near, far, camera };
}

describe('compileMountedScene', () => {
  it('uses the mounted scene and honest camera without mutating culling', async () => {
    const { scene, near, far, camera } = fixture();
    const compileAsync = vi.fn(async () => {
      expect(near.frustumCulled).toBe(true);
      expect(far.frustumCulled).toBe(false);
    });

    await compileMountedScene(
      { compileAsync } as unknown as THREE.WebGPURenderer,
      scene,
      camera,
    );

    expect(compileAsync).toHaveBeenCalledWith(scene, camera, scene);
    expect(near.frustumCulled).toBe(true);
    expect(far.frustumCulled).toBe(false);
  });

  it('leaves culling untouched when compilation rejects', async () => {
    const { scene, near, far, camera } = fixture();
    const renderer = {
      compileAsync: vi.fn(async () => Promise.reject(new Error('compile failed'))),
    } as unknown as THREE.WebGPURenderer;

    await expect(compileMountedScene(renderer, scene, camera)).rejects.toThrow('compile failed');
    expect(near.frustumCulled).toBe(true);
    expect(far.frustumCulled).toBe(false);
  });
});
