export function createKonveyorAnimeWaterNodeMaterial(
  { MeshBasicNodeMaterial, DoubleSide, TSL },
  water,
  heightTexture
) {
  const { abs, dot, float, floor, fract, length, max, mix, positionWorld, pow, sin, smoothstep, texture, time, uv, vec2, vec3 } = TSL;
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

  const waterUv = uv();
  const waterWorld = vec2(positionWorld.x, positionWorld.z);
  const depthT = smoothstep(0.18, 0.92, waterUv.y);
  const rippleUv = waterWorld.mul(0.035).add(vec2(time.mul(0.18), time.mul(0.08)));
  const rippleA = valueNoise(rippleUv);
  const rippleB = valueNoise(rippleUv.mul(2.35).add(vec2(time.mul(0.05), time.mul(-0.03))));
  const ripple = smoothstep(0.56, 0.66, rippleA.mul(0.68).add(rippleB.mul(0.32)))
    .mul(water.rippleStrength * 0.13);
  const slowSwell = valueNoise(waterWorld.mul(0.012).add(vec2(time.mul(0.025), time.mul(-0.018))));
  const foamNoise = valueNoise(waterWorld.mul(vec2(0.095, 0.035)).add(vec2(time.mul(0.10), 0.0)));
  const shorelineFoam = float(1.0).sub(smoothstep(0.09, 0.25, waterUv.y.add(foamNoise.mul(0.06))));
  const heightSample = texture(heightTexture, waterUv).r.mul(water.heightfieldTexture.peakHeight);
  const heightInterfaceFoam = float(1.0)
    .sub(smoothstep(0.08, 0.45, abs(heightSample.sub(water.heightfieldTexture.waterY))));
  const foamBand = max(shorelineFoam, heightInterfaceFoam.mul(0.68));
  const sunPath = float(1.0).sub(smoothstep(0.0, 0.18, abs(waterUv.x.sub(0.63).add(sin(waterUv.y.mul(7.0).add(time.mul(0.45))).mul(0.035)))))
    .mul(smoothstep(0.16, 0.82, waterUv.y));
  const glintDelta = waterUv.sub(vec2(0.72, 0.64));
  const glint = pow(float(1.0).sub(smoothstep(0.0, 0.42, length(glintDelta))), 4.0)
    .add(sunPath.mul(0.42))
    .mul(water.sparkleStrength * water.sparkleScale);
  const fogBlend = smoothstep(0.62, 1.0, waterUv.y).mul(0.24);
  const baseColor = mix(vec3(...water.shallowColor), vec3(...water.deepColor), depthT)
    .add(vec3(ripple, ripple, ripple).mul(0.78))
    .add(vec3(0.02, 0.08, 0.10).mul(slowSwell.mul(0.34)))
    .add(vec3(...water.sunColor).mul(glint.mul(0.42)))
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
  return material;
}
