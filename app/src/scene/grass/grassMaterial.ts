// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The grass shader: wind, bodies, and colour, all TSL, one source for both
 * backends (spec/01 hard rule 3 - no ShaderMaterial, no onBeforeCompile, no
 * per-backend fork).
 *
 * Everything happens at the tuft's ROOT and is then spread up the blade. The
 * root is an instanced attribute rather than the vertex's own world position,
 * for one reason: every blade in a clump has to sample the same gust and the
 * same body, or the clump shears instead of swaying. What varies per vertex is
 * only how far up the blade the vertex is.
 *
 * WIND (spec/06: three rotated flow octaves, variation 0.35-0.65). One octave
 * reads as a single coherent wavefront marching across the field, which looks
 * like a machine. Three, rotated off each other and running at different rates,
 * average into flow: fronts that form, cross and dissolve. The whole field
 * shares one travelling frame, so a gust crosses 200 m as one event rather than
 * as two hundred metres of independent wobble.
 *
 * BODIES (spec/06 carried constants, see interactionField.ts). Four bodies per
 * blade, looked up through the CPU-built grid. The footprint is an oriented
 * rounded rectangle in the body's own frame - never a world-axis ellipse - so a
 * dog turning through the grass turns its pressed patch with it. Age comes back
 * from the same texel and drives a spring response that crosses zero and
 * returns slightly negative, which is the grass standing up and overshooting.
 *
 * COLOUR. Every value traces to tsl/palette.ts. There are no hexes in this file
 * and there is no second green: the root, the tip, the trodden tone and the
 * per-tuft tint are all compositions of PALETTE entries, exactly as Terrain.tsx
 * composes its relief tint out of the sky. The band ramp is the shared one
 * (tsl/toon.ts), so the meadow is lit by the same three-band light as the sheep
 * standing in it. The painted breakup is the shared one (tsl/paintedField.ts),
 * so a clump standing on a browner patch of ground is itself browner - which
 * the two files used to assert in comments while quietly running two drifted
 * copies of the formula.
 *
 * GRADING IS A STRUCT. The knobs a polish pass actually turns - how gold the
 * tips go, how far a clump's hue may wander, how wide the per-tuft tint spreads
 * and how hard the wind blows - are fields on `GrassMaterialStyle` rather than
 * constants buried in the graph, and the five greens are `GrassPalette`. The
 * shipped defaults below are the values this material has always had, so the
 * struct changes nothing on its own; it is what lets the asset lab hold two
 * gradings against each other at one camera (spec/13).
 */

import * as THREE from 'three/webgpu';
import { PALETTE } from '@app/tsl/palette';
import { makeToonMaterial } from '@app/tsl/toon';
import {
  abs,
  clamp,
  color,
  cos,
  dot,
  Fn,
  float,
  fract,
  length,
  max as tslMax,
  min as tslMin,
  mix,
  normalize,
  pow,
  positionLocal,
  sin,
  smoothstep,
  step,
  texture,
  time,
  uv,
  vec2,
  vec3,
  instancedBufferAttribute,
  type TSLNode,
} from '@app/tsl/nodes';
import {
  DOG_FOOTPRINT,
  GHOST_BIRTH_DURATION,
  GRID_HALF_EXTENT,
  INTERACTION_RADIUS,
  KIND_OFFSET,
  INTERACTION_STRENGTH,
  SHEEP_FOOTPRINT,
  type InteractionField,
} from './interactionField';
import { paintedBlend } from '@app/tsl/paintedField';
import { BARK_WAVE_WIDTH } from '../juice/barkPulse';

const TAU = Math.PI * 2;

// --- wind -------------------------------------------------------------------

/** Where the wind comes FROM, as the unit direction it pushes toward. It rakes
 *  across both gameplay cameras rather than along them, so a gust crosses the
 *  frame instead of receding up it. */
const WIND_X = 0.76;
const WIND_Z = 0.65;

/**
 * The three octaves: rotation of the sample plane in radians, spatial frequency
 * in cycles per metre, and how fast the octave churns inside the travelling
 * frame. The rotations are the load-bearing part - unrotated octaves stack
 * their features on the same axes and the sum is still one wavefront. How much
 * each one counts for is graded, so it lives on the style struct.
 */
const OCTAVES = [
  { angle: 0, frequency: 0.03, evolve: 0.35 },
  { angle: 0.9, frequency: 0.092, evolve: 0.8 },
  { angle: -1.7, frequency: 0.27, evolve: 1.6 },
] as const;

/** Carried from spec/06: the gust envelope never leaves this band. */
const VARIATION_MIN = 0.35;
const VARIATION_MAX = 0.65;

/** Sway grows as t^this up the blade. Roots are planted; tips are not. */
const BEND_POWER = 1.6;
/** How far the wind may swing off its base direction, per octave. */
const SWIRL_MID = 0.42;
const SWIRL_FINE = 0.3;
/** A bent blade is shorter. Keeps the arc roughly isometric under sway. */
const BEND_DROP = 0.55;

// A blade pressed under a body keeps only the slow field-scale motion. Fine
// gust and tip flutter are suppressed first, preventing the stretched grass
// around a capsule or animal from jittering while it is held down.
const PRESS_WIND_MASK_START = 0.018;
const PRESS_WIND_MASK_END = 0.16;
const PRESS_FINE_MASK_START = 0.004;
const PRESS_FINE_MASK_END = 0.075;
const PRESSED_COARSE_RETENTION = 0.22;
const PRESSED_DETAIL_RETENTION = 0.06;
const PRESSED_FLUTTER_RETENTION = 0.015;

// --- bodies -----------------------------------------------------------------

const DOG_HALF_WID = DOG_FOOTPRINT.halfWid * INTERACTION_RADIUS;
const DOG_HALF_LEN = DOG_FOOTPRINT.halfLen * INTERACTION_RADIUS;
const SHEEP_HALF_WID = SHEEP_FOOTPRINT.halfWid * INTERACTION_RADIUS;
const SHEEP_HALF_LEN = SHEEP_FOOTPRINT.halfLen * INTERACTION_RADIUS;

/** Fraction of the sideways push that also presses the blade down. At 0.58 m
 *  of push that is 0.42 m of flatten, which lays a 0.52 m blade over. */
const FLATTEN = 0.72;

/**
 * The recovery spring, as a pure function of a ghost's age in seconds.
 *
 *   1.0 while the body is there, through zero at 0.54 s, down to about -0.11
 *   at 0.9 s, and exactly 0 at 1.55 s.
 *
 * The negative lobe is the overshoot: the blades that were pushed away lean
 * back past upright before settling. The envelope reaches zero rather than
 * decaying asymptotically because the trail is finite - the oldest ghost has to
 * be able to leave without a step (see interactionField.ts).
 */
const SPRING_DECAY = 1.55;
const SPRING_SHAPE = 2.4;
const SPRING_RATE = 2.9;

/**
 * The same curve in plain numbers, so the trail lengths in interactionField.ts
 * can be held against it by a test instead of by a comment. It is written here,
 * three lines from the node expression it mirrors, because two copies of a
 * formula that sit next to each other cannot drift unseen; two copies in
 * different files can.
 */
export function springResponse(age: number): number {
  const envelope = Math.max(0, Math.min(1, 1 - age / SPRING_DECAY)) ** SPRING_SHAPE;
  return envelope * Math.cos(age * SPRING_RATE);
}

// --- colour -----------------------------------------------------------------

/** Linear multiplier turning the pasture green into the tone at a blade's
 *  root, where light does not reach. Cool, not black: shadows keep their hue. */
/** Metres over which root occlusion fades out. Shape, not grade. */
const ROOT_AO_HEIGHT = 0.26;
/** How trodden ground is coloured: the surround's duller green carried toward
 *  the pen floor's warm trodden earth. */
const WORN_EARTH = 0.35;

// --- grading -----------------------------------------------------------------

/**
 * The five greens the meadow is made of, named for their role rather than for
 * where they came from. The default maps the game's own palette; this is a
 * lens onto tsl/palette.ts, never a second set of colours.
 */
export interface GrassPalette {
  readonly dark: string;
  readonly light: string;
  readonly surround: string;
  readonly wornEarth: string;
  readonly sunGlow: string;
}

export const DEFAULT_GRASS_PALETTE: GrassPalette = {
  dark: PALETTE.grassDark,
  light: PALETTE.grassLight,
  surround: PALETTE.surround,
  wornEarth: PALETTE.penGround,
  sunGlow: PALETTE.sunGlow,
};

/** What a grading pass is allowed to move without touching the graph. */
export interface GrassMaterialStyle {
  /** How fast the whole flow frame travels, m/s. A gust crosses the 200 m
   *  field in half a minute: weather, not a conveyor belt. */
  readonly windSpeed: number;
  /** What each of the three octaves counts for in the summed flow. */
  readonly octaveWeights: readonly [number, number, number];
  /** Metres a tip travels at variation 1.0. The variation band turns this into
   *  0.13 m to 0.25 m of sway on a 0.44 m blade: visible from the beauty
   *  camera, not a wheat field in a gale. */
  readonly windReach: number;
  /** Per-blade flutter: the small shiver that keeps a clump from moving as one
   *  rigid object. Tip only. */
  readonly flutterRate: number;
  readonly flutterAmplitude: number;
  /**
   * Linear multiplier turning the pasture green into the tone at a blade's
   * root, where light does not reach. Cool, not black: spec/05 is explicit
   * that shadows shift hue toward cool and never toward gray or mud, so the
   * blue channel always comes down least.
   */
  readonly rootShade: readonly [number, number, number];
  /**
   * Root occlusion, grounding each clump. Shallow on purpose: root tint and
   * toon shade already supply depth, and multiplying them into a hard dark
   * ring around every clump reads as an outline beside the softer tree
   * masses - which spec/05 forbids on grass specifically.
   */
  readonly rootAo: number;
  /**
   * Darkening at a blade's two long edges, so a flat strip of triangles reads
   * as a strand with a spine. The brake on this one is the reference bar:
   * grass is brushstroke masses, not photoreal blades, and edge contrast is
   * what pulls a mass apart into countable blades.
   */
  readonly spineEdge: number;
  /** How much of the sun's own halo the tips take. Grass that catches the
   *  light goes gold before it goes white, and this is the whole difference
   *  between a green field and a golden-hour one. */
  readonly tipGold: number;
  /** Per-tuft brightness spread. Enough to break the mass, not enough to read
   *  as patchwork. */
  readonly tintMin: number;
  readonly tintMax: number;
  /**
   * How far a clump's own colour may pull away from the pasture tone, toward
   * the duller surround green at one end and the light pasture green at the
   * other. Brightness variation alone reads as noise; hue variation reads as
   * plants.
   */
  readonly clumpHue: number;
}

/**
 * The shipped grading.
 *
 * Wind is untouched from the original material. Colour was regraded against
 * spec/05 in the asset lab, three gradings at one camera, and the numbers
 * below are the ones that won:
 *
 *  - ROOT SHADE went deeper, from [0.72, 0.8, 0.9]. "Saturated shadows,
 *    hue-shifted cool, never gray mud" is a hard rule, and the old root was
 *    pale enough to read as washed out rather than as shadow. Blue still comes
 *    down least, so the shadow stays cool.
 *  - TIP GOLD and CLUMP HUE went up, from 0.16 and 0.28. "Sun-warmed greens
 *    and golds", and hue variation between clumps is what reads as plants
 *    where brightness variation alone reads as noise.
 *  - TINT widened a little, from 0.95-1.05, to keep large flats off vector-flat
 *    without crossing into speckle.
 *  - ROOT AO came down only slightly, from 0.82. Deeper looked better in
 *    isolation and worse in the field: it draws a dark ring at every clump
 *    base, and spec/05 puts grass explicitly outside the outline pass.
 *  - SPINE EDGE did not move. Edge contrast is what pulls a mass apart into
 *    countable blades, and the reference bar is brushstroke masses.
 *
 * What this buys, at the Classic camera, is the hard rule in spec/05: the
 * flock parts into individual sheep and the dog is findable in under a second,
 * where against the old lighter field they were a pale cluster in pale green.
 */
export const DEFAULT_GRASS_STYLE: GrassMaterialStyle = {
  windSpeed: 6.5,
  octaveWeights: [0.55, 0.3, 0.15],
  windReach: 0.38,
  flutterRate: 5.2,
  flutterAmplitude: 0.035,
  rootShade: [0.62, 0.72, 0.86],
  rootAo: 0.76,
  spineEdge: 0.96,
  tipGold: 0.24,
  tintMin: 0.91,
  tintMax: 1.11,
  clumpHue: 0.38,
};

export interface GrassMaterialInputs {
  /** Per-tuft (worldX, worldZ, seed, vigour). See tuftData.ts. */
  readonly tufts: THREE.InstancedBufferAttribute;
  /** null on the surround tier: no body in this game can reach it. */
  readonly interaction: InteractionField | null;
  /** Omitted everywhere the game mounts this. The lab grades with it. */
  readonly palette?: GrassPalette;
  readonly style?: GrassMaterialStyle;
}

/**
 * The wind's field: roughly [-1, 1], and the inner stroke warps the outer one
 * so a gust does not resolve into straight sine bands. Two sine operations,
 * which avoids MaterialX noise's large generated helper library while keeping
 * coherent authored-scale features.
 *
 * The colour breakup does NOT come through here any more - it is the shared
 * lattice value noise in tsl/paintedField.ts, so the grass and the ground read
 * one field. Wind keeps a sine form because it has to EVOLVE: `phase` is a time
 * node, and a lattice would have to be re-hashed per frame to move.
 */
function flowField(
  root: TSLNode,
  frequency: number,
  angle: number,
  phase: TSLNode,
): TSLNode {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const x = root.x.mul(float(c)).add(root.y.mul(float(s))).mul(float(frequency * TAU));
  const z = root.y.mul(float(c)).sub(root.x.mul(float(s))).mul(float(frequency * TAU));
  const cross = sin(
    z.mul(float(1.37))
      .sub(x.mul(float(0.43)))
      .sub(phase.mul(float(0.73))),
  );
  return sin(x.add(z.mul(float(0.61))).add(phase).add(cross.mul(float(0.72))));
}

/** One octave of travelling, rotated flow, in roughly [-1, 1]. */
function octave(root: TSLNode, travel: TSLNode, index: number): TSLNode {
  const { angle, frequency, evolve } = OCTAVES[index]!;
  const flow = root.sub(travel);
  return flowField(flow, frequency, angle, time.mul(float(evolve)));
}

/**
 * What one body does to a blade at `root`. `slot` is the interactor texture's
 * u coordinate, or 0 for an empty slot - which multiplies the whole result away
 * rather than branching, because the four slots of a cell are either all empty
 * (most of the field, most of the time) or a coherent handful, and a masked
 * multiply costs less than a divergent branch either way.
 */
function bodyPush(root: TSLNode, slot: TSLNode, record: TSLNode): TSLNode {
  const raw = record.z;
  // Kind rides on the heading (interactionField.ts): the angle is bounded by
  // pi, so anything past half the offset is a sheep.
  const kind = step(float(KIND_OFFSET / 2), raw);
  const heading = raw.sub(kind.mul(float(KIND_OFFSET)));
  const forward = vec2(cos(heading), sin(heading));
  const right = vec2(forward.y, forward.x.negate());

  const offset = root.sub(record.xy);
  // The body's own frame: x across it, y along its facing.
  const local = vec2(dot(offset, right), dot(offset, forward));
  const halfWid = mix(float(DOG_HALF_WID), float(SHEEP_HALF_WID), kind);
  const halfLen = mix(float(DOG_HALF_LEN), float(SHEEP_HALF_LEN), kind);
  const falloff = mix(float(DOG_FOOTPRINT.falloff), float(SHEEP_FOOTPRINT.falloff), kind);

  // Rounded-rect SDF: negative inside the body, 0 on its edge, metres outside.
  const q = abs(local).sub(vec2(halfWid, halfLen));
  const sdf = length(tslMax(q, vec2(0, 0))).add(tslMin(tslMax(q.x, q.y), float(0)));
  const t = clamp(sdf.div(falloff), float(0), float(1));
  const press = float(1).sub(t.mul(t).mul(float(3).sub(t.mul(float(2)))));

  const age = record.w;
  const envelope = pow(clamp(float(1).sub(age.div(float(SPRING_DECAY))), float(0), float(1)), float(SPRING_SHAPE));
  const isGhost = step(float(0.0001), age);
  const birth = mix(
    float(1),
    smoothstep(float(0), float(GHOST_BIRTH_DURATION), age),
    isGhost,
  );
  const response = envelope.mul(cos(age.mul(float(SPRING_RATE)))).mul(birth);

  const strength = press.mul(response).mul(step(float(0.0001), slot)).mul(float(INTERACTION_STRENGTH));
  // Away from the body centre. The fallback matters only at the exact centre,
  // where the blade is under the body and its direction is arbitrary anyway.
  const away = offset.div(tslMax(length(offset), float(0.001)));
  return vec3(away.x.mul(strength), strength.mul(float(FLATTEN)).negate(), away.y.mul(strength));
}

/** The accepted bark's fast startle front. A narrow positive bend is followed
 * by a smaller negative lobe, so the grass springs past upright as it recovers. */
function barkPush(root: TSLNode, pulse: THREE.DataTexture): TSLNode {
  const record: TSLNode = texture(pulse, vec2(float(0.5), float(0.5)), 0);
  const offset = root.sub(record.xy);
  const distance = length(offset);
  const passed = record.z.sub(distance);
  const front = smoothstep(float(-BARK_WAVE_WIDTH), float(0), passed)
    .mul(float(1).sub(smoothstep(float(0), float(BARK_WAVE_WIDTH * 0.45), passed)));
  const spring = smoothstep(float(BARK_WAVE_WIDTH * 0.25), float(BARK_WAVE_WIDTH * 0.55), passed)
    .mul(float(1).sub(smoothstep(float(BARK_WAVE_WIDTH * 0.55), float(BARK_WAVE_WIDTH), passed)))
    .mul(float(0.24));
  const response = front.sub(spring).mul(record.w);
  const away = offset.div(tslMax(distance, float(0.001)));
  return vec3(
    away.x.mul(response).mul(float(0.46)),
    response.mul(float(-0.34)),
    away.y.mul(response).mul(float(0.46)),
  );
}

export function makeGrassMaterial(inputs: GrassMaterialInputs): THREE.MeshBasicNodeMaterial {
  const palette = inputs.palette ?? DEFAULT_GRASS_PALETTE;
  const style = inputs.style ?? DEFAULT_GRASS_STYLE;

  const tuft: TSLNode = instancedBufferAttribute(inputs.tufts, 'vec4');
  const root = tuft.xy;
  const seed = tuft.z;
  const vigour = tuft.w;

  const across = uv().x;
  const along = uv().y;
  const phase = uv(1).x;
  const stature = uv(1).y;

  // --- wind -----------------------------------------------------------------

  const travel = vec2(float(WIND_X), float(WIND_Z)).mul(time.mul(float(style.windSpeed)));
  const coarse = octave(root, travel, 0);
  const middle = octave(root, travel, 1);
  const fine = octave(root, travel, 2);

  const flow = coarse
    .mul(float(style.octaveWeights[0]))
    .add(middle.mul(float(style.octaveWeights[1])))
    .add(fine.mul(float(style.octaveWeights[2])));
  const gust = clamp(flow.mul(float(0.5)).add(float(0.5)), float(0), float(1));
  const variation = mix(float(VARIATION_MIN), float(VARIATION_MAX), gust);
  const coarseGust = clamp(coarse.mul(float(0.5)).add(float(0.5)), float(0), float(1));
  const coarseVariation = mix(float(VARIATION_MIN), float(VARIATION_MAX), coarseGust);

  // The direction swings with the two finer octaves, so a gust arrives at a
  // slightly different angle everywhere it touches.
  const swirl = middle.mul(float(SWIRL_MID)).add(fine.mul(float(SWIRL_FINE)));
  const perpendicular = vec2(float(-WIND_Z), float(WIND_X));
  const direction = normalize(
    vec2(float(WIND_X), float(WIND_Z)).add(perpendicular.mul(swirl)),
  );
  const coarseDirection = normalize(vec2(float(WIND_X), float(WIND_Z)));

  const reach = pow(along, float(BEND_POWER));
  const flutter = sin(time.mul(float(style.flutterRate)).add(phase.mul(float(TAU))).add(seed.mul(float(41.7))));
  const windSway = variation
    .mul(float(style.windReach))
    .mul(stature)
    .mul(reach);
  const coarseSway = coarseVariation
    .mul(float(style.windReach))
    .mul(stature)
    .mul(reach);
  const detailSway = windSway.sub(coarseSway);
  const flutterSway = flutter.mul(float(style.flutterAmplitude)).mul(reach.mul(along));

  // --- bodies ---------------------------------------------------------------

  let coarseRetention: TSLNode = float(1);
  let detailRetention: TSLNode = float(1);
  let flutterRetention: TSLNode = float(1);
  let bodyX: TSLNode = float(0);
  let bodyZ: TSLNode = float(0);
  let bodyY: TSLNode = float(0);
  let barkX: TSLNode = float(0);
  let barkZ: TSLNode = float(0);
  let barkY: TSLNode = float(0);

  if (inputs.interaction !== null) {
    const { interactors, cells } = inputs.interaction;
    // Keep the four-body visual contract but emit one reusable shader function
    // instead of inlining the rounded-rectangle footprint graph four times.
    // This is an exact algebraic refactor: the slots, texture and response are
    // unchanged, while cold node building and generated source are bounded.
    const evaluateBodyPush = Fn(
      ([at, slot, record]: TSLNode[]) => bodyPush(at, slot, record),
      { at: 'vec2', slot: 'float', record: 'vec4', return: 'vec3' },
    );
    const cellUV = root
      .add(vec2(float(GRID_HALF_EXTENT), float(GRID_HALF_EXTENT)))
      .div(float(GRID_HALF_EXTENT * 2));
    const slots: TSLNode = texture(cells, cellUV, 0);
    // Sample the records in the caller. Capturing a texture inside a reusable
    // Fn can omit its uniform dependency from generated WGSL, leaving the
    // textureDimensions call with an unresolved nodeUniform.
    const recordX: TSLNode = texture(interactors, vec2(slots.x, float(0.5)), 0);
    const recordY: TSLNode = texture(interactors, vec2(slots.y, float(0.5)), 0);
    const recordZ: TSLNode = texture(interactors, vec2(slots.z, float(0.5)), 0);
    const recordW: TSLNode = texture(interactors, vec2(slots.w, float(0.5)), 0);
    const push = evaluateBodyPush(root, slots.x, recordX)
      .add(evaluateBodyPush(root, slots.y, recordY))
      .add(evaluateBodyPush(root, slots.z, recordZ))
      .add(evaluateBodyPush(root, slots.w, recordW));
    const bark = barkPush(root, inputs.interaction.barkPulse);

    // Overlapping ghosts along a trail would otherwise stack into a shove no
    // single body ever applies; the cap is what keeps a wake flat rather than
    // explosive, and it is the carried strength, not a new number.
    const horizontal = vec2(push.x, push.z);
    const magnitude = length(horizontal);
    const capped = horizontal.mul(
      tslMin(magnitude, float(INTERACTION_STRENGTH)).div(tslMax(magnitude, float(0.0001))),
    );
    const flattened = clamp(
      push.y,
      float(-INTERACTION_STRENGTH * FLATTEN),
      float(INTERACTION_STRENGTH * FLATTEN * 0.5),
    );

    const horizontalPress = clamp(magnitude.div(float(INTERACTION_STRENGTH)), float(0), float(1));
    const verticalPress = clamp(
      abs(flattened).div(float(INTERACTION_STRENGTH * FLATTEN)),
      float(0),
      float(1),
    );
    const localPress = tslMax(horizontalPress, verticalPress);
    const windMask = smoothstep(
      float(PRESS_WIND_MASK_START),
      float(PRESS_WIND_MASK_END),
      localPress,
    );
    const fineMask = smoothstep(
      float(PRESS_FINE_MASK_START),
      float(PRESS_FINE_MASK_END),
      localPress,
    );
    coarseRetention = mix(float(1), float(PRESSED_COARSE_RETENTION), windMask);
    detailRetention = mix(float(1), float(PRESSED_DETAIL_RETENTION), fineMask);
    flutterRetention = mix(float(1), float(PRESSED_FLUTTER_RETENTION), fineMask);
    bodyX = capped.x;
    bodyZ = capped.y;
    bodyY = flattened;
    barkX = bark.x;
    barkZ = bark.z;
    barkY = bark.y;
  }

  const coarseOffset = coarseDirection.mul(coarseSway.mul(coarseRetention));
  const fineSway = detailSway.mul(detailRetention).add(flutterSway.mul(flutterRetention));
  const windOffset = coarseOffset.add(direction.mul(fineSway));
  const sway = coarseSway.mul(coarseRetention).add(fineSway);
  const displaceX = windOffset.x.add(bodyX.add(barkX).mul(reach));
  const displaceZ = windOffset.y.add(bodyZ.add(barkZ).mul(reach));
  const displaceY = sway
    .mul(sway)
    .mul(float(BEND_DROP))
    .negate()
    .add(bodyY.add(barkY).mul(reach));

  // --- colour ---------------------------------------------------------------

  // The ground's own breakup, read at the tuft's root rather than per vertex,
  // so a whole clump belongs to the patch it stands on (tsl/paintedField.ts).
  const blend = paintedBlend(root);

  // Each clump draws its own tone off its baked seed, so neighbours differ in
  // hue and not only in brightness.
  const clumpTone = mix(
    color(palette.surround),
    color(palette.light),
    smoothstep(float(0.12), float(0.88), fract(seed.mul(float(19.73)))),
  );
  const ground = mix(color(palette.dark), color(palette.light), blend);
  const pasture = mix(ground, clumpTone, float(style.clumpHue));
  const rootTone = color(palette.dark).mul(vec3(...style.rootShade));
  const tipTone = mix(color(palette.light), color(palette.sunGlow), float(style.tipGold));

  const stalk = mix(rootTone, pasture, smoothstep(float(0.02), float(0.46), along));
  const lit = mix(stalk, tipTone, smoothstep(float(0.48), float(1), along));

  // Trodden ground: the surround's duller green carried toward the pen floor's
  // warm earth, faded in by the baked vigour.
  const worn = mix(color(palette.surround), color(palette.wornEarth), float(WORN_EARTH));
  const health = mix(worn, lit, smoothstep(float(0.32), float(0.94), vigour));

  const tint = mix(float(style.tintMin), float(style.tintMax), fract(seed.mul(float(7.31))));
  const occlusion = mix(
    float(style.rootAo),
    float(1),
    smoothstep(float(0), float(ROOT_AO_HEIGHT), along),
  );
  const spine = mix(float(style.spineEdge), float(1), sin(across.mul(float(Math.PI))));

  const material = makeToonMaterial(health.mul(tint).mul(occlusion).mul(spine));
  material.positionNode = positionLocal.add(vec3(displaceX, displaceY, displaceZ));
  // Blades are strips: half of them are seen from behind at any moment, and
  // three flips the normal for those so the far side lights as the far side.
  material.side = THREE.DoubleSide;
  return material;
}
