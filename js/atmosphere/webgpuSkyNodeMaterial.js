// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
export function createWebGpuSkyFogNodeMaterial(
  { MeshBasicNodeMaterial, TSL, Vector3, side = null },
  skyFog,
  { name = 'webgpu-node-sky-fog', tuning = {} } = {}
) {
  const { cameraPosition, clamp, dot, float, max, mix, normalize, positionWorld, pow, smoothstep, uniform, vec3 } = TSL;
  const vector3 = (value, fallback) => {
    const source = Array.isArray(value) ? value : fallback;
    return new Vector3(source[0], source[1], source[2]);
  };
  const color3 = (value, fallback) => {
    const source = Array.isArray(value) ? value : fallback;
    return new Vector3(
      rawChannelToLinear(source[0]),
      rawChannelToLinear(source[1]),
      rawChannelToLinear(source[2])
    );
  };
  const linearColor = (color) => color;
  const skyY = clamp(normalize(positionWorld.sub(cameraPosition)).y, 0.0, 1.0);
  const viewDir = normalize(positionWorld.sub(cameraPosition));
  const sunDirection = uniform(vector3(skyFog.sunDirection, [0.42, 0.78, 0.32]).normalize());
  const horizon = uniform(color3(linearColor(skyFog.horizonColor), [0.46, 0.50, 0.55]));
  const zenith = uniform(color3(linearColor(skyFog.zenithColor), [0.18, 0.28, 0.40]));
  const sunColor = uniform(color3(linearColor(skyFog.sunColor), [1.0, 0.56, 0.20]));
  const fogColor = uniform(color3(linearColor(skyFog.fogColor), [0.30, 0.28, 0.28]));
  const lowTint = tuning.lowTint ?? [0.40, 0.66, 0.80];
  const highTint = tuning.highTint ?? [0.39, 0.56, 0.66];
  const lowLift = tuning.lowLift ?? [0.0, 0.0, 0.0];
  const highLift = tuning.highLift ?? [0.0, 0.0, 0.0];
  const lowSky = mix(zenith, horizon, 0.50).mul(vec3(...lowTint)).add(vec3(...lowLift));
  const highSky = zenith.mul(vec3(...highTint)).add(vec3(...highLift));
  const vertical = smoothstep(tuning.verticalStart ?? 0.03, tuning.verticalEnd ?? 0.55, skyY);

  // Cycle 39 Phase B: Mie aureole via Henyey-Greenstein phase function.
  // cosTheta is the angle between the view direction and the sun direction;
  // a forward-scattering HG (g ~ 0.8) gives the bright halo around the sun.
  // When the sun is near the horizon, the same function evaluated at horizon
  // viewing angles becomes the warm horizon glow naturally — same function,
  // no separate horizon-glow term to color-match. This replaces an ad-hoc
  // smoothstep band-aid (`pow(smoothstep(0.56, 1.0, cosTheta), 2.4)`).
  // mieAureolePhaseHG (the CPU-side helper in js/atmosphere/sunChromaticity.js)
  // mirrors this exact formula for any caller that needs the same value off
  // the GPU.
  const cosTheta = max(dot(viewDir, sunDirection), 0.0);
  const aureoleG = tuning.aureoleG ?? 0.80;
  const g2 = aureoleG * aureoleG;
  const hgDenom = pow(
    max(float(1.0 + g2).sub(float(2.0 * aureoleG).mul(cosTheta)), 0.0001),
    1.5
  );
  const aureole = float(1.0 - g2).div(hgDenom);
  // Normalize the HG phase function (which spans ~0.06 to ~45 at g=0.8)
  // into a 0..1.2 range so the per-preset `sunGlowStrength` knob lands in
  // a similar visible range as the prior approximation. Phase E coherence
  // pass tunes if any preset drifts.
  const aureoleNormalized = clamp(aureole.mul(0.04), 0.0, 1.2);

  const fogBand = float(1.0).sub(smoothstep(0.0, 0.38, skyY));
  const aureoleColor = tuning.aureoleColor ?? [1.0, 0.92, 0.76];
  const sunMassColor = tuning.sunMassColor ?? [1.0, 0.68, 0.28];
  const sunMassPaintColor = tuning.sunMassPaintColor ?? sunMassColor;
  const sunMassShape = smoothstep(tuning.sunMassStart ?? 0.94, tuning.sunMassEnd ?? 0.998, cosTheta);
  const sunMassPaint = clamp(sunMassShape.mul(tuning.sunMassPaintStrength ?? 0.0), 0.0, 1.0);
  const sunMass = pow(sunMassShape, tuning.sunMassPower ?? 1.0)
    .mul(tuning.sunMassStrength ?? 0.38);
  const skyBaseWithAureole = mix(lowSky, highSky, vertical)
    .mul(tuning.skyBaseScale ?? 0.62)
    .add(vec3(...aureoleColor).mul(aureoleNormalized.mul(tuning.sunGlowStrength ?? 0.12)));
  const skyColor = mix(skyBaseWithAureole, vec3(...sunMassPaintColor), sunMassPaint)
    .add(vec3(...sunMassColor).mul(sunMass));

  const material = new MeshBasicNodeMaterial();
  material.name = name;
  material.colorNode = mix(skyColor, fogColor, fogBand.mul(tuning.fogBandStrength ?? 0.08));
  material.depthWrite = false;
  material.depthTest = false;
  material.fog = false;
  material.toneMapped = false;
  material.userData.webgpuSkyNodeUniforms = {
    sunDirection,
    horizon,
    zenith,
    sunColor,
    fogColor,
  };
  material.userData.webgpuSkyPresetTuning = {
    presetName: skyFog.presetName ?? null,
    lowTint,
    highTint,
    lowLift,
    highLift,
    verticalStart: tuning.verticalStart ?? 0.03,
    verticalEnd: tuning.verticalEnd ?? 0.55,
    sunGlowStrength: tuning.sunGlowStrength ?? 0.12,
    sunDiscStrength: 0,
    sunDiscOwner: 'SunBillboard',
    aureoleG,
    skyBaseScale: tuning.skyBaseScale ?? 0.62,
    sunMassStrength: tuning.sunMassStrength ?? 0.38,
    sunMassStart: tuning.sunMassStart ?? 0.94,
    sunMassEnd: tuning.sunMassEnd ?? 0.998,
    sunMassPower: tuning.sunMassPower ?? 1.0,
    sunMassColor,
    sunMassPaintColor,
    sunMassPaintStrength: tuning.sunMassPaintStrength ?? 0.0,
    aureoleColor,
    ownership: 'sky-painted-sun-body-aureole-and-horizon-glow',
    fogBandStrength: tuning.fogBandStrength ?? 0.08,
  };
  if (side !== null) {
    material.side = side;
  }
  material.userData.webgpuSkyMaterialControls = createSkyNodeMaterialControls(material);
  return material;
}

export function createWebGpuSkyDomeMaterialFactories(webGpuModules, skyFog, tuning = {}) {
  return {
    createSkyDomeMaterial: () => {
      const material = createWebGpuSkyFogNodeMaterial(
        { ...webGpuModules, side: webGpuModules.BackSide },
        skyFog,
        { name: 'webgpu-node-sky-dome', tuning }
      );
      return {
        material,
        controls: material.userData.webgpuSkyMaterialControls,
      };
    },
  };
}

function createSkyNodeMaterialControls(material) {
  const nodes = material.userData.webgpuSkyNodeUniforms;
  return {
    nodes,
    update(state = {}) {
      copyVec3(nodes.sunDirection?.value, state.sunDirection);
      nodes.sunDirection?.value?.normalize?.();
      copyColorVec3(nodes.horizon?.value, state.horizonColor);
      copyColorVec3(nodes.zenith?.value, state.zenithColor);
      copyColorVec3(nodes.sunColor?.value, state.sunColor);
      copyColorVec3(nodes.fogColor?.value, state.fogColor);
    },
  };
}

function copyVec3(target, value) {
  if (!target || !value) return;
  if (Array.isArray(value) && value.length >= 3) {
    target.set(value[0], value[1], value[2]);
    return;
  }
  if (Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z)) {
    target.copy?.(value);
    return;
  }
  if (Number.isFinite(value.r) && Number.isFinite(value.g) && Number.isFinite(value.b)) {
    target.set(value.r, value.g, value.b);
  }
}

function copyColorVec3(target, value) {
  if (!target || !value) return;
  if (Array.isArray(value) && value.length >= 3) {
    target.set(
      rawChannelToLinear(value[0]),
      rawChannelToLinear(value[1]),
      rawChannelToLinear(value[2])
    );
    return;
  }
  if (Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z)) {
    target.set(
      rawChannelToLinear(value.x),
      rawChannelToLinear(value.y),
      rawChannelToLinear(value.z)
    );
    return;
  }
  if (Number.isFinite(value.r) && Number.isFinite(value.g) && Number.isFinite(value.b)) {
    target.set(
      rawChannelToLinear(value.r),
      rawChannelToLinear(value.g),
      rawChannelToLinear(value.b)
    );
  }
}

function rawChannelToLinear(value) {
  return Math.max(0, Number(value) || 0);
}
