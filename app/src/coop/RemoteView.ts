// SPDX-License-Identifier: AGPL-3.0-or-later
import { createSimState } from '@sim/state';
import { HOME_FIELD } from '@sim/field';
import { advanceDog, containDog } from '@sim/dogMovement';
import { FIXED_DT } from '@sim/tuning';
import type { PlayerInputs } from '@sim/types';
import type { ClientSim } from '@app/game/ClientSim';
import type { AcceptedBark } from '@app/state/store';
import type { DogFrame, MatchFrame } from '../../../net/messages';

const IDLE: PlayerInputs = { direction: { x: 0, z: 0 }, sprint: false, bark: false };
type Pending = { seq: number; input: PlayerInputs };
/** Bounded snapshot interpolation and local-dog prediction; no client flock AI. */
export class RemoteView implements ClientSim {
  readonly authoritative = false;
  readonly state;
  readonly positions; readonly headings; readonly stateFlags;
  readonly dogPositions; readonly dogVelocities; readonly dogHeadings; readonly dogStamina;
  acceptedBarkSerial = 0; acceptedBarkTick = -1; acceptedBarkDog = -1;
  private frames: MatchFrame[] = [];
  private received = 0;
  private accumulator = 0;
  private sendTime = 0;
  private seq = -1;
  barkId = 0;
  private pending: Pending[] = [];
  private dogBarks = new Map<number, AcceptedBark>();
  enabled = true;
  correction = 0;
  constructor(first: MatchFrame, readonly slot: number,
    private transmit: (input: PlayerInputs, bark: number) => number,
    private accepted: (bark: AcceptedBark) => void, barkId = 0) {
    this.barkId = barkId;
    const slots = [slot, ...first.dogs.map(d => d.slot).filter(s => s !== slot)];
    this.state = createSimState(HOME_FIELD, first.sheep.length / 4, 0, slots);
    this.positions = new Float32Array(first.sheep.length / 2);
    this.headings = new Float32Array(first.sheep.length / 4);
    this.stateFlags = new Uint8Array(first.sheep.length / 4);
    this.dogPositions = new Float32Array(slots.length * 2);
    this.dogVelocities = new Float32Array(slots.length * 2);
    this.dogHeadings = new Float32Array(slots.length);
    this.dogStamina = new Float32Array(slots.length);
    // On rejoin, old accepted barks are history, not new audio events.
    this.acceptedBarkSerial = first.barks.at(-1)?.serial ?? 0;
    this.receive(first); this.present(first, first, 1);
  }
  get tick() { return this.state.tick; }
  get completed() { return this.state.completed; }
  get pennedCount() { return this.state.pennedCount; }
  step(): void { throw new Error('Remote flock is server-owned'); }
  barkForDog(index: number) { return this.dogBarks.get(index) ?? null; }
  receive(frame: MatchFrame) {
    if (this.frames.length && frame.tick <= this.frames.at(-1)!.tick) return;
    this.received = performance.now();
    this.frames.push(frame); if (this.frames.length > 8) this.frames.shift();
    const authoritative = frame.dogs.find(d => d.slot === this.slot);
    if (!authoritative) { this.enabled = false; return; }
    const dog = this.state.dogs[0]!;
    const x = dog.position.x, z = dog.position.z;
    this.copyDog(0, authoritative);
    this.pending = this.pending.filter(p => p.seq > authoritative.ack).slice(-30);
    for (const p of this.pending) { advanceDog(dog, p.input); containDog(dog, this.state); }
    this.correction = Math.hypot(dog.position.x - x, dog.position.z - z);
    this.state.pennedCount = frame.count;
    this.state.completed = frame.count === this.headings.length;
    for (const b of frame.barks) if (b.serial > this.acceptedBarkSerial) {
      const index = this.state.dogs.findIndex(d => d.id === b.slot);
      this.acceptedBarkSerial = b.serial; this.acceptedBarkTick = b.tick; this.acceptedBarkDog = index;
      if (index >= 0) {
        const event = { serial: b.serial, tick: b.tick, dog: index, x: b.x, z: b.z };
        this.dogBarks.set(index, event); this.accepted(event);
      }
    }
  }
  frame(delta: number, requested: PlayerInputs) {
    const age = performance.now() - this.received;
    const input = this.enabled && age < 500 && !this.completed ? requested : IDLE;
    if (input.bark) this.barkId++;
    this.sendTime += Math.min(delta, 0.1);
    if (this.enabled && !this.completed && this.sendTime >= 1 / 30) {
      this.sendTime = 0; this.seq = this.transmit(input, this.barkId);
    }
    this.accumulator += Math.min(delta, 0.1);
    while (this.accumulator >= FIXED_DT) {
      if (this.enabled && age < 500 && !this.completed) {
        advanceDog(this.state.dogs[0]!, input); containDog(this.state.dogs[0]!, this.state);
        this.pending.push({ seq: this.seq, input: { ...input, direction: { ...input.direction } } });
        if (this.pending.length > 30) this.pending.shift();
      }
      this.accumulator -= FIXED_DT;
    }
    const newest = this.frames.at(-1)!;
    // Fixed 100 ms buffer for the local pilot. Hold the last known position on a gap.
    const target = Math.min(newest.tick, newest.tick + Math.min(age, 100) * 0.06 - 6);
    const a = [...this.frames].reverse().find(f => f.tick <= target) ?? this.frames[0]!;
    const b = this.frames.find(f => f.tick >= target) ?? newest;
    const alpha = a === b ? 1 : Math.max(0, Math.min(1, (target - a.tick) / (b.tick - a.tick)));
    this.present(a, b, alpha);
  }
  private copyDog(i: number, d: DogFrame) {
    const dog = this.state.dogs[i]!;
    dog.position.set(d.x, d.z); dog.velocity.set(d.vx, d.vz); dog.heading.set(d.hx, d.hz);
    dog.stamina = d.stamina; dog.sprinting = d.sprinting; dog.barkCooldownTicks = d.cooldown;
    dog.penMemory.inside = d.inside;
  }
  private present(a: MatchFrame, b: MatchFrame, alpha: number) {
    this.state.tick = b.tick;
    for (let i = 0; i < this.headings.length; i++) {
      const offset = i * 4;
      const x = a.sheep[offset]! + (b.sheep[offset]! - a.sheep[offset]!) * alpha;
      const z = a.sheep[offset + 1]! + (b.sheep[offset + 1]! - a.sheep[offset + 1]!) * alpha;
      this.positions[i * 2] = x; this.positions[i * 2 + 1] = z;
      this.headings[i] = b.sheep[offset + 2]!; this.stateFlags[i] = b.sheep[offset + 3]!;
      this.state.sheep[i]!.position.set(x, z);
      this.state.sheep[i]!.state = this.stateFlags[i] === 0 ? 'active' : this.stateFlags[i] === 1 ? 'retiring' : 'penned';
    }
    this.state.dogs.forEach((dog, i) => {
      if (i !== 0) {
        const to = b.dogs.find(d => d.slot === dog.id), from = a.dogs.find(d => d.slot === dog.id);
        if (to) { this.copyDog(i, to); if (from) dog.position.set(from.x + (to.x - from.x) * alpha, from.z + (to.z - from.z) * alpha); }
      }
      this.dogPositions[i * 2] = dog.position.x; this.dogPositions[i * 2 + 1] = dog.position.z;
      this.dogVelocities[i * 2] = dog.velocity.x; this.dogVelocities[i * 2 + 1] = dog.velocity.z;
      this.dogHeadings[i] = Math.atan2(dog.heading.z, dog.heading.x); this.dogStamina[i] = dog.stamina / 100;
    });
  }
}
