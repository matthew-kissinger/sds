// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Deterministic world-placement and treeline structural contracts. */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ScatterManifest } from '@app/scene/scatter/manifest';
import { measureTreeline } from '@app/scene/treeline/diagnostics';
import type { TreelineManifest } from '@app/scene/treeline/manifest';
import { decodeHeightfield } from '@app/world/heightfieldSampler';

const repo = fileURLToPath(new URL('..', import.meta.url));
const committedTreeline = join(repo, 'assets', 'treeline', 'manifest.json');
const committedScatter = join(repo, 'assets', 'scatter', 'manifest.json');
const treeline = JSON.parse(readFileSync(committedTreeline, 'utf8')) as TreelineManifest;
const scatter = JSON.parse(readFileSync(committedScatter, 'utf8')) as ScatterManifest;
const terrainManifest = JSON.parse(
  readFileSync(join(repo, 'assets', 'terrain', 'manifest.json'), 'utf8'),
);
const terrainBytes = readFileSync(join(repo, 'assets', 'terrain', 'heightfield.bin'));
const terrain = decodeHeightfield(
  terrainBytes.buffer.slice(
    terrainBytes.byteOffset,
    terrainBytes.byteOffset + terrainBytes.byteLength,
  ),
  terrainManifest,
);

describe('world placement bake', () => {
  let rebaked: string;

  beforeAll(() => {
    rebaked = mkdtempSync(join(tmpdir(), 'herd-placement-bake-'));
    execFileSync(process.execPath, [join(repo, 'tools', 'bake-world-placement.mjs'), '--out', rebaked], {
      cwd: repo,
      stdio: 'pipe',
    });
  }, 60_000);

  afterAll(() => {
    if (rebaked) rmSync(rebaked, { recursive: true, force: true });
  });

  it('reproduces both committed manifests byte for byte', () => {
    expect(readFileSync(join(rebaked, 'treeline', 'manifest.json'), 'utf8')).toBe(
      readFileSync(committedTreeline, 'utf8'),
    );
    expect(readFileSync(join(rebaked, 'scatter', 'manifest.json'), 'utf8')).toBe(
      readFileSync(committedScatter, 'utf8'),
    );
  });
});

describe('committed treeline structure', () => {
  it('stores exactly one rooted tree placement with no tree-base shrubs', () => {
    const treeIds = new Set<number>();
    for (const crown of treeline.canopies) {
      expect(crown.support).toBe(crown.treeId);
      expect(crown.treeId).toBeGreaterThanOrEqual(0);
      expect(crown.treeId).toBeLessThan(treeline.trunks.length);
      expect(treeline.trunks[crown.treeId]!.parent).toBe(-1);
      expect(treeIds.has(crown.treeId)).toBe(false);
      treeIds.add(crown.treeId);
    }
    expect(treeline.canopies.length).toBeGreaterThanOrEqual(125);
    expect(treeline.canopies.length).toBeLessThanOrEqual(150);
    expect(treeline.shrubs).toHaveLength(0);
  });

  it('measures sunk trunks and ring coverage without root clutter', () => {
    const receipt = measureTreeline(treeline, terrain);
    expect(receipt.treeGroundErrorMax).toBeLessThanOrEqual(0.05);
    expect(receipt.treeCanopyInstancesMax).toBe(1);
    expect(receipt.treeSingleCanopyViolations).toBe(0);
    expect(receipt.treeRootedCrownCount).toBe(treeline.canopies.length);
    expect(receipt.treeBeltCounts[0]).toBeGreaterThanOrEqual(52);
    expect(receipt.treeBeltCounts[0]).toBeLessThanOrEqual(68);
    expect(receipt.treeBeltCounts[1]).toBeGreaterThanOrEqual(32);
    expect(receipt.treeBeltCounts[1]).toBeLessThanOrEqual(46);
    expect(receipt.treeBeltCounts[2]).toBeGreaterThanOrEqual(32);
    expect(receipt.treeBeltCounts[2]).toBeLessThanOrEqual(46);
    for (const spacing of receipt.treeNearestNeighborMin) expect(spacing).toBeGreaterThanOrEqual(9);
    expect(receipt.treeNearNonAuthoredMaxGapDegrees).toBeLessThanOrEqual(30);
    expect(receipt.treeMaxGapDegrees[0]).toBeLessThanOrEqual(30);
    for (const gap of receipt.treeMaxGapDegrees.slice(1)) expect(gap).toBeLessThanOrEqual(50);
    for (const gap of receipt.treeSecondGapDegrees) expect(gap).toBeLessThanOrEqual(45);
    expect(receipt.treeCompositeMaxGapDegrees).toBeLessThanOrEqual(25);
    expect(receipt.treeCompositeSecondGapDegrees).toBeLessThanOrEqual(18);
    for (const share of receipt.treeQuadrantMinShare) expect(share).toBeGreaterThanOrEqual(0.16);
    for (const share of receipt.treeQuadrantMaxShare) expect(share).toBeLessThanOrEqual(0.4);
    expect(receipt.treeShrubRootGapMax).toBe(0);
    expect(receipt.treeShrubDetached).toBe(0);
    expect(receipt.treeShrubBurialMin).toBe(0);
    expect(receipt.treeShrubBurialMax).toBe(0);
    expect(receipt.treeShrubHeightShareMax).toBe(0);
    expect(receipt.treeShrubGroupMin).toBe(0);
    expect(receipt.treeShrubGroupMax).toBe(0);
  });

  it('rejects lifted trunks and duplicate tree placements', () => {
    const leaderIndex = treeline.trunks.findIndex((trunk, index) => trunk.shade === 0 && trunk.treeId === index);
    const crown = treeline.canopies[0]!;
    expect(leaderIndex).toBeGreaterThanOrEqual(0);

    const lifted = {
      ...treeline,
      trunks: treeline.trunks.map((trunk, index) => index === leaderIndex ? { ...trunk, y: trunk.y + 1 } : trunk),
    };
    expect(measureTreeline(lifted, terrain).treeGroundErrorMax).toBeGreaterThan(0.05);

    const duplicate = { ...treeline, canopies: [...treeline.canopies, { ...crown }] };
    expect(measureTreeline(duplicate, terrain).treeSingleCanopyViolations).toBeGreaterThan(0);

  });

  it('keeps every transform finite and all treeline collision radii disabled', () => {
    for (const item of [...treeline.canopies, ...treeline.shrubs, ...treeline.trunks]) {
      for (const value of Object.values(item)) {
        if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
      }
      expect(item.collisionRadius).toBe(0);
      expect(Math.abs(item.x)).toBeLessThan(300);
      expect(Math.abs(item.z)).toBeLessThan(300);
    }
  });
});

describe('committed meadow dressing', () => {
  it('contains complete finite transforms and explicit collision radii', () => {
    expect(scatter.rocks.length).toBe(16);
    expect(scatter.flowers.length).toBeGreaterThan(1_000);
    expect(scatter.log).not.toBeNull();
    for (const item of [...scatter.rocks, ...scatter.flowers]) {
      for (const value of Object.values(item)) {
        if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
      }
      expect(item.collisionRadius).toBeGreaterThanOrEqual(0);
    }
    expect(scatter.log!.collisionRadius).toBeGreaterThan(0);
  });
});
