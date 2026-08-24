// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The lichen mask: where a crust grows on a stone, and how ragged its border is.
 *
 * IT IS A CRUST, NOT A DECAL, AND THAT DISTINCTION IS THE WHOLE MODULE. The pass
 * before this one thresholded two octaves of noise through a narrow smoothstep
 * and got exactly what that arithmetic gives: a few closed shapes with clean
 * vector edges that stopped dead where the crown met the flank. On a boulder at
 * fourteen metres it read as a green sticker.
 *
 * Four things separate a crust from a sticker, and each is one term below:
 *
 *   DITHERED BORDER   a third octave at eleven cycles per metre rides the field
 *                     just under the threshold, so the boundary breaks up at the
 *                     scale of a few pixels rather than following a smooth curve.
 *   OUTLIERS          a separate high-frequency threshold, gated to the ring of
 *                     surface just OUTSIDE each patch, scatters small islands
 *                     around the main colony. Lichen spreads by spores; it does
 *                     not have a rim.
 *   TWO VALUES INSIDE the field well above the threshold returns a second mask,
 *                     which the caller paints a darker tone into. A patch with
 *                     one flat tone is a shape; a patch with two is a growth.
 *   IT SPILLS         the upward gate opens at a normal Y of 0.02 rather than
 *                     0.42, so a colony that starts on the crown runs a little
 *                     way over the lip and down the flank. The noise decides
 *                     where it stops, not the geometry.
 *
 * All of it is a pure function of world position, so two stones a metre apart
 * grow different colonies out of one material and nothing here is per instance.
 */

import {
  clamp,
  float,
  max as tslMax,
  normalWorld,
  positionWorld,
  smoothstep,
  vec3,
  type TSLNode,
} from '@app/tsl/nodes';
import { paintedField } from './bandedMaterial';

export interface CrustShape {
  /** World normal Y where growth may start, and where the gate is fully open.
   *  Start low: a crust that stops at the crown lip reads as paint. */
  readonly from: number;
  readonly to: number;
  /** Cycles per metre of the colonies. Below 1 means one colony per stone. */
  readonly scale: number;
  /** Where the summed field crosses into a colony, and the narrow band it
   *  crosses over. Raise `edge` for less coverage; keep `blur` small or the
   *  islands go back to being a wash. */
  readonly edge: number;
  readonly blur: number;
  /** Share of the surface a colony may take where it takes at all, 0..1. */
  readonly amount: number;
}

/** Offsets so the crust's octaves do not sit on the grain's, which would read as
 *  one feature at two strengths rather than two materials. */
const COARSE_OFFSET = vec3(13.1, 4.7, 9.3);
const DETAIL_OFFSET = vec3(31.7, 18.3, 5.9);
const DITHER_OFFSET = vec3(7.9, 26.4, 41.2);
const SPORE_OFFSET = vec3(52.3, 11.8, 33.6);

/** Frequency multiples on the colony scale. None of them are integers, so the
 *  octaves never rhyme and a border never repeats along its own length. */
const DETAIL_SCALE = 3.7;
const DETAIL_WEIGHT = 0.55;
const DITHER_SCALE = 11.3;
const DITHER_WEIGHT = 0.24;
/** The outliers: their own frequency, how far above the colony threshold one has
 *  to sit to appear, and the band of near-miss field they are allowed in. */
const SPORE_SCALE = 17.9;
const SPORE_EDGE = 0.34;
const SPORE_NEAR = 0.4;
const SPORE_STRENGTH = 0.75;
/** How far above the threshold the second, darker value inside a patch begins. */
const CORE_RISE = 0.15;
const CORE_BLUR = 0.09;

export interface Crust {
  /** The colony and its outliers, 0..1. */
  readonly patch: TSLNode;
  /** The deeper value inside a colony, 0..1, already inside `patch`. */
  readonly core: TSLNode;
}

export function crust(shape: CrustShape): Crust {
  const upward = smoothstep(float(shape.from), float(shape.to), normalWorld.y);
  const at = positionWorld.mul(float(shape.scale));
  const coarse = paintedField(at.add(COARSE_OFFSET), 0.7);
  const detail = paintedField(at.mul(float(DETAIL_SCALE)).add(DETAIL_OFFSET), 2.3);
  const dither = paintedField(at.mul(float(DITHER_SCALE)).add(DITHER_OFFSET), 5.1);
  const field = coarse.add(detail.mul(float(DETAIL_WEIGHT))).add(dither.mul(float(DITHER_WEIGHT)));

  const island = smoothstep(float(shape.edge), float(shape.edge + shape.blur), field);

  // Outliers: a fine threshold, allowed only on the ring of surface that nearly
  // made it into the colony. Away from a colony there is nothing for a spore to
  // have come from, and inside one it is already lichen.
  const spore = paintedField(at.mul(float(SPORE_SCALE)).add(SPORE_OFFSET), 8.7);
  const near = smoothstep(float(shape.edge - SPORE_NEAR), float(shape.edge), field);
  const outliers = smoothstep(float(SPORE_EDGE), float(SPORE_EDGE + 0.04), spore)
    .mul(near)
    .mul(float(SPORE_STRENGTH));

  const patch = clamp(
    upward.mul(tslMax(island, outliers)).mul(float(shape.amount)),
    float(0),
    float(1),
  );
  const core = patch.mul(
    smoothstep(float(shape.edge + CORE_RISE), float(shape.edge + CORE_RISE + CORE_BLUR), field),
  );
  return { patch, core };
}
