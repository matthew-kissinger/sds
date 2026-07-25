// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { createWebGpuTerrainHeightfieldNodeMaterial } from './webgpuTerrainNodeMaterial.js';

// Cycle 114 Phase 6 removed the `fogColor` fallback that used to sit here. The
// terrain no longer carries a fog colour of its own at all: it reads scene.fog
// through Three's node fog, the same way the WebGL terrain reads it through
// <fog_fragment>. See js/world/webgpuTerrainNodeMaterial.js for the full note.
const DEFAULT_TERRAIN_COLORS = Object.freeze({
  lowColor: [0.29, 0.38, 0.18],
  midColor: [0.43, 0.55, 0.25],
  highColor: [0.56, 0.53, 0.42],
});

function toArray(value, fallback) {
  if (Array.isArray(value)) return value;
  return value?.toArray?.() ?? fallback;
}

function createFlatHeightTexture({
  DataTexture,
  RedFormat,
  FloatType,
  LinearFilter,
  ClampToEdgeWrapping,
}) {
  if (typeof DataTexture !== 'function') return null;
  const texture = new DataTexture(
    new Float32Array([0]),
    1,
    1,
    RedFormat,
    FloatType
  );
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  texture.userData.webgpuHeightTextureSource = 'flat-terrain-fallback';
  return texture;
}

export function createWebGpuTerrainNodeMaterialFactories(webGpuModules, options = {}) {
  const terrainDefaults = options.terrain ?? {};

  return {
    createTerrainMaterial: (context = {}) => {
      const createHeightTexture = context.createHeightTexture ?? terrainDefaults.createHeightTexture ?? options.createHeightTexture;
      const heightTexture = context.heightTexture
        ?? terrainDefaults.heightTexture
        ?? options.heightTexture
        ?? createHeightTexture?.()
        ?? createFlatHeightTexture(webGpuModules);
      if (!heightTexture) return null;

      const colors = context.colors ?? {};
      const heightfield = context.heightfield ?? {};
      const polygonOffset = context.polygonOffset ?? terrainDefaults.polygonOffset ?? options.polygonOffset;
      const material = createWebGpuTerrainHeightfieldNodeMaterial(webGpuModules, {
        lowColor: toArray(colors.baseColor1 ?? context.lowColor ?? terrainDefaults.lowColor, DEFAULT_TERRAIN_COLORS.lowColor),
        midColor: toArray(colors.baseColor2 ?? context.midColor ?? terrainDefaults.midColor, DEFAULT_TERRAIN_COLORS.midColor),
        highColor: toArray(colors.baseColor3 ?? context.highColor ?? terrainDefaults.highColor, DEFAULT_TERRAIN_COLORS.highColor),
        dirtColor: toArray(colors.dirtColor ?? context.dirtColor ?? terrainDefaults.dirtColor, [0.42, 0.36, 0.29]),
        colorTint: toArray(context.colorTint ?? terrainDefaults.colorTint ?? options.colorTint, [1, 1, 1]),
        dirtStrength: context.noise?.dirtStrength ?? context.dirtStrength ?? terrainDefaults.dirtStrength ?? options.dirtStrength,
        detailBase: context.detailBase ?? terrainDefaults.detailBase ?? options.detailBase,
        detailStrength: context.detailStrength ?? terrainDefaults.detailStrength ?? options.detailStrength,
        aoFloor: context.aoFloor ?? terrainDefaults.aoFloor ?? options.aoFloor,
        aoStrength: context.aoStrength ?? terrainDefaults.aoStrength ?? options.aoStrength,
        contrast: context.contrast ?? terrainDefaults.contrast ?? options.contrast,
        peakHeight: heightfield.peakHeight ?? context.peakHeight ?? terrainDefaults.peakHeight ?? options.peakHeight ?? 1,
        heightfieldWorldSize: heightfield.worldSize ?? context.heightfieldWorldSize ?? terrainDefaults.heightfieldWorldSize ?? options.heightfieldWorldSize,
        colorScale: context.colorScale ?? terrainDefaults.colorScale ?? options.colorScale,
        side: context.side ?? terrainDefaults.side ?? options.side,
        polygonOffset,
      }, heightTexture);
      material.userData.heightTexture = heightTexture;
      return material;
    },
  };
}
