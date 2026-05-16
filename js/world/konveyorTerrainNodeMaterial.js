export function createKonveyorTerrainHeightfieldNodeMaterial(
  { MeshLambertNodeMaterial, DoubleSide, TSL },
  terrain,
  heightTexture
) {
  const { clamp, dot, float, floor, fract, length, max, mix, positionView, positionWorld, smoothstep, texture, uv, vec2, vec3 } = TSL;
  const linearColor = (color) => color;
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
  const fbm = (p) => valueNoise(p).mul(0.5)
    .add(valueNoise(p.mul(2.03)).mul(0.25))
    .add(valueNoise(p.mul(4.1209)).mul(0.125))
    .add(valueNoise(p.mul(8.365427)).mul(0.0625));
  const groundUv = uv();
  const worldXZ = vec2(positionWorld.x, positionWorld.z);
  const n1 = fbm(worldXZ.mul(0.020));
  const n2 = fbm(worldXZ.mul(0.052).add(vec2(37.0, 91.0)));
  const n3 = valueNoise(worldXZ.mul(0.115).add(vec2(11.0, 23.0)));
  const height01 = clamp(texture(heightTexture, groundUv).r, 0.0, 1.0);
  const heightLift = smoothstep(0.16, 0.82, height01);
  const low = vec3(...linearColor(terrain.lowColor));
  const mid = vec3(...linearColor(terrain.midColor));
  const high = vec3(...linearColor(terrain.highColor));
  const dirt = vec3(...linearColor(terrain.dirtColor ?? [0.42, 0.36, 0.29]));
  const midBlend = clamp(n1.mul(0.78).add(heightLift.mul(0.22)), 0.0, 1.0);
  const highBlend = clamp(n2.mul(0.38).add(heightLift.mul(0.24)), 0.0, 0.78);
  const dirtMask = smoothstep(0.54, 0.74, n1.mul(n2));
  const detail = float(0.88).add(n3.mul(0.20));
  const ao = float(0.86).add(n1.mul(0.14));
  const baseColor = mix(
    mix(mix(low, mid, midBlend), high, highBlend),
    dirt,
    dirtMask.mul(terrain.dirtStrength ?? 0.26)
  ).mul(detail).mul(ao);
  const distantFog = smoothstep(terrain.fogNear ?? 220, terrain.fogFar ?? 900, length(positionView))
    .mul(terrain.fogStrength ?? 0.34);
  const horizonFog = smoothstep(0.78, 1.0, groundUv.y).mul(terrain.horizonFogStrength ?? 0.14);
  const fogBlend = max(distantFog, horizonFog);

  const material = new MeshLambertNodeMaterial();
  material.name = 'konveyor-node-terrain-heightfield';
  const colorScale = terrain.colorScale ?? 0.92;
  material.colorNode = mix(baseColor.mul(float(colorScale)), vec3(...linearColor(terrain.fogColor)), fogBlend);
  material.side = terrain.side ?? DoubleSide;
  material.polygonOffset = terrain.polygonOffset?.enabled ?? false;
  material.polygonOffsetFactor = terrain.polygonOffset?.factor ?? 0;
  material.polygonOffsetUnits = terrain.polygonOffset?.units ?? 0;
  material.toneMapped = true;
  material.userData.konveyorTerrainColorScale = colorScale;
  material.userData.konveyorTerrainVisualPolish = 'world-noise-heightfield-blend';
  return material;
}
