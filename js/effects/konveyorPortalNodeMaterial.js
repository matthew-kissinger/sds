export function createKonveyorPortalRingNodeMaterial({ MeshBasicNodeMaterial, AdditiveBlending, DoubleSide, TSL }, portal = {}) {
  const { abs, float, mix, sin, smoothstep, time, uv, vec3 } = TSL;
  const ringUv = uv();
  const radial = ringUv.y;
  const phase = ringUv.x.mul(6.2831853).add(time.mul(portal.phaseSpeed ?? 0.9));
  const innerColor = vec3(...(portal.innerColor ?? [0.424, 0.949, 1.0]));
  const outerColor = vec3(...(portal.outerColor ?? [0.608, 0.424, 1.0]));
  const base = float(portal.baseIntensity ?? 0.55).add(sin(phase).mul(portal.pulseStrength ?? 0.35));
  const pulseGlow = float(portal.pulseGlow ?? 0.35)
    .mul(float(1.0).sub(smoothstep(0.0, 1.0, abs(radial.sub(0.5)).mul(2.0))));
  const intensity = base.add(pulseGlow.mul(portal.glowBoost ?? 0.9)).mul(portal.intensity ?? 0.85);
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
  return material;
}
