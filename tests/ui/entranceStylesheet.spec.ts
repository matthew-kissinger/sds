// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 113 Phase 1: the rules css/entrance.css holds itself to.
 *
 * These are the four properties that made the old entrance what the front-end
 * review found, and each of them regresses silently. Nothing renders wrong
 * when a hex literal creeps back in or a new button ships without a focus
 * ring; the surface just quietly stops being the thing D16 asked for.
 *
 *   1. Pastoral tokens only. A hex literal in this file is a colour that no
 *      longer moves when the palette moves.
 *   2. A focus ring on everything clickable. The review's finding was that 47
 *      inline style objects in one component is *why* the entrance had no
 *      hover, focus or active states; a stylesheet that ships a button with no
 *      :focus-visible has spent the migration and kept the defect.
 *   3. Motion is opt-in. Every transition and animation lives inside
 *      prefers-reduced-motion: no-preference.
 *   4. main.css actually imports it, after tailwindcss so the components layer
 *      exists.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = readFileSync(resolve(process.cwd(), 'css/entrance.css'), 'utf8');
const MAIN = readFileSync(resolve(process.cwd(), 'css/main.css'), 'utf8');

/** Strip /* *​/ comments so prose about colours never trips the hex scan. */
const code = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

describe('css/entrance.css - tokens only (D16)', () => {
    it('carries no hex colour literal', () => {
        const hex = code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
        expect(hex, `hex literals found: ${hex.join(', ')}`).toEqual([]);
    });

    it('carries no bare rgb()/rgba() literal either', () => {
        // color-mix() over a token is the shape tokens.ts `alpha()` emits, and
        // it is the only way a tint in this file stays tied to the palette.
        const rgb = code.match(/\brgba?\(/g) ?? [];
        expect(rgb, `raw rgb()/rgba() found ${rgb.length} time(s)`).toEqual([]);
    });

    it('composes every tint with color-mix over a --color- token', () => {
        for (const mix of code.match(/color-mix\([^;]*?\)/g) ?? []) {
            expect(mix, `color-mix without a token: ${mix}`).toMatch(/var\(--(color|ent)-/);
        }
    });
});

describe('css/entrance.css - focus states', () => {
    // Every rule that opts an element into being clickable.
    const clickable = new Set(
        [...code.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
            .filter(([, , body]) => /cursor:\s*pointer/.test(body))
            .flatMap(([, selector]) => selector.match(/\.sds-ent-[a-z-]+/g) ?? []),
    );

    const focusable = new Set(
        (code.match(/\.sds-ent-[a-z-]+(?=:focus-visible)/g) ?? []),
    );

    it('finds the interactive classes at all (guard against a vacuous pass)', () => {
        expect(clickable.size).toBeGreaterThanOrEqual(8);
    });

    it('gives every class that sets cursor:pointer a :focus-visible rule', () => {
        const missing = [...clickable].filter((c) => !focusable.has(c));
        expect(missing, `no :focus-visible for ${missing.join(', ')}`).toEqual([]);
    });

    it('does not out-rank the controller focus ring', () => {
        // main.css's [data-navfocus] ring is !important on purpose. If the
        // entrance sheet ever went !important too, a gamepad player would see
        // two outlines fighting.
        expect(code).not.toMatch(/outline[^;]*!important/);
    });
});

describe('css/entrance.css - motion is opt-in', () => {
    const reducedMotionBlocks = [...code.matchAll(/@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{/g)];

    it('declares a no-preference block', () => {
        expect(reducedMotionBlocks.length).toBeGreaterThan(0);
    });

    it('declares no transition or animation outside it', () => {
        // Blank out every no-preference block, then look for survivors.
        let outside = code;
        for (const m of reducedMotionBlocks) {
            const open = m.index! + m[0].length - 1;
            let depth = 0;
            let end = open;
            for (let i = open; i < outside.length; i++) {
                if (outside[i] === '{') depth++;
                else if (outside[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
            }
            outside = outside.slice(0, m.index!) + ' '.repeat(end - m.index! + 1) + outside.slice(end + 1);
        }
        const stragglers = outside.match(/^\s*(transition|animation):[^;]+;/gm) ?? [];
        expect(stragglers, `motion outside the reduced-motion guard: ${stragglers.join(' ')}`).toEqual([]);
    });
});

describe('css/main.css wires it up', () => {
    it('imports the entrance sheet', () => {
        expect(MAIN).toContain('@import "./entrance.css";');
    });

    it('imports it after tailwindcss so the components layer exists', () => {
        expect(MAIN.indexOf('@import "tailwindcss";')).toBeLessThan(MAIN.indexOf('@import "./entrance.css";'));
    });

    it('puts every entrance rule in the components layer', () => {
        // One @layer components wrapper, nothing outside it.
        const layers = code.match(/@layer\s+([a-z]+)/g) ?? [];
        expect(layers).toEqual(['@layer components']);
        expect(code.trim().startsWith('@layer components')).toBe(true);
    });
});
