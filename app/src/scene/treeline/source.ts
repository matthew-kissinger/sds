// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/**
 * Which tree the treeline draws.
 *
 *  - `procedural`: the sculpted oak baked from tools/bake-sculpted-trees.mjs
 *    into assets/treeline/sculpted-oak-family.json, with nothing to download.
 *  - `kiln`: the oak authored in Kiln, baked from
 *    assets/treeline/kiln/oak.kiln.js and loaded as assets/treeline/kiln/oak.glb
 *    (treeline/kilnTree.ts), shaded by treeline/kilnTreeMaterials.ts and
 *    handed to the treeline by treeline/kilnOak.ts.
 *
 * Either way the same 139 stands stand where the placement manifest puts them,
 * with the same sky gaps, the same yaw and the same box, and the field draws
 * three calls for the whole treeline: crowns, wood and pooled shadows.
 *
 * THIS IS A BUILD DECISION, NOT A SETTING, for the same reasons as
 * `FARMHOUSE_SOURCE` (farmhouse/source.ts). Production reads exactly two query
 * parameters and neither is this (tripwire 6), so the choice is one constant,
 * changed in its own commit and gated on the owner's look review and a hub
 * timing receipt: build once per value, run `tools/hub-presentation-probe.mjs`
 * against both copies of the build, and keep `kiln` only if load time and
 * frame time do not regress. Until a receipt says so, the shipped value is
 * `procedural`.
 *
 * With `procedural` the Kiln oak is unreachable and the bundle contains none of
 * it: not its loader, not its two materials and not the asset.
 */
export type TreeSource = 'procedural' | 'kiln';

export const TREE_SOURCE: TreeSource = 'procedural';
