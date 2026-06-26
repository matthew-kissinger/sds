# SDS Desktop Electron Distributor

This is the Windows desktop distributor path for Sheep Dog Simulator. It packages the built web game from root `dist/` into an Electron app served through the privileged `sds://app` protocol. The core game remains browser-first; this package exists for native distribution experiments such as Steam.

Current launch-candidate version: `2.4.0`.

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

`npm run dist:win` writes Windows outputs under `../../cycle109-validation/desktop-electron/artifacts/`:

- `win-unpacked/Sheep Dog Simulator.exe`
- `SheepDogSimulator-2.4.0-setup-x64.exe`
- `SheepDogSimulator-2.4.0-portable-x64.exe`

The artifacts are local validation output and intentionally gitignored.

## Proof Surface

`proof.mjs` launches the packaged executable and verifies or records:

- app identity and exact Windows installer/portable artifact names;
- local signing posture and code-signing-ready config;
- `sds://app` packaged boot from built `dist/`;
- WebGL and WebGPU renderer requests, including runtime snapshots;
- nonblank gameplay screenshot;
- fullscreen, native window resize, pointer lock, keyboard/mouse visual response, virtual gamepad API path, audio context unlock, and localStorage persistence;
- production Worker health and authenticated SDS room WebSocket open;
- log and crash-dump paths under Electron `userData`;
- unexpected 404s separately from known optional tree-impostor probes.

Current proof JSON and screenshots are written under `../../cycle109-validation/desktop-electron/reports/`.

Cycle 109 evidence: `proof:webgl` and `proof:webgpu` are green from the packaged v2.4.0 app. Both renderer proofs boot to Rolling Hills gameplay, verify nonblank screenshots, exercise native resize/input/audio/storage, confirm Worker health and WebSocket open, and record zero fatal console errors.

## Signing

Local builds are unsigned and run with `CSC_IDENTITY_AUTO_DISCOVERY=false` so a developer machine certificate is not accidentally used. `Get-AuthenticodeSignature` reports `NotSigned` for the setup, portable, and unpacked executables. See [`SIGNING.md`](SIGNING.md) for the signing-ready handoff.

Do not publish public Windows binaries until Matt approves either:

- a signed release path, or
- an explicit unsigned-release decision with the support burden accepted.
