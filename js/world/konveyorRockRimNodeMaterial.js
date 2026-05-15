export function createKonveyorRockRimNodeMaterial({ MeshStandardNodeMaterial, TSL }, rockRim = {}) {
  const { dot, float, max, normalize, normalView, positionView, pow, vec3 } = TSL;
  const viewDir = normalize(positionView.negate());
  const ndv = max(dot(viewDir, normalView), 0.0);
  const rim = pow(float(1.0).sub(ndv), rockRim.rimPower ?? 2.25).mul(rockRim.rimStrength ?? 0.22);

  const material = new MeshStandardNodeMaterial();
  material.name = 'konveyor-node-rock-rim';
  material.colorNode = vec3(...(rockRim.baseColor ?? [0.32, 0.29, 0.25]));
  material.emissiveNode = vec3(...(rockRim.rimColor ?? [0.7, 0.54, 0.36])).mul(rim);
  material.roughnessNode = float(rockRim.roughness ?? 0.86);
  material.metalnessNode = float(rockRim.metalness ?? 0.0);
  material.side = rockRim.side ?? material.side;
  material.transparent = rockRim.transparent ?? material.transparent;
  material.depthWrite = rockRim.depthWrite ?? material.depthWrite;
  material.depthTest = rockRim.depthTest ?? material.depthTest;
  return material;
}
