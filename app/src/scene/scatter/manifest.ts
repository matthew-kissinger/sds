// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** The committed meadow-dressing placement. Runtime consumes it directly and
 * never executes the placement recipe (spec/04). */

import { use } from 'react';
import type { FlowerBloom } from './flowerPlacement';
import type { ContactSpot, LogTransform, RockTransform } from './placement';

export interface ScatterManifest {
  readonly version: number;
  readonly recipe: string;
  readonly terrainSeed: number;
  readonly rocks: readonly RockTransform[];
  readonly flowers: readonly FlowerBloom[];
  readonly log: LogTransform | null;
  readonly contacts: readonly ContactSpot[];
}

const MANIFEST_URL = new URL('../../../../assets/scatter/manifest.json', import.meta.url).href;
let pending: Promise<ScatterManifest> | null = null;

export function loadScatterManifest(): Promise<ScatterManifest> {
  pending ??= fetch(MANIFEST_URL).then(async (response) => {
    if (!response.ok) {
      throw new Error(`scatter manifest: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as ScatterManifest;
  });
  return pending;
}

export function useScatterManifest(): ScatterManifest {
  return use(loadScatterManifest());
}
