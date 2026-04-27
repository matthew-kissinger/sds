# Cycle 9 — playtest-triage + cross-platform

> Drafted 2026-04-26 after Cycle 8 (`mode-matrix`) closed. Re-scoped 2026-04-27 from a user playtest that surfaced seven concrete bugs. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Fix the seven user-reported playtest bugs, build the cross-platform / cross-browser test infrastructure that prevents the Mac-only rendering regression class from recurring, and ship safety nets for surfaces that failed silently on Safari.

**User-visible after:** solo Classic always shows `0/200` regardless of scene; multiplayer rooms honour the host's chosen sheep count; multiplayer guests render the room's actual scene instead of the URL default; leaderboard solo tabs no longer show a redundant sheep-count dropdown; macOS Safari is exercised every night in CI; entities sit slightly above the heightfield instead of sinking into ridges.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code. The ecosystem evolves; what was "the" solution last cycle may not be optimal now.
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile) before committing to a technique. Use `PerformanceMonitor` and the per-system triangle breakdown.
- **Pick the simplest thing that meets the budget** rather than the most impressive. If the simple version reads correctly, ship it; escalate only on demonstrated need.

## Open questions to resolve before writing code

(Prefix with **Q1**, **Q2**, ... so phases can refer to them.)

1. **Q1: Cycle 8 playtest verdict on each acceptance item.** Walk the Cycle 8 carryover list (below) end-to-end. Mark each item green / yellow / red.
2. **Q2: MP bandwidth at 500/1000 sheep.** Measure WS+MessagePack throughput on a representative consumer connection. If bandwidth holds at 1000, lift the cap to 3000. If it doesn't, document the cap and consider delta compression.
3. **Q3: Mac rendering bug root cause.** White ground / no sun / no water on RH+OC. Diagnostics shipped behind `?debug=gl`; needs the macOS Safari nightly to fire and surface telemetry before guarded fixes can target the actual culprit.

## Cycle 8 carry-over (deferred from `mode-matrix` close)

These were code-complete at Cycle 8 close but needed live playtest to confirm. Cycle 9 Phase 1 is to verify each:

- Insane / Chaos modes spawn the right sheep count on Field, RH, and OC (cluster-aware spawn + density-driven radius scaling).
- Insane and Chaos leaderboards are populated cleanly and no longer pollute soloClassic.
- Per-(mode × scene × sheepCount) partition filters return the right rows in the leaderboard UI.
- Sandbox launches cleanly on Rolling Hills and Open Country, including the cross-scene reload UX.
- MP rooms can pick non-200 sheep counts up to the Cycle 8 cap of 1000.
- Cycle 6 + 7 playtest carryover items 1-6 (camera triangulation matrix on RH Follow under stamina-out + tree contact, OC gather→drive verb at 40/2.0, frametime budget on OC).
- Phase 6 follow-camera triangulation polish reads smooth on RH Follow under stamina-out + tree contact (no clipping on ascent, no camera lurch on tree graze, no facing-flip when dog stops).
- No frametime regression on RTX 3070 desktop or mobile target.

## Shipped status (2026-04-27)

Phases 9.1 — 9.5 below shipped in one push. Verification deferred to a later session driven by the macOS Safari nightly artifact + a manual playtest of the changed flows.

### Phase 9.1 — sheep-count ownership refactor + leaderboard simplification + MP plumbing

- **Solo:** count is owned by mode unconditionally — Classic=200, Extreme=1000, Insane=3000, Chaos=5000. [`js/GameState.js:790-816`](../js/GameState.js) replaces the Cycle 7 `sceneSpawnDef.count` override path. `sceneSpawn.count` on scene defs is now a *density hint* only, forwarded as `defaultCount` for spawn-radius scaling but never authoritative for `totalSheep`.
- **MP:** [`js/GameState.js`](../js/GameState.js) reads `room.sheepCount` via `getCurrentRoom()` from [`GameBridge`](../js/GameBridge.js); falls back to scene def, then 200. [`js/MenuController.createRoom`](../js/MenuController.js) now forwards `settings.sheepCount` (the React path at [`App.handleCreateRoom`](../js/components/App.js) already did).
- **Leaderboard:** [`GlobalLeaderboard.js`](../js/components/Multiplayer/GlobalLeaderboard.js) hides the sheep-count dropdown on solo tabs (the mode determines the count), keeps it on MP tabs (host picks). Switching tabs resets both filters to prevent cross-mode contamination. The dropdown's options are also corrected to MP's allowed set `{200, 250, 500, 1000}` (was including 3000/5000 which were never valid MP partitions).

### Phase 9.2 — MP scene-sync helper

[`App.js`](../js/components/App.js) now calls `ensureSceneMatchesRoom(room, {isHost})` after every `createRoom` / `joinRoom` / `quickMatch`. Guests/quickMatch with a mismatched URL `?scene=` reload to `?scene=<roomSceneId>#/r/<roomCode>`, hitting the existing invite-flow re-entry. Hosts log a warning instead of reloading (their pre-flight URL is set by `ScenePicker`; auto-reloading would drop their newly-created room). Closes the `MP joiner renderer sync` standing risk.

### Phase 9.3 — Cross-platform test infrastructure

- [`playwright.config.ts`](../playwright.config.ts) gains Firefox + WebKit projects.
- New [`tests/e2e/webgl-extensions.spec.ts`](../tests/e2e/webgl-extensions.spec.ts) — runs across all three Playwright browsers, asserts `EXT_color_buffer_float` + `OES_texture_float_linear`, attaches a full GL snapshot to the test report.
- [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) gains an `e2e` job (Linux, all three Playwright browsers) on every push.
- New [`.github/workflows/macos-safari.yml`](../.github/workflows/macos-safari.yml) — nightly + `workflow_dispatch` real macOS Safari smoke. Builds the site, serves `dist`, drives Safari via `safaridriver`, captures per-scene screenshot + `__sdsDiag` JSON. Uploads as a 14-day artifact.
- New [`tests/safari-smoke/run.mjs`](../tests/safari-smoke/run.mjs) — Selenium-based runner; skips silently on non-macOS.
- [`tests/e2e/oc-perf.spec.ts`](../tests/e2e/oc-perf.spec.ts) gated to chromium-only (frametime budgets are headless-Chromium calibrated).
- New [`docs/cross-platform-testing.md`](cross-platform-testing.md) — living matrix + 2026 tooling reference.
- `selenium-webdriver` added as a devDep.

### Phase 9.4 — Mac rendering bug (diagnostics + safety nets)

Speculative shader fixes deferred until the macOS Safari nightly produces telemetry; the alternative (shotgunning fixes blind) had a high false-positive rate.

- New [`js/diagnostics/glProbe.js`](../js/diagnostics/glProbe.js) — behind `?debug=gl`, dumps WebGL context info, render-target lifecycle events, and a post-first-frame framebuffer sample (4 points; flags `near-white` / `near-black` collapse) to `window.__sdsDiag`. Picked up by both Playwright and the Safari smoke runner.
- [`js/SceneManager.js`](../js/SceneManager.js) and [`js/main.js`](../js/main.js) wire context capture and the post-frame sample.
- [`js/water/DepthPrePass.js`](../js/water/DepthPrePass.js) reports render-target alloc events to the probe and wraps the per-frame `setRenderTarget`/`render` in `_safeRender` so a single bad frame can't break the loop.
- [`js/main.js:663`](../js/main.js) wraps the entire water init in try/catch so a Safari/Metal alloc failure degrades the island to dry-island instead of crashing.

### Phase 9.5 — Heightfield Y-sample mitigation

Defensive lift instead of the full mesh-aligned bake (deferred to BACKLOG).

- New [`Heightfield.surfaceY(x, z)`](../shared/terrain/Heightfield.js) returns `sample(x, z) + 0.05`. Documented as visual-placement-only; sim/physics keep using raw `sample()` so behaviour stays decoupled.
- [`js/OptimizedSheep.js`](../js/OptimizedSheep.js) (2 sites) and [`js/Sheepdog.js`](../js/Sheepdog.js) use `surfaceY` for the InstancedMesh / mesh transform Y. Sim baseline byte-identical (verified — sim never read the visual Y).

## Dependencies

```
Phase 1 (verification) → Phase 2 (bandwidth) → Phase 3 (tuning) [optional]
```

## Frozen files (cycle-specific additions)

- `tests/sim-baseline/` — DO NOT regenerate fixtures.
- `worker/migrations/` — append-only.

## Hard stops

Surface to the user, do not proceed:

1. Frozen-file change without scope authorization — see [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).
2. Sim-baseline test failure that you don't understand — don't regenerate fixtures, escalate.
3. Visual regression on a previously-passing scene — fix or revert before adding new scope.
4. Phase 2 bandwidth measurement showing the wire is overloaded at 200 (the existing baseline) — that's a Cycle 8 regression and should be diagnosed before any cap change.

## What NOT to do during this cycle

- Don't add new scenes. Three is still the right number.
- Don't reopen multiplayer architecture.
- Don't touch `shared/MovementPhysics.js` `updateMovement` to insert obstacle logic.
- Don't merge `canStartSprint` and `canContinueSprint`.
- Don't regenerate `tests/sim-baseline/` fixtures.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] All phases shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] All vitest specs pass.
- [ ] Production build clean.
- [ ] Live on sheepdogsim.com via GH Actions.
- [ ] All Cycle 8 carryover items verified or explicitly deferred.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/archive/cycles/cycle-8-plan.md`](archive/cycles/cycle-8-plan.md) — prior cycle (Cycle 8 mode-matrix)
- [`docs/archive/cycles/`](archive/cycles/) — past cycle plans
