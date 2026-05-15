import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  createKonveyorEffectMaterial,
  shouldApplyKonveyorEffects,
} from '../js/effects/konveyorEffectMaterialAdapter.js';
import { SunBillboard } from '../js/effects/SunBillboard.js';

function defaultMaterial(name = 'default-effect') {
  return { name };
}

describe('konveyor effect material adapter', () => {
  it('requires the explicit WebGPU effects flag', () => {
    expect(shouldApplyKonveyorEffects('?renderer=webgpu&konveyorEffects=1')).toBe(true);
    expect(shouldApplyKonveyorEffects('?renderer=webgpu&diagnostic=1')).toBe(false);
    expect(shouldApplyKonveyorEffects('?renderer=webgl&konveyorEffects=1')).toBe(false);
    expect(shouldApplyKonveyorEffects('')).toBe(false);
  });

  it('keeps the sun billboard default material unless factories are explicitly supplied', () => {
    const disabled = createKonveyorEffectMaterial('sun-billboard', 'createSunBillboardMaterial', {
      createDefaultMaterial: () => defaultMaterial('default-sun'),
      search: '?renderer=webgpu',
      factories: {
        createSunBillboardMaterial: () => defaultMaterial('konveyor-sun'),
      },
    });

    expect(disabled.material.name).toBe('default-sun');
    expect(disabled.summary).toMatchObject({
      kind: 'sun-billboard',
      applied: false,
      reason: 'flag-disabled',
    });

    const missingFactory = createKonveyorEffectMaterial('sun-billboard', 'createSunBillboardMaterial', {
      createDefaultMaterial: () => defaultMaterial('default-sun'),
      search: '?renderer=webgpu&konveyorEffects=1',
    });

    expect(missingFactory.material.name).toBe('default-sun');
    expect(missingFactory.summary.reason).toBe('missing-factories');
  });

  it('uses explicit sun and portal factories on the WebGPU effect flag', () => {
    const sunUpdates = [];
    const portalUpdates = [];
    const factories = {
      createSunBillboardMaterial: () => ({
        material: { name: 'konveyor-sun' },
        controls: { update: (state) => sunUpdates.push(state) },
      }),
      createPortalRingMaterial: () => ({
        material: { name: 'konveyor-portal' },
        controls: { update: (state) => portalUpdates.push(state) },
      }),
    };

    const sun = createKonveyorEffectMaterial('sun-billboard', 'createSunBillboardMaterial', {
      createDefaultMaterial: () => defaultMaterial('default-sun'),
      search: '?renderer=webgpu&konveyorEffects=1',
      factories,
    });
    const portal = createKonveyorEffectMaterial('portal-ring', 'createPortalRingMaterial', {
      createDefaultMaterial: () => defaultMaterial('default-portal'),
      search: '?renderer=webgpu&konveyorEffects=1',
      factories,
    });

    expect(sun.material.name).toBe('konveyor-sun');
    expect(sun.summary).toMatchObject({
      kind: 'sun-billboard',
      applied: true,
      reason: null,
      hasControls: true,
    });
    expect(portal.material.name).toBe('konveyor-portal');
    expect(portal.summary).toMatchObject({
      kind: 'portal-ring',
      applied: true,
      reason: null,
      hasControls: true,
    });

    sun.controls.update({ intensity: 0.7 });
    portal.controls.update({ time: 1, pulse: 0.2, intensity: 0.8 });
    expect(sunUpdates).toEqual([{ intensity: 0.7 }]);
    expect(portalUpdates).toEqual([{ time: 1, pulse: 0.2, intensity: 0.8 }]);
  });

  it('routes SunBillboard material creation through the shared adapter', () => {
    const scene = new THREE.Scene();
    const updates = [];
    const konveyorMaterial = new THREE.MeshBasicMaterial({ name: 'konveyor-sun' });

    const sun = new SunBillboard(scene, {
      search: '?renderer=webgpu&konveyorEffects=1',
      konveyorEffectFactories: {
        createSunBillboardMaterial: () => ({
          material: konveyorMaterial,
          controls: { update: (state) => updates.push(state) },
        }),
      },
    });

    expect(sun.material).toBe(konveyorMaterial);
    expect(sun.konveyorMaterialSummary).toMatchObject({
      kind: 'sun-billboard',
      applied: true,
      reason: null,
      hasControls: true,
    });

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 10, 0);
    sun.update(camera, new THREE.Vector3(0, 1, 0), new THREE.Color(0.8, 0.7, 0.6));

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ intensity: 1 });
    expect(updates[0].haloColor).toBeInstanceOf(THREE.Color);
    expect(updates[0].coreColor).toBeInstanceOf(THREE.Color);

    sun.dispose();
  });
});
