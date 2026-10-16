// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The Kiln-authored farmhouse, standing where the shipped one stands.
 *
 * It takes the procedural range's pad, yaw and footprint exactly, so the lab's
 * `Farmhouse` subject and this one are the same camera on the same ground: flip
 * between them and only the asset changes. That is the only way to answer the
 * question this prototype exists for, which is not "is the Kiln house good" but
 * "does a Kiln asset arrive in this game's painting".
 *
 * IT DOES NOT SUSPEND, AND THAT IS DELIBERATE. The lab wraps its whole scene in
 * one `Suspense` with a null fallback (lab/src/LabApp.tsx), so a part that
 * suspends takes the terrain, the grass and the camera down with it and the
 * reviewer gets a black frame with nothing to read. A shipped asset earns a
 * Suspense gate; a route prototype should fail by being absent.
 *
 * Nothing here runs in a frame. The GLB is fetched once, welded to one buffer
 * per band set (lab/src/kilnHouseAsset.ts), and never touched again.
 */

import { useEffect, useMemo, useState } from 'react';
import { useHeightfield } from '@app/world/heightfield';
import { HOUSE_AT, YAW } from '@app/scene/farmhouse/plan';
import { kilnHouseMaterials, loadKilnHouse, type KilnHouse as Built } from './kilnHouseAsset';

/** One load for the page, whichever subject asks for it first. */
let pending: Promise<Built> | null = null;
function houseAsset(): Promise<Built> {
  pending ??= loadKilnHouse();
  return pending;
}

export function KilnHouse() {
  const field = useHeightfield();
  const [built, setBuilt] = useState<Built | null>(null);
  const level = field.groundY(HOUSE_AT.x, HOUSE_AT.z);

  useEffect(() => {
    let live = true;
    houseAsset().then(
      (result) => {
        if (live) setBuilt(result);
      },
      (error: unknown) => {
        // Loud, because a silent miss here looks exactly like a subject that
        // has not finished compiling its shaders.
        console.error('KilnHouse: the asset did not load', error);
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const materials = useMemo(() => kilnHouseMaterials(level), [level]);
  useEffect(() => {
    return () => {
      for (const material of Object.values(materials)) material.dispose();
    };
  }, [materials]);

  if (built === null) return null;

  return (
    <group position={[HOUSE_AT.x, level, HOUSE_AT.z]} rotation={[0, YAW, 0]}>
      {Object.entries(built.geometry).map(([surface, geometry]) => (
        <mesh
          key={surface}
          geometry={geometry}
          material={materials[surface as keyof typeof materials]}
        />
      ))}
    </group>
  );
}
