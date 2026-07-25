// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The cycle-close reconciliation hook's two load-bearing decisions.
 *
 * Both failed silently on 2026-07-25, in the same `/cycle-close` invocation:
 *
 *   1. It resolved the active cycle by taking the FIRST `docs/cycle-N-plan.md`
 *      string anywhere in NEXT_SESSION.md. That is document order, not a
 *      declaration. Cycle 113's NEXT_SESSION listed 110 and 111 in a carryover
 *      item about unarchived plans, so the hook reconciled Cycle 110 - a cycle
 *      closed months earlier - and reported its acceptance items as live.
 *
 *   2. It had no notion of a cycle that has not been written yet, so a close
 *      fired minutes after scaffolding would have walked the CYCLE_TEMPLATE's
 *      own `<name>` and `<Question>` placeholders as if they were real
 *      acceptance criteria.
 *
 * Neither is the kind of bug a person notices in the output: a reconciliation
 * table for the wrong cycle looks exactly like a reconciliation table. Hence a
 * spec rather than a fix and a shrug.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    resolveActiveCycle,
    isUnfilledScaffold,
    extractAcceptanceLines,
} from '../.claude/hooks/lib/cycle-plan-resolve.mjs';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('resolveActiveCycle - which cycle is actually active', () => {
    it('reads the contract-required For: header', () => {
        const ns = [
            '# Next Session - Cycle 114, grounding-pass',
            '',
            '> **Updated:** 2026-07-25',
            '> **For:** Cycle 114',
            '> **Pickup priority:** Fill in the plan.',
        ].join('\n');
        expect(resolveActiveCycle(ns)).toMatchObject({ cycleN: '114', source: 'For: header' });
    });

    it('prefers the header over an older plan path cited earlier in the body', () => {
        // The exact shape that broke it: a carryover item naming unarchived
        // plans by path, before the Reference Table names the active one.
        const ns = [
            '> **For:** Cycle 114',
            '',
            '## Carryover',
            '',
            '7. `docs/cycle-110-plan.md` and `docs/cycle-111-plan.md` are unarchived.',
            '',
            '| Active cycle plan | [`docs/cycle-114-plan.md`](docs/cycle-114-plan.md) |',
        ].join('\n');
        const got = resolveActiveCycle(ns);
        expect(got?.cycleN).toBe('114');
        expect(got?.guessed).toBeFalsy();
    });

    it('falls back to the Reference Table row when the header is missing', () => {
        const ns = [
            '# Next Session',
            '',
            'Some prose mentioning docs/cycle-109-plan.md in passing.',
            '',
            '| Topic | Source |',
            '|---|---|',
            '| Active cycle plan | [`docs/cycle-114-plan.md`](docs/cycle-114-plan.md) |',
        ].join('\n');
        expect(resolveActiveCycle(ns)).toMatchObject({ cycleN: '114', source: 'Reference Table row' });
    });

    it('marks a bare path scan as a guess so the hook can say so', () => {
        const ns = 'No header, no table, just docs/cycle-107-plan.md somewhere.';
        expect(resolveActiveCycle(ns)).toMatchObject({ cycleN: '107', guessed: true });
    });

    it('returns null when nothing names a cycle', () => {
        expect(resolveActiveCycle('# Next Session\n\nNothing useful here.')).toBeNull();
    });

    it('resolves the repo state to the same cycle NEXT_SESSION declares', () => {
        const ns = read('NEXT_SESSION.md');
        const declared = /^>\s*\*\*For:\*\*\s*Cycle\s+(\d+)/im.exec(ns)?.[1];
        expect(declared, 'NEXT_SESSION is missing its required For: header').toBeTruthy();
        expect(resolveActiveCycle(ns)?.cycleN).toBe(declared);
    });
});

describe('isUnfilledScaffold - a cycle nobody has written yet', () => {
    it('recognises the live CYCLE_TEMPLATE', () => {
        expect(isUnfilledScaffold(read('docs/CYCLE_TEMPLATE.md'))).toBe(true);
    });

    it('recognises a freshly scaffolded plan', () => {
        const scaffold = 'docs/cycle-114-plan.md';
        if (!existsSync(resolve(process.cwd(), scaffold))) return; // authored already
        expect(isUnfilledScaffold(read(scaffold))).toBe(true);
    });

    it('does not flag an authored plan', () => {
        // Cycle 113's plan is the reference for "written and shipped".
        expect(isUnfilledScaffold(read('docs/archive/cycles/cycle-113-plan.md'))).toBe(false);
    });

    it('needs more than one tell, so a plan quoting the template once is safe', () => {
        const authored = [
            '# Cycle 200 - a real plan',
            '## Goal',
            'A real goal paragraph, written by a person.',
            '',
            'Style note: do not leave `## Phase 1 - <name>` in the finished plan.',
        ].join('\n');
        expect(isUnfilledScaffold(authored)).toBe(false);
    });
});

describe('extractAcceptanceLines - the real Success section, not the explainer', () => {
    it('skips the template explainer block and finds the checkbox list', () => {
        // Cycle 33 Phase 4's bug: a plan carries BOTH an
        // "## Acceptance criteria — EARS format" explainer (no checkboxes) and
        // a "## Success criteria (cycle close)" list. Taking the first heading
        // found zero items and silently no-oped.
        const plan = [
            '## Acceptance criteria — EARS format',
            '',
            'Every phase uses EARS so the lines are testable. No checkboxes here.',
            '',
            '## Phase 1 - something',
            '',
            '## Success criteria (cycle close)',
            '',
            '- [x] When it ships, the thing shall work.',
            '- [ ] When it closes, the deploy shall succeed.',
        ].join('\n');
        const items = extractAcceptanceLines(plan);
        expect(items).toHaveLength(2);
        expect(items[0]).toEqual({ checked: true, text: 'When it ships, the thing shall work.' });
        expect(items[1].checked).toBe(false);
    });

    it('returns nothing when a plan has no criteria section', () => {
        expect(extractAcceptanceLines('# A plan\n\n## Goal\n\nWords.')).toEqual([]);
    });

    it('reads the shipped Cycle 113 plan as fully checked', () => {
        const items = extractAcceptanceLines(read('docs/archive/cycles/cycle-113-plan.md'));
        expect(items.length).toBeGreaterThanOrEqual(8);
        expect(items.filter((i) => !i.checked)).toEqual([]);
    });
});
