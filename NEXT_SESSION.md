# Next Session - Cycle 95 active (newsheepdogland-fixes)

> **Updated:** 2026-06-14
> **For:** Cycle 95 (`docs/cycle-95-plan.md`)
> **Pickup priority:** Phases 1-5 are shipped in code (validation green); only the PAIRED Phase 6 remains. Run the real-Chromium WebGPU probes for A/B/C with Matt, get his sign-off on the leaf look, bark cadence, and Survival onboarding copy, then `/validate` + `/cycle-close`.

## Cold-Start Orientation

Read in order: this file -> [`docs/cycle-95-plan.md`](docs/cycle-95-plan.md) -> `git log --oneline -10` -> [`docs/BACKLOG.md`](docs/BACKLOG.md). Cycle 95 came from a 2026-06-14 Newsheepdogland playtest (six issues). Decisions are recorded in the cycle plan's Decisions section.

## Where It Stands (Cycle 95)

Came from a playtest: NSL stalled on impostors on re-entry, foliage blanked when facing one way, bark sound lagged the action, leaves blew out white, onboarding was weak.

**Shipped this cycle (code only, UNCOMMITTED on `main` - branch before committing):**
- **Bug A** (NSL stuck on impostors after a scene cycle/refresh): `QualityGovernor.resetWarmup()` added (`js/perf/QualityGovernor.js`), called at the TOP of `rebuildScene` before `buildSceneBody` (`js/main.js`). The streamer arms inside `buildSceneBody`, so the reset must precede it. `qualityIndex` preserved.
- **Bug B** (foliage vanishes facing one way): cold-impostor meshes set `frustumCulled = false` (`js/world/TreePlacement.js` `buildColdImpostorMeshes`). They were the lone whole-mesh frustum cull on the far-offset island.
- **Bug D** (bark audio/visual desync): `AudioManager.playSheepdogBark(dogType, { force })` forces the player bark's SFX (`js/AudioManager.js`); `triggerPlayerBark` calls with `force:true`; passive herding bark now plays the animation too, cadence held above the 4.58s bark clip (`js/Sheepdog.js`).
- **Bug E** (leaf white) Phase 4 roughness-first: leaf `roughnessNode` default 0.92 -> 1.0 (`js/world/webgpuTreeLeafNodeMaterial.js`). One line; the A/B and the escalation decision are Phase 6.
- **Bug F** (onboarding) Phase 5: new first-run Survival explainer `js/components/GameHUD/SurvivalIntro.js` (inline copy, localStorage `sds-survival-intro-seen`), gated via two new `useGameState` snapshot fields (`survival`, live `sceneId`), mounted in `js/components/App.js` bottomSafe. The "Replay tutorial" Settings control already existed (`SettingsPanel.js`, calls `startTutorial()`) - left as-is.
- Added `tests/quality-governor.spec.js` and two `useGameState.store.spec.ts` cases. Bundle ratchets bumped deliberately (`App` 26->27, `other` 552->555 KiB). **Validation green: 1535 vitest pass, build clean, lint clean.**

**Remaining - the PAIRED Phase 6 (needs Matt + a real WebGPU session):**
- **A/B/C runtime probes.** Headless WebGPU is unreliable and NSL is the WebGPU flagship, so confirm in a real Chromium: refresh NSL and cycle scenes (A: streams to LOD0, `window.__sdsFoliageStreaming.wavesDone === planned`), face all four directions at the homestead (B: foliage holds), and check whether the camera is stale after a swap-into-gameplay (C: `swapScene` does not touch the camera and game-start already calls `resetCameraToDefault`, so only add a reset if the probe shows staleness - a reset in `rebuildScene` could disturb the start-screen preview).
- **Bug E leaf look.** A/B the roughness-1.0 leaf at the NSL dusk grazing angle; capture before/after to `cycle95-validation/`. If white persists, escalate to `MeshPhysicalNodeMaterial` + grazing-faded `specularIntensityNode` (spec in cycle plan Phase 4) and pass the Cycle 92 bracketed NSL perf gate (it changes every tree on every island). Matt owns the final color call.
- **Bug D bark cadence** and **Bug F onboarding copy** sign-off (the 4.58s passive-bark cadence reads okay; the Survival explainer copy is inline in `SurvivalIntro.js` for Matt's review).
- Then `/validate` + `/cycle-close`.

## Process notes

- The authored **Cycle 93** (visual-queue-and-polish: golden re-capture, three r185, NSL jitter rail, rock re-bake, KTX2, launch) is UNCHANGED and stays QUEUED behind Cycle 95. `docs/cycle-93-plan.md` is intact.
- `/cycle-start` has not been run for 95; the plan doc is authored and work began. Run it to formalize if desired.
- Bug D is the audio/visual-sync issue, distinct from the Cycle 94 bark-steering hotfix; do not reopen steering.

## Standing carryover (do not drop during cleanup)

- **Owner intake (2026-06-12):** `docs/BACKLOG.md` Distant ideas holds Matt's owner-interest note for NPC sheepdogs as a near-term cycle candidate. Do not remove it; it needs an approach proposal for Matt before any dispatch.
- **Matt review queue:** impostor trunk-split A/B (`cycle92-validation/impostor-ab.png`); new NSL look on the live site (Cycle 91/92 surveys); launch posting from `docs/launch/` (Matt's voice); S24+ device pass (standing).
- **NSL-as-default-world** product decision is still open (pill is off; default is still Rolling Hills).
