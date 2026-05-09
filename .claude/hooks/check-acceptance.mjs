#!/usr/bin/env node
// .claude/hooks/check-acceptance.mjs
//
// Stop-hook: surface unchecked acceptance items in the active cycle plan.
// Reads NEXT_SESSION.md, finds the active cycle plan path, counts unchecked
// `- [ ]` items in its `## Success criteria` or `## Acceptance criteria`
// section, prints a one-liner if any remain.
//
// Always exits 0 — informational, never blocking. Silent when there's nothing
// to surface (no plan, no acceptance section, or all items checked).
//
// Cross-platform: runs via `node` from repo root. Wired into .claude/settings.json
// as a Stop hook.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();
const nextSession = join(repoRoot, 'NEXT_SESSION.md');

if (!existsSync(nextSession)) process.exit(0);

const ns = readFileSync(nextSession, 'utf8');

const planMatch = ns.match(/docs\/cycle-(\d+)-plan\.md/);
if (!planMatch) process.exit(0);

const cycleN = planMatch[1];
const planPath = join(repoRoot, 'docs', `cycle-${cycleN}-plan.md`);
if (!existsSync(planPath)) process.exit(0);

const plan = readFileSync(planPath, 'utf8');

const sectionRe = /^##+\s+(?:Success|Acceptance) criteria.*$/im;
const start = plan.search(sectionRe);
if (start === -1) process.exit(0);

const after = plan.slice(start);
const nextSectionRe = /\n##\s+\S/m;
const nextSectionIdx = after.slice(1).search(nextSectionRe);
const block = nextSectionIdx === -1 ? after : after.slice(0, nextSectionIdx + 1);

const unchecked = (block.match(/^\s*-\s\[\s\]/gm) || []).length;
const checked = (block.match(/^\s*-\s\[[xX]\]/gm) || []).length;
const total = unchecked + checked;

if (total === 0 || unchecked === 0) process.exit(0);

console.log(
  `[cycle-${cycleN}] ${unchecked}/${total} acceptance items still unchecked. Run /cycle-close when ready to walk them.`
);
process.exit(0);
