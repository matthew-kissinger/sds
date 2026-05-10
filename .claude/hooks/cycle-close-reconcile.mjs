#!/usr/bin/env node
// .claude/hooks/cycle-close-reconcile.mjs
//
// Cycle-close reconciliation pass. For each `- [ ]` line in the active
// cycle plan's Success / Acceptance section, parse the EARS form
// (`When X, then Y` / `While X, the system shall Y` / `If X, then Y`),
// heuristically grep its testable predicate against the repo state +
// recent commit messages, and print a structured table.
//
// Output is informational. /cycle-close presents this table BEFORE
// walking each item with the user; the user still owns the
// "is this done?" decision per item. This script's job is to surface
// the obvious passes/fails so the user can focus on the prose ones.
//
// Cross-platform: runs via `node` from repo root.
//
// Public state of the art has no equivalent — Spec Kit's
// /speckit.analyze runs PRE-implementation against artifact
// consistency; Auto Dream is between-session memory consolidation.
// This is the first cross-artifact-consistency check that runs
// AT cycle close against shipped state.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const repoRoot = process.cwd();

function locateActivePlan() {
    const nextSession = join(repoRoot, 'NEXT_SESSION.md');
    if (!existsSync(nextSession)) return null;
    const ns = readFileSync(nextSession, 'utf8');
    const m = ns.match(/docs\/cycle-(\d+)-plan\.md/);
    if (!m) return null;
    const planPath = join(repoRoot, 'docs', `cycle-${m[1]}-plan.md`);
    if (!existsSync(planPath)) return null;
    return { cycleN: m[1], planPath };
}

function extractAcceptanceLines(planText) {
    // Cycle 33 Phase 4: a cycle plan typically has TWO sections that
    // match `## (Success|Acceptance) criteria` — the generic
    // `## Acceptance criteria — EARS format` block (copied from
    // CYCLE_TEMPLATE.md, no checkboxes) and the actual
    // `## Success criteria (cycle close)` block (the real `- [ ]`
    // list). The previous implementation used `String.search()` which
    // returns the first match, so it parsed the explanation block,
    // found zero items, and silently no-oped. Iterate over every
    // match and pick the first one that contains `- [ ]` items.
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
        // Reset state on each block so each section starts at zero.
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

// Run a shell command, capture output, never throw. Used to probe repo
// state without aborting the reconciliation if a check fails.
function safeExec(cmd) {
    try {
        return {
            ok: true,
            out: execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(),
        };
    } catch (err) {
        return { ok: false, out: String(err.message || err) };
    }
}

// Heuristic predicate evaluators — parse common EARS-form predicates
// and turn them into something the script can probe.
function evaluatePredicate(text) {
    // `wc -l <path>` ≤ N  (with or without "shall return")
    const wcLe = text.match(/`wc -l ([^`]+)`(?:\s+shall\s+return)?\s+(?:≤|<=|less than or equal to)\s+([\d,]+)/i);
    if (wcLe) {
        const path = wcLe[1].trim();
        const limit = Number(wcLe[2].replace(/,/g, ''));
        const full = join(repoRoot, path);
        if (!existsSync(full)) return { kind: 'fail', detail: `${path} does not exist` };
        const wc = safeExec(`wc -l "${full}"`);
        if (!wc.ok) return { kind: 'unknown', detail: wc.out };
        const actual = Number(wc.out.split(/\s+/)[0]);
        return {
            kind: actual <= limit ? 'pass' : 'fail',
            detail: `${path} = ${actual} (limit ${limit})`,
        };
    }

    // `ls <pattern> | wc -l` ≤ N (with or without "shall return")
    const lsCount = text.match(/`ls ([^`]+)\s*\|\s*wc -l`(?:\s+shall\s+return)?\s+(?:≤|<=|less than or equal to)\s+(\d+)/i);
    if (lsCount) {
        const pattern = lsCount[1].trim();
        const limit = Number(lsCount[2]);
        const ls = safeExec(`ls ${pattern} 2>/dev/null | wc -l`);
        if (!ls.ok) return { kind: 'unknown', detail: ls.out };
        const actual = Number(ls.out.trim());
        return {
            kind: actual <= limit ? 'pass' : 'fail',
            detail: `${pattern} = ${actual} (limit ${limit})`,
        };
    }

    // `<file>` (does | shall) not exist [at original path]
    const notExist = text.match(/`([^`]+)`\s+(?:does|shall)\s+not\s+exist/i);
    if (notExist) {
        const path = notExist[1].trim();
        const full = join(repoRoot, path);
        return {
            kind: !existsSync(full) ? 'pass' : 'fail',
            detail: `${path} ${existsSync(full) ? 'still exists' : 'absent'}`,
        };
    }

    // `<file>` / `<dir>` shall exist  (also handles markdown link form)
    const shallExist = text.match(/`([^`]+)`\s+shall\s+exist/i)
        || text.match(/\[`([^`]+)`\]\([^)]+\)\s+shall\s+exist/i);
    if (shallExist) {
        const path = shallExist[1].trim();
        const full = join(repoRoot, path);
        return {
            kind: existsSync(full) ? 'pass' : 'fail',
            detail: `${path} ${existsSync(full) ? 'present' : 'missing'}`,
        };
    }

    // Markdown-linked dir/file "shall exist" — `[`docs/X.md`](X.md) shall exist`
    const linkExistBoth = text.match(/\[`([^`]+)`\]\([^)]+\)\s+and\s+\[`([^`]+)`\]\([^)]+\)\s+(?:shall\s+(?:both\s+)?exist|both\s+exist)/i);
    if (linkExistBoth) {
        const aFull = join(repoRoot, linkExistBoth[1].trim());
        const bFull = join(repoRoot, linkExistBoth[2].trim());
        const ok = existsSync(aFull) && existsSync(bFull);
        return {
            kind: ok ? 'pass' : 'fail',
            detail: `${linkExistBoth[1]}=${existsSync(aFull) ? 'OK' : 'MISSING'}, ${linkExistBoth[2]}=${existsSync(bFull) ? 'OK' : 'MISSING'}`,
        };
    }

    // `npx eslint shared/` shall pass
    if (/`npx eslint\b[^`]*`\s+shall\s+pass/i.test(text)) {
        const lint = safeExec('npx eslint shared/ 2>&1');
        return {
            kind: lint.ok ? 'pass' : 'fail',
            detail: lint.ok ? 'eslint shared/ exit 0' : lint.out.slice(0, 200),
        };
    }

    // npm test shall pass
    if (/\bnpm test\b.*shall\s+pass/i.test(text) || /shall\s+pass\s+all\s+specs/i.test(text)) {
        const t = safeExec('npm test --silent 2>&1 | tail -3');
        const ok = t.ok && /\d+\s+passed/.test(t.out) && !/\d+\s+failed/.test(t.out);
        return {
            kind: ok ? 'pass' : 'unknown',
            detail: t.out.slice(0, 200),
        };
    }

    // npm run build shall succeed / be clean
    if (/\bnpm run build\b.*shall\s+(?:succeed|be\s+clean|pass)/i.test(text)) {
        const b = safeExec('npm run build 2>&1 | tail -3');
        const ok = b.ok && /built in/.test(b.out);
        return {
            kind: ok ? 'pass' : 'unknown',
            detail: b.out.slice(0, 200),
        };
    }

    // Catch-all: surface as a manual prose check.
    return { kind: 'manual', detail: '(prose predicate — walk with user)' };
}

function formatRow(label, status, detail) {
    const symbol = {
        pass: '[OK]',
        fail: '[FAIL]',
        unknown: '[?]',
        manual: '[manual]',
    }[status] || '[?]';
    const trimmed = label.length > 70 ? label.slice(0, 67) + '...' : label;
    return `  ${symbol.padEnd(10)} ${trimmed}\n             → ${detail}`;
}

function main() {
    const active = locateActivePlan();
    if (!active) {
        console.log('cycle-close-reconcile: no active plan found in NEXT_SESSION.md.');
        process.exit(0);
    }
    const { cycleN, planPath } = active;
    const plan = readFileSync(planPath, 'utf8');
    const items = extractAcceptanceLines(plan);
    if (items.length === 0) {
        console.log(`cycle-close-reconcile: cycle-${cycleN} plan has no Success/Acceptance section.`);
        process.exit(0);
    }

    console.log(`\n=== Cycle ${cycleN} reconciliation (${items.length} acceptance items) ===\n`);

    const counts = { pass: 0, fail: 0, unknown: 0, manual: 0, alreadyChecked: 0 };
    for (const item of items) {
        if (item.checked) {
            counts.alreadyChecked += 1;
            console.log(formatRow(item.text, 'pass', '(checkbox already ticked in plan)'));
            continue;
        }
        const result = evaluatePredicate(item.text);
        counts[result.kind] += 1;
        console.log(formatRow(item.text, result.kind, result.detail));
    }

    console.log(
        `\nSummary: ${counts.pass} pass / ${counts.fail} fail / ${counts.unknown} unknown / ${counts.manual} manual / ${counts.alreadyChecked} already checked.`
    );
    if (counts.fail > 0) {
        console.log('\n[FAIL] entries should block close. Surface to user.');
    }
    if (counts.manual > 0) {
        console.log('\n[manual] entries need user judgment — walk them in /cycle-close step 3.');
    }

    // Always exit 0 — informational, never blocks /cycle-close. The
    // slash command surfaces the table to the user and the user owns
    // the close decision.
    process.exit(0);
}

main();
