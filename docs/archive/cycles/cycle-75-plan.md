# Cycle 75 - webgpu-attract-prewarm

> Authored 2026-06-08 from the Cycle 74 stub. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> Run autonomously (Matt: "complete autonomously and commit and deploy at end - i can review all changes by playtesting prod when you are done"). Thread choice was forced: the other carried-in thread (`feel-and-media-live` LIVE taste items) is paired/Matt's-hands, so "autonomously" selects this one.

## Outcome (2026-06-08): thesis refuted by P1; pin stays; nothing player-visible ships

P1's measurement on the RTX 3070 refuted the cycle's premise. A first newsheepdogland
WebGPU load is dominated by a ~76s "Creating trees" build step (building ~400 native tree
node-material InstancedMeshes) that is per-build and does NOT cache across builds (nsl
built twice: 76.4s then 75.4s). The `compileAsync` tail is 95ms. So warming pipelines
during attract cannot make a first newsheepdogland pick within budget - the cost is not a
warmable shared-pipeline compile (Cycle 74 measured the tail and missed this wall), it is
per-build tree-pipeline work that no prewarm can pre-pay. P2 (build the prewarm) and P3
(lift the pin) were therefore not pursued: the prewarm is not built (it cannot hit its
goal and a default-scene warm janks the menu ~2.5s), and the pin STAYS. No `js/` or
`shared/` change ships; the scene files are restored byte-identical and prod is unchanged.
Evidence: `cycle75-validation/README.md` + the three `tools/webgpu-*-cycle75.mjs` probes +
the DECISIONS.md Cycle 75 entry. The real follow-up (cut the WebGPU tree build cost) is
scoped into Cycle 76, likely paired since it touches the flagship's trees.

- P1 - DONE (measured; thesis refuted).
- P2 - NOT PURSUED (prewarm not built; refuted by P1).
- P3 - DECIDED (pin stays; real blocker identified).
- P4 - validate + close + deploy (docs/tools only; app byte-identical).

The original plan follows, preserved as authored.

## Goal

Compile the shared konveyor render pipelines (grass, terrain, sky, water, sheep, trees) in the background during the attract/menu idle window, so the first real scene pick is fast instead of paying the one-time ~38s cold pipeline compile on the GPU device. Cycle 74 proved the lever: once any heavy WebGPU scene warms those shared pipelines, an in-session swap to newsheepdogland (its full material set, including the unique Hosek sky + water) compiles in ~372ms, and disposing the warm scene does not evict the device pipeline cache (swap-back ~22ms). The attract canvas renders behind the opaque entrance backdrop, so the warm is invisible. The user-visible payoff: the first scene a player picks loads fast for every WebGPU scene, and (if the 3070 numbers clear the budget gate) the newsheepdogland WebGL pin comes off, unblocking the flagship's real WebGPU sky + water. If the numbers do not clear the gate, the prewarm still ships (it speeds every other scene's first pick) and the pin stays, exactly as Cycle 74 kept it.

## Open questions to resolve before writing code

1. **Q1: What mechanism warms the pipelines without janking the menu or bleeding visually?** Two candidates, decided by Phase 1 numbers: (a) build the cheapest shared-pipeline-covering scene (Home Field default) behind the opaque entrance, `compileAsync`, then dispose back to the lightweight attract render (low steady-state cost, a transient build + dispose); (b) build it and keep it (no dispose dance, but a heavy per-frame render behind the menu until the pick). `buildSceneBody` is monolithically coupled to the live game instance, so a fully detached build is out of scope. Measure (a) vs (b) on the 3070 in Phase 1.
2. **Q2: How long is the warm, and what happens on a pick mid-warm?** `compileAsync` is Dawn's off-main-thread path, so the menu should stay smooth, but the BUILD that feeds it is synchronous main-thread work. Phase 1 measures attract frame deltas during the warm and the survival of a pick fired before the warm completes (the race must stay crash-free, P1's bar from Cycle 74).

## Phase 1 - measure the attract warm on the RTX 3070 (spike, autonomous, ~2hr)

**Independently testable.** Comes first because the pin-lift is irreversible-ish and the production mechanism choice (Q1) must be founded on numbers, not a guess. Reuses the Cycle 74 headed-GPU recipe (system Chrome + d3d11, persistent context).

A throwaway probe (`tools/webgpu-attract-prewarm-probe-cycle75.mjs`) boots cold into attract on WebGPU, warms the shared pipelines by building the default scene + `compileAsync` (the Home Field warm cost is the new number), then picks newsheepdogland (pin temporarily lifted, Cycle 74 marker style) and measures the pick compile against the ~38s cold baseline. It samples attract `requestAnimationFrame` deltas during the warm (jank) and fires a pick mid-warm (the race).

**Acceptance (EARS):**

- When the Phase 1 probe runs on the RTX 3070, then `cycle75-validation/` shall record the Home Field warm cost, the post-warm newsheepdogland pick compile (ms), the attract-frame deltas during the warm, and the mid-warm pick survival flag.
- When Phase 1 closes, then the plan shall name the chosen production mechanism (keep-built vs build-compile-dispose) with the measured reason.

## Phase 2 - implement the attract pipeline prewarm (autonomous, ~3hr)

**Depends on Phase 1's mechanism pick.** Add `_prewarmAttractPipelines()` to the game, idle-scheduled from `_enterAttractMode` after the existing GLB prefetch (`_prefetchSceneAssets`), WebGPU-only, one-shot, best-effort and try/caught so a failure falls through to today's lazy compile. Records `window.__sdsAttractPrewarm = { ok, costMs }` for the probe. Behind the mechanism Phase 1 picked.

**Acceptance (EARS):**

- When attract mode is entered on the WebGPU renderer, then the shared konveyor pipelines shall be compiled during the menu idle window and `window.__sdsAttractPrewarm.ok` shall become true.
- While on the WebGL renderer or a deep-link/MP/sandbox build (no attract), the prewarm shall be a no-op and the boot shall stay byte-identical.
- If the prewarm throws, then the build shall fall through to the status-quo lazy compile and the menu shall stay interactive.

## Phase 3 - verify on the 3070 + pin decision (autonomous, gated, ~2hr)

**Depends on Phase 2.** Probe the PRODUCTION prewarm end-to-end: boot cold into attract, let the prewarm run, pick newsheepdogland, confirm within budget; pick mid-warm, confirm crash-free; confirm no menu jank during the prewarm. The gate (the Cycle 72/73/74 hard stop, refined): a first newsheepdogland pick after the prewarm completes loads within budget, AND a first pick before the prewarm completes is still crash-free under P1's 'Optimizing shaders' bar, AND the prewarm does not jank the menu.

**Acceptance (EARS):**

- When the within-budget + crash-free + no-jank gate is met on the RTX 3070, then `shared/scenes/newsheepdogland.js` shall not contain `renderer: 'webgl'` (pin lifted) and the prewarm shall be live on WebGPU.
- If the gate is not met, then the pin shall remain, the prewarm shall ship as it stands (it still speeds other scenes' first pick), and `DECISIONS.md` shall record the measured reason.

## Phase 4 - validate + close (autonomous, ~1hr)

**Depends on Phase 3.** Restore any temporary measurement edits. Run `/validate`. Close via `/cycle-close`. Commit, push, deploy.

**Acceptance (EARS):**

- When the cycle closes, then `npm test` shall pass, `npm run build` shall be clean, the bundle ratchet shall hold, and the sheepdogsim.com deploy shall be green via GH Actions.

## Dependencies

```
Phase 1 (measure) -> Phase 2 (implement) -> Phase 3 (verify + pin) -> Phase 4 (close)
```

Fully sequential. Phase 1 gates the mechanism; Phase 3 gates the pin.

## Frozen files (cycle-specific additions)

- [`shared/scenes/newsheepdogland.js`](../shared/scenes/newsheepdogland.js) - Phase 3 may remove `renderer: 'webgl'` (the pin). Migration story: the pin is honored at two guards (boot gate in `js/main.js` and the `swapScene` pinned-scene reload, lines ~937-945); removing the field makes both no-ops for newsheepdogland, and `prewarmShaders: true` (already present from Cycle 74) routes the now-WebGPU build through `_prewarmShadersIfOptedIn`. Only edited if the Phase 3 gate is met. `SceneDef.prewarmShaders` already exists, so no schema change.

## Hard stops

Durable hard stops apply on every cycle - see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. Do not remove the newsheepdogland WebGL pin unless the Phase 3 gate is actually verified on the RTX 3070 (within-budget post-prewarm pick + crash-free mid-warm pick + no menu jank). The Cycle 72/73/74 hard stop carries forward; removing the pin without the verified gate is the live-crash class again.
2. Do not touch `shared/` sim files. This is a render-path cycle; the sim-baselines stay byte-identical.

## What NOT to do during this cycle

- Don't apply a survival feel retune autonomously (taste; Matt's live wolf night - the other deferred thread).
- Don't simplify the grass/terrain/water/sky shaders to cut compile cost. The prewarm hides the cost; it does not cut it. Shader reduction is a separate deliberate decision.
- Don't decompose `GrassSystem` / `OptimizedSheep`. Don't bump the version.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - the template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items
- [`docs/archive/cycles/cycle-74-plan.md`](archive/cycles/cycle-74-plan.md) - the cycle that proved the lever
- `cycle74-validation/README.md` - the prewarm measurement + the shared-pipeline reframe
- `tools/webgpu-prewarm-probe-cycle74.mjs` - the headed-GPU measurement harness (reuse for Phase 1 + 3)
- `js/main.js` `_prewarmShadersIfOptedIn` + `_enterAttractMode` + `_prefetchSceneAssets` - the wiring points
