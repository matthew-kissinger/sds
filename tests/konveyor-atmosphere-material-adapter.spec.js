import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { Atmosphere } from '../js/atmosphere/Atmosphere.js';
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

  it('keeps HosekWilkieSky on the WebGL ShaderMaterial path by default', () => {
    const sky = new HosekWilkieSky();
    try {
      expect(sky.material.name).toBe('HosekWilkieSky');
    } finally {
      sky.dispose();
    }
  });
});
