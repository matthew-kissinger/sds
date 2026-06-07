# Next Session - Cycle 69 survival-feel-and-media (stub - needs authoring)

> **Updated:** 2026-06-07
> **For:** Cycle 69 `survival-feel-and-media`. Plan: [`docs/cycle-69-plan.md`](docs/cycle-69-plan.md) (a STUB - Goal + Phases not yet filled in).
> **Pickup priority:** Cycle 68 (survival-polish) is CLOSED + shipped + live. Cycle 69 is scaffolded as a stub. Most of its candidates are Matt's taste/media track (survival feel pass, hero shot, two-client fun playtest); the autonomous-able items are the `multiplayer.md` doc correction (needs Matt to grant the rules-file edit) and a coastline far-ring meadow-quad grass spike.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-69-plan.md`](docs/cycle-69-plan.md) -> the touched module source. Authoritative closed-cycle log: [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Where It Stands

**Cycle 68 (`survival-polish`) is CLOSED + deployed (2026-06-07).** A folded autonomous cycle that hardened the Cycle 67 co-op survival mode. All 8 phases shipped or evidence-deferred (full closeout in [`docs/BACKLOG.md`](docs/BACKLOG.md)):

- **P1** the deploy now applies remote D1 migrations (the `migrate` job in `deploy.yml` applies push-added migration files via `wrangler d1 execute --remote` and gates worker + pages). Closes the Cycle 67 prod-break gap. `scripts/d1-local-setup.mjs` is the one place for the full LOCAL migration set.
- **P2** survival feel constants centralized into `shared/survival/tuning.js` (single source; values preserved, live tuning documented for Matt's pass).
- **P3** a LIVE two-client co-op proof (`tests/integration/coop-survival.spec.ts`, verified PASS against wrangler dev) - the run Cycle 67 deferred. Prod-safe night seam gated behind `env.INTEGRATION_TEST`.
- **P4** the multi-day run persists across DO eviction (day-granularity checkpoint to DO storage; resumes instead of resetting to day 1). No wire change.
- **P5** grass density/LOD spike: whole-island is 2.71x the draw calls of the 760m disc -> **P6 NO-GO**, `GrassSystem` left untouched (do-not-decompose upheld).
- **P7** entrance hero: manifest + working `tools/hero-capture.mjs` shipped; final framing is Matt's live pass.

Validation: `npm test` 1128 pass / 0 fail, eslint + worker tsc + build clean, sim-baselines byte-identical. Deploy green INCLUDING the new `Migrate D1 (remote)` job. Prod verified (frontend + the four survival boards 200).

## What To Pick Up Next

Cycle 69 is a **stub**. Author its Goal + Phases from the Cycle 68 carryover (in [`docs/BACKLOG.md`](docs/BACKLOG.md)). Candidates:

1. **`multiplayer.md` doc correction (BLOCKED - needs Matt's OK).** P1 made the deploy apply remote migrations, so the doc's remote-migration lines are now wrong. The corrected text is staged (archived cycle-68 plan Frozen-files section + the P1 commit); the agent-config guardrail blocks Claude editing a `.claude/rules/*.md` file autonomously. Apply the staged fix, or grant the edit.
2. **Survival feel pass (Matt's paired track).** Live-tune `shared/survival/tuning.js` across a wolf night; the two-client co-op fun playtest.
3. **Entrance hero FINAL shot (Matt's media pass).** Dial `tools/hero-capture.mjs` CAM/TARGET/SUN_T live to the manifest framing (`cycle68-validation/hero/manifest.md`).
4. **Coastline far-ring meadow-quad grass** (the P5 NO-GO follow-up): a targeted LOD for coastline scenes (NOT a GrassSystem decomposition) that also trims the current 829 draw calls. Spike first.

## Open Carryover (deferred)

- The four candidates above.
- Prior open carryover: tablet draw-call perf, counting naming/curve-feel, `/api/rename` no-body 500, `actions/upload-artifact@v5` on Node 20.

## Working Contract

- Co-op survival is live: any `shared/survival/*` change must keep the 9 sheep sim-baselines byte-identical; any wire change carries the four-piece migration story + a `PROTOCOL_VERSION` bump. Any new D1 migration is append-only AND is now applied to remote automatically on deploy (the `migrate` job); register schema migrations in `tests/worker/helpers/d1-sqlite.ts`.
- Don't decompose `GrassSystem` / `OptimizedSheep`. No version bump without Matt's call.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan (stub) | [`docs/cycle-69-plan.md`](docs/cycle-69-plan.md) |
| Survival feel tuning | [`shared/survival/tuning.js`](shared/survival/tuning.js) |
| Shared survival cores | [`shared/survival/`](shared/survival/) (run, wolves, wolfBehavior, pen, dayClock, tuning) |
| DO survival tick + persistence | [`worker/src/GameSim.js`](worker/src/GameSim.js) `_tickSurvival` / `serializeSurvival` + [`worker/src/RoomDO.ts`](worker/src/RoomDO.ts) |
| Two-client live proof | [`tests/integration/coop-survival.spec.ts`](tests/integration/coop-survival.spec.ts) |
| Deploy remote migrations | [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) `migrate` job + [`scripts/d1-local-setup.mjs`](scripts/d1-local-setup.mjs) |
| Grass spike + hero tools | [`tools/grass-rearch-spike.mjs`](tools/grass-rearch-spike.mjs), [`tools/hero-capture.mjs`](tools/hero-capture.mjs) |
| Latest closed cycle | [`docs/archive/cycles/cycle-68-plan.md`](docs/archive/cycles/cycle-68-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
