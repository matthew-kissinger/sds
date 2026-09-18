// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Grass densities selected by the measured boot capability tier
 * (`quality/autoTier.ts`). The renderer backend and a device-pixel-ratio-scaled
 * offscreen fill and device profile determine auto; settings can override all
 * three tiers. A passive frame-budget check may only demote Auto after warmup.
 *
 * The presets are FRACTIONS of what the bake committed, not counts, because the
 * tier is a prefix of the same buffer (tuftData.ts). Rebaking at a different
 * density moves both presets together and neither number here goes stale.
 *
 * A FRACTION ALONE IS NOT A PRESET. Cutting the tuft count cuts the ground the
 * tufts cover, and a meadow with holes in it does not read as thinner grass, it
 * reads as a lawn with weeds on it - which is exactly what the first phone
 * capture looked like. So the reduced presets also SPREAD what is left: each
 * surviving tuft is widened until the clumps touch their neighbours again. The
 * widening lives in the instance matrix and costs not one extra vertex.
 *
 * WHAT A SPREAD BUYS DEPENDS ON THE PITCH IT IS SEEN AT, which is why these
 * numbers were re-derived against the Follow rig (camera/viewProfile.ts) rather
 * than the Classic camera they were first chosen under. Rasterising the real
 * tuft mesh at a sweep of view angles, one tuft's projected area grows as
 * spread^2.0 from straight down, spread^1.5 at 45 degrees, spread^1.3 at the 28
 * degrees the portrait rig sees the dog's feet at, and spread^1.05 at a graze.
 * The square is the top-down case and nothing else, so `low` holds 62% of the
 * full preset's cover at the new pitch where it held 65% at Classic, and
 * `medium` 87% where it held 89%.
 *
 * Those few points come back many times over from the pitch itself. The ground
 * one tuft hides is its projected area over the sine of the view elevation,
 * which takes it from 0.37 square metres straight down to 0.44 at Classic's 45
 * degrees to 0.62 at the portrait rig's 28. Measured end to end against the
 * committed scatter: at the dog, `low` leaves 63% of the ground bare from the
 * portrait rig, against 72% from Classic and 60% for `high` from Classic. A
 * shallow view through a horizontally spread field is the case that field
 * closes hardest in, not a case it was never tested against, and the presets
 * are unchanged because of it.
 */

export type GrassPreset = 'high' | 'medium' | 'low';

export interface GrassDensity {
  /** Fraction of the baked interactive tier to draw. */
  readonly field: number;
  /**
   * Fraction of the baked surround tier to draw.
   *
   * The 190 m footprint still holds, and the reason is the rig's reach rather
   * than the number. Follow stands `distance` behind the dog, so it sits up to
   * 32.5 m outside whatever bound the dog is against: 132 m Chebyshev with the
   * dog on the fence line, around 162 m with the dog at the back of the pen.
   * It also always looks INWARD, and the near edge of the portrait frame lands
   * 9.3 m ahead of the eye, so the closest ground ever drawn is around 152 m,
   * inside the bake. The far edge is not this fraction's problem either: the
   * bake's own outer fade has the surround down to 0.0045 tufts per square
   * metre in the 180 to 190 m band, so the meadow's visible edge is nearer
   * 170 m, and the ground past it is covered by the fog and the treeline.
   *
   * What the reach does change is which tier is FOREGROUND. Outside the fence
   * the ground under the camera is the surround, which the bake fades from
   * 0.505 tufts per square metre at 106 m to 0.215 by 130 m, and the cut here
   * takes those to 0.218 and 0.092. Seen from 12 to 32 m that leaves 90% to
   * 97% of the ground bare against the interactive tier's 63% to 74%. The fade
   * is deliberate - the meadow is meant to peter out under the trees - but it
   * was authored for a tier nothing could come within 106 m of.
   */
  readonly surround: number;
  /**
   * Horizontal scale on every surviving tuft. Horizontal only, and the Follow
   * rig forces that harder than Classic did rather than releasing it. The
   * sightline to the dog's feet grazes the ground at 28 degrees from the
   * portrait rig against 50 from Classic, so a mean 0.46 m tuft already hides
   * 0.86 m of the ground in front of the dog where it used to hide 0.39 m:
   * height is the axis that grows as the pitch shallows, and it is also the
   * axis the wind swings, since the sway scales with the blade's stature
   * (grassMaterial.ts). Buying cover with height would put the dog's legs and
   * more moving pixels behind the same grass.
   *
   * Widening is not free of the second cost either. The sway is displaced in
   * tuft-local space, so the instance matrix multiplies it by this number too
   * and a wider tuft travels proportionally further. That is the reason these
   * values are not raised to chase the cover the exponent drop costs.
   */
  readonly spread: number;
}

export const GRASS_PRESETS: Record<GrassPreset, GrassDensity> = {
  /** Desktop: every tuft the bake placed, at the size it was authored. */
  high: { field: 1, surround: 1, spread: 1 },
  /** Balanced phone/desktop tier: 70% of the vertex work, 87% of the cover. */
  medium: { field: 0.7, surround: 0.7, spread: 1.18 },
  /**
   * Touch: 42% of the tufts, spread wide enough to still close. That is 42% of
   * the desktop vertex load with the full flock intact - spec/08 is explicit
   * that grass is what gets cut and gameplay entities are what never do, so the
   * flock size is untouched here.
   */
  low: { field: 0.42, surround: 0.42, spread: 1.34 },
};
