# Next Session — Cycle 31 (`tbd`)

> **Updated:** 2026-05-09
> **For:** Cycle 31
> **Pickup priority:** Cycle 30 (`heightfield-unify`) closed end-to-end on the autonomous run. Cycle 31 plan is scaffolded as a stub at [`docs/cycle-31-plan.md`](docs/cycle-31-plan.md) **with placeholder slug `tbd`**. Pick a slug, fill in Goal + Phases, then run `/cycle-start`. Author hint inside the stub points at the carryover candidates from Cycle 30: **MP island scenes** (Worker + obstacleAvoidance) is the freshest ready-to-pick scope, with Cycle 30's heightfield-Y unification removing one source of silent Worker/client disagreement.

Cycle 31 plan: [`docs/cycle-31-plan.md`](docs/cycle-31-plan.md). Cold-start orientation: read [`AGENTS.md`](AGENTS.md), then [`CLAUDE.md`](CLAUDE.md), then the cycle plan top-to-bottom.

## Cycle 30 close summary (autonomous run, 2026-05-09)

All 3 phases shipped end-to-end across 4 commits on `main`:

| Phase | Commit | Module |
|---|---|---|
| 1 — `Heightfield.bakeMeshGrid` helper | [`83cb451`](https://github.com/matthew-kissinger/sds/commit/83cb451) | [`shared/terrain/Heightfield.js`](shared/terrain/Heightfield.js) |
| 2 — `TerrainBuilder` consumes `bakeMeshGrid` | [`37e5c54`](https://github.com/matthew-kissinger/sds/commit/37e5c54) | [`js/TerrainBuilder.js`](js/TerrainBuilder.js) |
| 3 — Delete `+0.05m` defensive lift + codify | [`a19a8e3`](https://github.com/matthew-kissinger/sds/commit/a19a8e3) | [`shared/terrain/Heightfield.js`](shared/terrain/Heightfield.js), [`tests/heightfield-mesh-y.spec.js`](tests/heightfield-mesh-y.spec.js), [`DECISIONS.md`](DECISIONS.md) |

Net change: visible-terrain-Y math has one home (`Heightfield.bakeMeshGrid`); Cycle 9 Phase 5's defensive `+0.05m` fallback in `meshSampleY` is removed; `meshSampleY` now throws a remediation-named error when called without a bound mesh grid. `js/TerrainBuilder.js`: 1,387 → 1,362 LOC (-25). Sim/physics keep using raw `sample()` — the split between sim-Y (deterministic) and visual-Y (mesh-aligned) stays intact.

## Validation gates at close

- `npm test` — **297 / 304 pass** (7 skipped are e2e/flow). Was 290 / 297 pre-cycle; +7 new specs all under `Heightfield.bakeMeshGrid — algorithm`.
- `npm run build` — clean, 4.10s. `mainKB=575` / `threeKB=603` (refactor-baseline `bundle-sizes.json` fixture flat).
- `npx eslint shared/` — exit 0.
- Refactor-baseline `terrain-mesh-hash` byte-identical for all 3 scenes (the Phase 2 refactor is byte-equivalent at the mesh level).
- Cycle-close reconcile hook hit the `## Acceptance criteria — EARS format` template-explainer header before the actual Success criteria block (same regex collision Cycle 29 logged); walked acceptance manually.

## Pickup priority for Cycle 31

The Cycle 31 plan is a stub. Pick scope first, then run `/cycle-start`.

**Author hint inside the stub:**

1. **MP island scenes** — Rolling Hills + Open Country in multiplayer. Cycle 6's `TreePlacement` lift made this feasible; Cycle 30's heightfield unification removes one source of silent Worker/client disagreement. Remaining work: wire obstacle bundle into Worker `GameSim` init + `obstacleAvoidance` in shared sheep/dog tick. Solo Phase 2 wiring is the template. **Sim-deterministic** — needs careful sim-baseline regen story.
2. **`CYCLE_TEMPLATE.md` regex-collision fix** — the reconcile-hook regex hits the EARS-explainer header before the actual Success criteria block (Cycle 29 + 30 both worked around it manually). Touches a fence file. Small scope; could be a Phase 0 attached to whatever the main cycle scope is.

Other Deferred candidates (less ready): bespoke pixel-forge rocks, octahedral impostors v2, cross-module polygon-spawn dedup ripple from Cycle 29 B2, build-time `displacedHeights` bake (deferred from Cycle 30).

## Already in place (alignment foundation through Cycle 30)

- [`tests/refactor-baseline/`](tests/refactor-baseline/) characterization-test harness pattern — Cycle 30's Phase 2 mesh-refactor was validated against the existing `terrain-mesh-hash` golden. Same pattern for any future TerrainBuilder change.
- [`docs/CYCLE_TEMPLATE.md`](docs/CYCLE_TEMPLATE.md) mandates EARS Acceptance + ≤ 8 phases + EMERGENCY_STOPS reference. **Note:** the reconcile-hook regex collision against the "## Acceptance criteria — EARS format" explainer header is still open; cycle-31 work that touches the template can address it as Phase 0.
- [`.claude/hooks/cycle-close-reconcile.mjs`](.claude/hooks/cycle-close-reconcile.mjs) auto-evaluates testable predicates at cycle close (when its regex matches — see template note above).
- [`.claude/skills/cycle-doc-dream/SKILL.md`](.claude/skills/cycle-doc-dream/SKILL.md) on hand if doc drift accumulates mid-cycle.
- [`shared/terrain/Heightfield.js`](shared/terrain/Heightfield.js) `bakeMeshGrid` (Cycle 30): callable from any consumer that has a heightfield + wants a triangle-interp-ready mesh grid (TerrainBuilder, tests, future Worker that loads scenes).

## Hard stops (cycle-specific — full durable list at [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md))

To draft once Phases are scoped. Likely additions (depending on chosen scope):

- **MP island scenes path:** sim-baseline drift (Worker + client must produce identical traces); `MultiplayerState` contract change without paired update; wire-protocol change without authorization in the active phase scope.
- **`CYCLE_TEMPLATE.md` fix path:** template change without explicit fence authorization in the active cycle plan; reconcile-hook regression on cycles 29 + 30 (both pinned manually) reverting their carryover entries.

## Durable rules

See [`.claude/rules/`](.claude/rules/) for durable project rules. Cycle-31-specific scope guards live in [`docs/cycle-31-plan.md`](docs/cycle-31-plan.md)'s "What NOT to do" section once it's drafted.

## Repo state at handoff

- Cycle 30 closed clean (pending push by Matt — autonomous run committed locally, will trigger fresh deploy on push).
- 297/304 vitest specs pass (7 skipped).
- Production build: `mainKB=575` / `threeKB=603` (refactor-baseline fixture flat).
- Last deploy on `main`: cycle-29 close commit shows `failure` in `gh run list` but only the **E2E (Chromium)** Playwright job failed — Worker + Pages both deployed successfully and the site is live. Carryover from Cycle 29 close, not introduced by Cycle 30. Cycle 30's close commit triggers a new run.
- `npx eslint shared/` zero errors.
- Working tree dirty after the close commit lands (the 4 Cycle 30 commits + this close commit are local and unpushed at the time this NEXT_SESSION line is written).

## Cycle 30 carryover (none)

All 3 Cycle 30 phases shipped. Two items the plan deliberately deferred:

- **Build-time `displacedHeights` bake** into [`scripts/bake-heightmap.mjs`](scripts/bake-heightmap.mjs) — would let the Worker pre-load the mesh grid without recomputing. Speculative until MP island scenes lands.
- **Inline / delete [`TerrainBuilder._groundY`](js/TerrainBuilder.js)** — it's a one-liner now, but [`.claude/rules/scene-and-render.md`](.claude/rules/scene-and-render.md) treats it as the named entry point. Inlining is a separate decision.

Both filed in [`docs/BACKLOG.md`](docs/BACKLOG.md) Cycle 30 entry under "Carryover deliberately deferred."

## Reference table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-31-plan.md`](docs/cycle-31-plan.md) (stub — needs Goal + Phases) |
| Latest closed cycle | [`docs/archive/cycles/cycle-30-plan.md`](docs/archive/cycles/cycle-30-plan.md) |
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
| Heightfield (Cycle 30) | [`shared/terrain/Heightfield.js`](shared/terrain/Heightfield.js) — `bakeMeshGrid` + `meshSampleY` (throws if no grid bound) |

## Running locally

```
npm run dev    # Vite (:3000) + wrangler (:8787)
npm test       # vitest, ~1.5s full run (297 specs + 7 skipped)
npm run lint   # ESLint on shared/ (deterministic boundary)
npm run build  # production build
```

URL params: `?scene=field|rolling-hills|open-country`, `?debug=gl`, `?cinematic=1`, `?ui=off`, `?sun=0.5`, `?perfMode=1`, `?tier=low|med|high`, `?tonemap=aces|neutral|linear|none`.
