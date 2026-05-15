export function createKonveyorTerrainHeightfieldNodeMaterial(
  { MeshLambertNodeMaterial, DoubleSide, TSL },
  terrain,
  heightTexture
) {
  const { float, mix, smoothstep, texture, uv, vec3 } = TSL;
  const groundUv = uv();
  const heightMeters = texture(heightTexture, groundUv).r.mul(terrain.peakHeight);
  const midBlend = smoothstep(0.45, 2.4, heightMeters);
  const highBlend = smoothstep(2.2, 5.0, heightMeters);
  const baseColor = mix(
    mix(vec3(...terrain.lowColor), vec3(...terrain.midColor), midBlend),
    vec3(...terrain.highColor),
    highBlend
  );
  const fogBlend = smoothstep(0.72, 1.0, groundUv.y).mul(0.42);

  const material = new MeshLambertNodeMaterial();
  material.name = 'konveyor-node-terrain-heightfield';
  material.colorNode = mix(baseColor.mul(float(0.92)), vec3(...terrain.fogColor), fogBlend);
  material.side = terrain.side ?? DoubleSide;
  material.polygonOffset = terrain.polygonOffset?.enabled ?? false;
  material.polygonOffsetFactor = terrain.polygonOffset?.factor ?? 0;
  material.polygonOffsetUnits = terrain.polygonOffset?.units ?? 0;
  return material;
}
