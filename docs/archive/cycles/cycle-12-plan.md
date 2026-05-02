# Cycle 12 — `post-v1-polish` — **CLOSED 2026-05-02**

> Drafted 2026-04-28 after Cycle 11 closed (`release-finish`, v1.0.0 shipped). Closed 2026-05-02. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **Close summary:** Phase 1 (A8 stress drift), Phase 2 (UI Button variants), Phase 4 (Mac bug research doc), Phase 6 (leaderboard data-visibility) all shipped. Phase 3 (cinematic videos) and Phase 5 (CF Web Analytics + manual playtest) carried forward as Matt-gated — pipeline + acceptance criteria documented, no autonomous render. See per-phase status block at the bottom of each phase + the "Cycle 12 close summary" in BACKLOG.md.

## Goal

Stabilize and polish v1.0 after the initial release: close the strict-numeric A8 stress drift on scene swap, finish the UI unification carryover, fill in the cinematic video shots, run the deferred Mac rendering bug investigation, and walk the still-deferred Cycle 8/9 manual playtest backlog. User-visible delta: smoother repeat-swap session ergonomics, a properly unified Settings UI, real demo videos for marketing, and a documented Mac rendering fix.

## How to read this plan

This doc fixes the shape of the changes, not the implementation choices. Each phase author should research current Three.js disposal best practices and confirm assumptions on Matt's specific hardware before committing.

## Open questions to resolve before writing code

1. **Q1: A8 stress drift root cause.** Where is the remaining ~41% texture leak? Author lean: investigate per-swap subsystems with `renderer.info.programs` snapshots between each disposeScene step (atmosphere, sun billboard, terrain, water) to isolate the source. Suspect ShaderMaterial program cache or Atmosphere recreation.
2. **Q2: Mac rendering bug — environmental or shader?** Author lean: still environmental (GH Actions Safari renders correctly). Capture `window.__sdsDiag` from Matt's Mac per the cycle-9 recipe before deciding remediation path.
3. **Q3: Video filming pipeline — keep Playwright or switch to in-game capture?** Author lean: keep Playwright + headed mode. Headless Chromium WebGL is too flaky on Win for batch captures.

## Phase 1 — A8 stress drift fix (~3-5hr) — **CLOSED 2026-05-02**

**Independently testable.** Cycle 11 Phase 1 left the texture drift at ~41% over 5×3 swap loop. The architecture works (no crashes, no visual regressions), but the slow accumulator is a v1.1 polish item.

1. Instrument `disposeScene()` to snapshot `renderer.info.memory.textures + .programs` between each subsystem dispose. Capture before/after and log deltas.
2. Identify which subsystem is the dominant remaining leaker (Atmosphere recreation? Per-swap ShaderMaterial compilation? Sky-dome shader programs?).
3. Pick the simplest fix that brings drift under 5%. Likely candidates: cache HosekWilkieSky/CloudLayer materials across swaps (instead of recreating Atmosphere), or compile programs once and reuse.

**Acceptance:** `await window.__sdsStressTestSwaps(5)` reports `< 5%` drift on geometries, textures, and programs.

**Close summary.** Root cause was NOT atmosphere recreation. It was the same GLB shared-material trap Cycle 11 found for sheepdog and structures, but applied to **trees and rocks**: `clearTrees()` / `clearRocks()` in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) were calling `geometry.dispose()` + `material.dispose()` on near-tree/rock InstancedMeshes whose geometry+material are SHARED with the cached GLB models. Disposing invalidates the cache; the next swap forces a full texture re-upload — the dominant ~41% drift class.

Fix: tag near-tree/rock InstancedMeshes with `userData.sharedFromGlbCache = true` on creation; `clearTrees`/`clearRocks` skip dispose for tagged meshes (remove-from-scene only). Far-tree billboards keep their per-swap-allocated `MeshBasicMaterial` dispose path, with `.map` cleared to null first so the cached impostor texture survives.

Also added optional per-subsystem `renderer.info` instrumentation in `disposeScene()` gated behind `window.__sdsSwapDriftLog` — off by default, allocation-free on normal swaps. Surfaces Δgeo/Δtex/Δprog deltas per subsystem (sceneAbort → effects → sheep → sheepdog → structures → water → terrain → atmosphere → sunBillboard) for future drift diagnostics.

New [`tests/swap-drift-glb-guard.spec.js`](../tests/swap-drift-glb-guard.spec.js) — 5 cases pinning the disposal contract (shared meshes skip dispose, owned meshes dispose, .map cleared but cached texture survives, repeated swap cycles don't accumulate dispose calls on shared resources, parent.remove called regardless of guard).

## Phase 2 — UI unification carryover (~6-10hr) — **CLOSED 2026-05-02**

**Depends on:** nothing.

1. **Mode-shaped HUD subcomponents** ([`js/components/GameHUD/`](../js/components/GameHUD/)): extract `<SoloClassicHUD>`, `<TimedHUD>`, `<CompetitiveHUD>`, `<ChaosHUD>`/`<InsaneHUD>` from the inline branching in `App.js`. Preserve existing prop shapes — these are visual-shape variants, not new logic.
2. **Button component unification.** Audit raw `<button>` and `createElement('button', ...)` in [`js/components/`](../js/components/) (~40-50 callsites, primarily in [`SettingsPanel.js`](../js/components/StartScreen/SettingsPanel.js)). Extend [`Button.js`](../js/components/ui/Button.js) with `variant: 'primary' | 'secondary' | 'ghost' | 'icon'` + `size: 'sm' | 'md' | 'lg'`. Migrate raw buttons preserving exact visual style. Don't touch keybind input UI (special-case).

**Acceptance:** Visual sweep all surfaces; no regressions; `npm test` green; `npm run build` clean.

**Close summary.** Phase 2 shipped with measured scope after the audit produced two findings the original plan didn't anticipate:

- **Mode-shaped HUD extraction is N/A.** [`js/components/GameHUD/App.js`](../js/components/App.js) does NOT branch by game mode — it branches by **platform** (desktop vs mobile) and **multiplayer status** (`MultiplayerScoreboard` vs `SheepCounter`). Modes share the same HUD skeleton; only `ExtremeTuningPanel` keys off `isSoloExtremeOrInsane`. `<MobileHUD>` already exists. There is no `<SoloClassicHUD>` / `<TimedHUD>` / `<CompetitiveHUD>` extraction that would not just rename existing files. Documented and skipped.
- **The raw button count is 60 across 20 files, not ~40-50 in SettingsPanel.** SettingsPanel actually has 8 raw buttons; the rest of the volume is in PauseMenu, FenceEditor, SandboxSetup, MobileControls, etc. Most of the 60 are specialized UI primitives (`Toggle`, `TabButton`, `KeyBindButton`, `PresetButton`, `CameraModePicker` option, `MenuOption`, `MobileControls` icon-circular) that already have their own component and are not visually compatible with the glass-button shape.

What shipped:

- **[`Button.js`](../js/components/ui/Button.js) extended** with `ghost` (transparent text-link with underline) and `danger` (red destructive) variants on top of the existing `primary` / `secondary` glass family. Plus a `size: 'sm' | 'md' | 'lg'` prop that overrides the responsive default sizing for inline actions inside settings rows. The variants are now the home for any future glass-button addition.
- **Migrated 3 raw `<button>` sites in SettingsPanel** — the player-profile reset (`danger sm`), the keybind-reset link (`ghost sm`), and the global "Reset defaults" header action (`danger sm`). All three were inline `<button>` with bespoke red-toned styles; they now share the variant theme.

The remaining specialized clusters (Toggle, TabButton, KeyBindButton, PresetButton, MenuOption, icon-circular zoom/sprint controls, mode-themed completion-screen CTA) stay distinct on purpose — they're separate UI primitives, not visual variants of `Button`.

## Phase 3 — Cinematic video shots (~4-6hr) — **DEFERRED to Cycle 13 (Matt-gated)**

**Depends on:** nothing.

1. Run `npm run cinema --headed` to render the 4 video shots (`dog-into-sunset`, `lightning-strike`, `chaos-5000`, `oc-portal`).
2. Iterate on shot framing in [`tools/cinematic/shot-list.mjs`](../tools/cinematic/shot-list.mjs) until each looks right.
3. Mux 1080p master + 720p downscale per shot.
4. Marketing page (TBD location): embed the 4 demos.

**Acceptance:** 4 MP4s in `assets/marketing/videos/` (gitignored), each <10MB, ready for CDN upload.

**Close summary.** Pipeline is verified ready: ffmpeg 7.1 on PATH, Playwright 1.59.1, Chromium 1217 installed, sharp 0.34.5 in devDeps, shot list at [`tools/cinematic/shot-list.mjs`](../tools/cinematic/shot-list.mjs) is sane, all 8 `__sdsCinema` API methods the runner needs are implemented in [`js/cinematic.js`](../js/cinematic.js).

Render not executed in Cycle 12 because:
- Iterating shot framing requires visual judgment + a visible Chromium window — best done with Matt at the keyboard.
- The `oc-portal` shot has a "Pause until first sheep ascends" inline TODO (line 74 of shot-list) that needs a frame-timing adjustment.
- Re-running the runner without `--skip-video` ALSO re-renders the committed OG WebPs in [`assets/marketing/og/`](../assets/marketing/og) and dog portraits in [`assets/dogs/`](../assets/dogs) — the WebP encoder produces sub-pixel-different output that creates diff noise even when the shot list is unchanged.

To run: ensure no other process holds port 3000 (or have `npm run dev:client` running), then `npm run cinema -- --headed --skip-video=false` for video-only or just `npm run cinema -- --headed` for the full set. Output lands in `assets/marketing/videos/<id>.mp4` (gitignored). Iterate framing per shot via tweaks in [`tools/cinematic/shot-list.mjs`](../tools/cinematic/shot-list.mjs); re-run with `--shot=<id>` for one-shot iteration loops.

## Phase 4 — Mac rendering bug investigation (~4-8hr matt + AI)

**Depends on:** Matt running the diagnostic recipe; optionally a Browserbase API key to enable AI-driven repro on remote macOS Safari.

**Visual evidence captured 2026-05-02** (photos at `~/Downloads/sds-mac-bug/`):
- Pre-bug frame shows strong rainbow color-banding stripe across the sky horizon — looks like 8-bit color quantization or ACES tonemap precision artifact, not the white-ground bug itself but a separate Mac/Safari issue.
- White-ground manifests with **terrain only** affected — trees, sheep, rocks, fence all render correctly. That narrows the suspect to the terrain shader pipeline (`BlendedTerrainMaterial`, grass instanced mesh, or heightfield texture upload), not a global WebGL context failure.

1. Matt opens `https://sheepdogsim.com/?scene=rolling-hills&debug=gl` on his Mac, plays Solo Classic until white-ground manifests, captures `window.__sdsDiag` via Safari DevTools (shader-compile errors, extension list, GPU vendor string).
2. AI compares against working baseline at GH run [25028575425](https://github.com/matthew-kissinger/sds/actions/runs/25028575425) and against the new Cycle 12 photo evidence.
3. **Research `BlendedTerrainMaterial` and grass instanced mesh** for Safari/Mac WebGL gotchas: float-texture filtering, `RGBA32F` fallback paths, conditional `defines` that may silently fail to compile, uniform-array sizing limits.
4. **Browserbase remote-Safari spike.** Matt provisioned a Browserbase API key (stored at `~/.config/mk-agent/env` as `BROWSERBASE_API_KEY`, 2026-05-02). AI uses Browserbase (Playwright + remote browser) to reproduce on managed Safari/macOS and iterate on the fix without round-tripping through Matt's machine each time. **Sub-tasks:** verify Browserbase free-tier limits cover the iteration budget; if not, document upgrade asks for Matt to consider. Investigate alternatives as fallback: BrowserStack, LambdaTest, GH `macos-latest` runner with `playwright/test --browser=webkit`. Document chosen path in `docs/mac-bug-research.md`.
5. Investigate the **sky-banding artifact** as a side track: likely missing dither in `js/atmosphere/skyPresets.js` ACES tonemap, or precision loss on Safari's default float framebuffer.
6. Pick remediation per issue: shader fix, fallback path, or document as known issue.

**Acceptance:** White-ground bug is either fixed or documented in `BACKLOG.md` with workaround. Sky-banding is fixed or documented. Browserbase spike concluded with go/no-go recommendation.

**Close summary (closed 2026-05-02).** Documented in [`docs/mac-bug-research.md`](mac-bug-research.md) per acceptance "fix or document":

- **Browserbase Safari spike — no-go.** [docs.browserbase.com](https://docs.browserbase.com) and `/llms.txt` do not list Safari/WebKit as a supported browser. Browserbase manages Chromium-family containers only; "WebKit" in Playwright refers to the bundled WebKit build (which does not use Metal and therefore does not reproduce Mac/Safari/Metal-specific bugs — exactly why Cycle 9 stood up the GH `macos-latest` + `safaridriver` workflow). Recommendation: extend the existing GH Safari workflow rather than chasing remote-Safari-via-Browserbase. The provisioned `BROWSERBASE_API_KEY` is retained for future Chromium remote work.
- **Sky-banding hypothesis with concrete fix.** Hosek-Wilkie sky fragment shader has no explicit precision declaration ([`js/atmosphere/skyShader.glsl.js`](../js/atmosphere/skyShader.glsl.js)). The Preetham math contains `pow()` calls in the smallest-magnitude regime (`(1 - Fex)` on the horizon line) where Apple's WebKit on Metal can downcast. Fix sketch: add `precision highp float;` + `precision highp int;` at the top of the fragment source, plus a 1/255 hash dither on the final fragment write. Deferred (not shipped).
- **White-ground hypothesis with investigation steps.** Terrain-only failure narrows the suspect to `BlendedTerrainMaterial` (which doesn't exist — the plan's name; the actual material is the inline `ShaderMaterial` in [`js/TerrainBuilder.js:468-575`](../js/TerrainBuilder.js)) or grass external `.glsl` shaders or the `<fog_fragment>` chunk wiring. Pending Matt's `__sdsDiag` capture from his actual machine to discriminate.

## Phase 5 — Cloudflare Web Analytics + manual playtest (~2-3hr) — **DEFERRED to Cycle 13 (Matt-gated)**

1. Matt copies the CF Web Analytics beacon `<script>` from CF Pages console → Analytics tab. Add to [`index.html`](../index.html) head.
2. Manual Solo + MP playtest across Field/RH/OC, all modes (Classic/Extreme/Insane/Chaos/Timed/Competitive).
3. Verify: leaderboard partition filters (after Phase 6 fix), sandbox cross-scene reload, MP at non-200 sheep counts, follow-camera under stamina-out + tree contact, frametime regression on RTX 3070.

**Acceptance:** Beacon visible in CF dashboard; playtest items walked + documented.

**Close summary.** Both items are Matt-gated and not attemptable autonomously: the CF Web Analytics beacon `<script>` lives only in the Cloudflare Pages dashboard (manual copy/paste); the manual playtest requires a real player at the keyboard across Solo + MP modes. Carried to Cycle 13. Phase 6 (leaderboard fix) was the only Phase 5 dependency and is closed, so this is unblocked whenever Matt picks it up.

## Phase 6 — Leaderboard data-visibility + filter UX fix (~3-5hr) — **CLOSED 2026-05-02**

**Independently testable.** Reported 2026-05-02: leaderboard panel renders empty in browser even though prod D1 still holds all v1 entries. The data is **intact in `players.*_best` materialized columns** (fast path works) but **`score_submissions` is sparse** for pre-partition entries (slow path returns empty for ANY partition filter). The frontend forces a partition filter on every load, so the slow path is always used and always empty for old data.

**Close summary.** Worker + migration + frontend all shipped. Worker boundary now validates `mode=` (400 not 500); `getLeaderboard` falls through to fast path when partitioned slow path is empty AND filters match mode's natural partition; `getAllLeaderboards` drops `sheepCount` for fixed-count modes. Migration `0005_score_submissions_backfill.sql` applied to remote D1, synthesizing audit rows for pre-partition materialized bests. Frontend wraps filters in a collapsible `Filters` disclosure (default-collapsed on solo+timed, expanded on cooperative/competitive), defaults `sheepFilter=0` everywhere, surfaces an inline + empty-state Clear-filters affordance. New `tests/worker-leaderboard.spec.ts` adds 25 cases (validator + natural-partition matrix + 5 mocked-D1 fallback scenarios). Verified end-to-end: prod curl returns entries on `?mode=soloClassic&scene=field&sheepCount=200`; browser test confirms disclosure UX, active-filter indicator, and recovery via Clear-filters.

### Bug chain (verified empirically 2026-05-02)

- `/api/leaderboard?mode=soloClassic` (no filters) → returns real entries via fast path (`dev`, `dogerman`, `Player`, etc.)
- `/api/leaderboard?mode=soloClassic&scene=field` → `[]` (slow path; `score_submissions` has no matching rows)
- `/api/leaderboard?mode=soloClassic&scene=field&sheepCount=200` → `[]` (same — slow path)
- `/api/leaderboards?scene=field` → all modes `[]`

`score_submissions` (the audit/history table) is the only source for partitioned queries. Migration `0002_mode_matrix.sql` did `ALTER TABLE score_submissions ADD COLUMN sheep_count DEFAULT 200` and a backfill UPDATE — but `DEFAULT` only applies to rows that exist. If a player's best was materialized on `players.solo_classic_best` BEFORE `score_submissions` writes were live (or before they were partition-aware), there is no row in `score_submissions` to surface via slow path.

### Frontend bugs ([`js/components/Multiplayer/GlobalLeaderboard.js`](../js/components/Multiplayer/GlobalLeaderboard.js))

1. **Line 43:** `sheepFilter` initializes to `SOLO_TAB_FIXED_SHEEP_COUNT.soloClassic = 200`. Solo tabs hide the dropdown but the value is still sent on every request — that's the "filter that's there but shouldn't be."
2. Solo modes are mode-shaped; `sheepCount` partition is meaningless (the mode IS the count). Solo tabs should send no `sheepCount` param at all and let the worker take the fast path.
3. Scene filter on solo tabs forces the slow path even when "Home Field" is selected — user expects to see the all-time best (fast path), not a partitioned subset that excludes pre-partition entries.

### Worker bugs ([`worker/src/index.ts`](../worker/src/index.ts), [`worker/src/d1.ts`](../worker/src/d1.ts))

4. `/api/leaderboards` plural endpoint applies one `sheepCount` filter to all 7 modes — wrong for MP/timed/competitive where 200 isn't right.
5. `getLeaderboard` slow path falls off a cliff when `score_submissions` is sparse — no fallback to materialized columns, no warning, just empty.
6. `/api/leaderboard?mode=<invalid>` returns 500 D1_ERROR rather than 400 (long-standing input-validation gap, fold in while we're touching the file).

### Plan

1. **Frontend ([`GlobalLeaderboard.js`](../js/components/Multiplayer/GlobalLeaderboard.js)):** drop `sheepCount` from solo-tab requests entirely. Default `sheepFilter` to `0` on solo tabs ("any" — skipped by NetworkManager). Hide scene filter on solo tabs (or move it to a "Filter (advanced)" disclosure that's collapsed by default). For MP/timed/competitive tabs, default `sheepFilter` to `0` ("Any size") and only apply when explicitly picked.
2. **Worker:** add input-validation on `/api/leaderboard?mode=<x>` — 400 on unknown mode (don't let bad input flow into `bind`). Validate against `ALL_GAME_MODES` set.
3. **Worker:** in `getAllLeaderboards`, push the `sheepCount` filter inside per-mode dispatch — only apply for MP/timed/competitive modes that legitimately partition by it. Solo modes always take the fast path.
4. **Worker (graceful fallback):** in `getLeaderboard` slow path, if the partitioned query returns 0 rows AND the requested `(scene_id, sheep_count)` matches the mode's intrinsic config (e.g., soloClassic + field + 200), fall through to the fast path. Documents the "natural partition matches the materialized state" invariant.
5. **D1 backfill (one-shot migration `0005_score_submissions_backfill.sql`):** for each player with `solo_<mode>_best IS NOT NULL` but NO matching row in `score_submissions`, insert one synthetic submission row with `(game_mode, score, sheep_count, scene_id)` derived from the mode's intrinsic config. Lossy (only the best, not full history) but makes the slow path correct for old players. Append-only.
6. **UX polish on the panel:** move filters into a collapsible "Filters" row, default-collapsed on solo tabs. Show a "no scores yet for this filter — clear filter" inline action when an MP partition returns empty.

**Verification recipes (run after each step):**

- `curl 'https://sds-worker.matt-m-kissinger.workers.dev/api/leaderboard?mode=soloClassic'` → real entries (regression check — should still work).
- After Phase 6.4 (fallback): `curl '...?mode=soloClassic&scene=field&sheepCount=200'` → real entries (was `[]`).
- After Phase 6.5 (backfill): `curl '...?mode=soloClassic&scene=field'` → real entries even before the fallback kicks in.
- Frontend: open leaderboard panel cold, default Solo Classic tab → entries visible immediately.

**Acceptance:** Leaderboard shows entries on default load (Solo Classic tab). Filter dropdowns only appear where they make sense per tab. Empty-state shows actionable "clear filter" link. Worker rejects invalid mode with 400. New vitest cases for worker handler input-validation + slow-path-fallback. No regression on existing valid filter combinations (MP at 250/500/1000 sheep counts).

## Dependencies

```
Phase 1 (A8 fix)            — independent
Phase 2 (UI)                — independent
Phase 3 (video)             — independent
Phase 4 (Mac + Browserbase) — Matt-gated, browserbase key now in place
Phase 5 (analytics + playtest) — Matt-gated; depends on Phase 6 for leaderboard playtest
Phase 6 (leaderboard fix)   — independent
```

Phases 1, 2, 3, 6 fully parallelizable. Phase 5 should run after Phase 6.

## Frozen files

- [`tests/sim-baseline/`](../tests/sim-baseline/) — DO NOT regenerate (cycles 5-11 byte-identical).
- [`worker/migrations/`](../worker/migrations/) — append-only.

## Hard stops

1. Frozen-file change without scope authorization.
2. Sim-baseline test failure — escalate, do not regenerate.
3. Visual regression on a previously-passing scene.
4. Phase 2 button migration breaking any existing onClick handler.

## What NOT to do during this cycle

- Don't introduce a new scene (three is the right number).
- Don't redesign UI from scratch — Phase 2 is unification only.
- Don't ship Electron packaging (still research-doc only).
- Don't regenerate `tests/sim-baseline/` fixtures.
- Don't tag `v1.1.0` until Phase 1 + Phase 2 land cleanly.

## Success criteria (cycle close)

- [x] Phase 1 — A8 stress drift fix shipped (GLB shared-material guard for trees/rocks). Closed 2026-05-02. Acceptance check (`window.__sdsStressTestSwaps(5)` reports < 5% drift) is gated on Matt running the harness against the new build.
- [x] Phase 2 — Button.js extended with `ghost`/`danger` variants + `size` prop; SettingsPanel raw buttons migrated. Mode-shaped HUD extraction documented as N/A (the existing HUD branches by platform + multiplayer, not by mode). Closed 2026-05-02 with measured scope.
- [ ] Phase 3 — 4 cinematic video shots rendered + uploaded. **Carried to Cycle 13 (Matt-gated).** Pipeline verified ready.
- [x] Phase 4 — Mac rendering bug research documented at [`docs/mac-bug-research.md`](mac-bug-research.md). White-ground investigation steps + sky-banding fix sketch + Browserbase no-go all captured. Closed 2026-05-02.
- [ ] Phase 5 — CF Web Analytics beacon live + manual playtest walked. **Carried to Cycle 13 (Matt-gated).**
- [x] Phase 6 — Leaderboard renders entries by default; filter UX cleaned up; worker input-validation in place; D1 backfill applied to prod. Closed 2026-05-02.
- [x] All vitest specs pass — 141/141 (was 136/136; +5 new from `tests/swap-drift-glb-guard.spec.js`).
- [x] Production build clean (739 KB main / 615 KB three / 218 KB main gzip; bundle size matches Cycle 11 baseline).
- [ ] `v1.1.0` tag pushed — **Deferred** until Phase 3 lands and the marketing assets land. Cycle 13 scope decision.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — cycle template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/archive/cycles/cycle-11-plan.md`](archive/cycles/cycle-11-plan.md) — prior cycle plan
