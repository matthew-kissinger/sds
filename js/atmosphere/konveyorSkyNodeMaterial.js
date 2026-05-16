export function createKonveyorSkyFogNodeMaterial(
  { MeshBasicNodeMaterial, TSL, side = null },
  skyFog,
  { name = 'konveyor-node-sky-fog', tuning = {} } = {}
) {
  const { cameraPosition, clamp, float, length, mix, normalize, positionWorld, pow, smoothstep, uv, vec2, vec3 } = TSL;
  const linearColor = (color) => color.map((value) => (
    value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4
  ));
  const skyUv = uv();
  const skyY = clamp(normalize(positionWorld.sub(cameraPosition)).y, 0.0, 1.0);
  const horizon = vec3(...linearColor(skyFog.horizonColor));
  const zenith = vec3(...linearColor(skyFog.zenithColor));
  const sunColor = vec3(...linearColor(skyFog.sunColor));
  const fogColor = vec3(...linearColor(skyFog.fogColor));
  const lowTint = tuning.lowTint ?? [0.40, 0.66, 0.80];
  const highTint = tuning.highTint ?? [0.39, 0.56, 0.66];
  const lowSky = mix(zenith, horizon, 0.42).mul(vec3(...lowTint));
  const highSky = zenith.mul(vec3(...highTint));
  const vertical = smoothstep(0.03, 0.55, skyY);
  const sunDelta = vec2(skyUv.x, skyY).sub(vec2(...skyFog.sunPositionUv));
  const sunDistance = length(sunDelta);
  const sunDisc = float(1.0).sub(smoothstep(0.018, 0.052, sunDistance));
  const sunGlow = pow(float(1.0).sub(smoothstep(0.0, 0.42, sunDistance)), 2.2);
  const fogBand = float(1.0).sub(smoothstep(0.02, 0.24, skyY));
  const skyColor = mix(lowSky, highSky, vertical)
    .add(sunColor.mul(sunGlow.mul(tuning.sunGlowStrength ?? 0.08)))
    .add(vec3(1.0, 0.95, 0.82).mul(sunDisc.mul(tuning.sunDiscStrength ?? 0.24)));

  const material = new MeshBasicNodeMaterial();
  material.name = name;
  material.colorNode = mix(skyColor, fogColor, fogBand.mul(tuning.fogBandStrength ?? 0.08));
  material.depthWrite = false;
  material.depthTest = false;
  material.fog = false;
  material.toneMapped = true;
  material.userData.konveyorSkyPresetTuning = {
    presetName: skyFog.presetName ?? null,
    lowTint,
    highTint,
    sunGlowStrength: tuning.sunGlowStrength ?? 0.08,
    sunDiscStrength: tuning.sunDiscStrength ?? 0.24,
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
