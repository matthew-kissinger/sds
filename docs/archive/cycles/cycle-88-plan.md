# Cycle 88 - impostor-first scene loading

> Drafted 2026-06-10 from Matt's loading-architecture feedback after watching Newsheepdogland stream in post-Play; Cycles 85/86/87 closed the same day (see `docs/BACKLOG.md`). Gated open by Matt's `/cycle-start` ("complete all of cycle through close") and executed autonomously the same day - all five phases shipped, per-phase status blocks below. Decision record: DECISIONS.md "Scene loading: partial-load-then-stream is right; the first frame must be complete at low fidelity" + the Cycle 88 close entry. Standing carryover that rides alongside this cycle, not in it: the S24+ device pass (Cycle 85/86/87 carryover) and the `docs/launch/` posting.

## Goal

Make the first playable frame of a streamed scene visually complete at low fidelity instead of partially absent. Newsheepdogland keeps its fast cold path and its post-Play streaming, but the cold path gains island-wide tree coverage as kiln impostors, and the streamed waves change meaning: they upgrade a zone from impostor to LOD0 rather than materializing trees into an empty zone. Streaming arms off a real signal instead of a fixed 6.5s timer, and every scene declares its loading stages on the SceneDef so all-cold vs streamed is an explicit budgeted decision per scene. Before: a bare island for the first ~7-30 seconds after Play, trees popping from nothing. After: the island silhouette is there from the first frame, and fidelity quietly improves behind the player.

## Spike results (2026-06-10, reference desktop RTX 3070)

`tools/spike-impostor-cold-scatter.mjs` (Node, pure shared scatter):

| Pass | Trees | Cost |
|---|---|---|
| Cold baseline today (homestead corridor) | 81 | 59ms |
| Island-wide scatter, per-zone densities (nearField 748 + midField 633 + farField 326 + horizon 140) | 1,847 | 278ms |
| One-pass sparse alternative (horizon density only) | 595 | 47ms |

Implications: full-density island scatter cannot ride the Play click synchronously (~5x today's scatter cost, worse on slow hosts) but hides easily inside the existing scene-load transition; the sparse one-pass is a fallback if even that is too hot. `tools/probe-foliage-streaming-diag.mjs` exists to capture per-wave scatter/build timings from a live session; the dev-server/WebGL capture is not representative of the production WebGPU consolidated path, which is the open measurement (Phase 1).

## Phase 1 results (2026-06-10, production preview, webgpu-production, RTX 3070)

`tools/probe-foliage-streaming-diag.mjs http://localhost:4173` (probe now takes a base URL and launches system Chrome with unsafe-webgpu args; headless Playwright Chromium loses the WebGPU adapter and soft-falls to WebGL, which measures the wrong path):

- Renderer `webgpu-production`, tier high, 40/40 waves, 1,800 streamed trees, grass 138,761 clumps in 80ms.
- Scatter Σ488ms across all waves (browser; Node spike said 278ms). Build Σ13.4s, and per-wave build is FIXED-OVERHEAD dominated: a 2-tree horizon wave costs ~670ms (consolidated mesh creation + compileAsync per wave), a 306-tree near wave ~172ms-3s. Wave count, not tree count, drives stream latency.
- Impostor atlas economics (Q4): cold coverage needs sidecar (~1KB) + albedo PNG (~1.1-1.2MB) per type; skipping the normal + depth atlases saves ~5MB. The fetch overlaps the scene-load transition and must not gate first-interactive: meshes place regardless and become visible when the atlas resolves.

**Q1 decision - scatter placement:** chunked island-wide scatter runs INSIDE the scene-load transition, started right after cold trees land, one planned wave per chunk with macrotask yields so it interleaves with the remaining await-bound build stages (mountains, farmhouse, fences, water, sheepdog, flock), awaited at a dedicated `logStep` stage before scene-body-complete. The per-wave results are CACHED and the streamed waves reuse them (scatter once, build per wave; wave scatterMs drops to ~0). Determinism: wave K scatters against cold + waves 0..K-1, same salts, byte-identical placement to what Cycle 87 streaming produced.

**Q2 decision - impostor retirement:** per-instance scale-to-zero with per-wave index-range bookkeeping. The cold coverage builds at most 8 small static InstancedMeshes (2 types x up to 4 azimuth-tile batches, 18 verts per instance); retiring a wave writes zero-scale matrices for that wave's ranges + one instanceMatrix upload (~14-29KB per mesh). Rebuild-per-wave would pay the measured fixed mesh-creation overhead 40 more times for nothing.

**Q3 refinement (validated in Phase 4):** low tier takes the sparse one-pass scatter (horizon density island-wide, ~595 trees, 47ms in Node) instead of the full 40-wave scatter - it never upgrades to LOD0, so the full-density cache would be dead weight on the slowest hosts.

**Impostor representation:** static 3-quad cross-billboards (the durable far-tree pattern) sourcing ONE side-view tile of the pre-baked kiln albedo atlas per instance (per-instance azimuth-tile variety via 4-way batch partitioning), `MeshBasicMaterial` + alphaTest, castShadow=false, registered in `builder._impostorMaterials` so `setImpostorTint` tints it with time-of-day via the existing cross-billboard fallback path, and in `builder.trees` so `clearTrees` tears it down (owned geometry/material, map nulled before dispose so the cached atlas survives). Renderer-agnostic: identical on webgpu-production and the WebGL per-chunk path. The full kiln relighting shader + per-frame CPU tile-sync runtime stays off this path - coverage wants silhouette, not relighting.

## Open questions to resolve before writing code

1. **Q1: Where does the island-wide scatter run?** Author lean: inside the scene-load transition (camera fade / swap overlay), async before first-interactive, so the Play click pays ~0 and the first visible frame already has coverage. Fallback: as an immediate wave 0 with the sparse one-pass.
2. **Q2: How do impostors retire when a zone upgrades to LOD0?** Candidates: per-instance scale-to-zero in the impostor mesh (no rebuild, needs instance index bookkeeping per zone) vs rebuilding the impostor mesh minus the upgraded zone per wave (simpler, costs a rebuild per wave). Phase 1 decides with numbers.
3. **Q3: What does low tier get?** Author lean: impostor-only island forever (coverage without LOD0 upgrade cost) - strictly better than today's 1-wave cap for mobile. Validate on the S24+.
4. **Q4: Does the impostor atlas fetch need to move?** Kiln atlases currently load when the first impostor mesh builds; cold coverage moves that fetch to scene load. Async network, expected to overlap the transition; verify it does not gate first-interactive.

## Phase 1 - Finish the spike on the production path (~2hr, autonomous)

> **Status (2026-06-10): SHIPPED.** Probe parameterized (base URL + system-Chrome unsafe-webgpu launch); production-preview capture on webgpu-production landed the numbers in "Phase 1 results" above. Q1 + Q2 decided and recorded there. The impostor-only build cost on the production path (captured after Phase 2 landed, same probe): scatter 323-327ms chunked, sidecar fetch 9-21ms, mesh build 5-8ms for 1,800 trees in 8 meshes, albedo textures bound at ~2.5-2.9s from nav - all inside the load transition. Artifacts: `cycle88-validation/probe-baseline-consolidated-path.json` (pre-change) + `probe-impostor-first-production.json` (post).

Measure the impostor-only consolidated mesh build (WebGPU compute-cull path) for ~1,800 trees: build cost, first-frame cost, VRAM. Extend `tools/probe-foliage-streaming-diag.mjs` to run against a production preview (`npm run build` + preview server) so the consolidated path is the one measured. Decide Q1 (scatter placement) and Q2 (impostor retirement mechanism) with the numbers; record both in this plan before Phase 2 starts.

**Acceptance (EARS):**

- When the probe runs against a production preview build, it shall capture per-wave scatterMs/buildMs on the consolidated WebGPU path and the impostor-only build cost.
- When Phase 1 closes, Q1 and Q2 shall each have a recorded decision in this plan.

## Phase 2 - Impostor-first cold coverage (~4hr, autonomous)

> **Status (2026-06-10): SHIPPED.** `buildColdFoliageCoverage` (foliageStreaming.js) + `loadColdImpostorAtlas`/`createColdImpostorGeometry`/`buildColdImpostorMeshes` (world/TreePlacement.js), kicked from initWorld right after trees land and awaited at a dedicated `Cold impostor coverage` load stage. Production measured: 1,800 trees / 8 meshes, scatter ~325ms interleaved with the other stages, mesh build 6ms; LOD0 cold bound untouched (79 cold trees); failure paths (sidecar failure, abort) degrade to the bare island per the EARS line. Diag: `window.__sdsFoliageColdCoverage`. Unit specs cover zone coverage, cache/live byte-equality, sparse mode, sidecar failure, abort, and the late-build retirement race. Post-close-validation fixes (same day, two rounds against CI):
> 1. The atlas fetch + impostor mesh build moved off the awaited path entirely - detached continuation (`coverage.impostorsReady`) with a retired-wave set guarding the wave-lands-first race, no fetch timeout at all (a timer on a path sharing a blocked main thread fires spuriously against an already-arrived response).
> 2. The real CI stall, reproduced locally under SwiftShader: the per-wave macrotask yields in the scatter loop. On software-GL hosts frames take seconds, so 40 yields starved ~0.5s of scatter CPU into ~100s of wall clock and blew the smoke/foliage load budgets. The scatter now runs as ONE synchronous chunk behind the swap overlay (404ms measured under SwiftShader, scene playable at 48s vs 146s).

Island-wide scatter (per Q1 placement) + one impostor-only consolidated mesh on the cold path for every streamed-zone tree beyond the cold corridor. The scatter result is cached so streamed waves reuse it (scatter once, build per wave) instead of re-scattering per wave. Cold-path budget tests gain an impostor-coverage line; the existing tree-count bound splits into LOD0 bound (unchanged) + impostor bound.

**Files:** `js/world/foliageStreaming.js`, `js/world/TreePlacement.js`, `js/boot/initWorld.js`, `tests/foliage-streaming.spec.js`, `tests/newsheepdogland-scene.spec.js`.

**Acceptance (EARS):**

- When the NSL scene reaches first-interactive, tree coverage (impostor or LOD0) shall exist inside every `streamedZones` rect.
- When the NSL cold path builds, the system shall place fewer than 110 LOD0 trees before first-interactive (existing bound unchanged).
- If the impostor cold pass fails, then the system shall keep today's behavior (bare island, waves materialize) rather than block first-interactive.

## Phase 3 - Waves upgrade instead of materialize (~4hr, autonomous)

> **Status (2026-06-10): SHIPPED.** Wave loop reuses the cold scatter cache (production: all 40 waves `fromCache`, scatter 0ms vs 488ms baseline) and calls `retireColdImpostorWave` after each wave's LOD0 meshes + prewarm land - production probe retired exactly 1,800 of 1,800 impostor instances. Teardown rides existing paths (impostor meshes in `builder.trees` -> clearTrees; cache nulled there too). Screenshot pair in `cycle88-validation/` shows no double-trees and no holes (hard stop #3 clear). The optional 300ms scale-in polish was NOT taken - the impostor->LOD0 swap reads clean at streamed-zone distances - recorded as a non-need rather than deferred work.

Each tree wave swaps its zone from impostor to LOD0: build the zone's LOD0 consolidated meshes (as today), then retire that zone's impostor instances (per Q2 mechanism). The scene-teardown abort path disposes both representations. Optional polish if time allows: ~300ms scale-in on upgraded LOD0 instances so any remaining transition reads as growth, not pop; otherwise BACKLOG.

**Acceptance (EARS):**

- When a tree wave completes, the system shall render no impostor instance inside that wave's rect (LOD0 replaces it).
- While waves stream on desktop, `QualityGovernor.missWindows` shall stay 0.
- If the scene is disposed mid-stream, then the system shall dispose both the impostor coverage and all streamed LOD0 controllers.

## Phase 4 - Signal-based arming (~2hr, autonomous)

> **Status (2026-06-10): SHIPPED.** `QualityGovernor.onWarmupComplete` (one-shot, fires on the first sample past `warmupUntil`, immediate for late subscribers) replaces the fixed 6.5s timer; `FALLBACK_START_DELAY_MS = 10_000` bounds a missing signal. Note the entrance flow consequence: the governor warms up during the start screen, so streaming now starts within one idle slot of scene-body-complete there - @local-only e2e still reads `qualityIndex 0` at completion. Low tier per Q3: `TIER_PRESETS.low.foliageStreamWaves = 0` -> sparse one-pass impostor island, `armFoliageStreaming` returns null (no waves, no grass). Unit specs: signal start, fallback start, no-double-run, low-tier null, governor signal semantics.

Replace the fixed `START_DELAY_MS = 6500` with a QualityGovernor warmup-complete signal (the delay exists only to clear that window today); keep a bounded fallback timer so a missing signal can never stall streaming forever. Low tier per Q3: impostor-only island, no LOD0 waves, no grass (supersedes the 1-wave cap).

**Acceptance (EARS):**

- When the QualityGovernor warmup window closes, the streamer shall start within one idle slot.
- If the warmup signal never fires, then the streamer shall start within 10 seconds of arming.
- Where hardware tier is low, the system shall render impostor coverage island-wide and shall stream no LOD0 waves and no grass.

## Phase 5 - SceneDef loading-stage contract (~3hr, autonomous)

> **Status (2026-06-10): SHIPPED.** `tests/scene-loading-stages.spec.js`: per-scene declaration table (all-cold: field <1,800 / rolling-hills <150 / open-country <400; streamed: newsheepdogland <110 cold) + completeness guard failing any registry scene without a declaration + stale-row guard. Durable rule added to `.claude/rules/scene-and-render.md` ("Scene loading stages"). No SceneDef schema change was forced by Phases 2-4, so none shipped - the contract is convention + tests as planned.

Codify the three-stage vocabulary (blocking critical path, first-interactive cold budget, streamed enhancement) as documentation plus per-scene budget tests: each scene's cold bounds (trees, grass clumps) become explicit per-scene test lines, and `scene-and-render.md` gains the durable rule (first frame complete at low fidelity; all-cold is a valid declared choice for small scenes, not an accident). No new SceneDef schema fields unless Phase 2/3 already forced one; the contract is convention + tests, not speculative schema.

**Acceptance (EARS):**

- When the contract lands, every scene in `shared/scenes/` shall have an explicit cold-path budget test line (count bounds or an explicit all-cold assertion).
- When `scene-and-render.md` is read, it shall state the impostor-first rule and the per-scene all-cold-vs-streamed decision protocol.

## Dependencies

```
Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 ; Phase 5 last (codifies what shipped)
```

## Frozen files (cycle-specific)

- None anticipated. `shared/scenes/types.js` is NOT expected to change (streamedZones already exists); if Phase 2 forces an optional field, it follows the fence cheap case with a migration note here first.
- No deterministic-sim files; sim-baselines stay byte-identical. Streamed scatter stays salted per-wave; the cold scatter stream stays byte-identical (the island-wide pass uses the wave salts, never the cold seed stream).

## Hard stops

1. If the impostor cold pass regresses any first-interactive stage timing on the entrance, stop and fall back to the sparse one-pass or wave-0 placement.
2. If any sim-baseline fixture differs, abort the phase.
3. If impostor retirement (Q2) produces visible double-trees or holes in the probe screenshots, stop before shipping the wave change.

## What NOT to do during this cycle

- Don't re-widen the cold LOD0 zones or grass radius; coverage comes from impostors, not from giving back the Cycle 85 stall fix.
- Don't make camera-relative per-frame LOD decisions; impostor vs LOD0 stays a static per-zone decision (durable far-tree rule).
- Don't decompose GrassSystem or OptimizedSheep; grass streaming is untouched this cycle.
- Don't start phases before Matt reviews this draft (`/cycle-start` is the gate).

## Success criteria (cycle close)

- [x] When Play lands on NSL, the first playable frame shall show tree coverage island-wide (screenshot proof vs the Cycle 87 bare-island screenshot). *Evidence: `cycle88-validation/first-frame-impostor-coverage.png` - far-shore + horizon tree line visible at the playable frame with 35 of 40 waves still pending (coverage diag: 1,800 trees, 8 meshes, completed inside the load transition).*
- [x] When all waves complete on desktop, visual parity with Cycle 87's end state shall hold (LOD0 near, impostors far, grass streamed). *Evidence: `cycle88-validation/post-stream-steady-state.png`; production probe: 40/40 waves, 1,800/1,800 impostors retired, grass 138,591 clumps, @local-only e2e `qualityIndex 0`.*
- [x] When `npm test` and `npm run build` run at close, both shall pass with sim-baselines byte-identical. *1,528 specs (1,517 passed / 11 skipped), build clean, no `tests/sim-baseline/` or golden diffs, lint + typecheck clean.*
- [x] When NSL loads on low tier, impostor coverage shall be island-wide with no LOD0 waves. *Proven by unit specs (sparse one-pass coverage + `armFoliageStreaming` null on low tier); the live phone confirmation rides the standing S24+ carryover session.*

## References

- DECISIONS.md: "Scene loading: partial-load-then-stream is right; the first frame must be complete at low fidelity (2026-06-10)"
- Spike: `tools/spike-impostor-cold-scatter.mjs`, `tools/probe-foliage-streaming-diag.mjs`
- Predecessor: `docs/cycle-87-plan.md` Phases 2-4 (the streaming foundation this builds on)
