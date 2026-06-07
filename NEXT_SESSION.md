# Next Session - Cycle 67 coop-survival (authored, ready to run)

> **Updated:** 2026-06-07
> **For:** Cycle 67 `coop-survival`. Plan: [`docs/cycle-67-plan.md`](docs/cycle-67-plan.md).
> **Pickup priority:** Cycle 66 (solo survival on Newsheepdogland) is CLOSED + shipped. Cycle 67 is **fully authored** - an 8-phase plan to promote the survival run + wolves + pen into the deterministic `shared/` sim and run co-op survival rooms (DO-authoritative, clients render-from-snapshot). Read the plan top-to-bottom + [`shared-sim.md`](.claude/rules/shared-sim.md) + [`multiplayer.md`](.claude/rules/multiplayer.md), then run `/cycle-start` and begin **P1** (promote the deterministic cores to `shared/survival/`).

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-67-plan.md`](docs/cycle-67-plan.md) -> the touched module source. Authoritative closed-cycle log: [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Where It Stands

**Cycle 66 (`newsheepdogland-survival`) is CLOSED + deployed (2026-06-07).** A folded autonomous cycle that turned the Wolf Coast homestead into a real survival game and renamed the island to **Newsheepdogland**. All 8 phases shipped (full closeout in [`docs/BACKLOG.md`](docs/BACKLOG.md)):

- **P1 rename** Wolf Coast -> Newsheepdogland (scene id, terrain bin, registry, deep links, entrance, sim-baseline fixture rename, tests, append-only D1 partition migration).
- **P2 pen as a real barrier + the objective** - herd through the gate, sheep retire inside (no zap/teleport), dog + sheep collide with the fence, gate-only entry, toe-corral zap removed (`js/gamestate/penContainment.js`).
- **P3 survival loop + UI reorg** - start 10 sheep, ~10-min day, lose <33% -> +5 -> next day, 33%+ -> death, score = peak flock (capped at maxFlock 200); no sheep-count selection (`js/gamestate/survivalRun.js`).
- **P4 wolves** - client-only night pack (`js/gamestate/wolfPack.js` + pure `wolfBehavior.js`), escalating seeded spawn, hunts sheep outside the pen, kills feed the economy, retreats at dawn, sheep in the closed pen safe.
- **P5 bark wolf-repel** - the bark scares wolves at a longer radial range; the deterministic sheep-cone math is untouched.
- **P6 survival leaderboard** - a live-read `survival` board (peak flock DESC), reusing the existing score column (no migration); submit on death + run-summary read + a GlobalLeaderboard tab.
- **P7 minimap + grass** - a top-right canvas minimap (island shape from the coastline polygon + live dog/flock/wolf markers); grass widened to the whole play surface (745 chunks).

Solo + client-side throughout; sim-baseline byte-identical. Validation: 1078 tests pass, lint + worker tsc clean, build green, browser smoke clean.

## What To Pick Up Next

Cycle 67 (`coop-survival`) is **fully authored** in [`docs/cycle-67-plan.md`](docs/cycle-67-plan.md) - 8 phases, EARS acceptance, the grounding map verified against the current worker/wire/client code. Run `/cycle-start`, then begin at **P1**.

The spine: promote `survivalRun.js` + `wolfBehavior.js` + the wolf AI + the pen math from client-only `js/gamestate/` into pure `shared/survival/*` modules (so the DO can run them - it can't import `js/`), then make the DO authoritative for the run + wolves + pen and broadcast them; clients render-from-snapshot (no client prediction of wolves - this sidesteps cross-engine trig determinism). The plan's "authority model" section is the load-bearing decision; the bark-edge in `shared/BarkImpulse.js` is the dual-call-site template.

Determinism audit already done (in the plan): `survivalRun.js` + `wolfBehavior.js` are clean to move; `penContainment.js` has one `Math.random()` in `_settleSpot()` to seed; `wolfPack.js` is Three.js-coupled and needs a pure-core/renderer split. Hard stops: the 9 sheep sim-baselines stay byte-identical (survival is additive), the wire change needs the four-piece migration story (no version tag exists today - P5 adds one), D1 append-only.

Phase order: P1 (shared cores) -> P2 (wolf AI + renderer) -> P3 (DO tick) -> P4 (room mode) + P5 (wire) -> P6 (client render/HUD) -> P7 (leaderboard) -> P8 (validate + ship).

## Open Carryover (deferred)

- **Co-op survival** (the Cycle 67 headline - see above).
- **Whole-island grass rearch** - Cycle 66 widened grass to the play surface (745 chunks); the literal alpine mountain-leg coverage is gated on a density/LOD perf spike (per the grass-discipline rule). Spike + measure desktop + mobile before committing.
- **Real Newsheepdogland entrance hero capture** to replace the dusk-gradient placeholder (Matt's media pass - paired-track).
- **Wolf / survival feel pass** - the named numbers (wolf counts/speeds, kill radius, bark repel range, +5 growth, 33% loss, maxFlock 200) are tunables awaiting Matt's taste pass.
- **Tablet draw-call perf** - watch the widened grass on the Tab S10 FE.
- Prior housekeeping: `/api/rename` no-body 500; `actions/upload-artifact@v5` on Node 20 (GitHub forces Node 24 on 2026-06-16); counting naming/curve-feel.

## Working Contract

- Cycle 67 (co-op) is a deterministic-sim cycle: any `shared/` change regenerates sim-baselines with explicit acceptance, and any wire change carries a migration story (the in-flight-session contract). Don't decompose `GrassSystem` / `OptimizedSheep`. No version bump without Matt's call.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan | [`docs/cycle-67-plan.md`](docs/cycle-67-plan.md) |
| Solo survival run (promote to shared/) | [`js/gamestate/survivalRun.js`](js/gamestate/survivalRun.js) |
| Wolves (promote to shared/) | [`js/gamestate/wolfPack.js`](js/gamestate/wolfPack.js) + [`js/gamestate/wolfBehavior.js`](js/gamestate/wolfBehavior.js) |
| Pen containment (promote to shared/) | [`js/gamestate/penContainment.js`](js/gamestate/penContainment.js) |
| Survival leaderboard | [`shared/survivalModes.js`](shared/survivalModes.js) + [`worker/src/d1.ts`](worker/src/d1.ts) |
| Minimap | [`js/components/GameHUD/Minimap.js`](js/components/GameHUD/Minimap.js) |
| Scene data | [`shared/scenes/newsheepdogland.js`](shared/scenes/newsheepdogland.js) |
| Latest closed cycle | [`docs/archive/cycles/cycle-66-plan.md`](docs/archive/cycles/cycle-66-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
