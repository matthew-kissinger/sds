# Cycle 85 Plan - Newsheepdogland Entrance Readiness

## Goal

Make Newsheepdogland a clean, repeatable first-session loop by owning the path
from entrance to play to pause/exit to return, keeping mutable entrance assets
network-fresh, and bounding default scene build cost so the first Play click
feels immediate enough for playtesting.

## Scope

- Newsheepdogland is the default entrance world.
- Entrance Play must not be dropped while the engine is still booting.
- Returning to the menu from a survival run must tear down survival-only UI and
  state before the next Play.
- Mutable un-hashed assets used by the entrance and terrain must update through
  the Service Worker instead of sticking stale cache entries.
- The default Newsheepdogland render budget may be reduced for first-session
  readiness, provided the change is render-only and sim state remains unchanged.
- Newsheepdogland day-loop boot wiring may be reordered so client-only HUD,
  pen, survival, minimap, and skip modules load in parallel. The wolf renderer
  may be lazy-loaded after scene body completion because wolves are not needed
  for the first playable morning frame.

## Acceptance

- `shared/scenes/newsheepdogland.js` may be edited for render-only grass/tree
  budget fields. No sim-baseline golden update is accepted for this cycle.
- The default Newsheepdogland grass budget stays under the configured test guard.
- The `main-*.js` bundle ratchet may move from 592 KiB to 593 KiB for the
  entrance boot/cache ownership code already measured in this cycle; `three`
  must stay unchanged at 604 KiB.
- Local gates pass: `git diff --check`, focused cache/tree/scene Vitest, full
  `npm test`, `npm run lint`, `npm run build`, focused Newsheepdogland Chromium
  E2E, and full Chromium E2E.
- GitHub Deploy passes Test, E2E Chromium, D1 migration, Worker deploy, and Pages
  deploy.
- Live proof on `sheepdogsim.com` verifies the new bundle, direct Worker health,
  Newsheepdogland as the default entrance, stale mutable cache overwrite, and
  repeat Play -> pause -> Main Menu -> Play behavior.
- A real mobile pass is still required before calling the playtest loop fully
  ready. If no physical or hosted mobile device is available in the run, record
  that as the remaining blocker.

## Local Validation

- 2026-06-09 v2.2.12: `git diff --check`, full `npm test`, `npm run lint`,
  `npm run build`, cross-browser smoke
  (`chromium`, `firefox`, `webkit`), GitHub Deploy-equivalent Chromium E2E
  (`--grep-invert='@local-only'`), and the focused Open Country local-only
  objective helper passed locally.

## Hosted And Live Validation

- 2026-06-09 v2.2.12 commit `2ace6f0`: GitHub Deploy run `27226644818`
  passed Test, remote D1 migration, Chromium E2E, Pages deploy, and Worker
  deploy.
- Live Pages root served `assets/main-YccL6roX.js`; `sw.js` served
  `BUILD_ID = '1781029228890'`; direct Worker health returned
  `{"ok":true,"worker":"sds-worker"}`.
- Live stale-cache proof seeded fake cache entries and verified network-first
  replacement:
  - `/terrain/newsheepdogland.bin`: `4` bytes stale -> `4,194,304` bytes fresh.
  - `/assets/scenes/entrance/newsheepdogland.webp`: `11` bytes stale ->
    `195,732` bytes fresh.
- Live loop proof passed: default `Play` entered Newsheepdogland with
  `dayLoop`, `_survivalRun`, `_wolfPack`, and minimap active; `Pause -> Main
  Menu` cleared them; second `Play` rebuilt them.
- Real mobile remains the only unproven acceptance item. This run found no
  authorized ADB device and no BrowserStack/Android/iOS credentials in the
  environment.
