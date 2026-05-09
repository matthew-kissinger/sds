# Next Session — Cycle 30 (`tbd`)

> **Updated:** 2026-05-09
> **For:** Cycle 30
> **Pickup priority:** Cycle 29 closed end-to-end on the autonomous overnight run; Cycle 30 plan is scaffolded as a stub at [`docs/cycle-30-plan.md`](docs/cycle-30-plan.md) **with placeholder slug `tbd`**. Pick a slug, rename the file, fill in Goal + Phases, then run `/cycle-start`. Author hint inside the stub points at two ready candidates from BACKLOG: **MP island scenes** (Worker + obstacleAvoidance) and **Heightfield Y full unification** (mesh-aligned bake replacing the +0.05m defensive lift).

Cycle 30 plan: [`docs/cycle-30-plan.md`](docs/cycle-30-plan.md). Cold-start orientation: read [`AGENTS.md`](AGENTS.md), then [`CLAUDE.md`](CLAUDE.md), then the cycle plan top-to-bottom.

## Cycle 29 close summary (autonomous overnight run, 2026-05-09)

All 8 phases shipped end-to-end across 9 commits on `main`:

| Phase | Commit | LOC delta | Module |
|---|---|---|---|
| A0 — refactor-baseline harness | [`d15233a`](https://github.com/matthew-kissinger/sds/commit/d15233a) | +971 (test) | `tests/refactor-baseline/gamestate-harness.js` + spec + fixture |
| B1 — mode capability table | [`1def95d`](https://github.com/matthew-kissinger/sds/commit/1def95d) | -21 | [`js/gamestate/modes.js`](js/gamestate/modes.js) |
| B2 — polygon-spawn helpers | [`681bda8`](https://github.com/matthew-kissinger/sds/commit/681bda8) | -125 | [`js/gamestate/polygonSpawn.js`](js/gamestate/polygonSpawn.js) |
| B3 — win-condition resolver | [`90ca26d`](https://github.com/matthew-kissinger/sds/commit/90ca26d) | -50 | [`js/gamestate/winConditions.js`](js/gamestate/winConditions.js) |
| B4 — objective state machine | [`0e536d2`](https://github.com/matthew-kissinger/sds/commit/0e536d2) | -51 | [`js/gamestate/objective.js`](js/gamestate/objective.js) |
| B5 — completion + leaderboard | [`b692ae0`](https://github.com/matthew-kissinger/sds/commit/b692ae0) | -174 | [`js/gamestate/completion.js`](js/gamestate/completion.js) |
| B6 — startSandboxGame | [`5e31791`](https://github.com/matthew-kissinger/sds/commit/5e31791) | -147 | [`js/gamestate/sandboxStart.js`](js/gamestate/sandboxStart.js) |
| C1 — MP↔GameState contract | [`6222c99`](https://github.com/matthew-kissinger/sds/commit/6222c99) | +291 (test) | `tests/integration/gamestate-mp-contract.spec.ts` |

Net `js/GameState.js`: **1,313 → 745 LOC (-568, -43%)**. Cycle target ≤ 800 hit with 55-LOC headroom. Six new sub-modules in [`js/gamestate/`](js/gamestate/) totaling 875 LOC; GameState is now a thin orchestrator.

## Validation gates at close

- `npm test` — **290 / 297 pass** (7 skipped are e2e/flow). Was 272 / 271 pre-cycle; +18 new specs (5 gamestate-mode-dispatch + 13 gamestate-mp-contract).
- `npm run build` — clean, 4.06s. `main-*.js` 575 KiB ≤ 576 fixture; `three-*.js` 603 KiB ≤ 603 fixture. No bundle regression.
- `npx eslint shared/` — exit 0.
- Cycle-close reconcile hook — 5 / 6 acceptance items resolve auto-pass; 1 (deploy success) gated on Matt's manual push.

## Pickup priority for Cycle 30

The Cycle 30 plan is a stub. Pick scope first, then run `/cycle-start`.

**Author hint inside the stub:**

1. **MP island scenes** — Rolling Hills + Open Country in multiplayer. Cycle 6's `TreePlacement` lift made this feasible; remaining work is wiring the obstacle bundle into Worker GameSim init + applying `obstacleAvoidance` in the shared sheep/dog tick. Solo Phase 2 wiring is the template. Sim-deterministic; will need careful sim-baseline regen story.
2. **Heightfield Y full unification** — bake `displacedHeights: Float32Array` mirroring the terrain mesh vertex grid; replace the +0.05m defensive lift in `Heightfield.surfaceY`. Triangle-interp algorithm (find cell → find triangle → barycentric coords). Touches a frozen file; needs migration story + sim-baseline regen.

Other Deferred candidates (less ready): bespoke pixel-forge rocks, octahedral impostors v2, cross-module polygon-spawn dedup ripple from Cycle 29 B2, CYCLE_TEMPLATE.md regex-collision fix.

## Already in place (alignment foundation through Cycle 29)

- [`tests/refactor-baseline/`](tests/refactor-baseline/) characterization-test harness pattern — Cycle 28 B0 extended in Cycle 29 A0 with the gamestate-mode-dispatch fixture. Same regen discipline applies.
- [`docs/CYCLE_TEMPLATE.md`](docs/CYCLE_TEMPLATE.md) mandates EARS Acceptance + ≤ 8 phases + EMERGENCY_STOPS reference. **Note:** Cycle 30 should rename the template's "## Acceptance criteria — EARS format" explainer to avoid the reconcile-hook regex collision Cycle 29 hit (BACKLOG Deferred entry).
- [`.claude/hooks/cycle-close-reconcile.mjs`](.claude/hooks/cycle-close-reconcile.mjs) auto-evaluates testable predicates at cycle close. Acceptance lines like ``When B2 ships, then `wc -l js/GameState.js` shall return ≤ 800`` are auto-checked.
- [`.claude/skills/cycle-doc-dream/SKILL.md`](.claude/skills/cycle-doc-dream/SKILL.md) on hand if doc drift accumulates mid-cycle.

## Hard stops (cycle-specific — full durable list at [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md))

To draft once Phases are scoped. Likely additions (depending on chosen scope):

- **MP island scenes path:** sim-baseline drift (Worker + client must produce identical traces); `MultiplayerState` contract change without paired update; wire-protocol change without authorization in the active phase scope.
- **Heightfield unification path:** any heightfield re-bake that breaks an existing scene's visible terrain; refactor-baseline `terrain-mesh-hash.json` drift mid-extraction; consumers (mesh, grass, sim, camera) reading from inconsistent sources mid-migration.

## Durable rules

See [`.claude/rules/`](.claude/rules/) for durable project rules. Cycle-30-specific scope guards live in [`docs/cycle-30-plan.md`](docs/cycle-30-plan.md)'s "What NOT to do" section once it's drafted.

## Repo state at handoff

- Cycle 29 closed clean (pending push by Matt — autonomous run committed locally but did not push so the prod deploy is human-gated).
- 290/297 vitest specs pass (7 skipped).
- Production build: `main-*.js` 575 KiB / `three-*.js` 603 KiB. Both ≤ pre-Cycle-29 baseline.
- Last deploy on `main`: success (run from cycle-28 close commit; cycle-29 close has not yet pushed).
- `npx eslint shared/` zero errors.
- Working tree dirty after the close commit lands (the 9 Cycle 29 commits + the close commit are local and unpushed).

## Cycle 29 carryover (none)

All 8 Cycle 29 phases shipped end-to-end. The cycle plan resolved Q1-Q3 (sub-modules under `js/gamestate/`, win-conditions wraps shared, no frozen-file edits). No Cycle 30 pickups inherited from Cycle 29's scope.

## Reference table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-30-plan.md`](docs/cycle-30-plan.md) (stub — needs Goal + Phases) |
| Latest closed cycle | [`docs/archive/cycles/cycle-29-plan.md`](docs/archive/cycles/cycle-29-plan.md) |
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
| GameState package (Cycle 29) | [`js/gamestate/`](js/gamestate/) — modes, polygonSpawn, winConditions, objective, completion, sandboxStart |

## Running locally

```
npm run dev    # Vite (:3000) + wrangler (:8787)
npm test       # vitest, ~1.5s full run (290 specs + 7 skipped)
npm run lint   # ESLint on shared/ (deterministic boundary)
npm run build  # production build
```

URL params: `?scene=field|rolling-hills|open-country`, `?debug=gl`, `?cinematic=1`, `?ui=off`, `?sun=0.5`, `?perfMode=1`, `?tier=low|med|high`, `?tonemap=aces|neutral|linear|none`.
