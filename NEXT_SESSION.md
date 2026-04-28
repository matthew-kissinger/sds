# Next Session — Cycle 11 (`release-finish`) ready to start

> Updated 2026-04-27. Active plan: [`docs/cycle-11-plan.md`](docs/cycle-11-plan.md) — drafted, six phases, picks up Cycle 10's deferred carryover. Last closed: [`docs/archive/cycles/cycle-10-plan.md`](docs/archive/cycles/cycle-10-plan.md). Cold-start agents: read this page top-to-bottom, then [`docs/cycle-11-plan.md`](docs/cycle-11-plan.md), then [`docs/BACKLOG.md`](docs/BACKLOG.md). Earlier cycles: [`docs/archive/cycles/cycle-9-plan.md`](docs/archive/cycles/cycle-9-plan.md), [`docs/archive/cycles/cycle-8-plan.md`](docs/archive/cycles/cycle-8-plan.md).

## Where the project stands (2026-04-27)

- `sheepdogsim.com` is live on Cloudflare Pages + Worker + DO + D1.
- **Cycle 10 (`release-polish`) closed 2026-04-27.** Mixed completion: full on Phases 3, 5 (most), 6 (code), 7. Partial on Phases 1, 2, 4. Deferred items in `BACKLOG.md` carryover. Headlines: scene-lifecycle plumbing on `SheepDogSimulation` (`swapScene`, `disposeScene`, `rebuildScene`, `restartToMenu` — bodies still hard-reload, callsites routed), AbortController-tracked window-listener teardown closes the leak class, effects-family disposal, `?cinematic=1` infra with `window.__sdsCinema` API + `?ui=off` + `?sun` URL params, cinematic shot list + runner scaffold (`npm run cinema`, Playwright/ffmpeg drive deferred), PWA manifest + CHANGELOG + PRESSKIT, score-integrity worker code (cross-field plausibility + anomaly detection + migration `0003_score_anomalies.sql`), electron-readiness research doc.
- **111/111 vitest pass.** Production build clean. Worker typecheck clean. Sim-baseline byte-identical (preserved through cycles 5-10).
- **Cycle 11 (`release-finish`) plan drafted.** Six phases — finish the in-process scene swap (Phase 1), UI polish completion (Phase 2), real cinematic filming (Phase 3), score-integrity prod migration (Phase 4), release tail incl. v1.0.0 tag (Phase 5), deferred playtest walkthrough (Phase 6).

## What to pick up next

Run `/cycle-start` to orient on Cycle 11. Phase 1 (in-process scene swap flip) is the long pole — picks up directly from Cycle 10's Step 1 plumbing. The plumbing is in place + listener-leak-safe + sim-baseline byte-identical, so Phase 1's actual flip is unblocked. Everything else can run in parallel branches once Phase 1 is in motion.

## Cycle 10 → 11 carryover (deferred items)

Per `BACKLOG.md` close entry — list here for fast-recall:

1. **Phase 1 in-process flip (Cycle 10 carryover, becomes Cycle 11 Phase 1).** Step 1 plumbing shipped; AbortController + effects disposal in `disposeScene()`. Remaining: terrain/water/atmosphere/sheep+dog disposal, `<SceneSwapOverlay>` React component, defensive null-checks in `animate()`, `history.replaceState`, MP guest WS strategy Q1, stress test + visual regression. Estimated 8-12 hours.
2. **Phase 2 UI polish remainder.** Mode-shaped HUD (Solo/Timed/Competitive variants), onboarding re-trigger, real dog PNG thumbnails (Phase 3 cinematic pipeline produces them), Button unification across React surfaces.
3. **Phase 4 marketing filming runs.** Install ffmpeg, fill in Playwright drive + ffmpeg mux in `tools/cinematic/run.mjs`, iterate shot framing, replace OG images with sub-300 KB WebP at 1200×630.
4. **Phase 5 release tail.** Cloudflare Web Analytics dashboard hookup. `/api/event` worker route. Properly-sized PWA icons (currently reusing favicon.png). `git tag v1.0.0` push.
5. **Phase 6 score-integrity prod migration.** `wrangler d1 migrations apply sds-prod --remote` for `0003_score_anomalies.sql`. Verify anomaly column populates for last 24h post-deploy.
6. **Cycle 9 verification carryover** (still deferred per user direction "I will playtest after release"). Mac rendering bug root cause (debug recipe below). Cycle 9 changed-flow walkthrough. Cycle 8 twice-deferred items.

## Cycle 9 verification recipe (still relevant for Cycle 11 Phase 6)

1. **Mac rendering bug root cause.** Bug does NOT reproduce on GH Actions Safari (verified across two macos-latest runs). Environmental to Matt's specific Mac. Debug recipe:
   - Open https://sheepdogsim.com/?scene=rolling-hills&debug=gl → Solo Play → Confirm → Classic Mode
   - Wait for the white-ground manifestation
   - In Safari devtools console: `window.__sdsCaptureSample('inGame')` then `copy(JSON.stringify(window.__sdsDiag, null, 2))`
   - Compare against working baseline at GH run [25028575425](https://github.com/matthew-kissinger/sds/actions/runs/25028575425).
   - Things to look for: `glErrorsSeen` non-empty? `water.failed` event? `terrain.created` with `sceneFog: false`? `framebuffer.sampled` with `flag: near-white` and ground samples actually white (RGB > 230)?

2. **Cycle 9 changed-flow playtest.** Solo Classic on RH/OC shows `0/200`; MP host's chosen sheepCount sticks; guest joining via invite renders the room's scene; leaderboard solo tab hides the sheep-count dropdown; sheep + dog no longer sink in bare patches (Phase 9.5 +0.05m lift).

3. **Cycle 8 carryover (twice-deferred).** Phase 1 acceptance walkthrough (Insane/Chaos sheep counts, leaderboard partition filters, sandbox cross-scene reload UX, MP at non-200 sheep counts) + Phase 2 MP bandwidth measurement (Q2) + Phase 6 follow-camera triangulation polish reads smooth on RH Follow under stamina-out + tree contact + frametime regression check on RTX 3070 / mobile target.

## Cycle 10 surfaces worth knowing

- **Lifecycle entry points** ([`js/main.js`](js/main.js)): `SheepDogSimulation.swapScene(toId, opts)`, `disposeScene()`, `rebuildScene(sceneDef)`, `restartToMenu()`. All four legacy reload callsites route through these. `_buildSwapUrl(toId, opts)` private helper for URL construction.
- **AbortController-tracked listeners**: `this._sceneAbort` field; the five corral/objective listeners in `init()` (lines 572, 578, 640, 649, 657) attach with `{ signal: this._sceneAbort.signal }`. `disposeScene()` calls `abort()` and re-creates the controller.
- **Cinematic API** ([`js/cinematic.js`](js/cinematic.js)): `?cinematic=1` opts in. `window.__sdsCinema` exposes `camera`, `atmosphere`, `gameState`, `scene`, `renderer` getters + `setSun(t)`, `setCameraPose`, `getCameraPose`, `playPath(keyframes, durationMs)`, `triggerLightning(pos)`, `swapScene`, `captureFrame`, `hideUI`/`showUI`. Companion params: `?ui=off`, `?sun=N` (in `[0..1]`).
- **Score-integrity surface** ([`worker/src/d1.ts`](worker/src/d1.ts)): `submissionScoreBoundsOk` + new `modeSheepCountOk`, `plausibleScoreForCount`, `durationFloorForCount`, `detectScoreAnomalies`. Hard rejects on cross-field plausibility violations; soft-flags via `score_anomalies` JSON column (see migration `0003_score_anomalies.sql`).
- **Cinematic shot list** ([`tools/cinematic/shot-list.mjs`](tools/cinematic/shot-list.mjs)): four video shots + three OG static cards. Driver scaffold at [`tools/cinematic/run.mjs`](tools/cinematic/run.mjs) with `npm run cinema`. Playwright + ffmpeg drive is the unfilled portion.
- **Diag probe** still active (`?debug=gl`, `window.__sdsDiag`, [`js/diagnostics/glProbe.js`](js/diagnostics/glProbe.js)).

## Running locally

First time on a fresh clone:

```
npm install
cp worker/.dev.vars.example worker/.dev.vars   # sets JWT_SECRET for local
npm run dev:setup                              # applies D1 migrations to local sqlite
```

Every session after that:

```
npm run dev    # starts Vite (:3000) + wrangler (:8787) together
```

Granular alternatives: `npm run dev:client` (just Vite), `npm run dev:worker` (just wrangler), `npm run dev:lan` (Vite with `--host` + wrangler).

Open `http://localhost:3000`. URL params: `?scene=field|rolling-hills|open-country`, `?debug=gl` (probe), `?cinematic=1` (filming infra), `?ui=off` (hide React overlay), `?sun=0.5` (sun position).

### Standing risks (carried into Cycle 11)

- **Y-sample regression surface is wide.** A bad heightfield change makes the dog float, sheep sink, grass clip — all simultaneously. Manually verify all three scenes in all three camera modes after any change in this area.
- **Sim-baseline fixtures are one-way.** Don't regenerate without understanding the diff. Cycles 5-10 left them bit-identical. Cycle 11 Phase 1 (in-process scene swap) must preserve this.
- **Scene-coupled GPU resources still leak on reload.** Cycle 10 Phase 1 closed the listener leak; the GPU-resource leak waits on Cycle 11 Phase 1's full disposal pass.
- **`?cinematic=1` flips `preserveDrawingBuffer`.** Documented perf hit. Any change that lets the flag affect normal play is a Hard Stop.

## How to read the rest of the repo

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-11-plan.md`](docs/cycle-11-plan.md) — six phases, picks up Cycle 10 carryover |
| Latest closed cycle | [`docs/archive/cycles/cycle-10-plan.md`](docs/archive/cycles/cycle-10-plan.md) |
| Prior closed cycle | [`docs/archive/cycles/cycle-9-plan.md`](docs/archive/cycles/cycle-9-plan.md) |
| Older cycles | [`docs/archive/cycles/cycle-8-plan.md`](docs/archive/cycles/cycle-8-plan.md), [`docs/archive/cycles/cycle-7-plan.md`](docs/archive/cycles/cycle-7-plan.md), [`docs/cycle-6-plan.md`](docs/cycle-6-plan.md), [`docs/cycle-5-plan.md`](docs/cycle-5-plan.md) |
| Cycle stub template | [`docs/CYCLE_TEMPLATE.md`](docs/CYCLE_TEMPLATE.md) |
| Frozen files / fence rules | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Closed cycles + deferred items | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Slash commands | [`.claude/commands/`](.claude/commands/) — `/cycle-start`, `/cycle-close`, `/validate` |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player CHANGELOG | [`CHANGELOG.md`](CHANGELOG.md) |
| Press kit | [`PRESSKIT.md`](PRESSKIT.md) |
| Electron readiness | [`docs/electron-readiness.md`](docs/electron-readiness.md) |
| How to add a biome | [`docs/adding-a-biome.md`](docs/adding-a-biome.md) |

## What NOT to do

- Don't rearchitect multiplayer. It works.
- Don't reintroduce procedural mountains. If we want a horizon ring later, the right path is a height-displaced skirt that blends into the play-area heightfield.
- Don't add new scenes. Three is the right number.
- Don't touch `shared/MovementPhysics.js`'s `updateMovement` to insert obstacle logic — Cycle 6 deliberately put obstacle force composition at the **call site**.
- Don't blow up `main.js` in one PR. Shrink it one responsibility at a time.
- Don't regenerate `tests/sim-baseline/` fixtures unless you understand exactly what changed and why. Cycles 5-10 preserved them bit-identical.
- Don't hardcode grass-exclusion zones for non-Field scenes. Gate on `sceneDef?.farmHouse` and `sceneDef?.pasture`.
- Don't gate sprint *continuation* on `stamina >= minStaminaToSprint` — only sprint *start*.
- Don't set CSS `transition: all` on stamina/progress bars.
- Don't assume the dome's integrated cloud math is the only cloud system. [`CloudLayer.js`](js/atmosphere/CloudLayer.js) is separate.
- **Cycle 11:** Don't ship an in-game cinematic record UI (carries from Cycle 10 Q2 — Playwright-driven only). Don't implement Electron packaging (Phase 7 of Cycle 10 was research-only). Don't do a from-scratch UI redesign — Phase 2 is unification + carry-over close-out. Don't let `?cinematic=1` flip `preserveDrawingBuffer` on the normal-play codepath.
