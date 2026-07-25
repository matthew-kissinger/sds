# Cycle 112 - front-door-foundations

> Drafted 2026-07-24 after the front-door alignment pass. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom, then [`front-door-roadmap.md`](front-door-roadmap.md) for where this cycle sits in the program. Decisions are locked in [`../DECISIONS.md`](../DECISIONS.md) under "Front door alignment"; cite them by number, do not re-derive them.

## Goal

Clear the visible noise in front of the game and re-shoot the art that sells it, so that Cycle 113's new entrance can be judged on its own merits instead of on a broken baseline. Before: a player meets two competing green buttons over a hero where the dog is four pixels wide, every title renders in a fallback serif while the boot path downloads a font nothing uses, the heaviest asset in the game gates the first playable frame, and three HUD defects are visible in every session. After: the wordmark is consistent, the display face is the one the design language specifies, the critical payload is roughly a megabyte lighter, the HUD defects are gone, and four scenes have heroes shot to one brief that actually show a dog, a flock, and somewhere to take them.

## How to read this plan

This doc fixes the *shape* of the changes, not the implementation choices. Where it suggests a technique, treat it as a starting point for research.

Each agent picking up a phase should research current best practice for the sub-problem, measure on the actual hardware target before committing, and pick the simplest thing that meets the budget.

## Open questions - resolved 2026-07-24

1. **Q1: which Fraunces axes and weights do we actually ship?** **Resolved: one variable file, latin subset, `wght` axis live, everything else instanced.** `opsz` pinned at 48 (the display optical size), `SOFT` and `WONK` at their defaults. Measured: `wght`-only is 37,052 bytes, keeping `opsz` live costs 67 KB. Two static instances at 600 and 700 came out larger than the single variable file, so the variable file wins on both bytes and flexibility. Well inside the 60 KB budget hard stop 3 sets.
2. **Q2: does the Jep clip split go by name or by a manifest?** **Resolved: an explicit manifest**, per the author lean. `JEP_KEEP_CLIPS` in `scripts/bake-dog-variants.mjs` names the 8 survivors and the bake aborts if any is missing from the source, so a renamed or dropped clip fails loudly instead of silently shipping a dog that cannot walk.
3. **Q3: does the load budget instrument in-repo or ride the existing perf harness?** **Resolved: extend `tools/validation/`**, per the author lean. `tools/validation/cold-load.mjs` follows the `input-latency.mjs` shape (profile table, `parseArgs`, fresh context per run, exit 1 on budget breach, 2 on fatal) and folds into `validation:all`.

## Architecture / shared changes

None to `shared/`. This cycle adds no primitives and changes no schema.

Two client-side authorities were added, both following the existing single-source-of-truth precedent (`js/world/foliageLightingRig.js`, `shared/terrain/Heightfield.js`):

- **`js/atmosphere/paintedHorizon.js`** - the colour the sky actually paints at the horizon line, plus the CPU tone-mapping mirrors needed to solve for a fog colour that survives the transfer chain. Phase 6's authority.
- **`js/atmosphere/skyFogPresetTuning.js`** - the preset tuning table, extracted verbatim out of `js/webgpuNodeMaterialFactorySuite.js` so the shader and the CPU model read one copy rather than two that can drift.
- **`js/boot/loadTimeline.js`** - the two boot marks Phase 5's gate reads.

## Phase 1 - Ship the display face, drop the dead one (~2hr)

**Independently testable.** Nothing depends on it, and it changes every title in the game.

`css/main.css` line 213 sets `--font-display: 'Fraunces', Georgia, ...` and the comment describes Fraunces as self-hosted. There is no `.woff2` anywhere in the repo, so every title has been rendering in the Georgia fallback. Separately, [`../index.html`](../index.html) line 238 makes a render-blocking Google Fonts request for **Fredoka**, which no file references.

1. **Subset and self-host Fraunces** per Q1 into `css/fonts/`, with an `@font-face` block using `font-display: swap` and a relative `url('./fonts/...')`.
2. **Delete the Fredoka stylesheet link** and the two `fonts.googleapis.com` / `fonts.gstatic.com` preconnects, which exist only to serve it.
3. **Verify the fallback stack** still reads acceptably if the woff2 fails, since `swap` will show it briefly.

**`css/fonts/`, not `public/fonts/` - revised from the scaffold.** `vite.config.js` sets `base: './'` for the live `build:itchio` and `build:native` targets, so a root-absolute `url('/fonts/x.woff2')` resolves wrong there and the desktop build would silently fall back to Georgia while the web build looked fine. A relative url from `css/main.css` makes Vite bundle and hash the file into `dist/assets/`, which is base-correct on every target and also matches `sw.js` `IMMUTABLE_HASHED` (already covering `woff2` under a hashed `/assets/` path), so the font gets cache-first treatment for free. The `<link rel="preload">` was dropped with it: hand-writing a hashed href is fragile, and with `swap` plus a hashed asset it buys little.

**Acceptance (EARS):**

- When Phase 1 ships, then `grep -ri fredoka index.html css/ js/` shall return no matches.
- When Phase 1 ships, then `grep -c "fonts.googleapis.com" index.html` shall return 0.
- When Phase 1 ships, then `ls css/fonts/*.woff2` shall list at least one file.
- When the entrance renders, then the computed `font-family` of the wordmark shall resolve to Fraunces rather than a fallback.
- If the woff2 fails to load, then the title shall render in the Georgia fallback without layout shift beyond one line height.

**Shipped:** `css/fonts/fraunces-latin-var.woff2`, 37,052 bytes, with `css/fonts/OFL.txt` alongside it. `wght 100 900` live, `opsz` instanced at 48. Consumers must state a weight: the variable default is 900, so an unstated weight renders heavier than the design intends.

## Phase 2 - Take Jep off the critical path (~2hr)

**Depends on:** nothing.

`assets/models/Jep.glb` is 1,301 KB. Pip, Sally and Shiloh are ~208 KB each at identical Draco and meshopt settings. The delta is 19 animation clips across 2,105 accessors. Jep is the default dog and the only dog in `defineCriticalAssets()` ([`../js/GameAssetLoader.js`](../js/GameAssetLoader.js) line 37), so the heaviest file in the game gates the first playable frame for every new player.

Note the prior art: Cycle 91 already stripped the 19 clips from the other four dogs and shares Jep's clips at runtime (`scripts/bake-dog-variants.mjs`). This phase extends that idea to Jep itself.

**Revised from the scaffold: delete, do not defer.** The scaffold proposed splitting sixteen clips into a second GLB loaded after first interactive. Reading the runtime made the split unnecessary. `js/Sheepdog.js` hardcodes `return 'forward'` in its direction resolve and the `TURNING` state is not a key in `ANIMATION_STATES`, so the eight L/R variants of Walk, Trot, Run and RunFast **are unreachable code**, not deferral candidates. Deleting them is free. Three of the six idle variations go with them as a judgement call. That leaves a bake-script change with no runtime loader work, which is also why hard stop 1 (do not change visible dog animation) is trivially satisfiable: nothing on the animation path moved.

**Measured ladder** (mesh floor parsed at 206 KB, identical to the four clip-free peers, so every one of Jep's excess bytes is animation):

| Clip set | Clips | Size | Saves |
|---|---:|---:|---:|
| Current on disk | 19 | 1,301 KB | - |
| Keep all 6 idles | 11 | 880 KB | 421 KB |
| **Keep 3 idles (chosen)** | **8** | **654 KB** | **647 KB** |
| Keep 1 idle | 6 | 524 KB | 777 KB |
| Mesh only | 0 | 206 KB | 1,095 KB |

**The scaffold's 400 KB target was arithmetically impossible.** Under 400 KB needs three clips or fewer against a 206 KB floor, and the dog uses four distinct gait clips plus Bark within seconds of spawn. Owner decision 2026-07-24: keep 3 idles at 654 KB. The two acceptance numbers below are revised accordingly - 400 KB becomes 700 KB, and 900 KB saved becomes 600 KB.

Kept, per the Q2 manifest: `Idle_1`, `Idle_2`, `Idle_4`, `Walk_F_IP`, `Trot_F_IP`, `Run_F_IP`, `RunFast_F_IP`, `Bark`. Dropped: `Idle_3`, `Idle_6`, `Idle_7` and the eight unreachable L/R clips.

1. **Add the keep-manifest and clip-drop pass** to `scripts/bake-dog-variants.mjs`, before the existing strip loop.
2. **Add `resample({ tolerance: 1e-4 })`** to the transform chain, then a second `prune()`. Neither bake script resampled, which is why Jep was only 0.9% smaller than its `assets/_originals` backup: draco and meshopt do not touch animation data, and animation was 65.6% of the file.
3. **Prune the now-dead entries in `js/Sheepdog.js`.** `ANIMATION_STATES` still named the L/R clips in its direction maps, so `getAnimationForState` could in principle resolve a clip that no longer exists.
4. **Verify `clipSignature` still matches** across all five dogs, and that `models.animals['<peer>_animations']` still resolves via the shared-clip fallback in `js/TerrainBuilder.js`.
5. **Re-run `npm run compress-glbs`** and record the new sizes.

**Watch item:** `prune()` reports `Removed types... Skin (1)` on every run including the shipped pipeline, and the dog animates correctly today, so it is pruning an unused duplicate. Confirm rather than trust.

**Acceptance (EARS):**

- When Phase 2 ships, then the critical asset set's total bytes shall be at least 600 KB smaller than at cycle start.
- When Phase 2 ships, then `assets/models/Jep.glb` shall be under 700 KB.
- While a round is in its first thirty seconds, the dog shall never request an animation clip that is not in the base set.
- When `npm test` runs, all vitest specs shall pass.

**Shipped:** 1,331,856 bytes to 669,360 bytes, a 647 KB saving on the only critical-set file this phase touched. Guarded by `tests/dog-asset-budget.spec.js`, modelled on `tests/tree-assets.spec.js`, which pins the byte ceiling and cross-checks every clip name `ANIMATION_STATES` can resolve against the manifest.

**One trap found and fenced.** `scripts/compress-glbs.mjs` always re-reads from the pristine `assets/_originals` backup, so on its next run it would have restored all 19 clips and silently undone this phase. Jep is protected today only by that script's `SKIP_THRESHOLD` ratio, which is a coincidence of thresholds rather than a contract. An explicit `OWNED_ELSEWHERE` list now early-continues past every file `bake-dog-variants.mjs` owns.

## Phase 3 - HUD defect sweep (~2hr)

**Depends on:** nothing.

Three defects, all visible in every session, all captured in the review:

1. **The sheep counter overlaps its percentage.** `0 / 3` and `0% complete` render on top of each other in the top-left HUD panel.
2. **`Space` renders as both Bark and Ready** simultaneously, two prompts on screen at once.
3. **The license line is burned into gameplay** bottom right, and it also occupies the entrance panel and the loading screen.

Move the license to the entrance info menu, alongside About and Source, and remove it from the in-game HUD and the loading surface entirely. This is the D6 demotion landing early, since it needs no design work.

**Acceptance (EARS):**

- When a round is active, then no two HUD text elements shall overlap at 1440x900 or at 390x844.
- While the round has not started, then exactly one prompt shall be bound to `Space` on screen.
- When gameplay is active, then the copyright and license text shall not be rendered on the canvas overlay.
- When the entrance info menu opens, then it shall contain the AGPL license line and the source URL.

**Shipped, with one correction to the diagnosis.**

- **Defect 1 did not reproduce as reported.** Measured DOM geometry at both viewports stacks cleanly (25 to 49, 49 to 69) and a 3x zoom render is clean; the overlap in the review capture was a 1x capture artifact over the panel's backdrop blur. The real defect underneath it was live and is fixed: `HudLayout` published a **hardcoded** `--sds-topleft-reserve: 140px` regardless of the panel's real height, and `DayNightChip` pins itself below that offset. A ResizeObserver now publishes the measured height. Probed at 139px, 229px and back to 139px across states, with the old hardcode colliding at 229.
- **Defect 2** fixed by gating `BarkHint` on multiplayer. `BarkMeter` already carries the key chip and is the more informative of the two. Its ready label also changed from "Ready" to "Bark", since "Ready" named a state rather than the action.
- **Defect 3** removed from the canvas overlay and the loading surface, and moved into `CornerNav`'s info popover under `SITE_LINKS`.

**A fourth defect, found by the acceptance line itself.** Sweeping every visible HUD text node for pairwise intersection at both viewports (rather than only looking where the review pointed) turned up a real one at 390x844: `CorralCompass` drew its distance pill straight through the "Follow" camera chip, a 26x12px overlap with "Follow" legibly damaged. Root cause is the same shape as defect 1. The compass positions itself from an NDC projection clamped to a +/-0.85 envelope, measured against the **raw viewport**, and on a 390-wide phone that envelope lands at y=41px, inside the top-center stack.

Fixed the same way: through the reserve mechanism, not a new offset. `HudLayout` now measures all three top slots and publishes `--sds-hud-top-reserve` (their union plus the safe-area top), and the compass positions inside the band between that and `--sds-bottom-reserve` instead of across the whole viewport. Measuring all three is necessary because the edge slot spans the full width and cannot know which corner it will land in. Guarded by two additions to `tests/ui/hudReserve.spec.tsx`.

Verified by probe at both viewports after the fix: 16/16 checks, zero overlapping text nodes, with a capture at `cycle112-validation/phone-hud-390x844.png` showing the compass clear of the chip.

## Phase 4 - One wordmark (~1hr)

**Depends on:** nothing. Cheap, and everything downstream inherits it.

Per D1 the game is **Sheep Dog Sim**. Today the entrance says "Sheepdog Simulator", `<title>` says "Sheep Dog Sim", and the JSON-LD carries four `alternateName` values.

1. **Update the entrance wordmark** in [`../js/components/entrance/Entrance.tsx`](../js/components/entrance/Entrance.tsx).
2. **Reconcile the schema blocks** in [`../index.html`](../index.html): `name`, `alternateName`, Open Graph and Twitter titles.
3. **Sweep the static pages** (`about.html`, `support.html`, `privacy.html`, `public/scenes/*.html`) for the other spelling.
4. **Leave historical documents alone.** `docs/archive/`, CHANGELOG entries and past cycle plans are immutable records.

**Acceptance (EARS):**

- When Phase 4 ships, then `grep -r "Sheepdog Simulator" index.html js/ public/ *.html` shall return no matches.
- When the entrance renders, then the wordmark shall read "Sheep Dog Sim".

**Shipped.** Only two live sites carried the old spelling: the entrance wordmark, which was the sole user-visible mismatch against `<title>`, and the same string in the dev-only gallery mock. `index.html` was already canonical throughout (title, og, twitter, all three JSON-LD blocks), so step 2 was a no-op and step 3 found nothing. `index.html`'s `alternateName` list is left alone: those are deliberate SEO aliases.

## Phase 5 - Give loading a number (~3hr)

**Depends on:** Phase 2 (so the measurement reflects the lighter payload).

Per D17 the working budget is **2.5s desktop, 5s phone, cold**. There is no instrumented number today, so "loading is slow" cannot be closed.

1. **Instrument first-interactive** per Q3: the moment the entrance is interactive on a cold cache, and separately the moment a round is playable after Play.
2. **Record a baseline** on the RTX 3070 desktop and one mid-tier phone, before and after Phase 2.
3. **Add the budget as a validation gate** so a regression fails rather than drifts.
4. **Loading screen treatment.** Stop blurring the backdrop. Hold the sharp hero so the load reads as an approach rather than a gate. Move the stage captions to one quiet line and drop the license per Phase 3.

**The camera-drift-and-dissolve idea moves to Cycle 113.** The scaffold asked for the loading backdrop to hold the entrance's framing, drift, and dissolve into the live scene. The handoff today is a 100ms poll driving `BackdropReveal`; matching the loading backdrop's framing to the live scene camera is real entrance work, and 113 rewrites that surface. Building it here would build it twice. The blur removal and the caption reduction land now; the framing match goes with the rewrite. The fourth acceptance line below is struck for the same reason.

**Acceptance (EARS):**

- When Phase 5 ships, then a validation script shall report first-interactive in milliseconds for a cold desktop load.
- When first-interactive exceeds 2500ms on the desktop target, then the validation gate shall fail.
- When the loading screen renders, then the backdrop shall not have a blur filter applied.
- ~~When the scene build completes, then the loading surface shall dissolve into the live scene without an intermediate blur state.~~ **Deferred to Cycle 113** with the entrance rewrite, per the note above.

**Shipped.** `js/boot/loadTimeline.js` records `firstInteractive` and `roundPlayable` on a first-write-wins basis (a second round in the same session would otherwise overwrite a cold measurement with a warm one) and publishes them on `window.__sdsBootTimeline`. `tools/validation/cold-load.mjs` takes a fresh browser context per run so the cache, service worker and storage all start genuinely empty, and gates the median of `--runs`.

Measured against the D17 budget, 3 runs each:

| Where | firstInteractive | Budget |
|---|---:|---:|
| **sheepdogsim.com, desktop** | **488ms** | 2,500ms |
| dev server, desktop | 593ms to 1,255ms | 2,500ms |
| dev server, mobile profile | 560ms | 5,000ms |

**Quote the production number.** The dev-server figure is unminified, unbundled and re-transforms on the first request after any source edit; it drifted from 593ms to 1,255ms across this cycle purely from that and from machine load during the capture work, with no payload change to explain it. It is a regression signal, not a figure.

The production run also confirms the preload fix: exactly one hero fetch (`field.webp`), where before two copies shipped and the preloaded one was never requested.

`roundPlayable` is reported but not gated by default (`--enforceRound` opts in): it tracks scene size and hardware far more than the payload this cycle changed.

## Phase 6 - Horizon seam (~4hr) - PULLED FORWARD FROM CYCLE 114

**Depends on:** nothing. **Blocks:** Phase 8.

**Why it is here rather than in 114.** The scaffold left this in Cycle 114 while Phase 8's hard stop rejected any capture showing the seam, and nothing in Cycle 112 fixed the seam. The capture phase was therefore pre-blocked by its own hard stop on the day the plan was written. Owner decision 2026-07-24: pull the seam fix into this cycle, defer the paired capture out of the autonomous pass. Cycle 114 keeps the rest of the grounding work.

The defect is a colour mismatch, not geometry. `js/atmosphere/Atmosphere.js` set `scene.fog.color` to the **raw** sky-horizon LUT value at full strength, and every sky renderer paints its horizon at a fraction of that. Measured at the horizon line:

| Preset | `scene.fog.color` (terrain) | WebGPU sky, one pixel above |
|---|---|---|
| pastoral-noon | `0.689, 0.772, 0.813` | `0.148, 0.316, 0.594` |
| dusk | `0.358, 0.199, 0.164` | `0.401, 0.122, 0.097` |

All four scenes ship linear fog with `far` at 800-900m against a terrain plane running to 2000m, so the far band is 100% fog colour across a wide strip sitting exactly on the horizon. Near-white terrain against blue sky is the seam. Three mechanisms compound:

1. **Shaping mismatch.** The sky paints `mix(zenith, horizon, 0.5) x lowTint x skyBaseScale`, not `horizonColor`. Nothing reconciled the two.
2. **Transfer mismatch.** The WebGPU sky sets `toneMapped = false` while the terrain is tone-mapped, and node-material fog composites pre-tone-map. The WebGL path skews the opposite way: `refreshFogUniforms` sRGB-encodes `fog.color` while the sky shader writes raw.
3. **A 0.82 vs 1.00 step.** Baked node materials took `fogDarkenMultiplier = 0.82` while `scene.fog` took 1.00.

**Approach: give the sky a painted-horizon authority and have fog read it.** This follows the project's own precedent (`js/world/foliageLightingRig.js`, the heightfield single source of truth) and satisfies the `scene-and-render.md` rule that fog must not drift from the sky.

1. **`js/atmosphere/paintedHorizon.js`** evaluates the sky graph at `skyY = 0` and returns the colour the dome actually paints there, then solves back through the renderer's tone-mapping curve for the fog colour that lands on it.
2. **`Atmosphere.applyFogColor()`** consumes that instead of the raw LUT horizon.
3. **Reconcile `fogDarkenMultiplier`** so `scene.fog` and the baked node materials agree. `SKY_DOME_FOG_DARKEN = 0.82` is now named once and imported by both.
4. **Update `js/diagnostics/webgpuSceneFogHorizonProof.js`**, which asserted `arraysEqual(fog.color, horizonColor)` and so locked in the very relationship being fixed.

**Explicitly out of scope:** the geometric rim. No height-displaced skirt, no `addMountains()` change, no terrain plane resize. If fog converges with the sky, the hard edge at 2000m stops being visible, which is the point. Geometry stays in Cycle 114.

**Acceptance (EARS):**

- When Phase 6 ships, then `scene.fog.color` shall be derived from the colour the sky paints at the horizon rather than from the raw horizon LUT value.
- When Phase 6 ships, then `scene.fog` and the baked node materials shall read the same darken multiplier from one exported constant.
- When the fog colour is round-tripped through the renderer's tone-mapping curve, then the result shall match the painted sky horizon to within 0.01 per channel.
- When Phase 6 ships, then the goldens shall be re-baselined, since every golden frame contains the horizon.

**Shipped, with an honest limitation on the gate.** The CPU model reproduces the shader: predicted `0.152, 0.319, 0.595` against an independently measured `0.148, 0.316, 0.594`, a 0.004 agreement. The fix is proven by an A/B screenshot pair on Home Field at 1440x900, same camera and same frame, with only `fog.color` differing between the old raw LUT horizon (`0.689, 0.772, 0.813`) and the solved value (`0.115, 0.255, 0.582`): the pale band across the horizon is present in one and absent in the other. Pinned by `tests/painted-horizon.spec.js`.

**The automated pixel gate did not converge and was not forced.** `tools/validation/horizon-seam.mjs` scores Rolling Hills *worse* after the fix (0.066 to 0.088) because its band detector locks onto unrelated terrain features once the seam is gone. Tuning the threshold until it went green would have been fitting the test to the answer, so the script ships as an **A/B reporting tool that always exits 0**, writing before/after PNGs to `cycle112-validation/horizon-seam/` with the measured numbers recorded in its header. A real seam gate needs a detector that knows where the horizon line is; that is worth doing and is not worth doing under time pressure.

Two traps worth recording for whoever automates this next:

- **In-page WebGL canvas readback returns blank** without `preserveDrawingBuffer`, producing an all-zero luminance profile that reads exactly like a pass. Use `page.screenshot()` and decode.
- **The cinema harness gives a horizon-facing camera but an unlit sky**, so fog samples near zero and the capture is useless for a colour A/B. Use the lit gameplay entry.

### The goldens were 8 cycles stale, and the re-baseline says so

`npm run validation:screenshots -- --diff` came back 6/6 below threshold at 0.30 to 0.64 SSIM, which is far more movement than a fog colour can produce. The goldens were last written at Cycle 103's close (commit `e7816fbf`, 2026-06-15) and **40 commits** had landed since, including `3300b1c7` (r185 and the Kiln asset pipeline), `873fa5fb` (consolidated tree LOD profiles) and Cycle 104's impostor relight. Side by side, the stale Open Country golden shows bare dark trees where the current build shows full green canopies. Fog does not add leaves.

Hard stop 4 says do not re-baseline blind, so the seam delta was isolated before anything was rewritten: the five render-path files were checked out at `HEAD`, the same six cells captured, then the working tree restored and the pair compared on the harness's own SSIM.

| Cell | SSIM | mean abs delta, top third | middle | bottom |
|---|---:|---:|---:|---:|
| field sun0.85 | 0.9812 | 4.18 | 2.34 | 1.02 |
| field sun0.5 | 0.9812 | 3.81 | 0.87 | 0.36 |
| rolling-hills sun0.85 | 0.9962 | 1.23 | 1.42 | 0.87 |
| rolling-hills sun0.5 | 0.9768 | 3.81 | 1.30 | 0.79 |
| open-country sun0.85 | 0.9860 | 1.73 | 2.16 | 1.34 |
| open-country sun0.5 | 0.9874 | 1.75 | 0.60 | 0.30 |

Every cell clears the harness's own 0.95 threshold on its own, worst 0.9768, and in all six the delta is heaviest in the **top third** and lightest in the bottom. That is the signature of a change confined to the horizon, which is what Phase 6 claimed to be.

The re-baseline therefore banks 8 cycles of unrelated foliage drift alongside this cycle's fog delta. That is the right outcome (goldens should reflect shipped state) but it must not later be read as Cycle 112 having moved the trees. Re-diffed after writing: 6/6 pass, mean 0.9945. Before and after captures are kept at `cycle112-validation/goldens/`.

**Carry to BACKLOG:** the golden gate ran unattended for 8 cycles while failing. It is in `validation:all`, which is not in CI, so nothing surfaced it. Either run `validation:all` at every cycle close or move the golden diff into CI.

## Phase 7 - Scene deep links actually work (~1hr)

**Depends on:** nothing.

Observed directly during the review: loading `/?scene=rolling-hills` sets the page title to Rolling Hills, then Play commits Home Field and the URL resets to `/`. Deep links appear to work and then do not, which affects the scene pages and any shared link.

Confirmed exactly as reported. `js/main.js` reads `?scene=` and the engine loads that scene, but `js/components/entrance/useBootFlow.ts` armed `DEFAULT_WORLD_INDEX` unconditionally and never consulted the URL, so Play committed Home Field. Then `_buildSwapUrl` deleted the `scene` param whenever the target was the default, collapsing the URL to `/`.

1. **Arm the world named in the URL** so the entrance opens on it and Play commits it. The existing "browsing worlds is session-local" comment stays true; this is a narrow exception for an explicit deep link and is commented as such.
2. **Preserve the param** through the commit rather than resetting the URL. `main.js` records at boot whether `?scene=` arrived and keeps the param set for the session if it did.
3. **Reject unknown scene ids** back to the default rather than half-applying them. **`comingSoon` worlds count as unknown**: `newsheepdogland` is gated per D19 and the entrance refuses to commit it, so arming it would strand the player on a dead Play button.

**Acceptance (EARS):**

- When the entrance loads with `?scene=<id>` for a known scene, then the armed world shall be that scene.
- When Play is pressed with `?scene=<id>` armed, then the round that builds shall be that scene.
- If `?scene=<id>` names an unknown scene, then the entrance shall arm the default world and shall not throw.

**Shipped** as `worldIndexFromSearch` in `js/components/entrance/worlds.ts`, covered by `tests/entrance-scene-deeplink.spec.js`. There was no coverage of URL-to-armed-world before this and nothing pinned `_buildSwapUrl`. The three e2e specs that deliberately enter via the entrance rather than a deep link (`tests/e2e/oc-perf.spec.ts`, `scene-swap-stability.spec.ts`, `mobile-asset-visibility.spec.ts`) keep working unchanged.

## Phase 8 - Hero capture session (~3hr) - PAIRED

**Depends on:** Phase 1 (titles render correctly in captures), Phase 4 (wordmark is right) and Phase 6 (the seam its hard stop rejects is gone).

**This phase is fully paired.** Matt drives the browser; the agent prepares the complete shot manifest first (scene, time of day, sun angle, camera pose, dog pose, filename, aspect, purpose) before pairing begins. Do not start the session without the manifest written.

The D8 brief, identical for all four scenes: **dog large in the near third, flock settled and readable mid-frame, destination visible on the horizon, low sun off-axis, generous sky, horizon seam lifted.** Calm rather than tense, per D2.

Known problems to fix in the capture, not in post:

- **Open Country:** the camera is inside a tree. Move it.
- **Sheep Dog Island:** underexposed by roughly a stop and a half. The land reads near black under a good sky.
- **Home Field:** the dog is roughly four pixels. Bring the camera down and in.
- **All three:** a white horizon seam where the terrain skirt meets fog.

1. **Write the shot manifest** covering all four scenes at entrance aspect and social aspect.
2. **Capture** with Matt driving.
3. **Re-cut the social cards** from the same session so `assets/scenes/social/` and the Open Graph tags match what the entrance shows.
4. **Update the scene pages** (`public/scenes/*.html`) with the new imagery.

**Acceptance (EARS):**

- When Phase 8 ships, then each file in `assets/scenes/entrance/` shall contain a dog occupying at least 3% of frame height.
- When Phase 8 ships, then no entrance hero shall contain a foreground object occluding more than 15% of the frame.
- When Phase 8 ships, then `assets/scenes/social/` shall be re-cut from the same session.
- If the horizon seam is still visible in a capture, then the capture shall be rejected and Phase 6 reopened before the hero is re-shot.

**Status: shipped.** Matt resolved the open taste question (the sun disk may be in frame) and directed the plan through to completion, so the candidates were installed as the shipped art rather than held for a paired session.

- **Manifest:** [`cycle-112-hero-manifest.md`](cycle-112-hero-manifest.md) - solved camera poses, the sun time-of-day table, per-scene notes.
- **Harness:** [`../tools/hero-capture-cycle112.mjs`](../tools/hero-capture-cycle112.mjs) captures; [`../tools/install-hero-candidates.mjs`](../tools/install-hero-candidates.mjs) installs. Kept separate on purpose: capture is safe to run any time and writes only to the gitignored validation dir, while install overwrites `assets/scenes/`.
- **Net 173 KB lighter** across the eight files, and the one on the critical path (Home Field entrance, the first-visit default per D5) drops 430 KB to 171 KB. Rolling Hills and Open Country needed per-scene WebP quality (62 and 66) to stop grass detail arriving 190 KB heavier than the frames they replace.
- **`index.html`'s preload was broken two ways, and both are fixed.** It fetched `rolling-hills.webp` at `fetchpriority=high` while D5 had made Home Field the default, so a first-time visitor paid a high-priority fetch for an image they never see. Worse, as a static `<link>` Vite rewrote the href to a hashed copy it emitted into `/assets/`, while the entrance requests the static-copied `/assets/scenes/entrance/` path: two copies shipped and the preload warmed the one nothing asked for, so the fetch was pure waste and the image the player actually sees still loaded cold. Pre-existing since Cycle 82. The preload is now injected from an inline script so its URL survives the build verbatim and matches what `worlds.ts` requests. Also retargeted the og/twitter image and their alt text, which Phase 8 explicitly covers.

  **Importing the heroes in `worlds.ts` was tried first and does not work.** It gives matching hashed URLs in a production build, but `assets/` is served by `vite-plugin-static-copy`, so the dev server answers `?import` with raw image bytes instead of a module and the entrance fails to boot entirely. Recorded here because the build looks correct and only dev breaks, which is exactly the shape of change that gets re-attempted.

The composition is satisfied by construction rather than by guessing: forward runs from the live flock centroid to the scene's destination, the camera clears the rear-most sheep (capped), and the pitch is **solved** so the dog lands at NDC y = -0.45. All eight frames came out between -0.47 and -0.50, at 3.77% to 5.39% frame height against the 3% floor.

Three findings worth carrying forward:

1. **`?sun=` is a time of day, not an elevation** (0 midnight, 0.5 noon, 0.75 sunset). Dawn and dusk share elevations but not colour, and two passes were wasted before that was measured. The table is in the manifest.
2. **The HUD leak was a real bug, and the fix is the durable part of this phase.** `?ui=off` and `cinema.hideUI()` both set `display:none` on `#react-overlay` alone, missing the five chips that mount straight to `document.body` - the day/night chip, the survival summary, the minimap, the skip-to-dusk button, the stats chip. All five rendered into the first Newsheepdogland frame. Fixed with a `data-sds-ui="hidden"` attribute on `<html>` driving a CSS rule against `[data-sds-overlay]`, which each chip tags itself with. **CSS rather than an imperative sweep on purpose:** the survival chips mount when the scene loads, long after `?ui=off` runs at init, so any JS sweep would need re-applying on every mount. Newsheepdogland's survival lock turned out not to be a bug at all - Survival *is* that island's mode, so the shot frames for its ten sheep instead of pretending to a flock the mode never has.
3. **The second acceptance line is not measured as written.** "No foreground object occluding more than 15% of the frame" would need a depth pass. `nearestTreeM` catches the defect it was written for (the Open Country camera inside a tree, now gone) but has a blind spot: an early Rolling Hills frame with a trunk cutting the near field still reported 145m, because only `_treeCullRegistry` instances are visible to it.

## Ratchet bump: the main chunk grows 6 KiB (recorded decision)

`tests/refactor-baseline/__fixtures__/bundle-sizes.json` moves `mainKB` 638 to 644 and the `main` budget 639 to 645. Per the ratchet convention in `tests/refactor-baseline/baseline.spec.ts`, a bump is a deliberate, recorded decision, so here is the accounting.

Three new modules land on the boot path, 19.2 KiB of source (mostly comment blocks and one data table) minifying to roughly 6 KiB:

- `js/atmosphere/paintedHorizon.js` (9.9 KiB) - Phase 6's authority.
- `js/atmosphere/skyFogPresetTuning.js` (7.5 KiB) - the preset table, extracted so the shader and the CPU model read one copy. Rollup emits it into both `main` and the `webgpuNodeMaterialFactorySuite` chunk, since it is reached from two chunk roots. That duplication is a couple of KiB and is cheaper than a third request for a table this size.
- `js/boot/loadTimeline.js` (1.8 KiB) - Phase 5's marks.

None pulls a new third-party dependency; `paintedHorizon.js` imports exactly one local module and nothing else. `threeKB` is unchanged at 614, and no other chunk family moved.

Judged worth it: +0.9% on one JS chunk, in a cycle that removed a render-blocking third-party font request and took 647 KB off the critical asset set. Only `bundle-sizes.json` was edited by hand. `UPDATE_FIXTURES=true` was **not** used, so the heightfield-sample and tree-scatter goldens in the same fixture directory could not be silently regenerated alongside it.

## Dependencies

```
Phase 1 + Phase 2 + Phase 3 + Phase 4 + Phase 6 + Phase 7 (all parallel)
    -> Phase 5 (needs Phase 2's payload)
    -> Phase 8 (needs Phase 1 + Phase 4 + Phase 6, and is paired)
```

Phases 1, 2, 3, 4, 6 and 7 are independent and can land in any order. Phase 5 waits on Phase 2 so the baseline is honest. Phase 8 waits on 1 and 4 so captures do not need retaking, and on 6 so its own hard stop does not reject every frame.

**Landed 2026-07-25:** Phases 1, 2, 3, 4, 5, 6 and 7. Phase 8 is the only one outstanding and it is paired.

## Frozen files (cycle-specific additions)

The durable fence in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) is sufficient. This cycle touches no `shared/` file and no sim-baseline fixture.

Note for Phase 2: `assets/models/Jep.glb` is consumed by the runtime clip-sharing path added in Cycle 91. Changing its clip set is a consumer-visible change to `scripts/bake-dog-variants.mjs`; update both in the same commit.

## Hard stops

Durable hard stops apply on every cycle, see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. **If the Jep clip split changes visible dog animation in any camera mode, revert Phase 2** and take the payload win a different way. The dog's motion is the thing players look at most.
2. ~~**If Phase 6 captures still show the horizon seam, stop.**~~ **Retired 2026-07-24.** This stop pre-blocked the capture phase: it rejected any frame showing the seam while no phase in this cycle fixed the seam. Resolved by pulling the fix in as Phase 6 rather than by relaxing the stop. The rejection rule itself survives as Phase 8's fourth acceptance line, now pointing at reopening Phase 6 instead of at Cycle 114.
3. **If the Fraunces subset pushes first-interactive past the Phase 5 budget, drop to a single weight** rather than accepting the regression. **Cleared:** 37 KB shipped, desktop first-interactive at 593ms against a 2,500ms budget.
4. **If the seam fix moves any scene's look beyond the horizon band, stop and review the goldens rather than re-baselining blind.** Every golden frame contains the horizon, so a blind `--baseline` would launder a regression into the reference set.

## What NOT to do during this cycle

- **Do not start the entrance rewrite.** That is Cycle 113 and it needs Phase 8's heroes to be judged against.
- **Do not touch the grass, the fence, the farmhouse or the water.** Cycles 114, 115 and 118. Phase 6 is a colour fix on fog and takes no geometry with it; the terrain skirt, the mountains and the plane extents stay for 114.
- **Do not begin the token migration.** D16 says pastoral in new code, migrate on touch. There is no new component here.
- **Do not reset any leaderboard.** That is Cycle 117 and it carries its own re-verification step.
- **Do not ungate Newsheepdogland.** D19.
- **Do not bump the version.** D20 says roll continuously.

## Success criteria (cycle close)

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When `npm run lint` runs at cycle close, it shall pass.
- [ ] When the close commit lands on `main`, the sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When Cycle 112 closes, the critical asset payload shall be at least 600 KB smaller than at cycle start. *(Revised from 900 KB with the Phase 2 ladder. 647 KB shipped.)*
- [ ] When Cycle 112 closes, no title in the game shall render in a fallback face.
- [ ] When Cycle 112 closes, all four entrance heroes shall satisfy the D8 brief per Matt's review.
- [ ] When Cycle 112 closes, a cold-load number shall exist for the desktop and phone targets.
- [ ] When Cycle 112 closes, the horizon seam shall be absent from a WebGPU capture of each scene.

## References

- [`front-door-roadmap.md`](front-door-roadmap.md) - the seven-cycle program this belongs to
- [`../DECISIONS.md`](../DECISIONS.md) - the 21-decision register, "Front door alignment"
- [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - template
- [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard stops
- [`../.claude/rules/prose-and-voice.md`](../.claude/rules/prose-and-voice.md) - copy rules for Phase 4's sweep
