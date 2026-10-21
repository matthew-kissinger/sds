// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Standing } from '../net/messages';
import type { ArenaGeometry } from '../sim/ArenaGeometry';
/** Bank each capture once. Departures never redistribute earlier captures. */
export class CompetitiveScore {
  readonly standings: Standing[];
  unclaimed = 0;
  private readonly counted: Uint8Array;
  constructor(slots: number[], count: number, names: Map<number, string>) {
    this.standings = slots.map(slot => ({ slot, name: names.get(slot) ?? `Player ${slot + 1}`, count: 0, forfeited: false }));
    this.counted = new Uint8Array(count);
  }
  retain(slots: readonly number[]): void {
    for (const standing of this.standings) if (!slots.includes(standing.slot)) standing.forfeited = true;
  }
  collect(arena: ArenaGeometry): void {
    arena.destinations.forEach((destination, id) => {
      if (destination < 0 || this.counted[id]) return;
      this.counted[id] = 1;
      const slot = arena.layout.pens[destination]!.slot;
      const standing = this.standings.find(s => s.slot === slot)!;
      if (standing.forfeited) this.unclaimed++; else standing.count++;
    });
  }
  winners(): number[] {
    const eligible = this.standings.filter(s => !s.forfeited);
    const highest = Math.max(...eligible.map(s => s.count));
    return eligible.filter(s => s.count === highest).map(s => s.slot);
  }
}
