import { createKonveyorAnimeWaterNodeMaterial } from './konveyorAnimeWaterNodeMaterial.js';

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

export function createKonveyorWaterNodeMaterialFactories(webGpuModules, options = {}) {
  const waterDefaults = options.animeWater ?? {};

  return {
    createAnimeWaterMaterial: (context = {}) => {
      const heightTexture = context.heightTexture ?? waterDefaults.heightTexture ?? options.heightTexture;
      if (!heightTexture) return null;

      const heightfield = context.heightfield ?? {};
      const heightfieldTexture = context.heightfieldTexture ?? {};
      return createKonveyorAnimeWaterNodeMaterial(webGpuModules, {
        shallowColor: toArray(context.shallowColor ?? waterDefaults.shallowColor, DEFAULT_WATER_COLORS.shallowColor),
        deepColor: toArray(context.deepColor ?? waterDefaults.deepColor, DEFAULT_WATER_COLORS.deepColor),
        foamColor: toArray(context.foamColor ?? waterDefaults.foamColor, DEFAULT_WATER_COLORS.foamColor),
        fogColor: toArray(context.fogColor ?? waterDefaults.fogColor ?? options.fogColor, DEFAULT_WATER_COLORS.fogColor),
        sunColor: toArray(context.sunColor ?? waterDefaults.sunColor ?? options.sunColor, DEFAULT_WATER_COLORS.sunColor),
        rippleStrength: context.rippleStrength ?? waterDefaults.rippleStrength ?? 1,
        sparkleStrength: context.sparkleStrength ?? waterDefaults.sparkleStrength ?? 0.7,
        heightfieldTexture: {
          peakHeight: heightfield.peakHeight ?? heightfieldTexture.peakHeight ?? waterDefaults.peakHeight ?? options.peakHeight ?? 1,
          waterY: context.waterY ?? heightfieldTexture.waterY ?? waterDefaults.waterY ?? options.waterY ?? 0,
        },
      }, heightTexture);
    },
  };
}
