# Next Session - Cycle 68 survival-polish (stub - needs authoring)

> **Updated:** 2026-06-07
> **For:** Cycle 68 `survival-polish`. Plan: [`docs/cycle-68-plan.md`](docs/cycle-68-plan.md) (a STUB - Goal + Phases not yet filled in).
> **Pickup priority:** Cycle 67 (co-op survival) is CLOSED + shipped + live. Cycle 68 is scaffolded as a stub. Pick its scope from the Cycle 67 carryover (below), author the plan, then run `/cycle-start`. The single most actionable autonomous item is the **deploy-does-not-apply-remote-D1-migrations** gap (it caused a prod break this cycle).

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-68-plan.md`](docs/cycle-68-plan.md) -> the touched module source. Authoritative closed-cycle log: [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Where It Stands

**Cycle 67 (`coop-survival`) is CLOSED + deployed (2026-06-07).** A folded autonomous cycle that promoted the Cycle 66 solo survival layer into the deterministic `shared/` sim and made survival a 2-4 player co-op mode. The Cloudflare Worker Durable Object is now authoritative for the run + wolves + pen and broadcasts them; clients render from the snapshot (no client prediction of wolves). All 8 phases shipped (full closeout in [`docs/BACKLOG.md`](docs/BACKLOG.md)):

- **P1** promote `run.js` / `wolfBehavior.js` / `pen.js` to `shared/survival/*` (seeded pen settle); `js/gamestate/*` are re-export shims.
- **P2** extract the pure `WolfSim` (`shared/survival/wolves.js`) + a Three-only `WolfRenderer`; `wolfPack.js` is a thin solo orchestrator.
- **P3** DO-authoritative survival tick in `GameSim` (day clock, run, seeded wolves, pen), gated behind `isSurvival`; the 9 sheep sim-baselines stay byte-identical.
- **P4** the `survival` co-op room mode (RoomDO gate + forced maxFlock pool + RoomCreation surfaces it).
- **P5** additive wire frame + `PROTOCOL_VERSION` tag + the version-gated survival join (the four-piece migration story).
- **P6** client renders co-op wolves + HUD + minimap from the broadcast; the `killed` flag hides the dormant pool; solo sim gated to `!isMultiplayer`.
- **P7** party-size co-op leaderboard (migration `0009` + `survival:2/3/4` boards + submit-from-DO).

Validation: `npm test` 1114 pass, eslint + worker tsc + build clean, sim-baselines byte-identical, solo-survival browser smoke clean. Prod verified (the four survival boards 200, frontend + terrain 200). **Migration 0009 was applied to remote D1 by hand** (the deploy does not do remote migrations - see carryover).

## What To Pick Up Next

Cycle 68 is a **stub**. Author its Goal + Phases from the Cycle 67 carryover (in [`docs/BACKLOG.md`](docs/BACKLOG.md)). Candidates, by how autonomous-able they are:

1. **Deploy-applies-remote-D1-migrations (autonomous infra fix).** `deploy.yml` runs `wrangler d1 execute --local` only (for the test job); remote migrations are manual. Add a gated remote-migration step to the deploy (or fold the manual `wrangler d1 execute <db> --remote --file=...` into the cycle-close checklist), and correct the now-inaccurate `multiplayer.md` "CI does this on deploy" line. Cycle 67 hit a real prod break from this (the survival board 500'd until 0009 was applied by hand).
2. **Two-client live co-op playtest + the survival feel pass (Matt's paired-track).** A full 2-client run (wrangler dev + local D1 + two WS sessions through a wolf night) + the named tunables: wolf counts/speeds, kill radius, bark range, +5 growth, 33% loss, maxFlock 200.
3. **Reconnect persistence of the multi-day run** (deferred Q5 - currently GameSim-memory only, lost on a worker redeploy).
4. **Whole-island grass rearch** (density/LOD perf spike) + a **real Newsheepdogland entrance hero capture** (media pass).

## Open Carryover (deferred)

- The four candidates above.
- Prior open carryover: tablet draw-call perf, counting naming/curve-feel, `/api/rename` no-body 500, `actions/upload-artifact@v5` on Node 20.

## Working Contract

- Co-op survival is live: any further `shared/survival/*` change must keep the 9 sheep sim-baselines byte-identical, and any wire change carries the four-piece migration story + a `PROTOCOL_VERSION` bump (the tag exists now - `shared/protocol.js`). Any new D1 migration is append-only AND must be applied to remote D1 (manual today - see carryover 1) and registered in the `tests/worker/helpers/d1-sqlite.ts` harness if it is a schema migration.
- Don't decompose `GrassSystem` / `OptimizedSheep`. No version bump without Matt's call.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan (stub) | [`docs/cycle-68-plan.md`](docs/cycle-68-plan.md) |
| Shared survival cores (DO + client) | [`shared/survival/`](shared/survival/) (run, wolves, wolfBehavior, pen, dayClock) |
| DO survival tick | [`worker/src/GameSim.js`](worker/src/GameSim.js) `_tickSurvival` |
| Survival room mode | [`worker/src/RoomDO.ts`](worker/src/RoomDO.ts) |
| Wire protocol version | [`shared/protocol.js`](shared/protocol.js) |
| Co-op client render | [`js/boot/initNetwork.js`](js/boot/initNetwork.js) `driveCoopSurvival` + [`js/gamestate/wolfRenderer.js`](js/gamestate/wolfRenderer.js) |
| Survival leaderboard (party-size) | [`shared/survivalModes.js`](shared/survivalModes.js) + [`worker/src/d1.ts`](worker/src/d1.ts) + migration `0009` |
| Latest closed cycle | [`docs/archive/cycles/cycle-67-plan.md`](docs/archive/cycles/cycle-67-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
