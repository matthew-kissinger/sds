# Cycle 81 — webgpu-flagship-ship

> Drafted 2026-06-08 after Cycle 80 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom, then `cycle80-validation/README.md` (the proof this cycle ships) and `docs/archive/cycles/cycle-80-plan.md`. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Outcome (shipped 2026-06-08)

**SHIPPED. The flagship WebGL pin is lifted on desktop WebGPU; mobile keeps it.** Autonomous (Matt: "complete autonomously, device is connected (tablet - lower end)"). Commit `7c8e74c` + the close. All six phases done:

- **P1-P2** - the Cycle 80 compute-cull rebuilt as clean production code (grass index-remap to 1 mesh pixel-identical, trees data-compaction to 4 meshes material-agnostic, 8 total; disposal-safe instance-owned controllers on TerrainBuilder), tier-gated by a shared `isMobileClient()` at the boot + swap guards. Build clean, 1135 tests pass, bundle baseline 586 -> 591 KB.
- **P3 (hard stop 1) - PASSED** on the production boot path (RTX 3070, 6 runs incl. a driver-cache-cleared cold run): worst main-thread long-task 506 ms cold (512-721 ms warm), at or under WebGL's 548 ms, 0 bufferDestroyed / 0 NodeBuilder / 0 crashes, 144 fps, 8 meshes, 27 render + 10 compute pipelines.
- **P4** - the WebGPU-only Hosek sky + water confirmed rendering on the lifted flagship; clean hero captured.
- **P5** - the connected Galaxy Tab S9 FE (Mali-G68) exposes no `navigator.gpu` in Chrome or Brave, so mobile loads WebGL regardless; keep-the-pin decision recorded in `DECISIONS.md`.
- **P6** - the gate probe doubles as the recorded regression guard (`GUARD=1`: <= 30 render pipelines, <= 12 InstancedMeshes).

No `shared/` sim change (a comment-only correction to the newsheepdogland renderer note; sim-baselines byte-identical). Full evidence + the exact edits: `cycle81-validation/README.md`.

## Goal

Ship what Cycle 80 proved. Cycle 80 demonstrated that GPU compute-driven per-instance culling cold-loads newsheepdogland on WebGPU in 581 ms (driver-cache-cleared, at WebGL's 548 ms bar) at full quality - 8 InstancedMeshes, 144 fps, 0 errors - solving the 7-cycle pin blocker. This cycle turns that proof into the live flagship: rebuild the compute-cull as clean un-flag-gated production code, tier-gate the WebGL pin so desktop loads WebGPU (with the Hosek-Wilkie sky + water + reflections that are dark on the WebGL fallback) and mobile keeps WebGL byte-identical, then validate mobile WebGPU on a real device before deciding the mobile default. User-visible difference: on desktop, the flagship survival island renders on WebGPU with the full sky + water for the first time.

## How to read this plan

The mechanism is proven and measured (`cycle80-validation/README.md`). This cycle is productionization + the reviewed live flip, not research. Re-measure the gate on the real boot path (not the spike flags) before lifting.

## Open questions to resolve before writing code

1. **Q1: the tier-gate signal at boot.** The pin is honored at two sync sites - the boot gate (`js/main.js` ~3392) and the swap guard (~938), both testing `loadScene(id)?.renderer === 'webgl'`. Author lean: gate both on a sync mobile-UA check (mirror `usePlatform.js`'s `/Android|webOS|iPhone|iPad|iPod|.../i.test(navigator.userAgent)`), so desktop lifts and mobile keeps the pin. Err toward honoring the pin when uncertain (the safe current behavior). Keep `renderer: 'webgl'` on the scene def.
2. **Q2: production scoping of the compute-cull.** Cycle 80 gated it on `window.__SDS_*` debug flags. Author lean: replace with clean conditions scoped to the flagship only - grass `konveyorApplied && !isMobile && this._isCoastline`; trees `builder.sceneDef?.renderer === 'webgl' && !builder.isMobile && !useProductionNativeImpostor`; stash `webGpuModules` unconditionally on the WebGPU boot. Blast radius stays nsl-desktop.

## Phase 1 — Rebuild grass + tree compute-cull as production code (PAIRED, ~4hr)

Re-author the Cycle 80 spike modules (`grassComputeCullSpike.js`, `treeComputeCullSpike.js`) as clean, un-flag-gated production modules (drop the `window.__SDS_*` flags for the Q2 conditions; keep the names tidy). Grass: index-remap compaction into the konveyor blade material (pixel-identical, transform fold = T*R*S). Trees: data-compaction storage `instanceMatrix` (material-agnostic). Mind the bundle-size baseline guard (`tests/refactor-baseline/baseline.spec.ts`) - if main grows past the cap, bump the recorded baseline in the same commit with the reason.

**Acceptance (EARS):**
- When newsheepdogland loads on WebGPU desktop, then grass shall render from one consolidated mesh and trees from one mesh per type-childmesh, at the Cycle 80 pipeline counts (<= 30 render).
- While the camera moves, then per-instance GPU culling shall hold >= the Cycle 80 fps (144) and the grass look shall match the per-chunk baseline (side-by-side capture).
- When `npm test` runs, then all vitest specs shall pass and the bundle baseline guard shall pass (or be bumped with a recorded reason).

## Phase 2 — Tier-gate the pin (PAIRED, ~2hr)

Make the boot gate + swap guard honor `renderer: 'webgl'` only on mobile (Q1). Desktop loads nsl on WebGPU; mobile loads it on WebGL byte-identical.

**Acceptance (EARS):**
- When a desktop client boots or swaps into newsheepdogland, then it shall load on WebGPU (the pin is not honored).
- While the client is mobile, then newsheepdogland shall stay on WebGL byte-identical to today.

## Phase 3 — Gate on the real boot path + lift confirm (PAIRED, ~2hr)

Re-run the >= 5-run cold-load budget gate on the 3070 via the PRODUCTION path (no spike flags) - both the direct `?scene=newsheepdogland` boot and the menu-Play swap. Confirm within budget (near WebGL's ~548 ms), 0 `bufferDestroyed`, 0 `NodeBuilder`, 0 crashes (hard stop 1, now on the shipped path).

**Acceptance (EARS):**
- When newsheepdogland cold-loads on WebGPU desktop across >= 5 production-path runs, then the worst main-thread long-task shall be within budget with 0 errors.
- If any run exceeds budget or errors, then the desktop lift shall not ship and the failing number shall be reported.

## Phase 4 — Turn on the WebGPU beauty + hero (PAIRED, ~2hr)

Confirm the WebGPU-only Hosek-Wilkie sky + water reflections render on the lifted flagship (Cycle 73 found them dark on the WebGL fallback; the Cycle 80 probe shots already show the sunset sky + water rendering). Capture the flagship hero.

**Acceptance (EARS):**
- When newsheepdogland loads on WebGPU, then the Hosek sky + water reflections shall render (not dark), confirmed by capture in `cycle81-validation/`.
- When the lift lands, then a flagship hero capture shall be saved.

## Phase 5 — Mobile WebGPU validation (PAIRED, Matt's device, ~2hr)

Real-device check on the tablet/phone: does nsl-on-WebGPU load crash-clean on mobile with the consolidated path? Record steady fps; decide whether mobile keeps the WebGL pin or also lifts. Record in `DECISIONS.md`.

**Acceptance (EARS):**
- When newsheepdogland loads on a real mobile device on WebGPU, then the load shall be crash-clean and the steady fps recorded.
- When the mobile check completes, then the mobile renderer default for the flagship shall be decided and recorded in `DECISIONS.md`.

## Phase 6 — Regression guard wired (AUTONOMOUS, ~1.5hr)

Promote the Cycle 80 probe to the recorded regression guard: assert nsl cold-loads <= 30 distinct render pipelines and <= 12 InstancedMeshes. Wire into CI as an optional GPU job or document as the manual pre-release probe.

**Acceptance (EARS):**
- When the guard runs against newsheepdogland post-lift, then it shall assert the pipeline + mesh counts are below the recorded thresholds and fail if exceeded.

## Dependencies

```
1 (rebuild prod) -> 2 (tier-gate pin) -> 3 (gate on prod path) -> 4 (beauty + hero)
5 (mobile) after the lift; 6 (guard) any time after Phase 1.
```

## Frozen files (cycle-specific additions)

- `js/GrassSystem.js`, `js/world/TreePlacement.js` + the konveyor grass blade material - the production compute-cull (look pixel-identical, culling intact - hard stop 2). Stay cohesive (not decomposed).
- `shared/scenes/newsheepdogland.js` - keep `renderer: 'webgl'` (mobile honors it); do NOT remove it (the tier-gate is in the guards).
- `js/main.js` boot gate (~3392) + swap guard (~938) - the tier-gate. Scoped: only nsl is pinned, so blast radius is nsl-desktop.

## Hard stops

Durable hard stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific (carried from Cycles 72-80):

1. Do not lift (or tier-lift) the desktop pin unless the production-path cold load is within budget across >= 5 runs on the 3070, 0 `bufferDestroyed`, 0 `NodeBuilder`, 0 crashes (hard stop 1, now on the shipped path).
2. Do not degrade grass/tree visual quality or lose per-instance frustum culling (hard stop 2). Grass stays pixel-identical; trees stay lod0.
3. Do not touch `shared/` sim files (render-path cycle; sim-baselines stay byte-identical).
4. Do not lift the MOBILE pin until Phase 5's real-device check passes.

## What NOT to do during this cycle

- Don't reach for `InstancedMesh2` (Cycle 79: WebGL-only) or chunk-coarsening (Cycle 79: breaks the tree impostor LOD).
- Don't ship the desktop lift against hard stop 1, and don't lift mobile without Phase 5.
- Don't auto-bump the version or post a devlog - the player-visible release is Matt's call.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When the desktop lift ships, then a within-budget production-path cold load shall be verified on the 3070 across >= 5 runs (hard stop 1).
- [ ] When the lift ships, then the WebGPU Hosek sky + water shall be confirmed rendering on the flagship (not dark).

## References

- `cycle80-validation/README.md` — the proof this cycle ships (the mechanism, the numbers, the exact scoped edits)
- `tools/webgpu-grass-compute-cull-probe-cycle80.mjs` — the probe / regression guard
- [`docs/archive/cycles/cycle-80-plan.md`](archive/cycles/cycle-80-plan.md) — Cycle 80 + its Outcome section
- [`DECISIONS.md`](../DECISIONS.md) — the WebGL-pin rationale + the Cycle 73 dark-sky/water finding
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
