// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { Vector3 as ThreeVector3 } from 'three';
import {
  WATER_COLOR_SPACE,
  WATER_DEFAULT_MIN_DEPTH_T,
  WATER_DEPTH_FROM_HEIGHTFIELD,
  WATER_FOAM_THICKNESS,
  WATER_SLOPE_SCALE,
  buildWaterNoiseNodes,
  buildWaterSlopeNormalNode,
  waterDepthFalloffFromHeightfield,
} from './waterSurfaceModel.js';

export function createWebGpuAnimeWaterNodeMaterial(
  { MeshBasicNodeMaterial, DoubleSide, TSL },
  water,
  heightTexture
) {
  const { abs, cameraPosition, clamp, dot, float, length, max, mix, normalize, positionWorld, pow, smoothstep, texture, uniform, vec2, vec3 } = TSL;
  // Cycle 118 Phase 2: one noise basis and one slope field, shared with the
  // WebGL twin through js/water/waterSurfaceModel.js. Both used to be declared
  // here and only here, so the twin had a different noise and no slope at all.
  const { valueNoise } = buildWaterNoiseNodes(TSL);

  const vector3 = (value) => new ThreeVector3(value[0], value[1], value[2]);
  const colorArray = (value) => value.map(rawChannelToLinear);
  const sunDirection = uniform(vector3(water.sunDirection));
  const sunColor = uniform(vector3(colorArray(water.sunColor)));
  const sparkleStrength = uniform(water.sparkleStrength);
  const sunSpecularIntensity = uniform(water.sunSpecularIntensity ?? 0.6);
  // Cycle 118 Phase 5. This was TSL `time`, which is frame.time - the
  // renderer's own clock, advanced on every renderer.render() no matter what
  // main.js does. It made a byte-identical re-capture impossible and it also
  // meant the timeSec main.js has been passing to AnimeWater#update since
  // Cycle 5 was dropped on the floor on this path (the controls block below
  // had no branch for it). A uniform the game drives closes both.
  const waterTime = uniform(0);
  const waterWorld = vec2(positionWorld.x, positionWorld.z);
  const heightUvRaw = waterWorld.div(water.heightfieldTexture.worldSize).add(vec2(0.5, 0.5));
  const heightUv = vec2(
    clamp(heightUvRaw.x, 0.0, 1.0),
    clamp(heightUvRaw.y, 0.0, 1.0)
  );
  const waterY = float(water.heightfieldTexture.waterY);
  const hasHeightfield = float(water.heightfieldTexture.hasHeightfield);
  const heightSample = texture(heightTexture, heightUv).r.mul(water.heightfieldTexture.peakHeight);
  const terrainDepth = max(waterY.sub(heightSample), 0.0);
  const shorelineDelta = abs(heightSample.sub(waterY));
  const radialDistance = length(waterWorld.sub(vec2(...water.shoreline.center)));
  const boundaryDistance = abs(radialDistance.sub(water.shoreline.radius));
  const depthFromBoundary = smoothstep(0.0, Math.max(water.shoreline.falloff, 0.001), boundaryDistance);
  const depthFromHeightfield = smoothstep(
    WATER_DEPTH_FROM_HEIGHTFIELD.start,
    waterDepthFalloffFromHeightfield(water.shoreline.falloff),
    terrainDepth
  );
  // The depth floor keeps radial-boundary islands from showing a turquoise
  // disc; coastline scenes (NSL) pass a lower floor so a real shallow band
  // reads along the shore (Cycle 90). Default preserves the tuned look.
  const minDepthT = water.minDepthT ?? WATER_DEFAULT_MIN_DEPTH_T;
  const depthT = max(mix(depthFromBoundary, depthFromHeightfield, hasHeightfield), minDepthT);
  const rippleUv = waterWorld.mul(0.035).add(vec2(waterTime.mul(0.18), waterTime.mul(0.08)));
  const rippleA = valueNoise(rippleUv);
  const rippleB = valueNoise(rippleUv.mul(2.35).add(vec2(waterTime.mul(0.05), waterTime.mul(-0.03))));
  const ripple = smoothstep(0.56, 0.66, rippleA.mul(0.68).add(rippleB.mul(0.32)))
    .mul(water.rippleStrength * 0.13);
  const rippleLightScale = water.rippleLightScale ?? 0.78;
  const slowSwell = valueNoise(waterWorld.mul(0.012).add(vec2(waterTime.mul(0.025), waterTime.mul(-0.018))));
  const foamNoise = valueNoise(waterWorld.mul(vec2(0.12, 0.055)).add(vec2(waterTime.mul(0.10), 0.0)));
  const foamThickness = water.foamThickness ?? WATER_FOAM_THICKNESS;
  const boundaryFoam = float(1.0)
    .sub(smoothstep(foamThickness * 0.55, foamThickness * 1.8, boundaryDistance.add(foamNoise.mul(0.3))));
  const heightInterfaceFoam = float(1.0)
    .sub(smoothstep(foamThickness * 0.18, foamThickness * 1.15, shorelineDelta.add(foamNoise.mul(0.25))));
  const foamBand = max(
    boundaryFoam.mul(float(1.0).sub(hasHeightfield)),
    heightInterfaceFoam.mul(hasHeightfield)
  );
  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const sunDir = normalize(sunDirection);
  const halfVector = normalize(sunDir.add(viewDir));
  // Cycle 118 Phase 2: the three-rotation slope field moved to the shared
  // model, so the WebGL twin gets the same normal instead of a flat up-vector
  // and Phase 3 raises one scale for both paths.
  const rippleNormal = buildWaterSlopeNormalNode(TSL, {
    worldXZ: waterWorld,
    time: waterTime,
    slopeScale: WATER_SLOPE_SCALE,
  });
  const ndh = max(dot(rippleNormal, halfVector), 0.0);
  const spec = pow(ndh, 64.0);
  const flatNdh = max(dot(vec3(0.0, 1.0, 0.0), halfVector), 0.0);
  const broadSunPath = pow(flatNdh, 8.0).mul(sunSpecularIntensity);
  const glintAxisRaw = vec2(sunDir.x.add(viewDir.x), sunDir.z.add(viewDir.z));
  const glintAxis = glintAxisRaw.div(max(length(glintAxisRaw), 0.001));
  const glintSide = vec2(glintAxis.y.negate(), glintAxis.x);
  const axisCoord = dot(waterWorld, glintAxis);
  const sideCoord = dot(waterWorld, glintSide);
  const glintMask = smoothstep(
    0.58,
    0.9,
    valueNoise(vec2(axisCoord.mul(0.055).add(waterTime.mul(0.16)), sideCoord.mul(0.11).sub(waterTime.mul(0.07))))
  );
  // DEAD AT THE CURRENT DEPTH FLOOR, deliberately left as-is (Cycle 118 Phase
  // 4 decision). minDepthT is 0.82 on the radial islands and 0.45 on
  // Newsheepdogland, and smoothstep(0.08, 0.55, depthT) is identically 1.0
  // above 0.55, so this term has not suppressed anything in the life of the
  // floor - its constants prove it was authored for an unfloored depthT.
  // Phase 4 deleted the fogStrength term that was depthT's only other
  // consumer besides the base colour, so if Phase 3 lowers the floor to give
  // the shore a real gradient, THIS REACTIVATES and the glint fades near
  // shore for the first time. That is Phase 3's call to make with pixels in
  // front of it, not a side effect to discover afterwards.
  const horizonSuppression = smoothstep(0.08, 0.55, depthT);
  const rippleGlint = spec.mul(glintMask.mul(0.72).add(0.28)).mul(horizonSuppression).mul(sparkleStrength).mul(water.sparkleScale).mul(0.22);
  const broadGlintGain = water.broadGlintGain ?? 0.70;
  const rippleGlintGain = water.rippleGlintGain ?? 0.22;
  const broadGlintPath = broadSunPath
    .mul(glintMask.mul(0.65).add(0.20))
    .mul(horizonSuppression);
  const glint = broadGlintPath.mul(broadGlintGain).add(rippleGlint.mul(rippleGlintGain / 0.22));
  // Cycle 118 Phase 2 retired `colorTint`, the fifth palette site: a per-preset
  // multiplier of [0.22, 0.40, 1.42] applied right here, which is what turned
  // the authored teal (#064e62 through the tone curve) into the shipped cobalt
  // (#002477). Nothing is folded in to replace it - re-encoding a 1.42x blue
  // multiplier into the palette would just re-encode the cobalt, and Phase 3
  // owns authoring the pastoral palette.
  const paletteLinear = {
    shallow: colorArray(water.shallowColor),
    deep: colorArray(water.deepColor),
    foam: colorArray(water.foamColor),
  };
  const baseColor = mix(vec3(...paletteLinear.shallow), vec3(...paletteLinear.deep), depthT)
    .add(vec3(ripple, ripple, ripple).mul(rippleLightScale))
    .add(vec3(0.02, 0.08, 0.10).mul(slowSwell.mul(0.34)))
    .add(sunColor.mul(glint))
    .mul(water.colorScale);
  // Foam sits OUTSIDE the tint-and-scale chain the base colour rides and only
  // ever sees foamScale. That was true before Phase 2 and stays true; the
  // single palette does not silently unify it.
  const colorWithFoam = mix(baseColor, vec3(...paletteLinear.foam).mul(water.foamScale), foamBand);

  const material = new MeshBasicNodeMaterial();
  material.name = 'webgpu-node-anime-water';
  // Cycle 118 Phase 4. The water used to composite a SECOND fog underneath
  // Three's own - a depthT ramp mixed toward a colour resolved ONCE, at boot,
  // by js/boot/productionWebGpuBoot.js's resolveSceneSkyFog, before a renderer
  // even exists. Atmosphere.applyFogColor() repaints scene.fog.color from the
  // horizon LUT every frame, so under a moving sun (Newsheepdogland's day/night
  // cycle) the water's horizon held its boot-time colour while the sky it was
  // supposed to meet moved away from it. Exactly the defect Cycle 114 Phase 6
  // removed from the terrain, and .claude/rules/scene-and-render.md forbids the
  // shape by name ("Don't introduce per-material fog uniforms ... Custom fog
  // drifts from the sky").
  //
  // Nothing replaces it. NodeMaterial.setupOutput wires the scene's fog node in
  // whenever this.fog reads true, and that node binds reference() uniforms to
  // the live scene.fog instance Atmosphere mutates in place - so the water
  // tracks the sky per-frame for free, and always did, underneath the frozen
  // pass. The flag already defaults to true on Material; it is written out here
  // for the same reason the terrain writes it, because scene.fog is now the
  // entire fog story for this material and that should be legible at the call
  // site rather than inherited.
  //
  // The old `toneMapped = false` went with it. WebGPURenderer never reads
  // material.toneMapped - `grep -c toneMapped three/build/three.webgpu.js`
  // returns 0 in the un-minified build production loads - because tone mapping
  // there is one full-screen pass over the finished frame, not an inline step
  // like WebGLRenderer's. The water has been tone mapped all along; the flag
  // was a WebGL-shaped assumption with no effect, and deleting it changes no
  // pixels while removing the false claim that this material lives in a
  // different output space from the terrain it meets at the shoreline.
  material.colorNode = colorWithFoam;
  material.fog = true;
  material.side = DoubleSide;
  material.depthWrite = true;
  material.depthTest = true;
  material.userData.webgpuWaterFogSource = 'scene-fog';
  material.userData.webgpuWaterColorScale = water.colorScale;
  material.userData.webgpuWaterFoamScale = water.foamScale;
  material.userData.webgpuWaterSparkleScale = water.sparkleScale;
  material.userData.webgpuWaterMinDepthT = minDepthT;
  material.userData.webgpuWaterWorldSpaceHeightfield = true;
  material.userData.webgpuWaterSunCameraGlint = true;
  material.userData.webgpuWaterGlintMode = 'masked-flat-normal-broad-sun-path-plus-ripple-v4';
  material.userData.webgpuWaterGlintGain = broadGlintGain;
  material.userData.webgpuWaterRippleGlintGain = rippleGlintGain;
  material.userData.webgpuWaterSunSpecularIntensity = water.sunSpecularIntensity ?? 0.6;
  material.userData.webgpuWaterRippleLightScale = rippleLightScale;
  // Cycle 118 Phase 2: the resolved palette and the space it is resolved in,
  // recorded next to the rest of the tuning so a probe can prove both render
  // paths landed on the same three colours. webgpuWaterColorTint retired with
  // the tint itself; nothing read it (js/main.js's visual probe reads the
  // scalar keys, water-look.mjs's nodeTuning filter skipped arrays already).
  material.userData.webgpuWaterColorSpace = WATER_COLOR_SPACE;
  material.userData.webgpuWaterPaletteLinear = paletteLinear;
  material.userData.webgpuWaterSlopeScale = WATER_SLOPE_SCALE;
  material.userData.webgpuWaterSunColorSource = water.sunColorSource ?? 'skyFog.sunColor';
  material.userData.webgpuWaterNodeUniforms = {
    sunDirection,
    sunColor,
    sparkleStrength,
    sunSpecularIntensity,
    waterTime,
  };
  material.userData.webgpuWaterMaterialControls = createAnimeWaterNodeMaterialControls(material);
  return material;
}

function createAnimeWaterNodeMaterialControls(material) {
  const nodes = material.userData.webgpuWaterNodeUniforms;
  return {
    nodes,
    update(state = {}) {
      if (state.sunDirection && nodes.sunDirection?.value) {
        nodes.sunDirection.value.copy(state.sunDirection);
      }
      if (state.sunColor && nodes.sunColor?.value) {
        copyColorLike(nodes.sunColor.value, state.sunColor, true);
      }
      if (Number.isFinite(state.sparkleStrength)) {
        nodes.sparkleStrength.value = state.sparkleStrength;
      }
      if (Number.isFinite(state.sunSpecularIntensity)) {
        nodes.sunSpecularIntensity.value = state.sunSpecularIntensity;
      }
      // Cycle 118 Phase 5: the branch that did not exist. AnimeWater#update has
      // routed timeSec here since the node path shipped and it went nowhere,
      // because the surface animated off TSL `time` instead. This is what makes
      // main.js's clock the water's clock.
      if (Number.isFinite(state.timeSec)) {
        nodes.waterTime.value = state.timeSec;
      }
    },
    dispose() {},
  };
}

function copyColorLike(target, value, linearize = false) {
  const channel = linearize ? rawChannelToLinear : (v) => v;
  if (Number.isFinite(value?.x) && Number.isFinite(value?.y) && Number.isFinite(value?.z)) {
    target.set?.(channel(value.x), channel(value.y), channel(value.z));
    return;
  }
  if (Number.isFinite(value?.r) && Number.isFinite(value?.g) && Number.isFinite(value?.b)) {
    target.set?.(channel(value.r), channel(value.g), channel(value.b));
  }
}

function rawChannelToLinear(value) {
  return Math.max(0, Number(value) || 0);
}
