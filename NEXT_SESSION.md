# Next Session - Cycle 71 feel-and-media-live (stub - needs authoring)

> **Updated:** 2026-06-07
> **For:** Cycle 71 `feel-and-media-live`. Plan: [`docs/cycle-71-plan.md`](docs/cycle-71-plan.md) (a STUB - Goal + Phases not yet filled in).
> **Pickup priority:** Cycle 70 (survival-feel-and-media) is CLOSED + shipped + live. The autonomous prep is done; Cycle 71 is the LIVE paired track that needs Matt at the keyboard: the survival feel live-tuning pass (off the Cycle 70 audit), the two-client co-op fun playtest, the entrance hero FINAL beauty shot, and the guardrail-blocked `multiplayer.md` doc fix. Author it with Matt, then `/cycle-start`.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-71-plan.md`](docs/cycle-71-plan.md) -> the touched module source. Authoritative closed-cycle log: [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Where It Stands

**Cycle 70 (`survival-feel-and-media`) is CLOSED + deployed (2026-06-07).** An autonomous cycle (Matt: "author entire cycle the implement and complete and close and commit and deploy") that turned the Cycle 69 carryover into shipped work where it could ship autonomously and into evidence where it could not. 3 shipped, 2 evidence-deferred, 1 still-blocked (full closeout in [`docs/BACKLOG.md`](docs/BACKLOG.md)):

- **P1** grass far-ring Option A is LIVE on Newsheepdogland: new `GrassDef.farRing` (additive, render-only) makes coastline far chunks beyond `meadowFrom` (600m) from `grassCenter` render as meadow quads instead of clump blades. 37.6% grass-triangle cut, zero draw-call change, coast/relief-safe, desktop-tier only. Every scene without `farRing` is byte-identical.
- **P2** survival feel-pass readiness audit (`cycle70-validation/survival-feel/audit.md`): wolf-vs-dog speed confirms no playability bug (dog strictly faster on every dog); day-1 lethality + growth math; recommended live-tuning lever order. No spec value changed (Matt's paired track).
- **P3** entrance hero capture refreshed against the far-ring scene (`cycle70-validation/hero/`): far-ring reads clean in the hero framing (no water tiling, no flat planes). FINAL beauty shot deferred to Matt's browser pass.

Validation: `npm test` 1135 pass / 0 fail, eslint `shared/` + worker tsc + build clean (main 584.81 KiB, within the 585 KiB ratchet), sim-baselines + scatter/terrain baselines untouched (render-only change). Deploy green including the `Migrate D1 (remote)` job. Prod verified.

## What To Pick Up Next

Cycle 71 is a **stub**. Author its Goal + Phases from the Cycle 70 carryover (in [`docs/BACKLOG.md`](docs/BACKLOG.md)). This is the **LIVE paired / Matt's-hands track**:

1. **Survival feel LIVE tuning (paired taste).** Start from the Cycle 70 P2 audit (`cycle70-validation/survival-feel/audit.md`); live-tune `shared/survival/tuning.js` across a real wolf night, lever order in the audit. Any value change keeps the 10 sim-baselines byte-identical; no wire change.
2. **Two-client co-op fun playtest (paired).** The wire path is proven (Cycle 68 P3); the "is it fun" judgment is Matt's.
3. **Entrance hero FINAL beauty shot (media).** Dial `tools/hero-capture.mjs` live in a real browser to the `cycle68-validation/hero/manifest.md` framing. Cycle 70 P3 left a current candidate with the far-ring active; a real browser clears the headless sun-dome artifact.
4. **`multiplayer.md` doc correction (BLOCKED - needs Matt's OK).** The Cycle 68 P1 remote-migration lines are wrong; the guardrail blocks an autonomous `.claude/rules/*.md` edit. Matt applies the staged text or grants the edit.

## Open Carryover (deferred)

- The four candidates above.
- Prior open carryover: tablet draw-call perf (could be its own autonomous spike+cycle if Matt wants a non-paired one), counting naming/curve-feel.

## Working Contract

- Co-op survival is live: any `shared/survival/*` change must keep the 10 sim-baselines byte-identical; any wire change carries the four-piece migration story + a `PROTOCOL_VERSION` bump. Any new D1 migration is append-only AND applied to remote automatically on deploy (the `migrate` job); register schema migrations in `tests/worker/helpers/d1-sqlite.ts`.
- Don't decompose `GrassSystem` / `OptimizedSheep`. The grass far-ring is an additive gated path (shipped Cycle 70), not a decomposition. No version bump without Matt's call.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan (stub) | [`docs/cycle-71-plan.md`](docs/cycle-71-plan.md) |
| Survival feel tuning + audit | [`shared/survival/tuning.js`](shared/survival/tuning.js) + `cycle70-validation/survival-feel/audit.md` |
| Grass far-ring (shipped) | [`js/GrassSystem.js`](js/GrassSystem.js) (`_farRing`) + [`shared/scenes/types.js`](shared/scenes/types.js) `GrassFarRingDef` |
| Hero capture | [`tools/hero-capture.mjs`](tools/hero-capture.mjs) + `cycle68-validation/hero/manifest.md` + `cycle70-validation/hero/` |
| Shared survival cores | [`shared/survival/`](shared/survival/) (run, wolves, wolfBehavior, pen, dayClock, tuning) |
| Worker HTTP router | [`worker/src/index.ts`](worker/src/index.ts) (`readJsonObject`) |
| Deploy remote migrations | [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) `migrate` job + [`scripts/d1-local-setup.mjs`](scripts/d1-local-setup.mjs) |
| Latest closed cycle | [`docs/archive/cycles/cycle-70-plan.md`](docs/archive/cycles/cycle-70-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
