import { createKonveyorKilnImpostorNodeMaterial } from './konveyorKilnImpostorNodeMaterial.js';

const DEFAULT_IMPOSTOR = Object.freeze({
  tileBlendTiles: [[0, 0], [1, 0], [0, 1]],
  tileBlendWeights: [0.45, 0.35, 0.2],
  sunDirection: [0.5, 0.7, 0.3],
  sunColor: [1, 1, 1],
  ambientColor: [0.7, 0.7, 0.7],
  fogColor: [0.8, 0.8, 0.8],
  fogNear: 18,
  fogFar: 92,
  alphaTest: 0.3,
});

function toArray(value, fallback) {
  if (Array.isArray(value)) return value;
  return value?.toArray?.() ?? fallback;
}

export function createKonveyorImpostorNodeMaterialFactories(webGpuModules, options = {}) {
  const impostorDefaults = options.kilnImpostor ?? {};

  return {
    createKilnImpostorMaterial: (context = {}) => {
      const albedoAtlas = context.albedoAtlas ?? impostorDefaults.albedoAtlas ?? options.albedoAtlas;
      const normalAtlas = context.normalAtlas ?? impostorDefaults.normalAtlas ?? options.normalAtlas;
      const depthAtlas = context.depthAtlas ?? impostorDefaults.depthAtlas ?? options.depthAtlas;
      if (!albedoAtlas || !normalAtlas || !depthAtlas) return null;

      const layout = context.layout ?? {};
      const lighting = context.lighting ?? {};
      const fog = context.fog ?? {};
      const material = context.material ?? {};
      const tunables = context.tunables ?? {};
      const layoutName = layout.layout === 'octahedral' || layout.axis === 'octahedral'
        ? 'octahedral'
        : layout.layout === 'latlon' && layout.axis === 'hemi-y'
          ? 'latlon-hemi-y'
          : impostorDefaults.layoutName ?? 'latlon-hemi-y';

      return createKonveyorKilnImpostorNodeMaterial(webGpuModules, {
        layoutName,
        sidecarVersion: layout.version ?? context.sidecar?.version ?? 1,
        tilesX: layout.tilesX ?? context.tilesX ?? impostorDefaults.tilesX ?? 4,
        tilesY: layout.tilesY ?? context.tilesY ?? impostorDefaults.tilesY ?? 4,
        atlasSize: layout.atlasSize ?? context.atlasSize ?? impostorDefaults.atlasSize ?? [2048, 2048],
        tileBlendTiles: context.tileBlendTiles ?? impostorDefaults.tileBlendTiles ?? options.tileBlendTiles ?? DEFAULT_IMPOSTOR.tileBlendTiles,
        tileBlendWeights: context.tileBlendWeights ?? impostorDefaults.tileBlendWeights ?? options.tileBlendWeights ?? DEFAULT_IMPOSTOR.tileBlendWeights,
        tileSelectionMode: context.tileSelectionMode ?? context.selectionMode ?? impostorDefaults.tileSelectionMode ?? options.tileSelectionMode,
        sunDirection: toArray(lighting.sunDirection ?? context.sunDirection ?? impostorDefaults.sunDirection, DEFAULT_IMPOSTOR.sunDirection),
        sunColor: toArray(lighting.sunColor ?? context.sunColor ?? impostorDefaults.sunColor, DEFAULT_IMPOSTOR.sunColor),
        ambientColor: toArray(lighting.ambientColor ?? context.ambientColor ?? impostorDefaults.ambientColor, DEFAULT_IMPOSTOR.ambientColor),
        fogColor: toArray(fog.color ?? context.fogColor ?? impostorDefaults.fogColor ?? options.fogColor, DEFAULT_IMPOSTOR.fogColor),
        fogNear: fog.near ?? context.fogNear ?? impostorDefaults.fogNear ?? options.fogNear ?? DEFAULT_IMPOSTOR.fogNear,
        fogFar: fog.far ?? context.fogFar ?? impostorDefaults.fogFar ?? options.fogFar ?? DEFAULT_IMPOSTOR.fogFar,
        fogStrength: fog.strength ?? context.fogStrength ?? impostorDefaults.fogStrength ?? options.fogStrength,
        colorScale: context.colorScale ?? impostorDefaults.colorScale ?? options.colorScale,
        foliageLightingFloor: context.foliageLightingFloor ?? impostorDefaults.foliageLightingFloor ?? options.foliageLightingFloor,
        alphaTest: tunables.alphaTest ?? context.alphaTest ?? impostorDefaults.alphaTest ?? DEFAULT_IMPOSTOR.alphaTest,
        alphaHash: material.alphaHash ?? context.alphaHash ?? impostorDefaults.alphaHash ?? true,
        side: material.side ?? context.side ?? impostorDefaults.side,
        transparent: material.transparent ?? context.transparent ?? impostorDefaults.transparent ?? false,
        depthWrite: material.depthWrite ?? context.depthWrite ?? impostorDefaults.depthWrite ?? true,
        depthTest: material.depthTest ?? context.depthTest ?? impostorDefaults.depthTest ?? true,
      }, albedoAtlas, normalAtlas, depthAtlas);
    },
  };
}
