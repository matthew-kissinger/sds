// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
export function createWebGpuTerrainHeightfieldNodeMaterial(
  { MeshLambertNodeMaterial, DoubleSide, TSL },
  terrain,
  heightTexture
) {
  const { clamp, dot, float, floor, fract, length, max, mix, positionView, positionWorld, sin, smoothstep, texture, uv, vec2, vec3 } = TSL;
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
  // the hash-based VALUE noise the WebGL terrain shader has shipped for
  // years (aperiodic blobs, proven affordable on the fully-visible field).
  // mx_noise_float was tried first and regressed the field rail's 1%-low
  // from 71 to ~31 FPS - six 3D perlin evals per terrain fragment are too
  // hot for a full-screen flat pasture. Octaves rotate ~43deg so no two
  // share a lattice axis.
  const hash2 = (p) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453123));
  const valueNoise01 = (p) => {
    const i = floor(p);
    const f = fract(p);
    const u = f.mul(f).mul(f.mul(-2.0).add(3.0));
    const a = hash2(i);
    const b = hash2(i.add(vec2(1.0, 0.0)));
    const c = hash2(i.add(vec2(0.0, 1.0)));
    const d = hash2(i.add(vec2(1.0, 1.0)));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  };
  const ROT_C = 0.7314; // cos 43deg
  const ROT_S = 0.6820; // sin 43deg
  const rot = (p) => vec2(
    p.x.mul(ROT_C).sub(p.y.mul(ROT_S)),
    p.x.mul(ROT_S).add(p.y.mul(ROT_C))
  );
  const noise01 = (p, seed) => valueNoise01(p.add(vec2(seed, seed * 1.7)));
  const n1 = noise01(worldXZ.mul(0.012), 0.0).mul(0.55)
    .add(noise01(rot(worldXZ).mul(0.026), 13.7).mul(0.45));
  const n2 = noise01(rot(worldXZ).mul(0.045), 31.4).mul(0.6)
    .add(noise01(worldXZ.mul(0.08), 47.1).mul(0.4));
  const n3 = noise01(worldXZ.mul(0.15), 71.3).mul(0.5)
    .add(noise01(rot(worldXZ).mul(0.11), 5.9).mul(0.5));
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
