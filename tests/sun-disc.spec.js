// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 39 Phase A — renderer-path divergence sentinel for the sun billboard.
 *
 * The disc shader (WebGL fragment) and the webgpu node material (WebGPU
 * TSL graph) must agree on the same contract:
 *   - No halo math (halo / haloColor / haloFalloff / alphaHaloMix all gone).
 *   - One core color uniform, one intensity uniform, one radial smoothstep.
 *   - AdditiveBlending in both paths (bloom is the painter; the disc is HDR-bright).
 *   - userData.webgpuSunBillboardOwnership.owns === 'disc-body-only'.
 *
 * If a future change reintroduces a halo term on either path, this test fails.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  AdditiveBlending,
  MeshBasicNodeMaterial,
  TSL,
} from 'three/webgpu';

import { createWebGpuSunBillboardNodeMaterial } from '../js/effects/webgpuSunNodeMaterial.js';
import { SunBillboard } from '../js/effects/SunBillboard.js';

describe('cycle-39 sun disc — renderer-path divergence sentinel', () => {
  it('webgpu node material declares disc-body-only ownership and has no halo uniforms', () => {
    const material = createWebGpuSunBillboardNodeMaterial(
      { MeshBasicNodeMaterial, AdditiveBlending, Color: THREE.Color, TSL },
      {}
    );
    expect(material.name).toBe('webgpu-node-sun-billboard');
    expect(material.blending).toBe(AdditiveBlending);
    expect(material.depthWrite).toBe(false);
    expect(material.transparent).toBe(true);
    expect(material.toneMapped).toBe(false);
    expect(material.colorNode).toBeTruthy();
    expect(material.opacityNode).toBeTruthy();

    const ownership = material.userData.webgpuSunBillboardOwnership;
    expect(ownership).toMatchObject({
      owns: 'disc-body-only',
      skyOwns: 'painted-sun-body-aureole-and-horizon-glow',
    });
    expect(material.userData.webgpuSunBillboardShape).toMatchObject({
      coreRadius: 0.065,
      coreFeather: 0.13,
    });
    // No halo bookkeeping anywhere in userData.
    expect(material.userData.webgpuHaloColorUniform).toBeUndefined();
    expect(Object.keys(material.userData)).not.toContain('webgpuHaloColorUniform');

    // Only core + intensity uniforms remain.
    expect(material.userData.webgpuIntensityUniform).toBeTruthy();
    expect(material.userData.webgpuCoreColorUniform).toBeTruthy();
  });

  it('WebGL fallback shader has only core uniforms (no halo uniform)', () => {
    const scene = new THREE.Scene();
    const sun = new SunBillboard(scene); // no webgpu flag → default ShaderMaterial path
    try {
      const uniforms = sun.material.uniforms;
      expect(uniforms).toBeTruthy();
      expect(uniforms.uCoreColor).toBeTruthy();
      expect(uniforms.uIntensity).toBeTruthy();
      expect(uniforms.uCoreRadius).toBeTruthy();
      expect(uniforms.uCoreFeather).toBeTruthy();
      expect(uniforms.uCoreRadius.value).toBe(0.065);
      expect(uniforms.uCoreFeather.value).toBe(0.13);
      // Halo uniform must not exist.
      expect(uniforms.uHaloColor).toBeUndefined();
      // Same blending mode as the webgpu path.
      expect(sun.material.blending).toBe(THREE.AdditiveBlending);
      // The fragment source must not reference halo terms.
      expect(sun.material.fragmentShader).not.toMatch(/halo|Halo/);
    } finally {
      sun.dispose();
    }
  });

  it('SunBillboard.update no longer camera-warps the disc position', () => {
    const scene = new THREE.Scene();
    const sun = new SunBillboard(scene);
    try {
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(0, 10, 0);
      camera.lookAt(0, 10, -1); // looking down -Z; sun is at +Y, 90° off camera forward

      const sunDir = new THREE.Vector3(0, 1, 0); // straight up
      sun.update(camera, sunDir, new THREE.Color(1, 0.95, 0.8));

      // Disc sits at cameraPosition + sunDirection * distance.
      // No camera-direction warping, even with a perpendicular sun.
      const expected = camera.position.clone().addScaledVector(sunDir, sun.distance);
      expect(sun.mesh.position.x).toBeCloseTo(expected.x, 3);
      expect(sun.mesh.position.y).toBeCloseTo(expected.y, 3);
      expect(sun.mesh.position.z).toBeCloseTo(expected.z, 3);

      // Diagnostics report visualDirection === physicalDirection.
      const diag = sun.getDiagnostics();
      expect(diag.visualDirection).toEqual(diag.physicalDirection);
      expect(diag.disc.angularCoreDiameterDeg).toBeGreaterThan(0.4);
    } finally {
      sun.dispose();
    }
  });

  it('fades the disc out when the physical sun is below the horizon', () => {
    const scene = new THREE.Scene();
    const sun = new SunBillboard(scene);
    try {
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(0, 10, 0);
      camera.lookAt(0, 10, -1);

      sun.update(camera, new THREE.Vector3(0, -0.2, -1).normalize(), new THREE.Color(1, 0.95, 0.8));

      const diag = sun.getDiagnostics();
      expect(diag.elevation).toBeLessThan(0);
      expect(diag.intensity).toBe(0);
    } finally {
      sun.dispose();
    }
  });
});
