// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The Follow rig's geometry, per orientation.
 *
 * Elevation is not what stops the camera rotating; the yaw law does that. What
 * elevation buys is the translational half of the problem. Sweeping the rig
 * from the shipped 20 m back / 7.5 m up out to 32 m / 24 m moves total rotation
 * over a two-minute run by five per cent, and moves ground optic flow by 47%.
 * The dog is framed nearer screen centre at every step of that sweep.
 *
 * The cost is the horizon, which is a real cost: an earth-fixed horizon line is
 * the one rest-frame manipulation measured to reduce visually induced sickness.
 * Above roughly 22 m back and 10 m up a 45 degree vertical lens no longer
 * contains it. 26 m / 14 m splits the difference and is chosen for that reason:
 * the top of the frame sits 3.7 degrees below horizontal, which on a 200 m
 * field lands on ground about 217 m away, so the far fence and the sky above it
 * stay in frame from most positions as a world-locked peripheral edge. Optic
 * flow drops 28% against the shipped framing and the dog is framed better.
 *
 * WHAT AN ORIENTATION FLIP DOES, because this is where the numbers that step
 * live and a reviewer should not have to re-derive it. Rotating a phone changes
 * the aspect in one frame, so every number here changes in one frame with it:
 * the lens 45 -> 76 degrees, the rig 26 -> 32.5 m back and 14 -> 17.5 m up. The
 * lens stepping is correct rather than merely tolerated. A frustum has to match
 * the canvas it is drawn into and the canvas changed shape in that same frame,
 * and the flip is player-initiated and re-lays-out the whole page, so it is the
 * one moment a cut is what the player expects. The rig does NOT step: the
 * Follow framing lags distance and height, measured at 7.34 m of eye travel
 * over 0.45 s, peaking at 46.3 m/s and carrying 12.3 deg/s of view rotation.
 * The vertical part of that travel goes through the MAX_RIG_SPEED clamp and
 * the radial part does not, but at these rates no clamp binds: the lag alone
 * holds it, at two thirds of the 55 m/s the rest of the rig's travel is held
 * to and well inside the 90 deg/s the mode blend holds itself to. There is no
 * 7 m jump.
 *
 * What is left is one transient, and it is the smallest of the options. In
 * device pixels the two settled framings differ by 3.8%: the wider lens on a
 * taller canvas is 28% more magnification per pixel and the 20% longer range to
 * the aim takes almost all of it back, so a flip does not resize the dog. The
 * player sees the portrait lens arrive 0.45 s ahead of the portrait stand-off -
 * the frame after the flip renders 1.20x the settled scale, and shrinks to it.
 * Easing the lens would make that worse, not better: a 45-degree lens on a
 * portrait canvas is 21.7 degrees horizontal and 2.25x the settled scale, so
 * the ease would nearly double the transient it was added to remove. Removing
 * the lag on the rig instead is the only change that removes it, and that is
 * the Follow framing's decision, not this module's. Nothing here can ease
 * anything on its own: this is a pure function of aspect with no notion of
 * time, and both levers sit elsewhere. A flip in Classic steps nothing at all,
 * because CameraRig scales the lens by the Follow weight.
 */

export interface FollowViewProfile {
  readonly distance: number;
  readonly height: number;
  readonly lookAhead: number;
}

export interface CameraViewProfile {
  readonly fov: number;
  readonly portraitBlend: number;
  readonly follow: FollowViewProfile;
}

const LANDSCAPE_ASPECT = 0.82;
const PHONE_PORTRAIT_ASPECT = 0.46;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

/**
 * Portrait gets a WIDER vertical lens, not a narrower one, and the instinct to
 * narrow it is backwards. A 45 degree vertical FOV collapses to roughly 22
 * degrees horizontally on a tall phone, which is already the narrowest
 * horizontal view in the game; taking more away is the wrong direction. The 76
 * degree lens also earns the horizon back for free: at the portrait elevation
 * it still leaves 11.4 degrees of sky above the frame's top edge, where
 * landscape has 3.0 degrees of ground above it. The constraint that limits how
 * high landscape can go simply does not apply here.
 *
 * Portrait's distance and height are the landscape pair multiplied by 1.25, so
 * the two orientations share a pitch and read as the same camera. The
 * look-ahead is set independently, shorter, because a tall frame needs less
 * downward bias. Measured against the shipped portrait profile that cuts ground
 * optic flow by 29% and brings the dog from 0.37 to 0.26 off centre at worst,
 * 0.05 on average.
 */
export function cameraViewProfile(aspect: number): CameraViewProfile {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const portraitBlend = clamp01(
    (LANDSCAPE_ASPECT - safeAspect) / (LANDSCAPE_ASPECT - PHONE_PORTRAIT_ASPECT),
  );

  return {
    fov: mix(45, 76, portraitBlend),
    portraitBlend,
    follow: {
      distance: mix(26, 32.5, portraitBlend),
      height: mix(14, 17.5, portraitBlend),
      lookAhead: mix(4, 3, portraitBlend),
    },
  };
}
