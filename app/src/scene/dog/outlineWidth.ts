// SPDX-License-Identifier: AGPL-3.0-or-later
/** Screen-space outline width from the active projection, including portrait/customize lenses. */
export function dogOutlineWidth(projectionY: number, distance: number, cssHeight: number, perspective = true): number {
  const width = 2.8 * (perspective ? distance : 1) / (Math.max(0.001, Math.abs(projectionY)) * Math.max(1, cssHeight));
  return Math.min(0.040, Math.max(0.010, width));
}
