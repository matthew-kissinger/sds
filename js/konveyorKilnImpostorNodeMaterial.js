import { Vector2 as ThreeVector2, Vector3 as ThreeVector3 } from 'three';

export function createKonveyorKilnImpostorNodeMaterial(
  { MeshBasicNodeMaterial, DoubleSide, Vector2 = ThreeVector2, Vector3 = ThreeVector3, TSL },
  kilnImpostor,
  albedoAtlas,
  normalAtlas,
  depthAtlas
) {
  const { attribute, clamp, dot, float, length, max, mix, normalize, smoothstep, texture, uniform, uv, positionView, vec2, vec3, vec4 } = TSL;
  const tileScaleX = 1 / kilnImpostor.tilesX;
  const tileScaleY = 1 / kilnImpostor.tilesY;
  const tileScale = vec2(tileScaleX, tileScaleY);
  const tileInset = vec2(
    0.5 / kilnImpostor.atlasSize[0] / tileScaleX,
    0.5 / kilnImpostor.atlasSize[1] / tileScaleY
  );
  const tileLocalUv = clamp(uv(), tileInset, vec2(1.0, 1.0).sub(tileInset));
  const vector2 = (value) => (
    typeof Vector2 === 'function'
      ? new Vector2(value[0], value[1])
      : value
  );
  const vector3 = (value) => (
    typeof Vector3 === 'function'
      ? new Vector3(value[0], value[1], value[2])
      : value
  );
  const tileOffset = ([azIdx, elIdx]) => vector2([
    azIdx / kilnImpostor.tilesX,
    (kilnImpostor.tilesY - 1 - elIdx) / kilnImpostor.tilesY,
  ]);
  const [tile0, tile1, tile2] = kilnImpostor.tileBlendTiles;
  const [w0, w1, w2] = kilnImpostor.tileBlendWeights;
  const selectionMode = kilnImpostor.tileSelectionMode ?? 'dynamic-uniform-lab';
  const useInstancedSelection = selectionMode === 'production-instanced-attributes';
  const tileOffsets = useInstancedSelection
    ? [
        attribute('kilnTileOffset0', 'vec2'),
        attribute('kilnTileOffset1', 'vec2'),
        attribute('kilnTileOffset2', 'vec2'),
      ]
    : [uniform(tileOffset(tile0)), uniform(tileOffset(tile1)), uniform(tileOffset(tile2))];
  const instancedWeights = useInstancedSelection
    ? attribute('kilnTileWeights', 'vec3')
    : null;
  const tileWeights = useInstancedSelection
    ? [instancedWeights.x, instancedWeights.y, instancedWeights.z]
    : [uniform(w0), uniform(w1), uniform(w2)];
  const sunDirectionNode = uniform(vector3(kilnImpostor.sunDirection));
  const sunColorNode = uniform(vector3(kilnImpostor.sunColor));
  const ambientColorNode = uniform(vector3(kilnImpostor.ambientColor));
  const foliageLightingFloor = vec3(0.42, 0.46, 0.32);
  const tileUv = (tileOffsetNode) => tileLocalUv.mul(tileScale).add(tileOffsetNode);
  const albedo0 = texture(albedoAtlas, tileUv(tileOffsets[0]));
  const albedo1 = texture(albedoAtlas, tileUv(tileOffsets[1]));
  const albedo2 = texture(albedoAtlas, tileUv(tileOffsets[2]));
  const alphaBlend = albedo0.a.mul(tileWeights[0]).add(albedo1.a.mul(tileWeights[1])).add(albedo2.a.mul(tileWeights[2]));
  const albedoPremul = albedo0.rgb.mul(albedo0.a).mul(tileWeights[0])
    .add(albedo1.rgb.mul(albedo1.a).mul(tileWeights[1]))
    .add(albedo2.rgb.mul(albedo2.a).mul(tileWeights[2]));
  const atlasRgb = albedoPremul.div(max(alphaBlend, 0.0001));
  const normal0 = texture(normalAtlas, tileUv(tileOffsets[0])).rgb.mul(2.0).sub(vec3(1.0, 1.0, 1.0));
  const normal1 = texture(normalAtlas, tileUv(tileOffsets[1])).rgb.mul(2.0).sub(vec3(1.0, 1.0, 1.0));
  const normal2 = texture(normalAtlas, tileUv(tileOffsets[2])).rgb.mul(2.0).sub(vec3(1.0, 1.0, 1.0));
  const depthUnpack = vec4(
    255 / 256 / (256 * 256 * 256),
    255 / 256 / (256 * 256),
    255 / 256 / 256,
    255 / 256
  );
  const depth0 = dot(texture(depthAtlas, tileUv(tileOffsets[0])).rgba, depthUnpack);
  const depth1 = dot(texture(depthAtlas, tileUv(tileOffsets[1])).rgba, depthUnpack);
  const depth2 = dot(texture(depthAtlas, tileUv(tileOffsets[2])).rgba, depthUnpack);
  const depthBlend = depth0.mul(tileWeights[0]).add(depth1.mul(tileWeights[1])).add(depth2.mul(tileWeights[2]));
  const depthShade = mix(float(0.98), float(1.02), smoothstep(0.05, 0.95, depthBlend));
  const relightNormal = normalize(normal0.mul(tileWeights[0]).add(normal1.mul(tileWeights[1])).add(normal2.mul(tileWeights[2])));
  const sunDirection = normalize(sunDirectionNode);
  const wrappedSun = max(dot(relightNormal, sunDirection), 0.0).mul(0.65).add(0.35);
  const relitColor = atlasRgb.mul(max(
    ambientColorNode.add(sunColorNode.mul(wrappedSun.mul(0.42))),
    foliageLightingFloor
  ));
  const viewDistance = length(positionView);
  const fogBlend = smoothstep(kilnImpostor.fogNear, kilnImpostor.fogFar, viewDistance).mul(0.62);

  const material = new MeshBasicNodeMaterial();
  material.name = 'konveyor-node-kiln-impostor';
  material.colorNode = mix(relitColor.mul(depthShade), vec3(...kilnImpostor.fogColor), fogBlend);
  material.opacityNode = alphaBlend;
  material.transparent = kilnImpostor.transparent ?? true;
  material.depthWrite = kilnImpostor.depthWrite ?? true;
  material.depthTest = kilnImpostor.depthTest ?? true;
  material.side = kilnImpostor.side ?? DoubleSide;
  material.alphaHash = kilnImpostor.alphaHash ?? true;
  material.alphaTest = kilnImpostor.alphaTest;
  material.userData.konveyorImpostorTileSelection = {
    mode: selectionMode,
    layout: kilnImpostor.layoutName ?? 'latlon-hemi-y',
    sidecarVersion: kilnImpostor.sidecarVersion ?? 1,
    tilesX: kilnImpostor.tilesX,
    tilesY: kilnImpostor.tilesY,
    source: useInstancedSelection ? 'instanced-attributes' : 'uniform-controls',
  };
  material.userData.konveyorImpostorMaterialControls = createKonveyorKilnImpostorNodeMaterialControls({
    tileOffsets,
    tileWeights,
    tilesX: kilnImpostor.tilesX,
    tilesY: kilnImpostor.tilesY,
    useInstancedSelection,
    tintNodes: {
      sunDirection: sunDirectionNode,
      sunColor: sunColorNode,
      ambientColor: ambientColorNode,
    },
  });
  return material;
}

function createKonveyorKilnImpostorNodeMaterialControls({
  tileOffsets,
  tileWeights,
  tilesX,
  tilesY,
  useInstancedSelection = false,
  tintNodes,
}) {
  const offsetForTile = ([azIdx, elIdx]) => [
    azIdx / tilesX,
    (tilesY - 1 - elIdx) / tilesY,
  ];
  return {
    nodes: { tileOffsets, tileWeights, tint: tintNodes },
    setTileBlend({ tiles = [], weights = [] } = {}) {
      if (useInstancedSelection) return false;
      for (let i = 0; i < 3; i++) {
        const offset = offsetForTile(tiles[i] ?? [0, 0]);
        const nodeValue = tileOffsets[i]?.value;
        if (nodeValue?.set) nodeValue.set(offset[0], offset[1]);
        else if (Array.isArray(nodeValue)) {
          nodeValue[0] = offset[0];
          nodeValue[1] = offset[1];
        }
        if (tileWeights[i]) tileWeights[i].value = Number.isFinite(weights[i]) ? weights[i] : 0;
      }
      return true;
    },
    setTint(state = {}) {
      if (state.sunDirWorld && tintNodes?.sunDirection?.value?.copy) {
        tintNodes.sunDirection.value.copy(state.sunDirWorld);
      }
      if (state.sunColor && tintNodes?.sunColor?.value?.copy) {
        tintNodes.sunColor.value.copy(state.sunColor)
          .multiplyScalar(Number.isFinite(state.sunIntensity) ? state.sunIntensity : 1);
      }
      if (state.ambientColor && tintNodes?.ambientColor?.value?.copy) {
        tintNodes.ambientColor.value.copy(state.ambientColor)
          .multiplyScalar(Number.isFinite(state.ambientIntensity) ? state.ambientIntensity : 1);
        tintNodes.ambientColor.value.r = Math.max(tintNodes.ambientColor.value.r, 0.42);
        tintNodes.ambientColor.value.g = Math.max(tintNodes.ambientColor.value.g, 0.46);
        tintNodes.ambientColor.value.b = Math.max(tintNodes.ambientColor.value.b, 0.32);
      }
    },
  };
}
