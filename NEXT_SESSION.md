# Next Session - Cycle 35 (TBD)

> **Updated:** 2026-05-10 after Cycle 34 (`mp-island-scenes`) closeout.
> **For:** Cycle 35 (slug TBD).
> **Pickup priority:** Manual playtest of OC multiplayer (Cycle 34 post-deploy verification): boot `npm run dev`, host an OC room as scene=open-country, drive sheep into the round-up zone, confirm the stage flips to `drive` server-side and the portal opens. Then decide Cycle 35 scope. Plan stub at [`docs/cycle-35-plan.md`](docs/cycle-35-plan.md) — needs Goal + Phases filled in. Run `/cycle-start` after that.

Cold-start orientation: read [`AGENTS.md`](AGENTS.md), then [`CLAUDE.md`](CLAUDE.md), then this file, then [`docs/cycle-35-plan.md`](docs/cycle-35-plan.md). Cycle 34's closed plan is archived at [`docs/archive/cycles/cycle-34-plan.md`](docs/archive/cycles/cycle-34-plan.md).

## Cycle 34 Close Summary

Cycle 34 made `?scene=rolling-hills` and `?scene=open-country` first-class in multiplayer rooms. Five phases, all autonomous, no `package.json` version bump (manual playtest deferred to post-deploy verification).

- **Phase 1 — Sim-baseline coverage for islands.** Three net-additive 60Hz fixtures (`island-boundary-rh-60hz.json`, `corral-retirement-rh-60hz.json`, `island-boundary-oc-60hz.json`). Harness extended with `makeIslandGameState`, `makeIslandSheepConfig`, `tickSheepIslandCoop`. `round4` collapses `-0` to `0` for stable JSON round-trip. Pre-existing fixtures byte-identical.
- **Phase 2 — OC objective state machine in shared/ + worker.** Promoted [`js/gamestate/objective.js`](js/gamestate/objective.js) to [`shared/objective.js`](shared/objective.js) so the Worker authoritative sim runs the byte-identical state transitions the client predictor runs. The js-side path is now a one-line re-export shim. `GameSim.js` creates the objective at construction, calls `tickObjective` each tick, and gates `updateSheepCorralRetirements` on `isCorralOpen`. Added `oc-objective-stage-60hz.json` capturing the stage flip at tick 121 (2.0s holdRequired at 60Hz).
- **Phase 3 — Wire format additions for objective stage.** `createGameStateSnapshot()` emits an optional `objective` block when `this.objective != null` — shape mirrors the local `ObjectiveState` so the client mirrors directly into `game.gameState.objective`. Pre-Cycle-34 clients/workers fall back gracefully. Five new specs in [`tests/worker-objective-snapshot.spec.js`](tests/worker-objective-snapshot.spec.js).
- **Phase 4 — `allowedModes` enforcement at room init.** `RoomDO.initRoom` returns 400 `mode_not_allowed_on_scene` when the requested `gameMode` is not in the scene's `allowedModes`. Six new specs in [`tests/worker-allowed-modes.spec.js`](tests/worker-allowed-modes.spec.js).
- **Phase 5 — Lobby UI surfaces scene + allowed modes.** RoomCreation gained a scene picker; mode dropdown filters by selected scene's `allowedModes` with a snap-to-defaultMode fallback. PublicLobbyList renders the scene's display name as a chip. App.js threads `settings.sceneId` through `nm.createRoom`.

## Validation At Close

- `npm test` — 315 passed / 7 skipped (was 300/7 at Cycle 33 close, +15 cycle-34 specs).
- `npm run lint` — clean (eslint shared/).
- `npm run build` — clean, mainKB 590.06 / threeKB 617.77 (+0.46KB cycle-34 delta vs Cycle 33 close).
- `npm run test:integration` — 39 passed / 7 skipped (`flow.spec.ts` skips remain pre-existing).
- Pre-existing sim-baseline fixtures: byte-identical (verified via `git diff`).
- `shared/scenes/types.js`, `worker/migrations/`: untouched (no schema changes required).

## Operational Notes

- Cycle 34 commits (`318a346`, `d3a31de`, `0caddea`, `93e7e70`, plus the close commit `2264216`) pushed to `main`. Deploy run [`25621497329`](https://github.com/matthew-kissinger/sds/actions/runs/25621497329): first attempt failed on E2E (Chromium) — smoke test "solo classic game starts and 3D canvas renders" timed out at 180s × 3 attempts. Confirmed locally the same test passes in 1.8m (close to the 180s CI budget). Cycle-34 code only touches the MP path + a byte-equivalent re-export shim for `js/gamestate/objective.js`, so the failure was a borderline CI flake. **Rerun succeeded end-to-end** (Test ✓ / Deploy Worker ✓ / Deploy Pages ✓ / E2E Chromium ✓ / Perf check ✓). Production live on `https://sheepdogsim.com/`.
- **Outstanding manual playtest:** OC multiplayer end-to-end (host an OC room, two-tab session, drive sheep into round-up zone, confirm stage flip server-side). Same pattern as Cycle 32/33 post-deploy verification.
- Cycle 33 carryovers still open: local-tunnel BrowserStack canary on Ubuntu, Node 20 annotation re-check on next Deploy run.
- **Cycle 35 first-task hint:** the E2E smoke test is borderline-flaky on CI (180s budget, ~108s local, ~178s+ on slower runners). If it flakes again, candidate fixes: bump the test's `setTimeout` to 240s, raise the canvas-attach `toBeAttached` window above 60s, or split the boot-wait into checkpointed assertions. The Cycle 33 run passed the same test in time; Cycle 32 had a separate `wrangler: not found` failure. Track the pattern.

## Carryover Candidates For Cycle 35

The leading candidate is **post-deploy verification of MP island scenes** (manual playtest, then deciding whether OC needs HUD polish or whether to ship a different cycle).

Background candidates remaining in [`docs/BACKLOG.md`](docs/BACKLOG.md) (not in scope unless explicitly chosen):

1. **Promote `worker-objective-snapshot.spec.js` into the WS two-client harness** — requires unskipping `tests/integration/flow.spec.ts` and standing up a real worker fixture.
2. **OC objective HUD polish** — MP-specific copy or per-player progress indicators on the ObjectiveBanner.
3. **Modal-copy rewrite** — only if Google's recrawl still substitutes welcome-modal copy in snippets.
4. **Bespoke pixel-forge rocks**, **octahedral impostors v2**, **cross-module polygon-spawn dedup**, **build-time `displacedHeights` bake**, **inline `_groundY`** — long-tail polish.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan | [`docs/cycle-35-plan.md`](docs/cycle-35-plan.md) (stub — fill in Goal + Phases) |
| Latest closed cycle | [`docs/archive/cycles/cycle-34-plan.md`](docs/archive/cycles/cycle-34-plan.md) |
| Cycle 34 design doc | [`docs/mp-island-scenes-design.md`](docs/mp-island-scenes-design.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Security advisory acceptance log | [`docs/security-acceptance.md`](docs/security-acceptance.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player changelog | [`CHANGELOG.md`](CHANGELOG.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| Claude overlay | [`CLAUDE.md`](CLAUDE.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |

## Running Locally

```bash
npm run dev
npm test
npm run lint
npm run build
npm run test:e2e -- --project=chromium --grep-invert @local-only
npm run test:ios-water
npm run test:integration
```

Useful URL params: `?scene=field|rolling-hills|open-country`, `?debug=gl`, `?cinematic=1`, `?ui=off`, `?sun=0.5`, `?perfMode=1`, `?tier=low|med|high`, `?tonemap=aces|neutral|linear|none`.
