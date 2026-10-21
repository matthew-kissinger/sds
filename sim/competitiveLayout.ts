// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FieldDef } from './types';
export interface Point { x: number; z: number }
export interface ArenaSide { a: Point; b: Point; normal: Point; distance: number; pen: number | null }
export interface ArenaPen { slot: number; position: Point; normal: Point; width: number; halfWidth: number; depth: number }
export interface CompetitiveLayout { sides: ArenaSide[]; pens: ArenaPen[] }
const ROOT3 = Math.sqrt(3);
/** Accepted square / equal-area hexagon / square. Slot IDs survive departures. */
export function competitiveField(slots: readonly number[]): FieldDef {
  if (slots.length < 2 || slots.length > 4 || new Set(slots).size !== slots.length) throw new Error('Competitive roster needs 2–4 players');
  const hex = slots.length === 3;
  const a = hex ? Math.sqrt(40000 / (2 * ROOT3)) : 100;
  const r = 2 * a / ROOT3;
  const vertices: Point[] = hex
    ? [{ x: -r / 2, z: a }, { x: r / 2, z: a }, { x: r, z: 0 }, { x: r / 2, z: -a }, { x: -r / 2, z: -a }, { x: -r, z: 0 }]
    : [{ x: -100, z: 100 }, { x: 100, z: 100 }, { x: 100, z: -100 }, { x: -100, z: -100 }];
  const gateSides = slots.length === 4 ? [0, 1, 2, 3] : hex ? [0, 2, 4] : [0, 2];
  const pens: ArenaPen[] = [];
  const sides = vertices.map((from, i): ArenaSide => {
    const to = vertices[(i + 1) % vertices.length]!;
    const dx = to.x - from.x, dz = to.z - from.z, length = Math.sqrt(dx * dx + dz * dz);
    const normal = { x: -dz / length, z: dx / length };
    const owner = gateSides.indexOf(i);
    const pen = owner < 0 ? null : pens.length;
    if (owner >= 0) pens.push({ slot: slots[owner]!, position: { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 }, normal, width: 8, halfWidth: 30, depth: 30 });
    return { a: from, b: to, normal, distance: a, pen };
  });
  return { bounds: { minX: hex ? -r : -100, maxX: hex ? r : 100, minZ: -a, maxZ: a },
    gate: { position: pens[0]!.position, width: 8 }, pen: { minX: -30, maxX: 30, minZ: a, maxZ: a + 30 },
    spawn: { center: { x: 0, z: 0 }, spreadRadius: 25 }, dogSpawn: { x: 0, z: -45 }, competition: { sides, pens } };
}
export function penLocal(pen: ArenaPen, p: Point): Point {
  const x = p.x - pen.position.x, z = p.z - pen.position.z;
  return { x: x * pen.normal.z - z * pen.normal.x, z: x * pen.normal.x + z * pen.normal.z };
}
export function penWorld(pen: ArenaPen, x: number, z: number): Point {
  return { x: pen.position.x + x * pen.normal.z + z * pen.normal.x,
    z: pen.position.z - x * pen.normal.x + z * pen.normal.z };
}
