export function createKonveyorSkyFogNodeMaterial(
  { MeshBasicNodeMaterial, TSL, side = null },
  skyFog,
  { name = 'konveyor-node-sky-fog' } = {}
) {
  const { float, length, mix, pow, smoothstep, uv, vec2, vec3 } = TSL;
  const skyUv = uv();
  const horizon = vec3(...skyFog.horizonColor);
  const zenith = vec3(...skyFog.zenithColor);
  const sunColor = vec3(...skyFog.sunColor);
  const fogColor = vec3(...skyFog.fogColor);
  const vertical = smoothstep(0.02, 0.92, skyUv.y);
  const sunDelta = skyUv.sub(vec2(...skyFog.sunPositionUv));
  const sunDistance = length(sunDelta);
  const sunDisc = float(1.0).sub(smoothstep(0.018, 0.052, sunDistance));
  const sunGlow = pow(float(1.0).sub(smoothstep(0.0, 0.42, sunDistance)), 2.2);
  const fogBand = float(1.0).sub(smoothstep(0.12, 0.48, skyUv.y));
  const skyColor = mix(horizon, zenith, vertical)
    .add(sunColor.mul(sunGlow.mul(0.42)))
    .add(vec3(1.0, 0.95, 0.82).mul(sunDisc.mul(0.7)));

  const material = new MeshBasicNodeMaterial();
  material.name = name;
  material.colorNode = mix(skyColor, fogColor, fogBand.mul(0.58));
  material.depthWrite = false;
  material.depthTest = false;
  if (side !== null) {
    material.side = side;
  }
  return material;
}

export function createKonveyorSkyDomeMaterialFactories(webGpuModules, skyFog) {
  return {
    createSkyDomeMaterial: () => ({
      material: createKonveyorSkyFogNodeMaterial(
        { ...webGpuModules, side: webGpuModules.BackSide },
        skyFog,
        { name: 'konveyor-node-sky-dome' }
      ),
    }),
  };
}
