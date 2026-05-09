# Cycle process

Durable rules for how cycles are planned, executed, and closed. No cycle-specific content.

## What a cycle is

A cycle is a coherent unit of scope (~1–2 weeks at the current cadence) with:

- **One goal** stated in one paragraph at the top of the plan.
- **≤ 8 phases**, each fully autonomous **or** fully paired (no mixed mode within a phase).
- **EARS-format acceptance criteria** for every phase. Grep-testable by construction.
- **A defined Hard stops list** scoped to this cycle's risks.
- **A frozen-files authorization list** for any [`docs/INTERFACE_FENCE.md`](../../docs/INTERFACE_FENCE.md) entry the cycle legitimately needs to touch.

The plan lives at `docs/cycle-N-plan.md`. The template is [`docs/CYCLE_TEMPLATE.md`](../../docs/CYCLE_TEMPLATE.md).

## Cold-start orientation

Every agent picking up a cycle reads, in order:

1. [`NEXT_SESSION.md`](../../NEXT_SESSION.md) — current pickup point.
2. The active cycle plan it points to (`docs/cycle-N-plan.md`).
3. [`AGENTS.md`](../../AGENTS.md) — portable agent context.
4. [`CLAUDE.md`](../../CLAUDE.md) — Claude-specific overlay (if running in Claude).
5. [`ARCHITECTURE.md`](../../ARCHITECTURE.md) — only if the work touches an unfamiliar module.

Don't start writing code until you've confirmed direction with the user (or, in autonomous mode, the cycle plan itself directs you).

## Phase shape

Each phase has:

- A **single, sharp goal**: one new file, one extraction, one decision codified.
- **≤ 4 hours** of work. Larger means split.
- **EARS Acceptance** lines using `When [trigger], the [system] shall [response]` (or `While [precondition]...` / `If [unwanted], then...` variants). Each line is grep-testable.
- **Files touched** explicitly named.
- **Migration story** for any frozen-file change (file, why, alternative considered, consumer updates).

A phase is either **fully autonomous** (the agent can ship it without Matt's pairing) or **fully paired** (Matt's eyes/hands are on the keyboard for it). Don't mix modes within a phase: "I'll do steps 1–3 autonomously and pause for Matt at step 4" produces stale handoffs and partial commits.

## The cycle-close ritual

At cycle close, `/cycle-close` runs:

1. **Verify acceptance.** Walk every Acceptance line; confirm or surface failures. Don't ship if `npm test` or `npm run build` fail.
2. **Reconciliation pass** ([`.claude/hooks/cycle-close-reconcile.mjs`](../../.claude/hooks/cycle-close-reconcile.mjs)) — heuristic grep of EARS predicates against shipped commits + test output.
3. **Archive** the active plan to [`docs/archive/cycles/`](../../docs/archive/cycles/).
4. **Append BACKLOG** with the cycle's "Recently Completed" entry and any deferred items.
5. **Scaffold** `docs/cycle-(N+1)-plan.md` from [`docs/CYCLE_TEMPLATE.md`](../../docs/CYCLE_TEMPLATE.md).
6. **Refresh** [`NEXT_SESSION.md`](../../NEXT_SESSION.md) — full rewrite for cycle N+1, not an incremental edit.
7. **Surface** anything the cycle close didn't cover (open questions, deferred items, follow-up needed).

Don't auto-pick up the next phase after a cycle closes. Pause, summarize, let the user direct.

## NEXT_SESSION discipline

[`NEXT_SESSION.md`](../../NEXT_SESSION.md) is **always current-only** — a snapshot of the active cycle's pickup point. It is rewritten on cycle close, not edited incrementally with prior-cycle leftovers.

Required header:

```
> **Updated:** <ISO date>
> **For:** Cycle N
> **Pickup priority:** <single sentence>
```

Historical pickup state worth preserving lives in `docs/archive/wake-states/`. Not in NEXT_SESSION.

`/cycle-start` warns if `Updated:` is older than 7 days — stale handoffs are a known foot-gun.

## Scope discipline

- **Don't bypass the cycle plan to ship a "small fix" without surfacing it.** Even small fixes go through phase scope. If you find yourself reaching past the active phase, stop and ask.
- **Don't expand cycle scope mid-cycle.** New gameplay/perf/visual scope requires a new cycle, not a phase append.
- **Don't auto-bump versions.** Player-visible releases are explicit and reviewed.
- **Don't auto-post devlog or marketing content.** That's Matt's voice.
- **Don't modify [`.claude/commands/*.md`](../../.claude/commands/) without a cycle plan phase that explicitly authorizes it.** Slash commands are like schemas — they affect every future invocation.
- **Don't override the `/cycle-close` block on failing tests.** If `npm test` or `npm run build` fail, fix them first.

## Frozen files

See [`docs/INTERFACE_FENCE.md`](../../docs/INTERFACE_FENCE.md) for the durable list and authorization protocol. A cycle plan that legitimately needs a frozen-file edit names the file in its `## Frozen files` section with a migration story; the authorization is **per-cycle, per-phase**, not inherited.

If you propose touching a frozen file without authorization in the active cycle plan: **stop, surface to the user, wait for explicit OK.**

## What we don't adopt

- **Full ECS migration** (bitECS / koota / miniplex). The Three.js + bitECS hybrid pays a coupling tax that we're not willing to absorb without a clear payoff.
- **Full Kiro three-artifact spec split.** The cycle plan is a fused requirements+design+tasks artifact by design; EARS notation gives us testable acceptance without the three-doc overhead.
- **Full GitHub Spec Kit pipeline.** The `/speckit.analyze` cross-artifact-consistency idea informs the cycle-close reconciliation hook; the rest of the pipeline is more ceremony than the project needs.
- **The chained-handoff pattern over rolling NEXT_SESSION.** The current-only rewrite contract achieves the same hygiene with less surface.
- **Auto-published cycle-workflow as a Claude Code plugin.** Premature; revisit only if the workflow stabilizes across multiple cycles without churn.

## Memory

Persistent memory lives in `~/.claude/projects/C--Users-Mattm-X-games-3d-sds/memory/`. Update memory when:

- The user explicitly asks to remember something.
- A cycle closes (project status memory needs refresh).
- A non-obvious working preference surfaces.

Don't write to memory: code patterns (derivable from current state), git history (use `git log`), debugging recipes (the fix is in the code), ephemeral task state (use TodoWrite).
