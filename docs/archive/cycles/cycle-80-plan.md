# Cycle 80 — webgpu-flagship-lift

> Drafted 2026-06-08 from the Cycle 79 P1 spike outcome. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom, then `cycle79-validation/README.md` for the evidence this plan is built on. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **This carries the Cycle 79 spike forward.** Cycle 79 proved mesh-count consolidation is the lever (not `InstancedMesh2`, which is WebGL-only) and quantified it: the cold worst main-thread block is GPU resource-creation at ~8 ms/mesh (`worst ms ~= 108 + 8.3 x meshCount`), budget (~550 ms, WebGL's bar) lands at ~55 meshes, and consolidation hit 581 ms at 57 meshes (dead even with WebGL, 144 fps, 0 errors). The wall is the tree per-chunk impostor LOD: trees are quality-safe only to ~123 meshes (~1.9 s), and 1.9 s on a 3070 is ~3-4 s (TDR risk) on a weak GPU. The clean, all-hardware, full-quality lift needs GPU per-instance culling, not chunk-coarsening.

## Outcome (closed 2026-06-08)

**The WebGL pin's blocker is SOLVED on WebGPU at full quality.** GPU compute-driven per-instance culling (Path 1) collapses newsheepdogland's grass + trees from ~1,157 per-chunk InstancedMeshes to 8 total, dropping the cold worst main-thread long-task from 52,796 ms to **581 ms (driver-cache-cleared cold, dead even with WebGL's 548 ms)** at full quality - grass pixel-identical, trees lod0 unchanged, 144 fps, 0 errors, 0 crashes across 6 gate runs. The Cycle 79 tree-impostor-LOD wall is cleared (the default WebGPU tree path is lod0-only, no LOD to preserve; consolidation is material-agnostic via a compute-written compacted storage `instanceMatrix`).

- **Shipped (proven, validated on the 3070):** P1 the compute-cull primitive (TSL `renderer.compute()` + `drawIndexedIndirect` drives a node material on r184, GO); P2 grass 744->1 mesh pixel-identical; P3 trees 410->4 meshes material-agnostic; P4 the >=5-run hard-stop-1 gate (581 ms cold, 0 errors); P6 the regression guard (the probe + recorded thresholds).
- **Deferred to Cycle 81 (`webgpu-flagship-ship`):** P5 the actual pin flip (it is a player-visible flagship release on a new GPU render path = reviewed; needs un-flag-gating + a boot tier-gate so desktop lifts and mobile keeps the pin byte-identical) and P7 the real-device mobile WebGPU check. The plan's success criteria permit deferring phases to carryover.
- **What shipped to the repo:** one probe (`tools/webgpu-grass-compute-cull-probe-cycle80.mjs`) + full evidence in `cycle80-validation/README.md` (gitignored, local). The spike implementation (`grassComputeCullSpike.js` + `treeComputeCullSpike.js` + flag-gated branches in GrassSystem/TreePlacement/the konveyor grass material/the WebGPU boot) was built, measured, and reverted byte-identical (the bundle-size baseline guard correctly rejected the dormant +2.9 kB; Cycle 81 rebuilds it as clean un-flag-gated production code). Prod is byte-identical; 1135 vitest pass, build clean.

## Goal

Get WebGPU onto the newsheepdogland flagship: lift the lone `renderer: 'webgl'` pin so the scene loads on WebGPU within a hardware-portable budget, then turn on the WebGPU-only Hosek-Wilkie sky + water reflections (dark on the WebGL fallback today). The Cycle 79 spike settled the mechanism (mesh-count consolidation) and the wall (the tree impostor LOD caps chunk-coarsening). This cycle resolves the path fork and lands the lift. Decide Q1 with Matt at `/cycle-start`; the recommended destination is Path 1 (GPU compute-driven per-instance culling), with Path 2 (tier-gated chunk-coarsening) available as a faster interim that ships the WebGPU flagship to capable GPUs sooner.

## Open questions to resolve before writing code

1. **Q1 - the path fork. DECIDED 2026-06-08 (Matt delegated the pick): Path 1 is the destination; Path 2 tier-gated is the sanctioned interim if the WebGPU flagship beauty is wanted live on capable GPUs sooner; Path 3 is the fallback if a gate fails.** Re-confirm at `/cycle-start` (Matt may elect to ship Path 2 first).**
   - **Path 1 (recommended destination): GPU compute-driven per-instance culling + LOD.** TSL `instancedArray`/`storage` + `renderer.compute()` frustum-cull into a compacted instance buffer + one indirect draw per material. One grass mesh + one mesh per tree-type-LOD = budget mesh count AT full quality on ALL hardware. The WebGPU-native equivalent of what `InstancedMesh2` does on WebGL; future-proofs grass. Multi-day; the hardest part is the tree hybrid LOD (per-instance near/mid/impostor selection on the GPU). Phases 1-7 below.
   - **Path 2 (faster interim): tier-gated chunk-coarsening lift.** Ship the Cycle-79 grass + tree-scale-2 consolidation (~1.6-1.9 s on a 3070) and lift the pin only on med/high desktop tiers (the `HardwareTier` system already gates mobile vs desktop), keeping the WebGL pin on low tier. Gets the WebGPU sky + water on the flagship for capable GPUs this cycle; protects weak GPUs; does not help low-tier. Needs a grass/tree visual sign-off (hard stop 2). Alternative track below.
   - **Path 3: keep the pin.** No player-visible change; revisit later. The fallback if neither path clears its gate.
   - Author lean: Path 1 is the real answer to "WebGPU on all things." If Matt wants the visible win sooner, do Path 2 first as an interim, then Path 1 to bring low-tier along and collapse to one mesh. Not autonomous - Matt's call.
2. **Q2 (Path 1): does TSL `renderer.compute()` + indirect draw integrate with the konveyor grass NodeMaterial on Three r184?** The frozen-cohesive GrassSystem material is a konveyor `NodeMaterial`. Phase 1 spikes whether a compute-culled instance buffer can drive it with one indirect draw before the full port. Spike-risky-primitives-first.
3. **Q3 (Path 2): the tier-gate mechanism.** Where do the boot gate (`js/main.js` ~3392) and swapScene guard (~937) read `HardwareTier` to honor the pin on low tier only? Does the pin field stay on the SceneDef (always) with the guard consulting the tier, or does the scene express a `pinBelowTier`?
4. **Q4 (Path 1, trees): impostor geometry consolidation.** The Cycle 79 native tree path builds impostor billboard geometry per chunk (`createKonveyorTreeImpostorGeometry(chunkInstances)`). One-mesh impostors need per-instance billboard geometry across all instances. Confirm the kiln-impostor runtime supports a single instance set + per-instance LOD visibility.

## Phase shape rules

A cycle has <= 8 phases, each fully autonomous OR fully paired, single sharp goal, <= 4 hours. The Path 1 phases (2-5, 7) are flagship render-path engineering + a real-device perf and taste call = paired; the spike (1) and the regression guard (6) are autonomous. If Matt picks Path 2, swap Phases 1-3 for the Alternative track below; Phases 4-7 are path-agnostic.

## Phase 1 — Compute-culling primitive spike (AUTONOMOUS, ~3hr)

**Independently testable.** Path 1 hinges on one primitive: a TSL compute frustum-cull feeding one indirect draw, driving the konveyor grass NodeMaterial. Spike it behind a flag on newsheepdogland: build ONE grass `InstancedMesh` (all clumps), a `renderer.compute()` pass that frustum-culls per instance into a compacted index/instance buffer, and one indirect draw. Measure cold pipelines (target 1 grass), worst main-thread long-task, steady fps vs the Cycle 79 grass baselines. Reuse `tools/webgpu-grass-consolidation-probe-cycle79.mjs`. If the compute path will not drive the node material on r184, reassess (a custom WGSL instancing node, or `BatchedMesh` multi-draw-indirect) before the full port.

**Acceptance (EARS):**

- When the compute-cull grass flag is on, then the cold-load distinct grass render pipelines shall be 1 and the grass shall render via one indirect draw.
- When the camera turns, then off-frustum grass instances shall be culled by the compute pass (visible-instance count drops), confirmed in the probe scene-walk.
- When the spike completes, then a go/no-go verdict (and, if no-go, the next primitive) shall be written to `cycle80-validation/README.md`.
- While the flag is on, the grass shall render pixel-identical to the per-chunk baseline (side-by-side capture).

## Phase 2 — Grass: one mesh + GPU per-instance cull + LOD (PAIRED, ~4hr)

**Gated on Phase 1 go.** Port GrassSystem to a single consolidated mesh with compute-driven per-instance frustum culling + distance LOD, replacing the per-chunk frustum cull (`update()`), the per-chunk `applyLOD` count decimation, and the per-chunk InstancedMesh creation. Keep the look pixel-identical (hard stop 2): per-blade wind, the interaction SDF, the stochastic density-LOD dither/fade. GrassSystem stays one cohesive system (not decomposed - scene-and-render rule).

**Acceptance (EARS):**

- When Phase 2 ships, then newsheepdogland grass shall render from one consolidated mesh with no per-chunk `THREE.InstancedMesh`, at 1 grass pipeline.
- When grass renders after the port, then wind, interaction flattening, and distance density-LOD shall match the pre-port look (side-by-side capture).
- While the camera moves across the flagship, then per-instance GPU culling shall hold steady fps at least as good as the Cycle 79 grass3 baseline (114-144 fps) at full density.
- When `npm test` runs, then all vitest specs shall pass (grass is render-only; no sim-baseline change).

## Phase 3 — Trees: consolidated meshes + GPU per-instance cull + hybrid LOD (PAIRED, ~4hr)

**Gated on Phase 2.** The hardest phase. Port the native tree path to one consolidated mesh per tree-type-LOD with per-instance LOD state (near lod0 / mid lod1 / far impostor) selected on the GPU by per-instance camera distance, replacing the per-chunk hybrid visibility swap and per-chunk frustum cull. Consolidate impostor billboard geometry across all instances (Q4). Preserve the impostor crossfade + far-impostor (distance-from-origin) decision.

**Acceptance (EARS):**

- When Phase 3 ships, then the native tree path shall render from one consolidated mesh per tree-type-LOD, not one `THREE.InstancedMesh` per chunk, with the total nsl render-pipeline count below the Phase 6 regression threshold.
- When trees render after the port, then the near/mid/impostor LOD selection + crossfade shall match the pre-port look across a fly-through (side-by-side capture).
- While the camera moves, then per-instance GPU culling + LOD shall hold steady fps at least as good as the Cycle 79 WebGL baseline (142 fps).

## Phase 4 — Race fix + hard-stop-1 gate on the 3070 (PAIRED, ~2hr)

**Gated on Phases 2-3 (Path 1) or the Alternative track (Path 2).** Re-apply the validated Cycle 77 skip-render swap-disposal race fix in `js/main.js` `runFrame()`'s `_sceneRebuilding` branch. Run the cold-load budget gate on the 3070 across >= 5 runs.

**Acceptance (EARS):**

- When a scene swap into newsheepdogland runs on WebGPU, then the keep-alive render shall be skipped while `_sceneRebuilding` (no `Buffer used while destroyed`).
- When newsheepdogland cold-loads on WebGPU across >= 5 runs on the 3070, then the worst main-thread long-task shall be within budget (near WebGL's ~548 ms), with 0 `bufferDestroyed` and 0 `NodeBuilder` errors (hard stop 1). For Path 2, the gate applies on the med/high tier the lift targets.
- If any of the >= 5 runs exceeds budget or errors, then the pin shall stay (or stay below the targeted tier) and the cycle shall report the failing number.

## Phase 5 — Lift the pin + turn on the WebGPU beauty (PAIRED, ~2hr)

**Gated on Phase 4 pass.** Remove (Path 1) or tier-gate (Path 2) `renderer: 'webgl'` on `shared/scenes/newsheepdogland.js`. Confirm the WebGPU-only Hosek-Wilkie sky + water render correctly (Cycle 73 found them dark on the WebGL fallback). Capture the flagship hero.

**Acceptance (EARS):**

- When Phase 5 ships and hard stop 1 passed, then newsheepdogland shall load on WebGPU (all tiers for Path 1; med/high for Path 2) and shall not run the dark WebGL fallback there.
- When newsheepdogland loads on WebGPU, then the Hosek-Wilkie sky and water reflections shall render (not dark), confirmed by capture in `cycle80-validation/`.
- When the lift lands, then a flagship hero capture shall be saved to `cycle80-validation/`.

## Phase 6 — Pipeline-count regression guard (AUTONOMOUS, ~1.5hr)

Add a probe/test that fails if any scene cold-loads more than a threshold of WebGPU render pipelines, so the per-chunk many-small-meshes regression cannot silently return.

**Acceptance (EARS):**

- When the regression guard runs against newsheepdogland post-lift, then it shall assert the distinct render-pipeline count is below a recorded threshold and fail if exceeded.
- When `npm test` runs, then the guard shall be wired in (or documented as a manual probe in `cycle80-validation/` if it cannot run headless).

## Phase 7 — Mobile WebGPU validation (PAIRED, Matt's hands, ~2hr)

**Gated on the lift.** The consolidated path should help mobile too (fewer resources), but mobile WebGPU is unvalidated and cannot be tested autonomously. Real-device check on the tablet/phone; decide whether WebGPU becomes the mobile default for the flagship or mobile keeps a tier-gated WebGL path.

**Acceptance (EARS):**

- When newsheepdogland loads on a real mobile device on WebGPU, then the load shall be crash-clean and the steady fps recorded.
- When the mobile check completes, then the mobile renderer default for the flagship shall be decided and recorded in `DECISIONS.md`.

## Alternative track — Path 2 (tier-gated interim lift)

If Matt picks Path 2 at `/cycle-start`, replace Phases 1-3 with:

- **A1 — Land grass + tree consolidation as scene-config (PAIRED, ~3hr).** Promote the Cycle 79 spike knobs to a clean, density-preserving form: an optional `grass.chunkSize` SceneDef field (default 40) + a native-tree chunk-size knob, applied WebGPU-only so the shipped WebGL nsl stays byte-identical. nsl uses grass ~scale 3 + tree scale 2. Visual sign-off on the coarsened grass/trees (hard stop 2).
- **A2 — Tier-gate the pin (PAIRED, ~2hr).** The boot gate + swapScene guard honor the WebGL pin only on low tier (Q3); med/high desktop loads nsl on WebGPU. Mobile stays WebGL until Phase 7.

Then continue at Phase 4 (race fix + gate, applied on the med/high tier) -> Phase 5 (tier-gated lift + beauty) -> Phase 6 (regression guard) -> Phase 7 (mobile). Path 2 ships the WebGPU flagship to capable GPUs at a ~1.6-1.9 s one-time cold hitch; Path 1 remains the follow-up to reach all hardware at one mesh.

## Dependencies

```
Path 1:  1 (spike) -> 2 (grass) -> 3 (trees) -> 4 (race+gate) -> 5 (lift+beauty)
Path 2:  A1 (consolidate+sign-off) -> A2 (tier-gate) -> 4 (gate on med/high) -> 5 (tier-gated lift)
Both:    6 (regression guard) any time after the consolidation lands; 7 (mobile) after the lift.
```

## Frozen files (cycle-specific additions)

- `js/GrassSystem.js` — Path 1 Phase 2 (compute-cull port) or Path 2 A1 (scene-config chunk size). Stays one cohesive system (not decomposed); look pixel-identical, culling intact (hard stop 2). Migration: per-chunk cull + `applyLOD` move to per-instance GPU culling (Path 1) or coarser per-chunk (Path 2); consumers are GrassSystem-internal.
- `js/world/TreePlacement.js` + the konveyor tree hybrid/impostor runtime — Path 1 Phase 3 (per-instance LOD + consolidated impostor geometry) or Path 2 A1 (tree chunk size). Preserve the impostor crossfade + far-impostor decision.
- `shared/scenes/newsheepdogland.js` — Phase 5 removes (Path 1) or tier-gates (Path 2) `renderer: 'webgl'`. Authorized ONLY on a met hard stop 1. Scene-data edit, not a sim change. Path 2 A1 may add an optional `grass.chunkSize` field (new optional SceneDef field, default-preserving).
- `shared/scenes/types.js` — Path 2 A1 may add `GrassDef.chunkSize?` (optional, default 40; byte-identical for every other scene). Fence-frozen SceneDef schema: optional-field-with-default is the cheap case.
- `js/main.js` `runFrame()` + boot/swap guards — Phase 4 re-applies the Cycle 77 race fix; Path 2 A2 makes the boot gate + swapScene guard tier-aware.

## Hard stops

Durable hard stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific (carried from Cycles 72-79):

1. Do not remove (or tier-lift) the newsheepdogland WebGL pin unless a within-budget AND crash-clean AND error-free WebGPU cold load is verified on the RTX 3070 across >= 5 runs (worst main-thread long-task near WebGL's ~548 ms, 0 `Buffer used while destroyed`, 0 `NodeBuilder` errors). For Path 2 the gate is verified on the med/high tier the lift targets.
2. Do not degrade grass/tree visual quality or lose per-instance frustum culling without Matt's explicit sign-off. Path 1 must hold the look pixel-identical; Path 2's coarsened chunks need a visual sign-off before the lift.
3. Do not touch `shared/` sim files (render-path cycle; sim-baselines stay byte-identical - editing a scene def's `renderer`/`grass` fields is scene-data, not sim).
4. Do not regress the tree impostor LOD crossfade to cut mesh count (the Cycle 79 wall). Path 1 keeps it via per-instance GPU LOD; Path 2 keeps tree chunks at <= scale 2 (320 m, mobile's granularity).

## What NOT to do during this cycle

- Don't reach for `InstancedMesh2` (Cycle 79: WebGL-only, refuted for WebGPU).
- Don't ship the Cycle 78 padded attribute-path collapse (~9 s block) or re-apply the storage / uniform-capacity fixes (Cycles 76-78 refuted).
- Don't coarsen tree chunks past ~scale 2 to chase budget (breaks the impostor LOD - the Cycle 79 wall). Use per-instance GPU LOD (Path 1) instead.
- Don't decompose `GrassSystem` or `OptimizedSheep` (scene-and-render rule). The compute-cull port swaps the instancing primitive inside GrassSystem; it stays one cohesive system.
- Don't lift the pin against hard stop 1, and don't auto-bump the version or post a devlog. Player-visible release is Matt's call.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases (for the chosen path) shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] If the newsheepdogland pin is lifted (or tier-lifted), then a crash-clean, error-free, within-budget WebGPU cold load shall be verified on the RTX 3070 across >= 5 runs before the close commit (hard stop 1).
- [ ] If the pin is lifted, then the WebGPU-only Hosek-Wilkie sky + water shall be confirmed rendering on the flagship (not dark).

## References

- `cycle79-validation/README.md` — the spike that grounds this plan (mesh-count lever, 8 ms/mesh law, the tree-impostor wall, the per-config table)
- `tools/webgpu-grass-consolidation-probe-cycle79.mjs` — the probe (reuse for Phase 1)
- [`docs/archive/cycles/cycle-79-plan.md`](archive/cycles/cycle-79-plan.md) — Cycle 79 + its `## P1 spike outcome` (the basis for this fork)
- `node_modules/three/src/nodes/accessors/InstanceNode.js` — the uniform-vs-attribute instancing decision (Cycle 78 root cause)
- `C:\Users\Mattm\.claude\skills\webgpu-threejs-tsl\docs\compute-shaders.md` — TSL compute / `instancedArray` / `renderer.compute()` patterns for Path 1
- [`DECISIONS.md`](../DECISIONS.md) — the WebGL-pin rationale + the Cycle 73 dark-sky/water finding
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
