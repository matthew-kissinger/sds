# Next Session - Steam/Desktop Store Prep Intake

> **Updated:** 2026-06-04
> **For:** Post-Cycle-54 pickup. No active numbered cycle is open.
> **Pickup priority:** Open a focused Steam/desktop store-prep cycle if PC release is still the priority. Start from [`docs/archive/cycles/cycle-54-plan.md`](docs/archive/cycles/cycle-54-plan.md), [`docs/native-desktop-package-cycle-54.md`](docs/native-desktop-package-cycle-54.md), and [`docs/native-store-steam-readiness-checklist.md`](docs/native-store-steam-readiness-checklist.md).

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/archive/cycles/cycle-54-plan.md`](docs/archive/cycles/cycle-54-plan.md) -> [`docs/native-desktop-package-cycle-54.md`](docs/native-desktop-package-cycle-54.md) -> [`docs/native-store-steam-readiness-checklist.md`](docs/native-store-steam-readiness-checklist.md) -> [`docs/native-shell-proof-cycle-53.md`](docs/native-shell-proof-cycle-53.md).

Cycle 54 is closed and deployed. Do not touch `shared/` or sim-baseline goldens for store-prep work unless a new cycle plan explicitly authorizes it; the next likely cycle should package and validate the existing native `dist/` through the Electron distributor path without changing core gameplay architecture.

## Where It Stands

**Cycle 53 closed 2026-06-03 as `native-shell-proof-1`.** The archived plan is [`docs/archive/cycles/cycle-53-plan.md`](docs/archive/cycles/cycle-53-plan.md), and the proof report is [`docs/native-shell-proof-cycle-53.md`](docs/native-shell-proof-cycle-53.md). SDS has a green native preflight, a packaged Windows Electron proof, and a Capacitor Android debug APK proof without changing the core web game architecture.

**Cycle 54 closed 2026-06-04 as `native-desktop-package-1`.** The archived plan is [`docs/archive/cycles/cycle-54-plan.md`](docs/archive/cycles/cycle-54-plan.md), and the proof report is [`docs/native-desktop-package-cycle-54.md`](docs/native-desktop-package-cycle-54.md). The Windows Electron distributor path now builds installer, portable, and unpacked outputs with app identity, icon, signing-ready posture, logs/crash paths, packaged WebGL/WebGPU proof, and native resize proof.

**Renderer status is green for the packaged Windows desktop path.** Cycle 54's Electron package passes explicit WebGL and true production WebGPU from the packaged executable. Both reports cover app protocol boot, gameplay HUD, sheep startup motion, fullscreen, native window resize, pointer lock, audio unlock, storage, virtual gamepad API, Worker health, authenticated SDS WebSocket, logs/crash paths, and zero fatal console errors. Capacitor Android remains proof-level: explicit WebGL passed on an API 35 emulator; explicit WebGPU detected the API but fell back to WebGL because no adapter was available. True mobile WebGPU and mobile store readiness are still not claimed.

**`v2.2.0` is the forward-only license transition release.** Current source is AGPL-3.0-or-later. Current non-code assets are CC BY-SA 4.0. Earlier versions retain the license terms recorded in their historical commits, tags, and releases. The running game has visible AGPL source notices on the about page, start/loading flow, and HUD.

## Recommended Next Cycle

**Suggested slug:** `steam-desktop-store-prep-1`.

**Goal:** Turn the green Cycle 54 desktop distributor proof into a Steam-ready release-candidate lane without pressing any public release controls. By cycle close, SDS should have a signing policy, local install/uninstall QA, a Steam depot dry-run or explicit blocker, store metadata draft, screenshot/capsule asset list, controller/cloud-save/multiplayer policy, and a release-channel decision.

**Implementation surface:** [`native/desktop-electron/`](native/desktop-electron/), store-prep docs, and root npm scripts:

```bash
npm run desktop:install
npm run desktop:dist
npm --prefix native/desktop-electron run proof:webgl
npm --prefix native/desktop-electron run proof:webgpu
```

**Likely phases:**

1. Signing and release-channel decision: signed, unsigned-proof-only, or blocked.
2. Installer and portable QA: clean install, launch, update/reinstall behavior, uninstall, log/crash path, userData cleanup policy.
3. Steam depot dry-run: app launch command, depot layout, build description, offline/online behavior, and no public release action.
4. Store materials: short/long descriptions, capsule/screenshot/trailer needs, tags, OS requirements, privacy/support URLs, language/controller notes.
5. Runtime release preflight: WebGL/WebGPU packaged proof, resize/fullscreen/input/audio/storage/WebSocket proof, and small-window HUD comfort acceptance.

**Generated local artifacts to reuse as the starting point:** `cycle54-validation/desktop-electron/artifacts/win-unpacked/Sheep Dog Simulator.exe`, `SheepDogSimulator-2.2.0-setup-x64.exe` (242,122,782 bytes), and `SheepDogSimulator-2.2.0-portable-x64.exe` (218,431,930 bytes). Local Authenticode status is `NotSigned` by design.

**Latest proof reports:** `cycle54-validation/desktop-electron/reports/desktop-electron-proof-webgl.json` and `cycle54-validation/desktop-electron/reports/desktop-electron-proof-webgpu.json` are green. The latest WebGL report was captured at `2026-06-04T03:31:29.259Z`; the latest WebGPU report was captured at `2026-06-04T03:30:57.983Z`.

## Working Contract

- Do not reopen Worker auth from the stale Cycle 53 security stub. [`docs/audit-roadmap-2026-05.md`](docs/audit-roadmap-2026-05.md) records P-SEC-1 through P-SEC-5 as shipped on 2026-06-01.
- Do not touch `shared/` or sim-baseline goldens for native packaging unless the new cycle plan explicitly authorizes it.
- Shell proof code remains under `sandbox/` unless a new cycle plan intentionally promotes or deletes it.
- Treat `cycle53-validation/` and `cycle54-validation/` as local proof output only; they are gitignored and not release artifact storage.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | None open; next recommended cycle is `steam-desktop-store-prep-1` |
| Latest closed cycle | [`docs/archive/cycles/cycle-54-plan.md`](docs/archive/cycles/cycle-54-plan.md) |
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
