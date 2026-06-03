// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as WEBGPU from 'three/webgpu';

import { Atmosphere } from '../js/atmosphere/Atmosphere.js';
import { CloudLayer } from '../js/atmosphere/CloudLayer.js';
import { HosekWilkieSky } from '../js/atmosphere/HosekWilkieSky.js';
import { SKY_PRESETS } from '../js/atmosphere/skyPresets.js';
import { createSkyFogSamplePacket } from '../js/atmosphere/skyFogSamplePacket.js';
import {
  createKonveyorAtmosphereMaterial,
  shouldApplyKonveyorAtmosphere,
} from '../js/atmosphere/konveyorAtmosphereMaterialAdapter.js';
import {
  createKonveyorCloudLayerMaterialFactories,
  createKonveyorCloudLayerNodeMaterial,
} from '../js/atmosphere/konveyorCloudNodeMaterial.js';
import {
  createKonveyorSkyDomeMaterialFactories,
  createKonveyorSkyFogNodeMaterial,
} from '../js/atmosphere/konveyorSkyNodeMaterial.js';

function defaultMaterial(name = 'default-atmosphere') {
  return {
    name,
    dispose() {},
  };
}

describe('konveyor atmosphere material adapter', () => {
  it('requires the explicit WebGPU atmosphere flag', () => {
    expect(shouldApplyKonveyorAtmosphere('?renderer=webgpu&konveyorAtmosphere=1')).toBe(true);
    expect(shouldApplyKonveyorAtmosphere('?renderer=webgpu&diagnostic=1')).toBe(false);
    expect(shouldApplyKonveyorAtmosphere('?renderer=webgl&konveyorAtmosphere=1')).toBe(false);
    expect(shouldApplyKonveyorAtmosphere('')).toBe(false);
  });

  it('keeps the default sky material unless factories are explicitly supplied', () => {
    const disabled = createKonveyorAtmosphereMaterial('sky-dome', 'createSkyDomeMaterial', {
      createDefaultMaterial: () => defaultMaterial('default-sky'),
      search: '?renderer=webgpu',
      factories: {
        createSkyDomeMaterial: () => defaultMaterial('konveyor-sky'),
      },
    });

    expect(disabled.material.name).toBe('default-sky');
    expect(disabled.summary).toMatchObject({
      kind: 'sky-dome',
      applied: false,
      reason: 'flag-disabled',
    });

    const missingFactory = createKonveyorAtmosphereMaterial('sky-dome', 'createSkyDomeMaterial', {
      createDefaultMaterial: () => defaultMaterial('default-sky'),
      search: '?renderer=webgpu&konveyorAtmosphere=1',
    });

    expect(missingFactory.material.name).toBe('default-sky');
    expect(missingFactory.summary.reason).toBe('missing-factories');
  });

  it('allows HosekWilkieSky to receive an explicit WebGPU sky material factory', () => {
    const contexts = [];
    const sky = new HosekWilkieSky({
      factory: (context) =>
        createKonveyorAtmosphereMaterial('sky-dome', 'createSkyDomeMaterial', {
          createDefaultMaterial: () => defaultMaterial('default-sky'),
          search: '?renderer=webgpu&konveyorAtmosphere=1',
          factories: {
            createSkyDomeMaterial: (factoryContext) => {
              contexts.push(factoryContext);
              return {
                material: defaultMaterial('konveyor-sky-dome'),
              };
            },
          },
          context,
        }),
    });

    try {
      expect(sky.material.name).toBe('konveyor-sky-dome');
      expect(contexts).toHaveLength(1);
      expect(contexts[0].uniforms).toBe(sky.uniforms);
      sky.applyPreset(SKY_PRESETS.dusk);
      expect(sky.uniforms.uTurbidity.value).toBe(SKY_PRESETS.dusk.turbidity);
    } finally {
      sky.dispose();
    }
  });

  it('routes HosekWilkieSky through the shared atmosphere adapter when no override factory is supplied', () => {
    const contexts = [];
    const sky = new HosekWilkieSky({
      search: '?renderer=webgpu&konveyorAtmosphere=1',
      konveyorAtmosphereFactories: {
        createSkyDomeMaterial: (factoryContext) => {
          contexts.push(factoryContext);
          return defaultMaterial('konveyor-direct-sky');
        },
      },
    });

    try {
      expect(sky.material.name).toBe('konveyor-direct-sky');
      expect(contexts).toHaveLength(1);
      expect(contexts[0].uniforms).toBe(sky.uniforms);
    } finally {
      sky.dispose();
    }
  });

  it('creates a reusable WebGPU sky node material from the CPU sky fog packet', () => {
    const skyFog = createSkyFogSamplePacket();
    const material = createKonveyorSkyFogNodeMaterial(WEBGPU, skyFog);

    expect(material.name).toBe('konveyor-node-sky-fog');
    expect(material.isNodeMaterial).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.depthTest).toBe(false);
    expect(material.userData.konveyorSkyMaterialControls?.update).toBeInstanceOf(Function);
    expect(material.userData.konveyorSkyNodeUniforms.sunDirection.value.toArray()).toEqual(
      new THREE.Vector3(...skyFog.sunDirection).normalize().toArray()
    );
    expect(material.userData.konveyorSkyPresetTuning).toMatchObject({
      sunGlowStrength: 0.12,
      sunDiscStrength: 0,
      sunDiscOwner: 'SunBillboard',
      ownership: 'sky-painted-sun-body-aureole-and-horizon-glow',
      aureoleG: 0.80,
    });
  });

  it('routes HosekWilkieSky to the extracted WebGPU sky node material factory under the explicit flag', () => {
    const skyFog = createSkyFogSamplePacket();
    const sky = new HosekWilkieSky({
      search: '?renderer=webgpu&konveyorAtmosphere=1',
      konveyorAtmosphereFactories: createKonveyorSkyDomeMaterialFactories(WEBGPU, skyFog),
    });

    try {
      expect(sky.material.name).toBe('konveyor-node-sky-dome');
      expect(sky.material.isNodeMaterial).toBe(true);
      expect(sky.material.side).toBe(WEBGPU.BackSide);
      expect(sky.materialControls).toBe(sky.material.userData.konveyorSkyMaterialControls);
      const sunDirection = new THREE.Vector3(0, 0.15, -1).normalize();
      sky.update(0, sunDirection);
      expect(sky.materialControls.nodes.sunDirection.value.toArray()).toEqual(sunDirection.toArray());
      expect(sky.getMesh().material).toBe(sky.material);
    } finally {
      sky.dispose();
    }
  });

  it('lets Atmosphere forward an explicit sky material factory without changing defaults', () => {
    const contexts = [];
    const scene = new THREE.Scene();
    const atmo = new Atmosphere(scene, {
      enableClouds: false,
      attachFog: false,
      skyFactory: (context) =>
        createKonveyorAtmosphereMaterial('sky-dome', 'createSkyDomeMaterial', {
          createDefaultMaterial: () => defaultMaterial('default-sky'),
          search: '?renderer=webgpu&konveyorAtmosphere=1',
          factories: {
            createSkyDomeMaterial: (factoryContext) => {
              contexts.push(factoryContext);
              return defaultMaterial('konveyor-atmosphere-sky');
            },
          },
          context,
        }),
    });

    try {
      expect(atmo.sky.material.name).toBe('konveyor-atmosphere-sky');
      expect(contexts).toHaveLength(1);
      expect(contexts[0].uniforms).toBe(atmo.sky.uniforms);
      expect(scene.children).toContain(atmo.sky.getMesh());
    } finally {
      atmo.dispose();
    }
  });

  it('routes CloudLayer through the shared atmosphere adapter with update controls', () => {
    const contexts = [];
    const updates = [];
    const layer = new CloudLayer({
      search: '?renderer=webgpu&konveyorAtmosphere=1',
      konveyorAtmosphereFactories: {
        createCloudLayerMaterial: (factoryContext) => {
          contexts.push(factoryContext);
          return {
            material: new THREE.MeshBasicMaterial({ name: 'konveyor-cloud-layer' }),
            controls: {
              update: (state) => updates.push({
                coverage: state.coverage,
                edgeFade: state.edgeFade,
                noiseScale: state.noiseScale,
                timeSeconds: state.timeSeconds,
                sunColorHex: state.sunColor.getHex(),
              }),
            },
          };
        },
      },
    });

    try {
      expect(layer.material.name).toBe('konveyor-cloud-layer');
      expect(layer.konveyorMaterialSummary).toMatchObject({
        kind: 'cloud-layer',
        applied: true,
      });
      expect(contexts).toHaveLength(1);
      expect(contexts[0].uniforms).toBe(layer.uniforms);

      layer.setCoverage(0.4);
      layer.setFeatureScaleMeters(500);
      layer.update(
        new THREE.Vector3(10, 1300, 20),
        0,
        new THREE.Vector3(0, 1, 0),
        new THREE.Color(0.25, 0.5, 1.0),
        0.5
      );

      const lastUpdate = updates.at(-1);
      expect(lastUpdate.coverage).toBeCloseTo(0.4);
      expect(lastUpdate.edgeFade).toBeCloseTo(1);
      expect(lastUpdate.noiseScale).toBeCloseTo(1 / 500);
      expect(lastUpdate.timeSeconds).toBeCloseTo(0.5);
      expect(lastUpdate.sunColorHex).toBe(new THREE.Color(0.25, 0.5, 1.0).getHex());
      expect(layer.getMesh().visible).toBe(true);
    } finally {
      layer.dispose();
    }
  });

  it('creates a reusable WebGPU cloud node material', () => {
    const material = createKonveyorCloudLayerNodeMaterial(WEBGPU);

    expect(material.name).toBe('konveyor-node-cloud-layer');
    expect(material.isNodeMaterial).toBe(true);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.side).toBe(WEBGPU.DoubleSide);
  });

  it('routes CloudLayer to the extracted WebGPU cloud node material factory under the explicit flag', () => {
    const layer = new CloudLayer({
      search: '?renderer=webgpu&konveyorAtmosphere=1',
      konveyorAtmosphereFactories: createKonveyorCloudLayerMaterialFactories(WEBGPU),
    });

    try {
      expect(layer.material.name).toBe('konveyor-node-cloud-layer');
      expect(layer.material.isNodeMaterial).toBe(true);
      expect(layer.konveyorMaterialSummary).toMatchObject({
        kind: 'cloud-layer',
        applied: true,
      });
      expect(layer.getMesh().material).toBe(layer.material);
      expect(layer.materialControls).toBe(layer.material.userData.konveyorCloudLayerMaterialControls);
      expect(layer.material.userData.konveyorCloudLayerMaterialSummary).toMatchObject({
        kind: 'cloud-layer',
        applied: true,
      });

      layer.setCoverage(0.35);
      layer.setFeatureScaleMeters(450);
      layer.update(
        new THREE.Vector3(20, 1300, -10),
        0,
        new THREE.Vector3(0.25, 1, 0.5),
        new THREE.Color(0.7, 0.8, 0.9),
        0.75
      );

      const nodes = layer.materialControls.nodes;
      expect(nodes.coverage.value).toBeCloseTo(0.35);
      expect(nodes.edgeFade.value).toBeCloseTo(1);
      expect(nodes.noiseScale.value).toBeCloseTo(1 / 450);
      expect(nodes.timeSeconds.value).toBeCloseTo(0.75);
      expect(nodes.sunDirection.value.toArray()).toEqual(
        new THREE.Vector3(0.25, 1, 0.5).normalize().toArray()
      );
      expect(nodes.sunColor.value.getHex()).toBe(new THREE.Color(0.7, 0.8, 0.9).getHex());
    } finally {
      layer.dispose();
    }
  });

  it('lets Atmosphere forward an explicit cloud material factory without changing defaults', () => {
    const updates = [];
    const scene = new THREE.Scene();
    const atmo = new Atmosphere(scene, {
      enableClouds: true,
      attachFog: false,
      cloudFactory: () => ({
        material: new THREE.MeshBasicMaterial({ name: 'konveyor-atmosphere-cloud' }),
        controls: {
          update: (state) => updates.push(state.coverage),
        },
      }),
    });

    try {
      expect(atmo.cloudLayer.material.name).toBe('konveyor-atmosphere-cloud');
      expect(scene.children).toContain(atmo.cloudLayer.getMesh());
      atmo.cloudLayer.setCoverage(0.25);
      expect(updates.at(-1)).toBeCloseTo(0.25);
    } finally {
      atmo.dispose();
    }
  });

  it('keeps HosekWilkieSky on the WebGL ShaderMaterial path by default', () => {
    const sky = new HosekWilkieSky();
    try {
      expect(sky.material.name).toBe('HosekWilkieSky');
    } finally {
      sky.dispose();
    }
  });
});
