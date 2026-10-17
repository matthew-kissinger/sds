// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/** The Kiln oak: how the baked GLB becomes the treeline's two instanced roles. */

import { readFileSync } from 'node:fs';
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { CANOPY_ATTRIBUTE_SIZE } from '@app/scene/treeline/canopyMaterial';
import {
  CROWN_FILL,
  CROWN_SWELL,
  kilnTreeGeometry,
  parseKilnTree,
  type KilnTree,
  type KilnTreePart,
} from '@app/scene/treeline/kilnTree';
import { hazeHue, makeKilnBarkMaterial, makeKilnLeafMaterial } from '@app/scene/treeline/kilnTreeMaterials';
import { PALETTE } from '@app/tsl/palette';
import { TREE_SOURCE } from '@app/scene/treeline/source';
import { TRUNK_ATTRIBUTE_SIZE } from '@app/scene/treeline/trunkMaterial';

const GLB = new URL('../assets/treeline/kiln/oak.glb', import.meta.url);
const LEDGER = new URL('../assets/treeline/kiln/asset-manifest.json', import.meta.url);
const PLACEMENT = new URL('../assets/treeline/manifest.json', import.meta.url);

function bytesOf(url: URL): ArrayBuffer {
  const bytes = readFileSync(url);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

let cached: Promise<KilnTree> | null = null;
/** Parsed once: every test below reads the same bake and none of them edits it. */
function parsed(): Promise<KilnTree> {
  cached ??= parseKilnTree(bytesOf(GLB));
  return cached;
}

interface GltfJson {
  nodes: { name?: string; children?: number[]; extras?: Record<string, unknown> }[];
  meshes: { name?: string; primitives: { attributes: Record<string, number> }[] }[];
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

const mesh = (json: GltfJson, name: string) => json.meshes.find((entry) => entry.name === name)!;
const vertices = (part: KilnTreePart): number => part.positions.length / 3;
const triangles = (part: KilnTreePart): number => part.index.length / 3;

function bounds(parts: readonly KilnTreePart[]): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) {
    for (let i = 0; i < part.positions.length; i++) {
      min[i % 3] = Math.min(min[i % 3]!, part.positions[i]!);
      max[i % 3] = Math.max(max[i % 3]!, part.positions[i]!);
    }
  }
  return { min, max };
}

function expectUnit(directions: Float32Array): void {
  for (let i = 0; i < directions.length; i += 3) {
    expect(Math.hypot(directions[i]!, directions[i + 1]!, directions[i + 2]!)).toBeCloseTo(1, 4);
  }
}

describe('Kiln oak import', () => {
  it('names a source the game can draw', () => {
    expect(['procedural', 'kiln']).toContain(TREE_SOURCE);
  });

  it('gathers the one variant into a leaf crown and bark wood', async () => {
    const kiln = await parsed();
    expect(kiln.variants.map(({ name }) => name)).toEqual(['spreading']);
    expect(kiln.sourceNodes).toBe(2);
    const { crown, wood } = kiln.variants[0]!;
    expect(kiln.triangles).toEqual({ crown: triangles(crown), wood: triangles(wood) });
    for (const part of [crown, wood]) {
      expect(part.normals.length).toBe(part.positions.length);
      expect(part.uvs.length / 2).toBe(vertices(part));
      expect(part.cavity.length).toBe(vertices(part));
      for (const value of [...part.positions, ...part.normals, ...part.uvs]) {
        expect(Number.isFinite(value)).toBe(true);
      }
      for (const value of part.cavity) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(Math.max(...part.index)).toBeLessThan(vertices(part));
      expectUnit(part.normals);
    }
    // The crown carries a lobe normal per vertex and a seed per cluster; the
    // wood carries neither.
    expect(crown.lobeNormals).not.toBeNull();
    expect(crown.lobeNormals!.length).toBe(crown.positions.length);
    expectUnit(crown.lobeNormals!);
    expect(wood.lobeNormals).toBeNull();
    const seeds = new Set<number>();
    for (let i = 0; i < crown.uvs.length; i += 2) {
      expect(crown.uvs[i]!).toBeGreaterThanOrEqual(0);
      expect(crown.uvs[i]!).toBeLessThan(1);
      expect(crown.uvs[i + 1]!).toBe(0);
      seeds.add(crown.uvs[i]!);
    }
    expect(seeds.size).toBeGreaterThan(40);
    expect(new Set(wood.uvs)).toEqual(new Set([0]));
  });

  it('keeps the ledger to the bake: its triangles, materials and field cost', async () => {
    const kiln = await parsed();
    const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as {
      triangles: number;
      triangleBudget: number;
      exportedMeshNodes: number;
      materials: number;
      textures: number;
      images: number;
      variants: { names: string[] };
      runtime: {
        draws: number;
        addedDraws: number;
        stands: number;
        trianglesPerRole: Record<string, number>;
        submittedTrianglesBeforeShadows: number;
      };
    };
    const stands = (JSON.parse(readFileSync(PLACEMENT, 'utf8')) as { canopies: unknown[] }).canopies.length;
    expect(ledger.runtime.trianglesPerRole).toEqual(kiln.triangles);
    expect(ledger.triangles).toBe(kiln.triangles.crown + kiln.triangles.wood);
    expect(ledger.triangles).toBeLessThanOrEqual(ledger.triangleBudget);
    expect(ledger.triangleBudget).toBe(11000);
    expect(ledger.exportedMeshNodes).toBe(kiln.sourceNodes);
    expect(ledger.materials).toBe(gltfJson().materials.length);
    expect(ledger.textures).toBe(0);
    expect(ledger.images).toBe(0);
    expect(ledger.variants.names).toEqual(kiln.variants.map(({ name }) => name));
    expect(ledger.runtime.draws).toBe(3);
    expect(ledger.runtime.addedDraws).toBe(0);
    expect(ledger.runtime.stands).toBe(stands);
    expect(ledger.runtime.submittedTrianglesBeforeShadows).toBe(ledger.triangles * stands);
  });

  it("fits the oak to the stand's unit box, leaving room for the swell", async () => {
    const { crown, wood, envelope } = (await parsed()).variants[0]!;
    const all = bounds([crown, wood]);
    const leaves = bounds([crown]);
    const reach = CROWN_FILL - CROWN_SWELL;
    // The roots' foot on the ground, the crown's top a swell under the box's.
    expect(all.min[1]!).toBeCloseTo(0, 6);
    expect(leaves.max[1]!).toBeCloseTo(1 - CROWN_SWELL, 6);
    // The crown's furthest reach either way, across and along.
    expect(Math.max(-leaves.min[0]!, leaves.max[0]!)).toBeCloseTo(reach, 6);
    expect(Math.max(-leaves.min[2]!, leaves.max[2]!)).toBeCloseTo(reach, 6);
    // No wood reaches past the leaves.
    const timber = bounds([wood]);
    for (const axis of [0, 2]) {
      expect(Math.max(-timber.min[axis]!, timber.max[axis]!)).toBeLessThan(reach);
    }
    // The envelope is the ellipsoid inside the crown's own bounds.
    for (let axis = 0; axis < 3; axis++) {
      expect(envelope.center[axis]!).toBeCloseTo((leaves.min[axis]! + leaves.max[axis]!) / 2, 6);
      expect(envelope.radii[axis]!).toBeCloseTo((leaves.max[axis]! - leaves.min[axis]!) / 2, 6);
    }
  });

  it('refuses a bake that does not record its channels, or records others', async () => {
    const unmarked = editedGlb((json) => {
      for (const node of json.nodes) delete node.extras?.treeChannels;
    });
    await expect(parseKilnTree(unmarked)).rejects.toThrow(/oak\.glb: no "treeChannels" record/);

    const newer = editedGlb((json) => {
      const record = json.nodes.find((node) => node.extras?.treeChannels !== undefined)!;
      (record.extras!.treeChannels as { version: number }).version = 2;
    });
    await expect(parseKilnTree(newer)).rejects.toThrow(/"treeChannels" is version 2/);
  });

  it('refuses a bake with no variant, or a variant without both roles', async () => {
    const unmarked = editedGlb((json) => {
      for (const node of json.nodes) delete node.extras?.treeVariant;
    });
    await expect(parseKilnTree(unmarked)).rejects.toThrow(/no node carries "treeVariant"/);

    const leafless = editedGlb((json) => {
      const variant = json.nodes.find((node) => node.extras?.treeVariant !== undefined)!;
      variant.children = variant.children!.filter((child) => json.nodes[child]!.name !== 'Mesh_Oak_Crown');
    });
    await expect(parseKilnTree(leafless)).rejects.toThrow(/variant "spreading" needs both a leaf crown and bark wood/);
  });

  it('refuses a mesh that lost a channel, naming the attribute', async () => {
    const noSeed = editedGlb((json) => {
      delete mesh(json, 'Mesh_Oak_Crown').primitives[0]!.attributes.TEXCOORD_0;
    });
    await expect(parseKilnTree(noSeed)).rejects.toThrow(/TEXCOORD_0 \(uv\)/);

    const noCavity = editedGlb((json) => {
      delete mesh(json, 'Mesh_Oak_Wood').primitives[0]!.attributes._CAVITY;
    });
    await expect(parseKilnTree(noCavity)).rejects.toThrow(/has no _CAVITY attribute/);

    const noLobes = editedGlb((json) => {
      delete mesh(json, 'Mesh_Oak_Crown').primitives[0]!.attributes.TANGENT;
    });
    await expect(parseKilnTree(noLobes)).rejects.toThrow(/crown mesh "Mesh_Oak_Crown" has no TANGENT attribute/);
  });

  it('refuses a material it has no role for', async () => {
    const renamed = editedGlb((json) => {
      json.materials.find((material) => material.name === 'leaf')!.name = 'needles';
    });
    await expect(parseKilnTree(renamed)).rejects.toThrow(/oak\.glb: unbound material "needles"/);
  });
});

describe('Kiln oak in the treeline', () => {
  it("hands each role's channels to its geometry", async () => {
    const { crown, wood } = (await parsed()).variants[0]!;
    const leaves = kilnTreeGeometry(crown);
    const timber = kilnTreeGeometry(wood);
    expect(Object.keys(leaves.attributes).sort()).toEqual(['cavity', 'lobeNormal', 'normal', 'position', 'uv']);
    expect(Object.keys(timber.attributes).sort()).toEqual(['cavity', 'normal', 'position', 'uv']);
    expect(leaves.index!.count / 3).toBe(triangles(crown));
    expect(timber.index!.count / 3).toBe(triangles(wood));
    leaves.dispose();
    timber.dispose();
  });

  it('shades each role with one opaque material, untextured', async () => {
    const { envelope } = (await parsed()).variants[0]!;
    const stands = 139;
    const matrices = new Float32Array(stands * 16);
    for (let i = 0; i < stands; i++) new THREE.Matrix4().toArray(matrices, i * 16);
    const leaf = makeKilnLeafMaterial({
      matrices,
      envelope,
      instances: new THREE.InstancedBufferAttribute(new Float32Array(stands * CANOPY_ATTRIBUTE_SIZE), CANOPY_ATTRIBUTE_SIZE),
    });
    const bark = makeKilnBarkMaterial({
      matrices,
      instances: new THREE.InstancedBufferAttribute(new Float32Array(stands * TRUNK_ATTRIBUTE_SIZE), TRUNK_ATTRIBUTE_SIZE),
    });
    for (const material of [leaf, bark]) {
      expect(material.transparent).toBe(false);
      expect(material.opacity).toBe(1);
      expect(material.alphaTest).toBe(0);
      expect(material.depthWrite).toBe(true);
      expect(material.side).toBe(THREE.FrontSide);
      expect(material.map).toBeNull();
      expect(material.colorNode).not.toBeNull();
      expect(material.positionNode).not.toBeNull();
      material.dispose();
    }
  });

  it("warms the far crown toward the haze, at the crown's own value", () => {
    // The far lean takes its colour from the fog's one source, PALETTE.skyHorizon,
    // as a hue: the haze's own proportions at unit luminance, so leaning toward
    // it warms a crown without lightening it.
    const haze = new THREE.Color(PALETTE.skyHorizon);
    const [r, g, b] = hazeHue();
    expect(r * 0.2126 + g * 0.7152 + b * 0.0722).toBeCloseTo(1, 6);
    expect(r / g).toBeCloseTo(haze.r / haze.g, 6);
    expect(g / b).toBeCloseTo(haze.g / haze.b, 6);
    // The haze is warm, so the lean is a warming: red over green over blue.
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    // No authored far tint of its own remains in the palette.
    expect(Object.keys(PALETTE)).not.toContain('oakLeafFar');
  });
});
