# Cycle 39 — Sun, scorched-earth

> Drafted 2026-05-20, scope re-defined 2026-05-21 after a scorched-earth call from Matt: rip the existing radial-splotch sun and plant principles. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Rip the radial-splotch sun out and rebuild on physical principles. After cycle 39 the sun is a small bright disc through bloom, and the broad warm glow lives in the sky shader's Mie scattering term (not in a billboard halo). Horizon glow becomes a natural consequence of the same Mie function evaluated at low altitude, not a separate hand-tuned blend. Disc and sky read sun chromaticity from one source. PC desktop only. No `shared/` sim changes. No `SunSystem.js` directional-light changes. Bloom config is in scope (lifting cycle-39's original "no bloom changes" stop after the scorched-earth call).

## Principles (the load-bearing decisions)

The previous Cycle 39 plan tried to fix the sun by layering more chroma bands on the same billboard quad. That plan is dead. The principles below are the *why* of the replacement; the phases below are the *how*.

1. **The disc is just the disc.** A small bright thing, soft pixel-scale edge, nearly uniform luminance. No halo math in the disc shader. No mid-band. No outer corona. One color, one radius. Bloom paints the glow.
2. **The aureole lives in the sky shader.** The bright halo around the sun is atmospheric scattering near the sun direction. It belongs in the same shader that already computes the sky color. Mie phase function (Henyey-Greenstein, `g ≈ 0.76-0.85`) evaluated against `dot(viewDir, sunDirection)` gives the forward-scattering aureole. The same function at low altitude gives the horizon glow as a natural consequence (longer atmospheric path → more scattering). There is no separate "horizon glow" term to color-match to a separate "corona outer" — they are the same function.
3. **Bloom is the painter.** A correct sun is a small HDR-bright thing seen through a tonemapped pipeline. The warm glow the player perceives is what bloom does to that. If bloom isn't delivering, fix bloom — don't bake the glow into the disc shader.
4. **One source of sun chromaticity.** Disc and sky both call the same sun-color-at-elevation function. No `painterlyPalette.js` color literals to keep in sync across four materials.
5. **One renderer path.** Same math, same blending, same intensity model for the WebGL fallback and the WebGPU node. The disc is too simple to justify two divergent implementations.
6. **No camera-direction warp.** If the sun is off-screen, the aureole in the sky shader carries the light direction. The disc renders where the disc actually is. The current [`SunBillboard.js:130-139`](../js/effects/SunBillboard.js#L130-L139) "visualDirection" hack is deleted.

## What's being torn out

Concrete deletions, named so a cold-start agent can verify the scorched earth:

- **[`js/effects/SunBillboard.js`](../js/effects/SunBillboard.js):** the `haloFalloff` term, `halo` term, `uHaloColor` uniform, dual lerp-mix in `update()` between WebGL and WebGPU paths, and the `_visualDir` camera-warping block (lines ~130-139).
- **[`js/effects/konveyorSunNodeMaterial.js`](../js/effects/konveyorSunNodeMaterial.js):** the `haloFalloff`, `halo`, `haloColor`/`haloColorNode`, `alphaHaloMix`, `boundedIntensity` divergence from the WebGL path, and the `userData.konveyorSunBillboardOwnership.owns: 'readable-disc-and-near-halo'` claim (the disc owns the disc; the sky owns the halo).
- **[`js/atmosphere/konveyorSkyNodeMaterial.js`](../js/atmosphere/konveyorSkyNodeMaterial.js):** the `uvSunDisc` + `uvSunGlow` UV-space path (lines 23-26). The `physicalSunGlow = pow(smoothstep(0.56, 1.0, sunAlignment), 2.4)` band-aid (line 29) gets replaced with a Mie phase function, not extended.
- **The `painterlyPalette.js` module** from the previous plan: never written.

## Architecture / shared changes

No `shared/` sim changes. All edits are in the WebGL + WebGPU renderer materials.

One small new module: [`js/atmosphere/sunChromaticity.js`](../js/atmosphere/sunChromaticity.js) — a pure function `sunColorAtElevation(elevation: number) -> {r, g, b}` plus a `mieAureolePhaseHG(cosTheta: number, g: number) -> number` helper. Both used by the disc and the sky shader so chromaticity and aureole math have a single source.

The `sunElevation` value (already in [`Atmosphere.js`](../js/atmosphere/Atmosphere.js)) gets forwarded to:

- The sun-billboard `update()` (already partially routed via `_tmpDir.y`).
- The sky shader as a uniform (was previously inferred via `sunDirection.y`; explicit uniform clarifies the contract).

Cloud rim-light and water sun-glint chroma carry — both in the previous cycle-39 plan — are **deferred to cycle 40** per the scorched-earth call. If a future cycle wants them, they read from `sunChromaticity.js` for free.

## Phase shape rules

A cycle has **≤ 8 phases**. Each is **fully autonomous** for this cycle. Each phase has a **single sharp goal** and **≤ 4 hours** of work.

## Acceptance criteria — EARS format

Every phase's Acceptance section uses [EARS notation](https://kiro.dev/docs/specs/) so the lines are testable by construction.

## 2026-05-22 status review addendum

Current status after direct repo and runtime review:

- Phases A-C are on `main`: the sun billboard is a disc, the sky owns the Mie aureole, and sun chromaticity has one source.
- Phase D shipped the depth-test fix plus dead halo* cleanup, but not the original bloom-audit matrix. `cycle39-validation/screenshots/phaseD-bloom/` currently contains 3 diagnostic WebGPU sky captures, not the 12-PNG gameplay matrix.
- `npm test`, `npm run lint`, and `npm run build` are green as of the review. Build warnings are the existing large chunks and `shared/SceneObstacles.js` mixed static/dynamic import warning.
- Live preview rendered gameplay scenes, but the in-app browser probe did not expose the usual `window.__sds`, `window.__sdsCinema`, or `window.__perfHarness` globals. Treat this as a capture-rig problem to verify with the repo Playwright tooling before calling it an app regression.
- `?ui=off` still left the static `#site-footer` links visible at the bottom of screenshots. Final acceptance captures must hide that footer as well as HUD/debug overlays.
- Console warnings observed during live preview: repeated `THREE.LightsNode.setupNodeLights: Light node not found...`, `THREE.WARNING: Multiple instances of Three.js being imported`, and `THREE.Renderer: "renderAsync()" has been deprecated...`. Phase E should either clean these up or explicitly record why they are non-blocking.
- Visual read: the ugly clipped radial-splotch sun is gone, but the scene still needs a real gameplay capture matrix to judge bloom, horizon/water glint, and whether the sun feels inspiring rather than merely less wrong.
- Pixel Forge's static octahedral imposter pipeline appears ready for a follow-up lab import, but SDS is still on v1 `latlon` / `hemi-y` tree sidecars and an explicit `?konveyorNativeTreeImpostors=1` gate. Do not fold a tree production swap into Cycle 39.

## 2026-05-22 closeout addendum

Cycle 39 Phase E is closed. The final gameplay baseline is local-only evidence under `cycle39-validation/screenshots/phase5-painterly-final/` with 12 PNGs across `{field, rolling-hills, open-country} x {sun=0.20, 0.35, 0.50, 0.75}`; matching runtime JSONs live at `cycle39-validation/runtime/phase5-painterly-final-sun-*.json`. The `cycle*-validation/` folders are intentionally ignored by git and remain local proof artifacts.

The capture rig used the actual gameplay path with `?ui=off`; the final matrix excluded the static footer, React HUD, and debug overlays. The three older diagnostic PNGs in `cycle39-validation/screenshots/phaseD-bloom/` remain diagnostic only and did not count toward close acceptance.

The Cycle 40 carryovers listed below were consumed by [`cycle-40-plan.md`](cycle-40-plan.md) where in scope: water sun-color coherence, cloud highlight/rim coherence, and a lab-only Pixel Forge v2 octahedral tree route. Device proof, production tree defaulting, broader tree art variety, and the Open Country paired playtest remain deferred.

## Phase A — Strip the disc to a disc (~2hr)

**Independently testable.** Tear the halo math out of both renderer paths. The disc becomes one small soft-edged radial falloff with a single color uniform.

1. **[`js/effects/SunBillboard.js`](../js/effects/SunBillboard.js):** delete the `halo`, `haloFalloff`, `uHaloColor`, `alphaHaloMix` terms. The fragment shader is one `smoothstep(coreRadius, coreFeather, r)` driving both alpha and color. Delete `_visualDir`, `_cameraForward`, `_cameraRight`, `_cameraUp` and the `if (facing < 0.92)` warp block in `update()`. The disc sits at `cameraPosition + sunDirection.normalize() * distance`, period.
2. **[`js/effects/konveyorSunNodeMaterial.js`](../js/effects/konveyorSunNodeMaterial.js):** mirror the strip. Delete `haloFalloff`, `halo`, `haloColor`, `haloColorNode`, `alphaHaloMix`, `boundedIntensity`. Same `colorNode` and `opacityNode` math as the WebGL fragment so the two paths agree byte-for-byte (modulo float precision).
3. **One renderer-path update.** The diverging `materialControls.update({...})` lerp blocks at [`SunBillboard.js:154-170`](../js/effects/SunBillboard.js#L154-L170) collapse to a single path: read `sunColorAtElevation(elevation)` and write it to `uCoreColor` / the konveyor core uniform. Same value, same call site.
4. **Renderer-path divergence sentinel.** Add a vitest that snapshots the konveyor node material's `userData` ownership tag and asserts `owns === 'disc-body-only'` (replaces `'readable-disc-and-near-halo'`). Catches future drift.

**Files touched (none frozen):**

- [`js/effects/SunBillboard.js`](../js/effects/SunBillboard.js)
- [`js/effects/konveyorSunNodeMaterial.js`](../js/effects/konveyorSunNodeMaterial.js)
- [`js/atmosphere/Atmosphere.js`](../js/atmosphere/Atmosphere.js) (forward `sunElevation` cleanly)
- New: [`js/atmosphere/sunChromaticity.js`](../js/atmosphere/sunChromaticity.js) (stub the function; Phase C fleshes the math)
- New: `tests/sun-disc.spec.js` (renderer-path divergence sentinel)

**Acceptance (EARS):**

- When Phase A ships, then `grep -c "haloColor\|haloFalloff\|alphaHaloMix" js/effects/SunBillboard.js js/effects/konveyorSunNodeMaterial.js` shall return `0`.
- When Phase A ships, then `grep -c "_visualDir\|_cameraForward\|facing < 0.92" js/effects/SunBillboard.js` shall return `0`.
- When Phase A ships, then [`konveyorSunNodeMaterial.js`](../js/effects/konveyorSunNodeMaterial.js)'s `userData.konveyorSunBillboardOwnership.owns` shall equal `'disc-body-only'`.
- When `npm test` runs after Phase A, all vitest specs shall pass (including the new sentinel).
- When `npm run build` runs after Phase A, production build shall be clean.

## Phase B — Mie aureole in the sky shader (~3hr)

**Depends on Phase A's disc strip** (so the aureole isn't fighting the old halo). Replace the sky shader's ad-hoc `physicalSunGlow` smoothstep with a Mie phase function on `dot(viewDir, sunDirection)`. The horizon glow stops being a separate term — it falls out of evaluating the same function at low altitude where atmospheric path length is longer.

1. **[`js/atmosphere/konveyorSkyNodeMaterial.js`](../js/atmosphere/konveyorSkyNodeMaterial.js):** delete the `uvSunDisc` and `uvSunGlow` UV-space path (lines 23-26). Replace `physicalSunGlow = pow(smoothstep(0.56, 1.0, sunAlignment), 2.4)` with a Henyey-Greenstein phase function: `aureole = (1 - g²) / pow(1 + g² - 2·g·cosTheta, 1.5)` where `cosTheta = dot(viewDir, sunDirection)` and `g ≈ 0.80` (tunable per ToD). Multiply by an HG strength that grows with `atmosphericPathLength = 1 / max(viewDir.y, 0.01)` so the horizon naturally lights up.
2. **WebGL parity at [`js/atmosphere/skyShader.glsl.js`](../js/atmosphere/skyShader.glsl.js):** same HG function, same path-length multiplier. The two shaders must produce visually identical aureoles across the capture matrix.
3. **Forward `sunDirection` as a normalized 3-vec** (already present) and `sunElevation` (already implicit via `sunDirection.y` but route it explicitly so the shader doesn't recompute).
4. **Capture matrix consolidated into Phase E.** Driving a per-phase 12-PNG rig through the dev preview against a live gameplay camera was rejected as ceremony; after the Phase D subset shipped, the bloom audit and final coherence pass share the Phase E gameplay capture rig. Phase B verifies structurally via tests, build, and a live-preview smoke that the render path doesn't break.

**Files touched:**

- [`js/atmosphere/konveyorSkyNodeMaterial.js`](../js/atmosphere/konveyorSkyNodeMaterial.js)
- [`js/atmosphere/skyShader.glsl.js`](../js/atmosphere/skyShader.glsl.js)
- [`js/atmosphere/sunChromaticity.js`](../js/atmosphere/sunChromaticity.js) (export `mieAureolePhaseHG`)

**Acceptance (EARS):**

- When Phase B ships, then `grep -c "uvSunDisc\|uvSunGlow\|physicalSunGlow" js/atmosphere/konveyorSkyNodeMaterial.js` shall return `0`.
- When Phase B ships, then `grep -c "mieAureolePhaseHG\|HenyeyGreenstein\|aureole" js/atmosphere/konveyorSkyNodeMaterial.js js/atmosphere/skyShader.glsl.js` shall return ≥ 2.
- When Phase B ships, then a live-preview smoke shall confirm the sky renders without artifacts (sky dome on-screen, no z-fighting, no banding) and the new tuning fields (`aureoleG`, `ownership: 'sky-aureole-and-horizon-glow'`) appear on `material.userData.konveyorSkyPresetTuning`.
- The 12-PNG capture matrix that would verify the disc-edge → aureole transition is seamless is consolidated into Phase E's gameplay rig (which has the same controlled-camera concern) and reviewed there. If a visible smoothstep ring appears in any final capture, that surfaces as a Phase B follow-up before the cycle closes.

## Phase C — Single sun-chromaticity source (~1hr)

**Depends on Phase A + B.** Today the disc has one chromaticity calculation and the sky has another. This phase consolidates: [`sunChromaticity.js`](../js/atmosphere/sunChromaticity.js) exposes `sunColorAtElevation(elevation)`; the disc reads it; the sky reads it. No duplicated literals across [`SunBillboard.js`](../js/effects/SunBillboard.js), [`konveyorSunNodeMaterial.js`](../js/effects/konveyorSunNodeMaterial.js), [`konveyorSkyNodeMaterial.js`](../js/atmosphere/konveyorSkyNodeMaterial.js), [`skyShader.glsl.js`](../js/atmosphere/skyShader.glsl.js).

1. **Implement `sunColorAtElevation`** as a small 3-stop or 4-stop interpolation: low elevation = warm amber, mid = white-yellow, high = near-white. Function lives once, in `sunChromaticity.js`.
2. **Disc reads from the function** in both renderer paths (`SunBillboard.update()` already has the hook from Phase A; konveyor path mirrors).
3. **Sky reads from the function** for its `sunColor` term. Existing `skyFog.sunColor` plumbing in [`konveyorSkyNodeMaterial.js:14`](../js/atmosphere/konveyorSkyNodeMaterial.js#L14) becomes a derived value from elevation, not a preset literal.

**Files touched:**

- [`js/atmosphere/sunChromaticity.js`](../js/atmosphere/sunChromaticity.js)
- [`js/effects/SunBillboard.js`](../js/effects/SunBillboard.js)
- [`js/effects/konveyorSunNodeMaterial.js`](../js/effects/konveyorSunNodeMaterial.js)
- [`js/atmosphere/konveyorSkyNodeMaterial.js`](../js/atmosphere/konveyorSkyNodeMaterial.js)
- [`js/atmosphere/skyShader.glsl.js`](../js/atmosphere/skyShader.glsl.js)
- [`js/atmosphere/skyPresets.js`](../js/atmosphere/skyPresets.js) (drop hardcoded `sunColor` per preset; the function is the source)

**Acceptance (EARS):**

- When Phase C ships, then no `sunColor:` literal shall remain in [`skyPresets.js`](../js/atmosphere/skyPresets.js).
- When Phase C ships, then the `preset.sunColor` short-circuit in [`Atmosphere.applyPreset`](../js/atmosphere/Atmosphere.js) shall be removed; `sun.setColor` always reads from `sky.getSun()` (the physical Hosek-Wilkie source).
- When Phase C ships, then `sunColorAtElevation` in [`js/atmosphere/sunChromaticity.js`](../js/atmosphere/sunChromaticity.js) shall produce values within RGB-distance 0.25 of `sky.getSun()` at elevations 0.1, 0.3, 0.6, 0.9 (the standalone-helper agreement contract; pinned by `tests/sun-chromaticity.spec.js`).
- When `npm test` runs after Phase C, all vitest specs shall pass.
- When Phase C ships, then [`tests/refactor-baseline/__fixtures__/bundle-sizes.json`](../tests/refactor-baseline/__fixtures__/bundle-sizes.json) shall be bumped from `mainKB: 591` to `mainKB: 592` to absorb the 1 KB intentional growth from Phase B's HG aureole math + grep-discoverable comments inside the GLSL template literal in [`skyShader.glsl.js`](../js/atmosphere/skyShader.glsl.js). Three.js bundle is unchanged (`threeKB: 603`). Future cleanup item (cycle 40 candidate): strip GLSL template-literal comments at build time so explanatory comments don't ship to the browser.

## Phase D — Sun depth-test fix + bloom-audit precondition cleanup (~2hr, shipped)

**What landed.** [`konveyorNodeMaterialFactorySuite.js`](../js/konveyorNodeMaterialFactorySuite.js) dusk + golden-hour `effects.sun` blocks: flipped `depthTest: false` → `depthTest: true` and stripped the dead halo* fields (`haloStrength`, `haloPower`, `alphaHaloMix`, `haloColor`) that Phase A orphaned. The remaining `coreRadius` + `coreFeather` defaults aligned with [`konveyorSunNodeMaterial.js`](../js/effects/konveyorSunNodeMaterial.js) (`0.04` / `0.12`).

**Why.** Matt flagged the sun was visible *through* terrain — a legacy `depthTest: false` from the haloed-disc era where the soft warm glow was meant to always read. Now that the disc is a small bright thing and bloom paints the glow, proper terrain occlusion matters.

**Verified.** Tests pass (491 passed, 7 skipped specs), build clean. Headless WebGPU captures via [`tools/capture-webgpu-scene-sky.mjs`](../tools/capture-webgpu-scene-sky.mjs) (`--channel=chrome` to work around bundled-Playwright dxil.dll error on this Windows box) for all three scenes confirm the disc renders as a small crisp warm-white dot, not the prior splotchy halo. Synthetic diagnostic scenes don't have terrain in front of the sun direction, so direct depth-test occlusion proof is deferred to Phase E captures against the actual gameplay scenes. The 3 PNGs under `cycle39-validation/screenshots/phaseD-bloom/` are diagnostic evidence only and do not satisfy the original 12-PNG gameplay bloom acceptance.

## Open items deferred to Phase E

- **Bloom audit (the actual 12-PNG matrix).** Driving the dev preview to controlled ToD captures across {field, rolling-hills, open-country} x {0.20, 0.35, 0.50, 0.75} requires either a working live-preview rig at gameplay state or a custom Playwright capture against the gameplay path (not the diagnostic synthetic scene). The dev preview got into a stuck-renderer state post-`/?ui=off -> Just Play` flow during Phase C/D verification (eval responsive, but `sceneManager.render()` / `getCamera()` / per-frame loop hits 0 times in 1 second), so manual rig work is needed.
- **Capture-rig verification.** The 2026-05-22 in-app browser review rendered gameplay, but `window.__sds`, `window.__sdsCinema`, and `window.__perfHarness` were not visible even with `?perfMode=1&probeRender=1`. Verify this with the repo Playwright path before treating it as an app bug. If the in-app browser remains unsuitable, use existing Playwright tooling instead of lowering the acceptance bar.
- **`?ui=off` footer leakage.** The static `#site-footer` still appears at the bottom of captures. Final Phase E images must hide it, along with HUD and debug overlays.
- **Disc-uniform propagation after scene rebuild.** Surfaced during Phase C: after `disposeScene` + `rebuildScene`, the new SunBillboard's konveyorCoreColorUniform / konveyorIntensityUniform stay at construction defaults; `sun.light.color` (the Phase C contract) is correct but doesn't propagate to the disc. Hypothesis: the same per-frame loop that stops calling render/getCamera also stops calling `_sunBillboard.update`. Likely pre-existing post-rebuild issue, surfaced (not caused) by Phase D's verification flow.
- **Phase D's original bloom-config tuning.** Not run because the precondition (a steady gameplay-scene capture rig) isn't in place. The depth-test fix + dead-halo cleanup ship as Phase D's scoped wins; the bloom tuning carries into Phase E.
- **Console warning hygiene.** Before close, either clean or explicitly record the observed `THREE.LightsNode.setupNodeLights`, multiple Three.js instance, and `renderAsync()` deprecation warnings. Any fatal console error blocks close.

## Phase D — Original bloom-audit plan (deferred into Phase E)

**Depends on Phase A–C.** With the disc small and the aureole physical, verify bloom delivers the warm glow the principles say it should. If it doesn't, tune.

1. **Capture matrix.** Original target was `cycle39-validation/screenshots/phaseD-bloom/{biome}-{tod}.png`; after the Phase D subset shipped, the acceptance matrix moves to `cycle39-validation/screenshots/phase5-painterly-final/{biome}-{tod}.png`. The old `phaseD-bloom` folder may contain diagnostic captures only.
2. **Read each capture.** At golden hour the small disc should show as a warm peach-white core with a bloom-painted warm halo extending well past the disc edge. At midday the disc should be a tight punch with minimal bloom spread.
3. **If midday reads cold or golden-hour reads anemic,** tune bloom `threshold` and `strength` in [`js/postprocess/BloomPass.js`](../js/postprocess/BloomPass.js) or the equivalent konveyor bloom config. Record the before/after numbers in the cycle close commit.
4. **Hard stop check (cycle-39 amended #1):** if no bloom tuning gets the warm-at-golden-hour read, surface to Matt rather than reverting to a baked-in halo. The principle is non-negotiable.

**Files touched:**

- Possibly [`js/postprocess/BloomPass.js`](../js/postprocess/BloomPass.js) or konveyor bloom config (touch only if captures demand it)
- `cycle39-validation/screenshots/phase5-painterly-final/**`

**Acceptance (EARS):**

- When the deferred bloom audit ships in Phase E, then `cycle39-validation/screenshots/phase5-painterly-final/` shall contain >= 12 gameplay PNGs.
- While the sun is below `elev = 0.2` (golden hour) in any biome capture, bloom shall paint a visible warm halo extending ≥ 3× the disc radius beyond the disc edge.
- While the sun is above `elev = 0.7` (midday) in any biome capture, the disc shall read as a tight bright punch with bloom spread ≤ 1.5× the disc radius.
- If neither bloom default nor a tuned threshold/strength gets the warm-at-golden-hour read, then Phase E shall surface to Matt before shipping (no baked-in halo as fallback).

## Phase E — Coherence + final 12-PNG baseline (~2hr)

**Depends on Phase A–D.** Final capture matrix, validate, prep cycle close.

1. **Stabilize the gameplay capture path.** Final captures must come from the actual gameplay scene path, not `webgpu-diagnostic`. `?ui=off` must hide React HUD, debug overlays, and the static `#site-footer`. If `window.__sdsCinema` / `window.__perfHarness` are unavailable in the in-app browser, verify with the repo Playwright tooling and document the capture path used.
2. **Final captures.** `cycle39-validation/screenshots/phase5-painterly-final/{biome}-{tod}.png`. 12 PNGs: {field, rolling-hills, open-country} x {0.20, 0.35, 0.50, 0.75}. Same matrix shape as the other phases for direct A/B comparison.
3. **Review each capture.** Inspect the small sun disc, sky aureole, bloom spread, water horizon/glint readability, tree silhouette coherence, terrain occlusion, and absence of footer/HUD/debug overlays.
4. **Tune only if captures prove it.** Bloom config is in scope if golden-hour reads anemic or midday reads cold/flat. Do not reintroduce a baked disc halo.
5. **`/validate`** - all tests + build + last-deploy check.
6. **Cycle close prep.** Walk every Acceptance line in this plan; surface any that didn't ship, and record Cycle 40 carryovers.

**Files touched:**

- `cycle39-validation/screenshots/phase5-painterly-final/**`

**Acceptance (EARS):**

- When Phase E ships, then `cycle39-validation/screenshots/phase5-painterly-final/` shall contain ≥ 12 PNGs.
- When Phase E ships, then those PNGs shall be captured from the gameplay scene path, not the diagnostic synthetic sky scene.
- When Phase E ships, then final captures shall not show `#site-footer`, React HUD, or debug overlays under `?ui=off`.
- When Phase E ships, then the 3 existing diagnostic PNGs in `cycle39-validation/screenshots/phaseD-bloom/` shall not count toward the final 12-PNG matrix.
- When Phase E ships, then [`js/effects/SunBillboard.js`](../js/effects/SunBillboard.js) shall still contain no halo/corona/aureole math.
- When Phase E ships, then console errors during the capture run shall be zero; known warnings shall be cleaned up or explicitly recorded as non-blocking.
- When `npm test` runs at Phase E close, all vitest specs shall pass.
- When `npm run build` runs at Phase E close, production build shall be clean.
- When the cycle close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.

## Cycle 40 carryovers from the status review

- **Water glint and horizon chroma.** Closed in Cycle 40 by feeding atmosphere `sunColor` into water and cloud material updates.
- **Pixel Forge static octahedral tree lab import.** Closed as a lab route in Cycle 40: v2 sidecars are staged under `assets/models/trees/octahedral/`, `layout: "octahedral"` is accepted in tests, and runtime tile selection branches by layout. Production defaulting is still deferred.
- **Tree asset art pass.** Once the v2 import is proven, add more species/shape variety and material tuning. Preserve dog-through-tree readability and low-tier budget before raising density or variety.
- **Mobile tree budget matrix.** Re-run Android captures and perf at `?konveyorNativeTreeImpostors=1` before defaulting native impostors on mobile.
- **Open Country paired playtest.** Run the deferred two-client sheep-driving playtest after visual closeout so gameplay readability is validated in the heaviest scene.

## Dependencies

```
Phase A (strip disc) → Phase B (Mie aureole) → Phase C (single chromaticity)
                                             → Phase D (bloom audit)
                                             → Phase E (final captures)
```

Phase C and Phase D could parallelize after B, but at ~1hr each it's not worth the orchestration. Run them sequentially.

## Frozen files (cycle-specific additions)

The durable fence ([`INTERFACE_FENCE.md`](INTERFACE_FENCE.md)) applies in full. This cycle adds no cycle-specific frozen-file authorizations — no `shared/`, no scene-def schema, no wire-protocol files are touched. All changes are in WebGL/WebGPU material files plus one new `js/atmosphere/sunChromaticity.js`.

## Hard stops

Durable hard stops apply on every cycle ([`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-39 additions:

1. **(Amended from the original plan.)** If the small HDR disc through bloom reads as anemic at golden hour or cold across biomes, **tune bloom** (Phase D explicitly authorizes this). Do not bake a halo back into the disc shader. If bloom tuning still doesn't deliver, surface to Matt before shipping any band-aid.
2. **If any phase reaches into `shared/`** to chase a visual difference, stop and surface — this cycle is render-only by contract.
3. **No `?sunMode` query-param scaffolding.** Replace legacy outright. The git diff is the A/B.
4. **No painterly palette module reintroduction.** The single source of truth is `sunChromaticity.js` plus the Mie phase function in the sky shader. If a future phase wants more knobs, it gets a new function, not a color-stop table.

## What NOT to do during this cycle

- **No volumetric god-rays.** Separate cycle if Matt wants them.
- **No lens flares, ghosts, or anamorphic streaks.** Out of scope.
- **No `SunSystem.js` directional-light changes.** Scene lighting energy stays as-is.
- **No mobile-tier shader variants.** PC desktop only this cycle.
- **No cloud rim-light + water glint chroma work.** Deferred to cycle 40. If the principles in this cycle hold, those become single-line reads from `sunChromaticity.js` later.
- **No `painterlyPalette.js` module.** That was the previous plan's mistake; not reintroduced.
- **No camera-direction warping of the sun position.** Off-screen sun = off-screen disc.
- **No additive blending divergence between renderer paths.** Same blending mode in both.

## Success criteria (cycle close)

- [x] When the cycle closes, Phases A-E shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [x] When `npm test` runs at cycle close, all vitest specs shall pass.
- [x] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [x] When cycle 39 closes, [`js/effects/SunBillboard.js`](../js/effects/SunBillboard.js) shall contain zero halo / corona / aureole math (verified by grep) and the broad glow shall live in [`konveyorSkyNodeMaterial.js`](../js/atmosphere/konveyorSkyNodeMaterial.js) + [`skyShader.glsl.js`](../js/atmosphere/skyShader.glsl.js).
- [x] When cycle 39 closes, disc and sky shall read sun chromaticity from `js/atmosphere/sunChromaticity.js` (no duplicated color literals).
- [x] When cycle 39 closes, `cycle39-validation/screenshots/phase5-painterly-final/` shall have a 12-PNG gameplay capture matrix (3 biomes x 4 ToD) Matt has reviewed and accepted as the new baseline.
- [x] When cycle 39 closes, that final capture matrix shall show no `#site-footer`, HUD, or debug overlays under `?ui=off`.
- [x] When cycle 39 closes, the 3 diagnostic WebGPU sky captures in `cycle39-validation/screenshots/phaseD-bloom/` shall be documented as diagnostic evidence only, not baseline acceptance.
- [x] When cycle 39 closes, water/glint, Pixel Forge octahedral tree import, Android tree budget, and Open Country paired playtest carryovers shall be recorded for Cycle 40/backlog routing.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — cycle plan template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) — pickup-state contract
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [EARS notation](https://kiro.dev/docs/specs/) — testable acceptance lines
- [`js/effects/SunBillboard.js`](../js/effects/SunBillboard.js) — current WebGL sun billboard (to be stripped)
- [`js/effects/konveyorSunNodeMaterial.js`](../js/effects/konveyorSunNodeMaterial.js) — current WebGPU node sun billboard (to be stripped)
- [`js/atmosphere/konveyorSkyNodeMaterial.js`](../js/atmosphere/konveyorSkyNodeMaterial.js) — sky shader that gains the Mie aureole
- [`js/impostors/impostorTileSelection.js`](../js/impostors/impostorTileSelection.js) — existing octahedral selector to wire in a future tree lab import
- [`tests/imposter-sidecar.spec.js`](../tests/imposter-sidecar.spec.js) — current v1 latlon/hemi-y sidecar contract
- Sibling repo `C:\Users\Mattm\X\games-3d\pixel-forge` — static octahedral imposter pipeline source for a future tree import
- [Henyey-Greenstein phase function](https://en.wikipedia.org/wiki/Henyey%E2%80%93Greenstein_phase_function) — Mie scattering approximation used in Phase B
