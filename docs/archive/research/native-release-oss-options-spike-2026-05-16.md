# Native Release and OSS Runtime Options Spike - 2026-05-16

## Question

What could SDS use for PC native, mobile native, and eventual Steam release
without thinking only in terms of Electron versus Tauri?

This is research only. It does not approve adding native-shell dependencies,
Steamworks SDK integration, mobile store prep, app signing, or a renderer-default
policy change.

## Current SDS state

SDS already has a native-readiness seam:

- `BUILD_TARGET=native npm run build` produces relative asset URLs and disables
  service-worker registration.
- `SDS_WORKER_BASE=<origin>` can point a packaged app at the live Worker origin.
- `js/runtimeConfig.js` owns Worker HTTP origin, Worker WebSocket origin, and
  telemetry enablement.
- `npm run native:check` runs the native build and verifies the generated
  bundle with `tools/native-preflight.mjs`.

The repo does not currently contain Tauri, Electron, Capacitor, Neutralino,
NW.js, Wails, Dioxus, Steamworks, or mobile-store dependencies. No native shell
has booted SDS. No Steam, App Store, or Google Play prep has started.

## Decision frame

The useful split is not "Electron or Tauri." The useful split is:

1. **Pinned Chromium desktop runtime.** Bigger download and memory footprint, but
   much more predictable WebGL/WebGPU behavior across Windows, macOS, and Linux.
2. **Platform WebView runtime.** Smaller shell and cleaner OS integration, but
   each OS WebView is its own browser target with its own WebGPU, fullscreen,
   input, audio, storage, and WebSocket proof.
3. **Mobile WebView app shell.** Good fit for an existing web game if touch,
   orientation, safe areas, WebSocket behavior, and app-store policy are proven.
4. **PWA/TWA/store wrapper.** Lowest app-code churn, but usually less control
   than a real app shell and may not satisfy store expectations without native
   value.
5. **True native engine/runtime rewrite.** Highest control and possible long-run
   performance upside, but a rewrite of renderer, UI, input, packaging, and
   likely parts of the game architecture.

## Desktop runtime options

| Option | What it gives SDS | Fit | Main risk |
| --- | --- | --- | --- |
| Electron | Bundled Chromium, Node/native module ecosystem, mature packaging and Steam precedent. | Best first proof if WebGPU predictability matters more than package size. | Larger bundle and memory cost; requires Electron security posture and packaging discipline. |
| Tauri 2 | Rust shell, small app size, platform WebViews, plugin system, strong native command boundary. | Strong candidate if WebGL default remains good and WebGPU is opt-in/proven per OS. | Not one browser. Windows, macOS, and Linux must each pass runtime proof. |
| Wry/Tao direct | Rust WebView primitives underneath Tauri-style shells. | Useful only if SDS wants custom shell control beyond Tauri. | More shell engineering with fewer batteries included. |
| Neutralinojs | Very small WebView shell for web apps. | Interesting minimal-shell proof for WebGL default. | Needs hard SDS proof for 3D game input/audio/fullscreen/WebGPU before serious use. |
| NW.js | Chromium plus Node with a long history for packaged HTML5 games. | Worth a comparison spike if Steam packaging ergonomics beat Electron for SDS. | Smaller modern ecosystem than Electron; same broad Chromium-app security concerns. |
| Wails | Go backend plus system WebView. | Useful for tools or launchers, not the first SDS runtime. | Platform WebView variability, Go shell not aligned with current JS/Rust questions. |
| Dioxus desktop/mobile | Rust UI with desktop/mobile/web targets. | Interesting if SDS ever creates Rust-native launcher/tools or rewrites UI. | Not a wrapper-shaped path for the existing React/Three app. |
| CEF/custom Chromium shell | Deep runtime control with pinned Chromium. | Only if Electron/NW.js cannot meet game needs. | Heavy integration, distribution, security, and update burden. |

### Lean recommendation

For a first PC/Steam proof, run a **Windows desktop shell bake-off**:

1. Electron: prove packaged SDS with default WebGL and explicit
   `?renderer=webgpu`.
2. Tauri: prove the same on Windows WebView2.
3. Optional NW.js or Neutralino: only if the first two expose a real gap.

Do not pick a shell from branding. Pick from measured SDS boot, fullscreen,
pointer lock, gamepad, audio unlock, WebSocket multiplayer, storage, WebGPU
device preflight, crash/log capture, package size, memory, and frame pacing.

## Mobile runtime options

| Option | What it gives SDS | Fit | Main risk |
| --- | --- | --- | --- |
| Capacitor | Native iOS/Android shell around the existing web app, plugins, app-store path. | Best first mobile app-shell candidate. | WKWebView/Android WebView behavior must be proven on devices. |
| Tauri mobile | Rust shell path extending Tauri 2 into mobile. | Watchlist if desktop Tauri wins and mobile support matures for SDS needs. | More moving parts and less SDS-specific evidence than Capacitor today. |
| PWA Builder | Store packaging helpers around PWA assets. | Useful for Windows Store or low-churn app packaging experiments. | SDS still needs store-policy and runtime proof; may not be enough for game-native expectations. |
| Bubblewrap / Trusted Web Activity | Android package that launches a trusted web origin in Chrome. | Good if SDS wants Android distribution with the live web app as the source of truth. | Less native control; Google Play policy and install/offline expectations still matter. |
| Native engine rewrite | Bevy, Godot, Babylon Native, or other true-native route. | Only for a separate long-range product strategy. | It is a port/rewrite, not a package step. |

### Mobile recommendation

Do not start mobile native until the desktop shell proof is understood or mobile
becomes the explicit priority. The first mobile spike should be Capacitor iOS
and Android with WebGL default, not WebGPU default:

- iOS: real WKWebView proof on current iOS, including orientation, safe areas,
  touch latency, audio unlock, WebSocket multiplayer, storage, and screenshots.
- Android: Android System WebView/Chrome-backed WebView proof across at least
  one mid-range and one high-end device.
- WebGPU: treat as optional capability until device and WebView proofs say
  otherwise.

## Steam release path

Steam is a release program, not a packaging format. SDS still needs a native
runtime choice before useful Steam release work.

Proof sequence:

1. Pick one desktop shell for a Windows proof package.
2. Prove SDS offline solo boot and online multiplayer against the live or test
   Worker origin.
3. Prove fullscreen, pointer lock, gamepad, audio unlock, storage, crash logs,
   and renderer fallback.
4. Package a private Steam-style build locally.
5. Only after explicit approval, create Steamworks app/depot/build metadata and
   run SteamPipe upload rehearsal.

Potential Steamworks integration layers:

- **Steamworks SDK directly** for achievements, cloud saves, overlay, and
  distribution features.
- **steamworks.js** for Node/Electron/NW.js style JavaScript integration.
- **greenworks** as older Electron/NW.js Steamworks precedent, but treat it as
  legacy until current maintenance is verified.
- **steamworks-rs** or a Tauri command/plugin wrapper for Rust-side Steamworks
  integration if Tauri wins.

SDS should not integrate Steamworks before the app can boot and play cleanly as
a plain packaged desktop build. Achievements/cloud/overlay should be phase two.

## Store policy and release cautions

- Apple review guidelines require apps to provide lasting entertainment or
  utility and can reject apps that are only thin web wrappers.
- Google Play policy has minimum-functionality and repetitive-content
  constraints that can affect simple WebView wrappers.
- Steam has Steam Direct onboarding and SteamPipe build/depot workflows before
  release.

The practical implication: SDS should ship a native game app, not merely a
browser tab in a wrapper. That means real fullscreen/input/audio/storage
behavior, crash diagnostics, and store-appropriate assets before release work.

## OSS watchlist

These are useful to track or spike. Inclusion is not adoption.

### Shells and packaging

- [Electron](https://github.com/electron/electron) - pinned Chromium desktop
  runtime.
- [electron-vite](https://github.com/electron-vite/electron-vite) - Vite-shaped
  Electron build tooling.
- [Electron Forge](https://github.com/electron/forge) and
  [electron-builder](https://github.com/electron-userland/electron-builder) -
  packaging/update ecosystems.
- [Tauri](https://github.com/tauri-apps/tauri) - Rust platform-WebView shell.
- [Wry](https://github.com/tauri-apps/wry) and
  [Tao](https://github.com/tauri-apps/tao) - lower-level Rust WebView/window
  crates.
- [Neutralinojs](https://github.com/neutralinojs/neutralinojs) - lightweight
  WebView app shell.
- [NW.js](https://github.com/nwjs/nw.js) - Chromium/Node desktop app runtime.
- [Wails](https://github.com/wailsapp/wails) - Go plus platform WebView shell.
- [Dioxus](https://github.com/DioxusLabs/dioxus) - Rust UI across desktop,
  mobile, and web, more relevant to future native tools than the current game.
- [Capacitor](https://github.com/ionic-team/capacitor) - iOS/Android app shell.
- [PWABuilder](https://github.com/pwa-builder/PWABuilder) - PWA packaging and
  store helpers.
- [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) - Android
  Trusted Web Activity packaging.

### Steam and store integration

- [steamworks.js](https://github.com/ceifa/steamworks.js) - JavaScript
  Steamworks bindings, useful if Electron/NW.js wins.
- [greenworks](https://github.com/greenheartgames/greenworks) - historical
  Steamworks bindings for Chromium app shells; verify maintenance before use.
- [steamworks-rs](https://github.com/Noxime/steamworks-rs) - Rust Steamworks
  bindings, useful if Tauri/Rust-side commands win.

### True-native or port/rewrite candidates

- [Bevy](https://github.com/bevyengine/bevy) - Rust ECS/game engine built around
  wgpu. Interesting for a true native/WebGPU rewrite, not a packaging shortcut.
- [Godot](https://github.com/godotengine/godot) - full native game engine with
  web export. Also a rewrite path, not a wrapper.
- [Babylon Native](https://github.com/BabylonJS/BabylonNative) - native host for
  Babylon.js-style apps. Interesting as a concept, but SDS is Three.js and this
  would be a major engine migration.

## Proposed next spike

If native release becomes the next approved work item, do this:

1. Keep `BUILD_TARGET=native` and `SDS_WORKER_BASE` as the app-code contract.
2. Create isolated shell prototypes outside the production default path:
   `sandbox/native-electron-proof/` and `sandbox/native-tauri-proof/`, or use
   a sibling scratch folder if the repo should stay dependency-clean.
3. Boot the same built SDS `dist/` in each shell.
4. Measure startup, memory, frame pacing, package size, WebGPU device preflight,
   fullscreen/pointer-lock/gamepad/audio, storage, and multiplayer.
5. Pick a desktop shell only after evidence.
6. Defer Steamworks and store metadata until after the shell proof.

## Sources

- Tauri WebView versions:
  https://v2.tauri.app/reference/webview-versions/
- Electron release cadence:
  https://www.electronjs.org/docs/latest/tutorial/electron-timelines
- Capacitor docs:
  https://capacitorjs.com/docs/
- Capacitor Android docs:
  https://capacitorjs.com/docs/android
- Steam Direct:
  https://partner.steamgames.com/steamdirect
- SteamPipe upload docs:
  https://partner.steamgames.com/doc/sdk/uploading
- Apple App Review Guidelines:
  https://developer.apple.com/app-store/review/guidelines/
- Google Play spam/minimum functionality policy:
  https://support.google.com/googleplay/android-developer/answer/9899034
