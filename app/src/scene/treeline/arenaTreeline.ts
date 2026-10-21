// SPDX-License-Identifier: AGPL-3.0-or-later
import { TRUNK_SINK, type TreelinePlacement, type CanopyPlacement, type TrunkPlacement } from './placement';
/** Repeat an authored wedge beyond every pen/camera approach, using the same oak. */
export function arenaTreeline(source: TreelinePlacement, sectors: number): TreelinePlacement {
  const angle = Math.PI * 2 / sectors, canopies: CanopyPlacement[] = [], trunks: TrunkPlacement[] = [];
  for (const tree of source.canopies) {
    const bearing = Math.atan2(tree.z, tree.x);
    if (bearing < -angle / 2 || bearing >= angle / 2) continue;
    const root = source.trunks[tree.treeId]!;
    const radius = Math.hypot(tree.x, tree.z) + 90;
    for (let sector = 0; sector < sectors; sector++) {
      const turn = sector * angle, x = Math.cos(bearing + turn) * radius, z = Math.sin(bearing + turn) * radius;
      const index = trunks.length;
      trunks.push({ ...root, x, z, y: -TRUNK_SINK, treeId: index, parent: -1, yaw: root.yaw - turn });
      canopies.push({ ...tree, x, z, y: tree.y - root.y - TRUNK_SINK, yaw: tree.yaw - turn, treeId: index, support: index });
    }
  }
  return { canopies, trunks, shrubs: [] };
}
