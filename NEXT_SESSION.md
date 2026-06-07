# Next Session - Cycle 66 newsheepdogland-survival (folded autonomous cycle, ready to run)

> **Updated:** 2026-06-07
> **For:** Cycle 66 `newsheepdogland-survival`. Plan: [`docs/cycle-66-plan.md`](docs/cycle-66-plan.md).
> **Pickup priority:** Run the folded autonomous survival cycle. Start with P1 (the full Wolf Coast -> Newsheepdogland rename) so everything downstream uses the new id, spike the three risky primitives (pen soft-containment, wolf AI, whole-island grass perf) before committing their implementations, then run P2-P8. Matt reviews on completion.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-66-plan.md`](docs/cycle-66-plan.md) -> the touched module source.

## Where It Stands

**Cycle 65 (`wolf-coast-homestead-and-day`) is CLOSED + deployed** (archived [`docs/archive/cycles/cycle-65-plan.md`](docs/archive/cycles/cycle-65-plan.md)). It turned the Wolf Coast foundation into a place with a daily rhythm: a homestead the dog wakes at, island character, a day/night cycle + HUD, a gate by phase, a soft herd-back loop, and a skip-to-dusk cutscene. After Matt's prod playtest, a post-close fix pass attached the Home Field farmhouse to the pen (it was rendering ~1.2 km off at the Field default), built a full grounded fence ring (was a floating gate + 2 wings), culled trees out of the water, moved the day/night HUD off the overlapping center, and turned the house door to face the gate. All live on prod.

**Cycle 66 (`newsheepdogland-survival`) is the folded autonomous survival cycle.** Matt reviewed the homestead and chose (2026-06-07) to fold the whole survival vision into one larger autonomous cycle and to rename the island. It is authored and ready to run end to end.

### What Cycle 66 ships (8 phases)

- **P1 - Full rename Wolf Coast -> Newsheepdogland** (scene id, display name, terrain bin, coast file, sim-baseline fixture rename, deep-link URLs, tests, D1 leaderboard partition). Do first.
- **P2 - Pen as a real barrier + the objective.** Herd sheep through the gate; they retire inside the pen (no zap, no teleport); dog + sheep collide with the fence; gate-only entry. Remove the toe-corral zap.
- **P3 - Survival loop + UI reorg.** Start 10 sheep, ~10-minute day to dusk/night; lose <33% -> +5 -> next day; 33%+ loss -> death; score = flock size. No sheep-count selection; a survival HUD.
- **P4 - Wolves.** Night spawn, hunt sheep outside the pen, retreat at dawn (reuse [`js/Wolf.js`](js/Wolf.js) + `Wolf.glb`). Sheep in the closed pen are safe.
- **P5 - Bark redesign.** Keep the sheep forward cone byte-identical; add a longer-range radial wolf-repel.
- **P6 - Survival leaderboard.** Append-only D1; score = flock size on death.
- **P7 - Whole-island grass + minimap.** Grass across the island (density/LOD rearch, within budget); a polished top-right minimap.
- **P8 - Validate + browser smoke + ship.**

## What To Pick Up Next

1. **P1 rename** - mechanical but wide; land it first so the rest builds on `newsheepdogland`.
2. **Spike the risky primitives** (per the spike-risky-primitives memory): pen soft-containment (Q4), wolf AI feel (Q3), whole-island grass perf budget. Measure in `tools/` + `cycle66-validation/` before committing.
3. **Run P2-P8** end to end, browser-verifying each (preview, `SDS_SUPPRESS_BROWSER_OPEN=1`, close tabs/listeners after).
4. **Confirm the open questions** (Q1 D1 rename, Q2 score definition, Q3 wolf escalation, Q4 containment, Q5 minimap, Q6 death accounting) - strawman answers are in the plan; treat the named numbers as Matt's spec.

## Open Carryover

- **Co-op** - promoting the survival sim + wolves to deterministic `shared/` is a later cycle (this cycle is solo + client-side).
- **A real Newsheepdogland entrance hero capture** to replace the dusk-gradient placeholder (Matt's media pass).
- **No version bump** - a player-visible release is Matt's explicit call.
- Prior open carryover (tablet draw-call perf, real mobile pass, counting naming/curve-feel, `/api/rename` no-body 500, `upload-artifact@v5` Node 20) remains deferred.

## Working Contract

- **Keep the survival sim solo + client-side** (the day-loop precedent). No deterministic-sim/wire/co-op change this cycle. The sim-baseline stays byte-identical (the renamed fixture is the only allowed change).
- **D1 migrations are append-only.** New sequence-numbered files for the survival partition + the scene-id rename.
- **Don't decompose `GrassSystem` / `OptimizedSheep`.** Whole-island grass is a density/LOD rearch inside the system.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan | [`docs/cycle-66-plan.md`](docs/cycle-66-plan.md) |
| Day loop (extend into survival) | [`js/gamestate/dayLoop.js`](js/gamestate/dayLoop.js) |
| Wolf asset | [`js/Wolf.js`](js/Wolf.js) + `assets/models/Wolf.glb` |
| Bark (keep cone, add wolf-repel) | [`shared/BarkImpulse.js`](shared/BarkImpulse.js) |
| Pen ring + gate (make a real barrier) | [`js/StructureBuilder.js`](js/StructureBuilder.js) |
| Grass (rearch for whole island) | [`js/GrassSystem.js`](js/GrassSystem.js) |
| Scene (rename + survival data) | [`shared/scenes/wolf-coast.js`](shared/scenes/wolf-coast.js) -> `newsheepdogland.js` |
| D1 migrations | [`worker/migrations/`](worker/migrations/) |
| Latest closed cycle | [`docs/archive/cycles/cycle-65-plan.md`](docs/archive/cycles/cycle-65-plan.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
