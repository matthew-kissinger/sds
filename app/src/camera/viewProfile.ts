// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

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
 * Portrait needs a wider vertical lens because a fixed 45 degree vertical FOV
 * collapses to roughly 22 degrees horizontally on a tall phone. The framing
 * also borrows the older SDS rig's higher seat and shorter lead so a fast turn
 * keeps the dog in view while the camera yaw catches up.
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
      distance: mix(20, 24, portraitBlend),
      height: mix(7.5, 10.5, portraitBlend),
      lookAhead: mix(7, 4.5, portraitBlend),
    },
  };
}
