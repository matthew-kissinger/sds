# Cycle 27 — engagement-loop-and-perf

> Drafted 2026-05-08 after Cycle 26 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Cycle 26 was a "menu" cycle that shipped Practice Paddock, per-scene SEO, the Mac/iPhone tone-mapping fix, and 2-of-3 OG card refreshes — but left the *engagement loop* (analytics, daily challenge, replay/share, onboarding) and several pieces of stack cleanup (cinema runner timeout, bundle split, camera state-machine, untested core classes) parked. Cycle 27 ships those and closes out the player-facing-layer pivot started in Cycle 26.

**User-visible difference between before and after:**

- A first-time visitor gets a 5-second pointer tour and a smaller initial bundle.
- A returning visitor gets a daily seed challenge with its own leaderboard partition.
- A successful round produces a downloadable 10-second WebM clip + share card.
- The dev team gets analytics, automated marketing capture (cinema runner), test coverage on the load-bearing classes, and a unified camera state-machine.
- The remaining itch.io heightfield / iPhone tone-mapping / OG card / title-screen / devlog items close out via a paired Matt session at the end of the cycle.

**Sequencing principle:** phases are ordered by autonomy. **Phases A–I are autonomous** (Claude ships without check-ins). **Phase I → J is the Matt pickup point.** **Phases J–N require Matt** (paired media session, real device, design taste, or a strategic call).

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code.
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile) before committing.
- **Pick the simplest thing that meets the budget** rather than the most impressive.

## Open questions to resolve before writing code

1. **Q1: Per-phase ship cadence vs single end-of-cycle ship?** Author lean: per-phase v2.2.x bumps for autonomous phases (matches Cycle 26's pattern), single v2.3.0 at end of Matt-pickup tail. Each independently shippable phase tags its own version + CHANGELOG entry.
2. **Q2: Daily-seed scoring uses a separate leaderboard partition or a tag on the existing one?** Author lean: separate partition. The worker `RoomDO` leaderboard schema already supports mode-partition; add `daily-{YYYY-MM-DD}` mode key. Avoids contaminating the main leaderboard with disposable scores. Resolve in Phase D before any leaderboard write code lands.
3. **Q3: Replay capture format — `MediaRecorder` over `canvas.captureStream()`, or per-frame state log + deterministic replay?** Author lean: **MediaRecorder**. WebM out, ~10s × 60fps = ~3-5 MB; user clicks download or share. Deterministic-replay is a nicer engineering story but 10× the work and irrelevant for share-card UX. Resolve in Phase E.
4. **Q4: Devlog venue (Phase N)?** Author lean: `DEVLOG.md` route on the site. Lowest overhead, no CMS, links straight into the start-screen footer. Substack + cross-post is fine if Matt prefers a mailing-list audience.
5. **Q5: Heightfield amplitude — fix at root or codify as design (Phase M)?** Author lean: **codify as design** in [`DECISIONS.md`](../DECISIONS.md). Visual character has shipped on the doubled state for 16+ cycles; rebake risk vs. benefit is unfavorable now. The "bug" is load-bearing. Confirm with Matt; this needs his explicit call.

These questions don't block Phase A (analytics scaffold). Q2 must resolve before Phase D's leaderboard write. Q3 must resolve before Phase E's recorder lands. Q4–Q5 resolve in their own phases.

## Architecture / shared changes

No shared schema or primitive changes this cycle. Each phase touches a distinct subsystem:

- **Phase A** adds `<script>` + a beacon shim — no module surface change.
- **Phase B** is bug-fix scope inside [`tools/cinema-runner.mjs`](../tools/cinema-runner.mjs).
- **Phase C** introduces a `React.lazy()` split-point in [`js/components/App.js`](../js/components/App.js); Three.js init in [`js/main.js`](../js/main.js) starts in parallel with the overlay mount.
- **Phase D** adds `js/utils/dailySeed.js` + a worker leaderboard partition key `daily-{date}`.
- **Phase E** adds `js/utils/ReplayRecorder.js` + a round-end share-card React component.
- **Phase F** adds `js/components/StartScreen/PointerTour.js`.
- **Phase G** is investigation-first, no schema delta.
- **Phase H** consolidates [`js/CameraController.js`](../js/CameraController.js)'s three update paths behind one state reader.
- **Phase I** is pure unit-test additions under `tests/`.

---

# Autonomous phases

## Phase A — Cloudflare Web Analytics beacon (~10min)

**Independently testable.** Has to land first so subsequent phases can be A/B'd against analytics signal.

1. **Decide beacon source.** Cloudflare Pages → Web Analytics (free, privacy-respecting, no cookies). Generate a beacon token from the Cloudflare dashboard (Analytics & Logs → Web Analytics → Add a site → `sheepdogsim.com`).
2. **Add script to [`index.html`](../index.html).** Place inside `<head>`, async, with the Cloudflare-issued token. Must respect `prefers-reduced-data` and not block render.
3. **Verify in DevTools.** Network tab shows `cloudflareinsights.com/cdn-cgi/rum` POST on page load. Lighthouse score holds at SEO 100 / Performance ≥ baseline.

**Acceptance:** Beacon firing in production within 5 min of deploy. Cloudflare dashboard shows pageviews ≥ 1 within an hour. No regression in Lighthouse Performance score.

## Phase B — Cinema runner `page.screenshot` 30s font-wait timeout fix (~2hr)

**Depends on:** nothing. Unblocks downstream automated marketing capture (Phase J + future trailer/clip work).

1. **Reproduce.** Run `npm run cinema -- --shot=og-field` and confirm the timeout (`waiting for fonts to load... fonts loaded` then hang). Reproduces on every shot.
2. **Diagnose.** Likely root cause is `await page.evaluate(() => document.fonts.ready)` racing with a font that never resolves under headless Chromium's font fallback path. Check whether the issue is specific font files (woff2 with embedded variants) or the `document.fonts.ready` Promise itself never settling.
3. **Fix paths to evaluate.**
   - **Option (a):** `await page.evaluate(() => document.fonts.ready)` with a 5s timeout race + fallback to plain delay.
   - **Option (b):** preload fonts via `page.evaluateOnNewDocument` injecting a hidden text element using each face — forces resolution.
   - **Option (c):** strip the font-wait entirely and rely on a `waitForLoadState('networkidle')` + a deterministic 200ms paint settle.
4. **Verify across all shots.** `npm run cinema -- --batch` should complete the full shot list without timeout. Compare WebP byte-output against committed goldens; differences must be intentional (e.g., explicitly re-rendering OG cards in Phase J).

**Acceptance:** `npm run cinema -- --batch` completes in < 5 min, all shots produced. Existing OG/dog/PWA WebPs byte-identical (or explicitly regenerated in Phase J/K). Single test in `tests/cinema-runner.spec.js` exercises the headless launch + one-shot path.

## Phase C — Lazy-load React overlay split from Three.js init (~2-3hr)

**Depends on:** nothing. Pure perf win for first-30-seconds.

1. **Profile current cold-start.** Open production site with DevTools Performance tab; mark "First Contentful Paint" → "WebGL renderer construct" → "first frame painted." Measure on throttled 3G (Chrome DevTools' "Slow 3G" preset) so the bundle-size delta is actually visible.
2. **Identify the React-only chunk.** [`js/components/App.js`](../js/components/App.js) and its tree (StartScreen, GameHUD, ScenePicker, etc.) are React-bound. Three.js, SceneManager, GrassSystem, etc. are React-independent.
3. **Restructure entry.** [`index.html`](../index.html) → [`js/main.js`](../js/main.js) starts `new Game()` immediately. The React overlay mount (currently synchronous in App.js) becomes a `React.lazy()` import gated on `requestIdleCallback` (or `setTimeout(0)` fallback for Safari).
4. **Verify visual continuity.** The shimmer-skeleton scene-swap overlay (`js/components/ui/SceneSwapOverlay.js`) needs to be available when the player first lands so they see something while React mounts. Either inline it pre-React via a vanilla-DOM mount, or accept a brief blank frame and show the WebGL canvas first.
5. **Measure delta.** Bundle-size: target -60–80 KB off the critical-path JS (`main-*.js` shrinks; new `App-*.js` lazy chunk is non-blocking). FCP on Slow 3G: target -800ms minimum to claim a win.

**Acceptance:** Cold-load FCP improves measurably on Slow 3G profile (recorded delta committed under `cycle27-validation/phaseC/before-after.json`). Bundle `main-*.js` ≤ 760 KB (was 837 KB). Total transferred bytes flat or down. No visible flash-of-blank-canvas regression on broadband.

## Phase D — Daily-seed micro-challenge (~3-4hr)

**Depends on:** Q2 resolved. Independently testable.

1. **Define the seed.** `dailySeedFor(date: Date) → { sceneId, sheepCount, timeOfDay, durationSec, seedString }`. Hash a date-string ("2026-05-08") with a stable function (FNV-1a or similar — keep it deterministic and forkable across timezones if Matt cares about that). Map the hash into the existing scene/mode space.
2. **Surface in the start screen.** New mode tile "Today's Challenge" at position 0 (above Practice Paddock). Tile shows the seed name + "X sheep on Y in Z seconds." Reuses the Practice tile's pulse-on-first-visit pattern but for `sds.dailySeen-{date}` localStorage flag.
3. **Wire into game state.** When the player picks the daily tile, `GameState.startSession()` reads the seed config and applies sheep count / scene / time-of-day. The active leaderboard partition becomes `daily-{YYYY-MM-DD}`.
4. **Worker side: leaderboard partition.** [`worker/src/RoomDO.ts`](../worker/src/RoomDO.ts) already supports mode-partitioned leaderboards. Add `daily-*` as a recognized mode prefix. Read the partition for display; submit only if the player completed the daily.
5. **Daily reset.** Page-load reads `localStorage.lastDailySeen`; if older than today's UTC date, a small "🌅 New daily challenge" toast appears (auto-dismisses 4s, never modal).
6. **Time zone decision.** Daily resets at UTC midnight. Document this; no per-region rollover.

**Acceptance:** Three vitest specs in `tests/daily-seed.spec.js`: deterministic seed for a fixed date, partition-key format, three days produce three different scene/mode tuples. Manual: pick the daily tile, complete a run, see your score appear in the daily leaderboard view.

## Phase E — 10-second WebM replay capture + share-card (~3-4hr)

**Depends on:** Q3 resolved. Pairs naturally with Phase D (round-end is the same surface).

1. **Recorder lifecycle.** New `js/utils/ReplayRecorder.js`. `start()` → `canvas.captureStream(60)` + `new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' })`. Buffer last 10 seconds via a circular chunk array (drop oldest when buffer exceeds 10s). `stop()` → finalize WebM blob.
2. **Trigger.** `RoundManager` (or equivalent) on round-end: if completion was successful, recorder produces a blob; surface a "Save clip" button on the completion screen.
3. **Share-card composite.** Round-end React component renders a 1200×630 SVG with: scene name, sheep corraled, time, dog name. User can download as PNG (canvas-based rasterize) or copy a generated tweet link.
4. **Mobile fallback.** Mobile Safari historically had `MediaRecorder` gaps on iOS Safari ≤ 14.5; check current support before assuming. If unsupported, surface only the share-card (no clip).
5. **Performance budget.** Recorder runs in idle hooks; should not regress in-game frame time. Validate via `?perfMode=1` harness — frame time during a recording must stay within 3% of non-recording baseline.

**Acceptance:** Successful round → "Save clip" → `.webm` downloads, plays in VLC/Chrome. Share-card downloads as PNG. Frame-time perf-check passes within tolerance. Two specs in `tests/replay-recorder.spec.js`: stream capture mock + circular-buffer truncation.

## Phase F — First-30-seconds onboarding overlay (~2hr)

**Depends on:** nothing.

1. **Component.** New `js/components/StartScreen/PointerTour.js`. 5-second auto-fade pointer overlay shown only when `localStorage.sds:hasPlayed` is unset. Pulses three pointer-arrows: WASD (movement), Shift (sprint), S key (whistle).
2. **Dismissal.** Auto-fades after 5s OR on first input event. Localstorage flag set on first input so it never re-shows.
3. **Visual treatment.** Subtle, never modal. Frosted-glass pointer-arrows + 1-line caption per gesture. Mobile shows tap-and-hold + virtual-stick equivalents.
4. **Anchoring.** Pointer arrows anchor to actual key-positions in the existing `js/components/HelpKeysOverlay.js` / mobile control rendering — survives layout reflow.

**Acceptance:** First-time visitor sees overlay; second-time visitor does not. Mobile surface differs from desktop. Two `tests/pointer-tour.spec.js` specs: localStorage gating + dismissal-on-input.

## Phase G — itch.io heightfield diagnosis + fix attempt (~2hr)

**Depends on:** nothing. Investigation-first; ship what we learn.

1. **Reproduce.** Open `https://mkvision0.itch.io/sheep-dog-sim` (or the live URL) with DevTools open. Capture: console output (especially `[INIT] Loading heightfield: ...`), Network tab status of the heightfield fetch (200/403/blocked), and the actual visual symptom (dark-blue mid-distance band — verify it's still present post-v2.1.2).
2. **Diagnose.** Three branches:
   - **(a) Same 403 on `.bin`.** itch's CDN has additional rules. Try moving heightfield to `/heightmaps/<scene>.bin` (root-adjacent) or `/data/<scene>.bin`. Re-deploy and re-test.
   - **(b) `.bin` fetches successfully but mid-distance still flat.** Different root cause — likely a code path that misbehaves under itch's iframe sandbox (canvas size, DPR, or scene-boundary distance). Trace via `?debug=heightfield` URL param.
   - **(c) Worst case: embed inline.** New `tools/embed-heightmap.mjs` produces a base64-encoded JS module per scene; `Heightfield.load()` falls back to the inline source when fetch fails. Adds ~16 MB to bundle but bypasses itch CDN entirely.
3. **Document outcome.** Update [`NEXT_SESSION.md`](../NEXT_SESSION.md) "Known issues" section with the verified root cause + applied fix.

**Acceptance:** Either: (a) itch deploy renders RH/OC terrain identically to sheepdogsim.com, OR (b) `cycle27-validation/phaseG/diagnosis.md` documents the exact root cause + a concrete next-step recommendation that escalates to a known scope (e.g., "needs itch CDN config change — opening support ticket").

## Phase H — Camera state-machine collapse (~3hr)

**Depends on:** nothing. Refactor; no behavior change.

1. **Read current state.** [`js/CameraController.js`](../js/CameraController.js) has `_updateClassic`, `_updateFollow`, `_updateFree`. Each duplicates ~70% of the math (smoothing, target-distance lerp, FOV interpolation).
2. **Extract single state reader.** Define `CameraState = { mode, targetDistance, targetHeight, yawSource, fov, smoothing }`. One `_updateFromState()` consumes the struct. Mode-specific branches collapse to a `_modeToState(mode, dt)` reducer.
3. **Verify behavior parity.** No visible change in camera feel. Run e2e `tests/e2e/scene-swap-stability.spec.ts` (camera reset on swap is an existing assertion). Add a new spec that records 60 frames of camera position + euler in each mode pre-refactor and asserts post-refactor identity within float tolerance.
4. **Net LOC delta.** Target -120 LOC in [`CameraController.js`](../js/CameraController.js) without losing any feature.

**Acceptance:** Pre/post-refactor frame-by-frame camera position deltas under 0.001m / 0.01° in all 3 modes. Vitest unchanged. No new playtest issues; existing camera-mode unit tests pass. Bundle size flat.

## Phase I — Test coverage backfill: GameState, Sheepdog, NetworkManager, RoomDO (~4-5hr)

**Depends on:** Phases A–H stable on `main`. Last autonomous phase before Matt-pickup.

1. **GameState.** New `tests/game-state.spec.js`. Cover: mode dispatch (`setMode('practice')` → state shape correct), session start/end, sheep count enforcement, leaderboard submission gate (only writes on completion + non-practice mode), localStorage round-history accumulation.
2. **Sheepdog.** New `tests/sheepdog.spec.js`. Cover: locomotion state-machine (idle/walk/sprint), sprint stamina drain + lock-out (the Cycle 23 Phase B fix), whistle range/effect.
3. **NetworkManager.** New `tests/network-manager.spec.js`. Cover: WebSocket message protocol (`hostChanged`, `playerJoined`, `playerLeft`, `dogChanged` shapes), reconnect grace (15s window from Cycle 24), serialization round-trip.
4. **RoomDO** (worker side). New `tests/worker/room-do.spec.ts` (extends existing worker test pattern). Cover: sheep-cap enforcement (3000+5000 allowed, 5000 mobile-rejected), invite-code generation collision-free for 1000 trials, room-state persistence across DO eviction.
5. **Coverage report.** Run `npx vitest --coverage` — target ≥40% line coverage on the four target files post-backfill (currently effectively 0%). Commit coverage-summary to `cycle27-validation/phaseI/coverage.json`.

**Acceptance:** Vitest count grows by ≥30 specs (was 201 → ≥231). Worker `tsc --noEmit` clean. Existing specs unchanged. Coverage summary committed.

---

# Matt pickup point

Phases A–I should ship autonomously. After Phase I lands, surface a brief status summary (what shipped, perf delta, bundle delta, test count) and **wait for Matt** before continuing into Phases J–N.

The remaining phases all require either Matt's device, taste, or a strategic call. Don't ship them autonomously.

---

## Phase J — `og-open-country.webp` refresh (~30min paired)

**Depends on:** Matt's session + ideally Phase B done so cinema runner is automated.

1. **Claude preps shot manifest.** Behind-Jep angle, OC scene, dawn or noon, sun position 0.4–0.6, dog in frame mid-foreground, sheep arc mid-distance, portal silhouette in distance. 1200×630, target ≤200 KB WebP.
2. **Matt drives capture.** Either via Playwright MCP (manual) or `npm run cinema -- --shot=og-open-country` if Phase B fix landed. Save WebP to `assets/marketing/og/og-open-country.webp`.
3. **Update [`index.html`](../index.html) + [`js/utils/seo.js`](../js/utils/seo.js)** if filename or path changes (likely no change — same filename, byte-level swap only).
4. **Post-deploy.** Twitter Card Validator + Facebook Sharing Debugger re-scrape `?scene=open-country`. CF edge rolls naturally per Cycle 26's `_headers` 5-min TTL.

**Acceptance:** New WebP in repo, build clean, post-deploy share-validators show updated card.

## Phase K — iPhone tone-mapping verification (~30min paired)

**Depends on:** Matt's actual iPhone (not simulator).

1. Open `https://sheepdogsim.com/?scene=rolling-hills` on Matt's iPhone, frame the dusk water, capture screenshot.
2. Compare to Mac post-fix capture. If sheen is gone, [`SceneManager.js`](../js/SceneManager.js)'s `/Mac|iPhone|iPad|iPod/` regex is correct and Cycle 27 confirms v2.0.4.
3. **If sheen persists** on iPhone: escalate to [`AnimeWater`](../js/water/AnimeWater.js) shader rework — add `<tonemapping_fragment>` chunk so the water shader respects the active tone-mapping curve.

**Acceptance:** Screenshot evidence either confirming or escalating. If escalating, scoped as a Cycle 28 phase, not Cycle 27.

## Phase L — Title-screen identity pass (~1day paired)

**Depends on:** Matt's design taste.

1. **Wordmark lockup.** Pick or commission a logotype. Two paths: Matt + Claude rough together via SVG/Figma; or Matt picks a font pairing and Claude implements. Goal: distinct from Inter/system-default body type.
2. **Animated hero.** Use the existing dog-into-flock loop or capture a new one. ~3-second WebM in start-screen background, looped, color-graded for warmth. Matt drives capture; Claude implements the loop component.
3. **Type pairing.** Pin to CSS vars (`--font-display`, `--font-body`). Use everywhere systematically.
4. **Color tokens.** Pin existing accent (`#10b981`) + a small palette in CSS vars. No expansion of the color story without Matt's call.

**Acceptance:** Start screen reads as "this is a real game" per Matt's read. Bundle delta < 10 KB (any new font weight loaded async, woff2-only).

## Phase M — Heightfield amplitude bug — fix or codify (~Matt's call)

**Depends on:** Matt's strategic call.

Two paths:

- **Fix at root.** [`Heightfield.sample()`](../js/Heightfield.js) drops the `* peakHeight` multiplier; [`scripts/bake-heightmap.mjs`](../scripts/bake-heightmap.mjs) writes pre-multiplied (already does). Re-bake heightmaps for all 3 scenes. Update sim-baseline goldens (the 50+ committed `tests/sim-baseline/*.json` will all change). Re-tune dependent values: grass clamp (`> 50` → back to `> 10`), fog distances per scene, scene radii. Visual character of RH/OC will visibly change — peaks ~6m instead of ~36m on RH.
- **Codify as design.** Add a section to [`DECISIONS.md`](../DECISIONS.md) titled "Heightfield amplitude — the bug is the design." Document why we decided not to fix it (load-bearing on visual character; 16+ cycles of dependent tuning). Remove the "standing risk" entry from BACKLOG. Future devs know this is intentional.

**Acceptance:** One of the two paths committed. Decision rationale lives in `DECISIONS.md` either way.

## Phase N — Devlog cadence + venue pick (~1hr Matt + 1hr Claude implementation)

**Depends on:** Matt's choice on venue (Q4).

1. **Matt picks venue.** Three options:
   - `DEVLOG.md` route — render a markdown file as `/devlog` route (Vite plugin or static HTML). Lowest overhead.
   - Substack mailing list — captures email subscribers; cross-post.
   - Hybrid — `DEVLOG.md` is canonical, Substack mirrors.
2. **Claude implements the route** if `DEVLOG.md`. Footer link from start screen. Renders the file with markdown-it or similar.
3. **First post.** Cycle 26 close summary as the seed entry. Frame: "what shipped, what we learned, what's next."
4. **Cadence agreement.** Weekly post on Thursdays (low-noise day for HN/Reddit cross-post). Each cycle close generates a draft entry; Matt edits + posts.

**Acceptance:** First devlog post live. Footer link from start screen. `DEVLOG.md` (or chosen venue) cross-linked from `README.md`.

## Dependencies

```
A → B (B unblocks J's automated capture)
A, B, C, D, E, F, G, H run in parallel after A
I → after A-H stable
(Matt-pickup point)
J ↔ B (J easier if B done)
K standalone (needs Matt's iPhone)
L standalone (Matt taste)
M standalone (Matt call)
N standalone (Matt voice)
```

A is the only strict prerequisite (analytics first so we measure everything else). B unlocks J. Within A–H, phases can land in any order; the canonical order in the doc reflects logical narrative ("instrument → unblock pipeline → engagement features → cleanup → tests").

## Frozen files (cycle-specific additions)

Plus the durable [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) list:

- **`js/SceneManager.js` tone-mapping branch** — just shipped (v2.0.3 + v2.0.4); Phase K may escalate but no other phase touches it.
- **`shared/MovementPhysics.js`** — sim-baseline lock; Phase I writes test specs that read from it but doesn't modify.
- **`tests/sim-baseline/*.json`** — Phase M is the only phase allowed to regenerate these, and only on Matt's go-ahead.

## Hard stops

Surface to the user, do not proceed:

1. **Phase A's Cloudflare beacon shows zero pageviews after 1hr live.** Diagnose before adding any other tracking.
2. **Phase C's lazy-load split causes a visible flash-of-blank-canvas on broadband.** Revert and either inline a vanilla-DOM start-screen skeleton or accept the perf delta.
3. **Phase E's MediaRecorder regresses frame time > 5%.** Drop the recorder or move it off the canvas hot path.
4. **Phase G's heightfield diagnosis surfaces a CDN config change request requiring itch support.** That escalates out of Cycle 27; document and move on.
5. **Phase I uncovers an actual bug in `GameState` / `Sheepdog` / `NetworkManager` / `RoomDO`.** That's a separate hotfix branch, not in-line scope creep.
6. **Phase M's "fix at root" path produces a visibly worse-looking game per Matt's playtest.** Revert and codify.

## What NOT to do during this cycle

- **Don't pick up parked world-rendering work.** Aerial-perspective LUT, 8×4 impostor re-bake, tree variants — all stay in BACKLOG.
- **Don't expand analytics beyond Cloudflare's privacy-respecting beacon.** No GA, no fingerprinting, no per-user tracking. If we need richer metrics, propose a plan — don't ship cookies.
- **Don't pre-deploy Phase L's title-screen change.** Design taste is Matt-gated.
- **Don't auto-post Phase N's first devlog.** Marketing/community pushes are Matt-sent.
- **Don't bloat the bundle.** Cycle 27 is supposed to *shrink* `main` (Phase C). Every phase has a bundle-delta validation criterion.
- **Don't regenerate sim-baseline fixtures.** Phase M is the only entry point and only with Matt's call.
- **Don't replace `MediaRecorder` with a deterministic-replay state-log architecture.** Q3 settled; that's a Cycle 30+ scope if it ever comes up.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks Matt to confirm each item.

- [ ] Cloudflare Web Analytics beacon firing in production (Phase A).
- [ ] `npm run cinema -- --batch` completes without timeout (Phase B).
- [ ] Cold-load FCP improves measurably on Slow 3G (Phase C). Bundle `main-*.js` ≤ 760 KB.
- [ ] Daily-seed challenge tile appears, completing a daily round writes to `daily-{date}` partition (Phase D).
- [ ] Successful round produces downloadable WebM clip + share-card PNG (Phase E).
- [ ] First-time visitor sees pointer tour; second-time visitor does not (Phase F).
- [ ] itch.io heightfield bug closed OR documented with concrete next-step (Phase G).
- [ ] `CameraController.js` collapsed to single state reader; behavior identity verified (Phase H).
- [ ] Vitest count ≥ 231 (Phase I).
- [ ] Open-country OG card refreshed (Phase J).
- [ ] iPhone tone-mapping confirmed or escalated (Phase K).
- [ ] Title screen reads as "real game" per Matt (Phase L).
- [ ] Heightfield amplitude path picked + landed (Phase M).
- [ ] Devlog venue picked + first post live (Phase N).
- [ ] All vitest specs pass.
- [ ] Production build clean (`main-*.js` smaller than v2.1.2 baseline).
- [ ] Live on sheepdogsim.com via GH Actions.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/archive/cycles/cycle-26-plan.md`](archive/cycles/cycle-26-plan.md) — predecessor (closed as v2.1.x series)
- [`docs/archive/cycles/cycle-26-autonomous-wake-state.md`](archive/cycles/cycle-26-autonomous-wake-state.md) — what landed in cycle 26's autonomous run
- [`PRESSKIT.md`](../PRESSKIT.md) — current marketing kit baseline
- [`DECISIONS.md`](../DECISIONS.md) — strategic decisions log (Phase M may write here)
