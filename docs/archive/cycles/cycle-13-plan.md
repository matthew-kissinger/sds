# Cycle 13 — `marketing-and-validation`

> Drafted 2026-05-02 after Cycle 12 closed (`post-v1-polish` — A8 stress drift, UI Button variants, Mac bug research, leaderboard fix all shipped; cinematic videos + CF Web Analytics + manual playtest carried forward as Matt-gated). Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Land the marketing-asset and analytics work that Cycle 12 left Matt-gated, plus pick up the highest-value next-step from the Phase 4 Mac bug research (force-precision in the sky shader + dither, the highest-confidence win). User-visible difference: the marketing page has the four demo videos, sheepdogsim.com has CF Web Analytics flowing, and the rainbow horizon-banding artifact in the sky is gone.

## How to read this plan

This doc fixes the shape of the changes, not the implementation choices. Phases 1-3 are Matt-gated (cinematic capture window, dashboard copy/paste, manual playtest). Phase 4 is straight code work. Phase 5 is the first cycle 12 carryover — once Phase 1 lands, the v1.1.0 tag becomes the natural close.

## Open questions to resolve before writing code

1. **Q1: Marketing-page location for the cinematic videos.** Author lean: a new section on `index.html` below the start screen, OR a separate `/about.html` block. Decide before Phase 1 lands so the embed targets are clear.
2. **Q2: Sky-shader precision/dither — ship behind a flag or hard ship?** Author lean: hard ship. The fix is a no-op on hardware that already runs at highp; the dither is +1 instruction in the fragment write. No reason to flag-gate.

## Phase 1 — Cinematic video render + marketing-asset refresh (~4-6hr) [Matt-gated]

Carryover from Cycle 12 Phase 3, plus a new marketing-asset refresh task that came up at Cycle 12 close: the OG cards and dog portraits in `assets/marketing/og` and `assets/dogs` are from 2026-04-28 and feel stale.

**Depends on:** nothing.

1. **Hero OG card refresh.** A scaffolding shot is in place at [`tools/cinematic/shot-list.mjs`](../tools/cinematic/shot-list.mjs) — `og-rh-sunset` — Solo Extreme on Rolling Hills at dusk with a behind-the-dog camera, `liveAction: true` so the 1000-sheep flock is mid-motion (not paused). First-pass capture 2026-05-02 had two issues to address tomorrow: (a) only 24/1000 sheep had spawned at `settleMs=4500` — bump to 8000-12000ms or add a `waitForFlockSize` helper; (b) the HUD reappeared after `startSolo()` despite `?ui=off` — likely need a `c.hideUI()` call inside `captureStatic` after `startSolo` and after `setCameraPose` (or have the cinematic API re-assert it). The runner-side support is shipped in [`tools/cinematic/run.mjs`](../tools/cinematic/run.mjs) (live-action static path, settleMs, post-settle camera re-pin). Iterate framing on this shot first; once it lands, replicate the pattern for `og-field-hero` and `og-open-country-hero`.
2. **Video shots.** Run `npm run cinema -- --headed` and let it render the 4 video shots (`dog-into-sunset`, `lightning-strike`, `chaos-5000`, `oc-portal`). Vite must be on port 3000; runner spawns it if not running.
3. Iterate framing in [`tools/cinematic/shot-list.mjs`](../tools/cinematic/shot-list.mjs) per shot. The `oc-portal` shot has a "Pause until first sheep ascends" inline note (line 74) — adjust the schedule so the descent lands at the moment the first sheep enters the corral portal.
4. Mux 1080p master + 720p downscale per shot (the runner does both via ffmpeg).
5. Marketing-page embed (Q1 location).
6. CDN upload — gitignored MP4s land in `assets/marketing/videos/<id>.mp4`; upload to whichever CDN serves `sheepdogsim.com`.

**Acceptance:** Updated hero OG cards committed (≤300KB each). 4 MP4s on the CDN with embed working in the marketing page. Each video <10MB.

## Phase 2 — Cloudflare Web Analytics beacon (~30min) [Matt-gated]

Carryover from Cycle 12 Phase 5.

**Depends on:** nothing.

1. Matt copies the CF Web Analytics beacon `<script>` from CF Pages console → Analytics tab.
2. Add to [`index.html`](../index.html) head, before any other scripts that might block.
3. Verify in the dashboard within 24 hours that pageviews are flowing.

**Acceptance:** Beacon visible in CF Web Analytics dashboard with at least one logged pageview.

## Phase 3 — Manual playtest sweep (~2-3hr) [Matt-gated]

Carryover from Cycle 12 Phase 5.

**Depends on:** Phase 6 of Cycle 12 (closed); the new leaderboard surface (`Filters` disclosure, Clear-filters action) is part of the playtest target.

1. **Solo sweep:** Field/RH/OC × Classic/Extreme/Insane/Chaos/Timed. 5 modes × 3 scenes = 15 runs minimum.
2. **MP sweep:** Cooperative + Competitive at 200/250/500/1000 sheep counts on Field. Verify host sheepCount stickiness, guest invite scene rendering, leaderboard partition behavior.
3. **Leaderboard sweep:** Open the panel cold. Solo Classic tab → entries visible. Switch to MP tab → filter disclosure expanded, defaults to "Any size". Pick a non-existent filter → empty state shows Clear-filters action. Click → entries return.
4. **Carry-forward verification items:** Solo Classic 0/200 (Cycle 9), MP host sheepCount stickiness (Cycle 9), guest invite scene rendering (Cycle 9), leaderboard solo dropdown hidden (Cycle 9), sheep+dog patch Y-lift (Cycle 9), follow-camera under stamina-out + tree contact (Cycle 8), frametime regression on RTX 3070 (Cycle 8).
5. **Phase 1 A8 verification:** run `await window.__sdsStressTestSwaps(5)` from DevTools and confirm drift < 5% on geometries, textures, programs.

**Acceptance:** All items walked. Any regression filed as a Cycle 13 hotfix (or escalated as a Cycle 14 phase if structural).

## Phase 4 — Sky-shader precision + dither (~1-2hr) — **CLOSED 2026-05-02 (shipped post-Cycle-12-close)**

Carryover from Cycle 12 Phase 4 close-summary research. Pulled forward and shipped on the same day Cycle 12 closed.

**Shipped (commit `04e62e7`):**

1. `precision highp float;` and `precision highp int;` added at source in [`js/atmosphere/skyShader.glsl.js`](../js/atmosphere/skyShader.glsl.js) (vertex + fragment), [`js/atmosphere/cloudShader.glsl.js`](../js/atmosphere/cloudShader.glsl.js) (vertex + fragment), [`js/shaders/grass/desktop-vertex.glsl`](../js/shaders/grass/desktop-vertex.glsl), and [`js/shaders/grass/mobile-vertex.glsl`](../js/shaders/grass/mobile-vertex.glsl). Grass fragment already had it from a prior cycle.
2. 1/255 hash dither at the final fragment write in `skyShader.glsl.js` to break 8-bit color quantization on the horizon gradient. Stable per-pixel-per-frame so it doesn't shimmer.
3. New [`tests/shader-precision.spec.js`](../tests/shader-precision.spec.js) — 8 cases pinning the shader-source contract.

**Acceptance:** Source contract is pinned; tests green; production build clean. **Outstanding verification (Matt-gated):** trigger the macOS Safari workflow manually via `gh workflow run macos-safari.yml` after deploy and inspect the artifact for sky-region samples — the rainbow stripe should be gone. Visual sweep on Matt's actual Mac is the final confirmation.

## Phase 5 — Leaderboard scene-as-classification (~3-5hr)

Reported 2026-05-02 by Matt at Cycle 12 close: scene should be a classification axis, not a filter. Each `(mode, scene)` pair is fundamentally a different competition (terrain changes strategy) and should have its own top-N leaderboard.

**Depends on:** nothing. Builds on Cycle 12 Phase 6's slow-path / fast-path fallback semantics.

**Open questions before writing code:**

1. **Q1: Two-axis tabs or mode-tab + scene segmented-control inside?** Author lean: mode-tab + scene segmented-control inside, replacing the disclosure. Smaller visual delta from today's surface; reads like "pick a mode, pick a course." Two-axis tabs are cleaner taxonomically but a bigger UX rewrite.
2. **Q2: Does `getAllLeaderboards` (the panel-overview endpoint) return one entry per (mode, scene) or per mode with an embedded scene rollup?** Author lean: one entry per (mode, scene) — cleaner, mirrors the slow-path query shape, lets the frontend dedupe by mode locally.
3. **Q3: What does the empty-state look like when a (mode, scene) pair has no entries?** Today's "Clear filters" affordance won't apply since the user is making an explicit choice, not filtering. Probably "Be the first — play this scene now" CTA that links into the start screen pre-selected.

**Plan (subject to Q1-Q3 resolution):**

1. **Frontend ([`js/components/Multiplayer/GlobalLeaderboard.js`](../js/components/Multiplayer/GlobalLeaderboard.js)):** scene becomes a primary classification. Replace the collapsible Filters disclosure on solo+timed tabs with a scene segmented-control directly under the tab header (Field / Rolling Hills / Open Country). Cooperative + competitive keep their existing filter model since they don't have meaningful per-scene partitioning today (or do they? — fold into Q3).
2. **Worker:** `getLeaderboard` already partitions by `(mode, scene_id, sheep_count)` — no schema change. The frontend just stops defaulting `scene=` to undefined and starts always sending it. Validate at the boundary that scene is a known scene id.
3. **`getAllLeaderboards` shape:** decide per Q2. If one-entry-per-(mode,scene), bump 7 modes × 3 scenes = 21 board responses; might want pagination or a "summary" mode that returns top-3 only.
4. **No D1 backfill needed.** The 0005 backfill from Cycle 12 already synthesized one row per (player, mode) on the mode's natural scene; entries on non-natural scenes simply have no row, which is correct ("no entries on this leaderboard yet").
5. **Tests:** extend [`tests/worker-leaderboard.spec.ts`](../tests/worker-leaderboard.spec.ts) — every (mode, scene) pair returns the right top-N. New frontend snapshot test (when introduced) for the segmented-control wiring.

**Acceptance:** Each `(mode, scene)` pair has its own top-N visible directly in the panel. Scene is no longer a filter — it's a classification axis. Empty (mode, scene) pairs show a helpful CTA, not a "clear filter" affordance. No regression on existing valid scene+sheepCount combinations for cooperative/competitive.

## Phase 6 — `v1.1.0` tag push (~15min)

**Depends on:** Phase 1 (videos + hero OG shipped). Phases 2, 3, 5 are nice-to-haves but should land first if they're going to.

1. Bump version in [`package.json`](../package.json) and [`worker/package.json`](../worker/package.json).
2. Append CHANGELOG entry.
3. `git tag v1.1.0 && git push origin main --tags`.

**Acceptance:** Tag pushed, GH Actions deploy completes, sheepdogsim.com serves new build.

## Dependencies

```
Phase 1 (videos + hero OG)            — independent, Matt-gated
Phase 2 (CF Analytics)                — independent, Matt-gated
Phase 3 (playtest)                    — depends on Cycle 12 Phase 6 (closed); Matt-gated
Phase 4 (sky precision)               — closed 2026-05-02
Phase 5 (leaderboard classification)  — independent
Phase 6 (v1.1.0 tag)                  — depends on Phase 1
```

Phases 1, 2, 3, 5 fully parallelizable. Phase 6 waits on Phase 1.

## Frozen files (cycle-specific additions)

- (None beyond the durable fence in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).)

## Hard stops

1. Frozen-file change without scope authorization — see [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).
2. Sim-baseline test failure — escalate, do not regenerate.
3. Visual regression on a previously-passing scene.
4. Phase 4 sky shader change must not regress the existing daytime / dusk / overcast / dawn / golden-hour preset look on desktop Chrome — those are the baseline.

## What NOT to do during this cycle

- Don't introduce a new scene.
- Don't redesign the marketing page from scratch — Phase 1 is one section addition.
- Don't ship Electron packaging.
- Don't re-trigger the cinema runner during regular dev — committed OG/dog/PWA assets get re-rendered with sub-pixel-different WebP encoding and create diff noise. Pass `--shot=<id>` to scope iteration.
- Don't tag `v1.1.0` until Phase 1 + Phase 4 land cleanly.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] Phase 1 — Hero OG cards refreshed + 4 cinematic video shots rendered + uploaded; embedded on marketing page.
- [ ] Phase 2 — CF Web Analytics beacon flowing pageviews to dashboard.
- [ ] Phase 3 — Manual Solo + MP playtest sweep walked + documented.
- [x] Phase 4 — Sky-shader precision + dither shipped (commit `04e62e7`, 2026-05-02). Mac visual confirmation via `gh workflow run macos-safari.yml` still pending.
- [ ] Phase 5 — Leaderboard scene-as-classification: each `(mode, scene)` pair has its own top-N; scene is no longer a filter.
- [ ] Phase 6 — `v1.1.0` tag pushed.
- [ ] All vitest specs pass.
- [ ] Production build clean.
- [ ] Live on sheepdogsim.com via GH Actions.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — cycle template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/mac-bug-research.md`](mac-bug-research.md) — Mac white-ground + sky-banding investigation
- [`docs/archive/cycles/cycle-12-plan.md`](archive/cycles/cycle-12-plan.md) — prior cycle plan
