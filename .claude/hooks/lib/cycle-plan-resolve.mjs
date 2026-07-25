// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Pure parsing helpers for the cycle-close reconciliation hook.
//
// Split out of cycle-close-reconcile.mjs so they can be unit-tested: that file
// carries a `#!/usr/bin/env node` shebang, and esbuild will not parse a shebang
// in an imported module, so importing the hook itself is a syntax error. No
// shebang here, no filesystem, no process, no side effects on import.

/**
 * Which cycle NEXT_SESSION says is active, and how confident we are.
 *
 * The original implementation took the first `docs/cycle-N-plan.md` string
 * anywhere in the file. That is not a declaration, it is a coincidence of
 * document order: the moment a carryover item cites an older plan by path (as
 * Cycle 113's did, listing 110 and 111 as still unarchived), the hook silently
 * reconciles the wrong, already-closed cycle. It did exactly that.
 *
 * docs/NEXT_SESSION_CONTRACT.md names the real source of truth: the required
 * `**For:** Cycle N` header line. The Reference Table's "Active cycle plan" row
 * is the second-most authoritative. The path scan stays only as a last resort,
 * and the caller says out loud that it guessed.
 *
 * @param {string} nextSessionText
 * @returns {{cycleN: string, source: string, guessed?: boolean} | null}
 */
export function resolveActiveCycle(nextSessionText) {
    // 1. The contract's required header line.
    const header = nextSessionText.match(/^>\s*\*\*For:\*\*\s*Cycle\s+(\d+)/im);
    if (header) return { cycleN: header[1], source: 'For: header' };

    // 2. The Reference Table row, which the contract also fixes.
    const tableRow = nextSessionText.match(
        /\|\s*Active cycle plan\s*\|[^|\n]*docs\/cycle-(\d+)-plan\.md/i,
    );
    if (tableRow) return { cycleN: tableRow[1], source: 'Reference Table row' };

    // 3. Last resort: the first plan path in the document. Ambiguous by
    //    construction, so the caller warns.
    const anyPath = nextSessionText.match(/docs\/cycle-(\d+)-plan\.md/);
    if (anyPath) return { cycleN: anyPath[1], source: 'first path in document', guessed: true };

    return null;
}

/**
 * True when a plan is still the unfilled CYCLE_TEMPLATE scaffold.
 *
 * `/cycle-close` run against a freshly scaffolded cycle would otherwise
 * reconcile the template's own placeholder acceptance lines and report them as
 * real work. There is nothing to close in a plan nobody has written yet, and
 * saying so is more useful than a table of `<name>` rows.
 *
 * Two tells are required, so an authored plan that quotes the template once
 * (for example in a style note) is not mistaken for a scaffold.
 *
 * @param {string} planText
 * @returns {boolean}
 */
export function isUnfilledScaffold(planText) {
    const tells = [
        /One paragraph\. What's this cycle for\?/,
        /## Phase 1 [—-] <name>/,
        /\*\*Q1: <Question>\?\*\*/,
        /Replace \{\{number\}\}/,
        /\{\{slug\}\}/,
    ];
    return tells.filter((re) => re.test(planText)).length >= 2;
}

/**
 * The `- [ ]` / `- [x]` items from a plan's real Success criteria section.
 *
 * Cycle 33 Phase 4: a cycle plan typically has TWO sections matching
 * `## (Success|Acceptance) criteria` - the generic `## Acceptance criteria —
 * EARS format` block copied from CYCLE_TEMPLATE.md (no checkboxes) and the
 * actual `## Success criteria (cycle close)` block (the real list). An earlier
 * implementation used `String.search()`, which returns the first match, so it
 * parsed the explanation block, found zero items, and silently no-oped.
 * Iterate every match and take the first that actually contains items.
 *
 * @param {string} planText
 * @returns {Array<{checked: boolean, text: string}>}
 */
export function extractAcceptanceLines(planText) {
    const sectionRe = /^##+\s+(?:Success|Acceptance) criteria.*$/gim;
    const lineRe = /^\s*-\s\[(\s|x|X)\]\s+(.+?)$/gm;
    const matches = [...planText.matchAll(sectionRe)];
    if (matches.length === 0) return [];
    for (const m of matches) {
        const start = m.index ?? 0;
        const after = planText.slice(start);
        const nextSectionIdx = after.slice(1).search(/\n##\s+\S/m);
        const block = nextSectionIdx === -1 ? after : after.slice(0, nextSectionIdx + 1);
        const items = [];
        let lineMatch;
        lineRe.lastIndex = 0;
        while ((lineMatch = lineRe.exec(block)) !== null) {
            items.push({
                checked: lineMatch[1].toLowerCase() === 'x',
                text: lineMatch[2].trim(),
            });
        }
        if (items.length > 0) return items;
    }
    return [];
}
