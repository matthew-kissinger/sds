# Cycle 26 — autonomous run wake-state report

> Written 2026-05-08 at the close of the autonomous Cycle-26 run that
> Matt directed: "implement rest autonomously until media session."
> This is the morning briefing — read this first. Three patches landed
> on `main`, two are independently verifiable, the third still needs
> Matt's iPhone in hand.

## TL;DR

| Ship | Status | Verification |
|---|---|---|
| **`v2.0.4`** — iOS tone-mapping branch | Deployed | **Needs iPhone test** — does the water sheen disappear? |
| **`v2.0.5`** — delete dead AtmosphericDesatPatch | Deployed | Spot-check Field/RH/OC look identical to v2.0.4. No visible change expected. |
| **`v2.1.0`** — Practice Paddock + per-scene SEO | Deployed | Practice tile pulses on first visit; no leaderboard submission; per-scene OG cards distinct |
| **`v2.1.1`** — OG card refresh (RH dusk + Field farmhouse) | Pending push at write time | Twitter / Facebook re-scrape via debuggers post-deploy. Open-country OG retained from prior cycle. |

vitest 188 → 201 (+13). Build 837.43 KB → 835.48 KB main / 250.34 KB → 250.04 KB gzip (net -1.95 KB / -0.30 KB across the cycle).

## What shipped — in order

### v2.0.4 — Apple tone-mapping branch extends to iPhone/iPad
Triggering issue: Matt reported a "big sheen of white" over the water on iPhone. v2.0.3 had fixed Mac via `/Mac/.test(navigator.platform || navigator.userAgent || '')` but `navigator.platform === 'iPhone'` doesn't match `/Mac/`. iPhone was running ACES, the same curve that washed the Mac.

Change at [js/SceneManager.js:127-128](js/SceneManager.js): regex extended to `/Mac|iPhone|iPad|iPod/`, var renamed `isMacPlatform` → `isApplePlatform`, comment + log updated.

Contingency: if Neutral tone-mapping isn't enough on iPhone, the structural follow-up is the [AnimeWater](js/water/AnimeWater.js) shader rework — that material currently writes `gl_FragColor` raw (no `<tonemapping_fragment>` chunk), so it bypasses the renderer's tone-map pipeline regardless of which curve is active. Tracked as v2.0.6+ contingent on Matt's iPhone test of v2.0.4.

### v2.0.5 — delete dead AtmosphericDesatPatch
Plan-mode exploration revealed the `AtmosphericDesatPatch` was a no-op since v2.0.0: `_desatConfiguredStrength = 0` was zero-multiplying the per-frame pitch math at [TerrainBuilder.js:2038](js/TerrainBuilder.js). Mobile-low LOD1 and the kiln impostor received the same zeroed uniforms — all three tiers paying for dead code.

The polish-program doc had this scheduled for deletion; it was just neutralized in Cycle 25 Phase B and not removed. v2.0.5 finishes the cleanup:

- Deleted `js/shaders/AtmosphericDesatPatch.js` (entire 127-LOC module)
- Removed plumbing in `js/TerrainBuilder.js`: `_desat` block, `_desatConfiguredStrength`, `_desatHighPitchFloor`, per-frame pitch math, kiln-impostor uniform sync, `patchMaterialDesat` call, `smoothstep01` helper, import line
- Removed `uDesatStartM/EndM/Strength` declarations + fragment math + uniform values from `js/kiln-impostor-material.js`
- Pruned 2 dead tuning-knob rows from NEXT_SESSION.md

Net: ~190 LOC removed; build -2.64 KB main / -0.48 KB gzip; vitest unchanged (no specs referenced desat).

### v2.1.0 — Practice Paddock + per-scene SEO
First Cycle-26 minor. Pivot toward the player-facing layer.

#### Practice Paddock — "Just Play" mode
- New mode tile at position 0 in [SinglePlayerModes.js](js/components/StartScreen/SinglePlayerModes.js) (before Classic). 30 sheep, no timer pressure, no leaderboard, cyan-500 accent.
- First-visit pulsing-glow on the Practice tile via `localStorage.getItem('sds.has-played')` flag. Pulse stops the moment the player launches any solo run.
- New [`PracticeHint`](js/components/GameHUD/PracticeHint.js) bottom-center fade overlay. Auto-dismisses after 8s OR on first keyboard / pointer / touch input. Self-unmounts after fade.
- Score submission gated against practice mode in [GameState.submitScoreToLeaderboard](js/GameState.js) AND [main.showCompletionOverlay](js/main.js).
- 8 contract tests in [tests/practice-mode.spec.js](tests/practice-mode.spec.js) lock the surface (tile order, accent color, localStorage key shape, score-gate, sheep count, component existence).

Subjective-call: hint text reads "WASD or arrow keys to move · Shift to sprint." The cycle plan referenced "S to whistle" but the codebase has no whistle mechanic (the dog auto-barks near sheep). First-input dismiss substitutes for first-whistle.

#### Per-scene SEO metadata
Index.html SEO baseline was already strong (hreflang × 18, full OG + Twitter, schema.org VideoGame + FAQPage + WebApplication, sitemap, robots, preconnect, PWA manifest). Gap: per-scene `?scene=X` deep-links shared the same OG card.

- New [js/utils/seo.js](js/utils/seo.js) — `updateSceneMetadata(sceneId)` updates `document.title` + full `og:*` + `twitter:*` + `meta[name=description]` from `shared/scenes/*` `name`+`description` plus existing `og-{field|rh-sunset|open-country}.webp`.
- Wired into both initial scene load and scene-swap path in [main.js](js/main.js).
- 5 contract tests in [tests/seo.spec.js](tests/seo.spec.js) lock that all 3 scenes are registered, OG images exist on disk, titles are distinct, and the helper mutates the right meta tags.

**Decided not done:** sitemap update with per-scene URLs. `?scene=X` is just a SPA query param — adding URLs to sitemap.xml would fragment SEO juice across non-canonical URLs. Canonical stays `/`.

## What stayed parked

Per the plan agent's pushback (and Matt's autonomous instruction), these items deferred:

- **Phase 3 visual design pass** (CSS-vars refactor, title-screen motion). Both are taste-dependent — better to land alongside Matt's media-session sync.
- **AudioManager Safari verification.** Try/catch silently swallows AudioContext failures. Real Safari device test bundles into the media session.
- ~~**Lighthouse audit.**~~ Ran against production: **SEO score 100** — no audits failing, no cheap wins to apply. Artifact: [`cycle26-validation/lighthouse-seo.json`](cycle26-validation/lighthouse-seo.json).
- **Bundle-size split beyond manualChunks.** Investigation surfaced no obvious wins (react/three/i18n already split, @msgpack runtime-required, locale split would save <30KB).
- **iPhone water-sheen verification.** v2.0.4 hypothesis is Apple-platform-detection extension. Needs Matt's iPhone to confirm.

## Recommended morning actions for Matt

1. **iPhone test (v2.0.4 verification)** — open `https://sheepdogsim.com/` on iPhone Safari. Water surface should NOT have a white sheen. If it does → v2.0.6 ships the AnimeWater shader rework.
2. **M4 Mac re-verification (v2.0.3 still holds, v2.0.5 didn't regress)** — open the same URL on the Mac. Should look identical to before.
3. **Practice Paddock walk-through** — clear localStorage (`localStorage.clear()` in devtools) → reload → confirm "Just Play" tile pulses cyan in the Single Player → Mode picker. Click it. Confirm:
   - 30 sheep visible (much fewer than Classic's 200)
   - No timer pressure (timer counts up, no pressure)
   - PracticeHint fades in bottom-center, dismisses on movement or after 8s
   - Reload — pulse is GONE (the flag persisted)
4. **Per-scene SEO verification** — load `?scene=field`, `?scene=rolling-hills`, `?scene=open-country`. In each, F12 → check `document.title` and `<meta property="og:image">` are distinct.
5. ~~**Lighthouse audit**~~ — already done. SEO 100. Skip.
6. **Schedule the media session** — refreshed manifest at [cycle26-validation/shot-list-v2.md](cycle26-validation/shot-list-v2.md). Two newly-unblocked shots worth promoting to Tier 1: `practice-paddock-hero` and `vert-4-just-play-onboarding`. Pre-shoot: `localStorage.clear()` so the first-visit pulse captures cleanly.

## Cycle 26 status after this run

| Cycle plan area | State |
|---|---|
| 1. UX / UI — Practice Paddock | ✅ shipped (v2.1.0) |
| 1. UX / UI — pointer-tour onboarding | ❌ deferred (overlapped with PracticeHint scope) |
| 1. UX / UI — HUD review across 3 res | ❌ deferred (no concrete bug surfaced) |
| 1. UX / UI — settings panel polish | ❌ deferred |
| 2. Visual design pass (LIGHT or full) | ❌ DEFERRED — taste calls land wrong without Matt at the keyboard |
| 3. User engagement — daily seeds, replays, share-card | ❌ deferred (separate cycle scope) |
| 4. Marketing media session | 🟡 prep done — refresh manifest at `shot-list-v2.md`; Matt-side capture pending |
| 5. SEO — per-scene meta | ✅ shipped (v2.1.0) |
| 5. SEO — Lighthouse audit | ✅ ran post-deploy — SEO 100 (no cheap wins to apply) |
| 6. Community — devlog venue + launch posts | 🟡 deferred until post-shoot (assets needed) |
| 7. Polish — Mac fix verification | 🟡 pending Matt's M4 |
| 7. Polish — v1.4.0 playtest items | ✅ already shipped (Cycle 23/24/25) |
| 7. Polish — Audio Safari path | 🟡 pending real device |
| 7. Polish — bundle-size investigation | ✅ DONE-as-investigated (no quick wins) |
| 7. Polish — dead AtmosphericDesatPatch | ✅ shipped (v2.0.5) |
| 8. WebGPU / new tech | ❌ parked (out of scope) |

The cycle is mid-stream: code work autonomous-completable is done. Live verification + media shoot + community kickoff still depend on Matt.

## Validation summary

- **vitest:** 188 → 201 (+13 specs across practice-mode + SEO).
- **Production build:** 837.43 KB → 835.48 KB main / 250.34 KB → 250.04 KB gzip (net -1.95 KB / -0.30 KB across all 3 ships).
- **Deploys triggered (in order):**
  - [v2.0.4 #43](https://github.com/matthew-kissinger/sds/pull/43): Pages + Worker + Test + E2E green; perf-check noise (swiftshader extreme) — documented standing risk.
  - [v2.0.5 #44](https://github.com/matthew-kissinger/sds/pull/44): in-progress at writeup time.
  - [v2.1.0 #45](https://github.com/matthew-kissinger/sds/pull/45): pending in deploy queue.
- **No hard stops triggered.** No `cycle26-validation/<phase>/HARDSTOP.md` files written.
- **Sim-baseline byte-identical** (no boid-sim changes in any of the 3 patches).
