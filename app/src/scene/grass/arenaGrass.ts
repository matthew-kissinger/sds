// SPDX-License-Identifier: AGPL-3.0-or-later
import { penLocal, type CompetitiveLayout } from '@sim/competitiveLayout';
import type { TuftBuffers } from './tuftData';
/** Reuse one east-facing wedge of the committed scatter in equal sectors.
 * This removes the solo homestead's north-facing holes without random scatter.
 * Pens get equal clearances; competitive ground is flat. */
export function arenaGrass(source: TuftBuffers, layout: CompetitiveLayout): TuftBuffers {
  const sectors = layout.sides.length, angle = 2 * Math.PI / sectors;
  const instances: { i: number; x: number; z: number; c: number; s: number }[] = [];
  for (let i = 0; i < source.count; i++) {
    const x = source.tufts[i * 4]!, z = source.tufts[i * 4 + 1]!;
    const bearing = Math.atan2(z, x);
    if (bearing < -angle / 2 || bearing >= angle / 2) continue;
    for (let sector = 0; sector < sectors; sector++) {
      const c = Math.cos(sector * angle), s = Math.sin(sector * angle);
      const p = { x: x * c + z * s, z: -x * s + z * c };
      if (layout.pens.some(pen => {
        const local = penLocal(pen, p);
        return (Math.abs(local.x) < 28 && local.z > 2 && local.z < 28)
          || (Math.abs(local.x) < pen.width / 2 && local.z >= 0 && local.z <= 2);
      })) continue;
      instances.push({ i, ...p, c, s });
    }
  }
  const matrices = new Float32Array(instances.length * 16), tufts = new Float32Array(instances.length * 4);
  instances.forEach(({ i, x, z, c, s }, j) => {
    const m = j * 16, from = i * 16;
    matrices.set(source.matrices.subarray(from, from + 16), m);
    for (const col of [0, 8]) {
      matrices[m + col] = source.matrices[from + col]! * c + source.matrices[from + col + 2]! * s;
      matrices[m + col + 2] = -source.matrices[from + col]! * s + source.matrices[from + col + 2]! * c;
    }
    matrices[m + 12] = x; matrices[m + 13] = 0; matrices[m + 14] = z;
    tufts.set([x, z, source.tufts[i * 4 + 2]!, source.tufts[i * 4 + 3]!], j * 4);
  });
  return { count: instances.length, matrices, tufts };
}
