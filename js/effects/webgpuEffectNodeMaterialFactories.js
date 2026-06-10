// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import {
  createWebGpuPortalPadNodeMaterial,
  createWebGpuPortalParticleNodeMaterial,
  createWebGpuPortalRingNodeMaterial,
} from './webgpuPortalNodeMaterial.js';
import { createWebGpuSunBillboardNodeMaterial } from './webgpuSunNodeMaterial.js';
import {
  createWebGpuCorralZapBoltNodeMaterial,
  createWebGpuCorralZapParticleNodeMaterial,
} from './webgpuZapNodeMaterial.js';

function mergeDefined(defaults, context, keys) {
  const result = { ...defaults };
  for (const key of keys) {
    if (context?.[key] !== undefined) {
      result[key] = context[key];
    }
  }
  return result;
}

function toArray(value, fallback) {
  if (Array.isArray(value)) return value;
  return value?.toArray?.() ?? fallback;
}

function withOpacityControls(material, computeOpacity) {
  const opacityUniform = material.userData?.webgpuOpacityUniform ?? null;
  const controls = {
    update(state = {}) {
      const opacity = computeOpacity(state);
      if (opacityUniform) opacityUniform.value = opacity;
      material.opacity = opacity;
      if (state.material?.opacity !== undefined) {
        state.material.opacity = opacity;
      }
    },
  };
  return { material, controls };
}

export function createWebGpuEffectNodeMaterialFactories(webGpuModules, options = {}) {
  const sun = options.sun ?? {};
  const portal = options.portal ?? {};
  const zap = options.zap ?? {};

  return {
    createSunBillboardMaterial: (context = {}) => {
      const material = createWebGpuSunBillboardNodeMaterial(
        webGpuModules,
        mergeDefined(sun, context, [
          'depthTest',
          'blending',
          'intensity',
          'coreRadius',
          'coreFeather',
          'hotCoreRadius',
          'hotCoreFeather',
          'hotCoreColor',
          'hotCoreGain',
          'bodyGain',
          'bodyOpacity',
          'bodyColor',
          'hotCoreOpacity',
          'coreColor',
        ])
      );
      const intensityUniform = material.userData?.webgpuIntensityUniform ?? null;
      const coreColorUniform = material.userData?.webgpuCoreColorUniform ?? null;
      return {
        material,
        controls: {
          update(state = {}) {
            if (Number.isFinite(state.intensity) && intensityUniform) {
              intensityUniform.value = state.intensity;
            }
            copyNodeValue(coreColorUniform, state.coreColor);
          },
        },
      };
    },
    createPortalRingMaterial: (context = {}) => {
      const material = createWebGpuPortalRingNodeMaterial(
        webGpuModules,
        mergeDefined(portal, context, ['depthTest', 'side', 'blending', 'intensity'])
      );
      return {
        material,
        controls: {
          update(state = {}) {
            const data = material.userData;
            if (Number.isFinite(state.time)) data.webgpuTimeUniform.value = state.time;
            if (Number.isFinite(state.pulse)) data.webgpuPulseUniform.value = state.pulse;
            if (Number.isFinite(state.intensity)) data.webgpuIntensityUniform.value = state.intensity;
          },
        },
      };
    },
    createPortalPadMaterial: (context = {}) => {
      const material = createWebGpuPortalPadNodeMaterial(webGpuModules, {
        ...portal.pad,
        color: toArray(context.color ?? portal.pad?.color, [0.424, 0.949, 1.0]),
        opacity: context.opacity ?? portal.pad?.opacity ?? 0.18,
        depthWrite: context.depthWrite ?? portal.pad?.depthWrite ?? false,
        blending: context.blending ?? portal.pad?.blending,
      });
      const baseOpacity = material.userData.webgpuBaseOpacity;
      return withOpacityControls(material, (state = {}) => {
        const intensity = Number.isFinite(state.intensity) ? state.intensity : 1;
        const pulse = Number.isFinite(state.pulse) ? state.pulse : 0;
        return Math.max(0, Math.min(1, baseOpacity * (0.45 + intensity * 0.55 + pulse * 0.35)));
      });
    },
    createPortalParticleMaterial: (context = {}) => {
      const material = createWebGpuPortalParticleNodeMaterial(webGpuModules, {
        ...portal.particles,
        color: toArray(context.color ?? portal.particles?.color, [0.722, 0.91, 1.0]),
        size: context.size ?? portal.particles?.size ?? 0.5,
        opacity: context.opacity ?? portal.particles?.opacity ?? 0.9,
        depthWrite: context.depthWrite ?? portal.particles?.depthWrite ?? false,
        sizeAttenuation: context.sizeAttenuation ?? portal.particles?.sizeAttenuation ?? true,
        blending: context.blending ?? portal.particles?.blending,
      });
      const baseOpacity = material.userData.webgpuBaseOpacity;
      return withOpacityControls(material, (state = {}) => {
        const intensity = Number.isFinite(state.intensity) ? state.intensity : 1;
        const pulse = Number.isFinite(state.pulse) ? state.pulse : 0;
        return Math.max(0, Math.min(1, baseOpacity * (0.25 + intensity * 0.75 + pulse * 0.25)));
      });
    },
    createCorralZapBoltMaterial: (context = {}) => {
      const material = createWebGpuCorralZapBoltNodeMaterial(webGpuModules, {
        ...zap.bolt,
        color: toArray(context.color ?? zap.bolt?.color, [0.918, 1.0, 1.0]),
        opacity: context.opacity ?? zap.bolt?.opacity ?? 0,
        linewidth: context.linewidth ?? zap.bolt?.linewidth ?? 2,
        depthWrite: context.depthWrite ?? zap.bolt?.depthWrite ?? false,
      });
      return withOpacityControls(material, (state = {}) =>
        Math.max(0, Math.min(1, Number.isFinite(state.opacity) ? state.opacity : material.opacity))
      );
    },
    createCorralZapParticleMaterial: (context = {}) => {
      const material = createWebGpuCorralZapParticleNodeMaterial(webGpuModules, {
        ...zap.particles,
        color: toArray(context.color ?? zap.particles?.color, [0.784, 0.937, 1.0]),
        size: context.size ?? zap.particles?.size ?? 0.6,
        opacity: context.opacity ?? zap.particles?.opacity ?? 0,
        depthWrite: context.depthWrite ?? zap.particles?.depthWrite ?? false,
        sizeAttenuation: context.sizeAttenuation ?? zap.particles?.sizeAttenuation ?? true,
      });
      return withOpacityControls(material, (state = {}) =>
        Math.max(0, Math.min(1, Number.isFinite(state.opacity) ? state.opacity : material.opacity))
      );
    },
  };
}

function copyNodeValue(node, value) {
  if (!node?.value || !value || typeof node.value.copy !== 'function') return;
  node.value.copy(value);
}
