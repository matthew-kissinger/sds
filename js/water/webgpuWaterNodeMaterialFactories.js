// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { createWebGpuAnimeWaterNodeMaterial } from './webgpuAnimeWaterNodeMaterial.js';

const DEFAULT_WATER_COLORS = Object.freeze({
  shallowColor: [0.4353, 0.8431, 0.8235],
  deepColor: [0.0627, 0.2118, 0.3843],
  foamColor: [0.9176, 0.9647, 1],
  fogColor: [0.2933, 0.1629, 0.1348],
  sunColor: [1, 0.3055, 0.0242],
});

function toArray(value, fallback) {
  if (Array.isArray(value)) return value;
  return value?.toArray?.() ?? fallback;
}

export function createWebGpuWaterNodeMaterialFactories(webGpuModules, options = {}) {
  const waterDefaults = options.animeWater ?? {};

  return {
    createAnimeWaterMaterial: (context = {}) => {
      const heightTexture = context.heightTexture ?? waterDefaults.heightTexture ?? options.heightTexture;
      if (!heightTexture) return null;

      const heightfield = context.heightfield ?? {};
      const heightfieldTexture = context.heightfieldTexture ?? {};
      return createWebGpuAnimeWaterNodeMaterial(webGpuModules, {
        shallowColor: toArray(context.shallowColor ?? waterDefaults.shallowColor, DEFAULT_WATER_COLORS.shallowColor),
        deepColor: toArray(context.deepColor ?? waterDefaults.deepColor, DEFAULT_WATER_COLORS.deepColor),
        foamColor: toArray(context.foamColor ?? waterDefaults.foamColor, DEFAULT_WATER_COLORS.foamColor),
        fogColor: toArray(context.fogColor ?? waterDefaults.fogColor ?? options.fogColor, DEFAULT_WATER_COLORS.fogColor),
        sunColor: toArray(context.sunColor ?? waterDefaults.sunColor ?? options.sunColor, DEFAULT_WATER_COLORS.sunColor),
        sunColorSource: context.sunColorSource ?? waterDefaults.sunColorSource ?? options.sunColorSource ?? 'skyFog.sunColor',
        rippleStrength: context.rippleStrength ?? waterDefaults.rippleStrength ?? 1,
        sparkleStrength: context.sparkleStrength ?? waterDefaults.sparkleStrength ?? 0.7,
        sunSpecularIntensity: context.sunSpecularIntensity ?? waterDefaults.sunSpecularIntensity ?? options.sunSpecularIntensity ?? 0.6,
        broadGlintGain: context.broadGlintGain ?? waterDefaults.broadGlintGain ?? options.broadGlintGain,
        rippleGlintGain: context.rippleGlintGain ?? waterDefaults.rippleGlintGain ?? options.rippleGlintGain,
        fogStrength: context.fogStrength ?? waterDefaults.fogStrength ?? options.fogStrength,
        rippleLightScale: context.rippleLightScale ?? waterDefaults.rippleLightScale ?? options.rippleLightScale,
        colorTint: toArray(context.colorTint ?? waterDefaults.colorTint ?? options.colorTint, [1, 1, 1]),
        sunDirection: toArray(context.sunDirection ?? waterDefaults.sunDirection ?? options.sunDirection, [0.4, 0.6, 0.7]),
        colorScale: context.colorScale ?? waterDefaults.colorScale ?? options.colorScale ?? 1,
        foamScale: context.foamScale ?? waterDefaults.foamScale ?? options.foamScale ?? 1,
        foamThickness: context.foamThickness ?? waterDefaults.foamThickness ?? options.foamThickness ?? 2.5,
        sparkleScale: context.sparkleScale ?? waterDefaults.sparkleScale ?? options.sparkleScale ?? 1,
        shoreline: {
          center: toArray(context.shoreline?.center ?? waterDefaults.shoreline?.center, [0, 0]),
          radius: context.shoreline?.radius ?? waterDefaults.shoreline?.radius ?? 1,
          falloff: context.shoreline?.falloff ?? waterDefaults.shoreline?.falloff ?? 1,
        },
        heightfieldTexture: {
          worldSize: heightfield.worldSize ?? heightfieldTexture.worldSize ?? waterDefaults.worldSize ?? options.worldSize ?? 1,
          peakHeight: heightfield.peakHeight ?? heightfieldTexture.peakHeight ?? waterDefaults.peakHeight ?? options.peakHeight ?? 1,
          waterY: context.waterY ?? heightfieldTexture.waterY ?? waterDefaults.waterY ?? options.waterY ?? 0,
          hasHeightfield: context.hasHeightfield === false ? 0 : 1,
        },
      }, heightTexture);
    },
  };
}
