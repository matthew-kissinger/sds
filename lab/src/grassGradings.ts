// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Gradings to hold against each other at one camera.
 *
 * These live in `lab/` on purpose. `DEFAULT_GRASS_STYLE` is the one grading a
 * shipped page can produce, so a second preset in `app/src` would be a field
 * nothing shipped reads (AGENTS.md tripwire 10). The lab is where candidates
 * are authored; the one that wins becomes the default in `grassMaterial.ts`,
 * which is what happened to the candidate that produced the current `Shipped`.
 *
 * Everything here moves grading only. The painted breakup is deliberately
 * absent: since `tsl/paintedField.ts` the grass and the ground read one field,
 * and regrading its frequencies would pull the clumps off the patches they
 * stand on. The library's own smaller scales are not adopted for that reason.
 */

import { DEFAULT_GRASS_STYLE, type GrassMaterialStyle } from '@app/scene/grass/grassMaterial';

export interface Grading {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly style: GrassMaterialStyle;
}

/**
 * The grading this material shipped with before the regrade, kept so the
 * change stays reviewable at one camera rather than only in a diff. It goes
 * when someone stops needing to see what moved.
 */
const PREVIOUS: GrassMaterialStyle = {
  ...DEFAULT_GRASS_STYLE,
  rootShade: [0.72, 0.8, 0.9],
  rootAo: 0.82,
  tipGold: 0.16,
  tintMin: 0.95,
  tintMax: 1.05,
  clumpHue: 0.28,
};

/**
 * The extracted library's own numbers, carried across exactly so the A/B is
 * against what it really does rather than against an impression of it. Its
 * wind is already identical to ours, so only colour moves.
 *
 * This is the far end of the direction the shipped grading took part of the
 * way, and the lab is why it went no further: at 36 m its root occlusion
 * draws a dark pocket at every clump base, and its tint range reads as
 * speckle; at 11 m its spine darkening gives every blade its own shading, so
 * the field reads as countable blades rather than as mass.
 */
const LIBRARY: GrassMaterialStyle = {
  ...DEFAULT_GRASS_STYLE,
  rootShade: [0.55, 0.66, 0.8],
  rootAo: 0.62,
  spineEdge: 0.9,
  tipGold: 0.28,
  tintMin: 0.86,
  tintMax: 1.16,
  clumpHue: 0.45,
};

export const GRADINGS = [
  {
    id: 'shipped',
    label: 'Shipped',
    note: 'What the game draws. Deeper cool root, more gold in the tips, more hue per clump, edge contrast held.',
    style: DEFAULT_GRASS_STYLE,
  },
  {
    id: 'previous',
    label: 'Previous',
    note: 'The grading before the regrade. Lighter and flatter: at the Classic camera the flock reads as a pale cluster against pale green.',
    style: PREVIOUS,
  },
  {
    id: 'library',
    label: 'Library grade',
    note: 'threejs-field-grass numbers on the shipped material. Darker root, harder root occlusion, wide tint, strong spine. Past the bar on both counts, and kept here as the end stop.',
    style: LIBRARY,
  },
] as const satisfies readonly Grading[];

export type GradingId = (typeof GRADINGS)[number]['id'];

export function grading(id: GradingId): Grading {
  const found = GRADINGS.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`unknown grading ${id}`);
  return found;
}
