# Cycle 24 Phase 1 — lobby lifecycle test coverage

Phase closed 2026-05-05. **30/30 specs green across Chromium + Firefox + WebKit** locally (3.1 min).

## What landed

- **`window.__sdsMpProbe()`** — read-only multiplayer probe global, gated on `?mpProbe=1` or `?perfMode=1`. Exposes `{ playerId, peers, roomCode, roomState, sheepCount, gameMode, isHost, connected, ... }`. Installed in `SheepDogSimulation` constructor right after `MenuController` so it survives later constructor-step failures (e.g. WebKit `AudioManager`). Mirrors the existing `__sdsSwapProbe` pattern.

- **`?testNoCanvas=1` URL flag** — skips heavy 3D init + the animate loop so two-tab MP tests don't compete for GPU/CPU. Without this, parallel scene init on swiftshader stalls React renders behind rAF and tests time out at the 30s+ mark. React UI + `NetworkManager` still mount normally.

- **`tests/e2e/mp/_helpers.ts`** — Playwright helpers: `seedIdentity`, `bootApp`, `navigateToMultiplayer`, `createRoomAsHost`, `joinRoomByCode`, `bootViaInvite`, `leaveLobby`, `getMpProbe`, `waitForRoomState`, `withMpContext`. Each call opens a fresh `browser.newContext()` per the scene-swap-stability lesson (sharing a context shares localStorage, breaking identity setup).

- **3 new Playwright projects** in `playwright.config.ts`: `mp`, `mp-firefox`, `mp-webkit`. Each `testMatch: '**/mp/*.spec.ts'`. The original `chromium`/`firefox`/`webkit` projects `testIgnore` the MP folder so MP specs don't run twice.

- **4 spec files** under `tests/e2e/mp/`:
  - `lobby-lifecycle.spec.ts` — host create, guest join by code, guest leave, host migration, solo host teardown (4 tests)
  - `lobby-invite-link.spec.ts` — `#/r/CODE` URL routing (1 test)
  - `sheep-cap-allow-list.spec.ts` — worker accepts 3000/5000, amber warning toggles (3 tests)
  - `cinematic-strip.spec.ts` — `?cinematic=1` strip on invite hash, no-op when no hash (2 tests)

## Findings

Real bugs and fragility surfaced by the new specs:

1. **`NetworkManager.hostChanged` overwrites `nm.isHost` from a hardcoded `false`.** [`js/NetworkManager.js:213`](../../js/NetworkManager.js) sets `this.isHost = !!msg.isHost`, but the worker's `RoomDO.handlePlayerLeave` broadcasts `isHost: false` as a generic placeholder meant for per-recipient interpretation ([`worker/src/RoomDO.ts:574`](../../worker/src/RoomDO.ts)). After host migration, every client (including the new host) ends up with `nm.isHost === false`. The probe works around this by deriving `isHost` from the authoritative `room.players[me].isHost`. **The handler bug is still in production code** — it should derive from `msg.newHostId === this.playerId`. Cycle 24 follow-up.

2. **`AudioManager` constructor crashes the whole game on engines without `AudioContext`.** Playwright-WebKit doesn't expose `window.AudioContext` or `webkitAudioContext`, so `new AudioManager(...)` threw before `setGameInstance(this)` ran, which left React unable to reach `NetworkManager`. Wrapped in try/catch — failure now logs and runs silent. This also defends against any production Safari profile that disables audio.

## Acceptance

- [x] 8-10 specs green (Phase 1 plan asked for 8-10; landed 10)
- [x] All green on local Playwright across Chromium/WebKit/Firefox
- [x] Hard stop "WebKit-specific failure" — none gating after the AudioManager guard

## Validation artifacts

- `chromium-run.log` — Chromium-only run (10/10, 56.7s)
- `cross-engine-run.log` — full 3-engine run (30/30, 3.1 min)
