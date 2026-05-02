# Cycle 13 — `marketing-and-validation`

> Drafted 2026-05-02 after Cycle 12 closed (`post-v1-polish` — A8 stress drift, UI Button variants, Mac bug research, leaderboard fix all shipped; cinematic videos + CF Web Analytics + manual playtest carried forward as Matt-gated). Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Land the marketing-asset and analytics work that Cycle 12 left Matt-gated, plus pick up the highest-value next-step from the Phase 4 Mac bug research (force-precision in the sky shader + dither, the highest-confidence win). User-visible difference: the marketing page has the four demo videos, sheepdogsim.com has CF Web Analytics flowing, and the rainbow horizon-banding artifact in the sky is gone.

## How to read this plan

This doc fixes the shape of the changes, not the implementation choices. Phases 1-3 are Matt-gated (cinematic capture window, dashboard copy/paste, manual playtest). Phase 4 is straight code work. Phase 5 is the first cycle 12 carryover — once Phase 1 lands, the v1.1.0 tag becomes the natural close.

## Open questions to resolve before writing code

1. **Q1: Marketing-page location for the cinematic videos.** Author lean: a new section on `index.html` below the start screen, OR a separate `/about.html` block. Decide before Phase 1 lands so the embed targets are clear.
2. **Q2: Sky-shader precision/dither — ship behind a flag or hard ship?** Author lean: hard ship. The fix is a no-op on hardware that already runs at highp; the dither is +1 instruction in the fragment write. No reason to flag-gate.

## Phase 1 — Cinematic video render + marketing embed (~4-6hr) [Matt-gated]

Carryover from Cycle 12 Phase 3.

**Depends on:** nothing.

1. Run `npm run cinema -- --headed` and let it render the 4 video shots (`dog-into-sunset`, `lightning-strike`, `chaos-5000`, `oc-portal`). Vite must be on port 3000; runner spawns it if not running.
2. Iterate framing in [`tools/cinematic/shot-list.mjs`](../tools/cinematic/shot-list.mjs) per shot. The `oc-portal` shot has a "Pause until first sheep ascends" inline note (line 74) — adjust the schedule so the descent lands at the moment the first sheep enters the corral portal.
3. Mux 1080p master + 720p downscale per shot (the runner does both via ffmpeg).
4. Marketing-page embed (Q1 location).
5. CDN upload — gitignored MP4s land in `assets/marketing/videos/<id>.mp4`; upload to whichever CDN serves `sheepdogsim.com`.

**Acceptance:** 4 MP4s on the CDN with embed working in the marketing page. Each <10MB.

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

## Phase 4 — Sky-shader precision + dither (~1-2hr)

Carryover from Cycle 12 Phase 4 close-summary research.

**Depends on:** nothing.

1. Add `precision highp float;` and `precision highp int;` to the top of the fragment-shader source in [`js/atmosphere/skyShader.glsl.js`](../js/atmosphere/skyShader.glsl.js). Before the `varying` declarations.
2. Apply the same change to the cloud shader in [`js/atmosphere/cloudShader.glsl.js`](../js/atmosphere/cloudShader.glsl.js) and the grass shader's external `.glsl` files.
3. Add 1/255 hash dither at the final fragment write in `skyShader.glsl.js`:
   ```glsl
   float dither = (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
   gl_FragColor = vec4(texColor + vec3(dither), 1.0);
   ```
   `hash21` is already defined.
4. Trigger the macOS Safari workflow manually via `gh workflow run macos-safari.yml` and inspect the artifact for sky-region samples in the captured framebuffer.

**Acceptance:** GH macOS Safari smoke green. Visual sweep on Matt's actual Mac confirms rainbow-banding stripe is gone. No frame-rate regression on RTX 3070 (precision and dither are both essentially free ops).

## Phase 5 — `v1.1.0` tag push (~15min)

**Depends on:** Phase 1 (videos shipped) and Phase 4 (sky banding fix landed). Phase 2 + Phase 3 are nice-to-haves but should also land first if they're going to.

1. Bump version in [`package.json`](../package.json) and [`worker/package.json`](../worker/package.json).
2. Append CHANGELOG entry.
3. `git tag v1.1.0 && git push origin main --tags`.

**Acceptance:** Tag pushed, GH Actions deploy completes, sheepdogsim.com serves new build.

## Dependencies

```
Phase 1 (videos)         — independent, Matt-gated
Phase 2 (CF Analytics)   — independent, Matt-gated
Phase 3 (playtest)       — depends on Cycle 12 Phase 6 (closed); Matt-gated
Phase 4 (sky precision)  — independent
Phase 5 (v1.1.0 tag)     — depends on Phase 1 + Phase 4
```

Phases 1-4 are fully parallelizable. Phase 5 waits on the others.

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

- [ ] Phase 1 — 4 cinematic video shots rendered + uploaded; embedded on marketing page.
- [ ] Phase 2 — CF Web Analytics beacon flowing pageviews to dashboard.
- [ ] Phase 3 — Manual Solo + MP playtest sweep walked + documented.
- [ ] Phase 4 — Sky-shader precision + dither shipped; rainbow-banding gone on Matt's Mac.
- [ ] Phase 5 — `v1.1.0` tag pushed.
- [ ] All vitest specs pass.
- [ ] Production build clean.
- [ ] Live on sheepdogsim.com via GH Actions.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — cycle template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/mac-bug-research.md`](mac-bug-research.md) — Mac white-ground + sky-banding investigation
- [`docs/archive/cycles/cycle-12-plan.md`](archive/cycles/cycle-12-plan.md) — prior cycle plan
