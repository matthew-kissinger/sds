// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/**
 * Which barn the game draws.
 *
 *  - `procedural`: the barn built in code (farmhouse/cluster.ts) - gabled, with
 *    its outshot and its cupola - and nothing to download.
 *  - `kiln`: the threshing barn baked from assets/barn/barn.kiln.js and loaded
 *    as assets/barn/barn.glb (farmhouse/kilnBarn.ts), welded into the same
 *    board, roof, timber, dress, opening and lamp buffers. Its outline envelope
 *    is the gambrel's (farmhouse/hull.ts); its cast shadow, the pad, the yaw and
 *    the box it stands in are the procedural barn's.
 *
 * THIS IS A BUILD DECISION, NOT A SETTING, for the same reasons as
 * `FARMHOUSE_SOURCE` (farmhouse/source.ts), and independent of it: either
 * building can be either source. Production reads exactly two query parameters
 * and neither is this (tripwire 6), so the choice is one constant, changed in a
 * commit and gated on a hub timing receipt: build once per value, run
 * `tools/hub-presentation-probe.mjs` against both `dist/` copies, and keep `kiln`
 * only if load time and frame time do not regress. Until a receipt says so, the
 * shipped value is `procedural`.
 *
 * With `procedural` the barn's GLB loader is unreachable and the bundle contains
 * neither it nor the asset.
 */
export type BarnSource = 'procedural' | 'kiln';

export const BARN_SOURCE: BarnSource = 'procedural';
