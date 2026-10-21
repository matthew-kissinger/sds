// SPDX-License-Identifier: AGPL-3.0-or-later
import { PenBarrier } from './PenBarrier';
import { Vector2D } from './Vector2D';
import { calculateSeek } from './FlockingAlgorithms';
import { penLocal, penWorld, type CompetitiveLayout, type ArenaPen } from './competitiveLayout';
import { FIXED_DT, GATE_ATTRACTION, GATE_ATTRACTION_DOG_REACH, GATE_ATTRACTION_RANGE,
  HARD_BOUNDARY_MARGIN, PEN_BARRIER, SHEEP_BOUNDARY, SHEEP_FLEE_RADIUS, SHEEP_MAX_FORCE, SHEEP_MAX_SPEED_PER_TICK } from './tuning';
import type { Dog, Sheep } from './types';

/** Geometry only: no player eligibility, scores, clocks or transport. */
export class ArenaGeometry {
  readonly destinations: Int8Array;
  private readonly barriers: PenBarrier[];
  constructor(readonly layout: CompetitiveLayout, seed: number, count: number) {
    this.destinations = new Int8Array(count).fill(-1);
    this.barriers = layout.pens.map(p => new PenBarrier({ minX: -p.halfWidth, maxX: p.halfWidth, minZ: 0, maxZ: p.depth },
      { x: 0, z: 0, width: p.width }, { ...PEN_BARRIER, settleSeed: seed }));
  }
  guidance(sheep: Sheep, dogs: readonly Dog[]): ArenaPen | null {
    let selected: ArenaPen | null = null, best = GATE_ATTRACTION_RANGE * GATE_ATTRACTION_RANGE, tied = false;
    for (const pen of this.layout.pens) {
      const dx = pen.position.x - sheep.position.x, dz = pen.position.z - sheep.position.z;
      const distance = dx * dx + dz * dz;
      if (distance >= GATE_ATTRACTION_RANGE * GATE_ATTRACTION_RANGE || distance > best + 1e-9) continue;
      const armed = dogs.some(d => {
        const x = d.position.x - sheep.position.x, z = d.position.z - sheep.position.z;
        return x * x + z * z < SHEEP_FLEE_RADIUS * GATE_ATTRACTION_DOG_REACH * SHEEP_FLEE_RADIUS * GATE_ATTRACTION_DOG_REACH && dx * x + dz * z < 0;
      });
      if (!armed) continue;
      // Equidistant openings provide no assistance: no arbitrary slot/order bias.
      if (Math.abs(distance - best) <= 1e-9) tied = true;
      else { selected = pen; best = distance; tied = false; }
    }
    return tied ? null : selected;
  }
  steer(sheep: Sheep, dogs: readonly Dog[]): void {
    const gate = this.guidance(sheep, dogs);
    if (gate) sheep.acceleration.add(calculateSeek(sheep, new Vector2D(gate.position.x, gate.position.z),
      SHEEP_MAX_SPEED_PER_TICK, SHEEP_MAX_FORCE).multiply(GATE_ATTRACTION));
    const steer = new Vector2D(0, 0);
    for (const side of this.layout.sides) {
      const gap = side.distance - sheep.position.x * side.normal.x - sheep.position.z * side.normal.z;
      if (gap >= SHEEP_BOUNDARY.margin) continue;
      const pen = side.pen === null ? null : this.layout.pens[side.pen]!;
      if (pen && Math.abs(penLocal(pen, sheep.position).x) < pen.width / 2 + 2) continue;
      const force = (SHEEP_BOUNDARY.margin - gap) / SHEEP_BOUNDARY.margin;
      steer.x -= side.normal.x * force; steer.z -= side.normal.z * force;
    }
    if (steer.magnitude() > 0) sheep.acceleration.add(steer.normalize().multiply(SHEEP_MAX_SPEED_PER_TICK * 1.5)
      .subtract(sheep.velocity).limit(SHEEP_MAX_FORCE * 2.5));
  }
  contain(position: Vector2D): void {
    // Project against all convex half-planes; a second pass resolves corners.
    for (let pass = 0; pass < 2; pass++) for (const side of this.layout.sides) {
      const pen = side.pen === null ? null : this.layout.pens[side.pen]!;
      const local = pen && penLocal(pen, position);
      if (local && Math.abs(local.x) <= pen!.width / 2 && Math.abs(local.z) < 3) continue;
      const excess = position.x * side.normal.x + position.z * side.normal.z - side.distance + HARD_BOUNDARY_MARGIN;
      if (excess > 0) { position.x -= side.normal.x * excess; position.z -= side.normal.z * excess; }
    }
  }
  update(sheep: Sheep[]): number {
    let count = 0;
    for (const s of sheep) {
      let destination = this.destinations[s.id]!;
      for (let i = 0; i < this.layout.pens.length; i++) {
        if (destination >= 0 && destination !== i) continue;
        const pen = this.layout.pens[i]!, barrier = this.barriers[i]!;
        const local = penLocal(pen, s.position);
        if (destination < 0 && (Math.abs(local.x) > pen.halfWidth + 2 || local.z < -2 || local.z > pen.depth + 2)) continue;
        const velocity = { x: s.velocity.x * pen.normal.z - s.velocity.z * pen.normal.x,
          z: s.velocity.x * pen.normal.x + s.velocity.z * pen.normal.z };
        s.position.set(local.x, local.z); s.velocity.set(velocity.x, velocity.z);
        if (s.settleTarget) { const target = penLocal(pen, s.settleTarget); s.settleTarget.set(target.x, target.z); }
        // Only a mouth crossing can retire an active sheep, never a side/corner.
        if (destination < 0 && barrier._isInside(local.x, local.z) && !barrier._inGateGap(local.x, local.z, barrier.sheepBody, true)) {
          barrier._keepOut(s.position, barrier.sheepBody);
        }
        barrier.update([s], null, true, FIXED_DT);
        const world = penWorld(pen, s.position.x, s.position.z); s.position.set(world.x, world.z);
        const vx = s.velocity.x, vz = s.velocity.z;
        s.velocity.set(vx * pen.normal.z + vz * pen.normal.x, -vx * pen.normal.x + vz * pen.normal.z);
        if (s.settleTarget) { const target = penWorld(pen, s.settleTarget.x, s.settleTarget.z); s.settleTarget.set(target.x, target.z); }
        if (s.state !== 'active') { this.destinations[s.id] = destination = i; break; }
      }
      if (destination >= 0) count++; else this.contain(s.position);
    }
    return count;
  }
  containDog(dog: Dog): void {
    // A dog may use any pen. The single inside flag is disambiguated by geometry.
    let inside = false;
    for (let i = 0; i < this.layout.pens.length; i++) {
      const pen = this.layout.pens[i]!, local = penLocal(pen, dog.position);
      if (Math.abs(local.x) > pen.halfWidth + 2 || local.z < -3 || local.z > pen.depth + 2) continue;
      const memory = { inside: dog.penMemory.inside };
      this.barriers[i]!.containDog(local, true, memory);
      const world = penWorld(pen, local.x, local.z); dog.position.set(world.x, world.z);
      inside ||= memory.inside;
    }
    dog.penMemory.inside = inside;
    if (!inside) this.contain(dog.position);
  }
}
