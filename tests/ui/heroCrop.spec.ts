// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 113 Phase 6: the per-world `objectPosition` values keep the dog in the
 * phone crop.
 *
 * The heroes are 16:9 and the entrance is full-bleed, so a 390x844 portrait
 * viewport shows only the middle ~26% of each image's width under
 * `object-fit: cover`. Centred, that crop put Home Field's dog at -3.9% of the
 * viewport and Rolling Hills' at 100%: both off frame, on shots composed
 * entirely around the dog. worlds.ts now names the column each crop should
 * keep.
 *
 * Those four numbers are derived from where the dog actually is, so they go
 * stale the moment a hero is re-shot, and nothing about a stale one looks
 * wrong in code. This recomputes the projection from the capture harness's own
 * measurements and fails if a shipped value no longer holds the dog.
 *
 * tools/validation/entrance-hero-clearance.mjs checks the same invariant
 * against the live entrance. This is the offline half: it runs in CI without a
 * browser and it is what catches a re-shoot before anyone opens a page.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WORLDS } from '../../js/components/entrance/worlds.ts';

/** The captured heroes are 1920x1080; the projection assumes it. */
const HERO_W = 1920;
const HERO_H = 1080;
/** A standing dog in profile is roughly 1.6x as long as it is tall. */
const DOG_ASPECT = 1.6;

const PHONE = { w: 390, h: 844 };
const DESKTOP = { w: 1440, h: 900 };

interface Measure {
    shot: string;
    aspect: string;
    dogNdc: { x: number; y: number };
    dogFrameHeightPct: number;
}

const measurements: Measure[] = JSON.parse(
    readFileSync(resolve(process.cwd(), 'cycle112-validation/heroes/measurements.json'), 'utf8'),
).results.filter((r: Measure) => r.aspect === 'entrance');

/** Where the dog lands horizontally, as fractions of the viewport width. */
function dogSpan(m: Measure, vw: number, vh: number, objectPositionPct: number) {
    const scale = Math.max(vw / HERO_W, vh / HERO_H);
    const renderedW = HERO_W * scale;
    const renderedH = HERO_H * scale;
    const offsetX = (vw - renderedW) * (objectPositionPct / 100);
    const centre = offsetX + ((m.dogNdc.x + 1) / 2) * renderedW;
    const halfW = ((m.dogFrameHeightPct / 100) * renderedH * DOG_ASPECT) / 2;
    return { left: centre - halfW, right: centre + halfW, centre };
}

const positionOf = (id: string) => parseFloat(WORLDS.find((w) => w.id === id)!.objectPosition ?? '50%');

describe('hero objectPosition (Cycle 113 Phase 6)', () => {
    it('has a measurement for every world in the carousel', () => {
        // Guard against a vacuous suite: a world with no measurement would
        // otherwise skip every assertion below in silence.
        for (const w of WORLDS) {
            expect(measurements.find((m) => m.shot === w.id), w.id).toBeTruthy();
        }
    });

    it('declares a percentage for every world', () => {
        for (const w of WORLDS) {
            expect(w.objectPosition, w.id).toMatch(/^\d+(\.\d+)?%$/);
            const pct = parseFloat(w.objectPosition!);
            expect(pct, w.id).toBeGreaterThanOrEqual(0);
            expect(pct, w.id).toBeLessThanOrEqual(100);
        }
    });

    it('keeps the whole dog inside a 390x844 portrait crop', () => {
        for (const m of measurements) {
            const span = dogSpan(m, PHONE.w, PHONE.h, positionOf(m.shot));
            expect(span.left, `${m.shot} left edge`).toBeGreaterThanOrEqual(0);
            expect(span.right, `${m.shot} right edge`).toBeLessThanOrEqual(PHONE.w);
        }
    });

    it('still keeps it inside on desktop, where the crop is nearly the full width', () => {
        for (const m of measurements) {
            const span = dogSpan(m, DESKTOP.w, DESKTOP.h, positionOf(m.shot));
            expect(span.left, `${m.shot} left edge`).toBeGreaterThanOrEqual(0);
            expect(span.right, `${m.shot} right edge`).toBeLessThanOrEqual(DESKTOP.w);
        }
    });

    it('would push three of the four off frame if centred, which is the point', () => {
        // If this ever stops failing, the crop stopped being tight and the
        // values above are no longer earning their keep. Open Country is the
        // one that survives centring: its dog sits at 60% of the image width,
        // just inside the 37-63% window a portrait crop leaves. It still gets a
        // value, because "inside by 4.7% of the viewport" is not a composition.
        const offFrame = measurements.filter((m) => {
            const span = dogSpan(m, PHONE.w, PHONE.h, 50);
            return span.left < 0 || span.right > PHONE.w;
        });
        expect(offFrame.map((m) => m.shot).sort())
            .toEqual(['field', 'newsheepdogland', 'rolling-hills']);
    });
});
