export function createKonveyorTreeLeafNodeMaterial({ MeshStandardNodeMaterial, DoubleSide, TSL }, treeLeaf) {
  const { abs, clamp, dot, float, floor, fract, length, mix, normalize, positionLocal, positionWorld, screenCoordinate, sin, smoothstep, time, uv, vec2, vec3 } = TSL;
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
  const windDisp = windDir.mul(carrier.mul(treeLeaf.windStrength * 0.18).mul(windWeight))
    .add(windPerp.mul(flutter.mul(0.05 * treeLeaf.windStrength).mul(windWeight)));
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

  const material = new MeshStandardNodeMaterial();
  material.name = 'konveyor-node-leaves';
  material.colorNode = mix(vec3(...treeLeaf.baseColor), vec3(...treeLeaf.tipColor), posY01)
    .mul(mix(0.72, 1.14, midrib));
  material.opacityNode = alpha;
  material.positionNode = positionLocal.add(vec3(windDisp.x, 0.0, windDisp.y));
  material.roughnessNode = float(0.92);
  material.metalnessNode = float(0.0);
  material.alphaHash = treeLeaf.alphaHash;
  material.alphaTest = treeLeaf.alphaTest;
  material.side = treeLeaf.side ?? DoubleSide;
  material.transparent = treeLeaf.transparent ?? false;
  material.depthWrite = treeLeaf.depthWrite ?? true;
  material.depthTest = treeLeaf.depthTest ?? true;
  return material;
}
