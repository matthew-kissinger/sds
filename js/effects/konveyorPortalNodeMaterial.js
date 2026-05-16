export function createKonveyorPortalRingNodeMaterial({ MeshBasicNodeMaterial, AdditiveBlending, DoubleSide, TSL }, portal = {}) {
  const { abs, float, mix, sin, smoothstep, uniform, uv, vec3 } = TSL;
  const ringUv = uv();
  const radial = ringUv.y;
  const timeUniform = uniform(portal.time ?? 0);
  const pulseUniform = uniform(portal.pulse ?? 0);
  const intensityUniform = uniform(portal.intensity ?? 0.85);
  const phase = ringUv.x.mul(6.2831853).add(timeUniform.mul(portal.phaseSpeed ?? 0.9));
  const innerColor = vec3(...(portal.innerColor ?? [0.424, 0.949, 1.0]));
  const outerColor = vec3(...(portal.outerColor ?? [0.608, 0.424, 1.0]));
  const base = float(portal.baseIntensity ?? 0.55).add(sin(phase).mul(portal.pulseStrength ?? 0.35));
  const pulseGlow = pulseUniform
    .mul(float(1.0).sub(smoothstep(0.0, 1.0, abs(radial.sub(0.5)).mul(2.0))));
  const intensity = base.add(pulseGlow.mul(portal.glowBoost ?? 0.9)).mul(intensityUniform);
  const edge = smoothstep(0.0, 0.18, radial)
    .mul(float(1.0).sub(smoothstep(0.82, 1.0, radial)));

  const material = new MeshBasicNodeMaterial();
  material.name = 'konveyor-node-portal-ring';
  material.colorNode = mix(innerColor, outerColor, radial).mul(intensity);
  material.opacityNode = intensity.mul(edge);
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = portal.depthTest ?? true;
  material.side = portal.side ?? DoubleSide;
  material.blending = portal.blending ?? AdditiveBlending;
  material.userData.konveyorTimeUniform = timeUniform;
  material.userData.konveyorPulseUniform = pulseUniform;
  material.userData.konveyorIntensityUniform = intensityUniform;
  return material;
}

export function createKonveyorPortalPadNodeMaterial({ MeshBasicNodeMaterial, AdditiveBlending, DoubleSide, TSL }, portal = {}) {
  const { uniform, vec3 } = TSL;
  const opacity = uniform(portal.opacity ?? 0.18);

  const material = new MeshBasicNodeMaterial();
  material.name = 'konveyor-node-portal-pad';
  material.colorNode = vec3(...(portal.color ?? [0.424, 0.949, 1.0]));
  material.opacityNode = opacity;
  material.opacity = portal.opacity ?? 0.18;
  material.transparent = true;
  material.depthWrite = portal.depthWrite ?? false;
  material.depthTest = portal.depthTest ?? true;
  material.side = portal.side ?? DoubleSide;
  material.blending = portal.blending ?? AdditiveBlending;
  material.userData.konveyorOpacityUniform = opacity;
  material.userData.konveyorBaseOpacity = portal.opacity ?? 0.18;
  return material;
}

export function createKonveyorPortalParticleNodeMaterial({ PointsNodeMaterial, AdditiveBlending, TSL }, portal = {}) {
  const { uniform, vec3 } = TSL;
  const opacity = uniform(portal.opacity ?? 0.9);

  const material = new PointsNodeMaterial();
  material.name = 'konveyor-node-portal-particles';
  material.colorNode = vec3(...(portal.color ?? [0.722, 0.91, 1.0]));
  material.opacityNode = opacity;
  material.opacity = portal.opacity ?? 0.9;
  material.size = portal.size ?? 0.5;
  material.sizeAttenuation = portal.sizeAttenuation ?? true;
  material.transparent = true;
  material.depthWrite = portal.depthWrite ?? false;
  material.depthTest = portal.depthTest ?? true;
  material.blending = portal.blending ?? AdditiveBlending;
  material.userData.konveyorOpacityUniform = opacity;
  material.userData.konveyorBaseOpacity = portal.opacity ?? 0.9;
  return material;
}
