// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
export function createWebGpuMeadowQuadNodeMaterial(
  { MeshLambertNodeMaterial, DoubleSide, TSL },
  meadowQuad
) {
  const { dot, floor, fract, length, mix, positionView, sin, smoothstep, uv, vec2, vec3 } = TSL;
  const linearColor = (color) => color;
  const baseColor = vec3(...linearColor(meadowQuad.baseColor));
  const midColor = vec3(...linearColor(meadowQuad.midColor));
  const tipColor = vec3(...linearColor(meadowQuad.tipColor));
  const colorTint = meadowQuad.colorTint ?? [1, 1, 1];
  const muv = uv().mul(meadowQuad.uvCellsPerChunk);
  const hashVector = vec2(...meadowQuad.noiseHashVector);
  const n1 = fract(sin(dot(floor(muv), hashVector)).mul(43758.5453));
  const n2 = fract(sin(dot(floor(muv.mul(2.0)), hashVector)).mul(43758.5453));
  const blend = mix(n1, n2, 0.5);
  const meadowColor = mix(
    mix(baseColor, midColor, blend),
    tipColor,
    smoothstep(0.6, 0.95, blend)
  ).mul(vec3(...linearColor(colorTint))).mul(meadowQuad.colorScale ?? 1);
  const fogBlend = smoothstep(meadowQuad.fogNear, meadowQuad.fogFar, length(positionView))
    .mul(meadowQuad.fogStrength);

  const material = new MeshLambertNodeMaterial();
  material.name = 'webgpu-node-meadow-quad';
  material.colorNode = mix(meadowColor, vec3(...linearColor(meadowQuad.fogColor)), fogBlend);
  material.side = DoubleSide;
  material.toneMapped = false;
  material.userData.webgpuMeadowColorScale = meadowQuad.colorScale ?? 1;
  material.userData.webgpuMeadowMaterialControls = {
    fogStrength: meadowQuad.fogStrength,
    colorScale: meadowQuad.colorScale ?? 1,
    colorTint,
  };
  return material;
}
