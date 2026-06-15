// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { Vector2 as ThreeVector2, Vector3 as ThreeVector3, Color as ThreeColor } from 'three';
import { FOLIAGE_RIG, buildFoliageImpostorColorNode } from './world/foliageLightingRig.js';

/**
 * Cycle 101 Phase 3: production consolidated octahedral tree impostor material.
 *
 * The default far-tree impostor on the consolidated compute-cull path (NSL) was
 * a static 3-quad cross-billboard sampling ONE azimuth tile with a plain
 * MeshBasicMaterial. This is the proper replacement: a camera-facing billboard
 * whose octahedral tile (and thus silhouette) tracks the view, relit per-fragment
 * from the captured normal so it shades to the sun/sky instead of reading flat.
 *
 * Why this is in-shader and reads the compacted buffer directly (not THREE's
 * instanced attributes): the consolidated cull is DATA-COMPACTION - a compute
 * pass writes survivor matrices into a dense storage buffer whose slot order
 * changes every frame. CPU-computed per-instance attributes (the debug route's
 * approach) cannot line up with that order. So tile selection + billboard must
 * run in-shader from each instance's compacted matrix, read by instanceIndex
 * exactly as treeComputeCull's own compute pass reads its source buffer. Setting
 * material.vertexNode replaces the whole MVP chain (three NodeMaterial:
 * `this.vertexNode || mvp`), which bypasses InstanceNode's auto-transform, so the
 * raw-buffer read is the per-instance transform with no double-apply.
 *
 * Relight follows the PROVEN WebGL kiln material (js/kiln-impostor-material.js),
 * not Fable5's MeshPhysical+PBR path: the WebGPU scene relights foliage through
 * setImpostorTint uniforms (sun/ambient/ground-bounce), not THREE light objects,
 * so a PBR node material would render unlit. The capture-view normal is rotated
 * to object space per tile via that tile's capture basis (reconstructed from the
 * sidecar `directions` entry), blended, then run through the half-Lambert wrap +
 * hemispheric ambient + Schlick fresnel foliage model.
 *
 * Octahedral tile selection mirrors selectOctahedralImpostorTiles (the tested JS
 * selector) in lockstep: both use the cell-centered inverse, so every baked tile
 * center round-trips to its own tile (64/64), including the steep-down fold seam.
 *
 * @param {object} webGpuModules { MeshBasicNodeMaterial, DoubleSide, Vector3, TSL }
 * @param {object} opts
 * @param {object} opts.instanceMatricesAttr StorageInstancedBufferAttribute the
 *        cull compacts survivor matrices into (mesh.instanceMatrix).
 * @param {number} opts.capacity instance capacity of that buffer.
 * @param {object} opts.sidecar octahedral Kiln sidecar (tilesX/Y, bbox, yOffset,
 *        atlasWidth/Height).
 * @param {THREE.Texture} opts.albedoAtlas
 * @param {THREE.Texture} opts.normalAtlas capture-view-space normal atlas.
 * @param {THREE.Texture} opts.directionsTexture tilesX*tilesY x 1 RGBA float,
 *        texel i = the captured world direction for tile i (row-major), Nearest.
 * @param {object} [opts.lighting] { sunDirection, sunColor, ambientColor, groundBounceColor }
 * @param {object} [opts.fog] { color, near, far, strength }
 * @param {object} [opts.tunables] { alphaTest } - the relight comes from the shared
 *        foliage rig (foliageLightingRig.js); the old wrap/fresnel/subsurface
 *        tunables retired in Cycle 103 P2.
 * @returns {THREE.Material} a MeshBasicNodeMaterial with userData controls for setImpostorTint.
 */
export function createWebGpuConsolidatedTreeImpostorMaterial(webGpuModules, opts) {
  const { MeshBasicNodeMaterial, DoubleSide, Vector3 = ThreeVector3, Color = ThreeColor, TSL } = webGpuModules;
  const {
    instanceMatricesAttr, capacity, sidecar, albedoAtlas, normalAtlas, directionsTexture,
    lighting = {}, fog = {}, tunables = {},
  } = opts;
  const {
    storage, instanceIndex, varying, uniform, texture, uv,
    vec2, vec3, vec4, float,
    cameraPosition, cameraProjectionMatrix, cameraViewMatrix, positionGeometry,
    normalize, cross, dot, max, min, clamp, mix, abs, floor, sign, length, smoothstep,
  } = TSL;

  const tilesX = sidecar.tilesX ?? 8;
  const tilesY = sidecar.tilesY ?? 8;
  const tileCount = tilesX * tilesY;
  const tileSize = sidecar.tileSize ?? 128;
  const atlasW = sidecar.atlasWidth ?? tilesX * tileSize;
  const atlasH = sidecar.atlasHeight ?? tilesY * tileSize;
  const cx = (sidecar.bbox.min[0] + sidecar.bbox.max[0]) * 0.5;
  const yC = sidecar.yOffset ?? (sidecar.bbox.min[1] + sidecar.bbox.max[1]) * 0.5;
  const cz = (sidecar.bbox.min[2] + sidecar.bbox.max[2]) * 0.5;

  const vector3 = (v) => (typeof Vector3 === 'function' ? new Vector3(v[0], v[1], v[2]) : v);
  const color = (v) => (typeof Color === 'function' ? new Color(v[0], v[1], v[2]) : v);
  // Sun direction is a Vector3; sun/ambient/ground are Colors (setTint copies
  // Colors into them). Defaults use WebGL-parity irradiance units (ambient
  // pre-multiplied by PI; the RECIPROCAL_PI in the BRDF cancels it).
  // setImpostorTint overwrites these per frame; the defaults only paint boot.
  const sunDirNode = uniform(vector3(lighting.sunDirection ?? [0.5, 0.7, 0.3]));
  const sunColorNode = uniform(color(lighting.sunColor ?? [1, 1, 1]));
  const ambientNode = uniform(color(lighting.ambientColor ?? [0.7 * Math.PI, 0.7 * Math.PI, 0.7 * Math.PI]));
  const groundBounceNode = uniform(color(lighting.groundBounceColor ?? [0.35 * Math.PI, 0.35 * Math.PI, 0.35 * Math.PI]));
  const fogColorNode = vec3(...(fog.color ?? [0.8, 0.8, 0.8]));
  const fogNear = fog.near ?? 60;
  const fogFar = fog.far ?? 400;
  const fogStrength = fog.strength ?? 0.5;
  // Cycle 103 P2: relight is the shared foliage rig, calibrated to reproduce the
  // LOD0 PBR leaf (Lambert + PI-consistent hemispheric ambient). The old per-call
  // wrap/fresnel/subsurface magic is retired; FOLIAGE_RIG is the single source and
  // FOLIAGE_RIG.directWrap is the one canopy-softening knob (default 0 = PBR match).
  const lightingRig = FOLIAGE_RIG;
  const alphaTest = tunables.alphaTest ?? 0.3;

  // --- per-instance transform from the cull's compacted storage buffer ---
  const instMat = storage(instanceMatricesAttr, 'mat4', capacity).element(instanceIndex).toVar();
  const c0 = instMat[0].xyz;
  const c1 = instMat[1].xyz;
  const c2 = instMat[2].xyz;
  const trans = instMat[3].xyz;
  const scaleVal = max(length(c0), float(1e-4));
  const right = c0.div(scaleVal);
  const up = c1.div(scaleVal);
  const fwd = c2.div(scaleVal);
  // bbox-center origin in world (the consolidated mesh sits at the scene root
  // untransformed, so modelMatrix is identity - no modelMatrix multiply).
  const origin = trans.add(right.mul(cx).add(up.mul(yC)).add(fwd.mul(cz)).mul(scaleVal));

  // View dir in world + capture (object) space. dirObj un-rotates the per-tree
  // yaw so the octahedral pick is in the bake's frame.
  const dirWorld = cameraPosition.sub(origin);
  const dirObj = normalize(vec3(dot(right, dirWorld), dot(up, dirWorld), dot(fwd, dirWorld)));
  const sunWorld = normalize(sunDirNode);
  const sunObj = vec3(dot(right, sunWorld), dot(up, sunWorld), dot(fwd, sunWorld));

  // --- octahedral tile pick (mirrors selectOctahedralImpostorTiles) ---
  const denom = max(abs(dirObj.x).add(abs(dirObj.y)).add(abs(dirObj.z)), float(1e-6));
  const oxRaw = dirObj.x.div(denom);
  const oyRaw = dirObj.z.div(denom);
  const lower = dirObj.y.lessThan(0);
  const ox = lower.select(float(1).sub(abs(oyRaw)).mul(sign(oxRaw)), oxRaw);
  const oy = lower.select(float(1).sub(abs(oxRaw)).mul(sign(oyRaw)), oyRaw);
  // Cell-centered inverse, in lockstep with selectOctahedralImpostorTiles: tiles
  // bake at u = ((i + 0.5) / tilesX) * 2 - 1, so invert with `* tilesX - 0.5`. The
  // old `* (tilesX - 1)` vertex centering mis-picked at the steep-down fold seam.
  const gridX = clamp(ox.mul(0.5).add(0.5).mul(tilesX).sub(0.5), float(0), float(tilesX - 1));
  const gridY = clamp(float(0.5).sub(oy.mul(0.5)).mul(tilesY).sub(0.5), float(0), float(tilesY - 1));
  const x0 = floor(gridX);
  const y0 = floor(gridY);
  const fx = gridX.sub(x0);
  const fy = gridY.sub(y0);

  // Varyings: per-instance constants (same across the quad's verts) computed in
  // the vertex stage; the 4 tile samples + capture frames are built in fragment.
  const vGrid = varying(vec4(x0, y0, fx, fy));
  const vDirObj = varying(dirObj);
  const vSunObj = varying(sunObj);
  const vViewDist = varying(length(dirWorld));

  // --- camera-facing billboard (world-up locked -> spherical with pitch) ---
  const viewDir = normalize(dirWorld);
  const worldUp = vec3(0, 1, 0);
  const billRightRaw = cross(worldUp, viewDir);
  const rLen = length(billRightRaw);
  const billRight = rLen.greaterThan(1e-4).select(billRightRaw.div(rLen), vec3(1, 0, 0));
  const billUpSph = cross(viewDir, billRight);
  const pitchT = smoothstep(0.2, 0.7, abs(dirObj.y));
  const billUp = normalize(mix(worldUp, billUpSph, pitchT));
  const vertexWorld = origin
    .add(billRight.mul(positionGeometry.x.mul(scaleVal)))
    .add(billUp.mul(positionGeometry.y.mul(scaleVal)));

  // --- fragment: 4-tile bilinear blend + per-tile capture-view relight ---
  const gx0 = vGrid.x;
  const gy0 = vGrid.y;
  const gfx = vGrid.z;
  const gfy = vGrid.w;
  const gx1 = min(gx0.add(1), float(tilesX - 1));
  const gy1 = min(gy0.add(1), float(tilesY - 1));
  const tileScale = vec2(1 / tilesX, 1 / tilesY);
  const insetU = 0.5 * tilesX / atlasW;
  const insetV = 0.5 * tilesY / atlasH;
  const localUv = clamp(uv(), vec2(insetU, insetV), vec2(1 - insetU, 1 - insetV));

  const tileAtlasUv = (gx, gy) => vec2(
    gx.div(tilesX),
    float(tilesY - 1).sub(gy).div(tilesY),
  ).add(localUv.mul(tileScale));
  // directions atlas is row-major (idx = gy*tilesX + gx), nearest-sampled.
  const tileDir = (gx, gy) => {
    const idx = gy.mul(tilesX).add(gx);
    return texture(directionsTexture, vec2(idx.add(0.5).div(tileCount), 0.5)).xyz;
  };
  // capture-view normal -> object space using the tile's capture basis:
  // viewZ = captured dir, viewX = normalize(worldUp x viewZ), viewY = viewZ x viewX.
  const captureToObj = (dir, nCap) => {
    const viewZ = normalize(dir);
    const vxRaw = cross(worldUp, viewZ);
    const vxLen = length(vxRaw);
    const viewX = vxLen.greaterThan(1e-4).select(vxRaw.div(vxLen), vec3(1, 0, 0));
    const viewY = cross(viewZ, viewX);
    return viewX.mul(nCap.x).add(viewY.mul(nCap.y)).add(viewZ.mul(nCap.z));
  };

  const w00 = gfx.oneMinus().mul(gfy.oneMinus());
  const w10 = gfx.mul(gfy.oneMinus());
  const w01 = gfx.oneMinus().mul(gfy);
  const w11 = gfx.mul(gfy);

  const alb00 = texture(albedoAtlas, tileAtlasUv(gx0, gy0));
  const alb10 = texture(albedoAtlas, tileAtlasUv(gx1, gy0));
  const alb01 = texture(albedoAtlas, tileAtlasUv(gx0, gy1));
  const alb11 = texture(albedoAtlas, tileAtlasUv(gx1, gy1));
  const aBlend = alb00.a.mul(w00).add(alb10.a.mul(w10)).add(alb01.a.mul(w01)).add(alb11.a.mul(w11));
  const albedoPremul = alb00.rgb.mul(alb00.a).mul(w00)
    .add(alb10.rgb.mul(alb10.a).mul(w10))
    .add(alb01.rgb.mul(alb01.a).mul(w01))
    .add(alb11.rgb.mul(alb11.a).mul(w11));
  const albedo = albedoPremul.div(max(aBlend, float(1e-4)));

  const n00 = texture(normalAtlas, tileAtlasUv(gx0, gy0)).xyz.mul(2).sub(1);
  const n10 = texture(normalAtlas, tileAtlasUv(gx1, gy0)).xyz.mul(2).sub(1);
  const n01 = texture(normalAtlas, tileAtlasUv(gx0, gy1)).xyz.mul(2).sub(1);
  const n11 = texture(normalAtlas, tileAtlasUv(gx1, gy1)).xyz.mul(2).sub(1);
  const nObjSum = captureToObj(tileDir(gx0, gy0), n00).mul(w00)
    .add(captureToObj(tileDir(gx1, gy0), n10).mul(w10))
    .add(captureToObj(tileDir(gx0, gy1), n01).mul(w01))
    .add(captureToObj(tileDir(gx1, gy1), n11).mul(w11));
  const nObj = normalize(nObjSum);

  // Cycle 103 P2: one shared foliage relight path (foliageLightingRig.js),
  // calibrated to reproduce the LOD0 PBR leaf. nObj / vSunObj / vDirObj are
  // object-space; ambient and ground bounce are PI-pre-multiplied irradiance.
  const lit = buildFoliageImpostorColorNode(TSL, {
    albedo,
    normal: nObj,
    sunDirObj: vSunObj,
    sunColor: sunColorNode,
    skyIrradiance: ambientNode,
    groundIrradiance: groundBounceNode,
    viewDirObj: vDirObj,
  }, lightingRig);
  const fogBlend = smoothstep(fogNear, fogFar, vViewDist).mul(fogStrength);

  const material = new MeshBasicNodeMaterial();
  material.name = 'webgpu-consolidated-tree-impostor';
  material.vertexNode = cameraProjectionMatrix.mul(cameraViewMatrix.mul(vec4(vertexWorld, 1)));
  material.colorNode = mix(lit, fogColorNode, fogBlend);
  material.opacityNode = aBlend;
  material.transparent = false;
  material.depthWrite = true;
  material.depthTest = true;
  // Manual fog (vViewDist-based) is applied in colorNode above; the custom
  // vertexNode bypasses three's standard view-position chain, so the built-in
  // fog node would have no correct distance. Disable it to avoid double-fogging.
  material.fog = false;
  material.side = DoubleSide;
  material.alphaHash = true;
  material.alphaTest = alphaTest;
  material.userData.isKilnImpostor = true;
  material.userData.sidecar = sidecar;
  material.userData.webgpuConsolidatedImpostor = {
    layout: 'octahedral',
    tilesX,
    tilesY,
    selection: 'in-shader-octahedral-from-compacted-matrix',
    billboard: 'world-up-locked-spherical',
    relight: 'capture-view-normal-foliage-model',
  };
  material.userData.webgpuImpostorMaterialControls = {
    nodes: { sunDirection: sunDirNode, sunColor: sunColorNode, ambientColor: ambientNode, groundBounceColor: groundBounceNode },
    setTileBlend() { return false; }, // selection is in-shader; no CPU tile push
    setTint(state = {}) {
      if (state.sunDirWorld && sunDirNode.value?.copy) sunDirNode.value.copy(state.sunDirWorld);
      if (state.sunColor && sunColorNode.value?.copy) {
        sunColorNode.value.copy(state.sunColor)
          .multiplyScalar(Number.isFinite(state.sunIntensity) ? state.sunIntensity : 1);
      }
      if (state.ambientColor && ambientNode.value?.copy) {
        ambientNode.value.copy(state.ambientColor)
          .multiplyScalar(Number.isFinite(state.ambientIntensity) ? state.ambientIntensity : 1);
      }
      // Ground-bounce: albedo-neutral tint of ambient at half strength, matching
      // the WebGL default (uGroundBounceColor ~ 50% of sky-side). setImpostorTint
      // passes groundBounceTilt (a Color) + groundBounceScale.
      if (groundBounceNode.value?.copy) {
        const tilt = state.groundBounceTilt;
        const scale = Number.isFinite(state.groundBounceScale) ? state.groundBounceScale : 0.5;
        if (tilt?.r !== undefined && ambientNode.value) {
          groundBounceNode.value.setRGB(
            ambientNode.value.r * tilt.r * scale,
            ambientNode.value.g * tilt.g * scale,
            ambientNode.value.b * tilt.b * scale,
          );
        } else if (ambientNode.value) {
          groundBounceNode.value.copy(ambientNode.value).multiplyScalar(scale);
        }
      }
    },
  };
  return material;
}

export function createWebGpuKilnImpostorNodeMaterial(
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
  const colorScale = kilnImpostor.colorScale ?? 1;
  const fogStrength = kilnImpostor.fogStrength ?? 0.62;
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
  // Cycle 103 P2: one shared foliage relight path (foliageLightingRig.js),
  // calibrated to the LOD0 PBR leaf. The latlon path historically fed raw (non-PI)
  // ambient; pre-multiply by PI so the shared PI-consistent rig preserves its
  // dominant ambient brightness while the sun term becomes PBR-correct. Ground
  // bounce = 50% of sky (the rig's hemispheric default).
  const relitColor = buildFoliageImpostorColorNode(TSL, {
    albedo: atlasRgb,
    normal: relightNormal,
    sunDirObj: sunDirection,
    sunColor: sunColorNode,
    skyIrradiance: ambientColorNode.mul(Math.PI),
    groundIrradiance: ambientColorNode.mul(Math.PI * 0.5),
  }, FOLIAGE_RIG);
  const viewDistance = length(positionView);
  const fogBlend = smoothstep(kilnImpostor.fogNear, kilnImpostor.fogFar, viewDistance).mul(fogStrength);

  const material = new MeshBasicNodeMaterial();
  material.name = 'webgpu-node-kiln-impostor';
  material.colorNode = mix(relitColor.mul(depthShade).mul(colorScale), vec3(...kilnImpostor.fogColor), fogBlend);
  material.opacityNode = alphaBlend;
  material.transparent = kilnImpostor.transparent ?? true;
  material.depthWrite = kilnImpostor.depthWrite ?? true;
  material.depthTest = kilnImpostor.depthTest ?? true;
  material.side = kilnImpostor.side ?? DoubleSide;
  material.alphaHash = kilnImpostor.alphaHash ?? true;
  material.alphaTest = kilnImpostor.alphaTest;
  material.userData.webgpuImpostorTileSelection = {
    mode: selectionMode,
    layout: kilnImpostor.layoutName ?? 'latlon-hemi-y',
    sidecarVersion: kilnImpostor.sidecarVersion ?? 1,
    tilesX: kilnImpostor.tilesX,
    tilesY: kilnImpostor.tilesY,
    source: useInstancedSelection ? 'instanced-attributes' : 'uniform-controls',
  };
  material.userData.webgpuImpostorMaterialControlsSummary = {
    colorScale,
    fogStrength,
  };
  material.userData.webgpuImpostorMaterialControls = createWebGpuKilnImpostorNodeMaterialControls({
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

function createWebGpuKilnImpostorNodeMaterialControls({
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
      }
    },
  };
}
