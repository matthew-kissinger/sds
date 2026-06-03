# Native Shell Proof - Cycle 53

Status: proof pass on 2026-06-03. This document records packaging evidence only. It does not authorize Steam release controls, App Store submission, Google Play submission, signing, paid store setup, Steamworks SDK features, or a default-renderer change.

## Summary

SDS can boot and play from both native proof shells while preserving the core web game architecture.

The Windows proof packages the current native `dist/` into an Electron executable, serves it through the privileged `sds://app` protocol, starts Classic play, captures a nonblank gameplay screenshot, verifies WebGL gameplay HUD state, verifies true production WebGPU from the same packaged shell, and reaches the production Worker health endpoint.

The Android proof builds a Capacitor debug APK from the same `dist/`, installs it on an API 35 emulator, boots the WebView menu, starts Rolling Hills Just Play, reaches the in-game HUD, and accepts touch joystick input. No `shared/`, Worker, D1 migration, renderer-default, or main web-game runtime change was required.

Renderer-specific result: packaged Electron works in both explicit `renderer=webgl` and true `renderer=webgpu` modes on this Windows host. Capacitor Android WebView works in explicit `renderer=webgl`; explicit `renderer=webgpu` is detected but falls back to WebGL on the API 35 emulator because `navigator.gpu.requestAdapter()` returns no adapter.

## What changed

- `tools/native-preflight.mjs` now reads the actual module entry script from `dist/index.html` before inspecting runtime config. This fixes the stale assumption that the first `main-*.js` asset is always the entry chunk.
- `sandbox/native-electron-proof/` contains the isolated Electron proof shell, Windows packaging command, packaged executable validator, and explicit WebGL/WebGPU renderer checks.
- `sandbox/native-capacitor-proof/` contains the isolated Capacitor Android scaffold, proof validator, and WebView renderer probe.
- A local proof-only Android host toolchain was assembled under `cycle53-validation/native/android-host/`: portable Temurin JDK 21.0.11+10 plus Android command-line-tools setup for the existing SDK.
- `NEXT_SESSION.md` and `docs/cycle-53-plan.md` now point at native proof instead of the stale security-hardening stub.

No `shared/`, Worker, D1 migration, renderer default, or main web-game runtime change was made.

## Evidence

Commands run:

```bash
npm run native:check
npx vitest run --silent --reporter=dot
npm run build
cd sandbox/native-electron-proof && npm run package:win
cd sandbox/native-electron-proof && npm run proof:packaged
cd sandbox/native-electron-proof && npm run proof:packaged -- --renderer=webgl
cd sandbox/native-electron-proof && npm run proof:packaged -- --renderer=webgpu
cd sandbox/native-capacitor-proof && npm run sync:android && npm run proof
cd sandbox/native-capacitor-proof && npm run proof:renderers
cd sandbox/native-capacitor-proof && .\android\gradlew.bat -p android assembleDebug
adb -s emulator-5554 install -r sandbox/native-capacitor-proof/android/app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 shell am start -n com.sheepdogsim.nativeproof/.MainActivity
```

Validation results:

- `npm run native:check`: pass. Native preflight inspected `dist/assets/main-BXm-Ul7P.js`, verified native build target injection, no `sw.js`, relative asset URLs, Worker base, and runtime network config.
- Vitest: pass, 86 files passed, 1 skipped; 866 tests passed, 7 skipped.
- `npm run build`: pass. Production web build remains clean.
- Electron packaged proof: pass. Packaged executable path: `cycle53-validation/native/electron/package/SheepdogSimulatorNativeProof-win32-x64/SheepdogSimulatorNativeProof.exe`.
- Electron package size: 503.96 MB unpacked, 336 files.
- Electron gameplay proof: `sceneId=rolling-hills`, `renderer=webgl`, HUD visible, Play control gone, Worker `/healthz` returned 200, no fatal page errors.
- Electron screenshot: `cycle53-validation/native/electron/electron-field-classic.png`.
- Electron explicit WebGL proof: pass. `requested=webgl`, `effective=webgl`, renderer class is WebGL, no fallback, screenshot `cycle53-validation/native/electron/electron-field-classic-webgl.png`.
- Electron explicit WebGPU proof: pass. `requested=webgpu`, `effective=webgpu-production`, `productionWebGpu.ok=true`, device preflight `ok=true`, renderer is WebGPU, no fallback, screenshot `cycle53-validation/native/electron/electron-field-classic-webgpu.png`.
- Capacitor Android sync: pass. Android asset directory contains 89 built Vite assets.
- Capacitor Android Gradle build: pass with local Temurin JDK 21.0.11+10 and Android SDK at `C:\Users\Mattm\AppData\Local\Android\Sdk`.
- Capacitor Android APK: pass. Debug APK path: `sandbox/native-capacitor-proof/android/app/build/outputs/apk/debug/app-debug.apk`; size recorded by validator as 143,710,889 bytes.
- Capacitor Android runtime proof: pass on `emulator-5554` / `SDSProof_API35`. Validator status: `boot-and-play-proven`.
- Android menu screenshot: `cycle53-validation/native/capacitor-android/android-late.png`.
- Android loading screenshot: `cycle53-validation/native/capacitor-android/android-play-tap.png`.
- Android gameplay screenshot: `cycle53-validation/native/capacitor-android/android-field.png`, showing HUD `0/30`, timer, touch controls, and rendered Rolling Hills field.
- Android touch-input screenshot: `cycle53-validation/native/capacitor-android/android-moved.png`, showing timer advanced to `00:08`, score `1/30`, distance changed, and a different camera position after joystick input.
- Android runtime logs included `Game started in practice mode with 30 sheep`, `Scene body complete`, and dog animation transitions through `RUNNING`, `TROTTING`, and `WALKING`.
- Capacitor Android explicit WebGL proof: pass through WebView CDP. `requested=webgl`, `effective=webgl`, renderer is WebGL, no fallback.
- Capacitor Android explicit WebGPU check: graceful fallback only on this emulator. `requested=webgpu`, `webgpuApiAvailable=true`, `effective=webgl`, `fallbackReason=webgpu-adapter-unavailable`, `productionWebGpu.devicePreflight.adapterAvailable=false`, renderer remains WebGL.
- Android perf caveat: the emulator proof is playable but not store-performance-ready. Logs recorded `[SWAP] complete in 22136ms`, `INP ... 1709ms`, and repeated Android `Davey!` long-frame events during first scene construction.

Renderer matrix:

| Shell | Request | Effective renderer | Result | Evidence |
|---|---|---|---|---|
| Electron Windows packaged | `renderer=webgl` | WebGL | Pass | `cycle53-validation/native/electron/electron-proof-webgl.json` |
| Electron Windows packaged | `renderer=webgpu` | WebGPU production | Pass | `cycle53-validation/native/electron/electron-proof-webgpu.json` |
| Capacitor Android WebView emulator | `renderer=webgl` | WebGL | Pass | `cycle53-validation/native/capacitor-android/capacitor-android-renderers.json` |
| Capacitor Android WebView emulator | `renderer=webgpu` | WebGL fallback | Supported fallback, not true WebGPU | `fallbackReason=webgpu-adapter-unavailable` in `capacitor-android-renderers.json` |

Local proof JSON:

- `cycle53-validation/native/electron/electron-proof.json`
- `cycle53-validation/native/electron/electron-proof-webgl.json`
- `cycle53-validation/native/electron/electron-proof-webgpu.json`
- `cycle53-validation/native/capacitor-android/capacitor-android-proof.json`
- `cycle53-validation/native/capacitor-android/capacitor-android-renderers.json`

These `cycle53-validation/` artifacts are intentionally gitignored proof outputs.

## Go / no-go

### Windows desktop / Steam preparation

Go for the next desktop packaging cycle. The core question is no longer "can SDS boot from a native shell?" It can. The renderer question is also green on this Windows Electron host: both explicit WebGL and true production WebGPU work from the packaged app. The next desktop cycle should convert the proof into a real distributor: pick Electron Forge or electron-builder, add app identity/icon metadata, produce a signed-or-signing-ready Windows installer/portable artifact, record startup/memory/frame timings, and define crash/log handling.

Not yet go for Steam submission. Steam prep still needs real store metadata, launcher/depot layout, support/privacy URLs, screenshot/capsule assets, install/uninstall behavior, signed build policy, and a decision about whether multiplayer stays Cloudflare-only.

### Android / Google Play preparation

Go for the next Android device-hardening cycle. The core question is no longer "can SDS boot and play in a mobile native shell?" It can on a Capacitor Android debug APK. Explicit WebGL is green. True Android WebGPU is not proven on the API 35 emulator because the WebView cannot acquire a WebGPU adapter; the app falls back cleanly to WebGL.

Not yet go for Google Play preparation. The current proof is an emulator debug build with visual/touch evidence, not a signed release/AAB, not real-device performance acceptance, not a true mobile WebGPU acceptance pass, and not a store-compliance pass. The next Android cycle needs release build configuration, signing/AAB path, physical Android proof, audio unlock, storage persistence, offline/online behavior, Worker/WebSocket proof, orientation/fullscreen policy, renderer fallback policy, and performance budgets.

### iOS / App Store preparation

No-go. No iOS shell was generated or run in this cycle. Capacitor remains the likely first iOS path, but it needs macOS/Xcode/TestFlight or BrowserStack-style proof before any App Store readiness claim.

### Tauri

Defer. Electron already proves the Windows packaged-shell baseline. Tauri is still a useful comparator if package size, memory, installer footprint, or security posture becomes painful, but adding it now would increase proof surface before the Steam/Android gates are mature.

## Next cycle recommendation

Run `native-desktop-package-1` if PC/Steam is the priority:

1. Replace proof packager with Electron Forge or electron-builder.
2. Add app metadata, icon, Windows artifact target, and crash/log path.
3. Measure cold start, memory, frame pacing, fullscreen, pointer lock, keyboard/mouse, gamepad, audio unlock, storage, and WebSocket multiplayer in the packaged app.
4. Keep the explicit WebGL/WebGPU packaged checks as release preflight gates.
5. Produce a Steam-prep checklist with exact remaining assets and store fields.

Run `native-android-store-hardening-1` if mobile is the priority:

1. Convert the debug APK path into signed release APK/AAB outputs.
2. Prove on at least one physical Android phone and one emulator profile.
3. Capture WebGL gameplay, touch controls, audio unlock, local storage, Worker health, and WebSocket/multiplayer proof.
4. Re-run the explicit WebGPU probe on at least one physical Android phone; treat true WebGPU as optional until a real device proves adapter availability and acceptable frame pacing.
5. Measure first-run scene build, memory, frame pacing, install size, and thermal/battery behavior.
6. Decide whether Android continues as Capacitor app or pivots to PWA/TWA.
