# Native Desktop Package - Cycle 54

Status: WebGL and WebGPU distributor proofs passed and deployed on 2026-06-04. This document records the Windows desktop distributor path added after the Cycle 53 shell proof. It does not authorize Steam submission, signing release controls, paid store setup, Steamworks SDK features, public unsigned distribution, or a default-renderer change.

## Summary

Cycle 54 promotes SDS's Electron shell from proof-only packaging to a Windows distributor path. The package lives in `native/desktop-electron/`, uses electron-builder, and still runs the built web game from `dist/` through the privileged `sds://app` protocol.

Current result: the package path is real, WebGL play proof is green, and packaged production WebGPU play proof is green on this Windows host. The proof also verifies that the native window is resizable and that SDS resizes with it: Electron content size changes to `1040x640`, the page viewport follows, the canvas matches the viewport, and the camera aspect matches the resized window.

The intended Windows artifacts are local proof outputs under `cycle54-validation/desktop-electron/artifacts/`:

- `win-unpacked/Sheep Dog Simulator.exe`
- `SheepDogSimulator-2.2.0-setup-x64.exe` - 242,122,782 bytes
- `SheepDogSimulator-2.2.0-portable-x64.exe` - 218,431,930 bytes

## Package Path

- Electron: `42.3.3`
- electron-builder: `26.8.1`
- App ID: `com.matthewkissinger.sheepdogsim`
- Product name: `Sheep Dog Simulator`
- Windows executable name: `Sheep Dog Simulator`
- Windows targets: `nsis` and `portable`, x64
- Icon source: `assets/images/icons/icon-512.png`
- Generated desktop icons: `native/desktop-electron/build/icon.png` and `native/desktop-electron/build/icon.ico`
- Build input: root `dist/` from `BUILD_TARGET=native vite build`

## Runtime Controls

The desktop shell records logs and crash dumps under Electron `userData`:

- `logs/sds-desktop.log`
- `crash-dumps/`

The proof harness forces a unique proof `userData` path under `cycle54-validation/desktop-electron/userdata-<renderer>-<timestamp>/` so logs are inspectable without depending on the developer profile and without cross-run contamination.

## Signing Posture

Current status is signing-ready, not signed. Local package scripts set `CSC_IDENTITY_AUTO_DISCOVERY=false` so proof builds do not silently use a local developer certificate. `Get-AuthenticodeSignature` reports `NotSigned` for the setup, portable, and unpacked executables. Public Windows distribution should wait for explicit signing credentials or an explicit unsigned-release decision.

See `native/desktop-electron/SIGNING.md`.

## Build Note

On this non-admin Windows host, electron-builder's first `winCodeSign-2.6.0` cache extraction failed while expanding macOS symlink entries from the tool archive. The local cache was repaired by extracting the Windows tool files into `C:\Users\Mattm\AppData\Local\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0`; after that, `npm run desktop:dist` generated the installer and portable targets. CI should use a clean builder image or pre-warmed electron-builder cache.

## Validation Commands

```bash
npm run desktop:install
npm run desktop:dist
npm --prefix native/desktop-electron run proof:webgl
npm --prefix native/desktop-electron run proof:webgpu
```

The proof writes:

- `cycle54-validation/desktop-electron/reports/desktop-electron-proof-webgl.json`
- `cycle54-validation/desktop-electron/reports/desktop-electron-proof-webgpu.json`
- gameplay and input screenshots beside the JSON reports

## Proof Matrix

| Gate | WebGL package result | WebGPU package result |
|---|---|---|
| Installer artifact | Pass: `artifacts.setup` present | Pass: `artifacts.setup` present |
| Portable artifact | Pass: `artifacts.portable` present | Pass: `artifacts.portable` present |
| Unpacked executable | Pass: `artifacts.unpackedExeExists=true` | Pass: `artifacts.unpackedExeExists=true` |
| Signing posture | Pass: `signing.mode=unsigned-local-signing-ready` | Same |
| Packaged boot | Pass: `packaged=true`, `protocol=sds://app` | Pass: `packaged=true`, `protocol=sds://app` |
| Renderer | Pass: `effective=webgl`, no fallback | Pass: `effective=webgpu-production`, `devicePreflight.ok=true`, no fallback |
| Nonblank gameplay | Pass: `screenshotNonblank=true` | Pass: `screenshotNonblank=true` |
| Fullscreen | Pass: `fullscreen.entered=true`, `fullscreen.exited=true` | Pass: same |
| Native resize | Pass: `resize.viewportMatchesRequested=true`, `resize.canvasMatchesWindow=true`, `resize.cameraAspectMatchesWindow=true` | Pass: same |
| Sheep startup motion | Pass: `sheepMotion.motionAdvancedEnough=true` | Pass: `sheepMotion.motionAdvancedEnough=true` |
| Pointer lock | Pass: `pointerLock.locked=true` | Pass: `pointerLock.locked=true` |
| Keyboard/mouse response | Pass: visual diff changed | Pass: visual diff changed |
| Gamepad surface | Pass: `gamepad.apiAvailable=true` | Pass: `gamepad.apiAvailable=true` |
| Audio unlock | Pass: `audio.resumed=true` | Pass: `audio.resumed=true` |
| Storage persistence | Pass: `storage.beforeReloadValue=before-reload` | Pass: same |
| Worker health | Pass: `workerHealth.ok=true` | Pass: `workerHealth.ok=true` |
| SDS WebSocket | Pass: `webSocket.ok=true` | Pass: `webSocket.ok=true` |
| Logs/crash path | Pass: `logs.logExists=true`, `logs.crashDumpDirExists=true` | Pass: same |

## Current Evidence

`desktop-electron-proof-webgl.json` records `ok=true` at `2026-06-04T03:31:29.259Z`, `sceneId=rolling-hills`, WebGL renderer, nonblank gameplay, native resize pass, p95 frame time `21ms`, Worker health `200`, authenticated SDS room WebSocket open, and zero fatal console errors.

`desktop-electron-proof-webgpu.json` records `ok=true` at `2026-06-04T03:30:57.983Z`. It proves `effective=webgpu-production`, `productionWebGpu.ok=true`, `devicePreflight.ok=true`, `rendererReady=true`, `rendererIsWebGpu=true`, no fallback, gameplay HUD present, nonblank screenshot, native resize pass, Worker health `200`, authenticated SDS room WebSocket open, and zero fatal console errors.

Both proofs sample the first 40 sheep after gameplay starts. The final WebGL proof records `startupVisualReady=40`, `simMoved=39`, `renderMoved=39`, `visualAdvanced=40`, and `motionAdvancedEnough=true`. The final WebGPU proof records `startupVisualReady=40`, `simMoved=40`, `renderMoved=40`, `visualAdvanced=40`, and `motionAdvancedEnough=true`.

## Go / No-Go Handoff

Go for a local Steam depot dry-run in the next store-prep cycle if that scope is accepted: the package artifacts exist, WebGL and WebGPU boot and play, resize/fullscreen/input/audio/storage work, logs/crash paths exist, and Cloudflare Worker/WebSocket proof passes.

No-go for public Steam submission. Remaining Steam work: signed build decision, support/privacy URLs, store metadata, screenshots and capsule assets, depot layout, install/uninstall pass, controller notes, cloud-save decision, and whether multiplayer stays on Cloudflare Worker/Durable Objects without Steam networking.
