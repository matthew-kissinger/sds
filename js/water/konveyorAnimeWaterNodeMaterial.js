import { Vector3 as ThreeVector3 } from 'three';

export function createKonveyorAnimeWaterNodeMaterial(
  { MeshBasicNodeMaterial, DoubleSide, TSL },
  water,
  heightTexture
) {
  const { abs, cameraPosition, clamp, dot, float, floor, fract, length, max, mix, normalize, positionWorld, pow, sin, smoothstep, texture, time, uniform, vec2, vec3 } = TSL;
  const hash21 = (p) => {
    const q = fract(p.mul(vec2(123.34, 456.21)));
    const r = q.add(dot(q, q.add(45.32)));
    return fract(r.x.mul(r.y));
  };
  const valueNoise = (p) => {
    const i = floor(p);
    const f = fract(p);
    const a = hash21(i);
    const b = hash21(i.add(vec2(1.0, 0.0)));
    const c = hash21(i.add(vec2(0.0, 1.0)));
    const d = hash21(i.add(vec2(1.0, 1.0)));
    const u = f.mul(f).mul(vec2(3.0, 3.0).sub(f.mul(2.0)));
    return mix(a, b, u.x)
      .add(c.sub(a).mul(u.y).mul(u.x.oneMinus()))
      .add(d.sub(b).mul(u.x).mul(u.y));
  };

  const vector3 = (value) => new ThreeVector3(value[0], value[1], value[2]);
  const sunDirection = uniform(vector3(water.sunDirection));
  const sunColor = uniform(vector3(water.sunColor));
  const sparkleStrength = uniform(water.sparkleStrength);
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
  const depthFromHeightfield = smoothstep(0.2, Math.max(water.shoreline.falloff * 0.45, 0.25), terrainDepth);
  const depthT = mix(depthFromBoundary, depthFromHeightfield, hasHeightfield);
  const rippleUv = waterWorld.mul(0.035).add(vec2(time.mul(0.18), time.mul(0.08)));
  const rippleA = valueNoise(rippleUv);
  const rippleB = valueNoise(rippleUv.mul(2.35).add(vec2(time.mul(0.05), time.mul(-0.03))));
  const ripple = smoothstep(0.56, 0.66, rippleA.mul(0.68).add(rippleB.mul(0.32)))
    .mul(water.rippleStrength * 0.13);
  const slowSwell = valueNoise(waterWorld.mul(0.012).add(vec2(time.mul(0.025), time.mul(-0.018))));
  const foamNoise = valueNoise(waterWorld.mul(vec2(0.12, 0.055)).add(vec2(time.mul(0.10), 0.0)));
  const foamThickness = water.foamThickness ?? 2.5;
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
  const ROT_A = vec2(1.0, 0.0);
  const ROT_B = vec2(0.5, 0.8660254);
  const ROT_C = vec2(-0.5, 0.8660254);
  const projA = dot(waterWorld, ROT_A);
  const projB = dot(waterWorld, ROT_B);
  const projC = dot(waterWorld, ROT_C);
  const waveA = sin(projA.mul(0.052).add(time.mul(0.21)))
    .add(sin(projA.mul(0.033).sub(time.mul(0.13))).mul(0.55));
  const waveB = sin(projB.mul(0.046).add(time.mul(0.19)))
    .add(sin(projB.mul(0.029).add(time.mul(0.11))).mul(0.5));
  const waveC = sin(projC.mul(0.041).sub(time.mul(0.17)))
    .add(sin(projC.mul(0.026).add(time.mul(0.09))).mul(0.45));
  const slopeX = waveA.mul(ROT_A.x).add(waveB.mul(ROT_B.x)).add(waveC.mul(ROT_C.x)).mul(0.6667);
  const slopeZ = waveA.mul(ROT_A.y).add(waveB.mul(ROT_B.y)).add(waveC.mul(ROT_C.y)).mul(0.6667);
  const rippleNormal = normalize(vec3(slopeX.mul(0.055), 1.0, slopeZ.mul(0.055)));
  const ndh = max(dot(rippleNormal, halfVector), 0.0);
  const spec = pow(ndh, 104.0);
  const glintAxisRaw = vec2(sunDir.x.add(viewDir.x), sunDir.z.add(viewDir.z));
  const glintAxis = glintAxisRaw.div(max(length(glintAxisRaw), 0.001));
  const glintSide = vec2(glintAxis.y.negate(), glintAxis.x);
  const axisCoord = dot(waterWorld, glintAxis);
  const sideCoord = dot(waterWorld, glintSide);
  const glintMask = smoothstep(
    0.58,
    0.9,
    valueNoise(vec2(axisCoord.mul(0.055).add(time.mul(0.16)), sideCoord.mul(0.11).sub(time.mul(0.07))))
  );
  const horizonSuppression = smoothstep(0.08, 0.55, depthT);
  const glint = spec.mul(glintMask.mul(0.72).add(0.28)).mul(horizonSuppression).mul(sparkleStrength).mul(water.sparkleScale).mul(0.16);
  const fogBlend = smoothstep(0.7, 1.0, depthT).mul(0.24);
  const baseColor = mix(vec3(...water.shallowColor), vec3(...water.deepColor), depthT)
    .add(vec3(ripple, ripple, ripple).mul(0.78))
    .add(vec3(0.02, 0.08, 0.10).mul(slowSwell.mul(0.34)))
    .add(sunColor.mul(glint))
    .mul(water.colorScale);
  const colorWithFoam = mix(baseColor, vec3(...water.foamColor).mul(water.foamScale), foamBand);

  const material = new MeshBasicNodeMaterial();
  material.name = 'konveyor-node-anime-water';
  material.colorNode = mix(colorWithFoam, vec3(...water.fogColor), fogBlend);
  material.side = DoubleSide;
  material.depthWrite = true;
  material.depthTest = true;
  material.userData.konveyorWaterColorScale = water.colorScale;
  material.userData.konveyorWaterFoamScale = water.foamScale;
  material.userData.konveyorWaterSparkleScale = water.sparkleScale;
  material.userData.konveyorWaterWorldSpaceHeightfield = true;
  material.userData.konveyorWaterSunCameraGlint = true;
  material.userData.konveyorWaterGlintMode = 'ripple-normal-sun-camera-v2';
  material.userData.konveyorWaterGlintGain = 0.16;
  material.userData.konveyorWaterSunColorSource = water.sunColorSource ?? 'skyFog.sunColor';
  material.userData.konveyorWaterNodeUniforms = {
    sunDirection,
    sunColor,
    sparkleStrength,
  };
  material.userData.konveyorWaterMaterialControls = createAnimeWaterNodeMaterialControls(material);
  return material;
}

function createAnimeWaterNodeMaterialControls(material) {
  const nodes = material.userData.konveyorWaterNodeUniforms;
  return {
    nodes,
    update(state = {}) {
      if (state.sunDirection && nodes.sunDirection?.value) {
        nodes.sunDirection.value.copy(state.sunDirection);
      }
      if (state.sunColor && nodes.sunColor?.value) {
        copyColorLike(nodes.sunColor.value, state.sunColor);
      }
      if (Number.isFinite(state.sparkleStrength)) {
        nodes.sparkleStrength.value = state.sparkleStrength;
      }
    },
    dispose() {},
  };
}

function copyColorLike(target, value) {
  if (Number.isFinite(value?.x) && Number.isFinite(value?.y) && Number.isFinite(value?.z)) {
    target.copy?.(value);
    return;
  }
  if (Number.isFinite(value?.r) && Number.isFinite(value?.g) && Number.isFinite(value?.b)) {
    target.set?.(value.r, value.g, value.b);
  }
}
