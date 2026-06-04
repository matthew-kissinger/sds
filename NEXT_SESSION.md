# Next Session - Cycle 54 Native Desktop Package

> **Updated:** 2026-06-04
> **For:** Active `native-desktop-package-1` cycle after the `v2.2.0` release close.
> **Pickup priority:** Decide whether to fix the packaged WebGPU loading handoff next or run a WebGL-only Steam depot dry-run. Start from [`docs/cycle-54-plan.md`](docs/cycle-54-plan.md) and [`docs/native-desktop-package-cycle-54.md`](docs/native-desktop-package-cycle-54.md).

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-54-plan.md`](docs/cycle-54-plan.md) -> [`docs/native-shell-proof-cycle-53.md`](docs/native-shell-proof-cycle-53.md) -> [`docs/native-desktop-package-cycle-54.md`](docs/native-desktop-package-cycle-54.md) -> [`docs/native-store-steam-readiness-checklist.md`](docs/native-store-steam-readiness-checklist.md).

Cycle 54 is open as `native-desktop-package-1`. Do not touch `shared/` or sim-baseline goldens; this cycle packages the existing native `dist/` through Electron.

## Where It Stands

**Cycle 53 closed 2026-06-03 as `native-shell-proof-1`.** The archived plan is [`docs/archive/cycles/cycle-53-plan.md`](docs/archive/cycles/cycle-53-plan.md), and the proof report is [`docs/native-shell-proof-cycle-53.md`](docs/native-shell-proof-cycle-53.md). SDS now has a green native preflight, a packaged Windows Electron proof, and a Capacitor Android debug APK proof without changing the core web game architecture.

**Renderer status is split by cycle and shell.** Cycle 53's proof-only Electron shell passed explicit WebGL and true production WebGPU. Cycle 54's distributor-grade Electron package now passes explicit WebGL, but packaged WebGPU is a current no-go: the report records `effective=webgpu-production`, `devicePreflight.ok=true`, `rendererReady=true`, and `canvasAttached=true`, then the UI remains on `Gathering the flock 100%` with no HUD. Capacitor Android passed explicit WebGL on an API 35 emulator; explicit WebGPU detected the API but fell back to WebGL because no adapter was available. Do not claim current packaged desktop WebGPU readiness until the Cycle 54 loading handoff is fixed and `proof:webgpu` is green.

**`v2.2.0` is the forward-only license transition release.** Current source is AGPL-3.0-or-later. Current non-code assets are CC BY-SA 4.0. All versions up to and including `v2.1.10` were released under MIT and remain available under MIT from their historical commits, tags, and releases. The running game has visible AGPL source notices on the about page, start/loading flow, and HUD.

## Active Cycle 54 Work

**Primary direction:** Desktop/Steam preparation. The Windows Electron distributor path exists with app identity, icon, electron-builder outputs, signing-ready posture, logs/crash paths, packaged WebGL proof, and Steam-prep handoff. The remaining blocker is packaged WebGPU loading handoff proof.

**Implementation surface:** [`native/desktop-electron/`](native/desktop-electron/) plus root npm scripts:

```bash
npm run desktop:install
npm run desktop:dist
npm --prefix native/desktop-electron run proof:webgl
npm --prefix native/desktop-electron run proof:webgpu
```

**Generated local artifacts:** `cycle54-validation/desktop-electron/artifacts/win-unpacked/Sheep Dog Simulator.exe`, `SheepDogSimulator-2.2.0-setup-x64.exe` (242,117,516 bytes), and `SheepDogSimulator-2.2.0-portable-x64.exe` (218,426,698 bytes). Local Authenticode status is `NotSigned` by design.

**Latest proof reports:** `cycle54-validation/desktop-electron/reports/desktop-electron-proof-webgl.json` is green. `cycle54-validation/desktop-electron/reports/desktop-electron-proof-webgpu.json` is a no-go handoff with a runtime snapshot; WebGPU is available, but gameplay HUD never appears.

## Working Contract

- Do not reopen Worker auth from the stale Cycle 53 security stub. [`docs/audit-roadmap-2026-05.md`](docs/audit-roadmap-2026-05.md) records P-SEC-1 through P-SEC-5 as shipped on 2026-06-01.
- Do not touch `shared/` or sim-baseline goldens for native packaging unless the new cycle plan explicitly authorizes it.
- Shell proof code remains under `sandbox/` unless the chosen Cycle 54 goal intentionally promotes it into production packaging.
- Treat `cycle53-validation/` and `cycle54-validation/` as local proof output only; they are gitignored and not release artifact storage.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-54-plan.md`](docs/cycle-54-plan.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-53-plan.md`](docs/archive/cycles/cycle-53-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Native proof report | [`docs/native-shell-proof-cycle-53.md`](docs/native-shell-proof-cycle-53.md) |
| Desktop package report | [`docs/native-desktop-package-cycle-54.md`](docs/native-desktop-package-cycle-54.md) |
| Native packaging Proof 0 | [`docs/native-packaging-proof-0.md`](docs/native-packaging-proof-0.md) |
| Store readiness gates | [`docs/native-store-steam-readiness-checklist.md`](docs/native-store-steam-readiness-checklist.md) |
| Licensing policy | [`LICENSING.md`](LICENSING.md), [`LICENSE`](LICENSE), [`LICENSE-ASSETS`](LICENSE-ASSETS) |
| Changelog | [`CHANGELOG.md`](CHANGELOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
