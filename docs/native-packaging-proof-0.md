# Native Packaging Proof 0

Status: Cycle 37 decision matrix, drafted 2026-05-16. This document does not
authorize store submission, signing, Steamworks integration, deployment, or a
default-renderer change.

## Current SDS Contract

SDS already has the app-code seam needed before choosing a shell:

- `BUILD_TARGET=native npm run build` emits relative assets for a packaged app.
- Native builds keep service-worker registration disabled.
- `SDS_WORKER_BASE` can point a packaged app at a chosen Worker origin.
- `js/runtimeConfig.js` owns Worker HTTP origin, WebSocket origin, and telemetry.
- `npm run native:check` builds and verifies `dist/` with
  `tools/native-preflight.mjs`.

No Electron, Tauri, Capacitor, Steamworks, App Store, or Google Play dependency
has been added by this proof.

## Official Source Refresh

- Electron distribution requires packaging app resources into an executable,
  then signing for OS trust and optional app-store-specific publishing. Electron
  also has an updater path after packaging/signing.
  Source: https://www.electronjs.org/docs/latest/tutorial/distribution-overview
- Tauri distribution supports desktop/mobile targets, but it is a platform
  WebView shell. Tauri uses WebView2 on Windows and WebKit/WKWebView/WebKitGTK
  on Apple/Linux targets, so SDS must prove each OS runtime separately.
  Sources: https://v2.tauri.app/distribute/ and
  https://v2.tauri.app/reference/webview-versions/
- Capacitor is a native runtime for web apps. Its build flow is web build,
  copy/sync into native projects, then compile with Xcode or Android tooling.
  Sources: https://capacitorjs.com/docs/ and
  https://capacitorjs.jp/docs/v2/basics/building-your-app
- Trusted Web Activity/Bubblewrap is an Android path for running a web origin in
  fullscreen Chrome with Digital Asset Links verification, not a full native
  shell.
  Source: https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities
- Steam has separate Store Presence and Game Build checklists. A reviewed build
  does not release itself; release is an explicit Steamworks action.
  Sources: https://partner.steamgames.com/doc/store/releasing and
  https://partner.steamgames.com/doc/store/application/builds
- Apple requires accurate metadata/screenshots/privacy information and current
  privacy disclosures for app and third-party data practices.
  Sources: https://developer.apple.com/app-store/review/guidelines/ and
  https://developer.apple.com/app-store/app-privacy-details/
- Android release prep requires signed release packages, app icon/materials,
  testing, and Play-specific release/data/permission work before rollout.
  Sources: https://developer.android.com/studio/publish/preparing and
  https://support.google.com/googleplay/android-developer/answer/9859348/prepare-and-roll-out-a-release

## Proof Matrix

| Path | Role in SDS | First proof | Risk to prove before adoption |
| --- | --- | --- | --- |
| Electron | Pinned Chromium desktop baseline for Windows/Steam-style packaging. | Boot existing `dist/` with progressive default, explicit `?renderer=webgpu`, and forced `?renderer=webgl`. | Package size, memory, security posture, fullscreen/pointer-lock/audio/storage/WebSocket behavior. |
| Tauri 2 | Platform-WebView desktop baseline. | Boot same `dist/` on Windows WebView2 after Electron baseline. | WebView2/WKWebView/WebKitGTK differences, WebGPU preflight, store/signing config, Rust/Cargo footprint. |
| Capacitor | First mobile native-shell candidate. | After desktop proof, boot WebGL-default SDS on iOS and Android with `webDir: dist`. | WKWebView/Android WebView behavior, safe areas, touch latency, orientation, audio unlock, storage, WebSocket multiplayer. |
| PWA/PWABuilder/TWA | Low-churn install/store-wrapper track. | Treat as secondary after app-shell proof; TWA only if live web origin remains source of truth. | Less native control, Digital Asset Links, offline behavior, store expectations for a game app. |
| Steamworks | Release/distribution feature layer, not a shell. | Defer until a desktop shell boots and plays cleanly. | Depot/build workflow, overlay, achievements, cloud saves, crash logs, and review timing. |
| True-native rewrite | Long-range product strategy. | No Cycle 37 action. | Renderer/UI/input/sim/platform rewrite scope, not packaging work. |

## Cycle 37 Decision

First desktop proof target: **Electron on Windows** as the pinned-Chromium
baseline. It is the right first comparator because SDS is actively proving
explicit WebGPU behavior and Electron removes platform-WebView variability from
the first desktop package question.

Second desktop proof target: **Tauri 2 on Windows WebView2** as the
platform-WebView baseline. It should run the same built `dist/` and compare
startup, package size, frame pacing, WebGPU device preflight, fullscreen,
pointer lock, gamepad, audio unlock, storage, WebSocket multiplayer, and logs
against Electron.

First mobile proof target: **Capacitor iOS and Android**, WebGL default only.
WebGPU remains optional capability evidence until device/WebView proof says
otherwise.

PWA/TWA target: defer until after the app-shell proof. TWA is a good Android
distribution experiment only if SDS deliberately wants the live web origin to be
the packaged product.

Steamworks target: defer. The next meaningful Steam step is a local Windows app
package that can boot, play solo, connect multiplayer, and record crash/log
evidence without Steamworks SDK features.

## Dependency Boundary

Do not add these in Cycle 37 unless Matt explicitly approves shell code:

| Proof | Exact package boundary | Install/build impact to measure |
| --- | --- | --- |
| Electron | `sandbox/native-electron-proof/`; first dependency would be `electron`, packaging tool only after boot proof. | `package-lock.json` delta, `node_modules` size, packaged app size, cold startup, memory, frame pacing, WebGPU preflight. |
| Tauri | `sandbox/native-tauri-proof/`; first dependency would be `@tauri-apps/cli` plus generated `src-tauri`/Cargo files in that proof boundary. | npm/Cargo lock deltas, Rust toolchain requirements, installer size, WebView2 behavior, frame pacing, WebGPU preflight. |
| Capacitor | `sandbox/native-capacitor-proof/`; first dependencies would be `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, and `@capacitor/android`. | npm lock delta, generated native project size, Xcode/Android Studio requirements, device startup, touch latency, orientation, audio/storage/WebSocket behavior. |

For this cycle, package code stays dependency-clean. Phase 6 is satisfied by the
existing native preflight unless a later explicit approval authorizes a shell
prototype.

## Package Proof Acceptance

Before any shell dependency is merged, the proof must record:

- The exact built `dist/` SHA/source and `BUILD_TARGET=native` output.
- Progressive default boot URL, forced `?renderer=webgl`, and explicit
  `?renderer=webgpu` URL.
- Startup behavior and whether the canvas is nonblank.
- Fullscreen and pointer-lock behavior.
- Keyboard, mouse, touch where relevant, gamepad where available.
- Audio unlock behavior.
- Local storage/save behavior.
- WebSocket multiplayer behavior against the chosen Worker origin.
- Crash/log capture route.
- Package size and install/startup memory.
- Frame-time evidence for Field, Rolling Hills, and Open Country.
- Any platform-specific renderer fallback reason.

## Phase 6 Result

`npm run native:check` passed on 2026-05-16 and refreshed
`cycle36-validation/native/preflight.json` at
`2026-05-16T06:36:27.879Z`.

Native preflight result:

- `ok: true`
- `target: native`
- `mainBundle: dist\assets\main-Cxs_cqqJ.js`
- Native build target was injected into `index.html`.
- No unreplaced build-target token remained.
- Native build emitted no `sw.js`.
- Service-worker registration stayed gated by build target.
- `index.html` and `about.html` had no root-relative asset URLs.
- `index.html` and `about.html` emitted relative asset URLs for native shells.
- Main bundle contained configured Worker base
  `https://sds-worker.matt-m-kissinger.workers.dev`.
- Main bundle included runtime network configuration.

No shell dependency was added. Electron/Tauri/Capacitor proof folders remain
deferred until a later explicit shell-prototype approval.
