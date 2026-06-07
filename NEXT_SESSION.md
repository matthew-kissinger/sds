# Next Session - Cycle 70 survival-feel-and-media (stub - needs authoring)

> **Updated:** 2026-06-07
> **For:** Cycle 70 `survival-feel-and-media`. Plan: [`docs/cycle-70-plan.md`](docs/cycle-70-plan.md) (a STUB - Goal + Phases not yet filled in).
> **Pickup priority:** Cycle 69 (grass-far-ring-and-api-hardening) is CLOSED + shipped + live. Cycle 70 is the Matt's-hands / paired track that Cycles 67-69 kept deferring: the survival feel pass, the two-client co-op fun playtest, the entrance hero FINAL shot, the grass far-ring Option A (visual, bundle with the media pass), and the guardrail-blocked `multiplayer.md` doc fix. Author it with Matt, then `/cycle-start`.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-70-plan.md`](docs/cycle-70-plan.md) -> the touched module source. Authoritative closed-cycle log: [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Where It Stands

**Cycle 69 (`grass-far-ring-and-api-hardening`) is CLOSED + deployed (2026-06-07).** A folded autonomous cycle (Matt: "author cycle 69 the complete and push and deploy") that closed two autonomous-able Cycle 67/68 loose ends. 3/4 phases shipped, 1 evidence-deferred (full closeout in [`docs/BACKLOG.md`](docs/BACKLOG.md)):

- **P1** the `/api/rename` prod-500 is fixed: a shared `readJsonObject()` makes every body-parsing POST route return a clean `400`/`401` on a missing or malformed body instead of a server `500`. Route-level test `tests/worker/rename-route.spec.ts`.
- **P2** coastline grass far-ring spike (`tools/grass-far-ring-spike.mjs`): baseline 829 draw calls / 7.31M tris. Option A (40m meadow far chunks) = 0 draw-call change, 37.6% triangle cut, coast/relief-safe. Option B (merged tiles) = up to 34% fewer draw calls but coarsens the coast for no perf need (829 < 1500).
- **P3** far-ring implementation **DEFERRED with evidence** (the P5 -> P6 pattern): Option B NO-GO; Option A viable but a visual change to Matt's pending hero-capture scene, so it bundles with the media pass. `GrassSystem.js` + `types.js` left byte-unchanged.

Validation: `npm test` 1135 pass / 0 fail, eslint + worker tsc + build clean (main 584.8 KiB, within the 585 KiB ratchet), sim-baselines untouched (no `shared/` change). Deploy green including the `Migrate D1 (remote)` job. Prod verified.

## What To Pick Up Next

Cycle 70 is a **stub**. Author its Goal + Phases from the Cycle 69 carryover (in [`docs/BACKLOG.md`](docs/BACKLOG.md)). This is the **paired / Matt's-hands track**:

1. **Survival feel pass (paired taste track).** Live-tune `shared/survival/tuning.js` (wolf counts/speeds, kill radius, bark range, +5 growth, 33% loss) across a real wolf night; the two-client co-op fun playtest. Any value change keeps the 9 sheep sim-baselines byte-identical; no wire change.
2. **Entrance hero FINAL shot (media pass).** Dial `tools/hero-capture.mjs` (CAM/TARGET/SUN_T) live to the `cycle68-validation/hero/manifest.md` framing.
3. **Grass far-ring Option A (visual, bundle with the media pass).** Enable the existing meadow-quad LOD for coastline far chunks behind a SceneDef opt-in (37.6% grass-triangle cut, coast/relief-safe). Recipe in `cycle69-validation/grass/far-ring-spike.json`. Judge it with Matt's eye since it changes the hero scene.
4. **`multiplayer.md` doc correction (BLOCKED - needs Matt's OK).** The Cycle 68 P1 remote-migration lines are wrong; the guardrail blocks an autonomous `.claude/rules/*.md` edit. Matt applies the staged text or grants the edit.

## Open Carryover (deferred)

- The four candidates above.
- Prior open carryover: tablet draw-call perf, counting naming/curve-feel. (`/api/rename` no-body 500 is FIXED in Cycle 69 P1; `upload-artifact@v5` is verified already-resolved.)

## Working Contract

- Co-op survival is live: any `shared/survival/*` change must keep the 9 sheep sim-baselines byte-identical; any wire change carries the four-piece migration story + a `PROTOCOL_VERSION` bump. Any new D1 migration is append-only AND is applied to remote automatically on deploy (the `migrate` job); register schema migrations in `tests/worker/helpers/d1-sqlite.ts`.
- Don't decompose `GrassSystem` / `OptimizedSheep`. The grass far-ring Option A is an additive gated path, not a decomposition. No version bump without Matt's call.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan (stub) | [`docs/cycle-70-plan.md`](docs/cycle-70-plan.md) |
| Survival feel tuning | [`shared/survival/tuning.js`](shared/survival/tuning.js) |
| Grass far-ring recipe | [`tools/grass-far-ring-spike.mjs`](tools/grass-far-ring-spike.mjs) + `cycle69-validation/grass/far-ring-spike.json` |
| Hero capture | [`tools/hero-capture.mjs`](tools/hero-capture.mjs) + `cycle68-validation/hero/manifest.md` |
| Worker HTTP router | [`worker/src/index.ts`](worker/src/index.ts) (`readJsonObject`) |
| Shared survival cores | [`shared/survival/`](shared/survival/) (run, wolves, wolfBehavior, pen, dayClock, tuning) |
| Deploy remote migrations | [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) `migrate` job + [`scripts/d1-local-setup.mjs`](scripts/d1-local-setup.mjs) |
| Latest closed cycle | [`docs/archive/cycles/cycle-69-plan.md`](docs/archive/cycles/cycle-69-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
