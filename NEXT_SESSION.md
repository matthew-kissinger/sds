# Next Session - Newsheepdogland first-session readiness

> **Updated:** 2026-06-09
> **For:** Cycle 85 `newsheepdogland-entrance-readiness`.
> **Pickup priority:** Get one real mobile proof for the live Newsheepdogland
> first-session loop, then decide whether Cycle 85 can close or needs another
> state-ownership cleanup pass.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this
file -> [`docs/cycle-85-plan.md`](docs/cycle-85-plan.md) ->
[`docs/hardening/ORCHESTRATION.md`](docs/hardening/ORCHESTRATION.md) if the
work is hardening-related.

`docs/cycle-85-plan.md` is the active cycle plan. Do not treat older
Newsheepdogland handoffs as current unless the repo state confirms them.

## Where It Stands

**Cycle 85 is open.** The shipped proof below is for `v2.2.12` at commit
`2ace6f0`, deployed by GitHub Deploy run `27226644818`.

What changed in `v2.2.12`:

- Newsheepdogland is the default URL-less first-session world.
- Entrance Play waits for game boot before committing the run.
- Returning from Newsheepdogland to Main Menu tears down survival-only UI and
  state before the next Play.
- The service worker treats mutable un-hashed entrance images and terrain files
  as network-first, so stale cached Newsheepdogland assets are overwritten on
  online fetch.
- Newsheepdogland survival boot loads HUD, containment, minimap, and skip
  modules in parallel, and lazy-loads the wolf renderer after the scene body is
  playable.
- WebKit no longer crashes the Play path when audio or gamepad browser APIs are
  unavailable.

Validation already completed for `v2.2.12`:

- Local `git diff --check`, `npm test`, `npm run lint`, `npm run build`,
  cross-browser smoke (`chromium`, `firefox`, `webkit`), deploy-equivalent
  Chromium E2E, and focused Open Country local-only helper all passed.
- GitHub Deploy run `27226644818` passed Test, remote D1 migration, Chromium
  E2E, Pages deploy, and Worker deploy.
- Live `sheepdogsim.com` proof found `assets/main-YccL6roX.js`, service worker
  `BUILD_ID = '1781029228890'`, direct Worker health
  `{"ok":true,"worker":"sds-worker"}`, and Newsheepdogland as the default
  scene after Play.
- Live stale-cache proof seeded fake cached entries and verified online fetch
  overwrote them:
  - `/terrain/newsheepdogland.bin`: `4` bytes stale -> `4,194,304` bytes fresh.
  - `/assets/scenes/entrance/newsheepdogland.webp`: `11` bytes stale ->
    `195,732` bytes fresh.
- Live loop proof passed: `Play -> Pause -> Main Menu -> Play` returned to
  Newsheepdogland, cleared `dayLoop`, `_survivalRun`, `_wolfPack`, and minimap
  on menu return, then rebuilt them on the second Play.

## Current Repo Caution

At this handoff, local `main` may contain hardening commits after `v2.2.12`.
Those commits are not part of the live deploy proof above unless they have since
been pushed and the deploy proof has been refreshed. Check:

```bash
git status --short --branch
git log --oneline --decorate -8
```

Do not claim live production proof for commits newer than `2ace6f0` until their
own GitHub Deploy and live Pages/Worker checks pass.

## Open Carryover

- **Real mobile proof remains open.** This run found no authorized ADB device
  and no BrowserStack/Android/iOS credentials in the environment. Chromium
  mobile emulation passed, but it is not the required real mobile acceptance.
- The actual phone proof should cover the live `https://sheepdogsim.com/`
  default path: first Play, terrain-safe spawn, visible mobile controls/HUD,
  pause/Main Menu, second Play, and no stale asset/cache behavior.
- If real mobile is still unavailable, continue simplifying first-session state
  ownership locally, but do not close Cycle 85 or this goal.

## Working Contract

- Preserve the Cycle 85 scope in [`docs/cycle-85-plan.md`](docs/cycle-85-plan.md).
- Do not regenerate sim-baseline goldens for this cycle.
- Do not edit frozen `shared/` files outside explicit cycle-plan acceptance.
- Agent-launched Vite/Playwright must set `SDS_SUPPRESS_BROWSER_OPEN=1`; close
  every page/browser and stop local listeners after probes.
- When release proof matters, verify Pages (`https://sheepdogsim.com/`) and the
  direct Worker (`https://sds-worker.matt-m-kissinger.workers.dev/healthz`)
  separately.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-85-plan.md`](docs/cycle-85-plan.md) |
| Hardening program | [`docs/hardening/ORCHESTRATION.md`](docs/hardening/ORCHESTRATION.md) |
| Release log | [`CHANGELOG.md`](CHANGELOG.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Service worker cache policy | [`public/sw.js`](public/sw.js) |
| Entrance world default | [`js/components/entrance/worlds.ts`](js/components/entrance/worlds.ts) |
