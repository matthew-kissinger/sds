// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { Vector2 as ThreeVector2, Vector3 as ThreeVector3 } from 'three';
import {
  GRASS_VARIATION_TINT,
  GROUND_CONTACT,
  buildGrassHueOffsetNode,
  buildGroundContactFalloffNode,
  buildGroundVariationNode,
} from './groundShading.js';

export function createWebGpuGrassBladeNodeMaterial(
  { MeshBasicNodeMaterial, MeshStandardNodeMaterial, DoubleSide, Vector2 = ThreeVector2, Vector3 = ThreeVector3, TSL },
  grassBlade
) {
  const { abs, attribute, cameraPosition, clamp, cos, dot, float, instanceIndex, length, max, mix, normalize, positionGeometry, positionLocal, positionView, positionWorld, pow, sin, smoothstep, time, uniform, vec2, vec3 } = TSL;
  const linearColor = (color) => color;
  const vector2 = (value) => (
    typeof Vector2 === 'function'
      ? new Vector2(value[0], value[1])
      : value
  );
  const vector3 = (value) => (
    typeof Vector3 === 'function'
      ? new Vector3(value[0], value[1], value[2])
      : value
  );
  const height01 = clamp(positionGeometry.y.div(Math.max(grassBlade.bladeHeight, 0.001)), 0.0, 1.0);
  const windDirection = uniform(vector2(grassBlade.windDirection));
  const windStrength = uniform(grassBlade.windStrength);
  const sunDirection = uniform(vector3(grassBlade.sunDirection));
  // Cycle 123: the twin of the WebGL path's `uGrassLight`. White until the
  // first update, which is what the reference preset resolves to, so a frame
  // drawn before the first setGrassLight is the shipped noon look.
  const grassLight = uniform(vector3([1, 1, 1]));
  const maxNodeInteractors = Math.max(1, Math.min(8, grassBlade.maxNodeInteractors ?? 4));
  const interactorPositions = Array.from({ length: maxNodeInteractors }, () => uniform(vector3([0, -10000, 0])));
  const interactorFacings = Array.from({ length: maxNodeInteractors }, () => uniform(vector2([0, 1])));
  const interactorTypes = Array.from({ length: maxNodeInteractors }, () => uniform(0));
  const interactorCount = uniform(0);
  // Cycle 81 Path 1: when the GrassSystem renders the whole field as ONE compute-
  // culled InstancedMesh (one indirect draw), per-instance data is read through the
  // GPU compaction remap instead of plain instanced attributes. The GPU
  // instance_index is the compacted draw slot, so realIndex = visibleIdx[slot], and
  // the clump transform the per-chunk path applied via instanceMatrix is folded into
  // positionNode here (T*R*S, byte-identical to the matrix path). Default
  // (computeCull = null) keeps the exact pre-Cycle-81 instanced-attribute path.
  const computeCull = grassBlade.computeCull ?? null;
  let instanceWorldOffset;
  let foldInstanceTransform = null;
  if (computeCull) {
    const realIndex = computeCull.visibleIdx.element(instanceIndex);
    instanceWorldOffset = computeCull.offsetsBuf.element(realIndex);
    const tf = computeCull.transformsBuf.element(realIndex); // (yaw, scale, heightMul)
    const yawCos = cos(tf.x);
    const yawSin = sin(tf.x);
    const instScale = tf.y;
    const instHeightMul = tf.z;
    // local -> world = offset + Ry(yaw) * (scale * local), matching createChunk's
    // dummy.matrix = T * Ry(yaw) * S exactly (heightMul scales Y only).
    foldInstanceTransform = (local) => {
      const scaled = vec3(local.x.mul(instScale), local.y.mul(instScale).mul(instHeightMul), local.z.mul(instScale));
      const rotated = vec3(
        scaled.x.mul(yawCos).add(scaled.z.mul(yawSin)),
        scaled.y,
        scaled.z.mul(yawCos).sub(scaled.x.mul(yawSin)),
      );
      return instanceWorldOffset.add(rotated);
    };
  } else {
    instanceWorldOffset = attribute('instanceWorldOffset', 'vec3');
  }
  const bladeWorld = foldInstanceTransform
    ? foldInstanceTransform(positionGeometry)
    : instanceWorldOffset.add(positionGeometry);
  const interactionRadius = uniform(grassBlade.interactionRadius ?? 2.2);
  const interactionStrength = uniform(grassBlade.interactionStrength ?? 0.6);
  const sheepInteractionRadius = uniform(grassBlade.sheepInteractionRadius ?? 2.5);
  const sheepInteractionStrength = uniform(grassBlade.sheepInteractionStrength ?? 0.4);
  // Cycle 55: body half-extents sourced from the unified GrassSystem.interaction
  // config (routed via the grass material factory). Fall back to the prior
  // hardcoded values so callers that omit them keep the previous footprint.
  const dogHalfLen = grassBlade.dogHalfLen ?? 1.65;
  const sheepHalfLen = grassBlade.sheepHalfLen ?? 0.72;
  const dogHalfWidth = grassBlade.dogHalfWidth ?? 0.78;
  const sheepHalfWidth = grassBlade.sheepHalfWidth ?? 0.56;
  const interactionVisualScaleValue = grassBlade.interactionVisualScale ?? 6.4;
  const interactionLaydownStrength = grassBlade.interactionLaydownStrength ?? 0.85;
  const interactionMaxDisplacementValue = grassBlade.interactionMaxDisplacement ?? 0.95;
  const interactionShadowStrengthValue = grassBlade.interactionShadowStrength ?? 0.22;
  const interactionShadowStrength = uniform(interactionShadowStrengthValue);
  const interactionVisualScale = float(interactionVisualScaleValue);
  const interactionMaxDisplacement = float(interactionMaxDisplacementValue);
  const windDir = normalize(windDirection);
  const windPerp = vec2(windDir.y.negate(), windDir.x);
  const windPower = height01.mul(height01);
  // Carry the contact bend down the full blade rather than flicking only the tip:
  // the mid-blade term dominates and both ramps start lower, so a pressed blade
  // folds along its length into a body-depth dent. The base stays anchored.
  const baseAnchor = smoothstep(0.06, 0.18, height01);
  const midBend = smoothstep(0.12, 0.52, height01).mul(0.62);
  const tipBend = smoothstep(0.45, 1.0, height01).mul(0.38);
  const contactBendPower = baseAnchor.mul(midBend.add(tipBend));
  const worldX = bladeWorld.x;
  const worldZ = bladeWorld.z;
  const gustFlow = time.mul(grassBlade.windSpeed * 1.5);
  const gustA = sin(worldX.mul(0.045).add(worldZ.mul(0.038)).sub(gustFlow));
  const gustB = sin(worldX.mul(0.022).add(worldZ.mul(0.029)).add(1.7).sub(gustFlow.mul(0.72)));
  const gustEnv = smoothstep(-0.2, 1.0, gustA.mul(0.6).add(gustB.mul(0.4)));
  const swayTime = time.mul(grassBlade.windSpeed);
  const sway1 = sin(worldX.mul(0.13).add(worldZ.mul(0.09)).add(swayTime.mul(0.85)));
  const sway2 = sin(worldX.mul(0.07).sub(worldZ.mul(0.11)).add(swayTime.mul(0.55)).add(1.3));
  const sway = sway1.mul(0.6).add(sway2.mul(0.4));
  const carrier = float(0.45).add(sway.mul(0.5).mul(float(0.4).add(gustEnv.mul(0.8))));
  const tipMask = smoothstep(0.65, 1.0, height01);
  const flutter = sin(worldX.mul(0.7).add(worldZ.mul(0.6)).add(time.mul(4.5)));
  const windDisp = windDir.mul(carrier.mul(windStrength).mul(windPower))
    .add(windPerp.mul(flutter.mul(windStrength).mul(0.06).mul(tipMask)));
  let interactionDirection = vec2(0.0, 0.0);
  let interactionStrengthTotal = float(0.0);
  let bodyFalloffTotal = float(0.0);
  let contactShadeTotal = float(0.0);
  for (let i = 0; i < maxNodeInteractors; i++) {
    const interactorPosition = interactorPositions[i];
    const entityType = clamp(interactorTypes[i], 0.0, 1.0);
    const interactorDelta = vec2(worldX.sub(interactorPosition.x), worldZ.sub(interactorPosition.z));
    const interactorDistance = max(length(interactorDelta), 0.001);
    const pushDirection = interactorDelta.div(interactorDistance);
    const facing = normalize(interactorFacings[i]);
    const side = vec2(facing.y.negate(), facing.x);
    const signedAlong = dot(interactorDelta, facing);
    const along = abs(signedAlong);
    const signedAcross = dot(interactorDelta, side);
    const across = abs(signedAcross);
    const halfLen = mix(dogHalfLen, sheepHalfLen, entityType);
    const halfWidth = mix(dogHalfWidth, sheepHalfWidth, entityType);
    const bodyDistance = length(vec2(along.div(halfLen), across.div(halfWidth)));
    const activeInteractor = smoothstep(i + 0.5, i + 0.95, interactorCount);
    const radius = mix(interactionRadius, sheepInteractionRadius, entityType);
    const strength = mix(interactionStrength, sheepInteractionStrength, entityType).mul(interactionVisualScale);
    const bodyFalloff = float(1.0).sub(smoothstep(0.72, 1.55, bodyDistance));
    const proximityFalloff = float(1.0).sub(smoothstep(0.0, radius, interactorDistance));
    const contactFalloff = max(bodyFalloff, proximityFalloff.mul(0.78)).mul(activeInteractor);
    // Push along the body-oval outward normal rather than radially from the
    // entity centre. The ellipse implicit gradient (signedAlong/halfLen^2,
    // signedAcross/halfWidth^2) elongates the pressed ring to the body
    // silhouette; pushDirection is a tiny tie-breaker so a blade at the exact
    // centre still resolves to a finite direction.
    const splayDirection = normalize(
      facing.mul(signedAlong.div(halfLen.mul(halfLen)))
        .add(side.mul(signedAcross.div(halfWidth.mul(halfWidth))))
        .add(pushDirection.mul(0.04))
    );
    const candidateStrength = contactFalloff.mul(strength);
    const dominance = smoothstep(
      interactionStrengthTotal.mul(0.92),
      interactionStrengthTotal.add(0.04),
      candidateStrength
    );
    interactionDirection = mix(interactionDirection, splayDirection, dominance);
    interactionStrengthTotal = max(interactionStrengthTotal, candidateStrength);
    bodyFalloffTotal = max(bodyFalloffTotal, contactFalloff);
    // Cycle 114 Phase 5: the dog's ground contact, on the same oriented
    // rounded-rect footprint the interaction already evaluates. Reusing this
    // loop's `along`/`across` rather than taking separate position/facing
    // uniforms (the way the terrain material has to) means the contact tracks
    // the live interactor sync for free and cannot fall out of step with the
    // push it sits under.
    //
    // Dog only, never sheep: a 5,000-instance version is a different problem
    // with a different budget, and the WebGL twin gates the same way with
    // `if (entityType < 0.5)`. There are no branches in a node graph, so the
    // gate is a mask with the step landing on the same 0.5.
    const dogMask = float(1.0).sub(smoothstep(0.45, 0.55, entityType));
    contactShadeTotal = max(
      contactShadeTotal,
      buildGroundContactFalloffNode(TSL, along, across).mul(activeInteractor).mul(dogMask)
    );
  }
  const tipColor = mix(
    vec3(...linearColor(grassBlade.tipColor)),
    vec3(...linearColor(grassBlade.midColor)),
    grassBlade.tipDampen ?? 0.36
  );
  const gradient = mix(
    mix(vec3(...linearColor(grassBlade.baseColor)), vec3(...linearColor(grassBlade.midColor)), smoothstep(0.0, 0.4, height01)),
    tipColor,
    smoothstep(0.4, 1.0, height01)
  );
  // Fragment-stage colour jitter keys off positionWorld (engine-varied), not the
  // worldX/worldZ derived from bladeWorld, which is ~0 in the fragment (see below).
  //
  // Cycle 114 Phase 2: this was sin(x * 0.2) * cos(z * 0.15), a regular plaid at
  // roughly 31m by 42m laid over a terrain whose own variation is rotated hash
  // value-noise at 83m and 38m. Two fields that disagree is why the grass read as
  // a carpet over the ground rather than as the ground. It is now the SAME field
  // the terrain computes (js/world/groundShading.js), at the same frequencies and
  // the same 43-degree rotation, so a blade standing on a browner patch is itself
  // browner.
  const groundWorldXZ = vec2(positionWorld.x, positionWorld.z);
  const colorVariation = buildGroundVariationNode(TSL, groundWorldXZ);
  const variation = vec3(
    colorVariation.mul(GRASS_VARIATION_TINT.red),
    colorVariation.mul(GRASS_VARIATION_TINT.green).add(GRASS_VARIATION_TINT.greenBias),
    colorVariation.mul(GRASS_VARIATION_TINT.blue)
  );
  // Cycle 114 Phase 2: the hue offset was a hash of the raw fragment world
  // position, so it varied per PIXEL - noise, not clumping. It is now quantised
  // to roughly clump scale with a smaller residual for break-up, the same shape
  // the WebGL paths use (they key theirs off the clump origin, which they have;
  // the fragment stage here only has positionWorld, so the residual term reads a
  // little finer). Same amplitude either way.
  const hueOffset = buildGrassHueOffsetNode(TSL, groundWorldXZ, grassBlade.hueVariation ?? 0.04);
  const hueNudge = vec3(hueOffset.negate(), hueOffset, hueOffset.mul(0.5));
  const ao = mix(0.7, 1.0, height01);
  // World-space fragment->camera direction (dotted against world up + sun below).
  // positionWorld is the engine's correctly-varied world position; bladeWorld is
  // ~0 in the fragment stage (see viewDistance note) so it can't be used here.
  const toCamera = normalize(cameraPosition.sub(positionWorld));
  const toSun = normalize(sunDirection);
  const backlightStrength = grassBlade.backlightStrength ?? 0.7;
  const rimStrength = grassBlade.rimStrength ?? 0.2;
  const fogStrength = grassBlade.fogStrength ?? 0.55;
  const viewBacklightStrength = grassBlade.viewBacklightStrength ?? 0.15;
  const viewBacklight = float(1.0).add(
    float(1.0)
      .sub(abs(dot(toCamera, vec3(0.0, 1.0, 0.0))))
      .mul(height01)
      .mul(viewBacklightStrength)
  );
  const backlitSun = pow(max(dot(toCamera, toSun.mul(-1.0)), 0.0), 4.0);
  const sunTip = tipColor.mul(backlitSun.mul(backlightStrength).mul(tipMask));
  const verticalRim = pow(max(dot(toCamera, vec3(0.0, 1.0, 0.0)), 0.0), 4.0);
  // Camera distance for the fog blend + distance fade. MUST use positionView (the
  // engine's view-space fragment position; its length is the camera-to-fragment
  // distance) like every sibling webgpu material (terrain/tree/meadow fog). The
  // hand-rolled `cameraPosition.sub(bladeWorld)` was wrong: bladeWorld is built from
  // a per-instance source (the instanceWorldOffset attribute, or the compute-cull
  // storage read indexed by instanceIndex) that collapses to ~0 in the FRAGMENT
  // stage, so viewDistance became |cameraPosition| = the camera's distance from the
  // world ORIGIN. Near-origin scenes survived; newsheepdogland's play area (~1.2km
  // out) fell entirely past grassFadeEnd, so densityFade -> 0 and every blade went
  // fully transparent in both the compute-cull and per-chunk paths. (Cycle 82.)
  const viewDistance = length(positionView);
  const fogBlend = smoothstep(grassBlade.fogNear, grassBlade.fogFar, viewDistance).mul(fogStrength);
  const densityFade = float(1.0).sub(
    smoothstep(grassBlade.grassFadeStart, grassBlade.grassFadeEnd, viewDistance)
      .mul(grassBlade.distanceFadeStrength)
  );
  const colorScale = grassBlade.colorScale ?? 1;
  const colorTint = grassBlade.colorTint ?? [1, 1, 1];
  const interactionShadow = float(1.0).sub(bodyFalloffTotal.mul(interactionShadowStrength).mul(smoothstep(0.15, 1.0, height01)));
  // The WebGL twin composes exactly this product into vShadow:
  //   vShadow = (1 - interaction push shade) * (1 - contactShade * strength)
  // Same two factors, same order, same GROUND_CONTACT.strength, so the dog
  // grounds identically on both paths and does not change depth when the
  // renderer falls back.
  const contactShadow = float(1.0).sub(contactShadeTotal.mul(GROUND_CONTACT.strength));
  const grassColor = gradient.add(hueNudge).add(variation).mul(interactionShadow).mul(contactShadow).mul(ao).mul(viewBacklight)
    .add(sunTip)
    .add(tipColor.mul(verticalRim.mul(rimStrength).mul(tipMask)))
    .mul(vec3(...linearColor(colorTint)))
    .mul(colorScale);

  const MaterialClass = MeshBasicNodeMaterial ?? MeshStandardNodeMaterial;
  const material = new MaterialClass();
  material.name = 'webgpu-node-grass-blade';
  // Cycle 123: the scene light multiplies the blade INSIDE the fog mix, exactly
  // as the WebGL twin does it. Outside would scale the fog colour too, and the
  // fog colour is the sky, which Atmosphere already darkens at night.
  material.colorNode = mix(
    grassColor.mul(grassLight),
    vec3(...linearColor(grassBlade.fogColor)),
    fogBlend
  );
  material.opacityNode = densityFade;
  const interactionDisp = interactionDirection
    .mul(clamp(interactionStrengthTotal, 0.0, interactionMaxDisplacement))
    .mul(contactBendPower);
  const totalDisp = windDisp.add(interactionDisp);
  const laydownMask = smoothstep(0.10, 0.78, height01);
  const interactionLaydown = bodyFalloffTotal.mul(-interactionLaydownStrength).mul(laydownMask);
  const displacement = vec3(totalDisp.x, interactionLaydown, totalDisp.y);
  const localDisplaced = positionGeometry.add(displacement);
  const transformedDisplaced = positionLocal.add(displacement);
  // Cycle 81: fold T*R*S into the position when compute-culled (instanceMatrix is
  // identity on the consolidated mesh); otherwise keep local and let instanceMatrix apply.
  material.positionNode = foldInstanceTransform ? foldInstanceTransform(localDisplaced) : transformedDisplaced;
  if (material.isMeshStandardNodeMaterial) {
    material.roughnessNode = float(0.96);
    material.metalnessNode = float(0.0);
  }
  material.alphaHash = grassBlade.alphaHash;
  material.alphaTest = grassBlade.alphaTest;
  material.side = grassBlade.side ?? DoubleSide;
  material.transparent = grassBlade.transparent ?? false;
  material.depthWrite = grassBlade.depthWrite ?? true;
  material.depthTest = grassBlade.depthTest ?? true;
  material.toneMapped = true;
  material.userData.webgpuGrassBladeFog = {
    color: grassBlade.fogColor,
    near: grassBlade.fogNear,
    far: grassBlade.fogFar,
  };
  material.userData.webgpuGrassColorScale = colorScale;
  material.userData.webgpuGrassMaterialControls = {
    tipDampen: grassBlade.tipDampen ?? 0.36,
    backlightStrength,
    rimStrength,
    fogStrength,
    hueVariation: grassBlade.hueVariation ?? 0.04,
    viewBacklightStrength,
    colorTint,
  };
  // Cycle 123: no longer "unlit". The shader still owns its entire colour
  // graph (no material-class lighting), but it now takes the scene's light as
  // one multiplier via `grassLight`, from js/world/grassLighting.js.
  material.userData.webgpuGrassLighting = material.isMeshBasicNodeMaterial
    ? 'shader-owned-scene-lit'
    : 'standard-fallback';
  material.userData.webgpuGrassBladeNodeUniforms = {
    windDirection,
    windStrength,
    sunDirection,
    grassLight,
    interactorPositions,
    interactorFacings,
    interactorTypes,
    interactorCount,
    interactionRadius,
    interactionStrength,
    sheepInteractionRadius,
    sheepInteractionStrength,
    interactionShadowStrength,
    maxNodeInteractors,
  };
  material.userData.webgpuGrassBladeInteractors = {
    maxNodeInteractors,
    source: 'dog-plus-nearest-sheep-unrolled',
    displacement: 'anchored-fullblade-bend-along-oval-normal-plus-laydown',
    coordinateSource: 'instanceWorldOffset-plus-positionGeometry',
    overlapMode: 'dominant-contact-capped-vector',
    visualScale: interactionVisualScaleValue,
    maxDisplacement: interactionMaxDisplacementValue,
    laydownStrength: interactionLaydownStrength,
    shadowStrength: interactionShadowStrengthValue,
    shadowUniform: true,
    contactBend: {
      baseAnchor: [0.06, 0.18],
      midBlade: [0.12, 0.52, 0.62],
      tipBlade: [0.45, 1.0, 0.38],
    },
    pushModel: 'body-oval-normal',
  };
  material.userData.webgpuGrassBladeMaterialControls = createWebGpuGrassBladeNodeMaterialControls(material);
  return material;
}

function createWebGpuGrassBladeNodeMaterialControls(material) {
  const nodes = material.userData.webgpuGrassBladeNodeUniforms;
  return {
    nodes,
    updateInteractors(state = {}) {
      const count = Math.max(0, Math.min(nodes.maxNodeInteractors, Number.isFinite(state.count) ? state.count : 0));
      nodes.interactorCount.value = count;
      if (count <= 0) return;
      const positions = state.positions;
      const facings = state.facings;
      const data = state.data;
      for (let i = 0; i < count; i++) {
        const pIdx = i * 3;
        const fIdx = i * 2;
        if (nodes.interactorPositions[i]?.value && positions?.length >= pIdx + 3) {
          nodes.interactorPositions[i].value.set(positions[pIdx], positions[pIdx + 1], positions[pIdx + 2]);
        }
        if (nodes.interactorFacings[i]?.value && facings?.length >= fIdx + 2) {
          nodes.interactorFacings[i].value.set(facings[fIdx], facings[fIdx + 1]);
        }
        if (nodes.interactorTypes[i]) {
          nodes.interactorTypes[i].value = data?.[i] ?? 0;
        }
      }
    },
    update() {},
    setWind(state = {}) {
      if (Number.isFinite(state.strength)) {
        nodes.windStrength.value = state.strength;
      }
      const direction = state.direction;
      if (direction && nodes.windDirection?.value) {
        nodes.windDirection.value.set(direction.x, direction.y);
      }
    },
    setSunDirection(state = {}) {
      copyNodeValue(nodes.sunDirection, state.sunDir);
    },
    setGrassLight(state = {}) {
      const f = state.factor;
      const node = nodes.grassLight;
      if (!node?.value || !f || !Number.isFinite(f.r)) return;
      node.value.set(f.r, f.g, f.b);
    },
    setInteractionShadowStrength(state = {}) {
      if (Number.isFinite(state.strength)) {
        nodes.interactionShadowStrength.value = Math.max(0, Math.min(1, state.strength));
      }
    },
    dispose() {},
  };
}

function copyNodeValue(node, value) {
  if (!node?.value || !value || typeof node.value.copy !== 'function') return;
  node.value.copy(value);
}
