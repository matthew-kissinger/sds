// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The materials the flock draws with, both of them TSL node materials on the
 * same authored sun: one source compiled for both backends, no ShaderMaterial,
 * no onBeforeCompile, no per-backend fork (AGENTS.md rule 3).
 *
 * The shaded body takes its bands from sheepRamp.ts, its colour from
 * sheepColor.ts and its motion from sheepMotion.ts. The outline is an inverted
 * hull in a cool dark brown, never black (spec/05 names sheep first in the
 * outline list). It shares the instance matrix, masks and whole vertex animation
 * with the body, while sheepOutlineGeometry.ts supplies one outer fleece proxy
 * instead of hulling every shaded puff.
 *
 * THE LINE IS NOW A DRAWN LINE. It was half an antialiased pixel at sRGB(126,108,93)
 * and read as an edge artifact against bright grass. Two things changed. The ink
 * is two and a half stops darker and hue shifted violet, so it arrives near
 * sRGB(73,59,67) - the same family as the face and the legs, which is what makes
 * the animal read as one drawing rather than as a shaded blob with a border. And
 * the width is solved for 2 px at Follow easing to 1.5 px at Classic (Flock.tsx),
 * where before it was one number for every distance.
 *
 * THE INK INSIDE THE FLEECE IS GONE, AND NOT BY TUNING. The shaded body remains
 * a union of about twenty puffs, but the outline draw replaces them with one
 * fitted exterior mass. Face, ears and legs retain the exposure bake at their
 * joins, where signed hull reach pulls buried vertices under the wool.
 *
 * The wool expands away from the body's spine segment. Head, ears and legs keep
 * their own normals because they are single convex silhouette parts.
 */

import * as THREE from 'three/webgpu';
import { PALETTE, SUN_DIRECTION } from '@app/tsl/palette';
import {
  abs,
  clamp,
  color,
  dot,
  float,
  instancedBufferAttribute,
  mix,
  normalLocal,
  normalWorld,
  normalize,
  positionLocal,
  sin,
  time,
  vec3,
  vec4,
  type TSLNode,
} from '@app/tsl/nodes';
import { readInstance, sheepBaseColor, sheepLightAdditions, type SheepNodes } from './sheepColor';
import { KEY_SHARE, SKY_SHARE } from './sheepRamp';
import { createSheepMotion } from './sheepMotion';
import { SPINE } from './sheepGeometry';

/** How much of the fleece's hull expansion runs along the body axis rather than
 *  along the vertex normal. High: the whole point is that a dozen puffs expand
 *  as one shell. Not 1, because the silhouette should still bulge where a clump
 *  bulges - and it does, because the hull moves each vertex OUT from where the
 *  geometry already put it, so the lobed profile survives whatever direction the
 *  extra width is spent in. */
const HULL_BODY = 0.92;

/**
 * Apparent ink coverage by part. The former wool/other split used 1.0 against
 * 0.3, which guaranteed alternating heavy and faint sections around one animal.
 * These values converge the perceived widths while respecting part mass: wool
 * carries the full silhouette, head and ears step down, and narrow legs use less
 * than half that reach so the hull does not replace the limb it describes.
 */
const OUTLINE_WOOL = 1.25;
const OUTLINE_HEAD = 0.48;
const OUTLINE_LEG = 0.28;

/**
 * One animal-scale undulation moves both terminators away from a repeated
 * horizontal shelf. It is evaluated in the shared sheep frame, not on puff UVs
 * or per-puff normals, so adjacent clumps stay part of one fleece mass.
 */
const FORM_WAVE_Z = 1.75;
const FORM_WAVE_X = 2.1;
const FORM_WAVE_DEPTH = 0.075;
const FORM_PHASE_SPREAD = 11.7;

/**
 * Deterministic identity at the whole-animal scale. One longitudinal wave
 * moves the shoulder, barrel and haunch by at most 2.8 cm. It is multiplied by
 * the wool mask, so face, legs and hoof contact are exact and unchanged. Body
 * and outline call the same function with the same packed seed.
 */
const IDENTITY_CONTOUR_DEPTH = 0.028;
const IDENTITY_CONTOUR_Z = 3.1;
const IDENTITY_CONTOUR_PHASE = 9.73;

/**
 * How far a buried vertex is pulled INWARD, as a fraction of the ink width.
 *
 * Stopping a buried face from expanding is not enough. The bake's weight fades
 * over a narrow band around a neighbour's surface, so a face a hair inside one
 * still carries most of its width and still emerges through it, which is the
 * faint stipple the previous pass left across the fleece. Mapping the weight to
 * a SIGNED offset instead - full width in open air, zero exactly at a
 * neighbour's radius, one and two thirds of a width inward when deeply buried - puts
 * the interior surfaces further under the skin the harder the line is pushed, so
 * the line cannot come back at any width. It is one multiply and a subtract in
 * the vertex shader.
 */
const HULL_SINK = 1.667;

/** The authored key, as a node. Same vector the shared ramp runs on: one light
 *  direction everywhere (spec/05), read from the palette rather than restated. */
const SUN = vec3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z) as TSLNode;

/** The whole vertex animation, bound to one instance's nodes. */
function sheepAnimation(nodes: SheepNodes, motionScale: TSLNode, terrainOffsets?: TSLNode) {
  return createSheepMotion(
    nodes.masks,
    nodes.legs,
    nodes.seed,
    nodes.gait,
    nodes.agitation,
    nodes.response,
    motionScale,
    time,
    terrainOffsets ?? vec4(0, 0, 0, 0),
  );
}

/** Large-scale deterministic fleece deformation shared by fill and outline. */
function fleeceIdentityPosition(local: TSLNode, nodes: SheepNodes): TSLNode {
  const spineZ = clamp(local.z, float(SPINE.zBack), float(SPINE.zFront));
  const outward = normalize(local.sub(vec3(float(0), float(SPINE.y), spineZ)));
  const reach = sin(
    local.z.mul(float(IDENTITY_CONTOUR_Z))
      .add(nodes.seed.mul(float(IDENTITY_CONTOUR_PHASE))),
  ).mul(float(IDENTITY_CONTOUR_DEPTH)).mul(nodes.masks.x);
  return local.add(outward.mul(reach));
}

/**
 * Optional presentation placement. The ordinary CPU flock leaves this absent
 * and uses InstancedMesh matrices. GPU-scale presentation supplies storage-
 * backed vertex placement while keeping this one material construction path.
 */
export interface SheepMaterialPlacement {
  readonly position: (local: TSLNode) => TSLNode;
  readonly normalView?: (local: TSLNode) => TSLNode;
}

export function makeSheepMaterialFromNodes(
  nodes: SheepNodes,
  motionScale: TSLNode,
  placement?: SheepMaterialPlacement,
  terrainOffsets?: TSLNode,
  varietyMode?: TSLNode,
): THREE.MeshBasicNodeMaterial {
  // Half-lambert against the key: the raw dot spends most of a rounded mass
  // below zero, which throws away the range the bands need.
  const nDotL = dot(normalWorld, SUN).mul(float(0.5)).add(float(0.5));
  // Sky visibility on a convex body is the world up-axis. Mixed in at 44 percent
  // it is what gives a vertical scan down the fleece a band edge to cross;
  // sheepRamp.ts carries the measurement behind that number.
  const skyTerm = normalWorld.y.mul(float(0.5)).add(float(0.5));
  const formWave = sin(
    positionLocal.z.mul(float(FORM_WAVE_Z))
      .add(positionLocal.x.mul(float(FORM_WAVE_X)))
      .add(nodes.seed.mul(float(FORM_PHASE_SPREAD))),
  ).mul(float(FORM_WAVE_DEPTH)).mul(nodes.masks.x);
  const light = nDotL.mul(float(KEY_SHARE))
    .add(skyTerm.mul(float(SKY_SHARE)))
    .add(formWave);

  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = sheepBaseColor(nodes, light, varietyMode).add(
    sheepLightAdditions(nodes, light, nDotL),
  );
  const animated = sheepAnimation(nodes, motionScale, terrainOffsets).displace(
    fleeceIdentityPosition(positionLocal, nodes),
  );
  material.positionNode = placement ? placement.position(animated) : animated;
  if (placement?.normalView) material.normalNode = placement.normalView(normalLocal);
  return material;
}

export function makeSheepOutlineMaterialFromNodes(
  nodes: SheepNodes,
  motionScale: TSLNode,
  placement?: SheepMaterialPlacement,
  terrainOffsets?: TSLNode,
): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  material.side = THREE.BackSide;
  // The expanded back faces are a contour layer, not an occluder. Let the
  // shaded puff union that renders immediately after this pass overwrite every
  // interior pixel even where the smooth proxy crosses a concave puff join.
  material.depthWrite = false;
  material.colorNode = color(PALETTE.sheepOutline);

  // Out of the spine segment, which is the same axis the fleece's shading
  // normals are pulled toward: one barrel, one shell, no interior lines.
  const spineZ = clamp(positionLocal.z, float(SPINE.zBack), float(SPINE.zFront));
  const away = normalize(positionLocal.sub(vec3(float(0), float(SPINE.y), spineZ)));
  const direction = normalize(mix(normalLocal, away, float(HULL_BODY).mul(nodes.masks.x)));
  // CPU width is divided by scaleY. Multiplying local X and Z by scaleY/scaleX
  // and scaleY/scaleZ makes the subsequent instance matrix cancel every axis:
  // S * (direction * ratios) * (ink / Sy) = direction * ink. The ratios ride
  // in the existing packed style buffer, so this correction adds no ninth
  // WebGPU vertex buffer. GPU storage placement keeps its own scalar path.
  const scaleCorrectedDirection = nodes.outlineScale === undefined
    ? direction
    : direction.mul(vec3(nodes.outlineScale.x, float(1), nodes.outlineScale.y));

  const reach = nodes.exposure.mul(float(1 + HULL_SINK)).sub(float(HULL_SINK));
  const limb = abs(nodes.legs.x);
  const darkPartWidth = mix(float(OUTLINE_HEAD), float(OUTLINE_LEG), limb);
  const partWidth = mix(darkPartWidth, float(OUTLINE_WOOL), nodes.masks.x);
  const width = nodes.outline.mul(partWidth).mul(reach);
  const animated = sheepAnimation(nodes, motionScale, terrainOffsets).displace(
    fleeceIdentityPosition(positionLocal, nodes).add(scaleCorrectedDirection.mul(width)),
  );
  material.positionNode = placement ? placement.position(animated) : animated;
  return material;
}

/**
 * The flock's shaded material.
 *
 * @param style per-instance vec4: fleece tint gain, noise seed, scaleY/scaleX,
 *   scaleY/scaleZ. Static and shared by body and outline.
 * @param motion per-instance vec4: integrated gait phase in radians, agitation
 *   from 0 at rest to 1 at the sim's top speed, and this instance's outline hull
 *   width in local metres, plus the short startle/turn/gate response envelope.
 *   One buffer rather than four, because every instanced
 *   attribute is a separate upload every frame and the flock reaches 5000.
 * @param terrain optional CPU-flock vec4 of moving hoof terrain offsets. The
 *   The shipped instanced flock path supplies it for every supported count.
 */
export function makeSheepMaterial(
  style: THREE.InstancedBufferAttribute,
  motion: THREE.InstancedBufferAttribute,
  motionScale: TSLNode,
  terrain?: THREE.InstancedBufferAttribute,
  varietyMode?: TSLNode,
): THREE.MeshBasicNodeMaterial {
  const nodes = readInstance(style, motion);
  const terrainNode = terrain ? instancedBufferAttribute(terrain, 'vec4') : undefined;
  return makeSheepMaterialFromNodes(nodes, motionScale, undefined, terrainNode, varietyMode);
}

/**
 * The outline hull. Its proxy geometry is pushed along the body axis and run
 * through the identical animation, so the line tracks every nod and stride.
 */
export function makeSheepOutlineMaterial(
  style: THREE.InstancedBufferAttribute,
  motion: THREE.InstancedBufferAttribute,
  motionScale: TSLNode,
  terrain?: THREE.InstancedBufferAttribute,
): THREE.MeshBasicNodeMaterial {
  const nodes = readInstance(style, motion);
  const terrainNode = terrain ? instancedBufferAttribute(terrain, 'vec4') : undefined;
  return makeSheepOutlineMaterialFromNodes(nodes, motionScale, undefined, terrainNode);
}
