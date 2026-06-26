// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { createWebGpuGrassBladeNodeMaterial } from './webgpuGrassBladeNodeMaterial.js';
import { createWebGpuMeadowQuadNodeMaterial } from './webgpuMeadowQuadNodeMaterial.js';

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

export function createWebGpuGrassNodeMaterialFactories(webGpuModules, options = {}) {
  const meadowDefaults = options.meadowQuad ?? {};
  const bladeDefaults = options.grassBlade ?? {};

  return {
    createMeadowQuadMaterial: (context = {}) =>
      createWebGpuMeadowQuadNodeMaterial(webGpuModules, {
        baseColor: colorValue(context.baseColor, meadowDefaults.baseColor, DEFAULT_GRASS_COLORS.baseColor),
        midColor: colorValue(context.midColor, meadowDefaults.midColor, DEFAULT_GRASS_COLORS.midColor),
        tipColor: colorValue(context.tipColor, meadowDefaults.tipColor, DEFAULT_GRASS_COLORS.tipColor),
        colorTint: colorValue(context.colorTint, meadowDefaults.colorTint ?? options.colorTint, [1, 1, 1]),
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
      const sheepInteractionRadius = interaction.sheepRadius ?? context.sheepInteractionRadius ?? bladeDefaults.sheepInteractionRadius ?? 2.5;
      const sheepInteractionStrength = interaction.sheepStrength ?? context.sheepInteractionStrength ?? bladeDefaults.sheepInteractionStrength ?? 0.4;
      const interactionRadiusScale = context.isMobile ? 2.0 : 1.6;
      const interactionStrengthScale = context.isMobile ? 1.55 : 1.25;
      // Cycle 55: unified body-footprint extents. Fall back to the prior
      // hardcoded node values when a caller does not supply them, so existing
      // factory-default callers (and their tests) are unaffected.
      const dogHalfLen = interaction.dogHalfLen ?? context.dogHalfLen ?? bladeDefaults.dogHalfLen ?? 1.65;
      const sheepHalfLen = interaction.sheepHalfLen ?? context.sheepHalfLen ?? bladeDefaults.sheepHalfLen ?? 0.72;
      const dogHalfWidth = interaction.dogHalfWid ?? context.dogHalfWidth ?? bladeDefaults.dogHalfWidth ?? 0.78;
      const sheepHalfWidth = interaction.sheepHalfWid ?? context.sheepHalfWidth ?? bladeDefaults.sheepHalfWidth ?? 0.56;

      return createWebGpuGrassBladeNodeMaterial(webGpuModules, {
        computeCull: context.computeCull ?? null, // Cycle 81 Path 1: consolidated compute-cull instance remap
        baseColor: colorValue(colors.baseColor, context.baseColor ?? bladeDefaults.baseColor, DEFAULT_GRASS_COLORS.baseColor),
        midColor: colorValue(colors.midColor, context.midColor ?? bladeDefaults.midColor, DEFAULT_GRASS_COLORS.midColor),
        tipColor: colorValue(colors.tipColor, context.tipColor ?? bladeDefaults.tipColor, DEFAULT_GRASS_COLORS.tipColor),
        colorTint: colorValue(context.colorTint, bladeDefaults.colorTint ?? options.colorTint, [1, 1, 1]),
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
        dogHalfLen,
        sheepHalfLen,
        dogHalfWidth,
        sheepHalfWidth,
        interactionVisualScale: interaction.visualScale
          ?? context.interactionVisualScale
          ?? bladeDefaults.interactionVisualScale
          ?? (context.isMobile ? 6.8 : 6.4),
        interactionLaydownStrength: interaction.laydownStrength
          ?? context.interactionLaydownStrength
          ?? bladeDefaults.interactionLaydownStrength
          ?? (context.isMobile ? 0.95 : 0.85),
        interactionMaxDisplacement: interaction.maxDisplacement
          ?? context.interactionMaxDisplacement
          ?? bladeDefaults.interactionMaxDisplacement,
        interactionShadowStrength: interaction.shadowStrength
          ?? context.interactionShadowStrength
          ?? bladeDefaults.interactionShadowStrength
          ?? (context.isMobile ? 0.26 : 0.22),
        maxNodeInteractors: context.tier === 'high'
          ? Math.min(interaction.maxInteractors ?? 8, 8)
          : Math.min(interaction.maxInteractors ?? 4, 4),
        fogColor: toArray(fog.color ?? context.fogColor ?? bladeDefaults.fogColor ?? options.fogColor, DEFAULT_FOG_COLOR),
        fogNear: fog.near ?? context.fogNear ?? bladeDefaults.fogNear ?? options.fogNear ?? 18,
        fogFar: fog.far ?? context.fogFar ?? bladeDefaults.fogFar ?? options.fogFar ?? 74,
        fogStrength: fog.strength ?? context.fogStrength ?? bladeDefaults.fogStrength ?? options.fogStrength,
        backlightStrength: lighting.backlightStrength ?? context.backlightStrength ?? bladeDefaults.backlightStrength ?? options.backlightStrength,
        rimStrength: lighting.rimStrength ?? context.rimStrength ?? bladeDefaults.rimStrength ?? options.rimStrength,
        hueVariation: context.hueVariation ?? bladeDefaults.hueVariation ?? options.hueVariation,
        viewBacklightStrength: lighting.viewBacklightStrength
          ?? context.viewBacklightStrength
          ?? bladeDefaults.viewBacklightStrength
          ?? options.viewBacklightStrength,
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
