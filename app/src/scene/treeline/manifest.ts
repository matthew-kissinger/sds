// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** The committed treeline placement. Runtime renders these transforms and never
 * runs the stand/scatter recipe (spec/04). */

import { use } from 'react';
import type { TreelinePlacement } from './placement';

export interface TreelineManifest extends TreelinePlacement {
  readonly version: number;
  readonly recipe: string;
  readonly terrainSeed: number;
}

const MANIFEST_URL = new URL('../../../../assets/treeline/manifest.json', import.meta.url).href;
let pending: Promise<TreelineManifest> | null = null;

export function loadTreelineManifest(): Promise<TreelineManifest> {
  pending ??= fetch(MANIFEST_URL).then(async (response) => {
    if (!response.ok) {
      throw new Error(`treeline manifest: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as TreelineManifest;
  });
  return pending;
}

export function useTreelineManifest(): TreelineManifest {
  return use(loadTreelineManifest());
}
