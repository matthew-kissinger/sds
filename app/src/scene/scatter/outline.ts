// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The dressing's contour, matched to the rest of the field.
 *
 * spec/05 asks for a thin outline on hero objects in a darkened warm tone of the
 * surface, never pure black, and the fence, the dog and the flock all carry one.
 * So the stones and the log take the same colour the timber does
 * (scene/fence/timberTones.ts), rather than a warm-dark of their own: the point
 * of a contour is that every object in the frame shares it.
 *
 * HOW IT IS DRAWN. An inverted hull, baked into the SAME buffer as the solid
 * with its winding reversed, so front-face culling keeps exactly the triangles a
 * `side: BackSide` pass would have kept on an unreversed shell. That is what
 * lets the outline cost no second draw call and no second material. The vertex
 * carries a flag on uv.x; `outlineMask` reads it.
 *
 * TWO WIDTHS, AND THE STONES TAKE THE THIN ONE. The critique that set these
 * said it plainly: rocks are set dressing, and the dog and the sheep have to
 * carry the heaviest line in the frame. A stone also came down to about a metre
 * across in the same pass, so holding the old width would have TRIPLED its
 * weight relative to the silhouette it draws.
 */

import { float, step, uv, type TSLNode } from '@app/tsl/nodes';

/** The timber's own contour colour. Warm dark, never black. */
export const OUTLINE_COLOR = '#4a3729';

/**
 * How far the shell stands off the log, metres.
 *
 * Measured against the neighbours rather than chosen: the fence posts carry
 * 0.05 m on a 0.16 m section and the rails 0.019 m on a 0.1 m bar. The log is
 * 0.9 m across the butt and sits at 18 m in the Follow frame, so 0.026 m is
 * about two pixels there and one at Classic - present at both, heavy at neither.
 */
export const OUTLINE_WIDTH = 0.026;

/**
 * The stones' shell, a little over half the log's. A boulder is a third of the
 * log's section and is the piece the note asked to quieten, so it takes the
 * lighter line: 0.014 m is one pixel at Follow range and sub-pixel at Classic,
 * which draws the silhouette without competing with the animals standing on it.
 */
export const ROCK_OUTLINE_WIDTH = 0.014;

/** 1 on a contour vertex, 0 on the surface. The flag rides uv.x, which the
 *  stones use for nothing else; the log flags its shell with a negative value
 *  on the same channel (scatter/logGeometry.ts) and reads it with
 *  `negativeMask`. */
export function outlineMask(): TSLNode {
  return step(float(0.5), uv().x);
}

/** The log's variant: the shell is flagged by taking uv.x negative, and the mask
 *  is the test for it. Kept here so both readers of the convention sit
 *  together. */
export function negativeMask(): TSLNode {
  return step(uv().x, float(-0.5));
}
