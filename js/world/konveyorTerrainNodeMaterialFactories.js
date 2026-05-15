import { createKonveyorTerrainHeightfieldNodeMaterial } from './konveyorTerrainNodeMaterial.js';

const DEFAULT_TERRAIN_COLORS = Object.freeze({
  lowColor: [0.29, 0.38, 0.18],
  midColor: [0.43, 0.55, 0.25],
  highColor: [0.56, 0.53, 0.42],
  fogColor: [0.2933, 0.1629, 0.1348],
});

function toArray(value, fallback) {
  if (Array.isArray(value)) return value;
  return value?.toArray?.() ?? fallback;
}

export function createKonveyorTerrainNodeMaterialFactories(webGpuModules, options = {}) {
  const terrainDefaults = options.terrain ?? {};

  return {
    createTerrainMaterial: (context = {}) => {
      const createHeightTexture = context.createHeightTexture ?? terrainDefaults.createHeightTexture ?? options.createHeightTexture;
      const heightTexture = context.heightTexture ?? terrainDefaults.heightTexture ?? options.heightTexture ?? createHeightTexture?.();
      if (!heightTexture) return null;

      const colors = context.colors ?? {};
      const heightfield = context.heightfield ?? {};
      const polygonOffset = context.polygonOffset ?? terrainDefaults.polygonOffset ?? options.polygonOffset;
      const material = createKonveyorTerrainHeightfieldNodeMaterial(webGpuModules, {
        lowColor: toArray(colors.baseColor1 ?? context.lowColor ?? terrainDefaults.lowColor, DEFAULT_TERRAIN_COLORS.lowColor),
        midColor: toArray(colors.baseColor2 ?? context.midColor ?? terrainDefaults.midColor, DEFAULT_TERRAIN_COLORS.midColor),
        highColor: toArray(colors.baseColor3 ?? context.highColor ?? terrainDefaults.highColor, DEFAULT_TERRAIN_COLORS.highColor),
        fogColor: toArray(context.fogColor ?? terrainDefaults.fogColor ?? options.fogColor, DEFAULT_TERRAIN_COLORS.fogColor),
        peakHeight: heightfield.peakHeight ?? context.peakHeight ?? terrainDefaults.peakHeight ?? options.peakHeight ?? 1,
        side: context.side ?? terrainDefaults.side ?? options.side,
        polygonOffset,
      }, heightTexture);
      material.userData.heightTexture = heightTexture;
      return material;
    },
  };
}
