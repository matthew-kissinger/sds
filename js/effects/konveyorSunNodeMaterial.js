export function createKonveyorSunBillboardNodeMaterial({ MeshBasicNodeMaterial, AdditiveBlending, NormalBlending, Color, TSL }, sun = {}) {
  const { clamp, float, length, pow, smoothstep, uniform, uv, vec2, vec3 } = TSL;
  const makeColorUniform = (value, fallback) => (
    typeof Color === 'function'
      ? uniform(new Color(...(value ?? fallback)))
      : null
  );
  const d = uv().sub(vec2(0.5, 0.5));
  const r = length(d).mul(2.0);
  const core = float(1.0).sub(smoothstep(sun.coreRadius ?? 0.16, sun.coreFeather ?? 0.34, r));
  const haloFalloff = float(1.0).sub(smoothstep(0.0, 1.0, r));
  const halo = pow(haloFalloff, sun.haloPower ?? 1.35).mul(sun.haloStrength ?? 0.70);
  const intensity = uniform(sun.intensity ?? 1.02);
  const coreColor = makeColorUniform(sun.coreColor, [1.0, 0.90, 0.58]);
  const haloColor = makeColorUniform(sun.haloColor, [1.0, 0.52, 0.20]);
  const coreColorNode = coreColor ?? vec3(...(sun.coreColor ?? [1.0, 0.90, 0.58]));
  const haloColorNode = haloColor ?? vec3(...(sun.haloColor ?? [1.0, 0.52, 0.20]));
  const boundedIntensity = clamp(intensity, 0.0, 1.15);
  const rgb = coreColorNode.mul(core)
    .add(haloColorNode.mul(halo))
    .mul(boundedIntensity);
  const alpha = core.add(halo.mul(sun.alphaHaloMix ?? 0.72)).mul(clamp(intensity, 0.0, 1.0)).mul(haloFalloff);

  const material = new MeshBasicNodeMaterial();
  material.name = 'konveyor-node-sun-billboard';
  material.colorNode = rgb;
  material.opacityNode = alpha;
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = sun.depthTest ?? true;
  material.blending = sun.blending ?? NormalBlending ?? AdditiveBlending;
  material.toneMapped = true;
  material.userData.konveyorIntensityUniform = intensity;
  material.userData.konveyorCoreColorUniform = coreColor;
  material.userData.konveyorHaloColorUniform = haloColor;
  material.userData.konveyorSunBillboardOwnership = {
    owns: 'readable-disc-and-near-halo',
    skyOwns: 'broad-horizon-glow',
    boundedIntensity: true,
    blending: material.blending === NormalBlending ? 'normal-bounded' : 'fallback-additive',
  };
  return material;
}
