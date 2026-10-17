// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The Kiln oak as the treeline draws it: its first (and only) variant, through
 * its own two materials (treeline/kilnTreeMaterials.ts), in every stand.
 */

import { kilnTreeGeometry, type KilnTree } from './kilnTree';
import { makeKilnBarkMaterial, makeKilnLeafMaterial } from './kilnTreeMaterials';
import type { OakBuilder } from './oakRoles';

export function kilnOak(kiln: KilnTree): OakBuilder {
  const variant = kiln.variants[0]!;
  return ({ matrices, crownInstances, woodInstances }) => ({
    name: 'kiln-oak',
    crown: [
      kilnTreeGeometry(variant.crown),
      makeKilnLeafMaterial({ matrices, instances: crownInstances, envelope: variant.envelope }),
    ],
    wood: [kilnTreeGeometry(variant.wood), makeKilnBarkMaterial({ matrices, instances: woodInstances })],
    receipt: {
      source: 'kiln-oak',
      sourceAsset: {
        variants: kiln.variants.map(({ name }) => name),
        foliageTriangles: kiln.triangles.crown,
        woodTriangles: kiln.triangles.wood,
        sourceNodes: kiln.sourceNodes,
      },
    },
  });
}
