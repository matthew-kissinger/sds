# NEXT_SESSION contract

> Drafted Cycle 28 Stream A4. Defines what [`NEXT_SESSION.md`](../NEXT_SESSION.md) is for, what it is not for, and how it gets refreshed.

## What NEXT_SESSION is

A **current-only snapshot** of the active development cycle's pickup point. A cold-start agent reads it first to learn:

1. Which cycle is active (the `For:` line).
2. When the snapshot was taken (the `Updated:` line).
3. Where to start (the `Pickup priority:` line).
4. The cycle's goal in one paragraph.
5. The phase landscape — what's done, what's next, what's parked.
6. Where the cycle plan lives, where the durable rules live, where to ask if a frozen file needs to be touched.

That's it. Anything else belongs elsewhere.

## What NEXT_SESSION is not for

- **Not a log of past cycles.** Closed-cycle deliverables go to [`docs/BACKLOG.md`](BACKLOG.md). Closed-cycle plans go to [`docs/archive/cycles/`](archive/cycles/).
- **Not a list of durable rules.** Project rules live in [`.claude/rules/`](../.claude/rules/). NEXT_SESSION's "Durable rules" line is one sentence pointing there.
- **Not a punch list.** TodoWrite tracks in-flight work for the active session. NEXT_SESSION is at most a one-line pointer to where work picks up.
- **Not historical pickup state.** Wake-state reports from autonomous runs go to [`docs/archive/wake-states/`](archive/wake-states/). Don't accrete prior-cycle pickup logs in NEXT_SESSION.
- **Not a scratchpad.** If you're tempted to add an "FYI" or "by the way" section, it belongs in DECISIONS.md, BACKLOG.md, or the active cycle plan instead.

## Required header

Every NEXT_SESSION file starts with this exact shape:

```
# Next Session — Cycle N (`<cycle-slug>`)

> **Updated:** <ISO date — yyyy-mm-dd>
> **For:** Cycle N
> **Pickup priority:** <single sentence — what to do first>
```

The three header lines are required. `/cycle-start` reads them on session open and warns the user if `Updated:` is older than 7 days (Stream D3).

## Lifecycle

NEXT_SESSION is rewritten **once per cycle**, at `/cycle-close`. It is not edited incrementally inside a cycle.

- **Cycle close** (Stream D2's reconciliation pass complete, all Acceptance items walked, plan archived) → NEXT_SESSION fully rewritten for cycle N+1. New `Updated:` date, new `For:` cycle, new `Pickup priority:`. Any leftover prose from the previous cycle is dropped, not folded in.
- **Mid-cycle** → NEXT_SESSION generally stays put. The active cycle plan is the source of truth for in-flight work; TodoWrite tracks per-session progress. A mid-cycle NEXT_SESSION refresh is allowed but rare — only when the pickup priority materially changes (e.g. a hard-stop reroute).
- **Autonomous overnight runs** → write a wake-state report under `docs/archive/wake-states/` describing what shipped vs parked. NEXT_SESSION is rewritten at the close of the run, the same way.

## Why current-only

A rolling NEXT_SESSION accretes guard text and stale warnings across cycles. Every "don't" line that survives one cycle gets a tax on every reader's attention forever. The rolling pattern was the right shape early in the project; by Cycle 27 it had grown to ~300 lines with overlap against [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) and DECISIONS.md.

The current-only contract trades:

- **Convenience** (one file shows the full project history) **for**
- **Hygiene** (one file shows the current state, period — historical state is in archive/).

Cold-start agents reach the relevant context faster, and there's nowhere for stale guidance to hide.

## Where former NEXT_SESSION content lives

- **"What NOT to do" durable section** → [`.claude/rules/cycle-process.md`](../.claude/rules/cycle-process.md) and the active cycle plan's "What NOT to do during this cycle" section.
- **Cycle-specific freezes** → the active cycle plan's `## Frozen files` section.
- **Closed-cycle pickup state worth preserving** → [`docs/archive/wake-states/`](archive/wake-states/) (one wake-state file per autonomous run) or [`docs/BACKLOG.md`](BACKLOG.md)'s closed-cycle entry.
- **Recent-changes log** → [`docs/BACKLOG.md`](BACKLOG.md) "Recently completed" entries, written by `/cycle-close`.
- **Durable project rules** → [`.claude/rules/`](../.claude/rules/) (4 domain-scoped files).
- **Frozen-file list** → [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) (which files are frozen + how authorization works).

## Linking conventions

- Always use markdown links so cold-start agents can click through.
- Use repo-root relative paths (e.g. `docs/cycle-28-plan.md`, not `cycle-28-plan.md` or `/Users/.../docs/cycle-28-plan.md`).
- The "Reference table" near the bottom of NEXT_SESSION names the source-of-truth doc for each topic — keep it short, don't duplicate content.

## Slash command consumers

- **`/cycle-start`** ([`.claude/commands/cycle-start.md`](../.claude/commands/cycle-start.md)) reads NEXT_SESSION first. The cycle plan path comes from there. Stream D3 adds a freshness check that warns if `Updated:` is > 7 days old.
- **`/cycle-close`** ([`.claude/commands/cycle-close.md`](../.claude/commands/cycle-close.md)) writes NEXT_SESSION at the end of the close ritual — full rewrite for cycle N+1, not an incremental edit.

## Hard rules

- **Never edit NEXT_SESSION mid-cycle to fold in prior-cycle leftovers.** If old context is worth keeping, archive it; if it isn't, drop it.
- **Never let the file grow past one screenful of skim** (currently ~110 lines is the working ceiling). If it's exceeding that, content is leaking in from BACKLOG, INTERFACE_FENCE, or DECISIONS.
- **Never leave the `Updated:` date stale.** If you touch NEXT_SESSION, refresh the date.
- **Never link to a closed cycle's plan from NEXT_SESSION as if it were active.** The active cycle plan is the only one NEXT_SESSION points at.
