// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import { bandedBaseColors } from '../app/src/scene/farmhouse/bands';
import {
  makeBarnMaterial,
  makeDressMaterial,
  makeTimberMaterial,
  makeWallMaterial,
} from '../app/src/scene/farmhouse/materials';
import {
  BARN,
  BARN_ROOF,
  DRESS,
  MASONRY,
  ROOF,
  TIMBER,
  WALL,
  WALL_PATCH,
  type BandSet,
} from '../app/src/scene/farmhouse/palette';
import { makeRoofMaterial } from '../app/src/scene/farmhouse/roofMaterial';
import type { FarmhouseSurfaceParameters } from '../app/src/scene/farmhouse/surfaceMaterial';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const USER_DATA_PATH = 'userData.farmhouseSurface';

function parameters(material: ReturnType<typeof makeWallMaterial>): FarmhouseSurfaceParameters {
  return material.userData.farmhouseSurface as FarmhouseSurfaceParameters;
}

function expectBands(actual: FarmhouseSurfaceParameters['primary'], target: BandSet): void {
  const expected = bandedBaseColors(target);
  expect(actual.shade.toArray()).toEqual(expected.shade.toArray());
  expect(actual.body.toArray()).toEqual(expected.body.toArray());
  expect(actual.key.toArray()).toEqual(expected.key.toArray());
}

function parameterLeafPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  const typed = value as { isColor?: boolean; isVector2?: boolean; isVector3?: boolean };
  if (typed.isColor || typed.isVector2 || typed.isVector3) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    parameterLeafPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('farmhouse opaque surface shader template', () => {
  it('keeps the shared graph free of MaterialX helper-library noise', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../app/src/scene/farmhouse/surfaceMaterial.ts', import.meta.url)),
      'utf8',
    );
    expect(source).not.toContain('mx_noise_float');
    expect(source).toContain('function paintedField(');
    expect(source.match(/const (?:first|second) = sin\(/g)).toHaveLength(2);
    expect(source).not.toContain('const third = sin(');
  });

  it('shares one complete node graph and cache key across all five materials', () => {
    const materials = [
      makeWallMaterial(-0.608),
      makeRoofMaterial(),
      makeBarnMaterial(),
      makeTimberMaterial(),
      makeDressMaterial(),
    ];

    try {
      expect(new Set(materials.map((material) => material.colorNode)).size).toBe(1);
      expect(new Set(materials.map((material) => material.customProgramCacheKey())).size).toBe(1);

      const references = new Set<string>();
      materials[0]!.colorNode!.traverse((node) => {
        const reference = node as unknown as {
          isMaterialReferenceNode?: boolean;
          property?: string;
        };
        if (reference.isMaterialReferenceNode && reference.property) {
          references.add(reference.property);
        }
      });
      const reachable = parameterLeafPaths(parameters(materials[0]!))
        .map((path) => `${USER_DATA_PATH}.${path}`)
        .sort();
      expect([...references].sort()).toEqual(reachable);
    } finally {
      for (const material of materials) material.dispose();
    }
  });

  it('keeps every authored palette and treatment value in the referenced presets', () => {
    const wallMaterial = makeWallMaterial(-0.608);
    const roofMaterial = makeRoofMaterial();
    const barnMaterial = makeBarnMaterial();
    const timberMaterial = makeTimberMaterial();
    const dressMaterial = makeDressMaterial();

    try {
      const wall = parameters(wallMaterial);
      expectBands(wall.primary, WALL);
      expectBands(wall.secondary, WALL_PATCH);
      expect(wall.basePatch.scale.toArray()).toEqual([0.62, 0.2, 0.62]);
      expect([wall.basePatch.threshold, wall.basePatch.edge, wall.basePatchWeight]).toEqual([
        0.3,
        0.012,
        1,
      ]);
      expect([wall.eaveBand, wall.eaveEdge, wall.eaveGain]).toEqual([0.46, 0.06, 0.79]);
      expect([wall.wallLevel, wall.dampCourse, wall.dampEdge, wall.dampGain]).toEqual([
        -0.608,
        0.66,
        0.07,
        0.93,
      ]);

      const roof = parameters(roofMaterial);
      expectBands(roof.primary, ROOF);
      expectBands(roof.secondary, BARN_ROOF);
      expect(roof.detailOne.scale.toArray()).toEqual([0.07, 0.62, 0.07]);
      expect([
        roof.detailOne.threshold,
        roof.detailOne.edge,
        roof.detailOne.low,
        roof.detailOne.high,
        roof.baseUvWeight,
        roof.roofWeight,
      ]).toEqual([0.3, 0.02, 1, 0.93, 1, 1]);
      expect([
        roof.roofCoursePitch,
        roof.roofCourseHalf,
        roof.roofCourseEdge,
        roof.roofCourseDrop,
        roof.roofCourseWander,
      ]).toEqual([0.95, 0.075, 0.03, 0.79, 0.16]);
      expect(roof.roofEaveEdges.toArray()).toEqual([0.9, 1.45]);
      expect(roof.roofRidgeEdges.toArray()).toEqual([2.6, 3.2]);
      expect(roof.roofAtEave.toArray()).toEqual([0.85, 0.86, 0.92]);
      expect(roof.roofAtMid.toArray()).toEqual([0.94, 0.945, 0.975]);
      expect(roof.roofAtRidge.toArray()).toEqual([1, 0.99, 0.97]);

      const barn = parameters(barnMaterial);
      expectBands(barn.primary, BARN);
      expect(barn.detailOne.scale.toArray()).toEqual([0.72, 0.05, 0.72]);
      expect(barn.detailTwo.scale.toArray()).toEqual([0.14, 0.1, 0.14]);
      expect([
        barn.detailOne.threshold,
        barn.detailOne.edge,
        barn.detailOne.low,
        barn.detailOne.high,
        barn.detailTwo.threshold,
        barn.detailTwo.edge,
        barn.detailTwo.low,
        barn.detailTwo.high,
        barn.eaveGain,
      ]).toEqual([0, 0.012, 0.9, 1, 0.28, 0.02, 1, 0.95, 0.82]);

      const timber = parameters(timberMaterial);
      expectBands(timber.primary, TIMBER);
      expect(timber.detailOne.scale.toArray()).toEqual([0.85, 0.04, 0.85]);
      expect(timber.detailTwo.scale.toArray()).toEqual([0.18, 0.12, 0.18]);
      expect([
        timber.detailOne.threshold,
        timber.detailOne.edge,
        timber.detailOne.low,
        timber.detailOne.high,
        timber.detailTwo.threshold,
        timber.detailTwo.edge,
        timber.detailTwo.low,
        timber.detailTwo.high,
        timber.eaveGain,
      ]).toEqual([0, 0.012, 0.88, 1, 0.26, 0.02, 1, 0.94, 0.84]);

      const dress = parameters(dressMaterial);
      expectBands(dress.primary, DRESS);
      expectBands(dress.secondary, MASONRY);
      expect(dress.detailOne.scale.toArray()).toEqual([0.42, 0.42, 0.42]);
      expect([
        dress.detailOne.threshold,
        dress.detailOne.edge,
        dress.detailOne.low,
        dress.detailOne.high,
        dress.baseUvWeight,
        dress.stoneWeight,
        dress.stoneCourse,
        dress.stoneJointStart,
        dress.stoneJointEnd,
        dress.stoneJointGain,
      ]).toEqual([0.18, 0.02, 0.95, 1.04, 1, 1, 0.5, 0.42, 0.455, 0.86]);
    } finally {
      wallMaterial.dispose();
      roofMaterial.dispose();
      barnMaterial.dispose();
      timberMaterial.dispose();
      dressMaterial.dispose();
    }
  });
});
