// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Original procedural foliage source, geometry and release contracts. */

import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
  ACTIVE_SOURCED_CROWN,
  buildCrownGeometry,
  buildSourcedWoodGeometry,
  sourcedCrownReceipt,
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
    readonly page: string;
    readonly archive: string;
    readonly archiveSha256: string;
    readonly archiveBytes: number;
    readonly license: string;
    readonly licenseSnapshot: string;
    readonly source: string;
    readonly materialSource: string;
    readonly sha256: string;
    readonly materialSha256: string;
    readonly generated: string;
    readonly foliageTriangles: number;
    readonly woodTriangles: number;
    readonly foliageTuck: number;
  }[];
  readonly recipe: {
    readonly assembly: string;
    readonly authoring: string;
    readonly contactSheet: string;
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

describe('sourced CC0 foliage chain', () => {
  it('pins the complete AGPL and CC0 authoring chain in the repository', () => {
    expect(source.version).toBe(6);
    expect(source.id).toBe('sourced-fox-hybrid-family-v1');
    expect(source.license).toBe('AGPL-3.0-or-later');
    expect(source.runtime).toBe('baked-source-geometry-threejs-tsl');
    expect(source.activeCandidate).toBe(ACTIVE_SOURCED_CROWN);
    expect(source.sources.map((entry) => entry.id)).toEqual([
      'fox-broad-spreading',
      'fox-natural-round',
    ]);
    expect(source.sources.every((entry) => entry.license === 'CC0-1.0')).toBe(true);
    for (const path of [
      source.placement,
      source.recipe.assembly,
      source.recipe.authoring,
      source.recipe.contactSheet,
      ...source.sources.flatMap((entry) => [
        entry.source,
        entry.materialSource,
        entry.licenseSnapshot,
        entry.generated,
      ]),
      ...source.recipe.geometry,
      ...source.recipe.materials,
    ]) expect(existsSync(join(repo, ...path.split('/')))).toBe(true);
    expect(source.families.trees.map((family) => family.name)).toEqual([
      'fox-broad',
      'fox-compact',
      'fox-balanced',
      'fox-leaning',
    ]);
    expect(source.families.shrubs.map((family) => family.name)).toEqual([
      'hawthorn',
      'blackthorn',
    ]);
  });

  it('builds finite, grounded geometry at the committed triangle budget', () => {
    const crown = buildCrownGeometry();
    const shrub = buildShrubGeometry();
    const trunk = buildSourcedWoodGeometry();
    for (const geometry of [crown, shrub, trunk]) expectValidGeometry(geometry);

    expect(triangleCount(crown)).toBe(source.geometry.crownTriangles);
    expect(triangleCount(shrub)).toBe(source.geometry.shrubTriangles);
    expect(triangleCount(trunk)).toBe(source.geometry.trunkTriangles);
    const crownParts = crown.getAttribute('crownPart');
    expect(crownParts).toBeDefined();
    expect(new Set(Array.from({ length: crownParts.count }, (_, index) => (
      crownParts.getX(index)
    )))).toEqual(new Set([0, 1, 2]));
    expect(crown.boundingBox!.min.y).toBeGreaterThan(0.2);
    expect(crown.boundingBox!.min.y).toBeLessThan(0.6);
    expect(shrub.boundingBox!.min.y).toBeCloseTo(0, 5);
    expect(trunk.boundingBox!.min.y).toBeCloseTo(0, 5);
    expect(crown.boundingBox!.max.y).toBeLessThanOrEqual(1);
    expect(crown.boundingBox!.max.y).toBeGreaterThan(0.8);
    expect(shrub.boundingBox!.max.y).toBeCloseTo(1, 5);
    expect(trunk.boundingBox!.max.y).toBeGreaterThan(0.5);
    expect(trunk.boundingBox!.max.y).toBeLessThanOrEqual(1);

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
    expect(CANOPY_FAMILY_STARTS).toEqual([85, 107, 168]);
    expect(CANOPY_FAMILY_STARTS.map((start) => placement.canopies[start]!.family)).toEqual([1, 2, 3]);
    expect(placement.canopies).toHaveLength(source.field.treeInstances);
    expect(placement.shrubs).toHaveLength(source.field.shrubInstances);
    expect(placement.canopies).toHaveLength(source.field.woodInstances);
    expect(source.field.draws).toBe(3);
    expect(source.field.textures).toBe(0);
    expect(source.field.externalModels).toBe(0);
    expect(source.field.sourceModels).toBe(2);

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

  it('matches the active source receipt and preserves the authored hybrid family', () => {
    const receipt = sourcedCrownReceipt();
    expect(receipt.id).toBe(source.activeCandidate);
    expect(receipt.foliageTriangles).toBe(source.geometry.crownTriangles);
    expect(receipt.woodTriangles).toBe(source.geometry.trunkTriangles);
    expect(receipt.foliageSource).toBe(source.sources[0]!.source);
    expect(receipt.woodSource).toBe(source.sources[1]!.source);
    for (const candidate of source.sources) {
      expect(candidate.foliageTriangles).toBeGreaterThan(0);
      expect(candidate.woodTriangles).toBeGreaterThan(0);
      expect(candidate.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(candidate.materialSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(candidate.archiveSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(candidate.archiveBytes).toBe(3_444_385);
      expect(createHash('sha256').update(readFileSync(join(repo, candidate.source))).digest('hex'))
        .toBe(candidate.sha256);
      expect(createHash('sha256').update(readFileSync(join(repo, candidate.materialSource))).digest('hex'))
        .toBe(candidate.materialSha256);
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
