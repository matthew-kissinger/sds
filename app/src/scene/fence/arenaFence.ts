// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CompetitiveLayout, ArenaSide } from '@sim/competitiveLayout';
import type { RectFenceSection } from '../RectFence';
import type { FenceKit } from './fenceKit';
import type { RailPlacement } from './placement';
import { fenceFieldPlacements } from './fenceField';
/** Every wall reuses the authored kit, in a local north-facing frame. */
export function arenaSections(side: ArenaSide, layout: CompetitiveLayout): RectFenceSection[] {
  const half = Math.hypot(side.b.x - side.a.x, side.b.z - side.a.z) / 2;
  const pen = side.pen === null ? null : layout.pens[side.pen]!;
  return [{ rect: { minX: -half, maxX: half, minZ: -1, maxZ: 0 }, sides: ['north'], postSpacing: 5,
    ...(pen ? { gaps: { north: { center: 0, width: pen.width, kit: true } } } : {}) },
    ...(pen ? [{ rect: { minX: -pen.halfWidth, maxX: pen.halfWidth, minZ: 0, maxZ: pen.depth },
      sides: ['north', 'west', 'east'] as const, postSpacing: 4 }] : [])];
}
export function arenaFencePlacements(kit: FenceKit, layout: CompetitiveLayout) {
  const groups = layout.sides.map(side => {
    const cx = (side.a.x + side.b.x) / 2, cz = (side.a.z + side.b.z) / 2;
    const { x: nx, z: nz } = side.normal;
    const at = (x: number, z: number) => ({ x: cx + x * nz + z * nx, z: cz - x * nx + z * nz });
    const yaw = Math.atan2(nx, nz);
    const placed = fenceFieldPlacements(kit, () => 0, arenaSections(side, layout));
    const rail = (r: RailPlacement): RailPlacement => {
      const a = at(r.ax, r.az), b = at(r.bx, r.bz);
      return { ...r, ax: a.x, az: a.z, bx: b.x, bz: b.z };
    };
    return { posts: placed.posts.map(p => ({ ...p, ...at(p.x, p.z), yaw: p.yaw + yaw, tiltDir: p.tiltDir - yaw })),
      rails: placed.rails.map(rail), leaves: placed.leaves.map(l => {
        const hinge = at(l.hingeX, l.hingeZ);
        return { ...l, hingeX: hinge.x, hingeZ: hinge.z, parts: l.parts.map(rail) };
      }) };
  });
  const posts = new Map<string, (typeof groups)[number]['posts'][number]>();
  for (const g of groups) for (const p of g.posts) posts.set(`${p.x.toFixed(5)},${p.z.toFixed(5)}`, p);
  return { posts: [...posts.values()], rails: groups.flatMap(g => g.rails), leaves: groups.flatMap(g => g.leaves) };
}
