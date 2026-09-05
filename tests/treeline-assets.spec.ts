// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Original procedural foliage source, geometry and release contracts. */

import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import {
  makeCanopyMaterial,
  CANOPY_ATTRIBUTE_SIZE,
  CANOPY_FAMILY_STARTS,
} from '@app/scene/treeline/canopyMaterial';
import {
  ACTIVE_TREE_FAMILY,
  buildCrownGeometry,
  buildTreeWoodGeometry,
  treeGeometryReceipt,
} from '@app/scene/treeline/crownShape';
import type { TreelineManifest } from '@app/scene/treeline/manifest';
import { makeShrubMaterial, SHRUB_ATTRIBUTE_SIZE } from '@app/scene/treeline/shrubMaterial';
import { buildShrubGeometry } from '@app/scene/treeline/shrubShape';
import { makeTrunkMaterial, TRUNK_ATTRIBUTE_SIZE } from '@app/scene/treeline/trunkMaterial';
import {
  crownOutsideFenceRect,
  TREE_FENCED_RECTS,
  TREE_FENCE_SAFETY_MARGIN,
} from '@app/scene/treeline/treePlacement';

interface ProceduralFoliageManifest {
  readonly version: number;
  readonly id: string;
  readonly license: string;
  readonly runtime: string;
  readonly activeCandidate: string;
  readonly placement: string;
  readonly sources: readonly {
    readonly id: string;
    readonly author: string;
    readonly license: string;
    readonly licenseFile: string;
    readonly source: string;
    readonly sha256: string;
    readonly generated: string;
    readonly generatedSha256: string;
  }[];
  readonly recipe: {
    readonly assembly: string;
    readonly authoring: string;
    readonly geometry: readonly string[];
    readonly materials: readonly string[];
  };
  readonly families: {
    readonly trees: readonly { readonly id: number; readonly name: string }[];
    readonly shrubs: readonly { readonly id: number; readonly name: string }[];
  };
  readonly geometry: {
    readonly crownTriangles: number;
    readonly shrubTriangles: number;
    readonly trunkTriangles: number;
  };
  readonly field: {
    readonly treeInstances: number;
    readonly shrubInstances: number;
    readonly woodInstances: number;
    readonly draws: number;
    readonly submittedTrianglesBeforeShadows: number;
    readonly textures: number;
    readonly externalModels: number;
    readonly sourceModels: number;
  };
}

const repo = fileURLToPath(new URL('..', import.meta.url));
const source = JSON.parse(
  readFileSync(join(repo, 'assets', 'treeline', 'procedural-manifest.json'), 'utf8'),
) as ProceduralFoliageManifest;
const placement = JSON.parse(
  readFileSync(join(repo, 'assets', 'treeline', 'manifest.json'), 'utf8'),
) as TreelineManifest;

function triangleCount(geometry: THREE.BufferGeometry): number {
  const positions = geometry.getAttribute('position');
  return (geometry.index?.count ?? positions.count) / 3;
}

function expectValidGeometry(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  expect(positions).toBeDefined();
  expect(normals).toBeDefined();
  expect(positions.count).toBe(normals.count);
  expect(geometry.boundingBox?.isEmpty()).toBe(false);
  expect(geometry.boundingSphere?.radius).toBeGreaterThan(0);
  for (let index = 0; index < positions.count; index++) {
    for (const value of [
      positions.getX(index), positions.getY(index), positions.getZ(index),
      normals.getX(index), normals.getY(index), normals.getZ(index),
    ]) expect(Number.isFinite(value)).toBe(true);
  }
}

describe('authored sculpted foliage chain', () => {
  it('pins the complete AGPL procedural authoring chain in the repository', () => {
    expect(source.version).toBe(7);
    expect(source.id).toBe('authored-sculpted-oak-family-v1');
    expect(source.license).toBe('AGPL-3.0-or-later');
    expect(source.runtime).toBe('baked-procedural-geometry-threejs-tsl');
    expect(source.activeCandidate).toBe(ACTIVE_TREE_FAMILY);
    expect(source.sources.map((entry) => entry.id)).toEqual([
      'sculpted-oak-recipe',
    ]);
    expect(source.sources.every((entry) => entry.license === 'AGPL-3.0-or-later')).toBe(true);
    for (const path of [
      source.placement,
      source.recipe.assembly,
      source.recipe.authoring,
      ...source.sources.flatMap((entry) => [
        entry.source,
        entry.licenseFile,
        entry.generated,
      ]),
      ...source.recipe.geometry,
      ...source.recipe.materials,
    ]) expect(existsSync(join(repo, ...path.split('/')))).toBe(true);
    expect(source.families.trees.map((family) => family.name)).toEqual([
      'oak-wide',
      'oak-upright',
      'oak-balanced',
      'oak-windswept',
    ]);
    expect(source.families.shrubs.map((family) => family.name)).toEqual([
      'hawthorn',
      'blackthorn',
    ]);
  });

  it('rebuilds the authored geometry byte-for-byte without rewriting the asset', () => {
    const result = spawnSync(process.execPath, [source.recipe.authoring, '--check'], {
      cwd: repo, encoding: 'utf8', timeout: 30_000, windowsHide: true,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it('builds finite, grounded geometry at the committed triangle budget', () => {
    const crown = buildCrownGeometry();
    const shrub = buildShrubGeometry();
    const trunk = buildTreeWoodGeometry();
    for (const geometry of [crown, shrub, trunk]) expectValidGeometry(geometry);

    expect(triangleCount(crown)).toBe(source.geometry.crownTriangles);
    expect(triangleCount(shrub)).toBe(source.geometry.shrubTriangles);
    expect(triangleCount(trunk)).toBe(source.geometry.trunkTriangles);
    const crownParts = crown.getAttribute('crownPart');
    expect(crownParts).toBeDefined();
    expect(new Set(Array.from({ length: crownParts.count }, (_, index) => (
      crownParts.getX(index)
    )))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]));
    expect(crown.boundingBox!.min.y).toBeGreaterThan(0.2);
    expect(crown.boundingBox!.min.y).toBeLessThan(0.6);
    expect(shrub.boundingBox!.min.y).toBeCloseTo(0, 5);
    expect(trunk.boundingBox!.min.y).toBeCloseTo(0, 5);
    expect(crown.boundingBox!.max.y).toBeLessThanOrEqual(1);
    expect(crown.boundingBox!.max.y).toBeGreaterThan(0.8);
    expect(shrub.boundingBox!.max.y).toBeCloseTo(1, 5);
    expect(trunk.boundingBox!.max.y).toBeGreaterThan(0.5);
    expect(trunk.boundingBox!.max.y).toBeLessThanOrEqual(1);

    const woodPositions = trunk.getAttribute('position');
    const baseRadii: number[] = [];
    const lowerShaftRadii: number[] = [];
    for (let index = 0; index < woodPositions.count; index++) {
      const radius = Math.hypot(woodPositions.getX(index), woodPositions.getZ(index));
      const y = woodPositions.getY(index);
      if (y < 0.02) baseRadii.push(radius);
      else if (y < 0.08) lowerShaftRadii.push(radius);
    }
    expect(Math.max(...baseRadii)).toBeGreaterThan(Math.max(...lowerShaftRadii) * 1.05);

    crown.dispose();
    shrub.dispose();
    trunk.dispose();
  });

  it('covers every authored family with no tree-base shrubs', () => {
    expect(new Set(placement.canopies.map((tree) => tree.family))).toEqual(
      new Set(source.families.trees.map((family) => family.id)),
    );
    expect(placement.canopies.map((tree) => tree.family)).toEqual(
      placement.canopies.map((tree) => tree.family).sort((a, b) => a - b),
    );
    expect(CANOPY_FAMILY_STARTS).toEqual([57, 70, 111]);
    expect(CANOPY_FAMILY_STARTS.map((start) => placement.canopies[start]!.family)).toEqual([1, 2, 3]);
    expect(placement.canopies).toHaveLength(source.field.treeInstances);
    expect(placement.shrubs).toHaveLength(source.field.shrubInstances);
    expect(placement.canopies).toHaveLength(source.field.woodInstances);
    expect(source.field.draws).toBe(3);
    expect(source.field.textures).toBe(0);
    expect(source.field.externalModels).toBe(0);
    expect(source.field.sourceModels).toBe(0);

    const submitted = source.geometry.crownTriangles * placement.canopies.length
      + source.geometry.shrubTriangles * placement.shrubs.length
      + source.geometry.trunkTriangles * placement.canopies.length;
    expect(submitted).toBe(source.field.submittedTrianglesBeforeShadows);
    expect(submitted).toBeLessThan(400_000);

    const hero = placement.canopies.find((tree) => tree.belt === 3);
    expect(hero).toBeDefined();
    expect(hero!.x).toBeCloseTo(66.4, 1);
    expect(hero!.z).toBeCloseTo(111.2, 1);
    expect(hero!.width).toBeCloseTo(12.8, 3);
    expect(hero!.height).toBeCloseTo(8, 3);
    expect(placement.shrubs).toHaveLength(0);
    expect(placement.trunks.filter((trunk) => (
      trunk.treeId === hero!.treeId && trunk.terminal === 0
    )).length).toBeGreaterThanOrEqual(2);

    const ratios = new Map<number, number[]>();
    for (const crown of placement.canopies.filter((tree) => tree.belt !== 3)) {
      const family = ratios.get(crown.family) ?? [];
      family.push(crown.width / crown.height);
      ratios.set(crown.family, family);
    }
    const median = (family: number) => {
      const values = ratios.get(family)!.sort((a, b) => a - b);
      return values[Math.floor(values.length / 2)]!;
    };
    expect(median(0)).toBeGreaterThan(1.9);
    expect(median(1)).toBeGreaterThan(1.4);
    expect(median(1)).toBeLessThan(1.8);
    expect(median(2)).toBeGreaterThan(1.7);
    expect(median(2)).toBeLessThan(2);
    expect(median(3)).toBeGreaterThan(2);

  });

  it('keeps every full tree envelope outside both fenced pastures', () => {
    expect(TREE_FENCE_SAFETY_MARGIN).toBeGreaterThanOrEqual(1.5);
    for (const crown of placement.canopies) {
      for (const rect of TREE_FENCED_RECTS) {
        expect(
          crownOutsideFenceRect(crown, rect),
          `tree ${crown.treeId} belt ${crown.belt} overlaps ${JSON.stringify(rect)}`,
        ).toBe(true);
      }
    }
  });

  it('leaves visible air between every pair of crowns in the same belt', () => {
    for (let left = 0; left < placement.canopies.length; left++) {
      const a = placement.canopies[left]!;
      for (let right = left + 1; right < placement.canopies.length; right++) {
        const b = placement.canopies[right]!;
        if (a.belt !== b.belt) continue;
        const distance = Math.hypot(a.x - b.x, a.z - b.z);
        const required = Math.max(a.width, a.depth) * 0.5
          + Math.max(b.width, b.depth) * 0.5
          + 2.45;
        expect(distance, `crowns ${a.treeId}/${b.treeId} are crowded`).toBeGreaterThanOrEqual(required);
      }
    }
  });

  it('matches the active recipe receipt and verifies both source and generated digests', () => {
    const receipt = treeGeometryReceipt();
    expect(receipt.id).toBe(source.activeCandidate);
    expect(receipt.foliageTriangles).toBe(source.geometry.crownTriangles);
    expect(receipt.woodTriangles).toBe(source.geometry.trunkTriangles);
    expect(receipt.recipe).toBe(source.recipe.authoring);
    expect(receipt.recipeSha256).toBe(source.sources[0]!.sha256);
    expect(receipt.license).toBe(source.license);
    for (const candidate of source.sources) {
      expect(candidate.author).toBe('Matthew Kissinger');
      expect(candidate.licenseFile).toBe('LICENSE');
      expect(candidate.source).toBe('tools/bake-sculpted-trees.mjs');
      expect(candidate.generated).toBe('assets/treeline/sculpted-oak-family.json');
      for (const [path, digest] of [
        [candidate.source, candidate.sha256],
        [candidate.generated, candidate.generatedSha256],
      ] as const) {
        expect(digest).toMatch(/^[a-f0-9]{64}$/);
        expect(createHash('sha256').update(readFileSync(join(repo, path))).digest('hex'))
          .toBe(digest);
      }
    }
  });

  it('uses one opaque TSL material per foliage role', () => {
    const canopy = makeCanopyMaterial({
      instances: new THREE.InstancedBufferAttribute(
        new Float32Array(CANOPY_ATTRIBUTE_SIZE),
        CANOPY_ATTRIBUTE_SIZE,
      ),
    });
    const shrub = makeShrubMaterial({
      instances: new THREE.InstancedBufferAttribute(
        new Float32Array(SHRUB_ATTRIBUTE_SIZE),
        SHRUB_ATTRIBUTE_SIZE,
      ),
    });
    const trunk = makeTrunkMaterial({
      instances: new THREE.InstancedBufferAttribute(
        new Float32Array(TRUNK_ATTRIBUTE_SIZE),
        TRUNK_ATTRIBUTE_SIZE,
      ),
    });
    for (const material of [canopy, shrub, trunk]) {
      expect(material.transparent).toBe(false);
      expect(material.opacity).toBe(1);
      expect(material.depthWrite).toBe(true);
      expect(material.colorNode).not.toBeNull();
      material.dispose();
    }
  });

  it('keeps external model loading outside the runtime entrypoints', () => {
    const runtime = [
      readFileSync(join(repo, 'app', 'src', 'scene', 'FieldScene.tsx'), 'utf8'),
      readFileSync(join(repo, 'app', 'src', 'scene', 'Treeline.tsx'), 'utf8'),
    ].join('\n');
    expect(runtime).not.toContain('foliageAssets');
    expect(runtime).not.toMatch(/GLTFLoader|\.glb/);
  });
});
