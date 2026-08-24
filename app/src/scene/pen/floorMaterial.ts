// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The pen floor: trodden earth, authored as TRAFFIC rather than as texture.
 *
 * The floor this replaces was a field of soft blotches at three scales, and a
 * field of blotches with no direction in it is camouflage: it reads as noise
 * laid on a rectangle, it steals the eye from the gate, and it tiles. Everything
 * here has a direction and a source, and the source is the gate mouth at
 * (gate.x, bounds.maxZ), because every hoof that ever crossed this floor came in
 * through it:
 *
 *   - a worn FAN opening out of the mouth and up the pen, widening as it goes
 *   - wear STREAKS running up the pen, fast across and slow along, so the marks
 *     lie the way animals walked
 *   - a COMPACTED CORE near the mouth, the darkest and flattest part
 *   - a DRY RIM at the back and sides, duller and coarser, where nothing walks
 *   - a mark scale that DRIFTS across the pen, so no two corners tile
 *   - an ERODED edge with grass fingers reaching in over it, so the floor never
 *     shows a straight tan-against-green line
 *
 * And it sits BELOW the pasture in both value and saturation. The pen is the
 * destination, not the landmark: the gate is the landmark, and a floor that is
 * the brightest mass in the frame takes that job away from it.
 *
 * Tuning lives in floorTuning.ts.
 */

import { PALETTE } from '@app/tsl/palette';
import { makeToonMaterial } from '@app/tsl/toon';
import {
  abs,
  clamp,
  color,
  float,
  min,
  mix,
  positionWorld,
  sin,
  smoothstep,
  vec2,
  type TSLNode,
} from '@app/tsl/nodes';
import { FLAT_RAMP_TINT, preRamp } from '../fence/timberBands';
import {
  EARTH,
  EARTH_CORE,
  EARTH_DRY,
  EROSION,
  FAN_ACROSS_WANDER,
  FAN_ALONG_WANDER,
  FAN_EDGE,
  FAN_FAR,
  FAN_HALF,
  FAN_NEAR,
  FAN_SPREAD,
  FEATHER,
  FLECK_STRENGTH,
  PLATEAU_CORE,
  PLATEAU_DRY,
  PLATEAU_MID,
  RUT,
  RUT_EDGE,
  RUT_FADE,
  RUT_GAUGE,
  RUT_HALF,
  RUT_STRENGTH,
  RUT_WANDER,
  RUT_WANDER_SCALE,
  STRAW,
  TIER_CORE,
  TIER_EDGE,
  TIER_MID,
  TRACK_ACROSS,
  TRACK_ALONG,
  TUFT_REACH,
  UNWORN,
} from './floorTuning';


export interface PenFloorSpec {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** The corridor tongue reaching back from the pen to the perimeter gate line,
   *  and the mouth the traffic pattern radiates from. */
  readonly mouthX: number;
  readonly mouthZ: number;
  readonly mouthWidth: number;
}

/**
 * How far this fragment is from the nearest edge of the floor. The floor is an
 * L: the pen rect, plus the corridor tongue reaching back to the gate line
 * inside the gate width.
 */
function edgeDistance(spec: PenFloorSpec): TSLNode {
  const half = spec.mouthWidth / 2;
  const offCentre = abs(positionWorld.x.sub(float(spec.mouthX)));
  const inCorridor = float(1).sub(smoothstep(float(half - 0.4), float(half + 0.4), offCentre));
  const belowPen = float(1).sub(
    smoothstep(float(spec.minZ - 0.4), float(spec.minZ + 0.4), positionWorld.z),
  );
  const south = positionWorld.z.sub(mix(float(spec.minZ), float(spec.mouthZ), inCorridor));
  const sides = min(positionWorld.x.sub(float(spec.minX)), float(spec.maxX).sub(positionWorld.x));
  const tongue = mix(float(99), float(half).sub(offCentre), belowPen);
  return min(min(sides, tongue), min(float(spec.maxZ).sub(positionWorld.z), south));
}

export function makePenFloorMaterial(spec: PenFloorSpec) {
  const grass = color(PALETTE.surround);

  // A compact, directional painted field. The previous version called the
  // MaterialX gradient-noise graph eighteen times. Chromium proved that graph
  // took 1.74 seconds to compile the first time the pen entered the camera.
  // Four interfering sine strokes retain the authored fan, scuffs, ruts and
  // broken edge without carrying a second procedural-noise library in this one
  // fragment shader. Boundary geometry still supplies the close silhouette.
  const alongStroke = sin(positionWorld.z.mul(float(0.19)).add(positionWorld.x.mul(float(0.07))));
  const acrossStroke = sin(
    positionWorld.x.mul(float(0.47))
      .sub(positionWorld.z.mul(float(0.11)))
      .add(alongStroke.mul(float(0.8))),
  );
  const broadStroke = sin(
    positionWorld.x.mul(float(0.13))
      .add(positionWorld.z.mul(float(0.08)))
      .add(acrossStroke.mul(float(0.55))),
  );
  const fineStroke = sin(
    positionWorld.x.mul(float(0.91))
      .add(positionWorld.z.mul(float(0.31)))
      .add(broadStroke.mul(float(0.42))),
  );
  const broad01 = broadStroke.mul(float(0.5)).add(float(0.5));
  const fine01 = fineStroke.mul(float(0.5)).add(float(0.5));

  // Everything that ever walked here came out of the gate mouth. A slow
  // lateral stroke bends the traffic without making a radial fingerprint.
  const warp = alongStroke.mul(float(FAN_ACROSS_WANDER * 0.24));
  const dx = positionWorld.x.sub(float(spec.mouthX)).add(warp);
  const dz = positionWorld.z.sub(float(spec.mouthZ));
  const track = vec2(dx.mul(float(TRACK_ACROSS)), dz.mul(float(TRACK_ALONG)));
  const wear = sin(track.x.add(track.y).mul(float(3.1)).add(fineStroke.mul(float(0.7))))
    .mul(float(0.5))
    .add(float(0.5));
  // How far the traffic reached: a fan, two independent falloffs multiplied.
  // See the note on FAN_NEAR for why this is not a radius.
  const along = abs(dz).add(alongStroke.mul(float(FAN_ALONG_WANDER * 0.34)));
  const upPen = float(1).sub(smoothstep(float(FAN_NEAR), float(FAN_FAR), along));
  // The mouth is 8 m and the pen is 60: the worn ground opens out behind the
  // gate rather than running up the middle as a corridor.
  const half = float(FAN_HALF).add(abs(dz).mul(float(FAN_SPREAD)));
  const across = abs(dx).add(acrossStroke.mul(float(FAN_ACROSS_WANDER * 0.42)));
  const inFan = float(1).sub(smoothstep(half, half.add(float(FAN_EDGE)), across));
  const traffic = upPen.mul(inFan);
  const mottle = broad01.mul(float(0.64)).add(fine01.mul(float(0.36)));

  // One 0..1 field: 1 in the compacted core, 0 on the dry rim. Traffic says
  // WHERE the worn ground is; the tracks and the mottle say what it looks like,
  // and their share is the difference between a worn area with marks in it and
  // a flat grey shape. The weights are set so the field crosses both plateau
  // steps INSIDE the worn fan rather than saturating at the top of it: at the
  // old balance the core term alone reached 0.93 over half the pen, every mark
  // quantised to the same step, and the phone frame showed one uniform slab.
  const level = clamp(
    traffic
      .mul(float(0.3))
      .add(traffic.mul(smoothstep(float(0.28), float(0.72), wear)).mul(float(0.3)))
      .add(mottle.mul(float(0.34)))
      .add(float(0.1)),
    float(0),
    float(1),
  );
  // TWO HARD LINES THROUGH THAT FIELD, not a gradient over it. The marks on a
  // trodden floor have edges: a hoof either broke the crust here or it did not.
  // Everything downstream reads the quantised tier rather than the raw level, so
  // colour, gain and the surviving grass all change at the same painted line.
  const toMid = smoothstep(
    float(TIER_MID - TIER_EDGE),
    float(TIER_MID + TIER_EDGE),
    level,
  );
  const toCore = smoothstep(
    float(TIER_CORE - TIER_EDGE),
    float(TIER_CORE + TIER_EDGE),
    level,
  );
  const tier = toMid.mul(float(0.5)).add(toCore.mul(float(0.5)));
  const plateau = mix(
    mix(float(PLATEAU_DRY), float(PLATEAU_MID), toMid),
    float(PLATEAU_CORE),
    toCore,
  );

  // Three authored tones, cut at two hard lines: dry rim, worn mid, and the
  // trodden dust of the core. Every one of them is solved backwards through the
  // ramp and the post chain (fence/timberBands.ts) so what is written in
  // floorTuning.ts is what a pixel sampler finds on the capture. This floor spent
  // three passes authoring bases and measuring something else, and the last of
  // those measurements was a near-black olive.
  const earth = mix(
    mix(color(preRamp(EARTH, FLAT_RAMP_TINT)), color(preRamp(EARTH_DRY, FLAT_RAMP_TINT)), toMid),
    color(preRamp(EARTH_CORE, FLAT_RAMP_TINT)),
    toCore,
  ).mul(plateau);
  // Pasture surviving where the traffic never reached, and straw lying on the
  // dry rim. The same green the surround is, so the two never disagree.
  const withGrass = mix(earth, grass, float(1).sub(tier).mul(float(UNWORN)));
  const fleck = smoothstep(
    float(0.54),
    float(0.6),
    fine01,
  ).mul(float(1).sub(tier));
  const flecked = mix(
    withGrass,
    color(preRamp(STRAW, FLAT_RAMP_TINT)),
    fleck.mul(float(FLECK_STRENGTH)),
  );

  // THE CART RUTS. Two lines, a metre and a half apart, running out of the mouth
  // and up the pen, fading where the traffic stops. Everything else on this floor
  // is a field with no author; this is a mark somebody made.
  const rutWander = sin(dz.mul(float(RUT_WANDER_SCALE * 6.283185307179586)))
    .mul(float(RUT_WANDER));
  const offRut = abs(abs(dx.add(rutWander)).sub(float(RUT_GAUGE)));
  const rut = float(1)
    .sub(smoothstep(float(RUT_HALF), float(RUT_HALF + RUT_EDGE), offRut))
    .mul(float(1).sub(smoothstep(float(RUT_FADE * 0.5), float(RUT_FADE), abs(dz))));
  const floor = mix(flecked, color(preRamp(RUT, FLAT_RAMP_TINT)), rut.mul(float(RUT_STRENGTH)));

  // And at the rim it stops being a floor and starts being field again. The edge
  // is eroded before it is feathered, and grass fingers reach in over what is
  // left, so the boundary is a broken line at every camera including the phone's.
  const eroded = edgeDistance(spec).sub(
    broadStroke.mul(float(EROSION * 0.56)).add(fineStroke.mul(float(EROSION * 0.16))),
  );
  const rim = smoothstep(float(0), float(FEATHER), eroded);
  const reach = float(1).sub(smoothstep(float(0), float(TUFT_REACH), eroded));
  const tuft = smoothstep(float(0.68), float(0.9), fine01)
    .mul(float(0.78))
    .mul(reach);
  return makeToonMaterial(mix(mix(grass, floor, rim), grass, clamp(tuft, float(0), float(0.78))));
}
