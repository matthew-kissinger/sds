// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, it, expect } from 'vitest';
import { usesConsolidatedTreeCull } from '../js/world/TreePlacement.js';
import { listScenes } from '../shared/scenes/index.js';
import {
  classifyScene,
  consolidatedTreeCull,
  farImpostorsOnDefaultProd,
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
