import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  AdditiveBlending,
  DoubleSide,
  LineBasicNodeMaterial,
  MeshBasicNodeMaterial,
  NormalBlending,
  PointsNodeMaterial,
  TSL,
} from 'three/webgpu';

import {
  createKonveyorEffectMaterial,
  shouldApplyKonveyorEffects,
} from '../js/effects/konveyorEffectMaterialAdapter.js';
import { createKonveyorEffectNodeMaterialFactories } from '../js/effects/konveyorEffectNodeMaterialFactories.js';
import { SunBillboard } from '../js/effects/SunBillboard.js';
import { PortalEffect } from '../js/effects/PortalEffect.js';
import { CorralZapEffectPool } from '../js/effects/CorralZapEffect.js';

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

  it('can route production effects through reusable WebGPU node material candidates', () => {
    const factories = createKonveyorEffectNodeMaterialFactories(
      { MeshBasicNodeMaterial, PointsNodeMaterial, LineBasicNodeMaterial, AdditiveBlending, NormalBlending, DoubleSide, TSL },
      {
        sun: { depthTest: true },
        portal: { depthTest: true },
      }
    );
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
    const pad = createKonveyorEffectMaterial('portal-pad', 'createPortalPadMaterial', {
      createDefaultMaterial: () => defaultMaterial('default-pad'),
      search: '?renderer=webgpu&konveyorEffects=1',
      factories,
      context: {
        color: new THREE.Color(0x6cf2ff),
        opacity: 0.18,
        depthWrite: false,
      },
    });
    const portalParticles = createKonveyorEffectMaterial('portal-particles', 'createPortalParticleMaterial', {
      createDefaultMaterial: () => defaultMaterial('default-portal-particles'),
      search: '?renderer=webgpu&konveyorEffects=1',
      factories,
      context: {
        color: new THREE.Color(0xb8e8ff),
        size: 0.5,
        opacity: 0.9,
        depthWrite: false,
      },
    });
    const zapBolt = createKonveyorEffectMaterial('corral-zap-bolt', 'createCorralZapBoltMaterial', {
      createDefaultMaterial: () => defaultMaterial('default-zap-bolt'),
      search: '?renderer=webgpu&konveyorEffects=1',
      factories,
      context: {
        color: new THREE.Color(0xeaffff),
        opacity: 0,
        linewidth: 2,
        depthWrite: false,
      },
    });
    const zapParticles = createKonveyorEffectMaterial('corral-zap-particles', 'createCorralZapParticleMaterial', {
      createDefaultMaterial: () => defaultMaterial('default-zap-particles'),
      search: '?renderer=webgpu&konveyorEffects=1',
      factories,
      context: {
        color: new THREE.Color(0xc8efff),
        size: 0.6,
        opacity: 0,
        depthWrite: false,
      },
    });

    try {
      expect(sun.material.name).toBe('konveyor-node-sun-billboard');
      expect(sun.material.isNodeMaterial).toBe(true);
      expect(sun.material.isMeshBasicNodeMaterial).toBe(true);
      expect(sun.material.transparent).toBe(true);
      expect(sun.material.depthWrite).toBe(false);
      expect(sun.material.depthTest).toBe(true);
      expect(sun.material.blending).toBe(THREE.AdditiveBlending);
      expect(sun.material.colorNode).toBeTruthy();
      expect(sun.material.opacityNode).toBeTruthy();
      expect(sun.material.userData.konveyorSunBillboardOwnership).toMatchObject({
        owns: 'disc-body-only',
        skyOwns: 'painted-sun-body-aureole-and-horizon-glow',
      });
      expect(sun.summary).toMatchObject({ kind: 'sun-billboard', applied: true, hasControls: true });

      expect(portal.material.name).toBe('konveyor-node-portal-ring');
      expect(portal.material.isNodeMaterial).toBe(true);
      expect(portal.material.isMeshBasicNodeMaterial).toBe(true);
      expect(portal.material.transparent).toBe(true);
      expect(portal.material.depthWrite).toBe(false);
      expect(portal.material.depthTest).toBe(true);
      expect(portal.material.side).toBe(THREE.DoubleSide);
      expect(portal.material.blending).toBe(THREE.AdditiveBlending);
      expect(portal.material.colorNode).toBeTruthy();
      expect(portal.material.opacityNode).toBeTruthy();
      expect(portal.summary).toMatchObject({ kind: 'portal-ring', applied: true, hasControls: true });

      expect(pad.material.name).toBe('konveyor-node-portal-pad');
      expect(pad.material.isNodeMaterial).toBe(true);
      expect(pad.material.transparent).toBe(true);
      expect(pad.material.depthWrite).toBe(false);
      expect(pad.material.blending).toBe(THREE.AdditiveBlending);
      expect(pad.material.opacityNode).toBeTruthy();
      expect(pad.summary).toMatchObject({ kind: 'portal-pad', applied: true, hasControls: true });

      expect(portalParticles.material.name).toBe('konveyor-node-portal-particles');
      expect(portalParticles.material.isNodeMaterial).toBe(true);
      expect(portalParticles.material.transparent).toBe(true);
      expect(portalParticles.material.depthWrite).toBe(false);
      expect(portalParticles.material.blending).toBe(THREE.AdditiveBlending);
      expect(portalParticles.material.opacityNode).toBeTruthy();
      expect(portalParticles.summary).toMatchObject({ kind: 'portal-particles', applied: true, hasControls: true });

      expect(zapBolt.material.name).toBe('konveyor-node-corral-zap-bolt');
      expect(zapBolt.material.isNodeMaterial).toBe(true);
      expect(zapBolt.material.transparent).toBe(true);
      expect(zapBolt.material.depthWrite).toBe(false);
      expect(zapBolt.material.opacityNode).toBeTruthy();
      expect(zapBolt.summary).toMatchObject({ kind: 'corral-zap-bolt', applied: true, hasControls: true });

      expect(zapParticles.material.name).toBe('konveyor-node-corral-zap-particles');
      expect(zapParticles.material.isNodeMaterial).toBe(true);
      expect(zapParticles.material.transparent).toBe(true);
      expect(zapParticles.material.depthWrite).toBe(false);
      expect(zapParticles.material.opacityNode).toBeTruthy();
      expect(zapParticles.summary).toMatchObject({ kind: 'corral-zap-particles', applied: true, hasControls: true });

      pad.controls.update({ intensity: 1, pulse: 1, material: pad.material });
      zapBolt.controls.update({ opacity: 0.5, material: zapBolt.material });
      expect(pad.material.opacity).toBeGreaterThan(0.18);
      expect(zapBolt.material.opacity).toBe(0.5);
    } finally {
      sun.material.dispose?.();
      portal.material.dispose?.();
      pad.material.dispose?.();
      portalParticles.material.dispose?.();
      zapBolt.material.dispose?.();
      zapParticles.material.dispose?.();
    }
  });

  it('passes effect material context into explicit factories', () => {
    const contexts = [];
    const result = createKonveyorEffectMaterial('portal-pad', 'createPortalPadMaterial', {
      createDefaultMaterial: () => defaultMaterial('default-pad'),
      search: '?renderer=webgpu&konveyorEffects=1',
      factories: {
        createPortalPadMaterial: (context) => {
          contexts.push(context);
          return defaultMaterial('konveyor-pad');
        },
      },
      context: {
        opacity: 0.18,
        radius: 3.99,
      },
    });

    expect(result.material.name).toBe('konveyor-pad');
    expect(contexts).toEqual([{ opacity: 0.18, radius: 3.99 }]);
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
    expect(updates[0]).toMatchObject({ intensity: 2.2 });
    expect(updates[0].coreColor).toBeInstanceOf(THREE.Color);
    expect(updates[0].haloColor).toBeUndefined();
    expect(sun.getDiagnostics()).toMatchObject({
      size: 720,
      distance: 3000,
      intensity: 2.2,
      materialName: 'konveyor-sun',
      applied: true,
    });

    sun.dispose();
  });

  it('routes PortalEffect pad and particle materials through the shared adapter', () => {
    const scene = new THREE.Scene();
    const padContexts = [];
    const particleContexts = [];
    const padUpdates = [];
    const particleUpdates = [];
    const padMaterial = new THREE.MeshBasicMaterial({ name: 'konveyor-portal-pad' });
    const particleMaterial = new THREE.PointsMaterial({ name: 'konveyor-portal-particles' });

    const portal = new PortalEffect(scene, { x: 2, z: 3 }, 0.4, {
      search: '?renderer=webgpu&konveyorEffects=1',
      konveyorEffectFactories: {
        createPortalPadMaterial: (context) => {
          padContexts.push(context);
          return {
            material: padMaterial,
            controls: { update: (state) => padUpdates.push(state) },
          };
        },
        createPortalParticleMaterial: (context) => {
          particleContexts.push(context);
          return {
            material: particleMaterial,
            controls: { update: (state) => particleUpdates.push(state) },
          };
        },
      },
    });

    try {
      expect(portal.pad.material).toBe(padMaterial);
      expect(portal.particles.material).toBe(particleMaterial);
      expect(portal.konveyorPadMaterialSummary).toMatchObject({
        kind: 'portal-pad',
        applied: true,
      });
      expect(portal.konveyorParticleMaterialSummary).toMatchObject({
        kind: 'portal-particles',
        applied: true,
      });
      expect(padContexts[0]).toMatchObject({
        opacity: 0.18,
      });
      expect(padContexts[0].radius).toBeCloseTo(3.99, 12);
      expect(padContexts[0].color).toBeInstanceOf(THREE.Color);
      expect(particleContexts[0]).toMatchObject({
        size: 0.5,
        opacity: 0.9,
        particleCount: 96,
        columnHeight: 22,
        columnRadius: 1.2,
        riseSpeed: 6.5,
      });
      expect(particleContexts[0].color).toBeInstanceOf(THREE.Color);

      portal.update(0.016);
      expect(padUpdates).toHaveLength(1);
      expect(particleUpdates).toHaveLength(1);
      expect(padUpdates[0].material).toBe(padMaterial);
      expect(particleUpdates[0].material).toBe(particleMaterial);
    } finally {
      portal.dispose();
    }
  });

  it('routes corral zap bolt and particle materials through the shared adapter', () => {
    const scene = new THREE.Scene();
    const boltContexts = [];
    const particleContexts = [];
    const boltUpdates = [];
    const particleUpdates = [];
    const boltMaterial = new THREE.LineBasicMaterial({ name: 'konveyor-zap-bolt' });
    const particleMaterial = new THREE.PointsMaterial({ name: 'konveyor-zap-particles' });

    const pool = new CorralZapEffectPool(scene, {
      search: '?renderer=webgpu&konveyorEffects=1',
      konveyorEffectFactories: {
        createCorralZapBoltMaterial: (context) => {
          boltContexts.push(context);
          return {
            material: boltMaterial,
            controls: { update: (state) => boltUpdates.push(state) },
          };
        },
        createCorralZapParticleMaterial: (context) => {
          particleContexts.push(context);
          return {
            material: particleMaterial,
            controls: { update: (state) => particleUpdates.push(state) },
          };
        },
      },
    });

    try {
      expect(boltContexts.length).toBeGreaterThan(0);
      expect(particleContexts.length).toBe(boltContexts.length);
      expect(boltContexts[0]).toMatchObject({
        opacity: 0,
        linewidth: 2,
        boltSegments: 14,
        boltHeight: 60,
        boltJitter: 1,
      });
      expect(boltContexts[0].color).toBeInstanceOf(THREE.Color);
      expect(particleContexts[0]).toMatchObject({
        size: 0.6,
        opacity: 0,
        particleCount: 36,
        particleSpeed: 8,
        particleGravity: -8,
      });
      expect(particleContexts[0].color).toBeInstanceOf(THREE.Color);

      pool.fire({ x: 1, y: 0.2, z: -2 });
      pool.update(0.05);

      expect(boltUpdates.some((state) => state.opacity === 1)).toBe(true);
      expect(particleUpdates.some((state) => state.opacity === 1)).toBe(true);
      expect(boltUpdates.every((state) => state.material === boltMaterial)).toBe(true);
      expect(particleUpdates.every((state) => state.material === particleMaterial)).toBe(true);
    } finally {
      pool.dispose();
    }
  });
});
