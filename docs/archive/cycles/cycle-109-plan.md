# Cycle 109 - native-steam-store-readiness

> Drafted 2026-06-26 as the fourth launch-readiness cycle. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md), confirm Cycle 108's release candidate is green or intentionally scoped, then read this doc top-to-bottom.

## Goal

Cycle 109 makes the desktop/native lane honest and actionable. Before this cycle, the native package docs and Electron metadata still reflect old `2.2.0` proof artifacts and a not-public-ready Steam checklist. After this cycle, the repo should contain current native package proof, updated Steam-readiness docs, store-asset requirements, signing/install/uninstall posture, and a clear recommendation on whether to open Steam as Coming Soon, wait, or skip for this launch.

## Autonomy contract

Continue autonomously into Cycle 110 if all gates pass. This cycle may build and inspect local desktop artifacts and update docs/metadata. It must not pay Steam Direct fees, submit a Steam app for review, publish a Steam page, buy certificates, or upload a public depot without explicit user approval.

## Scope decisions

1. **D1: Native proof is current-build proof.** Do not rely on Cycle 54 artifacts for launch decisions.
2. **D2: Steam readiness is a product gate, not a build-only gate.** Store copy, capsules, screenshots, support/privacy URLs, signing, install/uninstall, controller notes, and depot posture all matter.
3. **D3: Desktop packaging can change metadata, not gameplay.** If native proof finds gameplay/runtime issues, record them and return to Cycle 108 or a new fix cycle.
4. **D4: Account actions are deferred.** Public Steam partner actions require Matt review after Cycle 110 unless explicitly authorized earlier.
5. **D5: Web remains canonical.** Native/Steam should complement `sheepdogsim.com`, not fork product truth.

## Phase 1 - Current platform requirements refresh (~3hr, autonomous)

**Independently testable.**

1. Check current official Steamworks docs for Direct fee, store review, graphical assets, builds/depots, release timing, and any web/Electron-relevant guidance.
2. Check current Electron/electron-builder docs only if package config changes require current syntax.
3. Write `cycle109-validation/platform-requirements.md` with source links, required assets, required account actions, and no-go items.
4. Compare requirements against `docs/native-store-steam-readiness-checklist.md`.

**Acceptance (EARS):**

- When Phase 1 ships, then `cycle109-validation/platform-requirements.md` shall cite current official Steamworks sources for fee, review, graphical assets, and build/depot requirements.
- When Phase 1 ships, then the report shall list every item SDS still lacks for public Steam submission.
- If a requirement needs paid account action or private Steamworks access, then the report shall mark it `human-required`.

## Phase 2 - Native package metadata and build path refresh (~3hr, autonomous)

**Depends on:** Phase 1.

1. Inspect `native/desktop-electron/package.json`, `native/desktop-electron/README.md`, `tools/native-preflight.mjs`, and existing native docs for stale version/output paths.
2. Align native package metadata with the release-candidate version if Phase 108 chose one.
3. Move or document artifact output paths so new proof does not look like old Cycle 54 proof.
4. Keep native changes limited to packaging metadata and docs unless a build blocker requires a small code fix.

**Acceptance (EARS):**

- When Phase 2 ships, then native metadata shall no longer present `2.2.0` as the current launch package unless it is explicitly historical.
- When Phase 2 ships, then native artifact output paths shall be current or the report shall state why the existing path remains intentionally reused.
- If native code changes beyond metadata/docs are needed, then Phase 2 shall stop and record the blocker before proceeding.

## Phase 3 - Desktop artifact build and runtime proof (~4hr, autonomous)

**Depends on:** Phase 2.

1. Run the native preflight and desktop packaging commands appropriate for Windows launch proof, starting with:
   - `npm run native:check`
   - `npm run desktop:dist`
2. Run existing packaged WebGL/WebGPU proof scripts from `native/desktop-electron/package.json` if available.
3. Inspect artifact names, sizes, signing status, installer/portable outputs, and packaged runtime behavior.
4. Save evidence in `cycle109-validation/native-artifacts.md`.

**Acceptance (EARS):**

- When Phase 3 ships, then `cycle109-validation/native-artifacts.md` shall list each produced artifact path, size, target, signing status, and proof command result.
- When Phase 3 ships, then `npm run native:check` shall pass.
- When Phase 3 ships, then packaged WebGL and WebGPU proof shall pass or the report shall mark Steam readiness blocked.

## Phase 4 - Store assets and Steam checklist update (~4hr, autonomous)

**Depends on:** Phase 3.

1. Update `docs/native-store-steam-readiness-checklist.md` with current proof status and remaining go/no-go items.
2. Update `docs/native-desktop-package-cycle-54.md` or create a new current native package proof doc if changing the old historical doc would blur history.
3. Create `docs/launch/steam-store-brief.md` with title, short description, long description, categories/tags, screenshot list, capsule asset list, trailer status, controller notes, cloud-save policy, privacy/support URLs, and review risks.
4. Create or update a screenshot/capsule capture checklist, but do not fabricate final store capsule art if the current visuals are not approved.

**Acceptance (EARS):**

- When Phase 4 ships, then `docs/native-store-steam-readiness-checklist.md` shall state current green, blocked, and human-required Steam items.
- When Phase 4 ships, then `docs/launch/steam-store-brief.md` shall contain copy and asset requirements sufficient for Matt's review.
- If a final capsule, trailer, privacy URL, or signing decision is missing, then the Steam brief shall mark public Steam submission `blocked`.

## Phase 5 - Steam recommendation and handoff (~2hr, autonomous)

**Depends on:** Phase 4.

1. Write `cycle109-validation/steam-recommendation.md` with one of:
   - `open-coming-soon-after-review`
   - `wait-for-signing-and-assets`
   - `skip-steam-for-this-launch`
2. Explain the recommendation in terms of proof, cost, review timing, store assets, and support burden.
3. Update `NEXT_SESSION.md` to point at Cycle 110 if the cycle closes.

**Acceptance (EARS):**

- When Phase 5 ships, then `cycle109-validation/steam-recommendation.md` shall name exactly one recommendation and the evidence behind it.
- When Phase 5 ships, then `NEXT_SESSION.md` shall identify Cycle 110 as the next cycle unless a hard stop is active.

## Dependencies

```
Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5
```

## Frozen files (cycle-specific additions)

No `shared/`, sim-baseline, migration, or refactor-baseline edits are authorized. Native package metadata and native docs are authorized within the phase scopes above.

## Hard stops

Durable hard stops apply on every cycle; see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific stops:

1. If a command would pay a Steam Direct fee, create a Steam app, publish a store page, upload a public depot, or submit for review, then stop unless Matt has explicitly authorized that action.
2. If packaged WebGL or WebGPU proof fails, then do not recommend Steam publication.
3. If a signing certificate, installer reputation decision, privacy policy, or support URL is missing, then mark the missing item human-required rather than guessing.
4. If native packaging requires code changes beyond metadata/config, then stop and decide whether to reopen Cycle 108 or create a fix cycle.

## What NOT to do during this cycle

- Do not publish or submit anything to Steam.
- Do not change core game behavior to make native packaging easier.
- Do not replace current art assets solely for capsule needs; record asset needs for Cycle 110 review.
- Do not commit large generated installers unless the repo already tracks that artifact type.

## Success criteria (cycle close)

- [ ] When Cycle 109 closes, current native package proof shall be recorded.
- [ ] When Cycle 109 closes, Steam readiness shall be marked green, blocked, or human-required with evidence.
- [ ] When Cycle 109 closes, `NEXT_SESSION.md` shall point to Cycle 110.

## References

- [`docs/cycle-108-plan.md`](cycle-108-plan.md)
- [`docs/cycle-110-plan.md`](cycle-110-plan.md)
- [`docs/native-store-steam-readiness-checklist.md`](native-store-steam-readiness-checklist.md)
- [`docs/native-desktop-package-cycle-54.md`](native-desktop-package-cycle-54.md)
- [`native/desktop-electron/`](../native/desktop-electron/)
