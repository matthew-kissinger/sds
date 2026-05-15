export function createKonveyorTreeBranchNodeMaterial({ MeshStandardNodeMaterial, TSL }, treeBranch = {}) {
  const { float, vec3 } = TSL;
  const material = new MeshStandardNodeMaterial();
  material.name = 'konveyor-node-branches';
  material.colorNode = vec3(...(treeBranch.baseColor ?? [0.20, 0.11, 0.055]));
  material.roughnessNode = float(treeBranch.roughness ?? 0.94);
  material.metalnessNode = float(treeBranch.metalness ?? 0.0);
  material.side = treeBranch.side ?? material.side;
  material.transparent = treeBranch.transparent ?? material.transparent;
  material.depthWrite = treeBranch.depthWrite ?? material.depthWrite;
  material.depthTest = treeBranch.depthTest ?? material.depthTest;
  return material;
}
