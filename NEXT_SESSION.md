# Next Session — Cycle 29 (`gamestate-decomp`)

> **Updated:** 2026-05-09  
> **For:** Cycle 29  
> **Pickup priority:** Cycle 29 plan is scaffolded as a stub at [`docs/cycle-29-plan.md`](docs/cycle-29-plan.md). It needs **Goal + Phases** filled in before code starts. Author hint: this is the `GameState.js` decomposition deferred from Cycle 28 B4 — target ≤ 800 LOC, follow the [`tests/refactor-baseline/`](tests/refactor-baseline/) characterization-harness pattern from Cycle 28 B0 before extracting.

Cycle 29 plan: [`docs/cycle-29-plan.md`](docs/cycle-29-plan.md). Cold-start orientation: read [`AGENTS.md`](AGENTS.md), then [`CLAUDE.md`](CLAUDE.md), then the cycle plan top-to-bottom.

## Goal

Decompose [`js/GameState.js`](js/GameState.js) (1,313 LOC) under a refactor-baseline characterization harness. Mode dispatch is currently a switch chain that could become data-driven (mode → config object, replacing per-mode branches in `setGameMode` / `getBounds` / objective wiring). Acceptance bar from BACKLOG: `wc -l js/GameState.js` ≤ 800.

The carryover from Cycle 28 was zero — every Cycle 28 phase shipped. The deferred GameState work is the *one* thing in BACKLOG "Deferred" tagged as a Cycle 29 candidate; flesh out that scope into ≤ 8 phases with EARS acceptance lines, then run `/cycle-start`.

## Streams (proposed — needs your input)

| Stream | Scope | Phase target |
|---|---|---|
| **A** characterize | refactor-baseline goldens for mode dispatch + win-condition output across all modes | A0 (1-2 phases) |
| **B** decompose | extract mode config to data-driven map, extract win-condition resolver, extract objective state machine | B1-B3 (3 phases) |
| **C** integration | wire MultiplayerState mode-shape coordination to the new GameState contract; verify 2p-local + competitive + timed paths | C1 (1 phase) |

Total proposed: **5 phases**. Comfortably under the ≤ 8 rule. Adjust before /cycle-start.

## Already in place (alignment foundation from Cycle 28)

- [`tests/refactor-baseline/`](tests/refactor-baseline/) characterization-test harness pattern (mesh-hash + scatter-positions + bundle-sizes goldens). Use the same structure for Cycle 29 mode-dispatch goldens.
- [`docs/CYCLE_TEMPLATE.md`](docs/CYCLE_TEMPLATE.md) mandates EARS-format Acceptance + ≤ 8 phase rule + references to [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md).
- [`.claude/hooks/cycle-close-reconcile.mjs`](.claude/hooks/cycle-close-reconcile.mjs) auto-evaluates testable predicates at cycle close — write Acceptance lines so the hook can grep them (e.g. `When B2 ships, then `wc -l js/GameState.js` shall return ≤ 800`).
- [`.claude/skills/cycle-doc-dream/SKILL.md`](.claude/skills/cycle-doc-dream/SKILL.md) on hand if doc drift accumulates mid-cycle.

## Hard stops (cycle-specific — full durable list at [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md))

To draft once Phases are scoped. Likely additions:

1. Sim-baseline goldens drift in Stream B (mode dispatch is sim-adjacent — touching `setGameMode` could affect spawn count or boundary).
2. New refactor-baseline mode-dispatch goldens drift mid-extraction (same posture as B0 from Cycle 28).
3. MultiplayerState contract change without paired update — surface and pause; Cycle 29 isn't authorized to touch the wire protocol.

## Durable rules

See [`.claude/rules/`](.claude/rules/) for durable project rules. Cycle-29-specific scope guards live in [`docs/cycle-29-plan.md`](docs/cycle-29-plan.md)'s "What NOT to do" section once it's drafted.

## Repo state at handoff

- Cycle 28 closed clean (commit `<close-sha>` — see git log).
- 272/271 vitest specs pass (7 skipped).
- Production build: `main-*.js` 575 KB / `three-*.js` 603 KB. Both ≤ pre-Cycle-28 baseline.
- Last deploy on `main`: success (run from cycle-28 close commit).
- `npx eslint shared/` zero errors.
- Working tree clean after the close commit lands.

## Cycle 28 carryover (none)

All 19 Cycle 28 phases shipped end-to-end. The cycle plan resolved Q1-Q5 (Cycle 27 closed before 28; no version tag; GameState deferred to 29; no MADR; no chained-handoff). Wake-state runbook archived at [`docs/archive/wake-states/wake-state-2026-05-09-cycle-28.md`](docs/archive/wake-states/wake-state-2026-05-09-cycle-28.md).

## Reference table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-29-plan.md`](docs/cycle-29-plan.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-28-plan.md`](docs/archive/cycles/cycle-28-plan.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Closed cycles + deferred | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Slash commands | [`.claude/commands/`](.claude/commands/) — `/cycle-start`, `/cycle-close`, `/validate` |
| Hooks | [`.claude/hooks/`](.claude/hooks/) — `check-acceptance.mjs` (Stop) + `cycle-close-reconcile.mjs` |
| Skills | [`.claude/skills/`](.claude/skills/) — `cycle-doc-dream` |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player CHANGELOG | [`CHANGELOG.md`](CHANGELOG.md) |
| Press kit | [`PRESSKIT.md`](PRESSKIT.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| Claude overlay | [`CLAUDE.md`](CLAUDE.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |

## Running locally

```
npm run dev    # Vite (:3000) + wrangler (:8787)
npm test       # vitest, ~1.5s full run (272 specs)
npm run lint   # ESLint on shared/ (deterministic boundary)
npm run build  # production build
```

URL params: `?scene=field|rolling-hills|open-country`, `?debug=gl`, `?cinematic=1`, `?ui=off`, `?sun=0.5`, `?perfMode=1`, `?tier=low|med|high`, `?tonemap=aces|neutral|linear|none`.
