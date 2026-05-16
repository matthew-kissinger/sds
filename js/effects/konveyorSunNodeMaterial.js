export function createKonveyorSunBillboardNodeMaterial({ MeshBasicNodeMaterial, AdditiveBlending, Color, TSL }, sun = {}) {
  const { float, length, pow, smoothstep, uniform, uv, vec2, vec3 } = TSL;
  const makeColorUniform = (value, fallback) => (
    typeof Color === 'function'
      ? uniform(new Color(...(value ?? fallback)))
      : null
  );
  const d = uv().sub(vec2(0.5, 0.5));
  const r = length(d).mul(2.0);
  const core = float(1.0).sub(smoothstep(sun.coreRadius ?? 0.22, sun.coreFeather ?? 0.46, r));
  const haloFalloff = float(1.0).sub(smoothstep(0.0, 1.0, r));
  const halo = pow(haloFalloff, sun.haloPower ?? 1.7).mul(sun.haloStrength ?? 0.86);
  const intensity = uniform(sun.intensity ?? 1.58);
  const coreColor = makeColorUniform(sun.coreColor, [1.0, 0.97, 0.88]);
  const haloColor = makeColorUniform(sun.haloColor, [1.0, 0.82, 0.55]);
  const coreColorNode = coreColor ?? vec3(...(sun.coreColor ?? [1.0, 0.97, 0.88]));
  const haloColorNode = haloColor ?? vec3(...(sun.haloColor ?? [1.0, 0.82, 0.55]));
  const rgb = coreColorNode.mul(core)
    .add(haloColorNode.mul(halo))
    .mul(intensity);
  const alpha = core.add(halo.mul(sun.alphaHaloMix ?? 0.9)).mul(intensity).mul(haloFalloff);

  const material = new MeshBasicNodeMaterial();
  material.name = 'konveyor-node-sun-billboard';
  material.colorNode = rgb;
  material.opacityNode = alpha;
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = sun.depthTest ?? true;
  material.blending = sun.blending ?? AdditiveBlending;
  material.userData.konveyorIntensityUniform = intensity;
  material.userData.konveyorCoreColorUniform = coreColor;
  material.userData.konveyorHaloColorUniform = haloColor;
  return material;
}
