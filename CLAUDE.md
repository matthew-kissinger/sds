# CLAUDE.md

> Claude Code overlay for `sds`. Read [`AGENTS.md`](AGENTS.md) first for portable agent context (build/test commands, conventions, deterministic-sim contract). This file adds the Claude-specific workflow: cycle methodology, slash commands, hooks, rule files, memory.

## Cycle methodology

Work is organized in numbered **development cycles**, each with a plan in [`docs/cycle-N-plan.md`](docs/). A cycle is a coherent unit of scope (~1-2 weeks at the current cadence). Each cycle:

1. Has a single goal stated in one paragraph.
2. Decomposes into ≤ 8 phases with EARS-format acceptance criteria.
3. Closes with `/cycle-close` — archives the plan, appends [`docs/BACKLOG.md`](docs/BACKLOG.md), scaffolds the next plan, refreshes [`NEXT_SESSION.md`](NEXT_SESSION.md).

**Cold-start agents read this order:**
1. [`NEXT_SESSION.md`](NEXT_SESSION.md) — current pickup state.
2. The active cycle plan it points to ([`docs/cycle-N-plan.md`](docs/)), if a cycle is already open.
3. This file + [`AGENTS.md`](AGENTS.md) for context.
4. [`ARCHITECTURE.md`](ARCHITECTURE.md) only if the work touches an unfamiliar module.

## Slash commands

| Command | Purpose | File |
|---|---|---|
| `/cycle-start` | Orient on active cycle, summarize state, ask where to start | [`.claude/commands/cycle-start.md`](.claude/commands/cycle-start.md) |
| `/cycle-close [slug]` | Close active cycle: verify acceptance, archive, scaffold next, refresh memory | [`.claude/commands/cycle-close.md`](.claude/commands/cycle-close.md) |
| `/validate [quick|full]` | Run tests + build + last-deploy check, terse PASS/FAIL | [`.claude/commands/validate.md`](.claude/commands/validate.md) |

`/cycle-start` and `/cycle-close` are the structured rituals — follow them step-by-step. They surface to the user before destructive action.

## Hooks

| Event | Hook | Behavior |
|---|---|---|
| `Stop` | [`.claude/hooks/check-acceptance.mjs`](.claude/hooks/check-acceptance.mjs) | Reads NEXT_SESSION → finds active cycle plan → counts unchecked `- [ ]` Acceptance items. If > 0, prints one informational line. Always exits 0. |

Hooks live in [`.claude/settings.json`](.claude/settings.json) (committed, shared). Personal permissions live in `.claude/settings.local.json` (gitignored).

## Rule files

Domain-scoped durable rules live in [`.claude/rules/`](.claude/rules/) and are loaded as project context.

| Rule file | Domain |
|---|---|
| `shared-sim.md` | Deterministic-sim boundary, sim-baseline lockdown |
| `scene-and-render.md` | Atmosphere, grass, heightfield, scene-loading rules |
| `cycle-process.md` | Cycle methodology guardrails |
| `multiplayer.md` | Worker / DO contract rules |
| `prose-and-voice.md` | Player-facing prose: no em-dashes, "one pasture and two islands" framing, Matt's voice cues |

[`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) lists **which files are frozen**; the rule files above explain **why**.

## NEXT_SESSION contract

[`NEXT_SESSION.md`](NEXT_SESSION.md) is **always current-only**: a snapshot of the active cycle's pickup point, or the next-cycle intake when no active cycle is open. Rules:

- Required header: `Updated: <ISO date>` + `For: Cycle N` + `Pickup priority: <single sentence>`.
- On `/cycle-close`, NEXT_SESSION is fully rewritten for cycle N+1 — not edited incrementally.
- Historical pickup state worth preserving lives in `docs/archive/wake-states/`.
- `/cycle-start` warns if `Updated:` is older than 7 days.

Full contract: [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) (written in Cycle 28 Stream A4).

## Frozen files

See [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) for the durable list and authorization protocol. Cycle-specific freezes live in the active cycle plan's `## Frozen files` section.

If you propose touching a frozen file without authorization in the active cycle plan: **stop, surface to the user, wait for explicit OK.**

## Acceptance criteria — EARS format

Cycle plans use [EARS notation](https://kiro.dev/docs/specs/) for testable acceptance criteria:

- **Event-driven**: "When [trigger], the [system] shall [response]."
- **State-driven**: "While [precondition], the [system] shall [response]."
- **Unwanted**: "If [unwanted], then the [system] shall [response]."

Example: "When Stream B1 ships, then `wc -l js/main.js` shall return ≤ 2,200."

Each line is grep-testable. The Stop hook ([`.claude/hooks/check-acceptance.mjs`](.claude/hooks/check-acceptance.mjs)) counts unchecked items; `/cycle-close` walks each one with the user before close.

## Memory

Persistent memory lives in `~/.claude/projects/C--Users-Mattm-X-games-3d-sds/memory/` (per the user's global CLAUDE.md). The auto-memory system tracks user preferences, project status, and feedback across sessions. Update memory when:

- The user explicitly asks to remember something.
- A cycle closes (project status memory needs refresh).
- A non-obvious working preference surfaces.

Don't write to memory: code patterns (derivable from current state), git history (use `git log`), debugging recipes (the fix is in the code), ephemeral task state (use TodoWrite).

## Working posture

- **Read [`NEXT_SESSION.md`](NEXT_SESSION.md) first** at session open. Don't start work without orientation.
- **One phase in flight at a time.** Mark the cycle plan checkbox as soon as it's done.
- **Surface drift before acting on it.** If you find yourself wanting to expand scope, stop and ask.
- **Run `/validate` before any cycle close.** Acceptance is non-negotiable.
- **Don't auto-bump versions.** Player-visible releases are explicit.
- **Don't auto-post marketing content.** Matt's voice.

## What NOT to do (Claude-specific)

- Don't bypass the cycle plan to ship a "small fix" without surfacing it. Even small fixes go through phase scope.
- Don't modify [`.claude/commands/*.md`](.claude/commands/) without a cycle plan phase that explicitly authorizes it.
- Don't run `/cycle-close` if `npm test` or `npm run build` fail. The slash command will block on this; don't override.
- Don't auto-pick up the next phase after closing one. Pause, summarize, let the user direct.

## Pointers

- [`AGENTS.md`](AGENTS.md) — portable agent context (build, test, conventions)
- [`docs/cycle-N-plan.md`](docs/) — active cycle (path in [`NEXT_SESSION.md`](NEXT_SESSION.md))
- [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) — frozen files
- [`docs/CYCLE_TEMPLATE.md`](docs/CYCLE_TEMPLATE.md) — cycle plan template
- [`docs/BACKLOG.md`](docs/BACKLOG.md) — closed cycles + deferred items
- [`DECISIONS.md`](DECISIONS.md) — chronological decisions log
