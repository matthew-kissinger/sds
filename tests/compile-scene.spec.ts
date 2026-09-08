// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { COMPILE_WHEN_HIDDEN, compileMountedScene } from '@app/scene/compileScene';

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
  it.each(['none', 'compile'])('restores the high-pass renderer state (failure=%s)', async failure => {
    const { scene, near, camera } = fixture();
    near.visible = false;
    near.userData[COMPILE_WHEN_HIDDEN] = true;
    const target = new THREE.RenderTarget(32, 32);
    const previous = new THREE.RenderTarget(16, 16);
    const previousMrt = {};
    let currentTarget = previous;
    let currentMrt: object | null = previousMrt;
    const renderer = {
      toneMapping: THREE.NeutralToneMapping,
      outputColorSpace: THREE.SRGBColorSpace,
      getRenderTarget: () => currentTarget,
      setRenderTarget: (value: THREE.RenderTarget) => { currentTarget = value; },
      getMRT: () => currentMrt,
      setMRT: (value: object | null) => { currentMrt = value; },
      compileAsync: async () => {
        expect(currentTarget).toBe(target);
        expect(currentMrt).toBeNull();
        expect(renderer.toneMapping).toBe(THREE.NoToneMapping);
        expect(renderer.outputColorSpace).toBe(THREE.ColorManagement.workingColorSpace);
        expect(near.visible).toBe(true);
        if (failure === 'compile') throw new Error('compile failed');
      },
    };
    const compilation = compileMountedScene(renderer as unknown as THREE.WebGPURenderer, scene, camera, target);
    if (failure !== 'none') await expect(compilation).rejects.toThrow(`${failure} failed`);
    else await compilation;
    expect(currentTarget).toBe(previous);
    expect(currentMrt).toBe(previousMrt);
    expect(renderer.toneMapping).toBe(THREE.NeutralToneMapping);
    expect(renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect(near.visible).toBe(false);
    target.dispose(); previous.dispose();
  });
  it.each([false, true])('restores hidden effects after compilation (reject=%s)', async (reject) => {
    const { scene, near, far, camera } = fixture();
    near.visible = false;
    far.visible = false;
    near.userData[COMPILE_WHEN_HIDDEN] = true;
    const compileAsync = vi.fn(async () => {
      expect(near.visible).toBe(true);
      expect(far.visible).toBe(false);
      if (reject) throw new Error('compile failed');
    });
    const result = compileMountedScene({ compileAsync } as unknown as THREE.WebGPURenderer, scene, camera);
    if (reject) await expect(result).rejects.toThrow('compile failed');
    else await result;
    expect(near.visible).toBe(false);
    expect(far.visible).toBe(false);
  });
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
