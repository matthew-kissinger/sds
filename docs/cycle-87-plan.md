# Cycle 87 - island-restore-renderer-trust-overlay-system

> Drafted 2026-06-10 from Matt's post-launch findings (plan approved in-session). Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Cycles 85 and 86 remain OPEN on Matt's two items (real-device pass, launch posting); this cycle's Phase 1 device validation doubles as Cycle 85 Phase 3 evidence. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Undo the visual gutting of Newsheepdogland without giving back the fast first Play click, make the renderer choice trustworthy on mobile (WebGPU stays; WebGL is for hard failures only), give every overlay a collision-free home so the tutorial, toasts, and touch controls stop stacking on top of each other on phones, and retire the "konveyor" codename from live code. Before: a bare island past the homestead, phones randomly branded WebGL for 24 hours, three overlapping notices on the entrance. After: the island fills back in within seconds of Play, mobile boots WebGPU every time the hardware can, overlays stack in one rail, and the render path reads as what it is.

## Root causes (investigated 2026-06-10, evidence in session)

1. **Bare island**: first-session hardening commits `64a3df6`, `e18aca9`, `53f56ba` (2026-06-09) shrank NSL tree zones to a ~530x260m homestead box and grass to a 560m radius to kill a multi-minute cold-build stall. The compensating density/LOD pass never shipped. Not a culling bug; the compute cull uses the live camera every frame.
2. **Mobile WebGL boots**: `QualityGovernor._recordFallback` (mobile-only) writes a 24h sticky `sds-renderer-fallback` record after sustained frame-budget misses at the quality floor; the boot shim then forces WebGL on ALL scenes for 24h. Matt's S24+ carried such a record (written ~2026-06-05). The settings WebGPU toggle cannot clear it. Decision: never demote the renderer on frame budget.
3. **Overlay overlaps**: no toast manager, no z-index registry; each overlay picks its own corner with inline styles. Three notices observed simultaneously on the live entrance; SW-update toast sits over gameplay bottom-center.
4. **Codename debt**: "konveyor" is load-bearing in ~36 live files, exported symbols, window globals, URL params, and 16 test files.

## Open questions to resolve before writing code

1. **Q1: Streamed grass density on desktop?** Author lean: `clumpsPerChunk.desktop ~140` for the streamed annulus, tuned against a new `< 250k` streamed estimator test.
2. **Q2: Do far-zone impostor-only trees read acceptably at the horizon on WebGPU?** Author lean: yes (kiln impostors already carry the 180m+ band today); validate visually in the Phase 4 probe before tuning further.
3. **Q3: Does the rename shift any bundle-chunk family?** Author lean: no (konveyor chunks live in the `other` family before and after; `manualChunks` keys on npm package names). If byte-noise trips a budget, re-baseline deliberately and record.

## Architecture / shared changes

- `shared/scenes/types.js` gains two optional render-only fields (fence "cheap case", consumers documented in JSDoc + a note in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md)): `terrain.streamedZones` (zone rects built after first-interactive) and `grass.streamed` (`{ grassRadius, clumpsPerChunk }`). The Worker ignores `terrain`/`grass` entirely; no sim impact, no sim-baseline changes anywhere in this cycle.
- New `js/ui/` family (framework-agnostic, importable from vanilla boot files and React): `zIndex.js` (band registry), `overlayRail.js` (shared top-center stacking rail), `toastHub.js` (queue + gameplay suppression).
- New `js/world/foliageStreaming.js`: post-Play wave scheduler (idle-callback chains, abortable via `game._sceneAbort.signal`).

## Phase 1 - Renderer policy: never demote on frame budget (~3hr, autonomous, ships first)

> **Status: SHIPPED 2026-06-10** (commit `7df916a`). All acceptance lines verified in-session (no-write + floor-telemetry specs green; boot shim deletes legacy records; diagnostics row live in Settings under the WebGPU toggle, all 5 locales). Remaining evidence: tomorrow's S24+ pass (doubles as Cycle 85 Phase 3).

**Independently testable.** Ships today so tomorrow's connected-device session validates it.

1. **QualityGovernor** ([`js/perf/QualityGovernor.js`](../js/perf/QualityGovernor.js)): delete `_recordFallback`, its callsite, and the `autoFallback` reload mechanism. Quality stepping is unchanged and remains the only response to budget misses. Emit `webgpu_frame_budget_floor` telemetry (lazy import) once per session the first time a mobile session logs 3 consecutive over-budget windows at the floor: `{ deviceTier, frameP95, frameP99, sceneId, qualityIndex }`.
2. **Boot shim** ([`../index.html`](../index.html) ~line 359): remove `readRecentWebGpuFallback()` and its gating; delete any stale `sds-renderer-fallback` key on boot (un-brands devices in the wild).
3. **Settings** ([`js/components/shared/settings.js`](../js/components/shared/settings.js)): `applyRendererPreference` also removes the record. [`js/components/StartScreen/SettingsPanel.js`](../js/components/StartScreen/SettingsPanel.js): read-only renderer diagnostics row under the WebGPU toggle (effective renderer, fallbackReason, device tier, qualityIndex, preflight ok); label-only i18n keys in all 5 locales.
4. **Notice doc** ([`js/rendering/rendererFallbackNotice.js`](../js/rendering/rendererFallbackNotice.js)): drop `webgpu-frame-budget` from documented reasons; behavior unchanged.
5. **Tests**: QualityGovernor specs assert no localStorage write on sustained floor misses + the floor telemetry event; remove sticky assertions.

**Acceptance (EARS):**

- While a mobile session sustains over-budget windows at the lowest quality rung, the system shall remain on the WebGPU renderer and shall not write `sds-renderer-fallback`.
- When the boot shim finds a legacy `sds-renderer-fallback` record, the system shall delete it and boot per the normal capability check.
- When a mobile session first logs 3 consecutive over-budget windows at the floor, the system shall emit `webgpu_frame_budget_floor` exactly once per session.
- When the settings panel opens, the system shall display effective renderer, fallback reason, device tier, and quality index.

## Phase 2 - Tree streaming foundation (~4hr, autonomous)

> **Status: SHIPPED 2026-06-10** (commit `7ed8be0`). Cold bound unchanged; streamed determinism, cold-rect exclusion, and abort-mid-wave specs green. Live probe later confirmed +1,728 streamed trees on NSL.

**Depends on:** nothing (parallel-safe with Phase 1).

1. **SceneDef fields** ([`shared/scenes/types.js`](../shared/scenes/types.js)): `terrain.streamedZones`, `grass.streamed` (optional, defaults absent). INTERFACE_FENCE note.
2. **Shared scatter opts** ([`shared/TreePlacement.js`](../shared/TreePlacement.js)): optional `zones` override, `excludeRects`, `existingTrees` (canopy checks against cold trees). Defaults byte-identical; existing determinism tests guard.
3. **Additive consolidated builder** ([`js/world/TreePlacement.js`](../js/world/TreePlacement.js)): extract the instances-to-consolidated-meshes body so it runs additively for a supplied tree array with `representation: 'lod0' | 'impostor'` (impostor = kiln geometry/material, `castShadow=false`); per-chunk InstancedMesh equivalent on the WebGL path.
4. **Streamer** (new [`js/world/foliageStreaming.js`](../js/world/foliageStreaming.js)): wave planner over `streamedZones` (per-wave salted `mulberry32(seed ^ FNV(waveName))`, cold `terrain.zones` rects excluded), idle-callback scheduler with ~8ms slices, diag on `window.__sdsFoliageStreaming`, abort via `game._sceneAbort.signal`. Solo-sim obstacle refresh at wave completion (re-run `buildSceneObstacles`, atomic swap; skipped in MP).
5. **Arm post-build** ([`js/boot/initWorld.js`](../js/boot/initWorld.js), wolf lazy-load pattern) and add `streamedZones` (the pre-trim rects from `64a3df6^`) to [`shared/scenes/newsheepdogland.js`](../shared/scenes/newsheepdogland.js).
6. **Tests**: cold NSL bound 60-110 unchanged; streamed scatter determinism; no streamed tree inside cold rects; abort-mid-wave.

**Acceptance (EARS):**

- When the NSL cold path builds, the system shall place fewer than 110 trees before first-interactive (existing bound unchanged).
- When all desktop tree waves complete, the system shall render tree instances inside every `streamedZones` rect.
- If the scene is disposed mid-stream, then the system shall cancel pending waves and dispose streamed controllers.
- Where the seeded scatter runs twice for the same (scene, seed), the system shall produce identical streamed positions.

## Phase 3 - Grass streaming (~3hr, autonomous)

> **Status: SHIPPED 2026-06-10** (commit `06ae9ac`). Q1 resolved at `clumpsPerChunk.desktop = 140`; streamed estimator bound < 250k green; visualGolden opt-out verified (goldens byte-identical). Live probe: +138,575 streamed clumps.

**Depends on:** Phase 2 (streamer + scene-def fields).

1. [`js/GrassSystem.js`](../js/GrassSystem.js): `_computeCullController` becomes `_computeCullControllers` array (dispose path updated); `buildStreamedGrass()` gathers the wider extent skipping cold-grid chunks; streaming disabled under `?visualGolden=1`.
2. [`js/TerrainBuilder.js`](../js/TerrainBuilder.js): `_driveComputeCull` iterates the grass controller array.
3. [`shared/scenes/newsheepdogland.js`](../shared/scenes/newsheepdogland.js): `grass.streamed` (~radius 1560, clumps {desktop: 140, mobile: 0}, tuned per Q1); wired as the final wave.
4. **Tests**: cold `estimateDesktopGrassMax < 90_000` unchanged; new streamed estimator bound `< 250_000`.

**Acceptance (EARS):**

- When the NSL cold path builds, the desktop grass estimate shall stay below 90,000 clumps.
- When the grass wave completes on desktop, streamed grass coverage shall extend beyond the cold 560m radius.
- While `?visualGolden=1` is set, the system shall not stream grass (goldens byte-identical).

## Phase 4 - Streaming polish, tier gating, probe (~3hr, autonomous)

> **Status: SHIPPED 2026-06-10** (commit `c983761`; e2e CI-safety follow-up `d9d785c`). Quad-split sub-waves (NSL = 40 planned), tier gating live, compileAsync prewarm in idle slots. Probe on desktop: all waves complete, qualityIndex 0. The quality assertion is `@local-only` (CI renders on SwiftShader); CI runs the renderer-agnostic streaming proof. Q2 resolved: horizon impostors read fine. Stretch (coastline meadow quads) NOT taken - BACKLOG.

**Depends on:** Phases 2-3.

1. [`js/HardwareTier.js`](../js/HardwareTier.js): `TIER_PRESETS[].foliageStreamWaves` (low: 1 tree wave, no grass; mid/high: all).
2. Split the horizon scatter into sub-waves if a slice exceeds ~30ms (data change); `renderer.compileAsync` prewarm for new meshes inside idle slices.
3. Playwright probe (preview server, `SDS_SUPPRESS_BROWSER_OPEN=1`, everything closed after): Play on NSL, wait ~20s, assert `__sdsFoliageStreaming.wavesDone === planned`, streamed instances beyond the homestead box, `missWindows === 0` and `qualityIndex === 0` on desktop. Screenshot for before/after comparison.
4. Stretch (flagged): coastline-aware meadow quads (re-enable past the coastline guard) gated on the coast SDF so quads never tile water.

**Acceptance (EARS):**

- While waves stream on desktop, `QualityGovernor.missWindows` shall stay 0.
- Where hardware tier is low, the system shall stream at most 1 tree wave and no grass.
- When the probe runs against the preview build, all planned waves shall complete within 30 seconds of Play.

## Phase 5 - Overlay z registry + toast hub (~4hr, autonomous)

> **Status: SHIPPED 2026-06-10** (commit `26224e7`). zIndex band registry + source-scan spec, overlayRail + toastHub (12 specs), all 3 toasts migrated, 19-file z-literal sweep.

**Depends on:** nothing (parallel-safe with Phases 2-4).

1. **New [`js/ui/zIndex.js`](../js/ui/zIndex.js)**: bands scene 5 < hudMeta 12 < hud 20 < hudBottom 30 < chips 40 < controls 50 < toast 60 < tutorial 70 < panel 80 < modal 100 < critical 200 < debug 1000. Fixes PauseMenu (1000) rendering under Minimap/DayNightChip (1200) today.
2. **New [`js/ui/overlayRail.js`](../js/ui/overlayRail.js)** (idempotent `ensureTopRail()`, top-center flex column, safe-area aware) + **[`js/ui/toastHub.js`](../js/ui/toastHub.js)** (`enqueueToast({id, mount, durationMs, suppressDuringGameplay, priority})`; max 2 visible, 1 on compact mobile; FIFO; gameplay suppression via the existing 250ms `gameActive` probe; injectable deps).
3. **Migrate** [`js/boot/swUpdateToast.js`](../js/boot/swUpdateToast.js) (persistent, suppressed during gameplay - fixes toast-over-gameplay), [`js/rendering/rendererFallbackNotice.js`](../js/rendering/rendererFallbackNotice.js), [`js/achievements/unlockToast.js`](../js/achievements/unlockToast.js) (its container pattern is what the rail generalizes).
4. **Z-literal sweep** across ~18 overlay files (HudLayout, MobileControls incl. the `z-10` class + zoom 200, Minimap, DayNightChip, ExtremeTuningPanel, PauseMenu, CompletionScreen, PlaytestNote, TutorialOverlay/Offer, MobilePerfWarning, Entrance, SceneSwapOverlay, LanguageSelector, App.js, completionOverlay.js, skipToDusk, webglContextRecovery).
5. **Tests**: `tests/ui/zIndex.spec.ts` (ordering invariant + source scan banning numeric z literals in overlay dirs), `tests/ui/toastHub.spec.ts`, update the 3 toast specs to assert rail mounting.

**Acceptance (EARS):**

- When two or more notices are active at once, the system shall stack them in the shared top rail with no bounding-box intersection.
- While `gameState.gameActive` is true, the system shall defer `suppressDuringGameplay` toasts and present them when gameplay ends.
- When the pause menu is visible, the system shall render it above the minimap and day/night chip.
- When the source-scan test runs, overlay files in the swept directories shall contain no numeric z-index literals.

## Phase 6 - HUD reserves, tutorial placement, safe-area, e2e (~4hr, autonomous)

> **Status: SHIPPED 2026-06-10** (commit `82615a8`). CSS-var reserves published from HudLayout; tutorial pill derives from `--sds-bottom-reserve`; offer rides the rail via RailPortal; safe-area sweep done; 44px touch targets taken (not deferred). `overlay-collision.spec.ts` green at 390x844. Remaining evidence: manual device check tomorrow.

**Depends on:** Phase 5.

1. [`js/components/GameHUD/HudLayout.tsx`](../js/components/GameHUD/HudLayout.tsx) publishes `--sds-bottom-reserve`, `--sds-toast-top-offset`, `--sds-topleft-reserve` on `documentElement` (cross-React-root handoff; TutorialOverlay/DayNightChip/Minimap live outside its root by design).
2. [`js/components/Tutorial/TutorialOverlay.tsx`](../js/components/Tutorial/TutorialOverlay.tsx) derives its bottom offset from `var(--sds-bottom-reserve)` (kills the hardcoded 84px). [`TutorialOffer.tsx`](../js/components/Tutorial/TutorialOffer.tsx) renders through a `RailPortal` with `order: 10` so a simultaneous toast stacks above it.
3. Safe-area fixes: [`DayNightChip.js`](../js/components/GameHUD/DayNightChip.js) (`top: calc(safe-top + var(--sds-topleft-reserve))` replacing `top:148px`), ExtremeTuningPanel, CompletionScreen, PlaytestNote.
4. Mobile quick wins if time allows (44px touch targets on tutorial Skip / offer buttons / toast Refresh; 13px minimum font on coarse pointers); otherwise BACKLOG.
5. **E2E**: `tests/e2e/overlay-collision.spec.ts` (390x844): force offer + fallback notice + a persistent sample toast simultaneously (`?renderer=webgl&fallbackReason=webgpu-unavailable&uiprobe=1` boot hook), assert pairwise no bounding-box intersections and in-viewport. Bundle ratchet: verify `ui` budget; bump only deliberately.

**Acceptance (EARS):**

- When HudLayout mounts, the system shall publish `--sds-bottom-reserve`, and the tutorial pill shall derive its bottom offset from that variable.
- When the tutorial offer and a toast are visible simultaneously, the system shall render them as separate rail rows with the toast above the card.
- Where the viewport has non-zero safe-area insets, DayNightChip, ExtremeTuningPanel, CompletionScreen, and PlaytestNote shall inset their fixed edges accordingly.
- When `overlay-collision.spec.ts` runs at 390x844, no two overlay bounding boxes shall intersect.

## Phase 7 - Retire "konveyor" (~4hr, autonomous, LAST, own commits)

> **Status: SHIPPED 2026-06-10** (commit `ac32488`; follow-up `1a8b1d5` untracked `tools/trailer/` which the rename commit swept in by mistake - the files remain in that one commit's history, flagged to Matt). Zero-grep verified; goldens + sim-baselines pass without regeneration; post-rename boot probe all 11 gates true. Naming rule codified in scene-and-render.md + AGENTS.md; DECISIONS.md entry added. Q3 resolved: chunk family unchanged (`other` bumped 544 -> 545 KiB, recorded).

**Depends on:** Phases 1-6 shipped (rename after functional work so diffs stay reviewable). Mechanical, zero behavior change. Scope: live code + tests; `docs/archive/`, `cycleN-validation/`, CHANGELOG/DECISIONS history untouched; only the ~6 `tools/` probes that import live modules get updated.

1. Rename map (drop-prefix, no directory moves): `konveyorRuntimeMode.js` -> `rendererMode.js`, `konveyorProductionWebGpuBoot.js` -> `webgpuBoot.js`, `konveyorWebGpuModules.js` -> `webgpuModules.js`, `konveyorNodeMaterialFactorySuite.js` -> `nodeMaterialFactorySuite.js`, per-domain factories/adapters drop the prefix. Exported symbols follow (`isKonveyorProductionWebGpuActive` -> `isProductionWebGpuActive`, ...). Longest-symbol-first replace.
2. Instance summaries `konveyor*Summary` -> `webgpu*Summary`; window globals `__sdsKonveyor*` -> `__sdsWebGpu*`; canvas `dataset.konveyorProductionWebGpu` -> `dataset.webgpuProduction` (writer-only, verified).
3. Constants renamed, **values untouched** (`KONVEYOR_ROCK_PLACEMENT_SEED_OFFSET` = `0x526f636b` feeds scatter goldens; regeneration forbidden - goldens are the zero-behavior-change proof).
4. URL params: delete `?konveyorProduction=1` (write-only, no readers); `?konveyorNativeTreeImpostors` -> `?nativeTreeImpostors` with the old name as a read alias for one release.
5. Rename the 16 `tests/konveyor-*.spec.js` to domain names; `package.json` script `konveyor:renderer-telemetry` -> `webgpu:renderer-telemetry` (+ tool rename).
6. Codify the naming rule (files name WHAT, not WHEN; no plan codenames in live code, symbols, globals, params) in [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) + [`AGENTS.md`](../AGENTS.md); DECISIONS.md entry for the retirement.

**Acceptance (EARS):**

- When the rename lands, `rg -i konveyor` over `js/`, `tests/`, `index.html`, `package.json` shall return zero matches.
- When `npm test` runs post-rename, the refactor-baseline scatter/terrain goldens and sim-baselines shall pass without regeneration.
- When `?konveyorNativeTreeImpostors` is supplied, the system shall honor it identically to `?nativeTreeImpostors`.
- When the production WebGPU boot probe runs post-rename, all boot gates shall report true.

## Dependencies

```
Phase 1 (today) ; Phase 2 -> Phase 3 -> Phase 4 ; Phase 5 -> Phase 6 ; Phase 7 last
(Phase 1, Phase 2, Phase 5 are mutually parallel-safe)
```

## Frozen files (cycle-specific additions)

- [`shared/scenes/types.js`](../shared/scenes/types.js): authorized for the Phase 2 optional-field addition only (`terrain.streamedZones`, `grass.streamed`), the fence "cheap case". Consumers: foliageStreaming, GrassSystem, TreePlacement, tests. No renames/removals.
- No deterministic-sim files are touched anywhere in this cycle; sim-baselines stay byte-identical.

## Hard stops

1. If any sim-baseline fixture differs at any point, abort the phase (nothing here may touch the sim).
2. If the foliage streamer measurably regresses the entrance Play click (cold-path stage timings grow), stop and re-scope before shipping.
3. If the konveyor rename requires regenerating any golden fixture, stop - that means behavior changed.

## What NOT to do during this cycle

- Don't re-widen the COLD-path zones/grass as a shortcut; the trims protect the first-session stall fix.
- Don't rewrite `docs/archive/`, `cycleN-validation/`, CHANGELOG/DECISIONS history, or historical cycle-pinned tools/ probes for the rename.
- Don't add wind to the mobile grass shader, decompose GrassSystem/OptimizedSheep, or introduce per-material fog (durable rules).
- Don't close Cycles 85/86 from this cycle; their ritual runs separately once Matt's items land.
- Don't auto-bump the player-visible version.

## Success criteria (cycle close)

- [x] When the cycle closes, all phases shall be shipped or explicitly deferred to `BACKLOG.md` carryover. *(All 7 shipped 2026-06-10; deferred: P4 coastline meadow quads stretch.)*
- [x] When `npm test` runs at cycle close, all vitest specs shall pass. *(1496 passed / 11 skipped, 2026-06-10.)*
- [x] When `npm run build` runs at cycle close, the production build shall be clean. *(Clean; bundle bumps recorded in `bundle-sizes.json`.)*
- [x] When the close commit lands on `main`, the sheepdogsim.com deploy shall succeed via GH Actions. *(Run 27268212058 success on `5a184da` after the e2e CI-safety split.)*
- [x] When Newsheepdogland is played on desktop, trees and grass shall visibly extend beyond the homestead corridor within 30 seconds of Play. *(Live probe: +1,728 trees, +138,575 clumps; @local-only e2e green.)*
- [ ] When a WebGPU-capable phone loads the site, it shall boot `webgpu-production` with no frame-budget renderer demotion possible. *(Code shipped; awaiting the S24+ device pass for the on-device half.)*
- [x] When the entrance shows multiple notices at 390x844, none shall overlap. *(`overlay-collision.spec.ts` green; manual device check tomorrow is confirmatory.)*
- [x] When `rg -i konveyor js/ tests/` runs, it shall return zero matches. *(Verified post-`ac32488`.)*

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md), [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md), [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md), [`docs/BACKLOG.md`](BACKLOG.md)
- Approved session plan: `~/.claude/plans/can-you-come-up-cryptic-feigenbaum.md`
- Root-cause evidence: live-site probe, D1 `renderer_fallback` query, S24+ ADB/devtools probe (sticky record `webgpu-frame-budget` at ~2026-06-05), `git show 64a3df6^` pre-trim zones.
