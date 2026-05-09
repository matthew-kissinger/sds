# Meta-cycle execution policy (autonomous overnight runs)

> Drafted 2026-05-06 for the mega-Cycle 25 overnight run. Durable policy for any future autonomous mega-cycle. Cold-start agents picking up an autonomous run read this first.

## Mode

This document governs **autonomous overnight execution**: the user (Matt) is asleep, no interactive review is possible, the device may be shared with another agent on a different project. Decisions that would normally be "ask Matt" become **policy lookups** in this doc.

## Hard rules

These never change regardless of cycle scope:

1. **Branch only.** All work commits to a dedicated branch (e.g. `meta-cycle-overnight-YYYY-MM-DD`). Never push to `main`.
2. **No tags pushed.** Version tags (`v1.5.0`, `v2.0.0`) are created on the branch but **not pushed to origin**. User pushes after morning review.
3. **No production deploy.** GH Actions deploys via `git push origin main`; we don't touch main.
4. **No destructive ops on shared state.** No `git reset --hard origin/main`, no `git push --force`, no `gh release create`, no `npm publish`, no `cf wrangler deploy`.
5. **No interactive prompts.** Anything requiring `read -p`, `gh prompt`, or interactive `npm` flows is skipped with a log entry.
6. **No PII in logs.** Any environment variable, credential, or user identifier is redacted from `HARDSTOP.md` / `SKIPPED.md` / wake-state report.

## Decision flow on hard stops

A "hard stop" is any acceptance-criterion failure listed in the cycle plan's Hard Stops section. In autonomous mode:

```
on hard stop:
  1. git diff > cycle25-validation/<phase>/diff.patch       # save the work
  2. git revert HEAD --no-edit                              # roll back the failed commit
  3. write HARDSTOP.md with: phase, trigger, validation output, what was reverted
  4. continue with the next phase NOT dependent on the parked one
  5. dependent phases: write SKIPPED.md and skip
```

Park-and-continue, not park-and-halt. The wake-state report enumerates everything parked so the morning review knows what didn't ship.

## Decision flow on validation regressions

Validation runs after every code-changing phase. On regression:

| Regression severity | Autonomous action |
|---|---|
| < 0.02 SSIM / < 1% perf delta | Accept; log to phase notes |
| 0.02–0.05 SSIM / 1–5% perf delta | Accept with warning; log to phase HARDSTOP.md as "soft stop" but continue (downstream phase may absorb it) |
| > 0.05 SSIM / > 5% perf delta | Hard stop; revert phase commit; park |
| Sim-baseline byte drift | Hard stop ALWAYS; revert; park; flag for manual review |
| Build fail | Hard stop; revert; park; downstream phases skip |
| Vitest fail (related to changes) | Investigate via test output; if expected (e.g. desat test deleted post-Phase-B), update test; if unexpected, revert phase |
| Vitest fail (unrelated) | Log to wake-state report; continue (probably a flaky test, not our cycle's issue) |

## Per-phase commit pattern

Each phase follows a consistent commit shape so review is mechanical:

```
phase start:
  git checkout -b cycle-25-phaseX-impl

phase work (multiple commits OK):
  git commit -m "feat(cycle-25-X): <step description>"
  ...

phase validation (validate before merging back):
  npm run validation:lod              # if applicable
  npm run validation:screenshots      # if applicable
  npm run validation:perf             # if applicable

phase complete (validation green):
  git checkout meta-cycle-overnight-YYYY-MM-DD
  git merge --no-ff cycle-25-phaseX-impl -m "feat(cycle-25-X): <phase summary>"
  git tag cycle-25-phaseX-complete

phase parked (validation fail):
  # already reverted, on the meta-cycle branch
  write cycle25-validation/phaseX/HARDSTOP.md
```

The sub-branch tags + `--no-ff` merges leave a readable history for morning review.

## Resource limits (shared device)

Codex agent on a different project shares the device. Practical caps:

- **Playwright concurrency:** max 2 workers (default 4).
- **Total RAM:** monitor `tasklist` / Get-Process at phase boundaries; if working-set > 24 GB, throttle next phase by serializing builds + tests.
- **Disk:** `cycle25-validation/` budget capped at 500 MB. Compress old captures with `tar.gz` between phases.
- **Network:** Wrangler dev (8787), Vite (3000), Playwright. Record claimed ports in `~/.coordination/sds-claude-meta.json` (PID, ports, branch, timestamp).
- **GPU:** Playwright headless uses SwiftShader (CPU); does not contend with another agent's GPU work.
- **Notifications:** suppress per-task chimes (CLAUDE.md `yamaha-notify.ps1`); only fire on final wake-state report.

## Coordination file format

`~/.coordination/sds-claude-meta.json`:

```json
{
  "agent": "claude-code-2026-05-06-overnight",
  "project": "sds",
  "branch": "meta-cycle-overnight-2026-05-06",
  "ports": [3000, 8787],
  "started": "2026-05-06T22:00:00Z",
  "currentPhase": "C",
  "phases": {
    "A": "complete",
    "B": "complete",
    "C": "in_progress",
    "D": "pending",
    "E": "pending",
    "F": "pending",
    "G": "pending",
    "H": "pending"
  }
}
```

Updated at every phase boundary. Other agents on the device can read this to know who's doing what.

## Final wake-state report

Last commit on the branch is `chore(meta-cycle): wake-state report` adding `docs/wake-state-YYYY-MM-DD.md`:

```markdown
# Wake-state report — YYYY-MM-DD

## Status
- Branch: `meta-cycle-overnight-YYYY-MM-DD`
- Final commit: <sha>
- Phases shipped: A, B, ..., H
- Phases parked: <none / list with HARDSTOP.md links>
- Phases skipped: <none / list with SKIPPED.md links>

## What shipped
- <one line per shipped phase, key delta>

## What's parked (review needed)
- <phase: trigger: link to HARDSTOP.md>

## Validation summary
- `validation:lod` — <green/yellow/red>
- `validation:screenshots` — <green/yellow/red, count of failed cells>
- `validation:perf` — <green/yellow/red, p99 delta>
- Vitest — <pass/fail count>
- Build — <clean / size delta>

## Recommended morning actions
1. Review HARDSTOP.md files (<count>)
2. Approve + commit golden screenshots if Phase A captures look correct
3. Merge to main + push tag if cycle is shippable
4. Re-run parked phases manually with context

## Cycle 26 next
- <stub plan link>
```

## Style: minimal commentary in commits

Autonomous commits should be terse. Commit messages follow the project's existing pattern:

```
feat(cycle-25-A): build tools/validation/lod-compare.mjs
feat(cycle-25-B): drop LOD1 desktop + alphaHash crossfade band 180-200m
feat(cycle-25-B): delete AtmosphericDesatPatch.js + plumbing (-180 LOC)
fix(cycle-25-C): height-fog density patch composes with onBeforeCompile chain
```

Don't write essays in commit messages. The plan doc is the essay.

## What this policy does NOT cover

- **Multi-day autonomous runs.** This policy is for one overnight (~8-12 hours). Multi-day runs need session resumption logic not yet specified.
- **Multi-agent on same project.** This policy assumes one agent in this repo at a time. If two Claude/Codex agents both want to edit `sds/`, coordination is undefined.
- **External service writes.** No Slack messages, no email sends, no GitHub issue/PR creation, no Cloudflare Worker deploys. All of those are user-gated.

## Versioning of this policy

This is v1 (drafted 2026-05-06). Future autonomous runs may amend. Each amendment notes the prior version's last-applied date.
