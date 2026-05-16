import { createKonveyorGrassBladeNodeMaterial } from './konveyorGrassBladeNodeMaterial.js';
import { createKonveyorMeadowQuadNodeMaterial } from './konveyorMeadowQuadNodeMaterial.js';

const DEFAULT_GRASS_COLORS = Object.freeze({
  baseColor: [0.08, 0.28, 0.04],
  midColor: [0.18, 0.48, 0.12],
  tipColor: [0.55, 0.82, 0.30],
});

const DEFAULT_FOG_COLOR = Object.freeze([0.2933, 0.1629, 0.1348]);
const DEFAULT_SUN_COLOR = Object.freeze([1, 1, 1]);
const DEFAULT_SUN_DIRECTION = Object.freeze([0, 1, 0]);
const DEFAULT_WIND_DIRECTION = Object.freeze([0.7, 0.7]);

function toArray(value, fallback) {
  if (Array.isArray(value)) return value;
  return value?.toArray?.() ?? fallback;
}

function colorValue(contextColor, directColor, defaultColor) {
  return toArray(contextColor ?? directColor, defaultColor);
}

export function createKonveyorGrassNodeMaterialFactories(webGpuModules, options = {}) {
  const meadowDefaults = options.meadowQuad ?? {};
  const bladeDefaults = options.grassBlade ?? {};

  return {
    createMeadowQuadMaterial: (context = {}) =>
      createKonveyorMeadowQuadNodeMaterial(webGpuModules, {
        baseColor: colorValue(context.baseColor, meadowDefaults.baseColor, DEFAULT_GRASS_COLORS.baseColor),
        midColor: colorValue(context.midColor, meadowDefaults.midColor, DEFAULT_GRASS_COLORS.midColor),
        tipColor: colorValue(context.tipColor, meadowDefaults.tipColor, DEFAULT_GRASS_COLORS.tipColor),
        uvCellsPerChunk: context.uvCellsPerChunk ?? meadowDefaults.uvCellsPerChunk ?? 5,
        noiseHashVector: context.noiseHashVector ?? meadowDefaults.noiseHashVector ?? [127.1, 311.7],
        fogColor: toArray(context.fog?.color ?? context.fogColor ?? meadowDefaults.fogColor ?? options.fogColor, DEFAULT_FOG_COLOR),
        fogNear: context.fog?.near ?? context.fogNear ?? meadowDefaults.fogNear ?? options.fogNear ?? 18,
        fogFar: context.fog?.far ?? context.fogFar ?? meadowDefaults.fogFar ?? options.fogFar ?? 74,
        fogStrength: context.fog?.strength ?? context.fogStrength ?? meadowDefaults.fogStrength ?? options.fogStrength ?? 0.55,
        colorScale: context.colorScale ?? meadowDefaults.colorScale ?? options.colorScale ?? 1,
      }),
    createGrassBladeMaterial: (context = {}) => {
      const colors = context.colors ?? {};
      const wind = context.wind ?? {};
      const geometry = context.geometry ?? {};
      const lighting = context.lighting ?? {};
      const interaction = context.interaction ?? {};
      const fade = context.fade ?? {};
      const material = context.material ?? {};
      const fog = context.fog ?? {};

      const interactionRadius = interaction.radius ?? context.interactionRadius ?? bladeDefaults.interactionRadius ?? 2.2;
      const interactionStrength = interaction.strength ?? context.interactionStrength ?? bladeDefaults.interactionStrength ?? 0.6;
      const sheepInteractionRadius = interaction.sheepRadius ?? context.sheepInteractionRadius ?? bladeDefaults.sheepInteractionRadius ?? 1.25;
      const sheepInteractionStrength = interaction.sheepStrength ?? context.sheepInteractionStrength ?? bladeDefaults.sheepInteractionStrength ?? 0.38;
      const interactionRadiusScale = context.isMobile ? 1.75 : 1.2;
      const interactionStrengthScale = context.isMobile ? 1.55 : 1.25;

      return createKonveyorGrassBladeNodeMaterial(webGpuModules, {
        baseColor: colorValue(colors.baseColor, context.baseColor ?? bladeDefaults.baseColor, DEFAULT_GRASS_COLORS.baseColor),
        midColor: colorValue(colors.midColor, context.midColor ?? bladeDefaults.midColor, DEFAULT_GRASS_COLORS.midColor),
        tipColor: colorValue(colors.tipColor, context.tipColor ?? bladeDefaults.tipColor, DEFAULT_GRASS_COLORS.tipColor),
        windDirection: toArray(wind.direction ?? context.windDirection ?? bladeDefaults.windDirection, DEFAULT_WIND_DIRECTION),
        windStrength: wind.strength ?? context.windStrength ?? bladeDefaults.windStrength ?? 0,
        windSpeed: wind.speed ?? context.windSpeed ?? bladeDefaults.windSpeed ?? 0,
        gustStrength: wind.gustStrength ?? context.gustStrength ?? bladeDefaults.gustStrength ?? 0,
        tipDampen: context.tipDampen ?? bladeDefaults.tipDampen ?? options.tipDampen,
        bladeHeight: geometry.bladeHeight ?? context.bladeHeight ?? bladeDefaults.bladeHeight ?? 1,
        grassFadeStart: fade.start ?? context.grassFadeStart ?? bladeDefaults.grassFadeStart ?? 70,
        grassFadeEnd: fade.end ?? context.grassFadeEnd ?? bladeDefaults.grassFadeEnd ?? 260,
        distanceFadeStrength: fade.strength ?? context.distanceFadeStrength ?? bladeDefaults.distanceFadeStrength ?? 1,
        sunColor: toArray(lighting.sunColor ?? context.sunColor ?? bladeDefaults.sunColor, DEFAULT_SUN_COLOR),
        sunDirection: toArray(lighting.sunDirection ?? context.sunDirection ?? bladeDefaults.sunDirection, DEFAULT_SUN_DIRECTION),
        interactionRadius: interactionRadius * interactionRadiusScale,
        interactionStrength: interactionStrength * interactionStrengthScale,
        sheepInteractionRadius: sheepInteractionRadius * interactionRadiusScale,
        sheepInteractionStrength: sheepInteractionStrength * interactionStrengthScale,
        interactionVisualScale: interaction.visualScale
          ?? context.interactionVisualScale
          ?? bladeDefaults.interactionVisualScale
          ?? (context.isMobile ? 3.4 : 3.2),
        interactionLaydownStrength: interaction.laydownStrength
          ?? context.interactionLaydownStrength
          ?? bladeDefaults.interactionLaydownStrength
          ?? (context.isMobile ? 1.05 : 1.0),
        interactionShadowStrength: interaction.shadowStrength
          ?? context.interactionShadowStrength
          ?? bladeDefaults.interactionShadowStrength
          ?? (context.isMobile ? 0.52 : 0.48),
        maxNodeInteractors: context.tier === 'high'
          ? Math.min(interaction.maxInteractors ?? 8, 8)
          : Math.min(interaction.maxInteractors ?? 4, 4),
        fogColor: toArray(fog.color ?? context.fogColor ?? bladeDefaults.fogColor ?? options.fogColor, DEFAULT_FOG_COLOR),
        fogNear: fog.near ?? context.fogNear ?? bladeDefaults.fogNear ?? options.fogNear ?? 18,
        fogFar: fog.far ?? context.fogFar ?? bladeDefaults.fogFar ?? options.fogFar ?? 74,
        colorScale: context.colorScale ?? bladeDefaults.colorScale ?? options.colorScale ?? 1,
        alphaHash: material.alphaHash ?? context.alphaHash ?? bladeDefaults.alphaHash ?? true,
        alphaTest: material.alphaTest ?? context.alphaTest ?? bladeDefaults.alphaTest ?? 0.06,
        side: material.side ?? context.side ?? bladeDefaults.side,
        transparent: material.transparent ?? context.transparent ?? bladeDefaults.transparent ?? false,
        depthWrite: material.depthWrite ?? context.depthWrite ?? bladeDefaults.depthWrite ?? true,
        depthTest: material.depthTest ?? context.depthTest ?? bladeDefaults.depthTest ?? true,
      });
    },
  };
}
