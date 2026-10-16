// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/** The Kiln barn: how the baked GLB becomes this game's welded buffers. */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BARN_SOURCE } from '@app/scene/farmhouse/barnSource';
import { buildFarmhouse } from '@app/scene/farmhouse/cluster';
import { envelopeHull, type OutlineEnvelope } from '@app/scene/farmhouse/hull';
import { parseKilnBarn, type KilnBarn } from '@app/scene/farmhouse/kilnBarn';
import { parseKilnHouse } from '@app/scene/farmhouse/kilnHouse';
import { BARN, BARN_AT, BARN_YAW, KILN_BARN_FOOTPRINT } from '@app/scene/farmhouse/plan';
import { Shell, stand } from '@app/scene/farmhouse/shell';
import { FARMER_ROUTE } from '@app/scene/farmer/route';

const GLB = new URL('../assets/barn/barn.glb', import.meta.url);
const HOUSE_GLB = new URL('../assets/house/farmhouse.glb', import.meta.url);
const LEDGER = new URL('../assets/barn/asset-manifest.json', import.meta.url);
const LEVEL = -0.6;
const flat = (): number => LEVEL;

function bytesOf(url: URL): ArrayBuffer {
  const bytes = readFileSync(url);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

let cached: Promise<KilnBarn> | null = null;
/** Parsed once: every test below reads the same bake and none of them edits it. */
function parsed(): Promise<KilnBarn> {
  cached ??= parseKilnBarn(bytesOf(GLB));
  return cached;
}

interface GltfJson {
  nodes: { name?: string; extras?: Record<string, unknown> }[];
  meshes: { primitives: { attributes: Record<string, number> }[] }[];
  materials: { name?: string }[];
}

/** The GLB's JSON chunk, as written. */
function gltfJson(bytes: ArrayBuffer = bytesOf(GLB)): GltfJson {
  const source = Buffer.from(bytes);
  const jsonLength = source.readUInt32LE(12);
  return JSON.parse(source.subarray(20, 20 + jsonLength).toString('utf8')) as GltfJson;
}

/**
 * The same GLB with its JSON chunk edited: how a bake that lacks a record is
 * made without a second binary in the repository.
 */
function editedGlb(edit: (json: GltfJson) => void): ArrayBuffer {
  const source = Buffer.from(bytesOf(GLB));
  const jsonLength = source.readUInt32LE(12);
  const json = gltfJson(bytesOf(GLB));
  edit(json);
  const text = Buffer.from(JSON.stringify(json), 'utf8');
  const padded = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const rest = source.subarray(20 + jsonLength);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + padded.length + rest.length, 8);
  header.writeUInt32LE(padded.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const out = Buffer.concat([header, padded, rest]);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

/** The root node's extras, where the recipe writes its records. */
function rootRecord(json: GltfJson, key: string): unknown {
  return json.nodes.find((node) => node.extras?.[key] !== undefined)?.extras?.[key];
}

const vertices = (position: ArrayLike<number>): number => position.length / 3;

interface Corner { x: number; y: number; z: number; nx: number; ny: number; nz: number; u: number; v: number }

/** Every vertex of one band set, in the barn's own frame, with its channels. */
function* corners(part: { positions: Float32Array; normals: Float32Array; uvs: Float32Array }): Generator<Corner> {
  for (let i = 0; i < part.positions.length / 3; i++) {
    yield {
      x: part.positions[i * 3]!,
      y: part.positions[i * 3 + 1]!,
      z: part.positions[i * 3 + 2]!,
      nx: part.normals[i * 3]!,
      ny: part.normals[i * 3 + 1]!,
      nz: part.normals[i * 3 + 2]!,
      u: part.uvs[i * 2]!,
      v: part.uvs[i * 2 + 1]!,
    };
  }
}

/** Height of a recorded (z, y) section, eave to eave, at z. */
function sectionAt(section: readonly (readonly [number, number])[], z: number): number {
  for (let i = 0; i + 1 < section.length; i++) {
    const [z0, y0] = section[i]!;
    const [z1, y1] = section[i + 1]!;
    if (z >= Math.min(z0, z1) - 1e-9 && z <= Math.max(z0, z1) + 1e-9 && z1 !== z0) {
      return y0 + ((y1 - y0) * (z - z0)) / (z1 - z0);
    }
  }
  throw new Error(`z ${z} is outside the section`);
}

/**
 * The recipe's numbers that a test has to name: the boards' outer faces (BARN
 * in plan.ts), the verges, the lining, the floor and the apron. The roof itself
 * is read from the bake's own envelope record, and that record is held to the
 * baked slate and soffit below.
 */
const HX = BARN.length / 2;
const HZ = BARN.width / 2;
const XV = HX + 0.45;
const LINING = 0.2;
const FLOOR = 0.15;
const APRON = 0.14;
const FOOT = -0.05;
/** Metres of slate from the eave edge to the knee, and to the ridge (the recipe's PROFILE). */
const TO_KNEE = 5.693;
const TO_RIDGE = 8.821;

describe('Kiln barn import', () => {
  it('names a source the game can draw', () => {
    expect(['procedural', 'kiln']).toContain(BARN_SOURCE);
  });

  it('welds the 42 baked meshes into one triangle list per band set', async () => {
    const kiln = await parsed();
    expect(kiln.sourceNodes).toBe(42);
    expect(kiln.triangles).toBe(2350);
    expect(Object.keys(kiln.parts).sort()).toEqual(['barn', 'dress', 'lamp', 'opening', 'roof', 'timber']);
    let triangles = 0;
    for (const part of Object.values(kiln.parts)) {
      triangles += vertices(part.positions) / 3;
      expect(part.normals.length).toBe(part.positions.length);
      expect(part.uvs.length / 2).toBe(vertices(part.positions));
      for (const value of [...part.positions, ...part.normals, ...part.uvs]) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
    expect(triangles).toBe(kiln.triangles);
  });

  it('keeps the ledger to the bake: its triangles, meshes, materials and bounds', async () => {
    const kiln = await parsed();
    const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as {
      triangles: number;
      triangleBudget: number;
      exportedMeshNodes: number;
      materials: number;
      textures: number;
      boundsMetres: { x: number; y: number; z: number };
      runtime: { addedDraws: number; trianglesPerSurface: Record<string, number> };
    };
    expect(ledger.triangles).toBe(kiln.triangles);
    expect(ledger.triangles).toBeLessThanOrEqual(ledger.triangleBudget);
    expect(ledger.triangleBudget).toBe(2800);
    expect(ledger.exportedMeshNodes).toBe(kiln.sourceNodes);
    const json = gltfJson();
    expect(ledger.materials).toBe(json.materials.length);
    expect(ledger.textures).toBe(0);
    expect(ledger.runtime.addedDraws).toBe(0);
    const perSurface = Object.fromEntries(
      Object.entries(kiln.parts).map(([surface, part]) => [surface, vertices(part.positions) / 3]),
    );
    expect(perSurface).toEqual(ledger.runtime.trianglesPerSurface);

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const part of Object.values(kiln.parts)) {
      for (let i = 0; i < part.positions.length; i++) {
        min[i % 3] = Math.min(min[i % 3]!, part.positions[i]!);
        max[i % 3] = Math.max(max[i % 3]!, part.positions[i]!);
      }
    }
    expect(max[0]! - min[0]!).toBeCloseTo(ledger.boundsMetres.x, 2);
    expect(max[1]! - min[1]!).toBeCloseTo(ledger.boundsMetres.y, 2);
    expect(max[2]! - min[2]!).toBeCloseTo(ledger.boundsMetres.z, 2);
  });

  it('refuses a bake that does not record its surface channels', async () => {
    const unmarked = editedGlb((json) => {
      for (const node of json.nodes) delete node.extras?.surfaceChannels;
    });
    await expect(parseKilnBarn(unmarked)).rejects.toThrow(/barn\.glb: no "surfaceChannels" record/);
  });

  it('refuses a mesh that lost its TEXCOORD_0, naming the attribute', async () => {
    const stripped = editedGlb((json) => {
      delete json.meshes[0]!.primitives[0]!.attributes.TEXCOORD_0;
    });
    await expect(parseKilnBarn(stripped)).rejects.toThrow(/TEXCOORD_0 \(uv\)/);
  });

  it('refuses a bake without its outline envelope, or with one it cannot read', async () => {
    const missing = editedGlb((json) => {
      for (const node of json.nodes) delete node.extras?.outlineEnvelope;
    });
    await expect(parseKilnBarn(missing)).rejects.toThrow(/"outlineEnvelope" is missing/);

    const newer = editedGlb((json) => {
      (rootRecord(json, 'outlineEnvelope') as { version: number }).version = 2;
    });
    await expect(parseKilnBarn(newer)).rejects.toThrow(/is version 2, and this loader reads version 1/);

    const broken = editedGlb((json) => {
      const record = rootRecord(json, 'outlineEnvelope') as { slab: { top: unknown[] } };
      record.slab.top[1] = ['5.4', 5];
    });
    await expect(parseKilnBarn(broken)).rejects.toThrow(/slab\.top\[1\] is not a pair of numbers/);

    const lopsided = editedGlb((json) => {
      const record = rootRecord(json, 'outlineEnvelope') as { slab: { under: unknown[] } };
      record.slab.under.pop();
    });
    await expect(parseKilnBarn(lopsided)).rejects.toThrow(/slab has 7 top and 6 underside corners/);
  });

  it('refuses a material it has no band set for', async () => {
    const renamed = editedGlb((json) => {
      json.materials.find((material) => material.name === 'boards')!.name = 'paint';
    });
    await expect(parseKilnBarn(renamed)).rejects.toThrow(/barn\.glb: unbound material "paint"/);
  });
});

describe('Kiln barn surface channels, as baked', () => {
  it('measures the boards down from the roof over them', async () => {
    const { parts } = await parsed();
    let banded = 0;
    let indoors = 0;
    for (const c of corners(parts.barn!)) {
      expect(c.u).toBe(0);
      // Negative only where a face runs up out of sight: a gable's top inside
      // the slab (by 0.06 m), the cupola's head inside its cap's skirt (0.08);
      // 9 where no roof is over the face or the face is inside the shell, and
      // never more than the ridge stands over the sill wall.
      expect(c.v).toBeGreaterThanOrEqual(-0.08 - 1e-6);
      expect(c.v).toBeLessThanOrEqual(BARN.ridgeHeight - 0.55);
      if (c.v >= 0 && c.v < 0.46) banded++;
      if (c.v === 9) indoors++;
    }
    expect(banded).toBeGreaterThan(0);
    expect(indoors).toBeGreaterThan(0);
  });

  it('runs the gable band along the gambrel underside, knee and all', async () => {
    const { parts, envelope } = await parsed();
    let gable = 0;
    let knee = 0;
    for (const c of corners(parts.barn!)) {
      if (Math.abs(Math.abs(c.x) - HX) > 1e-3) continue;
      // Every vertex on a gable's outer face carries its own height below the
      // slab's underside over it, which bends at the knee and climbs to the
      // ridge: one value per vertex, from the bake's own section.
      expect(c.v).toBeCloseTo(sectionAt(envelope.slab.under, c.z) - c.y, 2);
      if (c.y > 8) gable++;
      if (Math.abs(Math.abs(c.z) - 2.9) < 0.15 && c.y > 8) knee++;
    }
    expect(gable).toBeGreaterThan(0);
    expect(knee).toBeGreaterThan(0);
  });

  it('carries the barn slate selector and runs the slope across the knee', async () => {
    const { parts } = await parsed();
    let longest = 0;
    let atKnee = 0;
    let off = 0;
    for (const c of corners(parts.roof!)) {
      // 1 is the barn's browner slate inside the shared roof set.
      expect(c.u).toBe(1);
      if (c.v === -1) {
        off++;
        continue;
      }
      expect(c.v).toBeGreaterThanOrEqual(0);
      expect(c.v).toBeLessThanOrEqual(TO_RIDGE + 1e-3);
      longest = Math.max(longest, c.v);
      // The cap is the same roof getting more sky, not a second eave: its
      // courses carry on counting from the flare, they do not restart at 0.
      if (Math.abs(Math.abs(c.z) - 2.9) < 1e-3 && c.y > 9) {
        expect(c.v).toBeCloseTo(TO_KNEE, 2);
        atKnee++;
      }
    }
    expect(longest).toBeCloseTo(TO_RIDGE, 2);
    expect(atKnee).toBeGreaterThan(0);
    // The ridge roll, the slab edges and the cupola cap are slate off the slope.
    expect(off).toBeGreaterThan(0);
  });

  it('paints the stone open-sky, and the dark and the lamps flat', async () => {
    const { parts } = await parsed();
    for (const c of corners(parts.dress!)) expect([c.u, c.v]).toEqual([0, 9]);
    for (const surface of ['opening', 'lamp'] as const) {
      for (const c of corners(parts[surface]!)) expect([c.u, c.v]).toEqual([0, 0]);
    }
    for (const c of corners(parts.timber!)) {
      expect(c.u).toBe(0);
      expect(c.v).toBeGreaterThanOrEqual(-0.08 - 1e-6);
      expect(c.v).toBeLessThanOrEqual(BARN.ridgeHeight);
    }
  });
});

describe('Kiln barn on its pad', () => {
  /** Heights of the upward faces of one band set inside an x/z window, below 0.3 m. */
  const upward = (part: { positions: Float32Array; normals: Float32Array; uvs: Float32Array }, inside: (x: number, z: number) => boolean): number[] => {
    const out: number[] = [];
    for (const c of corners(part)) if (c.ny > 0.99 && c.y < 0.3 && inside(c.x, c.z)) out.push(c.y);
    return out;
  };

  it('stands the threshing floor a step above the pad, on walls footed under it', async () => {
    const { parts } = await parsed();
    const floor = upward(parts.opening!, (x, z) => Math.abs(x) <= HX - LINING + 1e-3 && Math.abs(z) <= HZ - LINING + 1e-3);
    expect(floor.length).toBeGreaterThan(0);
    for (const y of floor) expect(y).toBeCloseTo(FLOOR, 4);

    let foot = Infinity;
    for (const part of Object.values(parts)) {
      for (let i = 1; i < part.positions.length; i += 3) foot = Math.min(foot, part.positions[i]!);
    }
    expect(foot).toBeCloseTo(FOOT, 4);
  });

  it('lays the apron and the step a centimetre under the floor', async () => {
    const { parts } = await parsed();
    const outside = upward(parts.dress!, (_x, z) => z < -HZ - 0.02);
    expect(outside.length).toBeGreaterThan(0);
    for (const y of outside) expect(y).toBeCloseTo(APRON, 4);
  });

  // The grass bake cuts the barn's footprint from plan.ts, which repeats the
  // record the recipe writes; this is where a drift between the three shows.
  it('records the footprint the grass bake cuts, and plan.ts repeats it', () => {
    expect(rootRecord(gltfJson(), 'footprint')).toEqual(KILN_BARN_FOOTPRINT.map((rect) => ({ ...rect })));
  });

  it('touches the ground only inside that footprint', async () => {
    const { parts } = await parsed();
    const outside: string[] = [];
    for (const [surface, part] of Object.entries(parts)) {
      for (const c of corners(part)) {
        if (c.y > 0.3) continue;
        const covered = KILN_BARN_FOOTPRINT.some((r) =>
          c.x >= r.minX - 1e-3 && c.x <= r.maxX + 1e-3 && c.z >= r.minZ - 1e-3 && c.z <= r.maxZ + 1e-3);
        if (!covered) outside.push(`${surface} (${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)})`);
      }
    }
    expect(outside).toEqual([]);
  });

  it("stands in the procedural barn's box, so its shadow and pad are BARN's", async () => {
    const { envelope } = await parsed();
    const walls = envelope.boxes[0]!;
    expect(walls.x).toEqual([-HX, HX]);
    expect(walls.z).toEqual([-HZ, HZ]);
    expect(Math.max(...envelope.slab.top.map(([, y]) => y))).toBe(BARN.ridgeHeight);
    const [barn] = KILN_BARN_FOOTPRINT;
    expect(barn.minX).toBeLessThan(-HX);
    expect(barn.maxZ).toBeGreaterThan(HZ);
  });

  // The farmer walks the barn's south side on his way to the pen. The procedural
  // barn is cleared by a metre in tests/farmer.spec.ts; this barn reaches further
  // south, with an apron and two leaves standing open over it.
  it("keeps the farmer's route clear of the walls, the open doors and the stone", async () => {
    const { parts } = await parsed();
    const sin = Math.sin(BARN_YAW);
    const cos = Math.cos(BARN_YAW);
    const toLocal = (x: number, z: number): [number, number] => {
      const dx = x - BARN_AT.x;
      const dz = z - BARN_AT.z;
      return [dx * cos - dz * sin, dx * sin + dz * cos];
    };
    /** Horizontal distance from a point to a segment, both in the barn's frame. */
    const toSegment = (p: [number, number], a: [number, number], b: [number, number]): number => {
      const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
    };
    const legs = FARMER_ROUTE.map((from, i) => {
      const to = FARMER_ROUTE[(i + 1) % FARMER_ROUTE.length]!;
      return [toLocal(from.x, from.z), toLocal(to.x, to.z)] as const;
    });

    // Anything standing in his way at body height, leaves and posts included.
    let body = Infinity;
    for (const part of Object.values(parts)) {
      for (const c of corners(part)) {
        if (c.y < APRON + 0.02 || c.y > 2) continue;
        for (const [a, b] of legs) body = Math.min(body, toSegment([c.x, c.z], a, b));
      }
    }
    expect(body).toBeGreaterThan(1);

    // The stone under his feet is a step he could take, but he does not.
    let stone = Infinity;
    for (const r of KILN_BARN_FOOTPRINT) {
      for (const [a, b] of legs) {
        for (let k = 0; k <= 200; k++) {
          const p: [number, number] = [a[0] + ((b[0] - a[0]) * k) / 200, a[1] + ((b[1] - a[1]) * k) / 200];
          const dx = Math.max(r.minX - p[0], 0, p[0] - r.maxX);
          const dz = Math.max(r.minZ - p[1], 0, p[1] - r.maxZ);
          stone = Math.min(stone, Math.hypot(dx, dz));
        }
      }
    }
    expect(stone).toBeGreaterThan(0.5);
  });
});

describe('Kiln barn outline envelope', () => {
  // The farmhouse's envelope is a hand copy of its roof (KILN_ROOF), and the copy
  // drifted until the outline drew a ledge under both eaves. The barn's is the
  // bake's own record; these hold the record to the baked geometry, and the hull
  // grown from it to the slab.
  it('records the slate surface and the soffit as baked', async () => {
    const { parts, envelope } = await parsed();
    const near = (part: 'roof' | 'timber', z: number, y: number): boolean =>
      [...corners(parts[part]!)].some((c) => Math.abs(c.x - XV) < 2e-3 && Math.abs(c.z - z) < 2e-3 && Math.abs(c.y - y) < 2e-3);
    expect(envelope.slab.x).toEqual([-XV, XV]);
    expect(envelope.slab.top).toHaveLength(7);
    for (const [z, y] of envelope.slab.top) expect(near('roof', z, y), `slate at (${z}, ${y})`).toBe(true);
    for (const [z, y] of envelope.slab.under) expect(near('timber', z, y), `soffit at (${z}, ${y})`).toBe(true);
  });

  it('records the cupola body and its cap as baked', async () => {
    const { parts, envelope } = await parsed();
    const bounds = (list: Corner[]) => ({
      x: [Math.min(...list.map((c) => c.x)), Math.max(...list.map((c) => c.x))],
      y: [Math.min(...list.map((c) => c.y)), Math.max(...list.map((c) => c.y))],
      z: [Math.min(...list.map((c) => c.z)), Math.max(...list.map((c) => c.z))],
    });
    // The cupola's boards are the only boards that high between the gables.
    const body = bounds([...corners(parts.barn!)].filter((c) => c.y > 9.9 && Math.abs(c.x) < HX - 1));
    const box = envelope.boxes[1]!;
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(body[axis][0]).toBeCloseTo(box[axis][0], 3);
      expect(body[axis][1]).toBeCloseTo(box[axis][1], 3);
    }
    // The cap's slate: everything slate above the cupola's head.
    const cap = bounds([...corners(parts.roof!)].filter((c) => c.y > 11.45));
    const record = envelope.caps[0]!;
    expect(cap.x[0]).toBeCloseTo(record.x[0], 3);
    expect(cap.x[1]).toBeCloseTo(record.x[1], 3);
    expect(cap.z[0]).toBeCloseTo(record.z[0], 3);
    expect(cap.z[1]).toBeCloseTo(record.z[1], 3);
    expect(cap.y[1]).toBeCloseTo(record.apex[1], 3);
  });

  it('grows a hull that stays on the slab, not under or outside it', async () => {
    const { envelope } = await parsed();
    const shell = new Shell();
    envelopeHull(shell, stand(0, 0, 0, 0), envelope);
    const hull = shell.build()!.getAttribute('position');
    let eaves = 0;
    for (let i = 0; i < hull.count; i++) {
      const [x, y, z] = [hull.getX(i), hull.getY(i), hull.getZ(i)];
      expect(Math.abs(x)).toBeLessThanOrEqual(XV + 1e-4);
      expect(Math.abs(z)).toBeLessThanOrEqual(Math.max(...envelope.slab.top.map(([sz]) => Math.abs(sz))) + 1e-4);
      // Past the walls, every hull corner is inside the slab's section: at or
      // under the slate, and above the soffit by the half-slab the outline's
      // push needs (hull.ts).
      if (Math.abs(z) <= HZ + 1e-3) continue;
      eaves++;
      expect(y).toBeLessThanOrEqual(sectionAt(envelope.slab.top, z) + 1e-4);
      expect(y).toBeGreaterThan(sectionAt(envelope.slab.under, z) + 0.05);
    }
    expect(eaves).toBeGreaterThan(0);
  });

  it('closes every face it draws: no edge is used once', async () => {
    const { envelope } = await parsed();
    const shell = new Shell();
    envelopeHull(shell, stand(0, 0, 0, 0), { ...envelope, boxes: [], caps: [] } satisfies OutlineEnvelope);
    const position = shell.build()!.getAttribute('position');
    const key = (i: number): string =>
      [position.getX(i), position.getY(i), position.getZ(i)].map((n) => n.toFixed(4)).join(',');
    const edges = new Map<string, number>();
    for (let t = 0; t < position.count; t += 3) {
      for (let k = 0; k < 3; k++) {
        const a = key(t + k);
        const b = key(t + ((k + 1) % 3));
        const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
        edges.set(edge, (edges.get(edge) ?? 0) + 1);
      }
    }
    // The slab is a closed prism: its ring and both verge ends. A diagonal of a
    // quad is used twice by the quad's own two triangles.
    expect([...edges.values()].filter((n) => n === 1)).toEqual([]);
  });
});

describe('Kiln barn in the cluster', () => {
  it('keeps the draw count and puts the barn on its pad', async () => {
    const kiln = await parsed();
    const procedural = buildFarmhouse(flat);
    const welded = buildFarmhouse(flat, null, kiln);
    expect(Object.keys(welded.geometry).sort()).toEqual(Object.keys(procedural.geometry).sort());

    // The barn buffer held only the procedural barn's boards, so it becomes the
    // Kiln boards exactly; the house's limewash and the smoke do not move.
    const count = (g: typeof welded.geometry, key: keyof typeof welded.geometry): number =>
      g[key].getAttribute('position').count;
    expect(count(welded.geometry, 'barn')).toBe(vertices(kiln.parts.barn!.positions));
    expect(count(welded.geometry, 'wall')).toBe(count(procedural.geometry, 'wall'));
    expect(count(welded.geometry, 'smoke')).toBe(count(procedural.geometry, 'smoke'));
    // The shadow is BARN's box for either source.
    expect(count(welded.geometry, 'shadow')).toBe(count(procedural.geometry, 'shadow'));

    // Placed with the cluster: the boards' bounds centre on the barn's pad.
    welded.geometry.barn.computeBoundingSphere();
    const sphere = welded.geometry.barn.boundingSphere!;
    expect(Math.hypot(sphere.center.x - BARN_AT.x, sphere.center.z - BARN_AT.z)).toBeLessThan(2);
    expect(welded.level).toBe(LEVEL);
  });

  it('welds independently of the house', async () => {
    const barn = await parsed();
    const house = await parseKilnHouse(bytesOf(HOUSE_GLB));
    const both = buildFarmhouse(flat, house, barn);
    const houseOnly = buildFarmhouse(flat, house);
    expect(both.geometry.wall.getAttribute('position').count).toBe(vertices(house.parts.wall!.positions));
    expect(both.geometry.barn.getAttribute('position').count).toBe(vertices(barn.parts.barn!.positions));
    expect(both.geometry.smoke.getAttribute('position').count)
      .toBe(houseOnly.geometry.smoke.getAttribute('position').count);
  });

  it("grows the barn's outline from the bake's envelope, up to the cupola's apex", async () => {
    const kiln = await parsed();
    /** The highest outline corner over the barn's pad: the house has its own. */
    const top = (geometry: ReturnType<typeof buildFarmhouse>['geometry']['outline']): number => {
      const p = geometry.getAttribute('position');
      let y = -Infinity;
      for (let i = 0; i < p.count; i++) {
        if (Math.hypot(p.getX(i) - BARN_AT.x, p.getZ(i) - BARN_AT.z) < 11) y = Math.max(y, p.getY(i));
      }
      return y;
    };
    expect(top(buildFarmhouse(flat, null, kiln).geometry.outline)).toBeCloseTo(LEVEL + kiln.envelope.caps[0]!.apex[1], 4);
    expect(top(buildFarmhouse(flat).geometry.outline)).toBeLessThan(LEVEL + kiln.envelope.caps[0]!.apex[1]);
  });
});
