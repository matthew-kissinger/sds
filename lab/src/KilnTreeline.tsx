// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The Kiln-authored oak, standing in every stand the shipped treeline uses.
 *
 * The loader, the fit to the placement's boxes and the two materials live in
 * the game (app/src/scene/treeline/kilnTree.ts, kilnOak.ts,
 * kilnTreeMaterials.ts) because the game can ship this oak, and so does the
 * component: the game's `KilnTreeline`, which its `Treeline` mounts when
 * `TREE_SOURCE` is 'kiln'. This subject mounts it whatever the constant says,
 * through the game's own `TreelineMeshes`: the same stands, the same matrices
 * and the same pooled shadows as the `treeline` part. So the lab's
 * `Tree (procedural)` subject and `Tree (Kiln)` are the same camera on the same
 * ground with the same treeline: flip between them and only the oak changes. A
 * failed load is logged and draws the procedural oak, as the game would.
 */

export { KilnTreeline } from '@app/scene/Treeline';
