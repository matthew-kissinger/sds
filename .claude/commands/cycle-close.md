---
description: Close the active cycle — verify acceptance, archive plan, update BACKLOG, scaffold next cycle, refresh NEXT_SESSION + memory.
argument-hint: [next-cycle-slug]
---

You are closing the active development cycle. This is a **structured ritual** — follow each step exactly. Surface to the user before any destructive action.

## Steps

### 1. Locate the active cycle

Read [`NEXT_SESSION.md`](NEXT_SESSION.md). Extract the active-plan path. Extract the cycle number `N` from the filename (e.g. `docs/cycle-5-plan.md` → `N=5`).

### 2. Verify acceptance criteria — run in parallel

- `npm test 2>&1 | tail -5` — must show all passing, no failures
- `npm run build 2>&1 | tail -5` — must succeed
- `gh run list --limit 1 --json conclusion,headBranch,displayTitle` — last deploy on `main` must be `"conclusion":"success"`
- `git status --short` — should be clean (warn if dirty)

If any of these fail: **STOP**. Report what failed. Do not proceed with close.

### 3. Walk the active plan's "Success criteria" / "Acceptance criteria" section

Read the active plan. For each checkbox item, ask the user "is this done?" If any are not done:

- Offer to defer to next cycle (will be recorded in `BACKLOG.md` carryover).
- Or block close until the user resolves it.

Do not auto-check items the user hasn't confirmed.

### 4. Get the next cycle slug

Use `$1` if provided. Otherwise ask: "What's the slug for the next cycle? Format suggestion: `<descriptive-slug>` (e.g. `island-and-woods`)."

Confirm the next cycle plan filename will be `docs/cycle-{N+1}-plan.md`.

### 5. Archive the closed plan

```
mkdir -p docs/archive/cycles
git mv docs/cycle-N-plan.md docs/archive/cycles/cycle-N-plan.md
```

If there's an associated hardening doc (e.g. `cycle-N-hardening.md`) and it's also closed, archive that too.

### 6. Append `BACKLOG.md`

Add an entry under "Recently Completed" at the top of [`docs/BACKLOG.md`](docs/BACKLOG.md):

```markdown
## cycle-N — <one-line goal> (closed YYYY-MM-DD)

- Shipped: <X>/<Y> phases — <one-line summary of what landed>
- Plan: [docs/archive/cycles/cycle-N-plan.md](archive/cycles/cycle-N-plan.md)
- PRs: <list, one per line, with markdown links>
- Carryover: <items deferred to next cycle, or "none">
- Notes: <anything surprising — perf wins, architectural shifts, etc.>
```

### 7. Scaffold the next cycle plan

Copy [`docs/CYCLE_TEMPLATE.md`](docs/CYCLE_TEMPLATE.md) to `docs/cycle-{N+1}-plan.md`. Replace `{{number}}` with `N+1` and `{{slug}}` with the slug from step 4. Replace the date placeholder with today's date. Leave the rest as the stub for the user to fill in next session.

### 8. Update `NEXT_SESSION.md`

- Header line: change cycle number and slug.
- "Cold-start" line: update the active-plan link to `docs/cycle-{N+1}-plan.md`.
- "What to pick up next" section: replace with a brief stub like "Cycle {N+1} plan is scaffolded; needs Goal + Phases filled in. Run `/cycle-start` after that."
- Reference table: bump active-cycle row to the new plan.

### 9. Update memory

Edit the auto-memory `project_status.md` and `MEMORY.md` (the path is in the system prompt's "auto memory" section — don't hardcode it). Update one-line descriptions to point at the new cycle.

### 10. Show the diff before committing

```
git diff --stat
git status --short
```

Read the diff back to the user. Ask: **"Commit and push?"**

Do not stage or commit until the user confirms.

### 11. On user confirm

Stage, commit, push:

```bash
git add docs/archive/cycles/cycle-N-plan.md docs/cycle-N-plan.md \
        docs/cycle-{N+1}-plan.md docs/BACKLOG.md NEXT_SESSION.md
git commit -m "docs: close cycle-N + scaffold cycle-{N+1}

<one-paragraph summary of what shipped this cycle>"
git push origin main
```

(Adjust `git add` paths to match what actually changed. The point is to be explicit, not catch-all.)

## Don't

- **Don't auto-start the next cycle.** Closing and starting are deliberate, separate, human-gated passes.
- **Don't merge any open PRs as part of close.** PR merge is per-task.
- **Don't push without showing the diff first.** The user must see what's changing.
- **Don't skip the acceptance check.** The whole point of the ritual is forcing honesty about "done."
- **Don't rewrite or compress prior `BACKLOG.md` entries.** Append-only.

## Hard stops

Surface to the user, don't proceed:

- Tests fail or build fails → fix the code first, retry close after.
- Last deploy on `main` is red → fix and redeploy first.
- User has uncommitted changes unrelated to close → ask whether to stash, commit, or abort.
- Acceptance criteria item that's clearly not done but user says "close anyway" → require an explicit "yes I'm closing with X open" confirmation, and the open item goes into `BACKLOG.md` Carryover.
