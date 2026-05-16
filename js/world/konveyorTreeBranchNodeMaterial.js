export function createKonveyorTreeBranchNodeMaterial({ MeshStandardNodeMaterial, TSL }, treeBranch = {}) {
  const { float, length, mix, positionView, smoothstep, vec3 } = TSL;
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
  const fogColor = vec3(...linearColor(treeBranch.fogColor ?? [0.5651, 0.6333, 0.6665])).mul(treeBranch.fogColorScale ?? 0.62);
  const fogBlend = smoothstep(treeBranch.fogNear ?? 220, treeBranch.fogFar ?? 700, length(positionView))
    .mul(treeBranch.fogStrength ?? 0.72);
  material.colorNode = mix(vec3(...color), fogColor, fogBlend);
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
