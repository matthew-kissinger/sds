export function createKonveyorTreeBranchNodeMaterial({ MeshStandardNodeMaterial, TSL }, treeBranch = {}) {
  const { clamp, float, length, mix, normalize, positionLocal, positionView, positionWorld, sin, smoothstep, time, vec2, vec3 } = TSL;
  const linearColor = (color) => color.map((value) => (
    value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4
  ));
  const color = treeBranch.baseColorLinear
    ? treeBranch.baseColor
    : linearColor(treeBranch.baseColor ?? [0.20, 0.11, 0.055]);
  const material = new MeshStandardNodeMaterial();
  material.name = 'konveyor-node-branches';
  const windDirection = treeBranch.windDirection ?? [0.7, 0.7];
  const windDir = normalize(vec2(windDirection[0], windDirection[1]));
  const treeRange = Math.max((treeBranch.treeTopY ?? 0.525) - (treeBranch.treeBaseY ?? -0.525), 0.001);
  const y01 = clamp(positionLocal.y.sub(treeBranch.treeBaseY ?? -0.525).div(treeRange), 0.0, 1.0);
  const branchWeight = smoothstep(0.32, 1.0, y01).mul(smoothstep(0.32, 1.0, y01));
  const branchSway = sin(positionWorld.x.mul(0.055).add(positionWorld.z.mul(0.041)).add(time.mul(0.62)))
    .mul(treeBranch.windStrength ?? 0.18)
    .mul(0.035)
    .mul(branchWeight);
  const fogColor = vec3(...linearColor(treeBranch.fogColor ?? [0.5651, 0.6333, 0.6665])).mul(treeBranch.fogColorScale ?? 0.62);
  const fogBlend = smoothstep(treeBranch.fogNear ?? 220, treeBranch.fogFar ?? 700, length(positionView))
    .mul(treeBranch.fogStrength ?? 0.72);
  material.colorNode = mix(vec3(...color), fogColor, fogBlend);
  material.positionNode = positionLocal.add(vec3(windDir.x.mul(branchSway), 0.0, windDir.y.mul(branchSway)));
  material.userData.konveyorUsesSourceColor = treeBranch.baseColorLinear === true;
  material.userData.konveyorUsesDistanceFog = true;
  material.roughnessNode = float(treeBranch.roughness ?? 0.94);
  material.metalnessNode = float(treeBranch.metalness ?? 0.0);
  material.side = treeBranch.side ?? material.side;
  material.transparent = treeBranch.transparent ?? material.transparent;
  material.depthWrite = treeBranch.depthWrite ?? material.depthWrite;
  material.depthTest = treeBranch.depthTest ?? material.depthTest;
  return material;
}
