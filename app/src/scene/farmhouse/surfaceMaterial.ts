// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * One shader template for the five opaque farmhouse skins.
 *
 * Wall, roof, barn board, bare timber and masonry used to construct five node
 * graphs. They differed only in which authored bands and surface treatments
 * were active, so the renderer had to compile five pipelines before the first
 * playable frame. This module expresses those same formulas as one graph whose
 * values come from `materialReference` uniforms. Every material shares the exact
 * same color node and program cache key; `userData.farmhouseSurface` supplies
 * the per-draw palette and treatment values and is intentionally excluded from
 * Three's material cache key.
 *
 * The neutral settings are mathematical identities. No treatment was deleted:
 * the wall still has rain patches, eave shade and a damp course; board skins
 * retain both board and wear fields; dressings retain stone grain and courses;
 * slate retains weather, sky occlusion and wandering joints.
 */

import * as THREE from 'three/webgpu';
import { RAMP, SUN_DIRECTION } from '@app/tsl/palette';
import { makeToonMaterial } from '@app/tsl/toon';
import {
  abs,
  dot,
  float,
  fract,
  materialReference,
  mix,
  normalWorld,
  positionWorld,
  sin,
  smoothstep,
  uv,
  vec3,
  type TSLNode,
} from '@app/tsl/nodes';
import { bandedBaseColors, type BandedBaseColors } from './bands';
import { BARN, BARN_ROOF, DRESS, MASONRY, ROOF, TIMBER, WALL, WALL_PATCH } from './palette';

export type FarmhouseSurfaceKind = 'wall' | 'roof' | 'barn' | 'timber' | 'dress';

interface FieldParameters {
  readonly scale: THREE.Vector3;
  readonly threshold: number;
  readonly edge: number;
}

interface PatchParameters extends FieldParameters {
  readonly low: number;
  readonly high: number;
}

/** Values read by the shared TSL graph from the current material. */
export interface FarmhouseSurfaceParameters {
  readonly primary: BandedBaseColors;
  readonly secondary: BandedBaseColors;
  readonly basePatch: FieldParameters;
  readonly basePatchWeight: number;
  readonly baseUvWeight: number;
  readonly detailOne: PatchParameters;
  readonly detailTwo: PatchParameters;
  readonly eaveBand: number;
  readonly eaveEdge: number;
  readonly eaveGain: number;
  readonly wallLevel: number;
  readonly dampCourse: number;
  readonly dampEdge: number;
  readonly dampGain: number;
  readonly stoneWeight: number;
  readonly stoneCourse: number;
  readonly stoneJointStart: number;
  readonly stoneJointEnd: number;
  readonly stoneJointGain: number;
  readonly roofWeight: number;
  readonly roofCoursePitch: number;
  readonly roofCourseHalf: number;
  readonly roofCourseEdge: number;
  readonly roofCourseDrop: number;
  readonly roofCourseWander: number;
  readonly roofEaveEdges: THREE.Vector2;
  readonly roofRidgeEdges: THREE.Vector2;
  readonly roofAtEave: THREE.Vector3;
  readonly roofAtMid: THREE.Vector3;
  readonly roofAtRidge: THREE.Vector3;
}

const USER_DATA_PATH = 'userData.farmhouseSurface';

/** Shared wall/dressing constants, retained at their authored values. */
const EAVE_BAND = 0.46;
const EAVE_EDGE = 0.06;
const DAMP_COURSE = 0.66;
const DAMP_EDGE = 0.07;
const STONE_COURSE = 0.5;

/** Authored slate-course and sky-ramp values from the former roof-only graph. */
const ROOF_COURSE_PITCH = 0.95;
const ROOF_COURSE_HALF = 0.075;
const ROOF_COURSE_EDGE = 0.03;
const ROOF_COURSE_DROP = 0.79;
const ROOF_COURSE_WANDER = 0.16;
const ROOF_EAVE_EDGES = new THREE.Vector2(0.9, 1.45);
const ROOF_RIDGE_EDGES = new THREE.Vector2(2.6, 3.2);
const ROOF_AT_EAVE = new THREE.Vector3(0.85, 0.86, 0.92);
const ROOF_AT_MID = new THREE.Vector3(0.94, 0.945, 0.975);
const ROOF_AT_RIDGE = new THREE.Vector3(1.0, 0.99, 0.97);

const NEUTRAL_FIELD: FieldParameters = {
  scale: new THREE.Vector3(1, 1, 1),
  threshold: 0,
  edge: 0.02,
};

const NEUTRAL_PATCH: PatchParameters = {
  ...NEUTRAL_FIELD,
  low: 1,
  high: 1,
};

interface SurfacePreset {
  readonly primary: Parameters<typeof bandedBaseColors>[0];
  readonly secondary?: Parameters<typeof bandedBaseColors>[0];
  readonly basePatch?: FieldParameters;
  readonly basePatchWeight?: number;
  readonly baseUvWeight?: number;
  readonly detailOne?: PatchParameters;
  readonly detailTwo?: PatchParameters;
  readonly eaveGain?: number;
  readonly wallLevel?: number;
  readonly dampGain?: number;
  readonly stoneWeight?: number;
  readonly roofWeight?: number;
}

function patch(
  scale: readonly [number, number, number],
  threshold: number,
  edge: number,
  low: number,
  high: number,
): PatchParameters {
  return { scale: new THREE.Vector3(...scale), threshold, edge, low, high };
}

function field(
  scale: readonly [number, number, number],
  threshold: number,
  edge: number,
): FieldParameters {
  return { scale: new THREE.Vector3(...scale), threshold, edge };
}

function surfaceParameters(preset: SurfacePreset): FarmhouseSurfaceParameters {
  return {
    primary: bandedBaseColors(preset.primary),
    secondary: bandedBaseColors(preset.secondary ?? preset.primary),
    basePatch: preset.basePatch ?? NEUTRAL_FIELD,
    basePatchWeight: preset.basePatchWeight ?? 0,
    baseUvWeight: preset.baseUvWeight ?? 0,
    detailOne: preset.detailOne ?? NEUTRAL_PATCH,
    detailTwo: preset.detailTwo ?? NEUTRAL_PATCH,
    eaveBand: EAVE_BAND,
    eaveEdge: EAVE_EDGE,
    eaveGain: preset.eaveGain ?? 1,
    wallLevel: preset.wallLevel ?? 0,
    dampCourse: DAMP_COURSE,
    dampEdge: DAMP_EDGE,
    dampGain: preset.dampGain ?? 1,
    stoneWeight: preset.stoneWeight ?? 0,
    stoneCourse: STONE_COURSE,
    stoneJointStart: 0.42,
    stoneJointEnd: 0.455,
    stoneJointGain: 0.86,
    roofWeight: preset.roofWeight ?? 0,
    roofCoursePitch: ROOF_COURSE_PITCH,
    roofCourseHalf: ROOF_COURSE_HALF,
    roofCourseEdge: ROOF_COURSE_EDGE,
    roofCourseDrop: ROOF_COURSE_DROP,
    roofCourseWander: ROOF_COURSE_WANDER,
    roofEaveEdges: ROOF_EAVE_EDGES.clone(),
    roofRidgeEdges: ROOF_RIDGE_EDGES.clone(),
    roofAtEave: ROOF_AT_EAVE.clone(),
    roofAtMid: ROOF_AT_MID.clone(),
    roofAtRidge: ROOF_AT_RIDGE.clone(),
  };
}

/**
 * Material-specific values. Every number is the value from the former dedicated
 * material function; this switch is the auditable boundary between art data and
 * the one shader template.
 */
export function farmhouseSurfaceParameters(
  kind: FarmhouseSurfaceKind,
  wallLevel = 0,
): FarmhouseSurfaceParameters {
  switch (kind) {
    case 'wall':
      return surfaceParameters({
        primary: WALL,
        secondary: WALL_PATCH,
        basePatch: field([0.62, 0.2, 0.62], 0.3, 0.012),
        basePatchWeight: 1,
        eaveGain: 0.79,
        wallLevel,
        dampGain: 0.93,
      });
    case 'roof':
      return surfaceParameters({
        primary: ROOF,
        secondary: BARN_ROOF,
        baseUvWeight: 1,
        detailOne: patch([0.07, 0.62, 0.07], 0.3, 0.02, 1, 0.93),
        roofWeight: 1,
      });
    case 'barn':
      return surfaceParameters({
        primary: BARN,
        detailOne: patch([0.72, 0.05, 0.72], 0, 0.012, 0.9, 1),
        detailTwo: patch([0.14, 0.1, 0.14], 0.28, 0.02, 1, 0.95),
        eaveGain: 0.82,
      });
    case 'timber':
      return surfaceParameters({
        primary: TIMBER,
        detailOne: patch([0.85, 0.04, 0.85], 0, 0.012, 0.88, 1),
        detailTwo: patch([0.18, 0.12, 0.18], 0.26, 0.02, 1, 0.94),
        eaveGain: 0.84,
      });
    case 'dress':
      return surfaceParameters({
        primary: DRESS,
        secondary: MASONRY,
        baseUvWeight: 1,
        detailOne: patch([0.42, 0.42, 0.42], 0.18, 0.02, 0.95, 1.04),
        stoneWeight: 1,
      });
  }
}

function ref(name: string, type: string): TSLNode {
  return materialReference(`${USER_DATA_PATH}.${name}`, type);
}

function referencedBands(name: 'primary' | 'secondary'): TSLNode {
  const n = dot(
    normalWorld,
    vec3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z),
  ).mul(0.5).add(0.5);
  const halfTerminator = RAMP.terminator / 2;
  const outOfShadow = smoothstep(
    float(RAMP.shadowEdge - halfTerminator),
    float(RAMP.shadowEdge + halfTerminator),
    n,
  );
  const intoKey = smoothstep(
    float(RAMP.litEdge - halfTerminator),
    float(RAMP.litEdge + halfTerminator),
    n,
  );
  return mix(
    mix(ref(`${name}.shade`, 'color'), ref(`${name}.body`, 'color'), outOfShadow),
    ref(`${name}.key`, 'color'),
    intoKey,
  );
}

/**
 * Compact, non-axis-aligned painted breakup in roughly [-1, 1].
 *
 * MaterialX noise expanded this one shared surface graph to a 15 kB fragment
 * shader and accounted for the longest pipeline in the cold compiler. Three
 * crossed strokes keep the same broad, irregular weathering read without its
 * helper library. The crossed second stroke is warped by the first, so the
 * result does not resolve into visible parallel sine bands. Two strokes are
 * deliberate: this helper is expanded four times in the shared surface graph,
 * and the third stroke pushed the farmhouse's first visible frame over the
 * 100 ms presentation-freeze ceiling without adding a readable value band.
 */
function paintedField(point: TSLNode, phase: number): TSLNode {
  const first = sin(
    point.x.mul(float(1.17))
      .add(point.y.mul(float(0.83)))
      .add(point.z.mul(float(0.61)))
      .add(float(phase)),
  );
  const second = sin(
    point.x.mul(float(-0.43))
      .add(point.y.mul(float(1.31)))
      .add(point.z.mul(float(0.97)))
      .add(first.mul(float(0.57)))
      .add(float(phase * 1.73 + 0.41)),
  );
  return first.mul(float(0.64)).add(second.mul(float(0.36)));
}

function referencedPatch(
  name: 'basePatch' | 'detailOne' | 'detailTwo',
  phase: number,
): TSLNode {
  const field = paintedField(positionWorld.mul(ref(`${name}.scale`, 'vec3')), phase);
  const threshold = ref(`${name}.threshold`, 'float');
  const edge = ref(`${name}.edge`, 'float');
  return smoothstep(threshold.sub(edge), threshold.add(edge), field);
}

function buildSharedSurfaceBase(): TSLNode {
  const basePatch = referencedPatch('basePatch', 0.37);
  const baseMix = basePatch
    .mul(ref('basePatchWeight', 'float'))
    .add(uv().x.mul(ref('baseUvWeight', 'float')));
  const base = mix(referencedBands('primary'), referencedBands('secondary'), baseMix);

  const detailOne = referencedPatch('detailOne', 2.11);
  const detailTwo = referencedPatch('detailTwo', 4.73);
  let surface = base
    .mul(mix(ref('detailOne.low', 'float'), ref('detailOne.high', 'float'), detailOne))
    .mul(mix(ref('detailTwo.low', 'float'), ref('detailTwo.high', 'float'), detailTwo));

  const eaveBand = ref('eaveBand', 'float');
  const eaveShade = float(1).sub(
    smoothstep(eaveBand, eaveBand.add(ref('eaveEdge', 'float')), uv().y),
  );
  surface = surface.mul(mix(float(1), ref('eaveGain', 'float'), eaveShade));

  const height = positionWorld.y.sub(ref('wallLevel', 'float'));
  const dampCourse = ref('dampCourse', 'float');
  const damp = float(1).sub(
    smoothstep(dampCourse, dampCourse.add(ref('dampEdge', 'float')), height),
  );
  surface = surface.mul(mix(float(1), ref('dampGain', 'float'), damp));

  const stoneLine = fract(positionWorld.y.mul(float(1).div(ref('stoneCourse', 'float'))));
  const stoneJoint = smoothstep(
    ref('stoneJointStart', 'float'),
    ref('stoneJointEnd', 'float'),
    abs(stoneLine.sub(float(0.5))),
  );
  surface = surface.mul(
    mix(
      float(1),
      ref('stoneJointGain', 'float'),
      stoneJoint.mul(uv().x).mul(ref('stoneWeight', 'float')),
    ),
  );

  const up = uv().y;
  const onSlate = smoothstep(float(-0.5), float(-0.1), up);
  const roofRamp = mix(
    mix(
      ref('roofAtEave', 'vec3'),
      ref('roofAtMid', 'vec3'),
      smoothstep(ref('roofEaveEdges', 'vec2').x, ref('roofEaveEdges', 'vec2').y, up),
    ),
    ref('roofAtRidge', 'vec3'),
    smoothstep(ref('roofRidgeEdges', 'vec2').x, ref('roofRidgeEdges', 'vec2').y, up),
  );
  const roofSky = mix(vec3(1, 1, 1), roofRamp, onSlate);
  surface = surface.mul(mix(vec3(1, 1, 1), roofSky, ref('roofWeight', 'float')));

  const wander = paintedField(
    positionWorld.mul(vec3(0.09, 0.035, 0.09)),
    6.19,
  ).mul(
    ref('roofCourseWander', 'float'),
  );
  const roofLine = fract(up.mul(float(1).div(ref('roofCoursePitch', 'float'))).add(wander));
  const roofHalf = ref('roofCourseHalf', 'float');
  const roofEdge = ref('roofCourseEdge', 'float');
  const roofJoint = smoothstep(
    float(0.5).sub(roofHalf).sub(roofEdge),
    float(0.5).sub(roofHalf),
    abs(roofLine.sub(float(0.5))),
  );
  const sloped = smoothstep(float(0.22), float(0.45), abs(normalWorld.y));
  const courses = mix(
    float(1),
    ref('roofCourseDrop', 'float'),
    roofJoint.mul(sloped).mul(onSlate),
  );
  return surface.mul(mix(float(1), courses, ref('roofWeight', 'float')));
}

// The entire toon-wrapped graph is created once. Sharing only its farmhouse
// base would still leave five unique wrapper-node IDs in customProgramCacheKey.
const SHARED_SURFACE_COLOR_NODE = makeToonMaterial(buildSharedSurfaceBase()).colorNode;

export function makeFarmhouseSurfaceMaterial(
  kind: FarmhouseSurfaceKind,
  wallLevel = 0,
): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = SHARED_SURFACE_COLOR_NODE;
  material.userData.farmhouseSurface = farmhouseSurfaceParameters(kind, wallLevel);
  return material;
}
