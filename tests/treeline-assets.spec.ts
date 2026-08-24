// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Original procedural foliage source, geometry and release contracts. */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import {
  makeCanopyMaterial,
  CANOPY_ATTRIBUTE_SIZE,
  CANOPY_FAMILY_STARTS,
} from '@app/scene/treeline/canopyMaterial';
import { buildCrownGeometry } from '@app/scene/treeline/crownShape';
import type { TreelineManifest } from '@app/scene/treeline/manifest';
import { makeShrubMaterial, SHRUB_ATTRIBUTE_SIZE } from '@app/scene/treeline/shrubMaterial';
import { buildShrubGeometry } from '@app/scene/treeline/shrubShape';
import { makeTrunkMaterial, TRUNK_ATTRIBUTE_SIZE } from '@app/scene/treeline/trunkMaterial';
import { buildTrunkGeometry } from '@app/scene/treeline/trunkShape';

interface ProceduralFoliageManifest {
  readonly version: number;
  readonly id: string;
  readonly license: string;
  readonly runtime: string;
  readonly placement: string;
  readonly concept: {
    readonly path: string;
    readonly provenance: string;
    readonly runtime: boolean;
  };
  readonly recipe: {
    readonly assembly: string;
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

describe('original procedural foliage source chain', () => {
  it('pins an AGPL source ledger whose complete recipe is in the repository', () => {
    expect(source.version).toBe(3);
    expect(source.id).toBe('original-procedural-v3');
    expect(source.license).toBe('AGPL-3.0-or-later');
    expect(source.runtime).toBe('procedural-threejs-tsl');
    expect(source.concept.runtime).toBe(false);
    for (const path of [
      source.placement,
      source.concept.path,
      source.concept.provenance,
      source.recipe.assembly,
      ...source.recipe.geometry,
      ...source.recipe.materials,
    ]) expect(existsSync(join(repo, ...path.split('/')))).toBe(true);
    expect(source.families.trees.map((family) => family.name)).toEqual([
      'broad-rooted-oak',
      'rounded-elm',
      'airy-ash',
      'field-oak',
    ]);
    expect(source.families.shrubs.map((family) => family.name)).toEqual([
      'hawthorn',
      'blackthorn',
    ]);
  });

  it('builds finite, grounded geometry at the committed triangle budget', () => {
    const crown = buildCrownGeometry();
    const shrub = buildShrubGeometry();
    const trunk = buildTrunkGeometry();
    for (const geometry of [crown, shrub, trunk]) expectValidGeometry(geometry);

    expect(triangleCount(crown)).toBe(source.geometry.crownTriangles);
    expect(triangleCount(shrub)).toBe(source.geometry.shrubTriangles);
    expect(triangleCount(trunk)).toBe(source.geometry.trunkTriangles);
    const crownParts = crown.getAttribute('crownPart');
    expect(crownParts).toBeDefined();
    expect(new Set(Array.from({ length: crownParts.count }, (_, index) => (
      crownParts.getX(index)
    )))).toEqual(new Set([0, 1, 2]));
    expect(crown.boundingBox!.min.y).toBeCloseTo(0, 5);
    expect(shrub.boundingBox!.min.y).toBeCloseTo(0, 5);
    expect(trunk.boundingBox!.min.y).toBeCloseTo(0, 5);
    expect(crown.boundingBox!.max.y).toBeCloseTo(1, 5);
    expect(shrub.boundingBox!.max.y).toBeCloseTo(1, 5);
    expect(trunk.boundingBox!.max.y).toBeCloseTo(1, 5);

    crown.dispose();
    shrub.dispose();
    trunk.dispose();
  });

  it('covers every authored family and preserves the four-draw field budget', () => {
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
    expect(placement.trunks).toHaveLength(source.field.woodInstances);
    expect(source.field.draws).toBe(4);
    expect(source.field.textures).toBe(0);
    expect(source.field.externalModels).toBe(0);

    const submitted = source.geometry.crownTriangles * placement.canopies.length
      + source.geometry.shrubTriangles * placement.shrubs.length
      + source.geometry.trunkTriangles * placement.trunks.length;
    expect(submitted).toBe(source.field.submittedTrianglesBeforeShadows);
    expect(submitted).toBeLessThan(400_000);

    const hero = placement.canopies.find((tree) => tree.belt === 3);
    expect(hero).toBeDefined();
    expect(hero!.x).toBeCloseTo(1.4, 1);
    expect(hero!.z).toBeCloseTo(27.2, 1);
    expect(hero!.width).toBeCloseTo(15.675, 3);
    expect(hero!.height).toBeCloseTo(7.6, 3);
    expect(hero!.width / hero!.height).toBeGreaterThan(1.7);
    expect(placement.shrubs.filter((shrub) => shrub.belt === 3)).toHaveLength(3);
    expect(placement.shrubs.filter((shrub) => shrub.tint < 0)).toHaveLength(3);
    expect(placement.trunks.filter((trunk) => (
      trunk.treeId === hero!.treeId && trunk.terminal === 0
    )).length).toBeGreaterThanOrEqual(9);

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
    expect(median(0)).toBeGreaterThan(1.8);
    expect(median(1)).toBeLessThan(0.7);
    expect(median(2)).toBeGreaterThan(1);
    expect(median(2)).toBeLessThan(1.55);
    expect(median(3)).toBeGreaterThan(2);
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
