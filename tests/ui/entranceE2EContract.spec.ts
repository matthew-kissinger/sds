// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 113: the entrance's selector contract with the Playwright suite.
 *
 * Five e2e specs drive the live entrance, and the rewrite moved things they
 * reach for. Three were found by grepping and updated with the markup; a fourth
 * (`smoke.spec.ts`) was missed and only surfaced when CI went red, and a fifth
 * (`mp/room-hop-soak.spec.ts`) is in a project the default CI run does not even
 * execute, so it would have failed silently for however long.
 *
 * The lesson is not "grep harder". It is that a selector shared across five
 * files with no shared definition is a contract with nowhere to live. These
 * assertions give it one:
 *
 *   1. Anything driving a difficulty rung goes through helpers/entrance.ts,
 *      which knows the rung is behind the summary line and behind D7's More.
 *   2. The names the entrance must keep are actually in the entrance.
 *
 * Cheap, offline, and it fails on the same commit that breaks the contract
 * rather than eleven minutes into a deploy.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const E2E = resolve(process.cwd(), 'tests/e2e');

function specs(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return specs(full);
        return name.endsWith('.spec.ts') ? [full] : [];
    });
}

const files = specs(E2E).map((path) => ({
    path: path.slice(resolve(process.cwd()).length + 1).replace(/\\/g, '/'),
    source: readFileSync(path, 'utf8'),
}));

const ENTRANCE_SRC = readFileSync(resolve(process.cwd(), 'js/components/entrance/Entrance.tsx'), 'utf8');

describe('e2e specs drive the entrance through one helper', () => {
    it('finds the e2e suite at all', () => {
        expect(files.length).toBeGreaterThanOrEqual(6);
    });

    it('routes every difficulty-rung selector through helpers/entrance', () => {
        const offenders = files
            .filter((f) => !f.path.endsWith('helpers/entrance.ts'))
            .filter((f) => /getByRole\(\s*'button'\s*,\s*\{\s*name:\s*\/[A-Z][a-z]+\\s\+\\d/.test(f.source))
            .map((f) => f.path);
        expect(offenders, `these reach for a rung directly: ${offenders.join(', ')}`).toEqual([]);
    });

    it('routes every world-arming click through helpers/entrance', () => {
        // A spec that presses "Next world" N times encodes the carousel's order
        // as a magic number. Two such tables had gone stale against the D5
        // default before anything noticed, because both specs are @local-only.
        const offenders = files
            .filter((f) => !f.path.endsWith('helpers/entrance.ts'))
            .filter((f) => /WORLD_STEPS_FROM_DEFAULT/.test(f.source))
            .map((f) => f.path);
        expect(offenders, `these still count arrow clicks: ${offenders.join(', ')}`).toEqual([]);
    });
});

describe('the entrance keeps the names those specs match', () => {
    it('keeps a button named exactly Play', () => {
        expect(ENTRANCE_SRC).toMatch(/>\s*Play\b/);
        expect(ENTRANCE_SRC).toMatch(/className="sds-ent-play"/);
    });

    it('keeps Previous world and Next world on the arrows', () => {
        expect(ENTRANCE_SRC).toContain("'Previous world'");
        expect(ENTRANCE_SRC).toContain("'Next world'");
    });

    it('keeps the world name a plain text node inside the overlay', () => {
        expect(ENTRANCE_SRC).toMatch(/sds-ent-world-name|<Masthead/);
    });
});
