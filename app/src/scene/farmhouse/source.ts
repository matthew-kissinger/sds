// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/**
 * Which farmhouse the game draws.
 *
 *  - `procedural`: the distance asset built in code (farmhouse/cluster.ts), with
 *    nothing to download.
 *  - `kiln`: the walk-in house baked from assets/house/farmhouse.kiln.js and
 *    loaded as assets/house/farmhouse.glb (farmhouse/kilnHouse.ts). The barn,
 *    the cast shadows, the outline and the smoke stay procedural.
 *
 * THIS IS A BUILD DECISION, NOT A SETTING. Production reads exactly two query
 * parameters and neither is this (tripwire 6), so the choice is one constant,
 * changed in a commit and gated on a hub timing receipt: build once per value,
 * run `tools/hub-presentation-probe.mjs` against both `dist/` copies, and keep
 * `kiln` only if load time and frame time do not regress. Until a receipt says
 * so, the shipped value is `procedural`.
 *
 * With `procedural` the GLB loader is unreachable and the bundle contains
 * neither it nor the asset.
 */
export type FarmhouseSource = 'procedural' | 'kiln';

export const FARMHOUSE_SOURCE: FarmhouseSource = 'procedural';
