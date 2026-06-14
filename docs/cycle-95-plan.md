# Cycle 95 - newsheepdogland-fixes

> Drafted 2026-06-14 from a Newsheepdogland playtest. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. The authored Cycle 93 (visual-queue-and-polish) stays queued behind this cycle. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

A Newsheepdogland playtest surfaced six issues, three of them NSL-breaking. Before: on a scene cycle or refresh the island stalls on impostors and never streams to LOD0; turning the camera one way blanks every tree (and maybe grass); the dog's bark sound lags or drops out of step with the bark action; leaves blow out white at grazing sun angles; and a first-time Survival player gets no explanation of the loop. After: NSL streams to LOD0 on every entry, foliage holds in all camera directions, bark animation and sound fire together, leaves read as colored foliage, and Survival has first-run onboarding. This is a fix-and-polish cycle, not new scope.

## How to read this plan

This doc fixes the shape of the changes (where each fix slots in, acceptance), not every implementation choice. Three of the six fixes (A, B, D) shipped on day one with confirmed root causes; the rest carry decisions for Matt (E look, F scope) and one runtime confirmation (B/C camera).

## Decisions (resolved 2026-06-14, Matt approved)

1. **Q1: Cycle number = 95.** `docs/cycle-93-plan.md` is already authored as a separate queue-drain cycle and Cycle 94 closed, so these fixes are Cycle 95. The authored Cycle 93 stays queued behind it.
2. **Q2: Leaf specular = roughness-first.** `specularIntensityNode` is `MeshPhysicalNodeMaterial`-only and the leaf is a `MeshStandardNodeMaterial`, so that lever is a no-op. Decision: raise `roughnessNode` 0.92 -> 1.0 first (no class change, no perf gate) and A/B it. Escalate to `MeshPhysicalNodeMaterial` + a grazing-faded `specularIntensityNode` ONLY if roughness alone does not kill the grazing white, and then run the Cycle 92 bracketed NSL perf gate (it changes every tree on every island).
3. **Q3: Onboarding scope = Survival explainer + Replay tutorial.** The gap is Survival on NSL has zero onboarding (the tutorial only covers Home Field move/sprint/camera/herd) and the tutorial cannot be replayed once skipped. Build a first-run Survival explainer + a "Replay tutorial" Settings entry + a hint-collision check.

## Architecture / shared changes

Bug E may add one optional field (`treeLeaf`) to the fence-frozen `shared/scenes/types.js` SceneDef typedef. Optional-field-with-default is the cheap fence case (per [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md)); it is DATA only, no render logic enters `shared/`. No sim-baseline change; no other `shared/` edits.

## Phase shape rules

≤ 8 phases. Each fully autonomous or fully paired. Phases 1-5 are autonomous code; the leaf look (4) and onboarding copy (5) carry a Matt sign-off that scopes into the paired Phase 6, not mid-phase.

## Acceptance criteria - EARS format

Each phase's Acceptance uses EARS (`When [trigger], the [system] shall [response].`), grep-testable by construction.

## Phase 1 - Scene-swap state reset (Bug A + C) [code shipped; camera pending probe]

The QualityGovernor is a session singleton whose warmup never reset across swaps, so the foliage streamer (which subscribes to `onWarmupComplete` inside the scene build) armed synchronously on re-entry and stalled NSL on impostors.

1. **Done.** `QualityGovernor.resetWarmup()` re-arms the warmup window (preserves `qualityIndex`). [`js/perf/QualityGovernor.js`]
2. **Done.** `rebuildScene` calls `resetWarmup()` at the TOP, before `buildSceneBody` runs (the streamer arms inside `buildSceneBody`, so a late reset would not prevent the race). [`js/main.js`]
3. **Probe-gated.** Camera re-sync after a swap. `swapScene` does not touch the camera and the game-start paths already call `resetCameraToDefault`, so confirm via probe whether the camera is actually stale after a swap-into-gameplay before adding a reset (the fixed default pose is origin-centered and would risk the start-screen preview).

**Acceptance (EARS):**

- [ ] When Newsheepdogland is re-entered after another scene, the system shall complete foliage streaming (`window.__sdsFoliageStreaming.wavesDone === planned`).
- [ ] When a scene is rebuilt, `qualityGovernor.warmupCompleted` shall read false immediately after the rebuild and flip true within the warmup window of the new scene, with `qualityIndex` unchanged.
- [ ] If the swap-into-gameplay probe shows a stale camera, then the camera shall re-seat on the new dog spawn within a few frames.

## Phase 2 - Cold-impostor culling (Bug B) [shipped]

Cold-coverage impostor meshes were the lone whole-mesh `frustumCulled=true` on a far-offset island; their per-batch bounding sphere fails the all-or-nothing frustum test when the camera faces away from the tree mass.

1. **Done.** `frustumCulled = false` on the cold-impostor meshes in `buildColdImpostorMeshes`, matching the per-instance cull the consolidated trees and grass already use. [`js/world/TreePlacement.js`]

**Acceptance (EARS):**

- [ ] While the camera faces any direction at the NSL homestead, the system shall keep tree impostors visible (no whole-mesh blank).
- [ ] When the cold-impostor meshes are built, their `frustumCulled` shall be false.

## Phase 3 - Bark audio/visual sync (Bug D) [shipped]

The visual bark fired synchronously while the SFX could be dropped (busy one-shot, suspended context) or gated by a redundant second cooldown; the passive herding bark played audio with no animation.

1. **Done.** `AudioManager.playSheepdogBark(dogType, { force })`: a forced bark bypasses the AudioManager cooldown and restarts the one-shot so it can't be swallowed. [`js/AudioManager.js`]
2. **Done.** `triggerPlayerBark` calls with `{ force: true }` so the single 2500ms player cooldown owns both visual and audio. [`js/Sheepdog.js`]
3. **Done.** The passive herding bark now triggers the animation too (Matt's choice), cadence held above the 4.58s bark animation so it never restarts mid-animation. [`js/Sheepdog.js`]

**Acceptance (EARS):**

- [ ] When the player barks, the system shall fire the bark animation and the bark sound together.
- [ ] When the dog passively barks while herding, the system shall play the bark animation alongside the audio.
- [ ] When `npm test` runs, `bark-steering.spec.js` shall stay green (the shared 2500ms cooldown is unchanged).

## Phase 4 - Leaf grazing specular + NSL color (Bug E) [roughness shipped; A/B + escalation are Phase 6]

The grazing white is unsuppressed dielectric Fresnel specular on the leaf `MeshStandardNodeMaterial` (no env map in the scene, so it is direct-sun only). Q2 = roughness-first.

Implementation:

1. **Done. Roughness lever (cheap, did first).** `js/world/webgpuTreeLeafNodeMaterial.js`: the leaf roughness default is now `float(treeLeaf.roughness ?? 1.0)` (was 0.92), with a comment explaining the grazing-Fresnel cause and why fully-rough leaves spread the GGX lobe instead of blowing out a rim. No class change, no perf gate. The A/B capture at the NSL dusk grazing angle and the judgment of whether roughness alone kills the white are Phase 6 (needs a real WebGPU session); escalation below stays unbuilt until that judgment.
2. **Escalation (only if roughness alone leaves visible white).** Switch the leaf to `MeshPhysicalNodeMaterial`: the caller in `js/webgpuNodeMaterialFactorySuite.js` passes the material class into `createWebGpuTreeLeafNodeMaterial({ MeshStandardNodeMaterial, ... })`; pass `MeshPhysicalNodeMaterial` for the leaf, then set `material.specularIntensityNode = float(treeLeaf.specularIntensity ?? 0.45).mul(smoothstep(0.0, 0.35, ndv))` where `ndv = abs(dot(normalize(positionView.negate()), normalize(normalView)))` (add `normalView` to the TSL destructure at line 6; the grazing term is copied verbatim from `js/world/webgpuRockRimNodeMaterial.js:10-11`). Watch for leaves reading flat/dead once specular is killed; the A/B decides. This path MUST pass the Cycle 92 bracketed NSL perf gate (`cycle92-validation/bracketed-gate.mjs`) before shipping, because it changes every tree on every island.
3. **Optional NSL color override** (only if Matt wants NSL leaves tuned apart from the global dusk preset): add an optional `treeLeaf` field to `shared/scenes/types.js` (optional + default, the cheap fence case), thread `treeRock: { treeLeaf: sceneDef.treeLeaf ?? {} }` through `js/rendering/productionWebGpuBoot.js` (the merge in `webgpuNodeMaterialFactorySuite.js` already applies a scene override last), then set a small `treeLeaf` block in `shared/scenes/newsheepdogland.js`.
4. **A/B PNGs** to `cycle95-validation/` for Matt; spot-check Rolling Hills + Open Country and the LOD0 -> kiln-impostor crossfade seam (the impostor `uFresnelStrength=0.04` was tuned to the OLD LOD0; if the seam shows, drop it to match).

**Acceptance (EARS):**

- [ ] When the dusk sun rakes the NSL canopy, the system shall render leaves as colored foliage, not white.
- [ ] When Phase 4 ships, A/B PNGs shall exist in `cycle95-validation/` and the golden suite shall stay green.
- [ ] If the leaf material class changes, then the Cycle 92 bracketed NSL perf gate shall pass before it ships.

## Phase 5 - Survival onboarding + tutorial replay (Bug F) [shipped; copy review is Phase 6]

Reuse the dismissible-hint pattern (`js/components/GameHUD/BarkHint.js`) and the tutorial machine (`js/components/Tutorial/`).

Implementation:

1. **Done. Survival onboarding surface.** New `js/components/GameHUD/SurvivalIntro.js`, modeled on `BarkHint.js`: localStorage-gated (`sds-survival-intro-seen`), deferred until the game surface is ready (`isGameSurfaceReady`), dismissed on the "Got it" button or a 22s timeout (no Escape: it also toggles pause). It explains the Survival loop. Copy is **inline** in Matt's voice (no em-dashes, no exclamation), matching the survival HUD siblings (`DayNightChip`, `showSurvivalSummary`) which keep strings inline rather than the locale - this also avoids seeding four machine translations of copy that is not yet copy-reviewed. The gate needed two new reactive snapshot fields in `js/components/hooks/useGameState.js`: `survival` (`!!gameState.survival`) and `sceneId` (`window.__currentSceneId`, the live scene - `GameState.survival` is sticky across swaps so the scene id pins the gate to NSL). Mounted in `js/components/App.js` bottomSafe slot, `active: !isMultiplayer && gameData.survival && gameData.sceneId === 'newsheepdogland'`.
2. **Already present. Replay tutorial in Settings.** `js/components/StartScreen/SettingsPanel.js` General tab already has a "Replay tutorial" control (`settings.replayTutorial`) that calls `startTutorial()` directly (one of the two options the plan offered). It re-runs the guided lesson on demand, satisfying the acceptance. Left as-is; no change needed.
3. **Done. Hint-collision check.** `HudLayout` bottomSafe is a centered flex column with gap, so SurvivalIntro and BarkHint stack without overlap (PracticeHint is practice-only, never co-active with survival). Verified against `HudLayout.tsx` (`flexDirection: column`, `alignItems: center`).

Test + budget notes: added two change-gate cases to `tests/ui/useGameState.store.spec.ts` (survival flag, live scene id). The new component + App wiring bumped two bundle ratchets, recorded deliberately in `tests/refactor-baseline/__fixtures__/bundle-sizes.json`: `App` 26 -> 27 KiB, `other` 552 -> 555 KiB.

**Acceptance (EARS):**

- [ ] When a first-time player starts Survival on NSL, the system shall show a dismissible loop explainer; once dismissed it shall not auto-show again.
- [ ] When the player opens Settings, a Replay tutorial control shall exist that re-offers the tutorial.

## Phase 6 - Ship + prod validation + close

The autonomous code (Phases 1-5) is verified at the unit/build layer (1535 vitest, build, lint all green). The visual surfaces (A: NSL streams to LOD0 on re-entry, B: foliage holds facing any direction, C: camera after a swap, E: leaf no longer white at dusk, D: bark cadence, F: Survival onboarding copy) are validated by Matt **on prod**: this cycle deploys to sheepdogsim.com, Matt plays NSL on the live site, and the visual acceptance is confirmed there rather than in a paired local WebGPU session (headless WebGPU is unreliable and a real-device prod check is the higher-signal test anyway). The leaf A/B and any escalation to `MeshPhysicalNodeMaterial` remain a fast-follow if Matt's prod look shows residual white.

1. Commit + push the cycle work to `main`; the deploy workflow ships it to prod.
2. Matt validates A/B/C/D/E/F on the live NSL build.
3. `/cycle-close` once the prod deploy is green.

**Acceptance (EARS):**

- [ ] When the cycle work lands on `main`, the sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When Matt plays the prod NSL build, A/B/C/D/E/F shall be confirmed or filed as fast-follow.
- [ ] When the cycle closes, `npm test` and `npm run build` shall pass.

## Dependencies

```
Phase 1 (A shipped; camera probe) + Phase 2 (shipped) + Phase 3 (shipped)
Phase 4 (after Q2) + Phase 5 (after Q3) run in parallel
Phase 6 (paired) last.
```

## Frozen files (cycle-specific additions)

- `shared/scenes/types.js` - Bug E was authorized to add ONE optional `treeLeaf` field, but roughness-first did not need a per-scene override, so **no frozen file was touched this cycle**. No `shared/` edits at all; sim-baselines unchanged.

## Hard stops

Durable hard stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific:

1. Bug E: if the fix needs a material-class change, it does not ship until the bracketed NSL perf gate passes. No silent perf regression on the flagship.
2. No `shared/` edit beyond the single optional `treeLeaf` typedef. Sim-baselines stay byte-identical.
3. No leaf-color or onboarding-copy commit without Matt's sign-off (Phase 6).

## What NOT to do during this cycle

- No new gameplay, scene, or mode scope. Fixes and polish only.
- No bark steering changes (Cycle 94 owns that; this is the separate audio/visual-sync issue).
- No `main.js` per-frame loop refactor; the only main.js edit is the two-line reset call in `rebuildScene`.
- No version bump without Matt (player-visible releases are explicit).

## Success criteria (cycle close)

`/cycle-close` reads this section and asks Matt to confirm each. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When Cycle 95 closes, Newsheepdogland shall stream to LOD0 on re-entry and hold foliage in all camera directions per Matt's playtest.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/cycle-93-plan.md`](cycle-93-plan.md) - the queued queue-drain cycle (unchanged)
- [EARS notation](https://kiro.dev/docs/specs/) - testable acceptance lines
