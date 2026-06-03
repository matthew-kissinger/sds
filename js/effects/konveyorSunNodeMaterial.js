// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
export function createKonveyorSunBillboardNodeMaterial({ MeshBasicNodeMaterial, AdditiveBlending, Color, TSL }, sun = {}) {
  const { clamp, float, length, max, mix, smoothstep, uniform, uv, vec2, vec3 } = TSL;
  const makeColorUniform = (value, fallback) => (
    typeof Color === 'function'
      ? uniform(new Color(...(value ?? fallback)))
      : null
  );
  const d = uv().sub(vec2(0.5, 0.5));
  const r = length(d).mul(2.0);
  const coreRadius = sun.coreRadius ?? 0.065;
  const coreFeather = sun.coreFeather ?? 0.13;
  const hotCoreRadius = sun.hotCoreRadius ?? coreRadius * 0.42;
  const hotCoreFeather = sun.hotCoreFeather ?? coreRadius * 1.25;
  const disc = float(1.0).sub(smoothstep(coreRadius, coreFeather, r));
  const hotCore = float(1.0).sub(smoothstep(hotCoreRadius, hotCoreFeather, r));
  const intensity = uniform(sun.intensity ?? 1.0);
  const coreColor = makeColorUniform(sun.coreColor, [1.0, 0.97, 0.88]);
  const coreColorNode = coreColor ?? vec3(...(sun.coreColor ?? [1.0, 0.97, 0.88]));
  const bodyColor = vec3(...(sun.bodyColor ?? [1.0, 0.94, 0.72]));
  const warmBody = coreColorNode.mul(bodyColor).mul(intensity).mul(sun.bodyGain ?? 0.72);
  const hotWhite = vec3(...(sun.hotCoreColor ?? [1.36, 1.32, 1.12]))
    .mul(intensity)
    .mul(sun.hotCoreGain ?? 1.22);
  const rgb = mix(warmBody, hotWhite, hotCore);
  const opacity = clamp(max(disc.mul(sun.bodyOpacity ?? 0.54), hotCore.mul(sun.hotCoreOpacity ?? 0.98)), 0.0, 1.0);

  const material = new MeshBasicNodeMaterial();
  material.name = 'konveyor-node-sun-billboard';
  material.colorNode = rgb;
  material.opacityNode = opacity;
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = sun.depthTest ?? true;
  material.blending = sun.blending ?? AdditiveBlending;
  material.toneMapped = false;
  material.userData.konveyorIntensityUniform = intensity;
  material.userData.konveyorCoreColorUniform = coreColor;
  material.userData.konveyorSunBillboardOwnership = {
    owns: 'disc-body-only',
    skyOwns: 'painted-sun-body-aureole-and-horizon-glow',
  };
  material.userData.konveyorSunBillboardShape = {
    coreRadius,
    coreFeather,
    hotCoreRadius,
    hotCoreFeather,
    bodyOpacity: sun.bodyOpacity ?? 0.54,
    hotCoreOpacity: sun.hotCoreOpacity ?? 0.98,
    bodyColor: sun.bodyColor ?? [1.0, 0.94, 0.72],
  };
  return material;
}
