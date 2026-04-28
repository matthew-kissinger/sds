# Next Session — Cycle 9 shipped, awaiting playtest verification

> Updated 2026-04-27. Active plan: [`docs/cycle-9-plan.md`](docs/cycle-9-plan.md) — Phases 9.1 — 9.5 shipped in one push, deployed, awaiting playtest + macOS Safari nightly artifact. Last closed: [`docs/archive/cycles/cycle-8-plan.md`](docs/archive/cycles/cycle-8-plan.md). Cold-start agents: read this page top-to-bottom, then the cycle-9 plan §Shipped status, then [`docs/BACKLOG.md`](docs/BACKLOG.md). Earlier cycles: [`docs/archive/cycles/cycle-7-plan.md`](docs/archive/cycles/cycle-7-plan.md), [`docs/cycle-6-plan.md`](docs/cycle-6-plan.md), [`docs/cycle-5-plan.md`](docs/cycle-5-plan.md).

## Where the project stands (2026-04-27)

- `sheepdogsim.com` is live on Cloudflare Pages + Worker + DO + D1.
- **Cycle 9 (`playtest-triage + cross-platform`) shipped.** Seven user-reported bugs from a 2026-04-27 playtest converted into five phases that all landed in one push:
  - **9.1:** Sheep count is owned by mode in solo (Classic=200/Extreme=1000/Insane=3000/Chaos=5000) and by host config in MP. Scene defs lose their authoritative role over `totalSheep` (kept only as a density hint for spawn radius). Fixes the "0/250 on RH Classic" surprise. MP `RoomCreation.sheepCount` plumbed through `MenuController.createRoom`. Leaderboard hides the redundant sheep-count dropdown on solo tabs and resets filters on tab switch.
  - **9.2:** New `ensureSceneMatchesRoom` helper called after every createRoom/joinRoom/quickMatch in [`App.js`](js/components/App.js). Guests with mismatched URL `?scene=` reload via `?scene=<id>#/r/<roomCode>` to re-enter the invite flow on the right scene. Closes the long-standing `MP joiner renderer sync` risk.
  - **9.3:** Cross-platform test infra. Playwright projects: Chromium + Firefox + WebKit. New `e2e` job in [`deploy.yml`](.github/workflows/deploy.yml). New nightly + workflow_dispatch [`macos-safari.yml`](.github/workflows/macos-safari.yml) running real macOS Safari via `safaridriver` + a Selenium runner at [`tests/safari-smoke/run.mjs`](tests/safari-smoke/run.mjs). New WebGL-extensions probe spec. Living doc at [`docs/cross-platform-testing.md`](docs/cross-platform-testing.md).
  - **9.4:** Mac rendering bug (white ground / no sun / no water on RH+OC). Diagnostic probe at [`js/diagnostics/glProbe.js`](js/diagnostics/glProbe.js) gated on `?debug=gl` — dumps GL context, RT events, post-first-frame framebuffer sample to `window.__sdsDiag`. Water init wrapped in try/catch in [`main.js`](js/main.js). DepthPrePass per-frame render wrapped in `_safeRender`. Speculative shader fixes deferred until Safari nightly artifact lands.
  - **9.5:** New [`Heightfield.surfaceY(x, z)`](shared/terrain/Heightfield.js) = `sample + 0.05` lift for visual entity placement. Sheep + dog use it for InstancedMesh/mesh Y; sim still uses raw `sample`. Sim baseline byte-identical. Full mesh-aligned bake deferred to [`BACKLOG.md`](docs/BACKLOG.md).
- 111/111 vitest pass. Production build clean. Sim-baseline byte-identical (preserved through cycles 5-9).

### Outstanding before Cycle 9 closes

1. **Q3 (Mac bug root cause) — bug does NOT reproduce on GH Actions Safari.** Two macOS Safari nightly runs landed (artifacts [25023642777](https://github.com/matthew-kissinger/sds/actions/runs/25023642777) and [25028575425](https://github.com/matthew-kissinger/sds/actions/runs/25028575425)). On the macos-latest runner, **Field, Rolling Hills, and Open Country all render correctly in-game** — green terrain, sheep, HUD, no white-out. Real Safari 26.3 + Apple Inc / Apple GPU + WebGL2 + ACES Filmic + every required extension present, no GL errors, water + depthPrePass both create successfully, terrain shader compiles after `scene.fog` is bound. The bug is **environmental to Matt's specific Mac** (likely an Intel-Mac + older Safari + work-laptop driver combination). All four hypotheses we shipped diagnostics for (FBM precision, render-target alloc, compile-order race, extension gap) are ruled out on a stock macOS-latest runner.

   **Tomorrow's debug recipe (run on Matt's Mac):**
   - Open https://sheepdogsim.com/?scene=rolling-hills&debug=gl → Solo Play → Confirm → Classic Mode
   - Wait for the bug to manifest (white ground, no sun, no water)
   - Open Safari devtools console
   - Run: `window.__sdsCaptureSample('inGame')` — captures a labeled framebuffer sample now
   - Run: `copy(JSON.stringify(window.__sdsDiag, null, 2))` — full diag to clipboard
   - Paste into Slack/email/file. Compare to the working baseline at [`/tmp/safari-smoke-2/summary.json`](https://github.com/matthew-kissinger/sds/actions/runs/25028575425) (download via `gh run download 25028575425 --name safari-smoke`).
   - Things to look for in the diff: `glErrorsSeen` non-empty? `water.failed` event? `terrain.created` with `sceneFog: false`? `framebuffer.sampled` with `flag: near-white` and ground samples actually white (RGB > 230)?

2. **User playtest of the changed flows.** Solo Classic on RH/OC shows `0/200`. MP host's chosen sheepCount sticks. Guest joining via invite renders the room's scene. Leaderboard solo tab hides the sheep-count dropdown. Sheep + dog no longer sink in bare patches.

3. **Cycle 8 carryover items** (untouched in this session): Phase 1 acceptance walkthrough + Phase 2 MP bandwidth measurement (Q2). Carry into Cycle 10 if not picked up before close.

### Diagnostic surface (for tomorrow)

- `?debug=gl` — installs the diagnostic probe; `window.__sdsDiag` populated.
- `window.__sdsCaptureSample(label)` — synchronous on-demand framebuffer sample with a label; returns the captured `{label, samples, avg, flag}` object.
- Diag stream events worth grepping: `atmosphere.fog.attached`, `atmosphere.preset.applied`, `terrain.created` (sceneFog bool), `sunBillboard.created`, `renderTarget.depthPrePass`, `water.created` / `water.failed`, `gl.error` (drained once/sec), `framebuffer.sampled`.
- Probe code: [`js/diagnostics/glProbe.js`](js/diagnostics/glProbe.js).
- Safari smoke runner: [`tests/safari-smoke/run.mjs`](tests/safari-smoke/run.mjs). Trigger with `gh workflow run macos-safari.yml`.

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

Open `http://localhost:3000` (or `:3001` if :3000 is taken). `?scene=field`, `?scene=rolling-hills`, `?scene=open-country` to skip the picker.

### Cycle 8 carry-over (deferred to Cycle 9 verification)

All Cycle 8 phases shipped code. Most acceptance items are *playtest-confirmed*, deferred to Cycle 9 Phase 1:

1. **Insane / Chaos modes spawn correctly on each scene.** Cluster-aware spawn + density-driven radius scaling shipped in [`js/OptimizedSheep.js`](js/OptimizedSheep.js); needs the 12-cell repro matrix on (Field/RH/OC × Classic/Extreme/Insane/Chaos).
2. **Insane / Chaos leaderboards populate cleanly, no soloClassic pollution.** `SOLO_MODE_TO_LEADERBOARD` lookup shipped in [`js/GameState.js`](js/GameState.js); `soloInsane` / `soloChaos` added to [`worker/src/d1.ts`](worker/src/d1.ts) `GameMode` union.
3. **Per-(mode × scene × sheepCount) partition filters return the right rows.** `getLeaderboard` accepts `{sceneId, sheepCount}` filters; UI selectors in [`GlobalLeaderboard.js`](js/components/Multiplayer/GlobalLeaderboard.js) drive them.
4. **Sandbox launches cleanly on RH and OC.** Cross-scene reload via `?scene=X#s/<encoded>`; scene-deferred start path in [`js/main.js:startSandboxGame`](js/main.js) and [`js/GameState.startSandboxGame`](js/GameState.js).
5. **MP at non-200 sheep counts (cap 1000).** [`worker/src/RoomDO.ts`](worker/src/RoomDO.ts) `RoomMeta` extended; [`worker/src/GameSim.js`](worker/src/GameSim.js) reads `room.sheepCount`. Q4 bandwidth measurement is Cycle 9 Phase 2.
6. **Phase 6 follow-camera triangulation polish.** Interior-only ridge sampling (STEPS 6→12), asymmetric `smoothedFloorY` smoothing (snap up, ease down), `_lastValidFacing` tracking in [`js/CameraController.js`](js/CameraController.js).
7. **Cycle 6 + 7 playtest items 1-6** (originally Phase 1; never explicitly walked).
8. **No frametime regression on RTX 3070 / mobile target.**

### Standing risks (carried)

- **Y-sample regression surface is wide.** A bad heightfield change makes the dog float, sheep sink, grass clip — all simultaneously. After any change in this area, manually verify all three scenes in all three camera modes.
- **MP joiner renderer sync.** Joiners whose URL-param scene differs from the room's see correct sim but mismatched visuals. Carried over.
- **Sim-baseline fixtures are one-way.** Don't regenerate without understanding the diff. Cycles 5-8 left them bit-identical — the byte-preserved rect path in `BoundaryCollision`, the `obstacles.trees.length > 0` guard in OptimizedSheep, and the count-aware spawn radius gate (preserves Field-200) are the contracts that let this hold.

## How to read the rest of the repo

| Area | Source of truth |
|---|---|
| Active cycle (scaffolded) | [`docs/cycle-9-plan.md`](docs/cycle-9-plan.md) — needs Goal + Phases filled in |
| Latest closed cycle | [`docs/archive/cycles/cycle-8-plan.md`](docs/archive/cycles/cycle-8-plan.md) — see §Shipped status |
| Prior closed cycle | [`docs/archive/cycles/cycle-7-plan.md`](docs/archive/cycles/cycle-7-plan.md), summary in [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Older cycles | [`docs/cycle-6-plan.md`](docs/cycle-6-plan.md), [`docs/cycle-5-plan.md`](docs/cycle-5-plan.md) |
| Cycle stub template | [`docs/CYCLE_TEMPLATE.md`](docs/CYCLE_TEMPLATE.md) |
| Frozen files / fence rules | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Closed cycles + deferred items | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Slash commands | [`.claude/commands/`](.claude/commands/) — `/cycle-start`, `/cycle-close`, `/validate` |
| Cycle 4 Hardening | [`docs/cycle-4-hardening.md`](docs/cycle-4-hardening.md) |
| Cycle 4 Phase A plan | [`docs/cycle-4-plan.md`](docs/cycle-4-plan.md) |
| Cycle 4 Phase B integration | [`docs/cycle-4-phase-b.md`](docs/cycle-4-phase-b.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| What Cycle 2 shipped | [`docs/cycle-2-report.md`](docs/cycle-2-report.md) |
| How to add a biome | [`docs/adding-a-biome.md`](docs/adding-a-biome.md) |
| Prior postmortem | [`docs/archive/POSTMORTEM.md`](docs/archive/POSTMORTEM.md) |

## What NOT to do

- Don't rearchitect multiplayer. It works.
- Don't reintroduce procedural mountains. If we want a horizon ring later, the right path is a height-displaced skirt that blends into the play-area heightfield, not the annulus shader.
- Don't add new scenes. Three is the right number.
- Don't touch `shared/MovementPhysics.js`'s `updateMovement` to insert obstacle logic — Cycle 6 deliberately put obstacle force composition at the **call site** (`OptimizedSheep`, `Sheepdog`, future Worker `GameSim`) so MovementPhysics stays a pure-functions library.
- Don't blow up `main.js` in one PR. Shrink it one responsibility at a time.
- Don't regenerate `tests/sim-baseline/` fixtures unless you understand exactly what changed and why. Cycle 5 + 6 + 7 preserved them bit-identical.
- **Cycle 7:** Don't hardcode grass-exclusion zones for non-Field scenes. The pasture/farmHouse rect was hardcoded for *every* scene before, which left bare patches on RH/OC. Now gated on `sceneDef?.farmHouse` and `sceneDef?.pasture`.
- **Cycle 7:** Don't gate sprint *continuation* on `stamina >= minStaminaToSprint` — only sprint *start*. The state machine separates `canStartSprint` (≥10) from `canContinueSprint` (>0); merging them creates the oscillation-around-threshold bug that hides exhaustion entirely.
- **Cycle 7:** Don't set CSS `transition: all` on stamina/progress bars. Width must be instant; only color/glow should animate. Otherwise the bar lags the percentage text by the transition duration.
- **Cycle 7:** Don't assume the dome's integrated cloud math is the only cloud system. [`CloudLayer.js`](js/atmosphere/CloudLayer.js) is a separate planar mesh with its own shader. Both can produce horizontal-line artifacts at low elevation angles; verify the right one when debugging sky seams.
