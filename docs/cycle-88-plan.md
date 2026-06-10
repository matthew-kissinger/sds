# Cycle 88 - impostor-first scene loading (DRAFT, pending Matt's review)

> Drafted 2026-06-10 from Matt's loading-architecture feedback after watching Newsheepdogland stream in post-Play. Cycles 85/86/87 must close first (Matt's device pass + launch posting, then the `/cycle-close` ritual for all three). This draft is informed by a same-day spike; numbers below are measured, not guessed. Decision record: DECISIONS.md "Scene loading: partial-load-then-stream is right; the first frame must be complete at low fidelity".

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

## Open questions to resolve before writing code

1. **Q1: Where does the island-wide scatter run?** Author lean: inside the scene-load transition (camera fade / swap overlay), async before first-interactive, so the Play click pays ~0 and the first visible frame already has coverage. Fallback: as an immediate wave 0 with the sparse one-pass.
2. **Q2: How do impostors retire when a zone upgrades to LOD0?** Candidates: per-instance scale-to-zero in the impostor mesh (no rebuild, needs instance index bookkeeping per zone) vs rebuilding the impostor mesh minus the upgraded zone per wave (simpler, costs a rebuild per wave). Phase 1 decides with numbers.
3. **Q3: What does low tier get?** Author lean: impostor-only island forever (coverage without LOD0 upgrade cost) - strictly better than today's 1-wave cap for mobile. Validate on the S24+.
4. **Q4: Does the impostor atlas fetch need to move?** Kiln atlases currently load when the first impostor mesh builds; cold coverage moves that fetch to scene load. Async network, expected to overlap the transition; verify it does not gate first-interactive.

## Phase 1 - Finish the spike on the production path (~2hr, autonomous)

Measure the impostor-only consolidated mesh build (WebGPU compute-cull path) for ~1,800 trees: build cost, first-frame cost, VRAM. Extend `tools/probe-foliage-streaming-diag.mjs` to run against a production preview (`npm run build` + preview server) so the consolidated path is the one measured. Decide Q1 (scatter placement) and Q2 (impostor retirement mechanism) with the numbers; record both in this plan before Phase 2 starts.

**Acceptance (EARS):**

- When the probe runs against a production preview build, it shall capture per-wave scatterMs/buildMs on the consolidated WebGPU path and the impostor-only build cost.
- When Phase 1 closes, Q1 and Q2 shall each have a recorded decision in this plan.

## Phase 2 - Impostor-first cold coverage (~4hr, autonomous)

Island-wide scatter (per Q1 placement) + one impostor-only consolidated mesh on the cold path for every streamed-zone tree beyond the cold corridor. The scatter result is cached so streamed waves reuse it (scatter once, build per wave) instead of re-scattering per wave. Cold-path budget tests gain an impostor-coverage line; the existing tree-count bound splits into LOD0 bound (unchanged) + impostor bound.

**Files:** `js/world/foliageStreaming.js`, `js/world/TreePlacement.js`, `js/boot/initWorld.js`, `tests/foliage-streaming.spec.js`, `tests/newsheepdogland-scene.spec.js`.

**Acceptance (EARS):**

- When the NSL scene reaches first-interactive, tree coverage (impostor or LOD0) shall exist inside every `streamedZones` rect.
- When the NSL cold path builds, the system shall place fewer than 110 LOD0 trees before first-interactive (existing bound unchanged).
- If the impostor cold pass fails, then the system shall keep today's behavior (bare island, waves materialize) rather than block first-interactive.

## Phase 3 - Waves upgrade instead of materialize (~4hr, autonomous)

Each tree wave swaps its zone from impostor to LOD0: build the zone's LOD0 consolidated meshes (as today), then retire that zone's impostor instances (per Q2 mechanism). The scene-teardown abort path disposes both representations. Optional polish if time allows: ~300ms scale-in on upgraded LOD0 instances so any remaining transition reads as growth, not pop; otherwise BACKLOG.

**Acceptance (EARS):**

- When a tree wave completes, the system shall render no impostor instance inside that wave's rect (LOD0 replaces it).
- While waves stream on desktop, `QualityGovernor.missWindows` shall stay 0.
- If the scene is disposed mid-stream, then the system shall dispose both the impostor coverage and all streamed LOD0 controllers.

## Phase 4 - Signal-based arming (~2hr, autonomous)

Replace the fixed `START_DELAY_MS = 6500` with a QualityGovernor warmup-complete signal (the delay exists only to clear that window today); keep a bounded fallback timer so a missing signal can never stall streaming forever. Low tier per Q3: impostor-only island, no LOD0 waves, no grass (supersedes the 1-wave cap).

**Acceptance (EARS):**

- When the QualityGovernor warmup window closes, the streamer shall start within one idle slot.
- If the warmup signal never fires, then the streamer shall start within 10 seconds of arming.
- Where hardware tier is low, the system shall render impostor coverage island-wide and shall stream no LOD0 waves and no grass.

## Phase 5 - SceneDef loading-stage contract (~3hr, autonomous)

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
- Don't start this cycle before 85/86/87 close.

## Success criteria (cycle close)

- [ ] When Play lands on NSL, the first playable frame shall show tree coverage island-wide (screenshot proof vs the Cycle 87 bare-island screenshot).
- [ ] When all waves complete on desktop, visual parity with Cycle 87's end state shall hold (LOD0 near, impostors far, grass streamed).
- [ ] When `npm test` and `npm run build` run at close, both shall pass with sim-baselines byte-identical.
- [ ] When NSL loads on low tier, impostor coverage shall be island-wide with no LOD0 waves.

## References

- DECISIONS.md: "Scene loading: partial-load-then-stream is right; the first frame must be complete at low fidelity (2026-06-10)"
- Spike: `tools/spike-impostor-cold-scatter.mjs`, `tools/probe-foliage-streaming-diag.mjs`
- Predecessor: `docs/cycle-87-plan.md` Phases 2-4 (the streaming foundation this builds on)
