// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The terrain manifest's data-only surface. Bake recipes import this module so
 * they can share the committed pads without pulling in React or the runtime
 * heightfield URL. Runtime heightfield loading and placement recipes therefore
 * read one authority while staying separate concerns.
 */

import manifestJson from '../../../assets/terrain/manifest.json';
import type { HeightfieldManifest, TerrainPad } from './heightfieldSampler';

export const TERRAIN_MANIFEST = manifestJson as HeightfieldManifest;
export const TERRAIN_PADS: readonly TerrainPad[] = TERRAIN_MANIFEST.pads;
