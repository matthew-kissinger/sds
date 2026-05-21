export function createKonveyorSkyFogNodeMaterial(
  { MeshBasicNodeMaterial, TSL, side = null },
  skyFog,
  { name = 'konveyor-node-sky-fog', tuning = {} } = {}
) {
  const { cameraPosition, clamp, dot, float, max, mix, normalize, positionWorld, pow, smoothstep, vec3 } = TSL;
  const linearColor = (color) => color;
  const skyY = clamp(normalize(positionWorld.sub(cameraPosition)).y, 0.0, 1.0);
  const viewDir = normalize(positionWorld.sub(cameraPosition));
  const sunDirection = normalize(vec3(...(skyFog.sunDirection ?? [0.42, 0.78, 0.32])));
  const horizon = vec3(...linearColor(skyFog.horizonColor));
  const zenith = vec3(...linearColor(skyFog.zenithColor));
  const sunColor = vec3(...linearColor(skyFog.sunColor));
  const fogColor = vec3(...linearColor(skyFog.fogColor));
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
  const skyColor = mix(lowSky, highSky, vertical)
    .add(sunColor.mul(aureoleNormalized.mul(tuning.sunGlowStrength ?? 0.12)));

  const material = new MeshBasicNodeMaterial();
  material.name = name;
  material.colorNode = mix(skyColor, fogColor, fogBand.mul(tuning.fogBandStrength ?? 0.08));
  material.depthWrite = false;
  material.depthTest = false;
  material.fog = false;
  material.toneMapped = false;
  material.userData.konveyorSkyPresetTuning = {
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
    ownership: 'sky-aureole-and-horizon-glow',
    fogBandStrength: tuning.fogBandStrength ?? 0.08,
  };
  if (side !== null) {
    material.side = side;
  }
  return material;
}

export function createKonveyorSkyDomeMaterialFactories(webGpuModules, skyFog, tuning = {}) {
  return {
    createSkyDomeMaterial: () => ({
      material: createKonveyorSkyFogNodeMaterial(
        { ...webGpuModules, side: webGpuModules.BackSide },
        skyFog,
        { name: 'konveyor-node-sky-dome', tuning }
      ),
    }),
  };
}
