// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, it, expect } from 'vitest';
import { usesConsolidatedTreeCull } from '../js/world/TreePlacement.js';
import { listScenes } from '../shared/scenes/index.js';
import {
  classifyScene,
  consolidatedTreeCull,
  farImpostorsOnDefaultProd,
  deriveRuntimeRow,
} from '../tools/validation/scene-render-path-map.mjs';

/**
 * Drift lock for the static render-path map (tools/validation/scene-render-path-map.mjs).
 *
 * That tool is a pure-Node diagnostic, so it cannot import the THREE-laden
 * render module and instead mirrors one real routing predicate
 * (usesConsolidatedTreeCull) as a one-liner. This spec asserts the mirror
 * agrees with the canonical predicate for every registered scene, so the map
 * can never silently misreport which scenes get the consolidated cull / far
 * impostors. If usesConsolidatedTreeCull changes, this fails until the mirror
 * is updated to match.
 */

describe('scene-render-path-map mirror tracks the real cull predicate', () => {
  it('consolidatedTreeCull matches usesConsolidatedTreeCull for every scene', () => {
    for (const scene of listScenes()) {
      expect(
        consolidatedTreeCull(scene),
        `mirror disagrees for scene "${scene.id}"`,
      ).toBe(usesConsolidatedTreeCull(scene));
    }
  });

  it('far-impostors-on-default-prod equals consolidated-cull (no dev flag set)', () => {
    for (const scene of listScenes()) {
      expect(farImpostorsOnDefaultProd(scene)).toBe(usesConsolidatedTreeCull(scene));
    }
  });

  it('classifies Home Field as the sole non-consolidated scene', () => {
    const rows = listScenes().map(classifyScene);
    const nonConsolidated = rows.filter(r => !r.consolidatedTreeCull).map(r => r.id);
    expect(nonConsolidated).toEqual(['field']);

    const field = rows.find(r => r.id === 'field');
    expect(field.farImpostorsDefaultProd).toBe(false);
    expect(field.boundaryKind).toBe('rect');
  });
});

/**
 * Phase 1: the on-device runtime-confirmation layer's pure row-derivation.
 * deriveRuntimeRow maps the raw in-page structural reads to a row WITHOUT any
 * browser or GPU, so the layer's logic is testable while the perf effort holds
 * the GPU. The browser IO (runtimeReads / runRuntimeLayer) is exercised
 * on-device in Phase 5, not here.
 */
describe('deriveRuntimeRow maps structural reads to a row (GPU-free)', () => {
  const okGate = { ok: true, effective: 'webgpu', reason: null };

  it('reports impostors present via the consolidated cull registry', () => {
    const row = deriveRuntimeRow('rolling-hills', {
      bootGate: okGate,
      impostors: { registry: 2, farInstances: 120 },
      groups: { farImpostorGroups: 0 },
    });
    expect(row.bootGate).toBe('pass');
    expect(row.impostorsPresent).toBe(true);
    expect(row.farInstances).toBe(120);
  });

  it('reports impostors present via a per-chunk far-impostor group', () => {
    const row = deriveRuntimeRow('field', {
      bootGate: okGate,
      impostors: { registry: 0, farInstances: 0 },
      groups: { farImpostorGroups: 1 },
    });
    expect(row.impostorsPresent).toBe(true);
  });

  it('reports impostors ABSENT for the Home-Field-today shape (no cull, no group)', () => {
    const row = deriveRuntimeRow('field', {
      bootGate: okGate,
      impostors: { registry: 8, farInstances: 0 },
      groups: { farImpostorGroups: 0 },
    });
    expect(row.impostorsPresent).toBe(false);
    expect(row.farInstances).toBe(0);
  });

  it('flags a failed boot gate (WebGL demotion) and surfaces the reason', () => {
    const row = deriveRuntimeRow('field', {
      bootGate: { ok: false, effective: 'webgl', reason: 'production-webgpu-gates-failed' },
      impostors: { registry: 0, farInstances: 0 },
      groups: { farImpostorGroups: 0 },
    });
    expect(row.bootGate).toBe('FAIL');
    expect(row.effective).toBe('webgl');
    expect(row.reason).toBe('production-webgpu-gates-failed');
  });

  it('treats a structural read error as unknown, not absent', () => {
    const row = deriveRuntimeRow('newsheepdogland', {
      bootGate: okGate,
      impostors: { error: 'terrainBuilder undefined' },
      groups: { farImpostorGroups: 0 },
    });
    expect(row.impostorsPresent).toBeNull();
    expect(row.readError).toBe('terrainBuilder undefined');
  });
});
