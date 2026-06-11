// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
export function createWebGpuTerrainHeightfieldNodeMaterial(
  { MeshLambertNodeMaterial, DoubleSide, TSL },
  terrain,
  heightTexture
) {
  const { clamp, float, length, max, mix, positionView, positionWorld, sin, smoothstep, texture, uv, vec2, vec3 } = TSL;
  const linearColor = (color) => color;
  const groundUv = uv();
  const worldXZ = vec2(positionWorld.x, positionWorld.z);
  const heightUv = terrain.heightfieldWorldSize
    ? clamp(worldXZ.add(vec2(terrain.heightfieldWorldSize * 0.5, terrain.heightfieldWorldSize * 0.5)).div(terrain.heightfieldWorldSize), 0.0, 1.0)
    : groundUv;
  // Cycle 91 Phase 7.5 (Matt: dark/brown ground patches "seem gridded"):
  // the original n1/n2/n3 were sums of plane SINE waves - four periodic
  // stripe families whose thresholded product is a regular interference
  // lattice, so the dirt patches repeated on a visible grid. Replaced with
  // MaterialX perlin noise (aperiodic, matching the WebGL path's value-noise
  // fbm character), each octave rotated ~43deg so no two share an axis.
  // The sine path stays as the fallback for a TSL build without mx_noise.
  const mxNoise = TSL.mx_noise_float ?? null;
  const wave01 = (node) => sin(node).mul(0.5).add(0.5);
  let n1, n2, n3;
  if (mxNoise) {
    const ROT_C = 0.7314; // cos 43deg
    const ROT_S = 0.6820; // sin 43deg
    const rot = (p) => vec2(
      p.x.mul(ROT_C).sub(p.y.mul(ROT_S)),
      p.x.mul(ROT_S).add(p.y.mul(ROT_C))
    );
    // Perlin output sits mostly in [-0.6, 0.6]; x0.9 + 0.5 spreads it over
    // ~[0, 1] like the old wave01 sums so downstream thresholds keep their
    // meaning, just over organic blobs instead of stripes.
    const noise01 = (p, seed) => clamp(mxNoise(vec3(p.x, p.y, seed)).mul(0.9).add(0.5), 0.0, 1.0);
    n1 = noise01(worldXZ.mul(0.012), 0.0).mul(0.55)
      .add(noise01(rot(worldXZ).mul(0.026), 13.7).mul(0.45));
    n2 = noise01(rot(worldXZ).mul(0.045), 31.4).mul(0.6)
      .add(noise01(worldXZ.mul(0.08), 47.1).mul(0.4));
    n3 = noise01(worldXZ.mul(0.15), 71.3).mul(0.5)
      .add(noise01(rot(worldXZ).mul(0.11), 5.9).mul(0.5));
  } else {
    n1 = wave01(worldXZ.x.mul(0.021).add(worldXZ.y.mul(0.017)))
      .mul(0.55)
      .add(wave01(worldXZ.x.mul(-0.013).add(worldXZ.y.mul(0.029)).add(1.7)).mul(0.45));
    n2 = wave01(worldXZ.x.mul(0.047).add(worldXZ.y.mul(-0.034)).add(2.4))
      .mul(0.6)
      .add(wave01(worldXZ.x.mul(0.025).add(worldXZ.y.mul(0.061)).add(5.1)).mul(0.4));
    n3 = wave01(worldXZ.x.mul(0.151).add(worldXZ.y.mul(0.097)).add(0.6))
      .mul(0.5)
      .add(wave01(worldXZ.x.mul(-0.113).add(worldXZ.y.mul(0.139)).add(3.3)).mul(0.5));
  }
  const height01 = clamp(texture(heightTexture, heightUv).r, 0.0, 1.0);
  const heightLift = smoothstep(0.16, 0.82, height01);
  const low = vec3(...linearColor(terrain.lowColor));
  const mid = vec3(...linearColor(terrain.midColor));
  const high = vec3(...linearColor(terrain.highColor));
  const dirt = vec3(...linearColor(terrain.dirtColor ?? [0.42, 0.36, 0.29]));
  const midBlend = clamp(n1.mul(0.78).add(heightLift.mul(0.22)), 0.0, 1.0);
  const highBlend = clamp(n2.mul(0.38).add(heightLift.mul(0.24)), 0.0, 0.78);
  const dirtMask = smoothstep(0.54, 0.74, n1.mul(n2));
  const detailBase = terrain.detailBase ?? 0.88;
  const detailStrength = terrain.detailStrength ?? 0.20;
  const aoFloor = terrain.aoFloor ?? 0.86;
  const aoStrength = terrain.aoStrength ?? 0.14;
  const detail = float(detailBase).add(n3.mul(detailStrength));
  const ao = float(aoFloor).add(n1.mul(aoStrength));
  const baseColor = mix(
    mix(mix(low, mid, midBlend), high, highBlend),
    dirt,
    dirtMask.mul(terrain.dirtStrength ?? 0.26)
  ).mul(detail).mul(ao);
  const distantFog = smoothstep(terrain.fogNear ?? 220, terrain.fogFar ?? 900, length(positionView))
    .mul(terrain.fogStrength ?? 0.34);
  const horizonFog = terrain.heightfieldWorldSize
    ? smoothstep(
      terrain.heightfieldWorldSize * 0.46,
      terrain.heightfieldWorldSize * 1.6,
      length(worldXZ)
    ).mul(terrain.horizonFogStrength ?? 0.14)
    : float(0.0);
  const fogBlend = max(distantFog, horizonFog).mul(terrain.fogBlendScale ?? 1);

  const material = new MeshLambertNodeMaterial();
  material.name = 'webgpu-node-terrain-heightfield';
  const colorScale = terrain.colorScale ?? 0.92;
  const contrast = terrain.contrast ?? 1;
  const polishedColor = clamp(
    baseColor
      .mul(vec3(...(terrain.colorTint ?? [1, 1, 1])))
      .mul(float(colorScale))
      .sub(vec3(0.5, 0.5, 0.5))
      .mul(contrast)
      .add(vec3(0.5, 0.5, 0.5)),
    0.0,
    1.4
  );
  material.colorNode = mix(polishedColor, vec3(...linearColor(terrain.fogColor)), fogBlend);
  material.side = terrain.side ?? DoubleSide;
  material.polygonOffset = terrain.polygonOffset?.enabled ?? false;
  material.polygonOffsetFactor = terrain.polygonOffset?.factor ?? 0;
  material.polygonOffsetUnits = terrain.polygonOffset?.units ?? 0;
  material.toneMapped = true;
  material.userData.webgpuTerrainColorScale = colorScale;
  material.userData.webgpuTerrainMaterialControls = {
    contrast,
    detailBase,
    detailStrength,
    aoFloor,
    aoStrength,
    dirtStrength: terrain.dirtStrength ?? 0.26,
    fogStrength: terrain.fogStrength ?? 0.34,
    horizonFogStrength: terrain.horizonFogStrength ?? 0.14,
    fogBlendScale: terrain.fogBlendScale ?? 1,
    colorTint: terrain.colorTint ?? [1, 1, 1],
  };
  material.userData.webgpuTerrainVisualPolish = 'continuous-world-heightfield-blend';
  material.userData.webgpuTerrainHeightTextureMapping = terrain.heightfieldWorldSize
    ? 'world-space-heightfield'
    : 'mesh-uv-fallback';
  return material;
}
