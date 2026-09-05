// SPDX-License-Identifier: AGPL-3.0-or-later
export interface GateIndicator {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly onScreen: boolean;
  readonly distance: number;
  readonly obscured: boolean;
}

/** Clip coordinates retain direction behind the camera without mirroring it.
 * The lower inset leaves the thumb controls free on narrow viewports. */
export function projectGate(
  clip: { x: number; y: number; w: number }, width: number, height: number,
  distance: number, obscured = false,
): GateIndicator {
  const narrow = width < 600;
  // A cue is at most 148px wide and 34px high. Insets reserve its full
  // rectangle, top HUD/safe areas, and landscape action buttons.
  const left = 80, right = Math.max(left, width - (height < 500 ? 200 : 80));
  const top = Math.min(narrow ? 190 : height < 500 ? 145 : 110, height * 0.45);
  const bottom = Math.max(top, height - (narrow ? 240 : height < 500 ? 108 : 70));
  const cx = (left + right) / 2, cy = (top + bottom) / 2;
  const w = Math.max(0.001, Math.abs(clip.w));
  const px = width / 2 + clip.x / w * width / 2;
  const py = height / 2 - clip.y / w * height / 2;
  // Visibility belongs to the world opening, not the HUD's inset rectangle.
  // A visible gate near the screen edge must not acquire a floating label.
  const onScreen = clip.w > 0 && px >= 24 && px <= width - 24 && py >= 24 && py <= height - 24;
  let dx = px - cx, dy = py - cy;
  // A destination directly behind the lens needs a stable turn cue.
  if (clip.w <= 0 && Math.abs(dx) < 1) { dx = 1; dy = 0; }
  if (Math.abs(dx) + Math.abs(dy) < 0.001) dy = -1;
  const scale = Math.min((right - cx) / Math.max(0.001, Math.abs(dx)),
    (bottom - cy) / Math.max(0.001, Math.abs(dy)));
  return {
    x: Math.round(onScreen && !obscured ? px : cx + dx * scale),
    y: Math.round(onScreen && !obscured ? py : cy + dy * scale),
    angle: Math.atan2(dy, dx), onScreen,
    distance: Math.max(0, Math.round(distance)), obscured,
  };
}
