---
description: Reflective consolidation pass over the docs tree — identify duplicate or stale docs, propose folds into DECISIONS.md, surface candidates for archival. Manual invocation only.
---

# cycle-doc-dream

Mirror of the [Auto Dream](https://claudefa.st/blog/guide/mechanics/auto-dream) memory-consolidation pattern, applied to *docs* instead of memory. Run on demand — usually at cycle close, sometimes when doc drift becomes visible (root `docs/` count creeping past 15, NEXT_SESSION growing past 110 lines, repeated "where's the canonical version of X" questions).

The skill **proposes** consolidations; it does not move or delete files. The user reviews and approves each move individually.

## When to invoke

Manual only. Good triggers:

- `/cycle-close` finishes; consider running this before scaffolding the next cycle plan.
- `ls docs/*.md | wc -l` returns > 15.
- A reader asks "where's the canonical X?" and the answer requires reading three docs.
- A research dossier has outlived its cycle and the durable finding isn't in [`DECISIONS.md`](../../../DECISIONS.md) yet.
- Wake-state files from autonomous runs are accumulating in [`docs/archive/wake-states/`](../../../docs/archive/wake-states/) without a summary in BACKLOG.

## Steps

### 1. Inventory

List the docs tree:

```bash
ls docs/*.md
ls docs/archive/research/*.md
ls docs/archive/cycles/*.md
ls docs/archive/wake-states/*.md
wc -l NEXT_SESSION.md docs/INTERFACE_FENCE.md docs/CYCLE_TEMPLATE.md
```

### 2. Tag each top-level doc

For every file at `docs/` root, tag with one of:

- **active** — describes current state (cycle plan, BACKLOG, INTERFACE_FENCE).
- **how-to** — durable extension/testing guide (adding-a-biome.md, tree-pipeline.md).
- **reference** — durable lookup (NEXT_SESSION_CONTRACT, README, EMERGENCY_STOPS).
- **research** — cycle-specific dossier whose findings should fold into DECISIONS.
- **stale** — doc that describes a prior state that no longer reflects reality (closed cycle plan, outdated execution policy).

### 3. Propose moves

For each tagged file, surface a recommendation:

- `active` → keep at top level.
- `how-to` / `reference` → keep at top level if it's load-bearing for cold-start readers; archive if it duplicates an existing reference.
- `research` → propose a 2–3 line summary entry for [`DECISIONS.md`](../../../DECISIONS.md) (the "we considered X, picked Y because Z" form). Then propose moving the file to `docs/archive/research/`.
- `stale` → propose moving to `docs/archive/cycles/` (closed plan), `docs/archive/wake-states/` (wake-state), or proposing deletion (rare — only for true scratch work).

### 4. Cross-reference audit

For each proposed move, check what links into the file:

```bash
grep -rln "<filename>" docs/ NEXT_SESSION.md README.md CHANGELOG.md DECISIONS.md
```

For each hit, propose an updated link target (archive path or DECISIONS section anchor).

### 5. Surface the consolidation list to the user

Emit a structured list:

```
## Proposed consolidations

### To archive (move + add DECISIONS entry)

- `docs/<file>.md`
  - Tag: research / stale
  - Proposed destination: `docs/archive/research/<file>.md`
  - Proposed DECISIONS entry: <2-3 line summary>
  - Cross-refs to update: <count> hits in <files>

### To keep at top level

- `docs/<file>.md`
  - Tag: <tag>
  - Reason to keep: <one line>

### Outstanding questions

- <question>
- <question>
```

Wait for the user to approve, reject, or modify each item. **Do not move files until explicit approval.**

### 6. Execute approved moves

Per approved item:

1. `git mv docs/<file>.md docs/archive/<dest>/<file>.md` (preserves history).
2. Update DECISIONS.md with the proposed summary entry.
3. Update each cross-reference to the new path.
4. Re-run `wc -l docs/*.md | tail -1` to confirm the top-level count is in scope.

## Don't

- **Don't delete originals.** Move, don't delete. Originals preserve the cycle's reasoning even after the durable finding folds into DECISIONS.
- **Don't auto-execute.** This is a proposal step. The user owns the decision on each move.
- **Don't fold rule files into research summaries.** Durable rules belong in [`.Codex/rules/`](../../rules/), not DECISIONS.
- **Don't compress prior DECISIONS entries.** New decisions append; superseded decisions get a date-stamped supersedure entry, not a rewrite.
- **Don't move `NEXT_SESSION.md`, `INTERFACE_FENCE.md`, `CYCLE_TEMPLATE.md`, or `BACKLOG.md`.** They're load-bearing at top level.

## Why "dream"

The Auto Dream pattern is reflective — between sessions, scan for redundancy, fold near-duplicates into a single canonical entry, archive the originals. The same shape applies to docs: most cycles produce 1–3 dossiers that have a 2-line durable finding inside a 200-line write-up. The dream pass extracts the finding and parks the write-up.

The Cycle 28 Stream A1–A4 pass was the first hand-run of this skill (collapsed `polish-program.md`, archived 17 research dossiers, wrote `NEXT_SESSION_CONTRACT.md`). Packaging it lets future cycles run it routinely instead of letting drift accumulate for 27 cycles before the next big consolidation.
