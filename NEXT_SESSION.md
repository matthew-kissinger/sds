# Next Session - Cycle 54 Intake

> **Updated:** 2026-06-03
> **For:** Post-`v2.2.0` release handoff; Cycle 54 is not drafted yet.
> **Pickup priority:** Choose the next native/store-readiness direction with Matt, then draft `docs/cycle-54-plan.md` from `docs/CYCLE_TEMPLATE.md` before coding.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/BACKLOG.md`](docs/BACKLOG.md) -> [`docs/native-shell-proof-cycle-53.md`](docs/native-shell-proof-cycle-53.md) -> [`docs/native-store-steam-readiness-checklist.md`](docs/native-store-steam-readiness-checklist.md).

There is no active root `docs/cycle-N-plan.md` after the `v2.2.0` close. Open Cycle 54 only after the next goal is selected.

## Where It Stands

**Cycle 53 closed 2026-06-03 as `native-shell-proof-1`.** The archived plan is [`docs/archive/cycles/cycle-53-plan.md`](docs/archive/cycles/cycle-53-plan.md), and the proof report is [`docs/native-shell-proof-cycle-53.md`](docs/native-shell-proof-cycle-53.md). SDS now has a green native preflight, a packaged Windows Electron proof, and a Capacitor Android debug APK proof without changing the core web game architecture.

**Renderer status is split by shell.** Electron on this Windows host passed explicit WebGL and true production WebGPU from the packaged executable. Capacitor Android passed explicit WebGL on an API 35 emulator; explicit WebGPU detected the API but fell back to WebGL because no adapter was available. That is a clean fallback proof, not true mobile WebGPU readiness.

**`v2.2.0` is the forward-only license transition release.** Current source is AGPL-3.0-or-later. Current non-code assets are CC BY-SA 4.0. All versions up to and including `v2.1.10` were released under MIT and remain available under MIT from their historical commits, tags, and releases. The running game has visible AGPL source notices on the about page, start/loading flow, and HUD.

## Recommended Cycle 54 Choices

Pick one primary direction before writing the plan:

1. **`native-desktop-package-1` if PC/Steam is the priority.** Convert the Electron proof into a real desktop package path: Electron Forge or electron-builder, app identity/icons, Windows artifact target, signing posture, crash/log path, fullscreen/input/audio/storage/WebSocket proof, startup/memory/frame budgets, and Steam prep checklist.
2. **`native-android-store-hardening-1` if mobile is the priority.** Convert the Capacitor proof into store hardening: release build/AAB, signing path, physical Android proof, audio unlock, persistence, offline/online behavior, Worker/WebSocket proof, orientation/fullscreen policy, renderer fallback policy, and performance budgets.
3. **Non-native backlog if the release needs a pause.** Good candidates are object-impostor Cycle B, pastoral asset work with Pixel Forge, or an e2e-local-close-gate pass so deploy-only browser tests stop surprising release close.

## Working Contract

- Do not reopen Worker auth from the stale Cycle 53 security stub. [`docs/audit-roadmap-2026-05.md`](docs/audit-roadmap-2026-05.md) records P-SEC-1 through P-SEC-5 as shipped on 2026-06-01.
- Do not touch `shared/` or sim-baseline goldens for native packaging unless the new cycle plan explicitly authorizes it.
- Shell proof code remains under `sandbox/` unless the chosen Cycle 54 goal intentionally promotes it into production packaging.
- Treat `cycle53-validation/` as local proof output only; it is gitignored and not release artifact storage.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | None drafted after `v2.2.0` close |
| Latest closed cycle | [`docs/archive/cycles/cycle-53-plan.md`](docs/archive/cycles/cycle-53-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Native proof report | [`docs/native-shell-proof-cycle-53.md`](docs/native-shell-proof-cycle-53.md) |
| Native packaging Proof 0 | [`docs/native-packaging-proof-0.md`](docs/native-packaging-proof-0.md) |
| Store readiness gates | [`docs/native-store-steam-readiness-checklist.md`](docs/native-store-steam-readiness-checklist.md) |
| Licensing policy | [`LICENSING.md`](LICENSING.md), [`LICENSE`](LICENSE), [`LICENSE-ASSETS`](LICENSE-ASSETS) |
| Changelog | [`CHANGELOG.md`](CHANGELOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
