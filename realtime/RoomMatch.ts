// SPDX-License-Identifier: AGPL-3.0-or-later
import { CpuDeterministicSim } from '../sim/FlockSim';
import { competitiveField } from '../sim/competitiveLayout';
import { CompetitiveScore } from './CompetitiveScore';
import type { MatchResult } from '../net/messages';
import { HOME_FIELD } from '../sim/field';
import { FIXED_DT } from '../sim/tuning';
import type { PlayerInputs } from '../sim/types';
import { PROTOCOL, type BarkFrame, type MatchFrame } from '../net/messages';
import type { RoomState } from './roomState';
interface Intent { seq: number; at: number; x: number; z: number; sprint: boolean; bark: number; pending: boolean }
const IDLE: PlayerInputs = { direction: { x: 0, z: 0 }, sprint: false, bark: false };

export class RoomMatch {
  readonly sim: CpuDeterministicSim;
  readonly started: number;
  readonly roster: number[];
  readonly score: CompetitiveScore | null;
  private reason: MatchResult['reason'] = 'flock';
  private intents = new Map<number, Intent>();
  private acks = new Map<number, number>();
  private barks: BarkFrame[] = [];
  private serial = 0;
  private time: number;
  private accumulator = 0;
  constructor(readonly round: string, count: number, slots: number[], seed: number, now: number, readonly mode: 'coop' | 'competitive' = 'coop', names = new Map<number, string>()) {
    this.sim = new CpuDeterministicSim(mode === 'competitive' ? competitiveField(slots) : HOME_FIELD, count, seed, slots);
    this.started = slots.length; this.roster = [...slots];
    this.score = mode === 'competitive' ? new CompetitiveScore(slots, count, names) : null;
    // Everyone has acknowledged assets; a short lead lets the first keyframe arrive.
    this.time = now + 500;
  }
  reset(slot: number) { this.intents.delete(slot); this.acks.delete(slot); }
  input(slot: number, seq: number, x: number, z: number, sprint: boolean, bark: number, now: number) {
    const previous = this.intents.get(slot);
    if (previous && seq <= previous.seq) return;
    this.intents.set(slot, { seq, at: now, x, z, sprint,
      bark: Math.max(previous?.bark ?? 0, bark),
      pending: (previous?.pending ?? false) || bark > (previous?.bark ?? 0) });
  }
  advance(now: number, room: RoomState): 'playing' | 'finished' | 'overload' | 'empty' {
    const dogs = this.sim.state.dogs;
    for (let i = dogs.length - 1; i >= 0; i--) {
      if (!room.members.some(m => m.slot === dogs[i]!.id && (m.deadline === null || now < m.deadline))) dogs.splice(i, 1);
    }
    this.score?.retain(dogs.map(d => d.id));
    if (!dogs.length) { this.reason = 'no_winner'; return 'empty'; }
    if (this.score && dogs.length === 1) { this.reason = 'forfeit'; return 'finished'; }
    if (now < this.time) return 'playing';
    this.accumulator += now - this.time; this.time = now;
    // Do not silently drop wall time and then award a slower successful run.
    if (this.accumulator > 500) return 'overload';
    let steps = 0;
    while (this.accumulator >= 1000 / 60 && steps++ < 30) {
      const previous = dogs.map(d => d.barkCooldownTicks);
      const inputs = dogs.map(d => {
        const intent = this.intents.get(d.id);
        const connected = room.members.some(m => m.slot === d.id && m.connected);
        if (!connected || !intent || now - intent.at > 250) {
          if (intent) intent.pending = false;
          return IDLE;
        }
        this.acks.set(d.id, intent.seq);
        const input = { direction: { x: intent.x, z: intent.z }, sprint: intent.sprint, bark: intent.pending };
        intent.pending = false; return input;
      });
      this.sim.step(inputs, FIXED_DT);
      if (this.score) this.score.collect(this.sim.state.arena!);
      dogs.forEach((d, i) => {
        if (d.barkCooldownTicks > previous[i]!) this.barks.push({ serial: ++this.serial,
          tick: this.sim.tick, slot: d.id, x: d.position.x, z: d.position.z });
      });
      this.barks = this.barks.slice(-32);
      this.accumulator -= 1000 / 60;
      if (this.sim.completed) return 'finished';
    }
    return 'playing';
  }
  result(): MatchResult {
    return { mode: this.mode, reason: this.reason, tick: this.sim.tick, count: this.sim.pennedCount,
      started: this.started, remaining: this.sim.state.dogs.length,
      standings: this.score ? this.score.standings.map(s => ({ ...s })) : [],
      unclaimed: this.score?.unclaimed ?? 0, winners: this.score?.winners() ?? [] };
  }
  snapshot(): MatchFrame {
    const sheep: number[] = [];
    this.sim.state.sheep.forEach((s, i) => sheep.push(s.position.x, s.position.z,
      this.sim.headings[i]!, this.sim.stateFlags[i]!));
    return { type: 'snapshot', protocol: PROTOCOL, rules: this.score ? 'competitive-1' : 'coop-1', round: this.round,
      roster: [...this.roster], standings: this.score ? this.score.standings.map(s => ({ ...s })) : [], unclaimed: this.score?.unclaimed ?? 0,
      tick: this.sim.tick, basis: null, count: this.sim.pennedCount, sheep,
      dogs: this.sim.state.dogs.map(d => ({ slot: d.id, x: d.position.x, z: d.position.z,
        vx: d.velocity.x, vz: d.velocity.z, hx: d.heading.x, hz: d.heading.z,
        stamina: d.stamina, sprinting: d.sprinting, cooldown: d.barkCooldownTicks,
        inside: d.penMemory.inside, ack: this.acks.get(d.id) ?? -1 })), barks: [...this.barks] };
  }
}
