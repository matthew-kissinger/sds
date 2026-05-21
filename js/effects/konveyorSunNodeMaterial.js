export function createKonveyorSunBillboardNodeMaterial({ MeshBasicNodeMaterial, AdditiveBlending, Color, TSL }, sun = {}) {
  const { float, length, smoothstep, uniform, uv, vec2, vec3 } = TSL;
  const makeColorUniform = (value, fallback) => (
    typeof Color === 'function'
      ? uniform(new Color(...(value ?? fallback)))
      : null
  );
  const d = uv().sub(vec2(0.5, 0.5));
  const r = length(d).mul(2.0);
  const disc = float(1.0).sub(smoothstep(sun.coreRadius ?? 0.04, sun.coreFeather ?? 0.12, r));
  const intensity = uniform(sun.intensity ?? 1.0);
  const coreColor = makeColorUniform(sun.coreColor, [1.0, 0.97, 0.88]);
  const coreColorNode = coreColor ?? vec3(...(sun.coreColor ?? [1.0, 0.97, 0.88]));
  const rgb = coreColorNode.mul(intensity);

  const material = new MeshBasicNodeMaterial();
  material.name = 'konveyor-node-sun-billboard';
  material.colorNode = rgb;
  material.opacityNode = disc;
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = sun.depthTest ?? true;
  material.blending = sun.blending ?? AdditiveBlending;
  material.toneMapped = true;
  material.userData.konveyorIntensityUniform = intensity;
  material.userData.konveyorCoreColorUniform = coreColor;
  material.userData.konveyorSunBillboardOwnership = {
    owns: 'disc-body-only',
    skyOwns: 'aureole-and-horizon-glow',
  };
  return material;
}
