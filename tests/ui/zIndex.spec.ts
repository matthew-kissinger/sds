// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Overlay z-index registry (Cycle 87 Phase 5).
 *
 * Two contracts:
 * 1. The band ordering invariant - the registry IS the layering policy, so
 *    the bands must stay strictly increasing in the documented order.
 * 2. A tokens.parity-style source scan banning NEW numeric z-index literals
 *    in the swept overlay directories - every overlay layer goes through
 *    the registry. Debug/diagnostics surfaces are exempt (allowlist).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { Z, Z_ORDER } from '../../js/ui/zIndex.js';

describe('Z registry', () => {
    it('declares every band in Z_ORDER and nothing else', () => {
        expect(Object.keys(Z).sort()).toEqual([...Z_ORDER].sort());
    });

    it('bands are strictly increasing in documented order', () => {
        for (let i = 1; i < Z_ORDER.length; i++) {
            const prev = Z[Z_ORDER[i - 1] as keyof typeof Z];
            const curr = Z[Z_ORDER[i] as keyof typeof Z];
            expect(curr, `${Z_ORDER[i]} must be above ${Z_ORDER[i - 1]}`).toBeGreaterThan(prev);
        }
    });

    it('keeps the behavior fixes the registry was built for', () => {
        // The pause menu must cover the chips (was 1000 under 1200).
        expect(Z.modal).toBeGreaterThan(Z.chips);
        // The tutorial pill sits above toasts but below panels/modals
        // (was 600 over everything except completion).
        expect(Z.tutorial).toBeGreaterThan(Z.toast);
        expect(Z.panel).toBeGreaterThan(Z.tutorial);
    });
});

describe('no numeric z-index literals in overlay sources', () => {
    // Directories whose player-facing overlays were swept onto the registry.
    const SWEPT_DIRS = [
        'js/components/GameHUD',
        'js/components/Tutorial',
        'js/components/entrance',
        'js/components/ui',
        'js/boot',
        'js/achievements',
        'js/ui',
        'js/effects',
    ];
    // Debug/diagnostics surfaces keep their literals (debug band by
    // convention; not player-facing).
    const ALLOWLIST = new Set<string>([]);

    const collect = (dir: string): string[] => {
        const out: string[] = [];
        for (const name of readdirSync(dir)) {
            const p = join(dir, name);
            if (statSync(p).isDirectory()) out.push(...collect(p));
            else if (/\.(js|jsx|ts|tsx)$/.test(name)) out.push(p);
        }
        return out;
    };

    it('every z-index in the swept directories comes from the registry', () => {
        const offenders: string[] = [];
        // Matches zIndex: <number> (object style) and z-index: <number>
        // (cssText), but not var()/Z.* usages.
        const literal = /(?:zIndex\s*:\s*['"]?\d|z-index\s*:\s*\d)/;
        for (const dir of SWEPT_DIRS) {
            for (const file of collect(dir)) {
                const rel = file.replace(/\\/g, '/');
                if (ALLOWLIST.has(rel)) continue;
                const src = readFileSync(file, 'utf8');
                const lines = src.split('\n');
                lines.forEach((line, i) => {
                    if (literal.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
                });
            }
        }
        expect(offenders, `Numeric z-index literals found (use js/ui/zIndex.js):\n${offenders.join('\n')}`).toEqual([]);
    });
});
