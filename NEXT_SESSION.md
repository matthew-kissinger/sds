# Next Session - Cycle 76 webgpu-tree-build-cost (stub - needs authoring)

> **Updated:** 2026-06-08
> **For:** Cycle 76 `webgpu-tree-build-cost`. Plan: [`docs/cycle-76-plan.md`](docs/cycle-76-plan.md) (a STUB - pick the cycle focus and mode, then fill Goal + Phases).
> **Pickup priority:** Cycle 75 (`webgpu-attract-prewarm`) is CLOSED. Its measurement REFUTED the attract-prewarm thesis: a first newsheepdogland WebGPU load is dominated by a ~76s "Creating trees" build step that is per-build and does NOT cache, so no prewarm can pre-pay it (this also corrects Cycle 74's "warmable to 0.4s" conclusion, which measured the compile tail and missed the tree-build wall). The real blocker - and the only thing that lifts the pin - is cutting the WebGPU tree-build cost. That is Cycle 76, likely PAIRED (it touches the flagship's trees). Decide focus + mode with Matt, then `/cycle-start`.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-76-plan.md`](docs/cycle-76-plan.md) -> the touched module source. Authoritative closed-cycle log: [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Where It Stands

**Cycle 75 (`webgpu-attract-prewarm`) is CLOSED (2026-06-08).** Run autonomously (Matt: "complete autonomously and commit and deploy at end - i can review all changes by playtesting prod when you are done"). The thread was forced (the other carried-in thread, `feel-and-media-live` LIVE, is paired). P1's measurement refuted the premise, so the cycle re-scoped to its honest outcome (the Cycle 72 spike-re-scope pattern). No `shared/` sim change; sim-baselines + refactor-baselines byte-identical.

- **The thesis is refuted.** A newsheepdogland WebGPU swap spends ~76s in "Creating trees" (building ~400 native tree node-material InstancedMeshes, `js/world/TreePlacement.js#placeTrees`); every other build step is under 1s and the `compileAsync` tail is 95ms. WebGL builds the whole scene in ~2.2s. Building newsheepdogland twice in one session measured 76.4s then 75.4s - the tree cost is per-build and does not cache on Dawn. So no attract prewarm can make a first pick within budget.
- **Cycle 74's conclusion is corrected.** Its "warmable to ~0.4s" measured the `compileAsync` tail only; the real ~76s wall was hiding in the swap's WALL time. The pin's true justification is the tree-build cost, not a warmable shared-pipeline compile.
- **Pin STAYS; no prewarm built; nothing player-visible ships.** The scene files were temp-edited for the measurement (pin lifted, default-scene prewarm flag) and restored byte-identical. Committed change is docs + three probe tools (`tools/webgpu-*-cycle75.mjs`), not bundled into the app, so the built app is byte-identical to the Cycle 74 baseline. Recorded in [`DECISIONS.md`](DECISIONS.md) + `cycle75-validation/README.md`.

Validation: `npm test` 1135 pass / 8 skip; `npm run lint` clean; `npm run build` clean. Bundle ratchet 586/604 KiB == baseline.

## What To Pick Up Next

Cycle 76 is a STUB. Decide focus + mode with Matt (do not do both), then `/cycle-start`:

1. **webgpu-tree-build-cost (likely PAIRED, the path to lifting the pin):** cut the ~76s WebGPU tree node-material build so newsheepdogland loads within budget on WebGPU, which lifts the pin and unblocks the flagship's WebGPU Hosek sky + water. Start with a measure-first spike (distinct-pipeline count; why pipelines do not cache across builds on Dawn - shader-module identity vs WGSL-content keying). Likely paired: it touches the flagship's trees + deep render internals (konveyor node materials, `placeTrees`). Evidence: `cycle75-validation/README.md`.
2. **feel-and-media-live LIVE items (paired, Matt's hands):** the survival feel LIVE retune, the two-dog co-op fun playtest, and the entrance hero FINAL blessing.

## Open Carryover (deferred)

- The two Cycle 76 candidate threads above.
- Prior open carryover: tablet draw-call perf.

## Working Contract

- No `shared/` sim change unless the cycle explicitly scopes one with the four-piece migration story; sim-baselines stay byte-identical otherwise.
- Don't remove the newsheepdogland WebGL pin unless a within-budget WebGPU cold LOAD (build + compile, measured per-step on the RTX 3070) is verified. Cycle 75 showed the BUILD (~76s trees), not the compile, is the wall; the gate is the full first-pick wall time. The Cycle 72/73/74/75 hard stop carries forward.
- Don't re-attempt the attract prewarm to lift the pin (Cycle 75 refuted it; the cost is per-build, not warmable).
- Don't degrade the flagship's tree visual quality to cut compile cost without Matt's explicit sign-off.
- Don't decompose `GrassSystem` / `OptimizedSheep`. No version bump without Matt's call.
- Agent-launched Vite must set `SDS_SUPPRESS_BROWSER_OPEN=1`; close every Playwright page/browser and stop the dev server after a probe.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan (stub) | [`docs/cycle-76-plan.md`](docs/cycle-76-plan.md) |
| The ~76s tree-build finding | `cycle75-validation/README.md` + `tools/webgpu-nsl-build-profile-cycle75.mjs` + `tools/webgpu-tree-cache-probe-cycle75.mjs` |
| The tree build path | [`js/world/TreePlacement.js`](js/world/TreePlacement.js) (`placeTrees`) |
| The WebGL pin (and why it stays) | [`shared/scenes/newsheepdogland.js`](shared/scenes/newsheepdogland.js) (`renderer:'webgl'`) + [`DECISIONS.md`](DECISIONS.md) Cycle 75 entry |
| WebGPU prewarm mechanism (shipped Cycle 74, dormant) | `js/main.js` `_prewarmShadersIfOptedIn` + `SceneDef.prewarmShaders` |
| Latest closed cycle | [`docs/archive/cycles/cycle-75-plan.md`](docs/archive/cycles/cycle-75-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
