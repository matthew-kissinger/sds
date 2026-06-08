# Next Session - Cycle 75 webgpu-attract-prewarm (stub - needs authoring)

> **Updated:** 2026-06-08
> **For:** Cycle 75 `webgpu-attract-prewarm`. Plan: [`docs/cycle-75-plan.md`](docs/cycle-75-plan.md) (a STUB - pick the cycle focus, then fill Goal + Phases).
> **Pickup priority:** Cycle 74 (`webgpu-compile-reduction`) is CLOSED. It shipped the `compileAsync` prewarm mechanism (dormant behind the pin) and measured the real WebGPU path: the ~38s cold compile is SHARED konveyor-pipeline compilation, warmable to ~0.4s in-session. The data-founded follow-up is a background prewarm during attract that warms those pipelines so the first scene pick is fast (letting the pin come off). Decide Cycle 75 with Matt (attract-prewarm, or the remaining LIVE taste items), then `/cycle-start`.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-75-plan.md`](docs/cycle-75-plan.md) -> the touched module source. Authoritative closed-cycle log: [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Where It Stands

**Cycle 74 (`webgpu-compile-reduction`) is CLOSED (2026-06-08).** Run autonomously (Matt: "complete autonomously and commit and deploy at end - i can review all changes by playtesting prod when you are done"). Render-only: no `shared/` sim change; sim-baselines + refactor-baselines byte-identical.

- **P1 shipped the crash-fix mechanism, dormant.** An opt-in `SceneDef.prewarmShaders` flag drives a build-tail `renderer.compileAsync(scene, camera)` under an 'Optimizing shaders' load step (WebGPU-only, try/caught, both build paths via `_prewarmShadersIfOptedIn` in `js/main.js`). Set only on newsheepdogland. Dormant in prod (newsheepdogland still WebGL-pinned, no live scene sets the flag), so prod behavior is byte-identical.
- **P2 measured the real WebGPU ship path (RTX 3070, `cycle74-validation/`).** The prewarm STOPS THE CRASH (every cold load survived, no TDR). Cold compile ~38s (down from Cycle 72's ~83-95s). The decisive reframe: the ~38s is SHARED konveyor-pipeline compile, not a newsheepdogland tax. An in-session swap to newsheepdogland after any other WebGPU scene compiles in ~0.4s. Dawn's disk cache does not persist across browser launches (~37s warm == cold), so returning visitors get no free warm load.
- **P3 pin decision: STAY.** A ~38s first-pick load fails the within-budget gate; the hard stop is honored. The `renderer: 'webgl'` pin is restored; P1 ships dormant behind it. Recorded in `DECISIONS.md` + `cycle74-validation/README.md`.

Validation: `npm test` 1135 pass; `npm run lint` clean; `npm run build` clean. Bundle ratchet 586/604 KiB == baseline (no regression). No player-visible change shipped this cycle.

## What To Pick Up Next

Cycle 75 is a STUB. Decide the focus with Matt (do not do both), then `/cycle-start`:

1. **webgpu-attract-prewarm (autonomous, the path to lifting the pin):** build a background prewarm that compiles the shared konveyor pipelines during the attract/menu idle window, so the first real scene pick is fast (including newsheepdogland), letting the WebGL pin come off and unblocking the flagship's WebGPU Hosek sky + water. Data-founded by Cycle 74 (warming shared pipelines -> ~0.4s heavy loads). Risk: attract-mode UX (off-screen build/compile without janking the menu). Evidence: `cycle74-validation/README.md`, `tools/webgpu-prewarm-probe-cycle74.mjs`.
2. **feel-and-media-live LIVE items (paired, Matt's hands):** the survival feel LIVE retune, the two-dog co-op fun playtest, and the entrance hero FINAL blessing (pick from the Cycle 73 candidate set, or re-shoot once WebGPU lands).

## Open Carryover (deferred)

- The two Cycle 75 candidate threads above.
- Prior open carryover: tablet draw-call perf.

## Working Contract

- No `shared/` sim change unless the cycle explicitly scopes one with the four-piece migration story; the survival sim-baselines + every sim-baseline stay byte-identical otherwise.
- Don't remove the newsheepdogland WebGL pin unless a within-budget WebGPU cold path is actually verified on the RTX 3070 (the Cycle 72/73/74 hard stop carries forward; removing it is the live-crash class again). `SceneDef.prewarmShaders` already exists, so a pin-lift only edits `shared/scenes/newsheepdogland.js`.
- Don't decompose `GrassSystem` / `OptimizedSheep`. No version bump without Matt's call.
- Agent-launched Vite must set `SDS_SUPPRESS_BROWSER_OPEN=1`; close every Playwright page/browser and stop the dev server after a probe.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan (stub) | [`docs/cycle-75-plan.md`](docs/cycle-75-plan.md) |
| WebGPU prewarm mechanism (shipped, dormant) | `js/main.js` `_prewarmShadersIfOptedIn` + `SceneDef.prewarmShaders` |
| Prewarm measurement + shared-pipeline reframe | `cycle74-validation/README.md` (gitignored) + `tools/webgpu-prewarm-probe-cycle74.mjs` |
| The WebGL pin (and why it stays) | [`shared/scenes/newsheepdogland.js`](shared/scenes/newsheepdogland.js) (`renderer:'webgl'`) + [`DECISIONS.md`](DECISIONS.md) Cycle 74 entry |
| Latest closed cycle | [`docs/archive/cycles/cycle-74-plan.md`](docs/archive/cycles/cycle-74-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
