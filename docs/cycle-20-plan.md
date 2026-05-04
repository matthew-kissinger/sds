# Cycle 20 — heightfield-amplitude-fix-and-cinematic-videos

> Drafted 2026-05-04 after Cycle 19 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Two carryover items from Cycle 19:

1. **Fix the longstanding `Heightfield.sample()` double-amplification bug at the root.** Cycle 19 worked around the symptom (grass at water level on RH/OC) by relaxing the GrassSystem clamp from `>10` back to `>50`. The actual bug — `Heightfield.sample()` multiplies stored data by `peakHeight` while `scripts/bake-heightmap.mjs` already writes pre-multiplied metres — has been silently shipping for ~14 cycles. RH terrain peaks at 36m and OC at 25m, instead of the documented 6m / 5m. Net visual character of the game depends on this amplified state. Decide: re-bake to honor the contract, or change the contract, or normalize at load. Then ship.

2. **Ship the 4 cinematic videos deferred from Cycle 19 Phase 3.** `tools/cinematic/run.mjs` hits a Playwright `page.screenshot: Timeout 30000ms exceeded` on the first frame even though "fonts loaded" fires before timeout. Diagnose, fix, then render the 4 marketing videos (`dog-into-sunset`, `lightning-strike`, `chaos-5000`, `oc-portal`) on the post-amplitude-fix build.

User-visible difference: terrain returns to its documented design heights (subtle visual shift across all three scenes); marketing videos shipped for landing-page polish; latent footgun resolved.

## How to read this plan

This doc fixes the *shape* of the work. Implementation choices are open. Each phase should research current best practice and measure on RTX 3070 before committing.

## Open questions to resolve before writing code

1. **Q1: Which amplitude-fix path?**
   - **Option A — re-bake heightmaps to write [0,1] normalized.** Honors the documented `Heightfield` contract. Existing tests pass as-is. File contents change but file format unchanged. Re-bake command already exists: `npm run bake-heightmaps`.
   - **Option B — drop the `* peakHeight` in `sample()`** and update tests to feed metres-data inputs. File contents unchanged. Tests need updating.
   - **Option C — normalize at `Heightfield.load()`** (divide raw data by peakHeight). File contents unchanged, tests unchanged, internal data is normalized. Sample() still multiplies. Load path slows by O(N).
   - **Author lean: Option A.** Re-baking is one command, generates byte-stable output deterministically (seed pinned), keeps the documented contract. The visual change (terrain flattens 5x in absolute height) is intentional and matches design intent. Worth visual-verifying RH and OC look acceptable at 6m / 5m peaks before tagging.
2. **Q2: Cinema runner timeout root cause?** Author lean: probably a font CSS file fetched from a CDN that isn't responding, blocking Playwright's "wait for fonts" before screenshot. Workaround: pass `{ animations: 'disabled' }` or set a longer `timeout` option on `page.screenshot`, or bypass font wait entirely with `await page.evaluate(() => document.fonts.ready)` then `page.screenshot({ timeout: 60000 })`.
3. **Q3: Should the camera poses in `tools/cinematic/shot-list.mjs` be re-tuned for the post-amplitude-fix terrain?** The Cycle 12+13 hero poses were tuned with terrain at 5x design heights. Post-fix, target.y values that put the camera "behind the dog" will now point above the dog. **Author lean: yes, all 7 shots need a quick pose re-pin against the corrected terrain.** Use `__sdsCinema.freeFly()` + `snapshotPose()` on each shot.
4. **Q4: Cinematic video scope.** Plan said 4 videos. Worth shipping all 4 or trimming? **Author lean: ship all 4.** Each is independent, ~10s long, ~2-3 min to render once posed.

## Architecture / shared changes

None this cycle. Single contract fix in `Heightfield.sample()` (or wherever Q1 lands), and one debug pass on the cinema runner.

## Phase 1 — Heightfield amplitude fix (~2hr)

**Independently testable.** Land first; Phase 2/3 depend on the post-fix build for fresh shots.

1. **Resolve Q1.** Pick one of A/B/C.
2. **If Option A:** run `npm run bake-heightmaps` after editing the bake script to write normalized data. Verify: `node -e 'const fs=require("fs"); const a=new Float32Array(fs.readFileSync("public/terrain/open-country.r32f").buffer); ...'` should show `min` and `max` in `[0, 1]` (post-normalization) for OC and RH. Field stays all zeros.
3. **If Option B:** edit `shared/terrain/Heightfield.js` `sample()` to drop `* peakHeight`. Update `tests/heightfield.spec.js` to construct heightfields with metres inputs.
4. **Re-relax GrassSystem clamp back to its original purpose** (catch heightfield discontinuities, not legit terrain). With amplitude fixed, `>50` is over-permissive. Tighten back to `>15` (10m terrain peak budget + buffer).
5. **Visual verify on RTX 3070** all three scenes — RH should be subtly flatter (rolling hills vs mini-mountains), OC similar. Both should still feel like the same scenes, just with truer-to-design proportions.
6. **Update standing risks in `BACKLOG.md`** to remove the amplification footgun.

**Acceptance:**
- `Heightfield.sample(0, 0)` on OC returns ~5 (not ~25).
- All three scenes still render cleanly post-fix.
- vitest 180/180 still passes.
- Grass still sits on terrain.

## Phase 2 — Cinema runner timeout fix (~1hr)

**Independently testable.** Can run in parallel with Phase 1.

1. **Reproduce.** `npm run cinema -- --shot=og-rh-sunset` against the dev server. Confirm the timeout still fires.
2. **Diagnose.** Open the runner's first-shot path with `--headed` to see the Chromium UI. Check DevTools network tab for hung font requests. Likely culprit: a Google Fonts CSS or a `@font-face src=url(...)` whose origin isn't responding.
3. **Fix per Q2 lean.** Probably one of:
   - Increase `page.screenshot` `timeout` option to 60000ms.
   - Skip font-wait: `await page.screenshot({ timeout: 60000, animations: 'disabled' })`.
   - Pre-evaluate `await page.evaluate(() => document.fonts.ready).catch(() => {})` before screenshot and rely on a manual delay.
4. **Sanity-run the full `--kind=static` pass.** All 3 OG cards should generate without timeout.

**Acceptance:** Cinema runner generates all 3 OG cards in one `--kind=static` run, no timeouts.

## Phase 3 — Re-pose + render 4 cinematic videos (~3hr, depends on Phase 1 + 2)

**Depends on:** Phase 1 (terrain heights changed) + Phase 2 (runner works).

Per Q3: re-pose each video shot's camera against the post-amplitude-fix terrain.

1. **For each of `dog-into-sunset`, `lightning-strike`, `chaos-5000`, `oc-portal`:**
   - Open `https://localhost:3000/?cinematic=1&scene=<id>&sun=<n>` in headed Chrome.
   - Boot the appropriate mode (Solo Classic / Solo Extreme / Sandbox-5000).
   - `await __sdsCinema.freeFly()` → fly to the desired pose → `__sdsCinema.snapshotPose()`.
   - Replace the existing `camera:` keyframes in `tools/cinematic/shot-list.mjs` with the new pose.
   - For multi-keyframe (orbital, dolly), pose the start + end + 1-2 mid-points.
2. **Render via `npm run cinema -- --shot=<id>`** — outputs to `assets/marketing/videos/<id>.mp4` + `<id>-720p.mp4`.
3. **Visual review each video** — confirm subjects are framed correctly post-amplitude-fix.

**Acceptance:** 4 cinematic videos rendered to `assets/marketing/videos/`, each visually framed correctly on the post-fix terrain. Videos under ~5 MB each (720p variant).

## Dependencies

```
Phase 1 (amplitude fix) → Phase 3 (videos)
Phase 2 (cinema runner)  → Phase 3 (videos)
```

Phase 1 and Phase 2 can run in parallel.

## Frozen files (cycle-specific additions)

- `public/terrain/*.r32f` — re-baking these IS the work (Phase 1 Option A) but the file contents changing has downstream visual implications. Re-bake should be in a single, atomic commit on the same branch as the `Heightfield.sample()` change so the contract stays self-consistent.

## Hard stops

Surface to the user, do not proceed:

1. Frozen-file change without scope authorization — see [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).
2. Sim-baseline test failure post-amplitude-fix — sheep AI / dog AI / camera clamp may rely on the amplified Y range; sim baselines could shift. Don't regenerate fixtures; investigate first.
3. Visual regression on a scene that previously passed Cycle 19 verification — fix or revert before adding scope.
4. Frametime regression > 5% on `perf-check` — diagnose before adding scope.

## What NOT to do during this cycle

- **Don't introduce a new clamp or tweak in `GrassSystem.js` to mask Phase 1 issues.** If Phase 1 surfaces a grass-on-terrain regression, fix the root cause in the heightfield, not the grass placement.
- **Don't ship `v1.1.1` for these.** They're carryover polish; bundle into `v1.2.0` when the next feature lands. The version bump can wait.
- **Don't re-tune impostor bake lighting.** Cycle 19 verified parity; leave it alone.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] Phase 1 — heightfield amplitude bug fixed at the root (Q1 path documented in commit). Terrain peaks now match documented `peakHeight`.
- [ ] Phase 2 — cinema runner generates OG cards without timeout.
- [ ] Phase 3 — 4 cinematic videos rendered on post-fix build, framed correctly.
- [ ] All vitest specs pass.
- [ ] Production build clean.
- [ ] `perf-check` CI green vs Linux baseline.
- [ ] Live on sheepdogsim.com via GH Actions at the cycle-close push commit.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/archive/cycles/cycle-19-plan.md`](archive/cycles/cycle-19-plan.md) — previous cycle
- [`tools/cinematic/run.mjs`](../tools/cinematic/run.mjs) + [`tools/cinematic/shot-list.mjs`](../tools/cinematic/shot-list.mjs) — cinema pipeline
- [`shared/terrain/Heightfield.js`](../shared/terrain/Heightfield.js) + [`scripts/bake-heightmap.mjs`](../scripts/bake-heightmap.mjs) — heightfield contract
