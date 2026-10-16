// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The Kiln-authored farmhouse, standing where the shipped one stands.
 *
 * The loader and the weld live in the game (app/src/scene/farmhouse/kilnHouse.ts)
 * because the game can ship this house. This subject only forces the Kiln source
 * whatever `FARMHOUSE_SOURCE` says, so the lab's `Farmhouse` subject and this one
 * are the same camera on the same ground with the same barn, shadows and smoke:
 * flip between them and only the house changes.
 */

import { use, useMemo } from 'react';
import { useHeightfield } from '@app/world/heightfield';
import { FarmhouseMeshes } from '@app/scene/Farmhouse';
import { buildFarmhouse } from '@app/scene/farmhouse/cluster';
import { loadKilnHouse } from '@app/scene/farmhouse/kilnHouse';

export function KilnHouse() {
  const field = useHeightfield();
  const kiln = use(loadKilnHouse());
  const built = useMemo(() => buildFarmhouse((x, z) => field.groundY(x, z), kiln), [field, kiln]);
  return <FarmhouseMeshes built={built} />;
}
