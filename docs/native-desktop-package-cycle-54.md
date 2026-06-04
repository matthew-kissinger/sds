# Native Desktop Package - Cycle 54

Status: WebGL distributor proof pass with WebGPU no-go handoff on 2026-06-04. This document records the Windows desktop distributor path added after the Cycle 53 shell proof. It does not authorize Steam submission, signing release controls, paid store setup, Steamworks SDK features, public unsigned distribution, or a default-renderer change.

## Summary

Cycle 54 promotes SDS's Electron shell from proof-only packaging to a Windows distributor path. The package lives in `native/desktop-electron/`, uses electron-builder, and still runs the built web game from `dist/` through the privileged `sds://app` protocol.

Current result: the package path is real and WebGL play proof is green. Packaged WebGPU is a no-go handoff, not a green gate. The WebGPU report shows the renderer and scene body reach production WebGPU without fallback, but the UI remains on the loading surface and never reaches the gameplay HUD.

The intended Windows artifacts are local proof outputs under `cycle54-validation/desktop-electron/artifacts/`:

- `win-unpacked/Sheep Dog Simulator.exe`
- `SheepDogSimulator-2.2.0-setup-x64.exe` - 242,117,516 bytes
- `SheepDogSimulator-2.2.0-portable-x64.exe` - 218,426,698 bytes

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
| Installer artifact | Pass: `artifacts.setup` present | Present in failure report |
| Portable artifact | Pass: `artifacts.portable` present | Present in failure report |
| Unpacked executable | Pass: `artifacts.unpackedExeExists=true` | Present in failure report |
| Signing posture | Pass: `signing.mode=unsigned-local-signing-ready` | Same |
| Packaged boot | Pass: `packaged=true`, `protocol=sds://app` | Pass: `packaged=true`, `protocol=sds://app` |
| Renderer | Pass: `effective=webgl`, no fallback | Partial: `effective=webgpu-production`, `devicePreflight.ok=true`, no fallback |
| Nonblank gameplay | Pass: `screenshotNonblank=true` | No-go: gameplay HUD never appears |
| Fullscreen | Pass: `fullscreen.entered=true`, `fullscreen.exited=true` | Not reached |
| Pointer lock | Pass: `pointerLock.locked=true` | Not reached |
| Keyboard/mouse response | Pass: visual diff changed | Not reached |
| Gamepad surface | Pass: `gamepad.apiAvailable=true` | Not reached |
| Audio unlock | Pass: `audio.resumed=true` | Not reached |
| Storage persistence | Pass: `storage.beforeReloadValue=before-reload` | Not reached |
| Worker health | Pass: `workerHealth.ok=true` | Not reached |
| SDS WebSocket | Pass: `webSocket.ok=true` | Not reached |
| Logs/crash path | Pass: `logs.logExists=true`, `logs.crashDumpDirExists=true` | Pass: logs/crash path exists in failure report |

## Current Evidence

`desktop-electron-proof-webgl.json` records `ok=true`, `sceneId=rolling-hills`, WebGL renderer, nonblank screenshot standard deviation `64.0861`, p95 frame time `14ms`, Worker health `200`, and an authenticated SDS room WebSocket open.

`desktop-electron-proof-webgpu.json` records `ok=false`. The runtime snapshot is useful: `effective=webgpu-production`, `productionWebGpu.ok=true`, `devicePreflight.ok=true`, `rendererReady=true`, `rendererIsWebGpu=true`, `canvasAttached=true`, and no fatal console errors. The visible overlay text remains `Rolling Hills / Jep - Classic / Gathering the flock / 100%`, `overlayHasHud=false`, `overlayHasPlayControl=false`, and no buttons are visible. Treat this as a WebGPU loading handoff bug in the packaged distributor path.

## Go / No-Go Handoff

Go for a local WebGL-only Steam depot dry-run if that scope is accepted: the package artifacts exist, WebGL boots and plays, logs/crash paths exist, and Cloudflare Worker/WebSocket proof passes.

No-go for explicit desktop WebGPU readiness and no-go for public Steam submission. Remaining Steam work: WebGPU loading handoff decision/fix, signed build decision, support/privacy URLs, store metadata, screenshots and capsule assets, depot layout, install/uninstall pass, controller notes, cloud-save decision, and whether multiplayer stays on Cloudflare Worker/Durable Objects without Steam networking.
