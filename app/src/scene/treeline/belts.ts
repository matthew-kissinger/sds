// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The three belts of woods, as a table, plus the ground they stand on.
 *
 * THREE BELTS, BECAUSE ONE ROW OF TREES IS NOT A WOODS.
 *
 *  - NEAR, 114 m to 150 m Chebyshev (the band the grass bake thinned for it),
 *    pushed out due north to clear the pen and the farmhouse. This is the
 *    treeline read AS trees: individual crowns, boles on the front rank, and
 *    the mass that frames the top of the Follow frame.
 *  - MIDDLE, 156 m to 202 m, a second grounded rank receding into the haze.
 *  - FAR, 208 m to 246 m, the smallest and quietest grounded silhouettes.
 *
 * THE HEIGHTS FALL WITH DEPTH, WHICH IS THE OPPOSITE OF WHAT THE TABLE SAID.
 * The pass before this ran the far belt at 11 to 17 m on a 6.5 m rise while the
 * near belt ran 9 to 15 m on flat ground, so once the stand wave and the
 * emergent bonus were applied the deepest trees topped out 10 m ABOVE the
 * nearest ones. Where the near belt had a gap they stood clear of it, and
 * 320 m of scene fog turned them into cream slivers against blue sky - the
 * ghost instances the critique found. The near belt owns the skyline now: it is
 * the tallest, and everything behind it tops out under its shoulder, so the
 * deep belts live in the horizon haze band where their colour belongs.
 *
 * EVERY BELT SAMPLES THE REAL HEIGHTFIELD. Earlier versions lifted the deep
 * ranks onto an invisible ridge to manufacture a second ground line. In motion
 * that looked exactly like trunks and leaf balls hovering above the pasture.
 * Depth now comes from placement, size and aerial perspective, never fake Y.
 *
 * HEIGHTS ARE TUNED TO THE FOLLOW FRAME. The Follow rig sits 7.5 m up and looks
 * down 16 degrees with a 45 degree vertical fov, so the top of frame is 6.1
 * degrees above horizontal - 19.7 m of tree at the near belt's inner edge,
 * 23.5 m at its outer one. The `heights` column is the top of a STAND's draw
 * before the bearing wave, the rank gain, the emergent bonus and the archetype
 * scale are applied to it, and those five multiply: the worst coincidence of all
 * of them on the near belt lands at 23.4 m at 150 m out, which is the frame edge
 * and no further. The column came down from [10, 15.5] this pass for exactly
 * that reason, because the spread inside a stand went from 1.6 to 2.6 and the
 * top of the range is what a widened spread pushes up.
 *
 * The two deep belts came down further and are now well under the near belt's
 * shoulder, which is what keeps them in the horizon haze band where their colour
 * belongs rather than standing clear of it as cream slivers against blue sky.
 */

import grassManifest from '../../../../assets/grass/manifest.json';
import { FAR_GAP_FLOOR } from './ringShape';

/** The band the grass bake thinned, read from the committed manifest so the
 *  two assets cannot drift apart (spec/04: bake scripts own the layout). */
export const NEAR_INNER = grassManifest.footprint.treelineInner;
/** Nothing in the near ring goes past the grass. */
export const NEAR_LIMIT = grassManifest.footprint.surroundOuter - 4;

export interface BeltSpec {
  /** Stable placement band id written into the bake for composition checks. */
  readonly id: 0 | 1 | 2;
  /** Stand anchors walked around the perimeter. Roughly half survive the
   *  density test and each survivor carries two or three trees. */
  readonly stands: number;
  readonly inner: number;
  readonly outer: number;
  readonly heights: readonly [number, number];
  /** Stream base for the hashes. The belts must not share one, or they would
   *  mirror each other tree for tree. */
  readonly stream: number;
  /** The foreground belt receives the farmyard push-out and grass limit. Every
   *  belt still emits fully supported trees. */
  readonly foreground: boolean;
  /** Scales the bearing weight. */
  readonly density: number;
  /** How much of an authored sky gap this belt fills in anyway. */
  readonly gapFloor: number;
}

export const BELTS: readonly BeltSpec[] = [
  {
    id: 0,
    stands: 48,
    inner: NEAR_INNER,
    outer: 150,
    heights: [9.5, 14],
    stream: 11,
    foreground: true,
    density: 1.08,
    gapFloor: 0,
  },
  {
    id: 1,
    stands: 46,
    inner: 156,
    outer: 202,
    heights: [8.5, 11.5],
    stream: 53,
    foreground: false,
    density: 0.87,
    gapFloor: 0,
  },
  {
    id: 2,
    stands: 44,
    inner: 208,
    outer: 246,
    heights: [7.5, 10],
    stream: 97,
    foreground: false,
    density: 0.92,
    gapFloor: FAR_GAP_FLOOR,
  },
];
