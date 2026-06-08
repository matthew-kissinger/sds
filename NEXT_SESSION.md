# Next Session - Cycle 78 webgpu-nsl-count-collapse (stub - needs authoring)

> **Updated:** 2026-06-08
> **For:** Cycle 78 `webgpu-nsl-count-collapse`. Plan: [`docs/cycle-78-plan.md`](docs/cycle-78-plan.md) (a STUB - pick the fork and mode, then fill Goal + Phases).
> **Pickup priority:** Cycle 77 proved the newsheepdogland cold WebGPU load is ~80s of pipeline compilation dominated by the COUNT (~950 distinct per-chunk shaders), and that the storage fix does NOT collapse that count, so it never brought the load within budget - Cycle 76's "84s -> 16s" was a time-to-renderable artifact. The swap-disposal race now has a validated one-line fix. The pin lift is a PAIRED fork: (B) a real count-collapse then a clean lift, (A) accept the race for a ~16s-to-interactive lift, or pivot to the deferred feel-and-media-live thread. This is the 5th cycle on this pin with no player-visible change. Decide the fork with Matt, then `/cycle-start`.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-78-plan.md`](docs/cycle-78-plan.md) -> the touched module source. Authoritative closed-cycle log: [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Where It Stands

**Cycle 77 (`webgpu-nsl-pin-lift`) is CLOSED (2026-06-08).** Run autonomously (Matt: "complete and deploy autonomously"). Measure-first; it overturned Cycle 76's headline. No `shared/` sim change; sim-baselines byte-identical; prod byte-identical.

- **The correction.** The total cold WebGPU compile of newsheepdogland is **~80s, not ~16s**. Cycle 76's "84s -> 16s storage win" measured time-to-renderable (the rendererReady wall): the keep-alive render makes the scene look interactive at ~16s (~91fps) while ~60-80s of pipeline compilation continues underneath (`compileAsyncMs` 62-81s; Cycle 76's own Dawn-boundary probe: 86.6s / 968 pipelines). The storage fix does NOT collapse the ~950 per-chunk pipeline count, so it never brought the load within budget. The COUNT, not per-pipeline cost, is the driver.
- **The two blockers are tractable.** Blocker 1 (the swap-disposal race) has a validated one-line fix: skip the keep-alive `sceneManager.render()` in `js/main.js runFrame()`'s `_sceneRebuilding` branch on WebGPU only (`bufferDestroyed` 22 -> 0 across 5 swaps). Blocker 2 (the NodeBuilder ShaderMaterial error) did not reproduce (0 across ~10 loads; the scene walk shows 0 ShaderMaterial instanced meshes).
- **Pin STAYS; nothing shipped to `js/` / `shared/`; prod byte-identical.** Hard stop 1's within-budget gate is unmet (~80s vs WebGL's ~2.2s). Neither lift path is a clean autonomous ship; both want Matt. Recorded in [`DECISIONS.md`](DECISIONS.md) + `cycle77-validation/README.md`. One probe committed (`tools/webgpu-pinlift-verify-cycle77.mjs`).

Validation: `npm test` 1135 pass / 8 skip; `npm run lint` clean; `npm run build` clean. Bundle ratchet 600.54 / 618.78 kB == Cycle 76 baseline.

## What To Pick Up Next

Cycle 78 is a STUB. Decide the fork + mode with Matt (do not do more than one), then `/cycle-start`:

1. **Path B - count-collapse, then a clean lift (the real fix, likely PAIRED):** make all per-chunk grass + tree InstancedMeshes share ONE pipeline (the device-dependent attribute path behind a `maxUniformBufferBindingSize` probe, or a shared instance buffer / batching) so Dawn compiles ~6 shaders not ~950, bringing the cold load toward ~2.2s; preserve per-chunk culling + the exact look (hard stop 2); re-apply the validated skip-render race fix; then lift the pin. Evidence + the two one-liners: `cycle77-validation/README.md`.
2. **Path A - race-tolerant lift (Matt's risk call):** keep the keep-alive render (scene interactive at ~16s at ~91fps), accept the `Buffer used in submit while destroyed` validation warnings (no crash observed), lift. A flagship undefined-behavior risk call, not autonomous.
3. **Pivot - feel-and-media-live LIVE items (paired, Matt's hands):** survival feel LIVE retune, two-dog co-op fun playtest, entrance hero FINAL blessing. After 5 measure-first pin cycles with no player-visible change, a legitimate place to step.

## Open Carryover (deferred)

- The Cycle 78 fork above (paths A / B / pivot).
- Prior open carryover: tablet draw-call perf.

## Working Contract

- No `shared/` sim change unless the cycle explicitly scopes one with the four-piece migration story; sim-baselines stay byte-identical otherwise.
- Don't remove the newsheepdogland WebGL pin unless a within-budget AND crash-clean AND error-free WebGPU cold load is verified on the RTX 3070. Cycle 77 proved the ~80s compile (count-dominated) is the real wall; the storage fix alone does NOT clear it - a count-collapse does. The Cycle 72-77 hard stop carries forward.
- Don't re-apply the storage fix expecting a budget win (Cycle 77 refuted it) or re-attempt the attract prewarm (Cycle 75 refuted it) or re-measure the compile from scratch (Cycle 77 found it: ~80s, count-dominated).
- Use a device-limit probe if pursuing the attribute path (Cycle 76: device-dependent, can re-trip the TDR crash). Don't degrade grass/tree visual quality or lose per-chunk culling without Matt's sign-off. Don't decompose `GrassSystem` / `OptimizedSheep`. No version bump without Matt's call.
- Agent-launched Vite must set `SDS_SUPPRESS_BROWSER_OPEN=1`; close every Playwright page/browser and stop the dev server after a probe.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan (stub) | [`docs/cycle-78-plan.md`](docs/cycle-78-plan.md) |
| The ~80s count-dominated compile + the two validated one-liners (race fix + storage flag) | `cycle77-validation/README.md` + `tools/webgpu-pinlift-verify-cycle77.mjs` |
| The swap-disposal race fix site | [`js/main.js`](js/main.js) `runFrame()` `_sceneRebuilding` branch |
| The per-chunk InstancedMesh sites (count-collapse target) | [`js/world/TreePlacement.js`](js/world/TreePlacement.js) (`createNativeTreeInstancedMeshes`) + [`js/GrassSystem.js`](js/GrassSystem.js) (`createChunk`) |
| Three's uniform-vs-storage-vs-attribute instancing decision | `node_modules/three/src/nodes/accessors/InstanceNode.js` |
| The WebGL pin (and why it stays) | [`shared/scenes/newsheepdogland.js`](shared/scenes/newsheepdogland.js) (`renderer: 'webgl'`) + [`DECISIONS.md`](DECISIONS.md) Cycle 77 entry |
| Latest closed cycle | [`docs/archive/cycles/cycle-77-plan.md`](docs/archive/cycles/cycle-77-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
