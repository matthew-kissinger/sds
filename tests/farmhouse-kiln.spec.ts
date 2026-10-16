// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/** The Kiln farmhouse: how the baked GLB becomes this game's welded buffers. */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildFarmhouse } from '@app/scene/farmhouse/cluster';
import { parseKilnHouse, type KilnHouse } from '@app/scene/farmhouse/kilnHouse';
import { roofHull } from '@app/scene/farmhouse/hull';
import { HOUSE_AT, KILN_PORCH, KILN_ROOF, KILN_STACK } from '@app/scene/farmhouse/plan';
import { Shell, stand } from '@app/scene/farmhouse/shell';
import { FARMHOUSE_SOURCE } from '@app/scene/farmhouse/source';

const GLB = new URL('../assets/house/farmhouse.glb', import.meta.url);
const LEDGER = new URL('../assets/house/asset-manifest.json', import.meta.url);
const LEVEL = -0.6;
const flat = (): number => LEVEL;

function glbBytes(): ArrayBuffer {
  const bytes = readFileSync(GLB);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function parsed(): Promise<KilnHouse> {
  return parseKilnHouse(glbBytes());
}

/**
 * The same GLB with its JSON chunk edited: how a bake that lacks the channels
 * is made without a second binary in the repository.
 */
function editedGlb(edit: (json: GltfJson) => void): ArrayBuffer {
  const source = Buffer.from(glbBytes());
  const jsonLength = source.readUInt32LE(12);
  const json = JSON.parse(source.subarray(20, 20 + jsonLength).toString('utf8')) as GltfJson;
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

interface GltfJson {
  nodes: { name?: string; extras?: Record<string, unknown> }[];
  meshes: { primitives: { attributes: Record<string, number> }[] }[];
}

const vertices = (position: ArrayLike<number>): number => position.length / 3;

/** Every vertex of one band set, in the house's own frame, with its channels. */
function* corners(part: { positions: Float32Array; uvs: Float32Array }) {
  for (let i = 0; i < part.positions.length / 3; i++) {
    yield {
      x: part.positions[i * 3]!,
      y: part.positions[i * 3 + 1]!,
      z: part.positions[i * 3 + 2]!,
      u: part.uvs[i * 2]!,
      v: part.uvs[i * 2 + 1]!,
    };
  }
}

/**
 * The recipe's roof, for checking the baked distances against: slate top 5.82 m
 * over the walls' outer faces at z = +/-4.575, ridge at 10.72, and a 0.22 m slab
 * whose underside therefore sits 0.322 m below its top.
 */
const OUTER_X = 9.575;
const ROOF_HALF_Z = 4.575;
const underside = (z: number): number => 5.82 + 4.9 * (1 - Math.abs(z) / ROOF_HALF_Z) - 0.22 * Math.hypot(1, 4.9 / ROOF_HALF_Z);

describe('Kiln farmhouse import', () => {
  it('names a source the game can draw', () => {
    expect(['procedural', 'kiln']).toContain(FARMHOUSE_SOURCE);
  });

  it('welds the baked meshes into one triangle list per band set', async () => {
    const kiln = await parsed();
    expect(Object.keys(kiln.parts).sort()).toEqual(
      ['dress', 'lamp', 'opening', 'roof', 'timber', 'wall'],
    );
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

  // The ledger reads its counts from the GLB (tools/glb-ledger.mjs); this holds
  // what the loader welds to what the ledger says the bake exported, so the
  // two cannot drift apart silently as a typed-in count once did.
  it('keeps the ledger to the bake: its triangles, meshes, materials and surface split', async () => {
    const kiln = await parsed();
    const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as {
      triangles: number;
      exportedMeshNodes: number;
      materials: number;
      textures: number;
      runtime: { addedDraws: number; trianglesPerSurface: Record<string, number> };
    };
    expect(ledger.triangles).toBe(kiln.triangles);
    expect(ledger.exportedMeshNodes).toBe(kiln.sourceNodes);
    expect(ledger.textures).toBe(0);
    expect(ledger.runtime.addedDraws).toBe(0);
    const perSurface = Object.fromEntries(
      Object.entries(kiln.parts).map(([surface, part]) => [surface, vertices(part.positions) / 3]),
    );
    expect(perSurface).toEqual(ledger.runtime.trianglesPerSurface);
  });

  it('refuses a bake that does not record its surface channels', async () => {
    const unmarked = editedGlb((json) => {
      for (const node of json.nodes) delete node.extras?.surfaceChannels;
    });
    await expect(parseKilnHouse(unmarked)).rejects.toThrow(/surfaceChannels/);
  });

  it('refuses a mesh that lost its TEXCOORD_0, naming the attribute', async () => {
    const stripped = editedGlb((json) => {
      delete json.meshes[0]!.primitives[0]!.attributes.TEXCOORD_0;
    });
    await expect(parseKilnHouse(stripped)).rejects.toThrow(/TEXCOORD_0 \(uv\)/);
  });
});

describe('Kiln farmhouse surface channels, as baked', () => {
  it('measures the limewash down from the roof edge over it', async () => {
    const { parts } = await parsed();
    let banded = 0;
    for (const c of corners(parts.wall!)) {
      expect(c.u).toBe(0);
      // Negative only where a face runs up inside a slab, and never more than the
      // ridge stands over the footing; 9 where no roof edge is over the face.
      expect(c.v).toBeGreaterThanOrEqual(-0.35);
      expect(c.v).toBeLessThanOrEqual(10.72);
      if (c.v >= 0 && c.v < 0.46) banded++;
    }
    expect(banded).toBeGreaterThan(0);
  });

  it('runs the gable band along the rake, not level at the wall head', async () => {
    const { parts } = await parsed();
    let gable = 0;
    for (const c of corners(parts.wall!)) {
      if (Math.abs(Math.abs(c.x) - OUTER_X) > 1e-3 || c.v === 9) continue;
      // Every vertex on a gable's outer face carries its own height below the
      // slab underside over it, which climbs to the ridge.
      expect(c.v).toBeCloseTo(underside(c.z) - c.y, 3);
      if (c.y > 8) gable++;
    }
    expect(gable).toBeGreaterThan(0);
  });

  it('gives every slope its own eave, the porch included', async () => {
    const { parts } = await parsed();
    let main = 0;
    let porch = -1;
    let porchCount = 0;
    let edges = 0;
    for (const c of corners(parts.roof!)) {
      expect(c.u).toBe(0);
      if (c.v === -1) {
        edges++;
        continue;
      }
      expect(c.v).toBeGreaterThanOrEqual(0);
      // The main slope runs 7.36 m from eave edge to ridge.
      expect(c.v).toBeLessThanOrEqual(7.37);
      if (c.y > 5) main = Math.max(main, c.v);
      else {
        porch = Math.max(porch, c.v);
        porchCount++;
      }
    }
    expect(main).toBeCloseTo(7.36, 1);
    // THE RELEASE 1 DEFECT. The porch slopes sit wholly below the main eave, and
    // a height-based guess clamped all of them to 0 - one flat slab. Baked, they
    // run their own 1.87 m from the porch eave.
    expect(porchCount).toBeGreaterThan(0);
    expect(porch).toBeCloseTo(1.87, 1);
    // Slab edges, undersides and the ridge roll are slate off the slope.
    expect(edges).toBeGreaterThan(0);
  });

  it('puts the porch posts under the porch roof, and the masonry on selector 1', async () => {
    const { parts } = await parsed();
    const posts = [...corners(parts.timber!)].filter((c) => c.z < -6.3 && c.y < 2.5 && Math.abs(c.x - 3.5) > 1);
    expect(posts.length).toBeGreaterThan(0);
    for (const c of posts) {
      expect(c.v).toBeGreaterThan(0);
      expect(c.v).toBeLessThan(3);
    }
    const selectors = new Set([...corners(parts.dress!)].map((c) => c.u));
    expect([...selectors].sort()).toEqual([0, 1]);
  });
});

describe('Kiln farmhouse on its pad', () => {
  // The pad is flat, so the house's y = 0 is the terrain. A floor whose top is
  // also y = 0 fights the ground for depth through every opening; the recipe
  // stands the ground floor one step (FLOOR_LIFT, 0.15 m) above it.
  const DECK = 0.15;

  /** Heights of the upward faces of one band set inside an x/z window, below 0.3 m. */
  const upward = (part: { positions: Float32Array; normals: Float32Array }, inside: (x: number, z: number) => boolean): number[] => {
    const out: number[] = [];
    for (let i = 0; i < part.positions.length / 3; i++) {
      const [x, y, z] = [part.positions[i * 3]!, part.positions[i * 3 + 1]!, part.positions[i * 3 + 2]!];
      if (part.normals[i * 3 + 1]! > 0.99 && y < 0.3 && inside(x, z)) out.push(y);
    }
    return out;
  };

  it('stands the hall floor a step above the pad, with the walls still on it', async () => {
    const { parts } = await parsed();
    // The slab's top corners sit on the walls' centrelines.
    const deck = upward(parts.timber!, (x, z) => Math.abs(x) <= 9.31 && Math.abs(z) <= 4.31);
    expect(deck.length).toBeGreaterThan(0);
    expect(Math.min(...deck)).toBeCloseTo(DECK, 4);

    let foot = Infinity;
    for (let i = 1; i < parts.wall!.positions.length; i += 3) foot = Math.min(foot, parts.wall!.positions[i]!);
    expect(foot).toBeCloseTo(0, 4);
  });

  // The grass bake cuts the house's footprint from plan.ts, which repeats the
  // recipe's numbers; this is where a drift between the two would show.
  it('touches the ground only inside the footprint the grass bake cuts', async () => {
    const { parts } = await parsed();
    const outside: string[] = [];
    for (const [surface, part] of Object.entries(parts)) {
      for (let i = 0; i < part.positions.length / 3; i++) {
        const [x, y, z] = [part.positions[i * 3]!, part.positions[i * 3 + 1]!, part.positions[i * 3 + 2]!];
        if (y > 0.3) continue;
        const walls = Math.abs(x) <= KILN_ROOF.length / 2 + 1e-3 && Math.abs(z) <= KILN_ROOF.width / 2 + 1e-3;
        const porch =
          Math.abs(x - KILN_PORCH.across) <= KILN_PORCH.half + 1e-3 &&
          z <= -KILN_ROOF.width / 2 + 1e-3 &&
          z >= -KILN_ROOF.width / 2 - KILN_PORCH.depth - 1e-3;
        if (!walls && !porch) outside.push(`${surface} (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
      }
    }
    expect(outside).toEqual([]);
  });

  it('finishes the step, both thresholds and the deck at one level', async () => {
    const { parts } = await parsed();
    // Front: the porch step and the threshold stone, x 2.25..4.75, z -5.3..-3.94.
    const front = upward(parts.dress!, (x, z) => x > 2 && x < 5 && z < -3.9 && z > -5.4);
    // Back: the new sill in the back door's reveal, x -5.78..-4.42.
    const back = upward(parts.dress!, (x, z) => x > -6 && x < -4.2 && z > 3.9 && z < 4.6);
    for (const tops of [front, back]) {
      expect(tops.length).toBeGreaterThan(0);
      for (const y of tops) expect(y).toBeCloseTo(DECK, 4);
    }
  });
});

describe('Kiln farmhouse outline envelope', () => {
  // KILN_ROOF is a hand copy of the recipe's roof. Its eave once stood past the
  // slab and its underside hung 0.26 m below the eave, and the outline drew
  // that as a dark ledge under both long eaves. The envelope has to stay inside
  // the slab it outlines, measured from the bake rather than from the copy.
  it('keeps the hull eave on the slab, not under or outside it', async () => {
    const { parts } = await parsed();
    const roof = parts.roof!;
    let slabLow = Infinity;
    let slabOut = 0;
    for (let i = 0; i < roof.positions.length / 3; i++) {
      const [y, z] = [roof.positions[i * 3 + 1]!, roof.positions[i * 3 + 2]!];
      // The main slabs only: the porch roof is over the door, far below. The
      // slab is a box, so its vertices are its corners, at the verge ends.
      if (Math.abs(z) < 4 || y < 4) continue;
      slabLow = Math.min(slabLow, y);
      slabOut = Math.max(slabOut, Math.abs(z));
    }
    const shell = new Shell();
    roofHull(shell, stand(0, 0, 0, 0), KILN_ROOF);
    const hull = shell.build()!.getAttribute('position');
    let hullLow = Infinity;
    let hullOut = 0;
    for (let i = 0; i < hull.count; i++) {
      hullLow = Math.min(hullLow, hull.getY(i));
      hullOut = Math.max(hullOut, Math.abs(hull.getZ(i)));
    }
    expect(hullLow).toBeGreaterThan(slabLow - 0.01);
    expect(hullOut).toBeLessThan(slabOut);
  });
});

describe('Kiln farmhouse in the cluster', () => {
  it('keeps the draw count and puts the house on the procedural pad', async () => {
    const kiln = await parsed();
    const procedural = buildFarmhouse(flat);
    const welded = buildFarmhouse(flat, kiln);
    expect(Object.keys(welded.geometry).sort()).toEqual(Object.keys(procedural.geometry).sort());

    // The walls buffer held only the house and the wing, so it becomes the Kiln
    // limewash exactly; every other buffer gains the baked triangles on top of
    // what the barn and the log stack already put in it.
    const count = (g: typeof welded.geometry, key: keyof typeof welded.geometry): number =>
      g[key].getAttribute('position').count;
    expect(count(welded.geometry, 'wall')).toBe(vertices(kiln.parts.wall!.positions));
    expect(count(welded.geometry, 'barn')).toBe(count(procedural.geometry, 'barn'));
    expect(count(welded.geometry, 'smoke')).toBe(count(procedural.geometry, 'smoke'));

    // Placed with the cluster: the wall's bounds centre on the pad.
    const sphere = welded.geometry.wall.boundingSphere!;
    expect(Math.hypot(sphere.center.x - HOUSE_AT.x, sphere.center.z - HOUSE_AT.z)).toBeLessThan(2);
    expect(welded.level).toBe(LEVEL);
  });

  it('starts the smoke at the baked stack, not the procedural one', async () => {
    const kiln = await parsed();
    const smoke = (kiln_: KilnHouse | null): number[] => {
      const geometry = buildFarmhouse(flat, kiln_).geometry.smoke;
      const p = geometry.getAttribute('position');
      return [p.getX(0), p.getY(0), p.getZ(0)];
    };
    const baked = smoke(kiln);
    const authored = smoke(null);
    expect(baked).not.toEqual(authored);
    const sin = Math.sin(1.1);
    const cos = Math.cos(1.1);
    const { x, y, z } = KILN_STACK.mouth;
    expect(baked[0]).toBeCloseTo(HOUSE_AT.x + x * cos + z * sin, 4);
    expect(baked[1]).toBeCloseTo(LEVEL + y, 4);
    expect(baked[2]).toBeCloseTo(HOUSE_AT.z - x * sin + z * cos, 4);
  });
});
