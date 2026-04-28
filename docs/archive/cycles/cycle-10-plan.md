# Cycle 10 — `release-polish`

> Drafted 2026-04-27 after Cycle 9 (`playtest-triage + cross-platform`) shipped (close pending macOS Safari debug + playtest verification). Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Context

Sheep Dog Sim is live at `sheepdogsim.com` and has matured through nine technical cycles. This cycle moves it from "feature-complete prototype" toward "shippable, marketable v1.0 product." It is **release polish**, not new gameplay. Five concrete drivers, all surfaced from the user's 2026-04-27 retrospective:

1. **Scene-switch reload feels jarring.** Today every cross-scene transition is a `window.location.href = ?scene=X` reload (Cycle 8 design choice — heightfield + terrain too coupled to swap mid-session). The user perceives this as "a weird refresh trigger" and wants it to feel like an in-app transition. Verified callsites: [`js/components/StartScreen/ScenePicker.js:20-26`](../js/components/StartScreen/ScenePicker.js), [`js/components/App.js:305-312`](../js/components/App.js) (`handleStartSandbox`), [`js/components/App.js:363-370`](../js/components/App.js) (`ensureSceneMatchesRoom`), [`js/components/App.js:952`](../js/components/App.js) (`handleMainMenu`).
2. **UI/UX is functional but not polished.** Cycle 3 carry-over (mode-shaped HUD profile, onboarding overlay, button-style unification, real dog PNG thumbnails) is still open in [`BACKLOG.md`](BACKLOG.md). Glass-morphic primary buttons coexist with hardcoded inline-style completion overlays.
3. **No marketing content pipeline.** OG images exist (`/assets/images/sds-zoomedin-play.png` etc., ~3.7 MB each) but predate Cycle 7 sky/water/sun polish, OC portal, and lightning retirement. The user wants directed cinematic shots — sunset dog walks, lightning strikes, 5000-sheep chaos, orbital cameras — captured by agents and saved as files for marketing.
4. **Release-prep gaps.** No PWA manifest, no analytics, no git tags, [`package.json`](../package.json) says v1.0.0 but no changelog, no press kit. SEO metadata itself is excellent (full OG/Twitter/JSON-LD/hreflang/sitemap/SW/robots) — what's missing is the polish layer around it.
5. **Score integrity is weak.** Client derives the score; server only bounds-checks. Fine for casual play but increasingly visible as the leaderboard becomes a marketing surface ([`worker/src/d1.ts:167-172`](../worker/src/d1.ts) bounds; [`js/GameState.js:1176`](../js/GameState.js) submission).

**Out of scope this cycle (explicit user direction):** Electron packaging implementation (research-only doc). New scenes. Multiplayer rearchitect. WebGPU migration.

## Goal

Ship the polish layer that turns the live prototype into a marketable v1.0 release. **User-visible after:** scene transitions are smooth in-process swaps with branded loading overlay; all primary UI surfaces share one button system; cinematic capture pipeline produces marketing assets on demand; the site has a PWA manifest + analytics + v1.0.0 tag + player CHANGELOG; score submissions get server-side plausibility validation. In-process scene swap is the centerpiece (highest user-perceived impact); the rest is unblockers and content.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code. The ecosystem evolves; what was "the" solution last cycle may not be optimal now.
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile) before committing to a technique. Use `PerformanceMonitor` and the per-system triangle breakdown.
- **Pick the simplest thing that meets the budget** rather than the most impressive. If the simple version reads correctly, ship it; escalate only on demonstrated need.

## Open questions to resolve before writing code

1. **Q1: MP guest scene-swap WS strategy.** Option C-1 (drop room → swap → rejoin) vs Option C-2 (keep WS open across swap, gate handlers on `swapping !== true`). Author lean: **C-2**, contingent on verifying in [`worker/src/RoomDO.ts`](../worker/src/RoomDO.ts) that nothing scene-specific is sent at join/post-join.
2. **Q2: In-game cinematic UI yes/no.** User picked "Playwright-driven automation" — confirms scriptable globals are required. Author lean: **no in-game record button** in this cycle (saves ~2 days of UI work). Reopen if future feedback wants it.
3. **Q3: Analytics provider.** Plausible (paid, privacy-friendly) vs Cloudflare Web Analytics (free, already on platform) vs custom event log to D1. Author lean: **Cloudflare Web Analytics** (zero code, dashboard via Pages console) + custom event log to D1 for game-specific events (mode_selected, game_completed, scene_swapped).
4. **Q4: Score-integrity approach.** (a) bounds tightening + anomaly flags only; (b) full server-side replay validation from input log; (c) telemetry-driven heuristics (sheep-position samples submitted with score). Author lean: **(a)+(c) in Phase 10.6**; (b) deferred unless leaderboard cheating becomes visible.

## Architecture / shared changes

**Scene lifecycle primitive (Phase 10.1).** A new `SheepDogSimulation.swapScene(toId, opts)` method becomes the canonical scene-transition entry point. It owns `disposeScene()` (drains all scene-coupled GPU + listener state) and `rebuildScene(sceneDef)` (the extracted reusable form of [`js/main.js:444-753`](../js/main.js) `init()`). All four legacy reload callsites migrate to it. Failure mode falls back to `location.href = ?scene=X`. Documented in `ARCHITECTURE.md` at cycle close; entry point name added to [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).

**Cinematic surface (Phase 10.3).** `?cinematic=1` URL flag opts in to: `preserveDrawingBuffer: true`, exposed `window.__sdsCinema = { camera, atmosphere, effects, gameState, swapScene, hideUI, showUI }`. Default-off so normal play is unaffected. Companion flags: `?ui=off`, `?sun=<0..1>`, `?mode=chaos`.

## Phase 1 — In-process scene swap (~12-16hr)

**Independently testable.** Centerpiece. Replaces `window.location.href = ?scene=X` reloads with in-process `swapScene(toId)`. Loading overlay covers the swap window.

**Critical files.**
- [`js/main.js`](../js/main.js) — extract `init()` lines 444-753 into reusable `rebuildScene(sceneDef)`; add `swapScene(toId, opts)`, `disposeScene()` methods on `SheepDogSimulation`.
- [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) — add `disposeTerrain()`, `disposeBuildings()`, `disposeMountains()`; reuse existing `clearTrees()` (line 1585), `clearRocks()` (1886), `regenerateGrass()` (1832), [`ProceduralMountains.dispose()`](../js/ProceduralMountains.js) at 133, [`GrassSystem.dispose()`](../js/GrassSystem.js) at 1208-1225 patterns.
- [`js/OptimizedSheep.js`](../js/OptimizedSheep.js) — add `OptimizedSheepSystem.dispose()` (no existing dispose; merged geometry + instanced mesh material both leak today); call `resetExtremeBoidSystem()` from [`js/ExtremeBoidSystem.js:486`](../js/ExtremeBoidSystem.js).
- [`js/components/App.js`](../js/components/App.js) — migrate the four reload callsites; split `handleMainMenu` (line 952) into `restartToMenu()` (no scene change); mount `<SceneSwapOverlay>` at App root.
- [`js/GameState.js`](../js/GameState.js) — extend `reset()` (lines 1226-1244) to drain `boundary`, `corral`, `pasture`, `bounds`, `objective`, `sceneSpawnDef`, `obstacles`, `flockingOverride`.
- [`js/atmosphere/Atmosphere.js`](../js/atmosphere/Atmosphere.js) — `Atmosphere.dispose()` already exists at line 359-381; reuse.
- [`js/SceneManager.js`](../js/SceneManager.js) — add `disposeWater()` calling `DepthPrePass.dispose()` (124) + `AnimeWater.dispose()` (250) + `setWater(null)`.

**Step ordering** (each step independently shippable + reviewable PR):

1. **Plumbing.** Add `swapScene` / `disposeScene` / `rebuildScene` methods. Initially `swapScene` falls back to `location.href` (today's behaviour). Wrap the four callsites. Sim-baseline still byte-identical.
2. **Disposal one family at a time, lowest-risk first:**
   - 2a. Effects (`PortalEffect`, `CorralZapPool`, `SunBillboard`, round-up decal)
   - 2b. Atmosphere
   - 2c. Water
   - 2d. Structures + buildings
   - 2e. Trees + rocks + grass + mountains
   - 2f. Terrain mesh
   - 2g. Sheep + sheepdog
   Run stress test after each family.
3. **Flip swap to in-process.** When all families pass, change `swapScene` to call `disposeScene()` + `rebuildScene()`. Add `<SceneSwapOverlay>` React component (200ms fade in/out, 200ms minimum display, mounted outside StartScreen/GameHUD so it covers either). Wire `AbortController`-style teardown for `corral-retired` / `objective-stage-changed` / `corral-ascend-top` window listeners (today they leak across swap).
4. **Migrate callsites.** ScenePicker drops URL-only switch; `handleStartSandbox` skips encode/reload dance; `ensureSceneMatchesRoom` keeps WS open per Q1; `restartToMenu()` ships independently of scene swap.
5. **Hardening.** Stress-test e2e spec, visual-regression spec, ARCHITECTURE.md update, INTERFACE_FENCE.md note.

**Highest-risk subtasks** (call out in PR descriptions):
1. Sheep + ECS disposal — no existing dispose; sim-baseline-adjacent.
2. Terrain ShaderMaterial dispose — water depth-pre-pass texture binding; order matters; carries Cycle 9 Mac Safari risk.
3. Window listener teardown — silent leak class; old PortalEffect references freed `setIntensity` after swap.
4. MP guest swap with WS open (Q1) — race window between server message and rebuild.
5. Loading overlay vs animate-loop — rAF must not crash referencing freed `terrainBuilder.terrainMesh`; defensive null-checks required.

**Acceptance:**
- A1. ScenePicker tile click swaps without page reload. Browser back/forward navigates correctly via `history.replaceState`.
- A2. `handleStartSandbox` cross-scene path swaps in-process then enters sandbox start.
- A3. MP guest with mismatched URL `?scene=` arrives at correct rendered scene; sim state continuous.
- A4. `handleMainMenu` returns to start screen on current scene with no full reload, no audio cut, no canvas flash.
- A5. Loading overlay covers the swap; min 200ms display; fades match design.
- A6. `npm test -- baseline.spec` byte-identical pre/post.
- A7. 111/111 vitest pass; production build clean.
- A8. Stress test (5×A→B→C→A): `renderer.info.memory.geometries` end value within 5% of post-1-swap; window listeners constant.
- A9. Visual regression: cold-boot OC vs swap-into OC, pixel diff < 0.5%.
- A10. Desktop swap median ≤ 600ms warm cache, ≤ 1500ms cold heightmap; mobile ≤ 1500ms warm.
- A11. Rollback: `disposeScene` / `rebuildScene` throw → catch falls back to `location.href = ?scene=X`; user lands correctly.

## Phase 2 — UI/UX polish (~6-10hr)

**Depends on:** Phase 1 (uses `<SceneSwapOverlay>`). Otherwise independent.

Pick up the [`cycle-3-ui-ux.md`](cycle-3-ui-ux.md) carry-over. Unify the visual system across all menu surfaces.

**Critical files.**
- [`js/components/Button.js`](../js/components/Button.js) — extract the glass-morphic primary; convert hardcoded `<button onclick="location.reload()">` callsites at [`js/main.js:1313`](../js/main.js), [`js/main.js:2595`](../js/main.js), and inline completion buttons to use `Button`.
- [`js/components/StartScreen/`](../js/components/StartScreen/) — onboarding overlay (re-triggerable from settings, not just first-visit playerSetup); real dog PNG thumbnails in `DogSelection`.
- [`js/components/GameHUD/`](../js/components/GameHUD/) — mode-shaped HUD profile (Solo: timer + sheep counter; Timed: countdown; Competitive: scoreboard + waiting-for-players overlay); MobileHUD parity.
- New `<SceneSwapOverlay>` from Phase 1 lives here.

**Acceptance:**
- Every clickable surface uses the same `Button` component (no inline-style buttons in main.js or App.js).
- Onboarding overlay can be re-triggered from Settings → Show tutorial.
- Mode-shaped HUD: Competitive shows pre-game "waiting for players" state.
- Dog thumbnails are real PNG renders, not placeholder text/emoji.
- No visual regression on existing StartScreen/GameHUD captured at Cycle 9 close.

## Phase 3 — Cinematic capture infrastructure (~4-6hr)

**Depends on:** nothing (parallel to Phase 1).

Unblock Playwright-driven filming for marketing. User picked the automation path; no in-game record UI in this cycle (Q2).

**Critical files.**
- [`js/SceneManager.js:42`](../js/SceneManager.js) — `preserveDrawingBuffer: false` → `true` (gate behind `?cinematic=1` to avoid the documented perf hit on normal play).
- [`js/CameraController.js`](../js/CameraController.js) — add public `setPosition(x,y,z)`, `setTarget(x,y,z)`, `lookAt(x,y,z)`, `getPose()` methods; add `setPath(keyframes, durationMs)` lerp animator for orbital/dolly shots.
- [`js/main.js`](../js/main.js) — under `?cinematic=1`, expose `window.__sdsCinema` with `{ camera, atmosphere, effects, gameState, swapScene, hideUI, showUI }`. Honour `?ui=off` to set React overlay `display:none`.
- [`js/atmosphere/Atmosphere.js`](../js/atmosphere/Atmosphere.js) — already has `setSun({elevation, azimuth})`, `applyPreset()`, `startDayNightCycle()`; expose via `window.__sdsCinema.atmosphere`.
- [`js/effects/CorralZapEffect.js:94-139`](../js/effects/CorralZapEffect.js) — `pool.fire(pos)` already triggerable; expose via `window.__sdsCinema.effects.lightning(pos)`.
- New URL params: `?cinematic=1`, `?ui=off`, `?sun=<0..1>` (passed to `DayNightCycle.setT()`), `?mode=chaos` (skip start screen, drop straight into 5000-sheep mode).

**Acceptance:**
- `?cinematic=1&ui=off&scene=rolling-hills&sun=0.78` boots straight into RH at golden hour with no React overlay and `window.__sdsCinema` populated.
- Camera `setPath([{pos, target, t:0}, {pos, target, t:1}], 10000)` produces a smooth 10s dolly.
- `window.__sdsCinema.effects.lightning({x:0,y:0,z:0})` triggers the zap visual on demand.
- `canvas.toDataURL('image/png')` returns non-blank frames after a render.
- No regression on normal play (`?cinematic=1` flag absent → `preserveDrawingBuffer` stays false).

## Phase 4 — Marketing asset production (~6-10hr)

**Depends on:** Phases 1 + 3. (Phase 1 prevents reloads from disrupting capture; Phase 3 provides the camera/effect API.)

Use Phase 3 infra + Playwright MCP to capture a marketing shot list, output PNG sequences, and mux to MP4 / regenerate OG images.

**Critical files.**
- New `tools/cinematic/shot-list.mjs` — declarative list of shots: scene, sun angle, mode, camera path, duration, output filename. Examples:
  - `dog-into-sunset.mp4` — RH classic, sun=0.83 dusk, dolly behind dog moving toward sun.
  - `lightning-strike.mp4` — RH classic, normal-day, fixed wide shot, scripted lightning trigger on sheep retirement.
  - `chaos-5000.mp4` — Field chaos (5000 sheep), orbital camera at 80m radius for 8s.
  - `oc-portal.mp4` — OC, drone shot above portal as sheep ascend.
  - Static OG cards: `og-rolling-hills-1200x630.png`, `og-open-country-1200x630.png`, `og-field-1200x630.png`.
- New `tools/cinematic/run.mjs` — Playwright-driven runner: spawn dev server, navigate per shot, drive `__sdsCinema`, capture PNG sequence at 30fps via `page.screenshot()`, ffmpeg-mux to MP4 offline.
- [`index.html`](../index.html) lines 48-54 — replace `og:image`, `twitter:image` with new captures (existing `sds-zoomedin-play.png` is 3.7 MB; aim for sub-300 KB WebP/JPEG at 1200×630).
- New `assets/marketing/` — output directory for MP4s + screenshots; press-kit one-pager.

**Acceptance:**
- `npm run cinema` produces all shots in `assets/marketing/` deterministically.
- New OG images shipped, referenced in `index.html`, file size < 300 KB each.
- Press kit one-pager (`PRESSKIT.md` or static HTML) with tagline, feature bullets, 4-5 curated shots, creator bio, contact, license.

## Phase 5 — SEO + release prep (~3-5hr)

**Depends on:** nothing (fully parallel).

Close the small but ship-blocking gaps that turn "live prototype" into "v1.0 release."

**Critical files.**
- New `public/manifest.webmanifest` — name, short_name, description, icons (192/512/maskable), start_url, display:standalone, theme_color, background_color, categories:["games"], orientation:"any". Generated icons under `/assets/images/icons/`.
- [`index.html`](../index.html) — add `<link rel="manifest">`, `<link rel="apple-touch-icon">`, `<link rel="icon" sizes="192x192">`, `<link rel="icon" sizes="512x512">`.
- Analytics integration (Q3) — Cloudflare Web Analytics injected via Pages dashboard (no code change). Add custom events for: game_completed, mode_selected, scene_swapped, mp_room_created via fetch to a new `/api/event` worker route logging to D1.
- New `CHANGELOG.md` at repo root — player-facing release notes (separate from internal `DECISIONS.md` and cycle plans). Initial entry: v1.0.0 with three biomes, four solo modes, multiplayer, 18 languages, leaderboards, in-process scene transitions.
- Git: `git tag v1.0.0` + push, when Phases 1-4 ship. Future releases follow semver.
- Optional: `PRESSKIT.md` from Phase 4.

**Acceptance:**
- Lighthouse PWA audit ≥ 90 (installable, manifest valid, icons present).
- Mobile "Add to Home Screen" works on iOS Safari and Android Chrome.
- Analytics dashboard receives events from sheepdogsim.com.
- `git tag --list` shows `v1.0.0`.
- `CHANGELOG.md` exists at repo root.

## Phase 6 — Score integrity (~3-5hr)

**Depends on:** nothing (parallel; server-side mostly).

Defend the leaderboard from obvious cheating without going as deep as full server-side replay validation. Approach (a)+(c) per Q4.

**Critical files.**
- [`worker/src/d1.ts`](../worker/src/d1.ts) — extend `submissionScoreBoundsOk` (line 167-172) with cross-field plausibility: reject `soloClassic` with `sheep_count > 200`; reject `soloChaos` with `score < 60` (sub-1-min on 5000 sheep is implausible); reject `sheep_count` not in the allowed set per mode.
- New `score_anomalies` D1 column on `score_submissions` — JSON blob with anomaly tags (`fast_for_count`, `mode_count_mismatch`, `client_clock_skew`); migration `worker/migrations/0003_score_anomalies.sql`.
- Optional telemetry (approach c): client submits 5-10 sheep position samples + dog path summary alongside score; server flags scores where the sheep barely moved.
- [`js/GameState.js:1176`](../js/GameState.js) — submit `clientStartedAt` and `clientFinishedAt` Unix timestamps; server cross-checks against `score` (claimed duration) with ±10s tolerance.
- Leaderboard query: by default exclude rows with anomaly flags; admin endpoint can list flagged rows.

**Acceptance:**
- Submission with `soloClassic` + `sheep_count: 1000` is rejected with 400.
- Submission with `score: 30` for `soloChaos` is rejected.
- `clientStartedAt`/`clientFinishedAt` mismatch by > 10s is flagged in `score_anomalies` (not rejected — soft signal).
- Existing legitimate scores from before migration unaffected.
- Migration `0003_score_anomalies.sql` runs cleanly on production D1.

## Phase 7 — Electron-readiness research (research only, ~2-3hr)

**Depends on:** nothing. Run anytime.

Document the path forward toward an Electron-packaged downloadable build. **No code.**

**Deliverable.** New `docs/electron-readiness.md` covering:
1. **Hard dependencies on the live Worker.** Hardcoded `sds-worker.matt-m-kissinger.workers.dev` references in [`js/NetworkManager.js`](../js/NetworkManager.js); proposal: env-driven worker URL with offline fallback for solo modes (no leaderboard sync, queued for later).
2. **Asset paths.** Already relative-pathed via [`vite.config.js:43`](../vite.config.js) (`base: isItchio ? './' : '/'`). Document a third `electron` build target with `base: './'`.
3. **Bundle size.** Current image payload ~9.3 MB across four PNGs; propose lossless WebP / AVIF conversion; target sub-3 MB total assets for download.
4. **`file://` protocol gotchas.** Service worker disabled in Electron. Web Audio + WebGL fine. Document.
5. **Window/full-screen.** Existing Fullscreen API usage in MobileControls maps cleanly to `BrowserWindow.setFullScreen`. Document.
6. **Offline leaderboard UX.** Local SQLite (sql.js) for solo records; sync to D1 on next online launch. Sketch the schema migration.
7. **Update channel.** electron-updater + GitHub Releases or Cloudflare R2.
8. **Code-signing.** Apple Developer certificate, Windows EV cert, Linux is unsigned. Document costs.
9. **Decision matrix:** Tauri vs Electron vs Neutralino. Recommend Tauri (smaller, Rust-based, 2026 momentum) unless team has strong Electron familiarity.

**Acceptance:** Doc exists, links from [`BACKLOG.md`](BACKLOG.md). No code changes.

## Dependencies

```
Phase 1 (scene swap) ───┬─→ Phase 2 (UI polish — uses SceneSwapOverlay)
                        └─→ Phase 4 (marketing — needs in-process swap to avoid disrupting capture)
Phase 3 (cinematic infra) ──→ Phase 4 (marketing assets)
Phase 5 (SEO/release) — independent (parallel)
Phase 6 (score integrity) — independent (parallel)
Phase 7 (electron research) — independent (anytime)
```

Phase 1 is the long pole; Phases 3 + 5 + 6 + 7 can run in parallel branches.

## Frozen files (cycle-specific additions)

- [`tests/sim-baseline/`](../tests/sim-baseline/) — DO NOT regenerate fixtures (cycles 5-9 preserved byte-identical; Phase 1 must too).
- [`worker/migrations/`](../worker/migrations/) — append-only (Phase 6 adds `0003_score_anomalies.sql`).
- [`shared/MovementPhysics.js`](../shared/MovementPhysics.js) — `updateMovement` stays a pure-functions library; obstacle composition lives at call sites.
- [`shared/TreePlacement.js`](../shared/TreePlacement.js) — deterministic seeded RNG contract (`mulberry32(scene.terrain.seed)`); identical positions across V8 instances.

## Hard stops

Surface to the user, do not proceed:

1. Frozen-file change without scope authorization — see [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).
2. Sim-baseline test failure that you don't understand — don't regenerate fixtures, escalate.
3. Phase 1 stress test showing `renderer.info.memory.geometries` growing > 5% per swap loop — that's a leak; diagnose before adding new scope.
4. Visual regression on a previously-passing scene — fix or revert before adding new scope.
5. `?cinematic=1` flag affecting normal play (e.g., perf regression with flag absent) — gate every change carefully.
6. Score-integrity migration failing on production D1 — roll back, do not force.

## What NOT to do during this cycle

- Don't add new scenes. Three is still the right number.
- Don't reopen multiplayer architecture.
- Don't touch `shared/MovementPhysics.js` `updateMovement` to insert obstacle logic.
- Don't merge `canStartSprint` and `canContinueSprint`.
- Don't regenerate `tests/sim-baseline/` fixtures.
- Don't ship an in-game cinematic record UI (Q2 — confirmed scope of "Playwright-driven only").
- Don't implement Electron packaging (Phase 7 is research only).
- Don't do a from-scratch UI redesign — Phase 2 is *unification + Cycle 3 carry-over*, not a new aesthetic.
- Don't let `?cinematic=1` flip `preserveDrawingBuffer` on the normal-play codepath; gate strictly.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] Phase 1 — In-process scene swap shipped, all 11 acceptance criteria green, sim-baseline byte-identical.
- [ ] Phase 2 — UI/UX polish shipped, `Button` unified across all surfaces, mode-shaped HUD, onboarding re-triggerable.
- [ ] Phase 3 — `?cinematic=1` infra shipped, `window.__sdsCinema` exposes camera + atmosphere + effects + URL helpers.
- [ ] Phase 4 — Marketing asset production ran end-to-end; new OG images shipped; `assets/marketing/` populated.
- [ ] Phase 5 — PWA manifest + icons + analytics + git tag v1.0.0 + `CHANGELOG.md`.
- [ ] Phase 6 — Score-integrity migration deployed; cross-field plausibility live; anomaly column populated for last 24h of submissions.
- [ ] Phase 7 — `docs/electron-readiness.md` written, linked from `BACKLOG.md`.
- [ ] All vitest specs pass.
- [ ] Production build clean.
- [ ] Live on sheepdogsim.com via GH Actions.

## Verification

End-to-end smoke (in addition to per-phase acceptance):

```bash
# Local dev
npm install
cp worker/.dev.vars.example worker/.dev.vars
npm run dev:setup
npm run dev

# 1. Scene-swap UX (Phase 1)
# Open localhost:3000, click ScenePicker tile (Field → RH).
# Confirm: loading overlay fades in, terrain rebuilds, no full reload (URL bar updates via history.replaceState).
# Repeat 5 times across all three scenes; confirm no GPU memory growth in DevTools Performance tab.

# 2. UI polish (Phase 2)
# Walk every menu surface; confirm consistent button styling; trigger onboarding from Settings.

# 3. Cinematic capture (Phases 3 + 4)
npm run cinema    # produces all shots in assets/marketing/
# Confirm: MP4s play, OG images < 300 KB, present in /assets/marketing/.

# 4. SEO/release (Phase 5)
# Lighthouse audit on https://sheepdogsim.com → PWA score ≥ 90.
# Mobile "Add to Home Screen" → installs as standalone.
# git tag --list → v1.0.0 present.

# 5. Score integrity (Phase 6)
# curl -X POST sheepdogsim.com/api/score with soloClassic + sheepCount=1000 → 400.
# curl -X POST with soloChaos + score=30 → 400.
# Submit normal score → 200; check D1 score_submissions row has score_anomalies populated.

# 6. Sim baseline (regression gate)
npm test -- baseline.spec    # must be byte-identical pre/post entire cycle
npm test                      # all 111+ vitest specs green
npm run build                 # production build clean

# Stress tests (Phase 1)
npx playwright test tests/e2e/scene-swap-stress.spec.ts
npx playwright test tests/e2e/scene-swap-visual-regression.spec.ts
```

## Cycle 9 carry-over (deferred verification)

These items shipped code in Cycle 9 but were never explicitly verified. Walk them before or alongside Phase 1:

1. **Mac rendering bug root cause (Cycle 9 Q3).** Bug doesn't reproduce on GH Actions Safari. Needs Matt to debug on his Mac with `?debug=gl` and capture `window.__sdsDiag`. Tomorrow's debug recipe in [`../NEXT_SESSION.md`](../NEXT_SESSION.md).
2. **User playtest of Cycle 9 changed flows.** Solo Classic on RH/OC shows `0/200`; MP host's chosen sheepCount sticks; guest joining via invite renders the room's scene; leaderboard solo tab hides sheep-count dropdown; sheep + dog no longer sink in bare patches.
3. **Cycle 8 carryover items not picked up in Cycle 9** — Phase 1 acceptance walkthrough (Insane/Chaos sheep count, leaderboard partition filters, sandbox cross-scene reload, MP at 500/1000) + Phase 2 MP bandwidth measurement (Q2 from Cycle 9). If still untouched at Cycle 10 close, carry into Cycle 11.

## References

- [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — cycle plan template.
- [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files; Phase 1 will add `disposeScene`/`rebuildScene` lifecycle.
- [`BACKLOG.md`](BACKLOG.md) — picks up Cycle 3 UI/UX carry-over (Phase 2) and several deferred items.
- [`cycle-9-plan.md`](cycle-9-plan.md) — prior cycle (playtest-triage + cross-platform).
- [`archive/cycles/cycle-8-plan.md`](archive/cycles/cycle-8-plan.md) — Cycle 8 mode-matrix; defines the original "scene swap requires reload" decision that Phase 1 supersedes.
- Live deploy: https://sheepdogsim.com — Cloudflare Pages + Worker + DO + D1.
- Worker: https://sds-worker.matt-m-kissinger.workers.dev.
