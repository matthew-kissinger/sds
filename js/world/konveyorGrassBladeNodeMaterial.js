export function createKonveyorGrassBladeNodeMaterial(
  { MeshStandardNodeMaterial, DoubleSide, TSL },
  grassBlade
) {
  const { abs, clamp, dot, float, length, max, mix, normalize, positionLocal, positionView, positionWorld, pow, sin, smoothstep, time, uv, vec2, vec3 } = TSL;
  const bladeUv = uv();
  const height01 = clamp(positionLocal.y.div(Math.max(grassBlade.bladeHeight, 0.001)), 0.0, 1.0);
  const windDir = normalize(vec2(...grassBlade.windDirection));
  const windPerp = vec2(-grassBlade.windDirection[1], grassBlade.windDirection[0]);
  const windPower = height01.mul(height01);
  const worldX = positionWorld.x;
  const worldZ = positionWorld.z;
  const gustFlow = time.mul(grassBlade.windSpeed * 1.5);
  const gustA = sin(worldX.mul(0.045).add(worldZ.mul(0.038)).sub(gustFlow));
  const gustB = sin(worldX.mul(0.022).add(worldZ.mul(0.029)).add(1.7).sub(gustFlow.mul(0.72)));
  const gustEnv = smoothstep(-0.2, 1.0, gustA.mul(0.6).add(gustB.mul(0.4)));
  const swayTime = time.mul(grassBlade.windSpeed);
  const sway1 = sin(worldX.mul(0.13).add(worldZ.mul(0.09)).add(swayTime.mul(0.85)));
  const sway2 = sin(worldX.mul(0.07).sub(worldZ.mul(0.11)).add(swayTime.mul(0.55)).add(1.3));
  const sway = sway1.mul(0.6).add(sway2.mul(0.4));
  const carrier = float(0.45).add(sway.mul(0.5).mul(float(0.4).add(gustEnv.mul(0.8))));
  const tipMask = smoothstep(0.65, 1.0, height01);
  const flutter = sin(worldX.mul(0.7).add(worldZ.mul(0.6)).add(time.mul(4.5)));
  const windDisp = windDir.mul(carrier.mul(grassBlade.windStrength).mul(windPower))
    .add(windPerp.mul(flutter.mul(0.06 * grassBlade.windStrength).mul(tipMask)));
  const centerDist = abs(bladeUv.x.sub(0.5)).mul(2.0);
  const taperWidth = mix(0.9, 0.18, height01);
  const bladeShape = float(1.0).sub(smoothstep(taperWidth, taperWidth.add(0.16), centerDist));
  const gradient = mix(
    mix(vec3(...grassBlade.baseColor), vec3(...grassBlade.midColor), smoothstep(0.0, 0.4, height01)),
    vec3(...grassBlade.tipColor),
    smoothstep(0.4, 1.0, height01)
  );
  const colorVariation = smoothstep(-1.0, 1.0, sin(worldX.mul(0.2).add(worldZ.mul(0.15))));
  const variation = vec3(
    colorVariation.mul(0.08),
    colorVariation.mul(0.05).sub(0.02),
    colorVariation.mul(-0.03)
  );
  const ao = mix(0.7, 1.0, height01);
  const sunLift = max(dot(normalize(vec3(...grassBlade.sunDirection)), vec3(0.0, 1.0, 0.0)), 0.0);
  const sunTip = vec3(...grassBlade.sunColor).mul(tipMask.mul(sunLift).mul(0.16 + grassBlade.gustStrength));
  const viewDir = normalize(positionView.negate());
  const verticalRim = pow(max(dot(viewDir, vec3(0.0, 1.0, 0.0)), 0.0), 4.0);
  const viewDistance = length(positionView);
  const fogBlend = smoothstep(grassBlade.fogNear, grassBlade.fogFar, viewDistance).mul(0.55);
  const densityFade = float(1.0).sub(
    smoothstep(grassBlade.grassFadeStart, grassBlade.grassFadeEnd, viewDistance)
      .mul(grassBlade.distanceFadeStrength)
  );

  const material = new MeshStandardNodeMaterial();
  material.name = 'konveyor-node-grass-blade';
  material.colorNode = mix(
    gradient.add(variation).mul(ao)
      .add(sunTip)
      .add(vec3(...grassBlade.tipColor).mul(verticalRim.mul(0.2).mul(tipMask))),
    vec3(...grassBlade.fogColor),
    fogBlend
  );
  material.opacityNode = bladeShape.mul(densityFade);
  material.positionNode = positionLocal.add(vec3(windDisp.x, 0.0, windDisp.y));
  material.roughnessNode = float(0.96);
  material.metalnessNode = float(0.0);
  material.alphaHash = grassBlade.alphaHash;
  material.alphaTest = grassBlade.alphaTest;
  material.side = grassBlade.side ?? DoubleSide;
  material.transparent = grassBlade.transparent ?? false;
  material.depthWrite = grassBlade.depthWrite ?? true;
  material.depthTest = grassBlade.depthTest ?? true;
  return material;
}
