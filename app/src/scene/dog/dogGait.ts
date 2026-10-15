// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Authored gait timing and contacts shared by skeletal pose and terrain planting. */
import { DOG_MAX_SPEED, DOG_SPRINT_SPEED } from '@sim/tuning';
export const DOG_GAIT_TAU = Math.PI * 2;
export const DOG_MAX_PAW_REACH = 0.4;
export function dogGaitRate(speed: number): number {
  return 1.4 + Math.min(Math.max(speed, 0), DOG_SPRINT_SPEED) * 0.112;
}
export function dogStanceShare(speed: number): number {
  // Faster travel needs shorter contact, not impossible metre-long legs.
  return Math.min(0.62, DOG_MAX_PAW_REACH * 2 * dogGaitRate(speed) / Math.max(speed, 0.01));
}
export function dogStride(speed: number): number {
  return Math.min(DOG_MAX_PAW_REACH, Math.max(speed, 0) * dogStanceShare(speed) / (2 * dogGaitRate(speed)));
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

export function sampleDogPaw(phase: number, speed: number, foot: number, out: DogPawPose): void {
  const sprint = Math.max(0, Math.min(1, (speed - DOG_MAX_SPEED) / (DOG_SPRINT_SPEED - DOG_MAX_SPEED)));
  // Diagonal trot becomes a separated fore/hind gallop as sprint opens.
  const offset = foot === 0 ? 0 : foot === 1 ? 0.5 - sprint * 0.4
    : foot === 2 ? 0.5 : sprint * 0.6;
  const cycle = ((phase / DOG_GAIT_TAU + offset) % 1 + 1) % 1;
  const stance = dogStanceShare(speed);
  const stride = dogStride(speed);
  out.planted = cycle < stance || speed < 0.08;
  out.recovery = out.planted ? 0 : (cycle - stance) / (1 - stance);
  out.stanceTravel = (1 - 2 * cycle / stance) * stride;
  if (cycle < stance) {
    out.travel = (1 - 2 * cycle / stance) * stride;
    out.lift = 0;
  } else {
    const recovery = (cycle - stance) / (1 - stance);
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
