// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ClientSim } from '@app/game/ClientSim';
/** Classic remains world-locked, but each competitive seat looks toward its pen. */
export function competitiveBearing(sim: Pick<ClientSim, 'state'>): number | undefined {
  const pen = sim.state.field.competition?.pens.find(p => p.slot === sim.state.dogs[0]?.id);
  return pen ? Math.atan2(pen.normal.x, pen.normal.z) : undefined;
}
