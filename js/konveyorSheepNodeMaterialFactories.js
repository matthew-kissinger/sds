import { createKonveyorSheepWoolNodeMaterial } from './konveyorSheepNodeMaterial.js';

const DEFAULT_SHEEP = Object.freeze({
  bodyColor: [1, 1, 1],
  lightDirection: [0.3, 1, 0.5],
  rimColor: [1, 1, 1],
  sssColor: [1, 1, 0.98],
  fogColor: [0.8, 0.8, 0.8],
  fogNear: 18,
  fogFar: 92,
  woolNoiseScale: 0.78,
  woolDisplacementStrength: 0.065,
  breathingStrength: 0.012,
  animationSpeed: 1,
});

function toArray(value, fallback) {
  if (Array.isArray(value)) return value;
  return value?.toArray?.() ?? fallback;
}

export function createKonveyorSheepNodeMaterialFactories(webGpuModules, options = {}) {
  const sheepDefaults = options.sheepWool ?? {};

  return {
    createSheepMaterial: (context = {}) => {
      const colors = context.colors ?? {};
      const lighting = context.lighting ?? {};
      const wool = context.wool ?? {};
      const fog = context.fog ?? {};
      const material = context.material ?? {};

      return createKonveyorSheepWoolNodeMaterial(webGpuModules, {
        bodyColor: toArray(colors.body ?? context.bodyColor ?? sheepDefaults.bodyColor, DEFAULT_SHEEP.bodyColor),
        lightDirection: toArray(lighting.direction ?? context.lightDirection ?? sheepDefaults.lightDirection, DEFAULT_SHEEP.lightDirection),
        rimColor: toArray(lighting.rimColor ?? context.rimColor ?? sheepDefaults.rimColor, DEFAULT_SHEEP.rimColor),
        sssColor: toArray(lighting.sssColor ?? context.sssColor ?? sheepDefaults.sssColor, DEFAULT_SHEEP.sssColor),
        fogColor: toArray(fog.color ?? context.fogColor ?? sheepDefaults.fogColor ?? options.fogColor, DEFAULT_SHEEP.fogColor),
        fogNear: fog.near ?? context.fogNear ?? sheepDefaults.fogNear ?? options.fogNear ?? DEFAULT_SHEEP.fogNear,
        fogFar: fog.far ?? context.fogFar ?? sheepDefaults.fogFar ?? options.fogFar ?? DEFAULT_SHEEP.fogFar,
        woolNoiseScale: wool.noiseScale ?? context.woolNoiseScale ?? sheepDefaults.woolNoiseScale ?? DEFAULT_SHEEP.woolNoiseScale,
        woolDisplacementStrength: wool.displacementStrength ?? context.woolDisplacementStrength ?? sheepDefaults.woolDisplacementStrength ?? DEFAULT_SHEEP.woolDisplacementStrength,
        breathingStrength: wool.breathingStrength ?? context.breathingStrength ?? sheepDefaults.breathingStrength ?? DEFAULT_SHEEP.breathingStrength,
        animationSpeed: wool.animationSpeed ?? context.animationSpeed ?? sheepDefaults.animationSpeed ?? DEFAULT_SHEEP.animationSpeed,
        vertexColors: material.vertexColors ?? context.vertexColors ?? sheepDefaults.vertexColors ?? true,
        fog: material.fog ?? context.fogEnabled ?? sheepDefaults.fog ?? false,
      });
    },
  };
}
