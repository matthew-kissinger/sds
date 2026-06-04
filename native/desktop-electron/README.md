# SDS Desktop Electron Distributor

Cycle 54 promotes the Cycle 53 proof shell into the first real Windows desktop distributor path for Sheep Dog Simulator. The shell still serves the built web game from `dist/` through the privileged `sds://app` protocol; the core web game architecture stays browser-first.

## Commands

From repo root:

```bash
npm run desktop:install
npm run desktop:dist
npm run desktop:proof
```

From this directory:

```bash
npm install
npm run dist:win
npm run proof:webgl
npm run proof:webgpu
```

`npm run dist:win` writes Windows outputs under `../../cycle54-validation/desktop-electron/artifacts/`:

- `win-unpacked/Sheep Dog Simulator.exe`
- `SheepDogSimulator-2.2.0-setup-x64.exe`
- `SheepDogSimulator-2.2.0-portable-x64.exe`

The artifacts are local validation output and intentionally gitignored.

## Proof Surface

`proof.mjs` launches the packaged executable and verifies or records:

- app identity and exact Windows installer/portable artifact names;
- local signing posture and code-signing-ready config;
- `sds://app` packaged boot from built `dist/`;
- WebGL and WebGPU renderer requests, including a runtime snapshot when a renderer proof fails;
- nonblank gameplay screenshot;
- fullscreen, pointer lock, keyboard/mouse visual response, virtual gamepad API path, audio context unlock, and localStorage persistence;
- production Worker health and authenticated SDS room WebSocket open;
- log and crash-dump paths under Electron `userData`.

Proof JSON and screenshots are written under `../../cycle54-validation/desktop-electron/reports/`.

Current Cycle 54 evidence: `proof:webgl` is green from the packaged app. `proof:webgpu` is a no-go handoff: production WebGPU is available and the scene body completes, but the loading surface does not hand off to the gameplay HUD.

## Signing

Local builds are unsigned and run with `CSC_IDENTITY_AUTO_DISCOVERY=false` so a developer machine certificate is not accidentally used. See [`SIGNING.md`](SIGNING.md) for the signing-ready handoff.
