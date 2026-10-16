// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The Kiln-authored barn, standing where the shipped one stands.
 *
 * The loader, the weld and the outline envelope live in the game
 * (app/src/scene/farmhouse/kilnBarn.ts, cluster.ts, hull.ts) because the game can
 * ship this barn. This subject only forces the Kiln barn whatever `BARN_SOURCE`
 * says; the house follows `FARMHOUSE_SOURCE` exactly as the game's `Farmhouse`
 * does. So the lab's `Barn (procedural)` subject and this one are the same camera
 * on the same ground with the same house, shadows and smoke: flip between them
 * and only the barn changes.
 */

import { use, useMemo } from 'react';
import { useHeightfield } from '@app/world/heightfield';
import { FarmhouseMeshes } from '@app/scene/Farmhouse';
import { buildFarmhouse } from '@app/scene/farmhouse/cluster';
import { loadKilnBarn } from '@app/scene/farmhouse/kilnBarn';
import { loadKilnHouse } from '@app/scene/farmhouse/kilnHouse';
import { FARMHOUSE_SOURCE } from '@app/scene/farmhouse/source';

export function KilnBarn() {
  const field = useHeightfield();
  const house = FARMHOUSE_SOURCE === 'kiln' ? use(loadKilnHouse()) : null;
  const barn = use(loadKilnBarn());
  const built = useMemo(
    () => buildFarmhouse((x, z) => field.groundY(x, z), house, barn),
    [field, house, barn],
  );
  return <FarmhouseMeshes built={built} />;
}
