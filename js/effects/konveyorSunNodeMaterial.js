export function createKonveyorSunBillboardNodeMaterial({ MeshBasicNodeMaterial, AdditiveBlending, TSL }, sun = {}) {
  const { float, length, pow, smoothstep, uniform, uv, vec2, vec3 } = TSL;
  const d = uv().sub(vec2(0.5, 0.5));
  const r = length(d).mul(2.0);
  const core = float(1.0).sub(smoothstep(0.12, 0.22, r));
  const haloFalloff = float(1.0).sub(smoothstep(0.0, 1.0, r));
  const halo = pow(haloFalloff, sun.haloPower ?? 2.5).mul(sun.haloStrength ?? 0.45);
  const intensity = uniform(sun.intensity ?? 1.1);
  const rgb = vec3(...(sun.coreColor ?? [1.0, 0.97, 0.88])).mul(core)
    .add(vec3(...(sun.haloColor ?? [1.0, 0.82, 0.55])).mul(halo))
    .mul(intensity);
  const alpha = core.add(halo.mul(sun.alphaHaloMix ?? 0.7)).mul(intensity).mul(haloFalloff);

  const material = new MeshBasicNodeMaterial();
  material.name = 'konveyor-node-sun-billboard';
  material.colorNode = rgb;
  material.opacityNode = alpha;
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = sun.depthTest ?? true;
  material.blending = sun.blending ?? AdditiveBlending;
  material.userData.konveyorIntensityUniform = intensity;
  return material;
}
