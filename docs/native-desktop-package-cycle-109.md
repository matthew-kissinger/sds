# Native Desktop Package - Cycle 109

Status: v2.4.0 Windows desktop package proof passed on 2026-06-26. This document records current launch-candidate proof and supersedes Cycle 54 for launch decisions. It does not authorize Steam submission, signing release controls, paid store setup, Steamworks SDK features, public unsigned distribution, or a default-renderer change.

## Summary

Cycle 109 refreshes the Electron desktop distributor path for the `v2.4.0` launch candidate. The package lives in `native/desktop-electron/`, uses electron-builder, and runs the built web game from `dist/` through the privileged `sds://app` protocol.

Current result: the Windows installer, portable executable, and unpacked app are generated under `cycle109-validation/desktop-electron/artifacts/`. Packaged WebGL and WebGPU runtime proofs are green on this Windows host.

## Package Path

- Electron: `42.3.3`
- electron-builder: `26.8.1`
- App ID: `com.matthewkissinger.sheepdogsim`
- Product name: `Sheep Dog Simulator`
- Package version: `2.4.0`
- Windows executable name: `Sheep Dog Simulator`
- Windows targets: `nsis` and `portable`, x64
- Build input: root `dist/` from `BUILD_TARGET=native vite build`
- Output root: `cycle109-validation/desktop-electron/artifacts/`

## Artifacts

| Artifact | Size | Signing |
|---|---:|---|
| `SheepDogSimulator-2.4.0-setup-x64.exe` | 134,038,407 bytes | `NotSigned` |
| `SheepDogSimulator-2.4.0-portable-x64.exe` | 133,710,734 bytes | `NotSigned` |
| `SheepDogSimulator-2.4.0-setup-x64.exe.blockmap` | 141,435 bytes | n/a |
| `win-unpacked/Sheep Dog Simulator.exe` | recorded in artifact folder | `NotSigned` |

## Validation Commands

```bash
npm run native:check
npm run desktop:dist
npm --prefix native/desktop-electron run proof:webgpu
npm --prefix native/desktop-electron run proof:webgl
```

## Proof Matrix

| Gate | WebGL package result | WebGPU package result |
|---|---|---|
| Installer artifact | Pass | Pass |
| Portable artifact | Pass | Pass |
| Unpacked executable | Pass | Pass |
| Signing posture | Unsigned, signing-ready | Unsigned, signing-ready |
| Packaged boot | Pass: `sds://app` | Pass: `sds://app` |
| Renderer | Pass: `effective=webgl` | Pass: `effective=webgpu-production` |
| Nonblank gameplay | Pass | Pass |
| Fullscreen | Pass | Pass |
| Native resize | Pass | Pass |
| Sheep startup motion | Pass | Pass |
| Pointer lock | Pass | Pass |
| Keyboard/mouse response | Pass | Pass |
| Gamepad surface | Pass | Pass |
| Audio unlock | Pass | Pass |
| Storage persistence | Pass | Pass |
| Worker health | Pass: 200 | Pass: 200 |
| SDS WebSocket | Pass | Pass |
| Logs/crash path | Pass | Pass |
| Fatal console errors | 0 | 0 |
| Unexpected 404s | 0 | 0 |

## Current Evidence

`desktop-electron-proof-webgl.json` records `ok=true` at `2026-06-26T17:52:42.967Z`, `sceneId=rolling-hills`, `effective=webgl`, nonblank gameplay screenshot, p95 frame time about `7ms`, Worker health `200`, authenticated SDS room WebSocket open, and zero fatal errors.

`desktop-electron-proof-webgpu.json` records `ok=true` at `2026-06-26T17:52:12.519Z`, `sceneId=rolling-hills`, `effective=webgpu-production`, WebGPU device preflight ok, nonblank gameplay screenshot, p95 frame time about `7.1ms`, Worker health `200`, authenticated SDS room WebSocket open, and zero fatal errors.

## Proof-Harness Fixes

Cycle 109 updated `native/desktop-electron/proof.mjs` so launch proof follows the current game:

- HUD validation now reads the actual `gameState.totalSheep` instead of hard-coding `200`.
- Generic browser 404 console text is ignored only while actual 404 URLs are tracked and checked against an allowlist for known optional tree-impostor probes.
- Output paths point to `cycle109-validation/desktop-electron/` instead of Cycle 54.

## Go / No-Go Handoff

Go for a private Steam depot setup after Matt approves Steam Direct/account actions: the package artifacts exist, WebGL and WebGPU boot and play, resize/fullscreen/input/audio/storage work, logs/crash paths exist, and Cloudflare Worker/WebSocket proof passes.

No-go for public Steam submission. Remaining Steam work: signing decision, support/privacy URLs, store metadata, screenshots and capsule assets, depot layout, install/uninstall pass, controller notes, cloud-save decision, pricing/free-to-play decision, and final human review.
