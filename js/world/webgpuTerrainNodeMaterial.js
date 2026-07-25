// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { Vector2 as ThreeVector2, Vector3 as ThreeVector3 } from 'three';
import {
  buildGroundContactNode,
  buildGroundNoiseNodes,
  buildGroundVariationNode,
} from './groundShading.js';

export function createWebGpuTerrainHeightfieldNodeMaterial(
  { MeshLambertNodeMaterial, DoubleSide, Vector2 = ThreeVector2, Vector3 = ThreeVector3, TSL },
  terrain,
  heightTexture
) {
  const { clamp, float, mix, positionWorld, smoothstep, texture, uniform, uv, vec2, vec3 } = TSL;
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
  // hash-based VALUE noise (aperiodic blobs, proven affordable on the
  // fully-visible field). mx_noise_float was tried first and regressed the
  // field rail's 1%-low from 71 to ~31 FPS - six 3D perlin evals per terrain
  // fragment are too hot for a full-screen flat pasture. Octaves rotate
  // ~43deg so no two share a lattice axis.
  //
  // Cycle 114 Phase 2: the primitives and n1 (the low-frequency ground field)
  // now come from js/world/groundShading.js, which is also what both grass
  // paths read. Same formula, same numbers, relocated so a blade standing on
  // a browner patch of ground can be browner for the same reason the ground
  // is. n2/n3 stay local: they are terrain detail octaves that the grass has
  // no reason to reproduce.
  const { noise01, rotate: rot } = buildGroundNoiseNodes(TSL);
  const n1 = buildGroundVariationNode(TSL, worldXZ);
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
  // Cycle 114 Phase 5: the dog's contact darkening. Grass carries the same
  // term against the same footprint and the same falloff radius
  // (js/world/groundShading.js), because the pen and the farmhouse yard are
  // bald by design and are exactly where the dog spends its time - a contact
  // shadow that vanishes when it steps off the grass is worse than none. The
  // strength uniform sits at 0 until TerrainBuilder starts driving it, so a
  // scene with no dog in it renders exactly as before.
  const contactPosition = uniform(
    typeof Vector3 === 'function' ? new Vector3(0, 0, 0) : [0, 0, 0]
  );
  const contactFacing = uniform(
    typeof Vector2 === 'function' ? new Vector2(0, 1) : [0, 1]
  );
  const contactStrength = uniform(0);
  const groundedColor = polishedColor.mul(
    float(1.0).sub(
      buildGroundContactNode(TSL, worldXZ, { position: contactPosition, facing: contactFacing })
        .mul(contactStrength)
    )
  );
  // Cycle 114 Phase 6: the terrain used to composite a SECOND fog on top of
  // the scene's - a view-distance smoothstep plus a distance-from-origin
  // horizon ramp, both mixed toward a `terrain.fogColor` resolved ONCE, here,
  // at material creation. .claude/rules/scene-and-render.md forbids exactly
  // that ("Don't introduce per-material fog uniforms ... Custom fog drifts
  // from the sky"), and the frozen colour was the drift: applyFogColor() in
  // js/atmosphere/Atmosphere.js repaints scene.fog.color from the horizon LUT
  // every frame, so under a moving sun (Newsheepdogland's day/night cycle, the only
  // scene that has one) the terrain's far band held its boot-time colour while
  // the sky it was supposed to meet moved away from it. On the three
  // static-sun scenes the colour was correct at boot and stayed correct, which
  // is why nobody saw this.
  //
  // Nothing replaces it, because nothing has to. MeshLambertNodeMaterial
  // participates in Three's own fog: the renderer builds a fog node from
  // scene.fog whose colour/near/far are reference() uniforms, so the terrain
  // now tracks the sky per-frame for free. The WebGL twin in
  // js/TerrainBuilder.js has always done exactly this (`fog: true` plus
  // <fog_fragment>), so deleting the hand-rolled pass is also what makes the
  // two render paths agree instead of the WebGPU one fogging twice.
  //
  // The far band does get marginally less hazy, and the bound is analytic
  // rather than eyeballed: both ramps ran off the SAME scene near/far, so the
  // extra blend was k * s while Three's own factor was s, and the delta is
  // k * s * (1 - s), peaking at s = 0.5 at k / 4. That is 0.031 on Home Field
  // (k = fogStrength 0.20 * fogBlendScale 0.62), 0.037 on Rolling Hills and
  // 0.032 on Open Country, of the distance between the terrain colour and a
  // fog colour Three is already blending toward at that range. Inside the
  // playable interior both ramps read zero - fogNear is 300m on Home Field,
  // 350m on Rolling Hills and Open Country, 600m on Newsheepdogland, and the
  // horizon ramp started at 0.46 * heightfield
  // worldSize (184m on Home Field against a +/-100m pasture, 230m on Rolling
  // Hills against a 180m+40m island, 414m on Open Country against 380m+70m) -
  // so the near and mid field are unchanged exactly, not approximately.
  material.colorNode = groundedColor;
  // Explicit rather than inherited from Material's default: scene.fog is the
  // entire fog story for this material now, and NodeMaterial.setupOutput only
  // wires the scene's fog node in when this reads true.
  material.fog = true;
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
    colorTint: terrain.colorTint ?? [1, 1, 1],
  };
  material.userData.webgpuTerrainVisualPolish = 'continuous-world-heightfield-blend';
  // Picked up per-frame by TerrainBuilder#_syncGroundContact. Named for what it
  // carries, not for the phase that added it.
  material.userData.groundContactNodeUniforms = {
    position: contactPosition,
    facing: contactFacing,
    strength: contactStrength,
  };
  // Read by tests/terrain-scene-fog.spec.js as the standing answer to "where
  // does this material's fog come from": scene.fog, and only scene.fog.
  material.userData.webgpuTerrainFogSource = 'scene-fog';
  material.userData.webgpuTerrainHeightTextureMapping = terrain.heightfieldWorldSize
    ? 'world-space-heightfield'
    : 'mesh-uv-fallback';
  return material;
}
