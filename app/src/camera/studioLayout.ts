// SPDX-License-Identifier: AGPL-3.0-or-later
/** Geometry shared by the Studio controls and its camera composition. */
export function studioLayout(width: number, height: number) {
  const bottom = width < 760 && height > width;
  const panel = bottom ? Math.min(360, height * 0.42) : Math.min(360, width * 0.38);
  const left = bottom ? 0 : panel;
  const bottomInset = bottom ? panel : 0;
  const top = 64;
  const viewWidth = Math.max(1, width - left);
  const viewHeight = Math.max(1, height - bottomInset - top);
  return { bottom, panel, left, bottomInset, top, viewWidth, viewHeight,
    distanceScale: Math.max(1, 1.25 / (viewWidth / viewHeight)) * height / viewHeight,
    offsetX: -left / 2,
    offsetY: (bottomInset - top) / 2,
  };
}
