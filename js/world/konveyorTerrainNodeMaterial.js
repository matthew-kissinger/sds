export function createKonveyorTerrainHeightfieldNodeMaterial(
  { MeshLambertNodeMaterial, DoubleSide, TSL },
  terrain,
  heightTexture
) {
  const { float, mix, smoothstep, texture, uv, vec3 } = TSL;
  const linearColor = (color) => color.map((value) => (
    value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4
  ));
  const groundUv = uv();
  const heightMeters = texture(heightTexture, groundUv).r.mul(terrain.peakHeight);
  const midBlend = smoothstep(0.45, 2.4, heightMeters);
  const highBlend = smoothstep(2.2, 5.0, heightMeters);
  const baseColor = mix(
    mix(vec3(...linearColor(terrain.lowColor)), vec3(...linearColor(terrain.midColor)), midBlend),
    vec3(...linearColor(terrain.highColor)),
    highBlend
  );
  const fogBlend = smoothstep(0.72, 1.0, groundUv.y).mul(0.42);

  const material = new MeshLambertNodeMaterial();
  material.name = 'konveyor-node-terrain-heightfield';
  const colorScale = terrain.colorScale ?? 0.92;
  material.colorNode = mix(baseColor.mul(float(colorScale)), vec3(...linearColor(terrain.fogColor)), fogBlend);
  material.side = terrain.side ?? DoubleSide;
  material.polygonOffset = terrain.polygonOffset?.enabled ?? false;
  material.polygonOffsetFactor = terrain.polygonOffset?.factor ?? 0;
  material.polygonOffsetUnits = terrain.polygonOffset?.units ?? 0;
  material.toneMapped = false;
  material.userData.konveyorTerrainColorScale = colorScale;
  return material;
}
