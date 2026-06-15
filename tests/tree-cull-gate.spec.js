// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, it, expect } from 'vitest';
import { usesConsolidatedTreeCull } from '../js/world/TreePlacement.js';
import { field } from '../shared/scenes/field.js';
import { rollingHills } from '../shared/scenes/rolling-hills.js';
import { openCountry } from '../shared/scenes/open-country.js';
import { newsheepdogland } from '../shared/scenes/newsheepdogland.js';

/**
 * Consolidated compute-cull eligibility gate (Cycle 101 Phase 5).
 *
 * Broadened from coastline-only to coastline + island so Rolling Hills and
 * Open Country (both all-cold islands) inherit the per-instance GPU cull and
 * the view-dependent far-impostor band. Home Field (`rect`, in practice no
 * boundary) stays on the per-chunk fan-out. The gate keys on the structural
 * boundary kind, never a scene id (scene-and-render.md), so a future island
 * scene opts in for free.
 */

describe('usesConsolidatedTreeCull — boundary-kind gate', () => {
    it('coastline scenes are eligible (Newsheepdogland)', () => {
        expect(newsheepdogland.boundary?.kind).toBe('coastline');
        expect(usesConsolidatedTreeCull(newsheepdogland)).toBe(true);
    });

    it('island scenes are eligible (Rolling Hills, Open Country)', () => {
        expect(rollingHills.boundary?.kind).toBe('island');
        expect(openCountry.boundary?.kind).toBe('island');
        expect(usesConsolidatedTreeCull(rollingHills)).toBe(true);
        expect(usesConsolidatedTreeCull(openCountry)).toBe(true);
    });

    it('Home Field (no island/coastline boundary) stays per-chunk', () => {
        expect(field.boundary?.kind).not.toBe('island');
        expect(field.boundary?.kind).not.toBe('coastline');
        expect(usesConsolidatedTreeCull(field)).toBe(false);
    });

    it('is robust to a missing scene def or boundary', () => {
        expect(usesConsolidatedTreeCull(undefined)).toBe(false);
        expect(usesConsolidatedTreeCull(null)).toBe(false);
        expect(usesConsolidatedTreeCull({})).toBe(false);
        expect(usesConsolidatedTreeCull({ boundary: {} })).toBe(false);
        expect(usesConsolidatedTreeCull({ boundary: { kind: 'rect' } })).toBe(false);
    });

    it('the two streamed-vs-all-cold paths split as the Phase 5 hook expects', () => {
        // Streamed (coastline, has streamedZones) arms the far band from
        // foliageStreaming; all-cold islands arm it from the cold registry.
        expect(usesConsolidatedTreeCull(newsheepdogland)).toBe(true);
        expect(Boolean(newsheepdogland.terrain?.streamedZones)).toBe(true);

        for (const island of [rollingHills, openCountry]) {
            expect(usesConsolidatedTreeCull(island)).toBe(true);
            expect(Boolean(island.terrain?.streamedZones)).toBe(false);
        }
    });
});
