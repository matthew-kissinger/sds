import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { Atmosphere } from '../js/atmosphere/Atmosphere.js';
import { CloudLayer } from '../js/atmosphere/CloudLayer.js';
import { HosekWilkieSky } from '../js/atmosphere/HosekWilkieSky.js';
import { SKY_PRESETS } from '../js/atmosphere/skyPresets.js';
import {
  createKonveyorAtmosphereMaterial,
  shouldApplyKonveyorAtmosphere,
} from '../js/atmosphere/konveyorAtmosphereMaterialAdapter.js';

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
