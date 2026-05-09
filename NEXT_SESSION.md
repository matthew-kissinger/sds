# Next Session — Cycle 28 (`alignment`)

> **Updated:** 2026-05-09  
> **For:** Cycle 28  
> **Pickup priority:** Stream A1 — archive [`docs/archive/polish-program.md`](docs/archive/polish-program.md) and pull its thesis into [`DECISIONS.md`](DECISIONS.md). Lowest-risk warmup; unblocks A2/A3 doc consolidation.

Cycle 28 plan: [`docs/cycle-28-plan.md`](docs/cycle-28-plan.md). Cold-start orientation: read [`AGENTS.md`](AGENTS.md), then [`CLAUDE.md`](CLAUDE.md), then the cycle plan top-to-bottom.

## Goal

Close out the doc / code / process drift accumulated through Cycle 27. **No new gameplay, perf, or visual scope** — this is a closeout cycle for the cycle methodology itself. Internal-only; no version bump.

## Streams (all autonomous)

| Stream | Scope | Phases |
|---|---|---|
| **A** doc alignment | archive `polish-program.md` (now [`docs/archive/polish-program.md`](docs/archive/polish-program.md)), split rules into `.claude/rules/`, consolidate research, NEXT_SESSION contract, `docs/README.md` navigation index | A1-A5 |
| **B** god-module decomp | characterization tests under goldens → `main.js` ≤ 2,200 LOC + `TerrainBuilder.js` ≤ 1,400 LOC via Stillwater 9-phase playbook + `shared/` ESLint boundary | B0-B5 |
| **C** agent ergonomics | EARS in `CYCLE_TEMPLATE.md`, ≤ 8 phase rule, `EMERGENCY_STOPS.md`, `cycle-doc-dream` skill, `AGENTS.md` + `CLAUDE.md` (already landed) | C1-C5 |
| **D** hook enforcement | extend Stop hook + `/cycle-close` reconciliation + `/cycle-start` freshness check | D1-D3 |

19 phases total but each is small (≤ 4 hours). The whole cycle fits one overnight run if streams parallelize across worktrees.

## Already in place (alignment foundation, just landed in close commit)

- [`AGENTS.md`](AGENTS.md) — portable agent baseline (Codex / Cursor / Aider compat)
- [`CLAUDE.md`](CLAUDE.md) — Claude-specific overlay (cycle methodology, slash commands, hooks)
- [`docs/cycle-28-plan.md`](docs/cycle-28-plan.md) — full plan with EARS-format acceptance criteria
- [`.claude/settings.json`](.claude/settings.json) — Stop hook config (committed, shared)
- [`.claude/hooks/check-acceptance.mjs`](.claude/hooks/check-acceptance.mjs) — Stop hook (informational, never blocks)
- `.gitignore` inverted — `.claude/` is shared by default; only `settings.local.json`, `worktrees/`, `projects/` are personal

## Sequencing for the autonomous overnight run

```
A1 → A2 → A3 → A4 → A5            (doc alignment)
                ↓
              B0                  (characterization tests — safety harness)
                ↓
              B1 + B2 in parallel (main.js + TerrainBuilder.js extraction under goldens)
                ↓
              B3 + B4 + B5        (codification + deferral + ESLint)
                ↓
              C1 → C2 → C3 → C4 → C5  (ergonomics; C1 already landed)
                ↓
              D1 → D2 → D3        (hooks; D1 prototype already landed)
                ↓
              Cycle close (manual review next morning)
```

A1-A5 and C streams have no shared code surface; safe to parallelize. **B0 is non-negotiable** — every B phase depends on the goldens being committed first. B1 and B2 can run in separate worktrees against the same goldens.

## Hard stops (cycle-specific — see [`docs/cycle-28-plan.md`](docs/cycle-28-plan.md) for full list)

Surface to the user, do not proceed:

1. Sim-baseline goldens drift in Stream B (even one float ULP). Revert and re-think.
2. Refactor-baseline goldens drift in Stream B. Same posture.
3. Visual e2e SSIM regression > existing tolerance in Stream B.
4. Bundle size regression in Stream B. The refactor is supposed to be flat or smaller.
5. Any new gameplay / perf / visual scope proposed mid-cycle. This cycle is "no new features." Surface and defer.
6. Frozen-file change beyond the explicit cycle-28 authorization list (in the plan's `## Frozen files` section).

## What NOT to do

- **Don't** pick up Cycle 27 carryover phases (A, D-integration, E-integration, F-integration, G-verify, H, J, K, L, M, N). They're parked in [`docs/BACKLOG.md`](docs/BACKLOG.md), not Cycle 28 scope.
- **Don't** bump version. Internal-only cycle.
- **Don't** touch [`shared/`](shared/) deterministic kernels. Sim-baseline lock holds.
- **Don't** decompose [`OptimizedSheep.js`](js/OptimizedSheep.js) or [`GrassSystem.js`](js/GrassSystem.js) — Stream B3 codifies "leave alone" (cohesive by design).
- **Don't** rewrite [`main.js`](js/main.js)'s update loop or mode dispatch. Boot-sequence extraction only.
- **Don't** delete archived research docs. Move, don't delete.
- **Don't** adopt full ECS migration or full Kiro / Spec Kit toolchains. Cycle 28 plan's "What NOT to do" section enumerates why.

## Repo state at handoff

- 264/271 vitest specs pass (7 skipped). Up from 252.
- Production build clean: `main-*.js` 590 KB / 171 KB gzip (was 837 KB pre-Cycle-27; -247 KB).
- Last deploy on `main`: success.
- Working tree: clean after the close commit lands.

## Cycle 27 carryover (parked, not Cycle 28 scope)

See [`docs/BACKLOG.md`](docs/BACKLOG.md) Cycle 27 entry for the full list. Headlines: CF analytics token, daily-seed UI integration, replay UI integration, pointer-tour mount slot, itch deploy verify, camera state-machine collapse, OG card refresh, iPhone verify, title-screen identity pass, heightfield amplitude decision, devlog cadence.

## Reference table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-28-plan.md`](docs/cycle-28-plan.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-27-plan.md`](docs/archive/cycles/cycle-27-plan.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Closed cycles + deferred | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Slash commands | [`.claude/commands/`](.claude/commands/) — `/cycle-start`, `/cycle-close`, `/validate` |
| Hooks | [`.claude/hooks/`](.claude/hooks/) — `check-acceptance.mjs` (Stop) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player CHANGELOG | [`CHANGELOG.md`](CHANGELOG.md) |
| Press kit | [`PRESSKIT.md`](PRESSKIT.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| Claude overlay | [`CLAUDE.md`](CLAUDE.md) |

## Running locally

```
npm run dev    # Vite (:3000) + wrangler (:8787)
npm test       # vitest, ~2.6s full run
npm run build  # production build
```

URL params: `?scene=field|rolling-hills|open-country`, `?debug=gl`, `?cinematic=1`, `?ui=off`, `?sun=0.5`, `?perfMode=1`, `?tier=low|med|high`, `?tonemap=aces|neutral|linear|none`.
