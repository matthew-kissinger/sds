export function createKonveyorTreeLeafNodeMaterial({ MeshStandardNodeMaterial, DoubleSide, TSL }, treeLeaf) {
  const { abs, clamp, dot, float, floor, fract, length, mix, normalize, positionLocal, positionView, positionWorld, screenCoordinate, sin, smoothstep, texture, time, uv, vec2, vec3 } = TSL;
  const linearColor = (color) => color.map((value) => (
    value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4
  ));
  const leafUv = uv();
  const windDir = normalize(vec2(...treeLeaf.windDirection));
  const windPerp = vec2(-treeLeaf.windDirection[1], treeLeaf.windDirection[0]);
  const treeRange = Math.max(treeLeaf.treeTopY - treeLeaf.treeBaseY, 0.001);
  const posY01 = clamp(positionLocal.y.sub(treeLeaf.treeBaseY).div(treeRange), 0.0, 1.0);
  const windWeightBase = smoothstep(0.25, 1.0, posY01);
  const windWeight = windWeightBase.mul(windWeightBase);
  const worldX = positionWorld.x;
  const worldZ = positionWorld.z;
  const gustA = sin(worldX.mul(0.04).add(worldZ.mul(0.034)).sub(time.mul(0.84)));
  const gustB = sin(worldX.mul(0.018).add(worldZ.mul(0.022)).add(1.4).sub(time.mul(0.62)));
  const gustEnv = smoothstep(-0.2, 1.0, gustA.mul(0.6).add(gustB.mul(0.4)));
  const sway1 = sin(worldX.mul(0.15).add(worldZ.mul(0.11)).add(time.mul(0.85)));
  const sway2 = sin(worldX.mul(0.07).sub(worldZ.mul(0.13)).add(time.mul(0.55)));
  const sway = sway1.mul(0.6).add(sway2.mul(0.4));
  const carrier = sway.mul(float(0.4).add(gustEnv.mul(0.8)));
  const flutter = sin(worldX.mul(0.6).add(worldZ.mul(0.5)).add(time.mul(4.5)));
  const windDisp = windDir.mul(carrier.mul(treeLeaf.windStrength * 0.10).mul(windWeight))
    .add(windPerp.mul(flutter.mul(0.02 * treeLeaf.windStrength).mul(windWeight)));
  const leafCenter = leafUv.sub(vec2(0.5, 0.52));
  const leafRadius = length(vec2(leafCenter.x.mul(1.28), leafCenter.y.mul(0.82)));
  const leafShape = float(1.0).sub(smoothstep(0.42, 0.56, leafRadius));
  const midrib = float(1.0).sub(smoothstep(0.25, 0.85, abs(leafUv.x.sub(0.5)).mul(2.0)));
  const screenHash = fract(sin(dot(floor(screenCoordinate), vec2(17.0, 131.0))).mul(43758.5453));
  const occluderFade = float(1.0)
    .sub(smoothstep(0.16, 0.36, length(leafUv.sub(vec2(...treeLeaf.occluderUv)))))
    .mul(treeLeaf.occluderStrength);
  const alpha = leafShape
    .mul(float(1.0).sub(occluderFade.mul(treeLeaf.occluderPeak).mul(mix(0.65, 1.0, screenHash))));
  const tintColor = treeLeaf.tintColorLinear
    ? treeLeaf.tintColor
    : linearColor(treeLeaf.tintColor ?? [1.0, 1.0, 1.0]);
  const proceduralColor = mix(vec3(...linearColor(treeLeaf.baseColor)), vec3(...linearColor(treeLeaf.tipColor)), posY01)
    .mul(mix(0.72, 1.14, midrib));
  const sampled = treeLeaf.map && typeof texture === 'function'
    ? texture(treeLeaf.map, leafUv)
    : null;
  const baseColor = sampled
    ? sampled.rgb.mul(vec3(...tintColor)).mul(treeLeaf.sourceMapScale ?? 0.58)
    : proceduralColor;
  const colorScale = treeLeaf.colorScale ?? 1;
  const fogColor = vec3(...linearColor(treeLeaf.fogColor ?? [0.5651, 0.6333, 0.6665])).mul(treeLeaf.fogColorScale ?? 0.62);
  const fogBlend = smoothstep(treeLeaf.fogNear ?? 220, treeLeaf.fogFar ?? 700, length(positionView))
    .mul(treeLeaf.fogStrength ?? 0.72);

  const material = new MeshStandardNodeMaterial();
  material.name = 'konveyor-node-leaves';
  material.colorNode = mix(baseColor.mul(colorScale), fogColor, fogBlend);
  const alphaScale = treeLeaf.alphaScale ?? 1;
  material.opacityNode = sampled
    ? sampled.a.mul(alphaScale).mul(float(1.0).sub(occluderFade.mul(treeLeaf.occluderPeak).mul(mix(0.65, 1.0, screenHash))))
    : alpha.mul(alphaScale);
  material.positionNode = positionLocal.add(vec3(windDisp.x, 0.0, windDisp.y));
  material.roughnessNode = float(treeLeaf.roughness ?? 0.92);
  material.metalnessNode = float(treeLeaf.metalness ?? 0.0);
  material.userData.konveyorUsesSourceMap = !!sampled;
  material.userData.konveyorUsesSourceTint = treeLeaf.tintColorLinear === true;
  material.userData.konveyorUsesDistanceFog = true;
  material.userData.konveyorSourceMapScale = treeLeaf.sourceMapScale ?? 0.58;
  material.userData.konveyorLeafColorScale = colorScale;
  material.userData.konveyorLeafAlphaScale = alphaScale;
  material.alphaHash = treeLeaf.alphaHash;
  material.alphaTest = treeLeaf.alphaTest;
  material.side = treeLeaf.side ?? DoubleSide;
  material.transparent = treeLeaf.transparent ?? false;
  material.depthWrite = treeLeaf.depthWrite ?? true;
  material.depthTest = treeLeaf.depthTest ?? true;
  return material;
}
