# Cycle 103 - proper-impostors-and-webgpu-goldens

> Drafted 2026-06-15 after Cycle 102 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

The octahedral far-tree impostors are already view-dependent, relit, and KTX2-encoded (Cycles 91/99/101/102), but three first-principles gaps keep them from reading as the *same tree* at the LOD0-to-impostor switch (200m): (1) the impostor relight is a hand-tuned approximation with magic constants, in two divergent code paths, while the LOD0 leaf is standard PBR - so brightness and color can step across the crossfade; (2) the octahedral tile selector round-trips only 54 of 64 baked directions (an off-by-one at the steep-down fold seam); (3) the per-tile resolution (128px at 1024 squared) has never been validated against the LOD0 silhouette at the transition distance. This cycle closes the "match at the switch" trio and - because the production render path is WebGPU and the current golden harness silently renders WebGL - rebuilds the golden harness to capture the real WebGPU path on the installed Chrome channel, then rebaselines the suite so it is a trustworthy render gate for the first time since Cycle 91. There is no player-visible change beyond the canopy reading cleaner at distance; this is correctness, lighting match, and test-infra trust. Lessons drawn from pixel-forge (octahedral projection, blank-atlas guard, edge-bleed, the perceptual resolution question) and terror-in-the-jungle (one shared foliage-lighting rig imported by every foliage surface, by contract).

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code.
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile) before committing to a technique.
- **Pick the simplest thing that meets the budget** rather than the most impressive.

Reference material from the three-source research pass (held in this session, summarize on request):
- **pixel-forge** (`games-3d/pixel-forge`): `packages/core/src/kiln/imposter/projection.ts` is the canonical `octaEncode`/`octaDecode` to match in Phase 3; `bake.ts` is the bake harness SDS already shells. Lessons: octahedral over latlon (adopted), drop depth (adopted), blank-atlas guard (adopted), edge-bleed before atlas compose (adopted), and "tile resolution is perceptual, not formulaic - it must pass the visual A/B at the LOD boundary" (Phase 4).
- **terror-in-the-jungle** (`games-3d/terror-in-the-jungle`): `BillboardNodeMaterial.ts` exports one wrapped-Lambert + hemisphere-fill + low-sun-fade rig (RIG_WRAP, RIG_HEMI_UP_SKY_WEIGHT, RIG_LOW_SUN_FADE_FLOOR) that NPCs, vegetation, and terrain all import - "no re-tuning per family, shared by contract." That is the Phase 2 model: one lighting authority, not two approximations.

## Open questions to resolve before writing code

1. **Q1: For the shared lighting rig (Phase 2), does the impostor relight get calibrated to reproduce the LOD0 leaf's MeshStandard PBR response, or do both LOD0 leaf and impostor convert to one shared analytic wrapped-Lambert rig (TIJ's approach)?** Author lean: calibrate the impostor to reproduce the LOD0 PBR response and leave the LOD0 leaf material's look untouched. The LOD0 mesh is the reference the impostor must match; changing both at once risks regressing the near canopy for no gain. The shared module then holds the calibration constants and a parity helper both materials reference. Revisit only if reproducing PBR analytically in the impostor proves too lossy.
2. **Q2: Which camera and zoom reliably places trees in the beyond-200m impostor band for a deterministic golden cell on Rolling Hills and Open Country?** Author lean: add one far-view classic cell per island (high zoom, framing the tree mass past the consolidated far-switch distance) and confirm by capture that the impostor material is actually exercised. NSL stays out of the headless-deterministic matrix (streaming non-determinism, Cycle 97) and is covered by the Phase 6 paired check instead.
3. **Q3: Keep the octahedral atlas at 128px per tile (1024 squared) or move to 256px (2048 squared)?** Author lean: keep 128px if it passes the Phase 4 silhouette bar. Cycle 102 just shrank the wire by 1.10 MiB; do not regress that without a measured silhouette failure. Decide by measurement, not preference.

## Architecture / shared changes

**One shared foliage-lighting rig.** A new module (working name `js/world/foliageLightingRig.js`) holds the foliage lighting constants and the relight expression in a form both the LOD0 leaf material (`webgpuTreeLeafNodeMaterial.js`) and the impostor material (`webgpuKilnImpostorNodeMaterial.js`) import. Today the impostor file carries two divergent relight paths with literal constants (`wrapPow 1.2`, `fresnelStrength 0.04`, ambient `0.7 PI`, ground `0.35 PI` at lines 88-95, 212-224; and a second path with `0.65/0.35/0.42` at lines 335-451) while the leaf uses MeshStandard PBR. The shared module is the single source of truth for the match; phases 2 and 4 both depend on it. This is additive (a new module + import edits), not a schema change.

## Phase shape rules

A cycle has **<= 8 phases**, each fully autonomous or fully paired (no mixed mode), each a single sharp goal of <= 4 hours.

## Acceptance criteria - EARS format

Every phase's Acceptance section uses [EARS notation](https://kiro.dev/docs/specs/):

- **Event-driven**: `When [trigger], the [system] shall [response].`
- **State-driven**: `While [precondition], the [system] shall [response].`
- **Unwanted-event**: `If [unwanted], then the [system] shall [response].`

## Phase 1 - Golden capture on the WebGPU path (~3hr, autonomous)

**Independently testable. The keystone: every later visual gate depends on the harness actually rendering what ships.** The harness at `tools/validation/screenshot-golden.mjs` launches headless bundled Chromium, which has no `navigator.gpu`, so `index.html` silently demotes to WebGL (`main.js:3331-3339`) and all 12 current goldens are WebGL frames. The impostor material under change is WebGPU-only and is never rendered. Switch the capture launch to the installed-Chrome headed-WebGPU pattern already proven in `tools/cycle91-canopy-ab.mjs:14` and `tools/cycle90-nsl-visual-differential.mjs:110` (`channel: 'chrome', headless: false, args: --use-angle=d3d11 --enable-gpu --enable-unsafe-webgpu --ignore-gpu-blocklist`). Add a fail-closed guard that aborts the capture if the active renderer is not WebGPU, so a silent WebGL demotion can never re-pin a WebGL golden again.

**Acceptance (EARS):**

- When the golden capture runs on this box, the harness shall render via the production WebGPU path (assert the renderer-identity flag, for example `window.__sdsG.productionWebGpu === true`, before writing each PNG).
- If the capture demotes to WebGL, then the harness shall exit nonzero and write no golden PNG.
- When `npm run validation:screenshots -- --diff` runs, the harness shall use the installed Chrome channel headed, not headless bundled Chromium.

**Status: CODE WRITTEN 2026-06-15 (autonomous); verification run gated on the browser pop-up (Matt's go).** `tools/validation/screenshot-golden.mjs` now launches the installed Chrome channel, headed, with WebGPU enabled (`channel: 'chrome', headless: false`, args `--use-angle=d3d11 --enable-gpu --enable-unsafe-webgpu --ignore-gpu-blocklist`) - the proven cycle90/91 pattern - replacing the headless bundled Chromium that silently demoted to WebGL. Added `assertWebGpuEngaged`, called per cell right after `__perfHarness.isReady`: it throws (fail-closed, no PNG written, process exits nonzero) unless `window.__sdsG.productionWebGpu.ok === true` and `window.__sdsRendererMode.effective !== 'webgl'` - the flags main.js sets to false / `'webgl'` on any WebGPU boot or preflight fallback (main.js:3331-3335). `node --check` passes. NOT yet run: the run opens a headed Chrome window on this box, which I committed to pausing for. To verify (Matt's go): with a dev/preview server up and `SDS_SUPPRESS_BROWSER_OPEN=1`, run `node tools/validation/screenshot-golden.mjs --diff` (or `--capture`) and confirm WebGPU engages (no fail-closed throw); the headless path must now correctly refuse rather than write a WebGL golden.

**Status: VERIFIED 2026-06-15 (Matt's "go"), both paths.** Positive: headed installed Chrome -> WebGPU engaged -> all 12 cells captured, no fail-closed throw (the 12 WebGPU frames are P5's golden candidates; eyeballed clean - trees read as colored foliage, no blowout, no gross seam from the P2 rig or P3 selector; first real WebGPU render of the P2/P3 changes, de-risking the TSL refactor's compile-correctness). Negative: `SDS_GOLDEN_FORCE_HEADLESS=1` (bundled Chromium, no navigator.gpu) -> WebGPU demoted to WebGL -> `assertWebGpuEngaged` threw and the process exited 2 with no PNG written (`ok=false, effective=webgl, reason=webgpu-device-request-failed`). The guard fails closed exactly as designed; a future headless run can never silently re-pin WebGL goldens. The `SDS_GOLDEN_FORCE_HEADLESS` toggle is a kept, documented negative-path affordance (defaults off; production is headed Chrome).

## Phase 2 - Shared foliage lighting rig (~4hr, autonomous)

**Depends on: nothing (code + unit test; can run parallel to Phase 1 and 3).** Extract one foliage-lighting rig module and import it into both `webgpuTreeLeafNodeMaterial.js` and `webgpuKilnImpostorNodeMaterial.js`. Collapse the two divergent impostor relight paths into the single shared expression. Per Q1, calibrate the impostor to reproduce the LOD0 leaf response; do not change the LOD0 leaf look. The gate is numeric parity, not a screenshot.

**Acceptance (EARS):**

- When the rig module is imported, both `webgpuTreeLeafNodeMaterial.js` and `webgpuKilnImpostorNodeMaterial.js` shall source their foliage lighting constants from it (grep: no duplicated `wrapPow`/`fresnelStrength`/ambient literals across the two files).
- When outgoing luminance is computed for a sweep of (sun direction, surface normal, ambient) values, the LOD0-leaf model and the impostor relight shall agree within a recorded epsilon (new vitest unit test).
- When `webgpuKilnImpostorNodeMaterial.js` is read, it shall contain a single relight path (the legacy second path at the old lines 335-451 removed).
- If the LOD0 leaf material's rendered look changes (not just the impostor's), then the phase shall stop and surface, because the LOD0 mesh is the match reference.

**Status: SHIPPED 2026-06-15 (autonomous; Q1 resolved = Option A, calibrate impostor to PBR).** New module `js/world/foliageLightingRig.js` is the single foliage-lighting authority. Per Matt's Q1 call, the rig defaults reduce the impostor to the LOD0 leaf's PBR-Lambert response (the leaf is MeshStandard roughness 1 / metalness 0 -> Lambert diffuse + PI-consistent hemispheric ambient, no env map); the half-Lambert wrap, Schlick fresnel rim, subsurface lift, and the latlon flat floor all retire to zero. Both impostor relight paths now call one shared `buildFoliageImpostorColorNode`: path 1 (consolidated octahedral, the 200m switch) and path 2 (latlon per-chunk) - the latlon path pre-multiplies its historically-raw ambient by PI so its dominant ambient brightness is preserved while its sun term becomes PBR-correct. The LOD0 leaf sources `roughness`/`metalness` from the rig (same values; look unchanged - hard-stop #2 held). New gate `tests/foliage-lighting-rig-parity.spec.js`: impostor reduces to the PBR leaf within a recorded 1e-9 over a (sun, normal, ambient) sweep; the one reserved `directWrap` knob is proven to lift the shadow side (so default 0 is the genuine match); a source guard pins both materials to the shared builder and asserts the retired magic is gone. Suite 1576 green, lint clean, build green; nothing committed.

Carried to Phase 6 (visual, needs the GPU): (1) confirm the NSL canopy shadow side reads right at the switch - if a single Lambert billboard normal reads darker than the aggregate LOD0 canopy, bump `FOLIAGE_RIG.directWrap` (the one knob); (2) the latlon per-chunk far trees (Home Field) shifted to a PBR-correct sun term + hemispheric ambient - eyeball it. Revert path for the latlon change only: restore the `wrappedSun`/floor relight block in `createWebGpuKilnImpostorNodeMaterial`.

## Phase 3 - Octahedral round-trip correctness (~2hr, autonomous)

**Depends on: nothing (pure JS + unit test; can run parallel to Phase 1 and 2).** Fix the fold-seam in `selectOctahedralImpostorTiles` (`js/impostors/impostorTileSelection.js:81-113`) and its shader mirror in `webgpuKilnImpostorNodeMaterial.js`. The likely defect is cell-versus-vertex centering: the selector maps direction to grid with `(tilesX - 1)` (8 sample points, 7 intervals) at lines 93-94, while the sidecar `directions[]` are baked at tile centers. Match pixel-forge's `octaDecode` (`projection.ts`) so the round-trip is exact.

**Acceptance (EARS):**

- When each of the 64 baked capture directions from a real octahedral sidecar is fed to `selectOctahedralImpostorTiles`, the selector shall return the originating tile as its highest-weight tile (new vitest: 64/64 round-trip, replacing the documented 54/64).
- When the JS selector and the shader selector receive the same direction, they shall select the same primary tile (parity asserted via a shared constant or a mirrored-math unit test).
- If the round-trip count is below 64/64 at phase close, then the phase shall not ship.

**Status: SHIPPED 2026-06-15 (autonomous).** Root cause was cell-versus-vertex centering, confirmed against pixel-forge `enumerateOctahedralTiles` (tiles bake at `u = ((i + 0.5) / tilesX) * 2 - 1`). Fixed the selection inverse to `* tilesX - 0.5` in both `js/impostors/impostorTileSelection.js:93-94` and the shader mirror `js/webgpuKilnImpostorNodeMaterial.js:127-128` (in lockstep; fold math was already identical across JS, shader, and pixel-forge `octaEncode`). The `selectLatLonHemiYImpostorTiles` production-default path is untouched. New gate `tests/impostor-octahedral-roundtrip.spec.js`: every committed tile-center direction (loaded from the real shipped sidecar, fold seam included) selects its own tile - **64/64**, up from the documented 54/64; plus a source-parity guard pinning JS and shader to the same cell-centered inverse (TSL cannot be CPU-evaluated). Full suite 1572 passing, lint clean, build green. No re-bake needed (the selector inverts the existing atlas; the visual confirm of the cleaner seam is the Phase 6 paired check).

## Phase 4 - Re-bake plus resolution decision (~3hr, autonomous bake + measured A/B)

**Depends on: Phase 1 (WebGPU capture for the A/B), Phase 2 (lit with the shared rig), Phase 3 (correct selector).** Re-bake the octahedral atlas through the existing `tools/bake-tree-impostors.mjs` path (local pixel-forge CLI, source GLBs under `assets/_originals/`; the bake runs on WebGL/SwiftShader and is unaffected by the headless-WebGPU gap). Measure 128px-at-1024 versus 256px-at-2048 silhouette at the 200m transition with the now-WebGPU harness, ship the winner per Q3, and record the decision. Re-run `encode-impostors-ktx2` and keep the parity guard green.

**Acceptance (EARS):**

- When the LOD0-to-impostor transition cell is captured under WebGPU, the shipped per-tile resolution shall hold a silhouette SSIM at or above a recorded bar against the LOD0 reference frame.
- When the bake runs, the blank-atlas floor guard shall pass and `tests/impostor-ktx2-parity.spec.js` shall stay green.
- When the resolution decision is made, the chosen value and its measured numbers shall be recorded in this plan's Acceptance log and in `DECISIONS.md` if it changes from 128px.
- If the re-bake drifts the latlon or cold-coverage atlases, then the phase shall stop (the trio is octahedral-only).

**Status: RESOLVED 2026-06-15 (Matt's "go") - Q3 = KEEP 128px; 256 is not cleanly bakeable.** Built the 128-vs-256 A/B. Forced impostors into frame for a judgeable test (temp far-switch 200->120, git-reverted) and captured 128px (healthy). The 256 re-bake (manifest tileSize 256, `bake-tree-impostors --only octahedral`, then `encode-impostors-ktx2`) succeeded for tree2 (2048^2, 1241 KB albedo) but produced a **BLANK atlas for tree1** - 16 KB vs the committed 128px atlas's 229 KB, the rendered 2048^2 PNG is empty, barely clearing pixel-forge's blank-atlas guard. So 256px is not a manifest flip: the tree1 octahedral bake breaks at 256px tiles (a pixel-forge ortho/scale issue), needing bake-pipeline work out of this cycle's scope. Decision: **keep 128px** - it is healthy, 256 is not cleanly bakeable, and Cycle 102's 1.10 MiB wire win plus 256's 4x VRAM both argue against it even if it baked. No atlas change ships; the *match* (P2 rig + P3 selector) is what lands. All A/B mutations reverted via `git checkout` (TreePlacement.js, the manifest, assets/models/trees/octahedral/); `git status` confirms the working tree holds only the P1/P2/P3 work, latlon `.ktx2` byte-stable. A/B evidence: `cycle103-validation/res-ab/`. Future work if 256 is ever wanted: fix the tree1 256px octahedral bake in pixel-forge first (carry to BACKLOG at cycle close).

## Phase 5 - Rebaseline the WebGPU golden suite (~3hr, autonomous + recorded acceptance)

**Depends on: Phase 1, 2, 3, 4 (rebaseline reflects the fixed look).** With the impostor fixes landed, re-pin every cell as a WebGPU golden under the canonical headed-Chrome environment, add the far-view impostor cells from Q2, and rewrite `tools/validation/golden/MANIFEST.md` to record the WebGPU capture environment, the date, and the Cycle 103 changes as the rebaseline rationale. This is the deliverable that makes the harness trustworthy again.

**Acceptance (EARS):**

- When `npm run validation:screenshots -- --diff` runs after rebaseline, all cells shall pass at or above 0.95 SSIM against the new WebGPU goldens.
- When the matrix is read, it shall include at least one far-view cell per island (Rolling Hills, Open Country) that exercises the beyond-200m impostor band, confirmed to render the impostor material.
- When `MANIFEST.md` is read, it shall record that goldens are WebGPU-captured (installed Chrome channel), the rebaseline date, and the Cycle 103 rationale.
- While NSL remains streamed, the headless-deterministic matrix shall not include NSL (covered by the Phase 6 paired check instead).

**Status: PARTIAL 2026-06-15 (Matt's "go") - rebaseline attempted, blocked on follow-camera/sim determinism.** Ran `--baseline` on the WebGPU path (headed Chrome, switch=200, 128px) writing 12 candidate goldens, then `--diff` to self-check. Mean SSIM 0.981; 10/12 cells >= 0.95 - every classic/world-axis cell, including the impostor-band cells (RH classic 0.977-0.994, OC classic 0.980-0.990). 2 cells FAIL: `open-country follow zoom25` (0.926 at sun085, 0.946 at sun05). Root cause, confirmed by comparing golden vs re-capture: NOT alphaHash and NOT the impostor/P2/P3 work - the tree layout and framing differ between the two captures because the FOLLOW camera yaw tracks the dog, and the sim advances by variable wall-clock time between `startSolo` and the pause, so the dog and sheep settle at slightly different positions each run. Classic cells (world-axis, fixed) are deterministic and pass; follow cells (dog-driven) are sensitive. Pre-existing harness/sim non-determinism the WebGPU rebaseline exposed. **Far-view impostor coverage CONFIRMED** via a new per-cell coverage log added to the harness: Rolling Hills renders 61 octahedral impostors, Open Country 204 - both classic cells exercise the >200m band, so no new far-view cells are needed. The incomplete rebaseline was reverted (`git checkout tools/validation/golden/`); the committed WebGL goldens remain until P5 can finalize deterministically.

Remaining (P6 paired): pick the follow-cell determinism approach - deterministic fixed-tick sim step before the pause, or freeze the dog facing for the settle, or a classic-only deterministic matrix with follow cells held at a looser informational tolerance - then re-`--baseline` and confirm `--diff` >= 0.95. The MANIFEST rewrite lands with the finalized rebaseline.

**Determinism-fix attempt (reverted - the naive fix is wrong).** Tried freezing the real sim (`gameState/gameTimer.setPaused(true)`) right after `startSolo` so the dog/sheep hold their seeded spawn. It REGRESSED to 4/12 fails - the previously-deterministic classic cells broke (RH sun05 classic 0.994->0.947, OC sun085 classic 0.990->0.928). Cause: freezing at raw spawn catches a non-deterministic pre-settle transient; the sim must actually RUN a bit to settle the sheep into their stable grazing distribution, so freezing too early adds variance instead of removing it. Reverted. The real fix is careful P6 work: deterministic fixed-dt stepping (run a fixed tick count, then freeze) so the settle is identical every run - note there is no `stepSimulation` in `__sdsCinema` today, so this needs a small deterministic-step affordance; or accept a classic-only deterministic gate. The harness keeps the P1 WebGPU + fail-closed changes and the new per-cell impostor-coverage log; only the sim-freeze was reverted.

**Status: FINALIZED 2026-06-15 (classic-only deterministic gate; Matt: "whatever you recommend").** Took the classic-only recommendation over the affordance (the affordance preserves close-up coverage but needs a deterministic fixed-dt sim-step that does not exist, touches the sequenced main loop, regressed on the naive attempt, and is GPU-iterative - disproportionate for coverage tangential to the impostor focus). Dropped the 6 follow cells from the harness MATRIX, leaving 6 deterministic classic cells (field / RH / OC x sun 0.5/0.85, zoom 60). Re-baselined on the genuine WebGPU path: `--diff` passes **6/6** (mean SSIM 0.988, fails: []). Deleted the 6 orphan follow goldens; `tools/validation/golden/` now holds exactly the 6 classic PNGs. Rewrote `MANIFEST.md` (corrects the prior false "Captured under WebGPU" / "paused sim" claims; documents the genuine-WebGPU gate, classic-only rationale, keep-128, impostor coverage RH ~61 / OC ~204, and the follow-cell affordance as BACKLOG). Suite 1576 green, lint + build clean. **UNCOMMITTED** - the commit and the on-device visual sign-off (crossfade seam, the `FOLIAGE_RIG.directWrap` canopy knob, Home Field latlon) are the remaining Phase 6 steps; `directWrap=0` read clean in the P1 WebGPU captures (colored foliage, no obvious too-dark canopy), pending Matt's careful on-device look. BACKLOG carryover: (1) a deterministic fixed-dt sim-step affordance to restore follow-cell goldens; (2) fix the tree1 256px octahedral bake in pixel-forge if 256 is ever wanted.

## Phase 6 - Paired sign-off plus close (~2hr, paired)

**Depends on: Phase 2, 4, 5.** Matt on the keyboard. On-device WebGPU visual confirm of the new look, then `/validate` and `/cycle-close`.

**Acceptance (EARS):**

- When the dusk sun rakes the canopy on Rolling Hills, Open Country, and Newsheepdogland, the LOD0-to-impostor crossfade shall show no brightness or color step (paired visual sign-off).
- When the octahedral fold seam is inspected at a steep-down orbit, it shall read clean (no wrong-view tile).
- When `npm run perf:jitter:nsl -- --check=1` runs warm, it shall stay within the Cycle 96 budget; RH and OC via `perf:jitter --scene=` unaffected.
- When the cycle closes, `npm test` and `npm run build` shall pass and the close commit shall deploy green.

## Dependencies

```
Phase 1 (harness->WebGPU)  ┐
Phase 2 (lighting rig)     ├─ parallel ─> Phase 4 (re-bake + resolution A/B) -> Phase 5 (rebaseline goldens) -> Phase 6 (paired close)
Phase 3 (selector seam)    ┘
```

Phases 1, 2, and 3 are independent and can run in any order or in parallel. Phase 4 needs all three (capture path, shared-rig lighting, correct selector) to bake and measure the fixed look. Phase 5 rebaselines after every visual change has landed. Phase 6 is the paired close.

## Frozen files (cycle-specific additions)

The durable fence is in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md). Authorized changes this cycle:

- `tools/validation/golden/*` and `tools/validation/golden/MANIFEST.md` - rebaseline (Phase 5). Run `--baseline` only at Phase 5 with the recorded acceptance, never as a shortcut to pass `--diff`.
- `tools/validation/screenshot-golden.mjs` - harness-to-WebGPU switch (Phase 1).
- `assets/objects.manifest.json` - only if Phase 4 chooses 256px (tileSize change; grid stays 8x8).
- The octahedral atlases (`assets/models/trees/octahedral/*.png` + `*.ktx2`) - re-bake (Phase 4).
- `js/world/webgpuKilnImpostorNodeMaterial.js`, `js/world/webgpuTreeLeafNodeMaterial.js`, `js/impostors/impostorTileSelection.js`, and the new `js/world/foliageLightingRig.js`.

Stays frozen (no authorization this cycle): `shared/` sim core, `tests/sim-baseline/*`, `tests/refactor-baseline/__fixtures__/*`, `shared/terrain/Heightfield.js`, `shared/scenes/types.js` (the trio's shared rig is global; if Phase 2 finds it needs a per-scene leaf-tuning field, that is the cheap optional-with-default case and must be surfaced before adding).

## Hard stops

Durable hard stops apply - see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. **If Phase 1 cannot engage WebGPU on this box, stop.** The entire visual-validation story depends on it. Do not silently rebaseline WebGL goldens as a fallback; surface and re-plan.
2. **If Phase 2 changes the LOD0 leaf look (not just the impostor), stop.** The LOD0 mesh is the match reference; the impostor matches to it.
3. **If any sim-baseline or refactor-baseline fixture drifts, abort.** This is a render-only cycle; no `shared/` sim path should change.
4. **If the re-bake touches the latlon or cold-coverage atlases, stop.** The trio is octahedral-only; cold-coverage unification was deliberately deferred (see What NOT to do).
5. **Far impostors must never cast shadows** (durable rule, Cycle 91). Any phase that reintroduces a far-impostor shadow caster aborts.

## What NOT to do during this cycle

- **Do not unify cold-coverage onto the octahedral atlas.** The streaming cold path (latlon static cross-billboard) stays as-is; unifying it touches the streaming-determinism fence and was scoped out (the "full repass" option deferred at `/cycle-start`).
- **Do not add parallax or a depth channel.** All three reference projects defer it; Cycle 101 dropped depth for good reason.
- **Do not touch the WebGL fallback impostor look** beyond what the rebaseline records.
- **Do not add NSL to the headless-deterministic golden matrix.** Streaming non-determinism (Cycle 97); NSL is covered by the Phase 6 paired check.
- **Do not bump the version.** Player-visible releases are explicit (still 2.3.4).
- **Do not regress the Cycle 102 wire win** (the 1.10 MiB KTX2 saving) unless Phase 4 measures a silhouette failure at 128px and records the tradeoff.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass (including the new rig-parity and 64/64 round-trip tests).
- [ ] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When the golden harness runs at cycle close, it shall capture the WebGPU path (fail-closed) and `--diff` shall pass all cells at or above 0.95 against the rebaselined WebGPU goldens.
- [ ] When the impostor relight and LOD0 leaf are unit-tested, luminance parity shall hold within the recorded epsilon, and the octahedral selector shall round-trip 64/64.
- [ ] When Matt signs off in Phase 6, the LOD0-to-impostor crossfade shall show no brightness or color step on RH, OC, and NSL (paired visual).

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items (Cycle 102 carryover seeds this cycle)
- [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) - foliage LOD, impostor, and far-tree rules
- `cycle101-validation/phase6-validation-notes.md` - the carried GPU-bound impostor validation runbook
- `tools/cycle91-canopy-ab.mjs`, `tools/cycle90-nsl-visual-differential.mjs` - the proven headed-WebGPU capture pattern for Phase 1
- pixel-forge `packages/core/src/kiln/imposter/projection.ts` - canonical octaEncode/octaDecode for Phase 3
