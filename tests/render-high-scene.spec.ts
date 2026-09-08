// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { renderHighScene } from '../app/src/scene/renderHighScene';

describe('High scene rendering', () => {
  it.each([false, true])('restores output state when rendering throws: %s', (throws) => {
    const previousTarget = new THREE.RenderTarget();
    const target = new THREE.RenderTarget();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const mrt = {};
    let bound = previousTarget;
    let boundMrt: unknown = mrt;
    const renderer = {
      toneMapping: THREE.NeutralToneMapping,
      outputColorSpace: THREE.SRGBColorSpace,
      autoClear: false, opaque: false, transparent: false,
      getDrawingBufferSize: (v: THREE.Vector2) => v.set(1152, 720),
      getRenderTarget: () => bound,
      getMRT: () => boundMrt,
      setRenderTarget: (value: THREE.RenderTarget) => { bound = value; },
      setMRT: (value: unknown) => { boundMrt = value; },
      render: vi.fn(() => {
        expect(bound).toBe(target);
        expect(boundMrt).toBeNull();
        expect([target.width, target.height]).toEqual([1152, 720]);
        expect(renderer.toneMapping).toBe(THREE.NoToneMapping);
        expect(renderer.outputColorSpace).toBe(THREE.ColorManagement.workingColorSpace);
        expect(renderer.autoClear && renderer.opaque && renderer.transparent).toBe(true);
        if (throws) throw new Error('device failure');
      }),
    };
    const render = () => renderHighScene(renderer as unknown as THREE.WebGPURenderer,
      scene, camera, target, new THREE.Vector2());
    if (throws) expect(render).toThrow('device failure');
    else render();
    expect(renderer.render).toHaveBeenCalledExactlyOnceWith(scene, camera);
    expect(bound).toBe(previousTarget);
    expect(boundMrt).toBe(mrt);
    expect(renderer.toneMapping).toBe(THREE.NeutralToneMapping);
    expect(renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect([renderer.autoClear, renderer.opaque, renderer.transparent]).toEqual([false, false, false]);
    target.dispose(); previousTarget.dispose();
  });
});
