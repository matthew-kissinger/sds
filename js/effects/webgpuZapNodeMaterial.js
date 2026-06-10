// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
export function createWebGpuCorralZapBoltNodeMaterial({ LineBasicNodeMaterial, TSL }, zap = {}) {
  const { uniform, vec3 } = TSL;
  const opacity = uniform(zap.opacity ?? 0);

  const material = new LineBasicNodeMaterial();
  material.name = 'webgpu-node-corral-zap-bolt';
  material.colorNode = vec3(...(zap.color ?? [0.918, 1.0, 1.0]));
  material.opacityNode = opacity;
  material.opacity = zap.opacity ?? 0;
  material.linewidth = zap.linewidth ?? 2;
  material.transparent = true;
  material.depthWrite = zap.depthWrite ?? false;
  material.depthTest = zap.depthTest ?? true;
  material.userData.webgpuOpacityUniform = opacity;
  material.userData.webgpuBaseOpacity = zap.opacity ?? 0;
  return material;
}

export function createWebGpuCorralZapParticleNodeMaterial({ PointsNodeMaterial, TSL }, zap = {}) {
  const { uniform, vec3 } = TSL;
  const opacity = uniform(zap.opacity ?? 0);

  const material = new PointsNodeMaterial();
  material.name = 'webgpu-node-corral-zap-particles';
  material.colorNode = vec3(...(zap.color ?? [0.784, 0.937, 1.0]));
  material.opacityNode = opacity;
  material.opacity = zap.opacity ?? 0;
  material.size = zap.size ?? 0.6;
  material.sizeAttenuation = zap.sizeAttenuation ?? true;
  material.transparent = true;
  material.depthWrite = zap.depthWrite ?? false;
  material.depthTest = zap.depthTest ?? true;
  material.userData.webgpuOpacityUniform = opacity;
  material.userData.webgpuBaseOpacity = zap.opacity ?? 0;
  return material;
}
