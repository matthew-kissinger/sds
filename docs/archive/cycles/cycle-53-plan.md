# Cycle 53 - native-shell-proof-1

> Drafted 2026-06-03 after Cycle 52 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Prove SDS can boot and play from packaged native shells without changing the core web game architecture. Before this cycle, SDS has a native build seam but no current shell proof. After this cycle, `npm run native:check` is green, a Windows Electron proof boots the built `dist/` without a Vite/source server, a Capacitor Android proof boots and plays from a debug APK on an API 35 emulator, explicit WebGL/WebGPU renderer behavior is recorded for both proof shells, and the repo has a go/no-go handoff for Steam/mobile store preparation.

## Current truth

The previous Cycle 53 scaffold pointed at P-SEC-1 security-hardening work. That was stale: [`audit-roadmap-2026-05.md`](audit-roadmap-2026-05.md) records P-SEC-1 through P-SEC-5 as implemented, validated, merged, and deployed on 2026-06-01. This cycle does not reopen Worker auth, D1 migrations, or the deterministic sim boundary.

Existing native seams:

- `BUILD_TARGET=native npm run build` emits relative assets for shell packaging.
- Native builds keep service-worker registration disabled.
- `SDS_WORKER_BASE` configures the packaged app Worker origin.
- `tools/native-preflight.mjs` verifies the built `dist/`.
- [`native-packaging-proof-0.md`](native-packaging-proof-0.md) already picked Electron first, Tauri second, and Capacitor mobile first.

## How to read this plan

This cycle proves packaging boundaries only. It does not pick a final store strategy, add Steamworks, change renderer policy, or rewrite the web app. Shell code lives under `sandbox/` proof folders and consumes the built `dist/` artifact.

## Open questions resolved

1. **Q1: Desktop proof shell?** Author lean: Electron first, because pinned Chromium removes platform-WebView variability from the first PC proof.
2. **Q2: Mobile proof shell?** Author lean: Capacitor Android first, WebGL default only. Outcome: local proof-only Temurin JDK plus the existing Android SDK/AVD allowed a full Android boot-and-play proof. Explicit WebGL passes; explicit WebGPU falls back because the emulator WebView cannot acquire a WebGPU adapter.
3. **Q3: Tauri this cycle?** Author lean: no. Add Tauri only after Electron evidence shows a concrete package-size, memory, or installer problem worth comparing.

## Architecture / shared changes

No `shared/` changes are authorized. No Worker wire change, D1 migration, renderer default change, or player-visible UI redesign is in scope.

Proof folders:

- `sandbox/native-electron-proof/` - Electron shell, Playwright/Electron validation, and explicit renderer checks.
- `sandbox/native-capacitor-proof/` - Capacitor Android shell scaffold, validation notes, and WebView renderer probe.
- `cycle53-validation/native/` - local proof output, screenshots, and JSON evidence.

## Phase 1 - handoff reconcile (~1hr)

**Independently testable.** Prevents agents from reopening shipped security work.

1. Replace the stale Cycle 53 security stub with this native-shell proof plan.
2. Update [`../NEXT_SESSION.md`](../NEXT_SESSION.md) so the pickup priority points at native proof.

**Acceptance (EARS):**

- When a cold-start agent reads `NEXT_SESSION.md`, the active cycle shall be `native-shell-proof-1`.
- When a cold-start agent reads this plan, P-SEC-1 shall be described as shipped history, not active scope.

## Phase 2 - native preflight repair (~1hr)

**Independently testable.** The previous preflight selected the first `main-*.js` asset, which can be a preload chunk instead of the HTML entry.

1. Parse the actual module entry script from `dist/index.html`.
2. Keep the existing checks for service-worker gating, relative assets, build target injection, and Worker runtime config.

**Acceptance (EARS):**

- When `npm run native:check` runs, the native preflight shall inspect the entry bundle referenced by `dist/index.html`.
- When `npm run native:check` runs, all native preflight checks shall pass.

## Phase 3 - Electron Windows proof shell (~3hr)

**Depends on:** Phase 2.

1. Add an isolated Electron proof under `sandbox/native-electron-proof/`.
2. Serve `dist/` through a privileged app protocol rather than `file://`.
3. Add a validation script that launches Electron, clicks through the entrance, confirms a gameplay canvas, captures a screenshot, and records proof JSON.
4. Record explicit `renderer=webgl` and `renderer=webgpu` proof from the packaged executable.

**Acceptance (EARS):**

- When the Electron proof launches, SDS shall boot from built `dist/` assets without a Vite/source server.
- When the Electron proof starts Classic play, the app shall attach a nonblank gameplay canvas.
- When the Electron proof requests WebGL, the app shall resolve to WebGL with no fallback.
- When the Electron proof requests WebGPU on a capable Windows host, the app shall resolve to production WebGPU with device preflight green and no fallback.
- If Electron emits a fatal page error, then the validation script shall fail.

## Phase 4 - Capacitor Android proof (~2hr)

**Depends on:** Phase 2.

1. Add an isolated Capacitor proof under `sandbox/native-capacitor-proof/`.
2. Configure Capacitor to use `../../dist` as `webDir` and target the production Worker origin.
3. Run Capacitor sync/build as far as the local Android host prerequisites allow.
4. If host prerequisites can be satisfied, install the debug APK on an Android emulator/device, capture menu/loading/gameplay/touch-input screenshots, and record proof JSON.
5. Probe explicit WebGL/WebGPU renderer behavior through the debug WebView.

**Acceptance (EARS):**

- When Capacitor sync runs, the Android shell shall consume the built `dist/` artifact.
- When the Android proof runs on a prepared host, the debug APK shall boot to the SDS menu, start Rolling Hills, reach the in-game HUD, and accept touch joystick input.
- When the Android WebView proof requests WebGL, the app shall resolve to WebGL with no fallback.
- When the Android WebView proof requests WebGPU, the proof shall record either production WebGPU or the exact fallback reason.
- If Java, Gradle, an emulator, or a connected device is unavailable on a later host, then the proof shall record the missing prerequisite instead of claiming Android boot acceptance.

## Phase 5 - package-readiness handoff (~1hr)

**Depends on:** Phases 3 and 4.

1. Write a go/no-go memo for Steam/mobile preparation.
2. Record proof commands, screenshots, JSON evidence, and blocked gates.

**Acceptance (EARS):**

- When the handoff is read, Steam readiness shall have a clear go/no-go based on Electron proof evidence.
- When the handoff is read, mobile readiness shall distinguish Capacitor scaffold/sync proof from real Android device boot proof.
- When the handoff is read, next-cycle work shall be concrete and bounded.

## Dependencies

```
Phase 1 -> Phase 2 -> Phase 3 + Phase 4 -> Phase 5
```

Phase 3 and Phase 4 can run in either order after the native build/preflight is reliable.

## Frozen files (cycle-specific additions)

- `shared/**` - not in scope.
- `worker/**` - not in scope.
- `js/**` - not in scope unless a native-shell proof exposes a boot blocker that cannot be fixed in the shell.

## Hard stops

1. If a shell proof requires changing deterministic sim behavior, stop and rescope.
2. If a shell proof requires changing the default renderer away from WebGL, stop and rescope.
3. If Android host prerequisites are missing, record the blocker; do not fake a real-device proof.

## What NOT to do during this cycle

- Do not add Steamworks, achievements, cloud saves, app-store submission, signing, or paid store setup.
- Do not add Tauri unless Electron proof creates a specific comparator need.
- Do not claim iOS proof without a real iOS target.
- Do not move shell dependencies into the main app package.
- Do not change service-worker behavior for web builds.

## Success criteria (cycle close)

- [x] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [x] When `npm run native:check` runs at cycle close, native preflight shall pass.
- [x] When `npm test` runs at cycle close, all vitest specs shall pass.
- [x] When `npm run build` runs at cycle close, production build shall be clean.
- [x] When Electron proof runs at cycle close, SDS shall boot and start Classic play from packaged `dist/`.
- [x] When Electron renderer proof runs at cycle close, explicit WebGL and true production WebGPU shall both pass from the packaged executable on this Windows host.
- [x] When Capacitor Android proof closes, Android status shall be either boot-proven or blocked with exact missing host prerequisites.
- [x] When Capacitor Android renderer proof runs at cycle close, explicit WebGL shall pass and explicit WebGPU shall record either true WebGPU or exact fallback; on the API 35 emulator it records `webgpu-adapter-unavailable`.
- [x] When the close handoff is read, Steam/mobile store preparation shall have a clear go/no-go recommendation.

## References

- [`native-packaging-proof-0.md`](native-packaging-proof-0.md) - Cycle 37 native proof matrix
- [`native-shell-proof-cycle-53.md`](native-shell-proof-cycle-53.md) - Cycle 53 proof handoff and go/no-go memo
- [`native-store-steam-readiness-checklist.md`](native-store-steam-readiness-checklist.md) - store and shell gates
- [`audit-roadmap-2026-05.md`](audit-roadmap-2026-05.md) - shipped security roadmap status
- [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - cycle template
- [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) - pickup-state contract
