// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Authored gait timing and contacts shared by skeletal pose and terrain planting. */
import { DOG_SPRINT_SPEED } from '@sim/tuning';
export const DOG_GAIT_TAU = Math.PI * 2;
export const DOG_MAX_PAW_REACH = 0.4;
export function dogGaitRate(speed: number): number {
  return 1.4 + Math.min(Math.max(speed, 0), DOG_SPRINT_SPEED) * 0.112;
}
/**
 * The share of a cycle a foot spends on the ground at this speed.
 *
 * Faster travel needs shorter contact, not impossible metre-long legs: 0.62 of
 * the cycle at a walk, 0.23 at two thirds of DOG_MAX_SPEED, 0.134 at a sprint.
 *
 * THIS IS A TIMING GATE AND IT BELONGS TO A CONTACT, NOT TO A FRAME. It decides
 * when a planted foot lifts, so re-reading it from the instantaneous speed under
 * a foot the world has locked down is what broke three separate things - see
 * `DogMotion.footStance`, which is where a contact's own share is kept.
 */
export function dogStanceShare(speed: number): number {
  return Math.min(0.62, DOG_MAX_PAW_REACH * 2 * dogGaitRate(speed) / Math.max(speed, 0.01));
}
/**
 * Half the distance a contact sweeps: the paw runs from +stride to -stride in
 * body space while the body covers 2 * stride of ground.
 *
 * Worth knowing what this curve actually is, because the shape of it is why the
 * state in `DogMotion` is split the way it is. Substituting the stance share
 * above, the two branches of its `min` come out as:
 *
 * | speed | stance | stride |
 * | --- | --- | --- |
 * | 0 | 0.62 | 0 |
 * | 1 | 0.62 | 0.205 |
 * | 2.112 | 0.62 | 0.400 |
 * | 4 | 0.370 | 0.400 |
 * | 12 | 0.183 | 0.400 |
 * | 25 | 0.134 | 0.400 |
 *
 * Above 2.112 m/s the stance clamp is off and the two terms cancel exactly:
 * `stride` IS `DOG_MAX_PAW_REACH`, flat, for the whole of the running range,
 * and the stance share carries all of the speed dependence. Below it the dog is
 * taking shorter steps at the gait rate's own floor and `stride` collapses with
 * the speed - which is the standstill, and nowhere else.
 */
export function dogStride(speed: number): number {
  return Math.min(DOG_MAX_PAW_REACH, Math.max(speed, 0) * dogStanceShare(speed) / (2 * dogGaitRate(speed)));
}
/**
 * Where each foot sits in the gait order, as a share of a cycle after foot 0.
 *
 * A diagonal trot - fore left with hind right - separates into fore and hind
 * pairs as `sprint` opens, which is a gallop. Changing a foot's place in the
 * order moves that foot's whole cycle, so it is only ever done to a foot that
 * is off the ground: see `DOG_RETIME_RATE`.
 */
export function dogFootOffset(foot: number, sprint: number): number {
  return foot === 0 ? 0 : foot === 1 ? 0.5 - sprint * 0.4
    : foot === 2 ? 0.5 : sprint * 0.6;
}
export interface DogPawPose {
  travel: number;
  lift: number;
  planted: boolean;
  recovery: number;
  /**
   * Where the STANCE ramp would put this paw at this instant, carried on past
   * the end of stance instead of handing over to the swing curve.
   *
   * The two curves meet exactly at the boundary, but a frame almost never lands
   * on it: the first airborne frame sits some fraction of a frame past, and over
   * that fraction a planted foot has gone on travelling backward under the body
   * while the swing curve has it already standing still at -stride. The gap is
   * speed times that fraction - 93 mm at DOG_MAX_SPEED - and `dogRig` measures a
   * turn's foot drift against this rather than against `travel` so that the gap
   * is not banked as drift and held through the whole swing.
   */
  stanceTravel: number;
}
/**
 * How much of the stance sweep the swing curve carries through each handover,
 * as a multiple of `stride` per unit of recovery: `FLICK` where the foot leaves
 * the ground, `MATCH` where it meets it again.
 *
 * WHAT IS WRONG WITHOUT THEM. A planted paw stands still in the world, which
 * means its body-space travel sweeps backward at exactly the body's ground
 * speed. A smoothstep swing leaves and arrives with zero body-space velocity
 * instead, so the paw's WORLD velocity stepped by the whole of the dog's speed
 * in the frame it lifted and again in the frame it landed - 0 -> 8.00 m/s and
 * 8.00 -> 0 at two thirds of DOG_MAX_SPEED, 0 -> 25.00 at a sprint. Through the
 * rig that is a paw covering 98 mm on the frame it touches down and 0 on the
 * next: it is placed by being slammed forward into the ground and yanked to a
 * halt, and that one frame is what reads as a leg snapping backward.
 *
 * WHY THEY ARE NOT EQUAL, AND WHY BOTH ARE CAPPED. An exact match wants slope
 * `2(1 - stance) / stance`, and stance falls with speed: 1.23 at a walk, 6.70 at
 * two thirds of DOG_MAX_SPEED, 12.9 at a sprint. A cubic carrying a slope that
 * steep bulges past the stance extremes by as much as it is steep, and the two
 * ends bulge in opposite directions. The rearward bulge is the expensive one -
 * it lands just after lift-off, where the hind limb is already at 0.95 of its
 * bone, and both chains bind straight - while the forward bulge lands where the
 * limb is folding and has slack to spare. So the measured cost is lopsided, and
 * so are the constants:
 *
 * | flick | match | touchdown step, 2 / 8 m/s | lift-off step | reach, steady / accelerating |
 * | --- | --- | --- | --- | --- |
 * | 0 | 0 (shipped) | 59 / 141 mm | 56 / 134 mm | 0.954 / 0.954 |
 * | 0 | 5.5 | 17 / 40 mm | 44 / 136 mm | 0.955 / 0.968 |
 * | 0.7 | 5.5 | 19 / 41 mm | 29 / 124 mm | 0.957 / 0.976 |
 * | 1.4 | 5.5 | 19 / 41 mm | 18 / 112 mm | 0.961 / 0.984 |
 *
 * 0.7 and 5.5 buy an exactly placed foot up to 6.3 m/s - a trot, where the eye
 * can follow one paw - and 82% of the match at two thirds of DOG_MAX_SPEED,
 * falling to 43% at a sprint where a paw covers 25 cm a frame and the residue is
 * under a frame of travel. Touchdown is where the eye anchors, so touchdown gets
 * the budget; the flick takes what is left before the limb runs out of bone.
 *
 * A real dog overextends the hock at lift-off and flicks the foot up through it,
 * which is where it gets the rearward excursion this two-bone chain has none of.
 */
export const DOG_SWING_FLICK = 0.7;
export const DOG_SWING_MATCH = 5.5;

/**
 * Where a paw is at this point in its cycle, given the step it has committed to.
 *
 * Pure in its arguments on purpose. `cycle` is this foot's own place in its own
 * cycle with 0 at touchdown, and `stance` and `stride` are the contact's, held
 * by `DogMotion` rather than recomputed per frame from whatever the dog happens
 * to be doing now - a foot standing on the ground cannot be told halfway
 * through that its contact was supposed to be a different length.
 */
export function dogPawPose(cycle: number, stance: number, stride: number, out: DogPawPose): void {
  out.planted = cycle < stance;
  out.recovery = out.planted ? 0 : (cycle - stance) / (1 - stance);
  out.stanceTravel = (1 - 2 * cycle / stance) * stride;
  if (out.planted) {
    out.travel = out.stanceTravel;
    out.lift = 0;
  } else {
    const recovery = out.recovery;
    // A cubic from -stride to +stride whose end slopes are the stance sweep, as
    // far as the two constants above allow. Neither slope may exceed the sweep
    // itself, or the curve would leave the ground faster than the ground moves.
    const sweep = 2 * (1 - stance) / stance;
    const match = Math.min(DOG_SWING_MATCH, sweep);
    const flick = Math.min(DOG_SWING_FLICK, sweep);
    out.travel = stride * (((6 + 2 * flick + match) - (4 + flick + match) * recovery) * recovery * recovery
      - flick * recovery - 1);
    // sin SQUARED, so the foot has no vertical speed either as it leaves the
    // ground or as it meets it. Plain `sin` is steepest at exactly those two
    // frames and threw the paw upward at 1.7 m/s in the one it lifted, which is
    // the same defect in the other axis. Same peak, same single hump, both ends
    // flat.
    const hump = Math.sin(recovery * Math.PI);
    out.lift = hump * hump * Math.min(0.18, stride * 0.5);
  }
}
