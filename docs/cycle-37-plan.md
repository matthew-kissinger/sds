# Cycle 37 - Atmosphere Perf and Native Packaging Proof 0

> Drafted 2026-05-16 after the first Konveyor WebGPU visual-polish pass,
> atmosphere research spike, native/OSS packaging spike, and Matt's request to
> make the next cycle ready for perf work first and package readiness second.
> Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then
> this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Status - Complete 2026-05-16

Cycle 37 is complete. The cycle itself preserved WebGL as the default and did
not cross merge, deploy, default-renderer, Steam, App Store, Google Play,
paid-store, signing, or submission gates. After cycle close, Matt approved a
separate release-policy update to make WebGPU the progressive web default with
WebGL fallback and an experimental settings toggle.

Closeout artifacts:

- Phase 1 isolated perf: `../cycle36-validation/runtime/cycle37-isolated-webgpu-perf.json`.
- Final WebGPU request proof and screenshots:
  `../cycle36-validation/runtime/cycle37-final-webgpu-request.json` and
  `../cycle36-validation/runtime/cycle37-final-webgpu-request/`.
- Final WebGPU perf proof:
  `../cycle36-validation/runtime/cycle37-final-webgpu-perf.json`.
  Rolling Hills passed with `avgFrameTime=6.993 ms`,
  `p95FrameTime=7.29 ms`, and `sampleCount=1144`; Open Country passed with
  `avgFrameTime=6.944 ms`, `p95FrameTime=6.958 ms`, and
  `sampleCount=1151`.
- Native proof docs:
  [`native-packaging-proof-0.md`](native-packaging-proof-0.md) and
  [`native-store-steam-readiness-checklist.md`](native-store-steam-readiness-checklist.md).
- Native preflight: `../cycle36-validation/native/preflight.json` passed at
  `2026-05-16T06:36:27.879Z`.
- Post-cycle release-policy proof:
  `../cycle36-validation/runtime/progressive-webgpu-default-request-proof.json`
  confirms default WebGPU, stored toggle-off WebGL, forced `?renderer=webgl`,
  unsupported/device-failure fallback, and nonblank Field/Rolling Hills/Open
  Country captures. `../cycle36-validation/runtime/progressive-webgpu-default-perf-proof.json`
  passes Field, Rolling Hills, and Open Country inside the existing WebGPU perf
  budget.

## Goal

Make the explicit WebGPU route feel and measure ready for the next Konveyor
step by isolating the current perf signal, improving the sun/sky atmosphere
contract, and then starting Native Packaging Proof 0. After this cycle, SDS
should have a cleaner WebGPU atmosphere path, fresh isolated performance
evidence, and a concrete local packaging proof track for desktop/Steam/mobile
readiness without crossing store, deploy, or default-renderer gates.

## How to read this plan

This is the active next-cycle plan for `exp/konveyor-webgpu-migration`.

Order matters:

1. Prove perf under an isolated machine load.
2. Do the atmosphere/sun/sky contract and visual/perf pass.
3. Only after that, start native packaging readiness work.

Do not jump straight to Electron, Tauri, Capacitor, Steamworks, App Store, or
Google Play work before the perf and atmosphere phases produce current
evidence.

## Open questions to resolve before writing code

1. **Q1: Is the reported bad WebGPU perf a real SDS regression?** Author lean:
   not proven. The bad live read happened while another agent was running perf
   tests for a different game on the same machine. Treat it as contaminated
   until Phase 1 reruns installed-Chrome production-preview proofs with no other
   GPU/CPU-heavy perf jobs active.
2. **Q2: What owns the readable sun?** Author lean: the sky material owns broad
   solar glow, horizon warmth, and sky color; `SunBillboard` owns the readable
   sun disc and near-disc halo; water, grass, terrain, trees, and sheep consume
   the same atmosphere packet.
3. **Q3: Which native shell comes first after perf is green?** Author lean:
   compare one pinned-Chromium desktop proof and one platform-WebView desktop
   proof, starting with Windows. Electron is the pinned-Chromium baseline;
   Tauri is the platform-WebView baseline. Mobile shells follow after desktop
   package behavior is understood unless Matt explicitly reprioritizes mobile.
4. **Q4: How far can package readiness go this cycle?** Author lean: local
   proof only. No paid store steps, no Steamworks features, no App Store or
   Google Play prep beyond docs/checklists, and no public release action.

## Architecture / shared changes

No deterministic sim changes are authorized. No `shared/**` module changes, no
sim-baseline fixture regeneration, and no Worker migration edits are in scope.

Atmosphere work stays in client rendering/atmosphere/effect/material-factory
surfaces and must preserve WebGL default behavior.

Native packaging work may use the existing `BUILD_TARGET=native`,
`SDS_WORKER_BASE`, `js/runtimeConfig.js`, and `npm run native:check` seam.
Shell dependencies, if any, must stay scoped to an explicit proof folder or
clearly documented package boundary and must record install/build/package-size
impact before acceptance.

## Phase 1 - Isolated WebGPU Perf Recapture

**Independently testable.** This phase decides whether there is a real perf
regression before anyone changes visuals or packaging.

1. Confirm no other SDS dev/preview listeners are running.
2. Wait until no other heavy GPU/CPU perf job is active on the workstation.
3. Build production output and run production preview.
4. Rerun installed-Chrome WebGPU perf proof for Rolling Hills and Open Country.
5. Capture the corresponding screenshots/probe output.
6. Record whether the bad live review was contamination or a reproducible SDS
   budget failure.

**Acceptance (EARS):**

- When Phase 1 ships, then `cycle36-validation/runtime/cycle37-isolated-webgpu-perf.json` shall exist.
- When Phase 1 ships, then the artifact shall include `rolling-hills` and `open-country` entries.
- When Phase 1 ships, then the artifact shall record `avgFrameTime`,
  `p95FrameTime`, `sampleCount`, requested/effective renderer, and fallback
  reason for each scene.
- If either scene exceeds average <= 22 ms or p95 <= 30 ms under isolated load,
  then Phase 1 shall record the failure as a confirmed perf blocker before
  Phase 2 changes visual code.

## Phase 2 - AtmosphereFrame Contract and Diagnostics

**Depends on:** Phase 1.

1. Formalize one atmosphere frame packet for sun, sky, fog, cloud, and
   downstream material inputs.
2. Expose diagnostics for sun physical direction, sun visual direction,
   billboard intensity/size, sky material mode, cloud alpha/horizon values, and
   atmosphere draw count.
3. Route current WebGPU factories through the packet where practical without
   changing default WebGL behavior.
4. Add focused tests for the packet and diagnostics.

**Acceptance (EARS):**

- When Phase 2 ships, then a focused unit test shall prove the atmosphere packet
  includes sun direction, sun color, zenith color, horizon color, fog color,
  fog near/far, cloud coverage, and preset name.
- When Phase 2 ships, then a browser/probe artifact shall record the atmosphere
  packet for Rolling Hills and Open Country under explicit WebGPU.
- While the default URL omits `renderer=webgpu`, the production renderer shall
  remain effective WebGL.
- If the atmosphere packet is unavailable, then WebGPU material factories shall
  fail closed to existing safe defaults rather than changing the WebGL path.

## Phase 3 - Sun and Sky Visual Repair

**Depends on:** Phase 2.

1. Make sun-disc ownership explicit: sky broad glow, `SunBillboard` readable
   disc.
2. Improve WebGPU sky/horizon math using the existing atmosphere packet and the
   research in
   [`archive/research/sun-sky-atmosphere-perf-spike-2026-05-16.md`](archive/research/sun-sky-atmosphere-perf-spike-2026-05-16.md).
3. Repair cloud/fog horizon coherence so the cutoff line stays gone in Rolling
   Hills and Open Country.
4. Keep the visual target relaxing and zen-like while preserving mystery and
   adventure.

**Acceptance (EARS):**

- When Phase 3 ships, then fresh Rolling Hills and Open Country WebGPU
  screenshots shall be captured under `cycle36-validation/runtime/cycle37-atmosphere-*`.
- When Phase 3 ships, then the screenshots/probe output shall show a readable
  sun in both scenes.
- When Phase 3 ships, then the probe output shall record no sky/cloud cutoff
  failure.
- When Phase 3 ships, then default WebGL shall remain unchanged unless an
  explicit acceptance note says a shared visual constant changed for both paths.

## Phase 4 - Atmosphere Perf A/B and Optimization

**Depends on:** Phase 3.

1. Rerun the isolated production-preview WebGPU perf proof after the atmosphere
   repair.
2. If the route is over budget, measure atmosphere toggles before optimizing:
   sun billboard off, planar clouds off, simplified sky glow, then combined.
3. Optimize only the measured expensive slice.
4. Do not introduce volumetric clouds, full-screen bloom/light shafts, or a
   full atmosphere LUT system in this cycle.

**Acceptance (EARS):**

- When Phase 4 ships, then `cycle36-validation/runtime/cycle37-atmosphere-perf.json`
  shall exist.
- When Phase 4 ships, then Rolling Hills and Open Country shall pass average <=
  22 ms and p95 <= 30 ms or the plan shall record a named atmosphere perf
  blocker.
- If an atmosphere toggle is used for diagnosis, then the artifact shall record
  which toggles were enabled and their frame-time summaries.
- When Phase 4 ships, then `npm test` and `npm run build` shall pass before
  native packaging work begins.

## Phase 5 - Native Packaging Proof 0 Decision Matrix

**Depends on:** Phase 4 passing or recording an explicit deferral accepted by
Matt.

1. Refresh the current official-doc facts for Electron, Tauri, Capacitor, Steam,
   App Store, and Google Play as needed.
2. Convert
   [`archive/research/native-release-oss-options-spike-2026-05-16.md`](archive/research/native-release-oss-options-spike-2026-05-16.md)
   into an actionable proof matrix.
3. Decide the first local desktop proof targets for the branch: pinned Chromium
   baseline and platform-WebView baseline.
4. Define package proof acceptance before adding shell code.

**Acceptance (EARS):**

- When Phase 5 ships, then `docs/native-packaging-proof-0.md` shall exist.
- When Phase 5 ships, then the doc shall compare Electron, Tauri, Capacitor,
  PWA/TWA, Steamworks integration timing, and true-native rewrite paths.
- When Phase 5 ships, then the doc shall state the first desktop proof target
  and the first mobile proof target.
- If the phase recommends adding a dependency, then the doc shall state the
  exact package, install/build impact to measure, and the folder boundary where
  it may be introduced.

## Phase 6 - Native Build Artifact Proof

**Depends on:** Phase 5.

1. Run `npm run native:check`.
2. Verify relative assets, service-worker disablement, Worker base config, and
   runtime config remain correct after atmosphere changes.
3. If Phase 5 authorizes a shell proof, create only the minimal local proof
   needed to boot the existing built `dist/` in the selected desktop shell.
4. Do not integrate Steamworks, app-store SDKs, auto-updaters, installers, or
   signing yet.

**Acceptance (EARS):**

- When Phase 6 ships, then `cycle36-validation/native/preflight.json` shall be
  refreshed and pass.
- When Phase 6 ships, then `docs/native-packaging-proof-0.md` shall record the
  native preflight result.
- If a shell proof is implemented, then it shall boot the built SDS app with
  default WebGL and explicit `?renderer=webgpu` documented as separate test
  URLs.
- If a shell proof is implemented, then the proof shall record package size,
  startup behavior, fullscreen/pointer-lock status, audio unlock status,
  storage status, and WebSocket/multiplayer status or named gaps.

## Phase 7 - Store and Steam Readiness Checklist

**Depends on:** Phase 6.

1. Draft the release-readiness checklist for Steam, App Store, Google Play, and
   optional PWA/TWA distribution.
2. Keep it as docs/checklist work only.
3. Separate app-shell proof from store submission, store metadata, payments,
   Steamworks features, signing, and deploy gates.

**Acceptance (EARS):**

- When Phase 7 ships, then `docs/native-store-steam-readiness-checklist.md`
  shall exist.
- When Phase 7 ships, then the checklist shall include Steam, App Store, Google
  Play, privacy policy/data disclosure, icons/screenshots, controller/input,
  crash logs, save/storage, offline/online behavior, and multiplayer endpoints.
- When Phase 7 ships, then the checklist shall explicitly say no store
  submission, paid fee, Steamworks feature integration, signing, or deployment
  is authorized by this cycle.

## Phase 8 - Validation and Handoff Alignment

**Depends on:** Phases 1-7 as shipped or explicitly deferred.

1. Run the required tests for touched code.
2. Update `NEXT_SESSION.md`, `docs/konveyor-autonomous-run.md`,
   `docs/konveyor-sds.md`, and `progress.md`.
3. Record any deferred native packaging work as next-cycle carryover.
4. Keep merge/deploy/default-renderer/store gates untouched.

**Acceptance (EARS):**

- When Phase 8 ships, then `NEXT_SESSION.md` shall name the current cycle state
  and the next pickup step.
- When Phase 8 ships, then `progress.md` shall list the final validation
  commands and key artifacts.
- When Phase 8 ships, then `npm test` and `npm run build` shall pass unless the
  handoff records a named blocker.
- When Phase 8 ships, then no merge, deploy, default-renderer, Steam, App
  Store, Google Play, or paid-store action shall have been taken without
  explicit Matt approval.

## Dependencies

```text
Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5 -> Phase 6 -> Phase 7 -> Phase 8
```

The only allowed parallel work is documentation prep for Phase 5/7 while Phase
1-4 are running. Do not add shell dependencies or package scaffolding before
Phase 4 is green or explicitly deferred by Matt.

## Frozen files

Durable frozen files from [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) apply.
Cycle 37 adds these practical freezes:

- `shared/**` remains out of scope.
- `worker/migrations/**` remains append-only and out of scope unless Matt
  explicitly changes the task.
- Steam/App Store/Google Play account configuration, credentials, signing
  assets, and store metadata are out of scope.

## Hard stops

1. Stop if isolated Phase 1 perf proves WebGPU is over budget and the failure
   cannot be attributed to a single visual slice.
2. Stop if a proposed package/runtime claim contradicts current official docs
   or a local proof.
3. Stop before adding any shell dependency outside the proof boundary described
   in `docs/native-packaging-proof-0.md`.
4. Stop before any paid store action, store submission, public release action,
   merge, deploy, or default renderer policy change.

## What NOT to do during this cycle

- Do not merge or deploy.
- Do not make WebGPU the default.
- Do not chase strict WebGL parity.
- Do not rewrite the atmosphere into a full volumetric/LUT system before the
  current sky/sun/fog contract is repaired and measured.
- Do not add bloom or light shafts to hide a weak sun/sky contract.
- Do not start Steamworks achievements, cloud saves, overlay, app signing,
  installers, mobile store metadata, or paid platform onboarding.
- Do not touch `shared/**` or regenerate sim baselines.

## Success criteria

- [x] When the cycle closes, isolated WebGPU perf for Rolling Hills and Open
  Country shall be green or a named blocker shall be recorded.
- [x] When the cycle closes, the WebGPU sun and sky shall have fresh screenshots,
  atmosphere diagnostics, and no known sky/cloud cutoff regression.
- [x] When the cycle closes, Native Packaging Proof 0 shall have a decision
  matrix, native preflight evidence, and a store/Steam readiness checklist.
- [x] When `npm test` runs at cycle close, all vitest specs shall pass unless a
  named blocker is recorded.
- [x] When `npm run build` runs at cycle close, production build shall pass.
- [x] When the cycle closes, WebGL default, merge/deploy, and store submission
  gates shall remain uncrossed unless Matt explicitly approved them.

## References

- [`konveyor-autonomous-run.md`](konveyor-autonomous-run.md) - active Konveyor handoff
- [`konveyor-sds.md`](konveyor-sds.md) - Konveyor doctrine
- [`konveyor-visual-polish-qa-2026-05-16.md`](konveyor-visual-polish-qa-2026-05-16.md) - visual-polish state
- [`archive/research/sun-sky-atmosphere-perf-spike-2026-05-16.md`](archive/research/sun-sky-atmosphere-perf-spike-2026-05-16.md) - atmosphere research
- [`archive/research/native-release-oss-options-spike-2026-05-16.md`](archive/research/native-release-oss-options-spike-2026-05-16.md) - native/OSS release research
- [`archive/research/perf-extensibility-rust-oss-spike-2026-05-16.md`](archive/research/perf-extensibility-rust-oss-spike-2026-05-16.md) - perf/Rust/WASM research
- [`konveyor-release-decision-checklist.md`](konveyor-release-decision-checklist.md) - later human-approved release path
- [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - hard stops
