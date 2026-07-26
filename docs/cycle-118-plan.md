# Cycle 118 - water-rewrite

> Authored 2026-07-25 from a read-only reconnaissance pass against the shipped build, after Phase 1's before-capture had already landed. **The reconnaissance corrected four claims in [`../cycle118-validation/WATER_BEFORE.md`](../cycle118-validation/WATER_BEFORE.md) and one in D30.** Those corrections are in "What measurement changed" below and they move real work around. Read that section before the phases.

## Goal

The water stops being cel-shaded anime cobalt and becomes a stylised painterly surface that belongs to the same world as the grass and the sky. One shared surface model, both render paths authored against it, one palette, a normal with enough amplitude to shade, and fog that tracks the sky instead of a colour frozen at boot.

## What measurement changed

**1. The palette lives at five sites, not four, and D30's four are the wrong four.** D30 says "the palette retired from all four definition sites into one". There are five (six literal blocks), and the one it misses is the one that actually produces the cobalt:

| # | Site | What |
|---|---|---|
| 1 | [`js/water/AnimeWater.js`](../js/water/AnimeWater.js):22-26 | `WATER_PALETTE_RGB` - shallow `#6fd7d2`, deep `#103662`, foam `#eaf6ff` |
| 2 | `js/water/AnimeWater.js`:273-275 | the same three hexes again as uniform defaults, **not derived from #1** |
| 3 | [`js/water/webgpuWaterNodeMaterialFactories.js`](../js/water/webgpuWaterNodeMaterialFactories.js):5-11 | `DEFAULT_WATER_COLORS`, the same colours in linear float |
| 4 | [`js/diagnostics/webgpuDiagnostic.js`](../js/diagnostics/webgpuDiagnostic.js):49-53 | `DIAGNOSTIC_WATER_PALETTE_RGB`, a byte-identical copy of #1 |
| **5** | [`js/atmosphere/skyFogPresetTuning.js`](../js/atmosphere/skyFogPresetTuning.js):161 (`dusk`) and :258 (`golden-hour`) | **`colorTint`, a per-channel multiplier of `[0.22, 0.40, 1.42]` / `[0.20, 0.38, 1.46]`** |

Site 5 is applied at `webgpuAnimeWaterNodeMaterial.js:115` as `.mul(vec3(...colorTint))`. A blue multiplier of 1.42 against a red multiplier of 0.20 is what turns the authored deep blue into the shipped cobalt. **Retiring sites 1 to 4 and leaving `colorTint` alive would ship a rewrite that looks unchanged.** No scene in `shared/scenes/` defines a water colour, and there is no config-file site.

**2. The production path already has an analytic normal. WATER_BEFORE.md is wrong about this.** It records "`N` is a hardcoded up-vector that is never perturbed, so both specular terms evaluate against a perfect plane". That is exact for the WebGL twin (`AnimeWater.js:188`) and **false for the node material production actually runs**: `webgpuAnimeWaterNodeMaterial.js:76-92` builds a three-rotation slope field and a real `rippleNormal`. Two things make it photograph as mirror-flat:

- the slope scale is `0.055`, a maximum tilt of about **3.1 degrees**; and
- the *broad* sun-path term at `:93-94` uses a flat up-vector and is not gated by the normal at all, and in the shipped weighting at `:112` it carries the dominant contribution.

Zero vertex displacement **is** true of both paths (no `positionNode` or `vertexNode` anywhere in `js/water/`). So the acceptance criterion is written against **slope amplitude and term weighting**, not against the existence of a normal.

**3. The animation clock is not the one WATER_BEFORE.md names, and fixing the named one changes nothing.** `js/main.js:2993` does update water outside the `cinema.paused` guard using `performance.now()` - true as recorded. But on the production path that `timeSec` is **silently discarded**: `AnimeWater.js:384-393` routes to the node controls, and `webgpuAnimeWaterNodeMaterial.js:157-169` has no `timeSec` branch. The real clock is TSL `time`, which is `frame.time`, the renderer's own, advanced on every `renderer.render()` regardless of anything `main.js` does. This strengthens rather than weakens the "not byte-deterministic" verdict, and it moves the fix into the material.

**4. One knob in the shipped tuning is dead.** `skyFogPresetTuning.js:164/261` specifies `sunSpecularIntensity: 0.48` for both water presets. `webgpuWaterNodeMaterialFactories.js:37` resolves `context.sunSpecularIntensity ?? waterDefaults...`, and `AnimeWater.js:341` always supplies `0.6`, so the per-preset value can never take effect. The before-capture records 0.6, correctly. Do not carry this knob forward without wiring it or deleting it.

**5. The bundle blocker is gone.** The `other` chunk family had 121 bytes of headroom when this cycle was scoped. Cycle 119's basis-transcoder fix (pulled forward, see below) freed **56 KiB**. `AnimeWater-*.js` is 9,761 bytes and `webgpuNodeMaterialFactorySuite-*.js` is 52,701 bytes, both in `other`. This cycle is no longer byte-starved, but it is still not licensed to bump a ratchet.

## What the de-risking pass corrected, 2026-07-26

A second read-only pass ran against Phases 2 to 6 before any of them started. It confirmed most of the plan and found six things that would have cost real time mid-phase. **These corrections supersede the phase text below wherever they disagree.**

**A. Phase 4's (a)/(b) fork does not exist. Take (a), and it is free.** `material.toneMapped` is **never read by `WebGPURenderer`**: `grep -c toneMapped node_modules/three/build/three.webgpu.js` returns **0**, in the un-minified source build, and production loads a copy of exactly that build. Tone mapping on this renderer is one full-screen pass over the finished frame (`Renderer._getFrameBufferTarget` / `_renderOutput`, with three's own comment that this is done "in a separate render pass and not inline" unlike `WebGLRenderer`). So the water **is already tone-mapped**, `webgpuAnimeWaterNodeMaterial.js:128` is a dead line, and `material.fog = true` is independent of all of it (`NodeMaterial.setupOutput` gates on `this.fog` alone). Phase 4 is a deletion, it changes zero pixels, and it owes `scene-and-render.md` no rationale because no per-material fog uniform gets created.

The reason to reject (b) is different from the one the plan gave, and it is the load-bearing one: `Atmosphere.applyFogColor` fills `scene.fog.color` via `fogColorMatchingSky`, which by construction returns the **pre**-tone-map value that lands on the sky's painted colour after the curve. A genuinely raw consumer lands on the inverse-tone-mapped colour, brighter, which is exactly the bright-band defect class Cycle 112 P6 removed. Because `toneMapped` is inert, water and terrain write into the same space, so whatever is correct for the terrain is correct for the water.

Two riders. The **WebGL twin genuinely is raw** (`AnimeWater.js:201` writes `gl_FragColor` with no tonemapping or colorspace chunk, deliberately, while `fog: true` blends toward the same pre-tone-map colour), so its horizon has the mismatch in the opposite direction: decide explicitly whether Phase 4 fixes both paths or only production, and say which. And `paintedHorizon.js:22-28` justifies its inverse-tone-map solve with "the sky dome sets `toneMapped = false`; the terrain is tone mapped", a distinction that does not exist on this renderer. Cycle 112 P6 shipped and was pixel-verified, so something is empirically compensating. **Flagged, not resolved.** Probe pixels before re-deriving the fog colour from first principles.

**B. Two of Phase 2's three acceptance criteria are broken.**

- `grep -rn "6fd7d2\|103662\|eaf6ff" js/` **already returns exactly one file today**. It is blind to sites 1 and 4, which spell the palette as byte arrays (`[0x6f, 0xd7, 0xd2]`), and to site 3, which spells it as decimal floats (`[0.4353, 0.8431, 0.8235]`). The criterion would keep passing if Phase 2 shipped nothing. This is the fifth spec in this program that certifies rather than catches. Rewrite it to assert every consumer imports the one exported palette.
- `grep -rn "colorTint" js/` **cannot return nothing**. There are 26 matches across 8 files and only 4 are water; the rest are live terrain, grass-blade and meadow-quad knobs. Scope it to `grep -rn "colorTint" js/water/` returning nothing, plus no `colorTint` key in `skyFogPresetTuning.js`'s two water blocks.

**C. The `depthT` split is a two-way split after Phase 4, and one of the three uses is dead code.** All four of the plan's claims are confirmed, and the conclusion drawn from them was too gentle. Measured, with `hasHeightfield` at 1 as production runs it:

| scene | `minDepthT` | `depthT` stays pinned at the floor until the seabed is |
|---|---:|---:|
| Rolling Hills | 0.82 | **13.18 m** below the water plane |
| Open Country | 0.82 | **23.03 m** below the water plane |
| Newsheepdogland | 0.45 | **6.41 m** below the water plane |

On Rolling Hills everything from the foam line out to 13 m of seabed depth is a **single flat colour**. There is no near-shore gradient to look at at all. And the three uses sit in three regimes: `:105`'s `smoothstep(0.08, 0.55, depthT)` is **identically 1.0 on both islands, dead code** whose constants prove it was authored for an unfloored `depthT`; `:113` is the only pair authored around the 0.82 floor and **Phase 4 deletes it outright**; `:114` is the only one that genuinely wants a shore-to-deep ramp. **Do Phase 4 before Phase 3's item 3.** Un-flooring `depthT` silently reactivates a glint term nobody has seen in the life of the floor, so `:105` gets a deliberate decision or a hard-coded 1.

**D. The palette numbers Phase 3 actually starts from.** Tints confirmed verbatim: `[0.22, 0.40, 1.42]` at `:161` (dusk, Rolling Hills and Newsheepdogland) and `[0.20, 0.38, 1.46]` at `:258` (golden-hour, Open Country). At the `depthT` the scenes actually sit at, the full chain through ACES at exposure 1.0:

| depthT | shipped, dusk | tint retired | shipped, golden-hour | tint retired |
|---|---|---|---|---|
| 0.45 (NSL floor) | `#0050a8` | `#3b8f92` | - | - |
| 0.82 (RH / OC floor) | `#002477` | `#064e62` | `#002379` | `#064e62` |
| 1.00 | `#000650` | `#00163e` | `#000551` | `#00163e` |

The tint takes a desaturated teal `#064e62` to a saturated navy `#002477`. **That is the cobalt**, and finding 1 above is exactly right. Two corrections to the surrounding detail: **foam is neither tinted nor colour-scaled** (`:120` sits outside that chain and only ever sees `foamScale`), and **site 3 is sRGB float, not linear** as the table above says. The same space bug is live in site 4 (`webgpuDiagnostic.js` divides by 255) and the cross-check spec compares `/255` on both sides, so it is structurally incapable of seeing it. Phase 2's "one definition" has to settle the **space**, not just the count.

**E. Phase 5's material-side facts are right and every `js/main.js` line number is wrong.** The `cinema.paused` guard is **`:2959`**, not `:2964`. The water block is **`:2974-2979`** with the `performance.now() * 0.001` call at **`:2978`**, not `:2991-2995`, which is the **rock rim-colour** block. Hard stop 4's probe reference is **`:1679-1690`**, not `:1662-1672`. `deltaTime` is in scope at both blocks, so a wrong-block edit compiles silently. Also: the call already passes seconds, so `_waterClock += deltaTime` is unit-compatible only if `deltaTime` is seconds (it is, the same one feeding `updateGrassAnimation`). And the substitution count is **11 lines but 15 substitutions** - four lines carry two `time` references each. Say both numbers so nobody replaces 11 and stops.

**F-measured, after Phases 2, 4 and 5.** Correction F called the third chunk exactly: `waterSurfaceModel-*.js` is emitted at **3,299 B**, counted in `other`, not duplicated. `other` 651,117 -> 653,370 B (+2,253), 639 KiB against a 692 KiB budget, 55,276 B of headroom left. `webgpuDiagnostic` 86,293 -> 86,192 B (**-101**), so the phase pushed the flagged landmine in the safe direction and left it 894 B of room. `main` is the one F did not flag and it was the binding constraint: 678,805 -> 679,508 B (+703), 664 KiB against `mainKB` 664 and chunk budget 665. Everything else byte-identical. `bundle-sizes.json` unmodified. See "The model is two files" under Phase 2 for what the first attempt cost and why it was restructured.

**F. Bundle prediction, and a landmine the plan does not flag.** `other` sits at 651,079 B against 692 KiB with **57,529 B** of headroom, so Phase 2 is not close to the budget. But the stated precedent does not transfer: `foliageLightingRig.js` was neither duplicated nor given its own chunk, it merged into `webgpuKilnImpostorNodeMaterial-*.js` and the suite imports it from there, which was only possible because the suite already statically imports that chunk. `AnimeWater-*.js` has no such import edge (the two paths are decoupled through a window global), so expect a **third chunk `waterSurfaceModel-*.js`, counted in `other`, not duplicated**. The landmine: **`webgpuDiagnostic` has 747 bytes of headroom**, and Phase 2 item 3 touches that file. Moving the palette out shrinks it, which is fine and is the direction to push; adding anything there trips a ratchet this plan declares unauthorised. Not build-verified: one `npm run build` plus `ls dist/assets | grep waterSurface` confirms it after Phase 2's first commit.

**G. Smaller corrections.** Phase 3's "maximum tilt of about 3.1 degrees" is `atan(0.055)`, but `slopeX`/`slopeZ` are sums of three wave terms and are not unit-bounded: true **max tilt is 8.26 degrees**, RMS 2.88. Record the tilt, not just the scale, or the acceptance invites reasoning from `atan(new_scale)`. Site 4's palette is at `webgpuDiagnostic.js:55-59`, not `:49-53`. Phase 2 item 2 cannot literally have one implementation: a GLSL string in a template literal and a TSL node graph are different artefacts, so "expressed once" means either a shared module exporting both a GLSL source string and a mirrored TSL builder with a test pinning them to the same outputs, or the WebGL twin transcribing the TSL value-noise. **Name which, or the phase discovers it mid-flight.** And the same shadowing that kills `sunSpecularIntensity` also makes the material **born with a white sun** (`AnimeWater.js:338-339` supplies white from the WebGL uniform bag); the per-frame controls update rescues it, so it is a first-frame artefact, but `tests/webgpu-water-material-adapter.spec.js:142` **pins the white value**, so a Phase 2 cleanup that fixes it is a consumer migration rather than a rename.

## Phase 1 - The before-capture - DONE

Shipped ahead of this plan, deliberately: a before-capture is worthless once rewrite code exists. [`tools/validation/water-look.mjs`](../tools/validation/water-look.mjs), `npm run validation:water`, 24 frames in `cycle118-validation/water-before/`. Findings in [`WATER_BEFORE.md`](../cycle118-validation/WATER_BEFORE.md), as corrected above.

## Phase 2 - One surface model (~4hr)

A single module that owns the water's geometry-independent maths, imported by both paths, so the two cannot diverge again. Precedent: [`js/world/foliageLightingRig.js`](../js/world/foliageLightingRig.js) is the single foliage-lighting authority and this follows it exactly.

1. New `js/water/waterSurfaceModel.js`: the palette (one definition), the shoreline/depth resolve, the slope field and its normal, and the noise basis. No THREE import beyond what both paths already take.
2. **Collapse the duplicated noise.** `AnimeWater.js:132-158` is a ~27-line Ashima simplex in GLSL; `webgpuAnimeWaterNodeMaterial.js:11-27` is a TSL `valueNoise`. They are the same idea implemented twice and they do not even agree. One basis, expressed once.
3. Retire palette sites 2, 3 and 4 to re-export from the model. Site 4 (`webgpuDiagnostic.js`) is a copy that exists only to be cross-checked by `tests/webgpu-diagnostic.spec.js:559-583`; that cross-check becomes trivial once there is one definition, which is the point.
4. **Retire `colorTint` (site 5).** Fold whatever hue shift is still wanted into the single palette. A per-preset tint that silently multiplies the authored colour by 1.4x is exactly the drift this phase exists to end.

**Acceptance (EARS), rewritten per correction B.** The two original greps could not detect this phase's work and are replaced:

- When Phase 2 ships, then every water-palette consumer shall import the model's single exported palette, and a spec shall fail if any file re-declares the colours in any spelling (hex, byte array, or decimal float).
- When Phase 2 ships, then `grep -rn "colorTint" js/water/` shall return nothing and neither water block in `skyFogPresetTuning.js` shall carry a `colorTint` key. The 22 non-water `colorTint` matches are live terrain, grass and meadow knobs and stay.
- When Phase 2 ships, then the palette's colour **space** shall be stated once in the model and every consumer shall agree with it, including `webgpuDiagnostic.js`, whose `/255` sRGB floats currently disagree with production's linear values while the cross-check spec compares `/255` on both sides and cannot see it.
- When a water colour is changed in the model, then both render paths shall change with it and a spec shall fail if only one does.
- When Phase 2 item 2 ships, then the plan shall record which of the two noise strategies was taken, since a GLSL template string and a TSL node graph cannot be one implementation.

### What Phase 2 shipped, and the decisions it was asked to record

New module [`js/water/waterSurfaceModel.js`](../js/water/waterSurfaceModel.js), following the [`js/world/foliageLightingRig.js`](../js/world/foliageLightingRig.js) shape. Lock-in test [`tests/water-surface-model.spec.js`](../tests/water-surface-model.spec.js), six specs, five of which fail against pre-Phase-2 code.

**Noise strategy: (ii), the WebGL twin transcribes the TSL value-noise.** The Ashima simplex is gone from [`js/water/AnimeWater.js`](../js/water/AnimeWater.js). One set of exported constants generates three artefacts: a pure-JS reference (`waterValueNoise2D`, pinned numerically in CI), a GLSL source string (`WATER_SURFACE_GLSL`, interpolated from those same constants so it cannot drift), and a TSL builder (`buildWaterNoiseNodes`). Strategy (i) was rejected because "a test pinning them to the same outputs" is not achievable off-GPU: a TSL graph has no numeric evaluation without a renderer, so the pinning test would have compared two things it could not both run. The enforceable invariant is instead that both artefacts are generated from one constant set and neither render path declares a noise of its own, which is what the spec asserts.

Because the twin's call sites were authored against simplex's `[-1, 1]` range, the GLSL exposes `waterValueNoiseSigned` and every former `snoise()` call maps onto it one-for-one. Every threshold in the twin is exactly as authored; only the basis underneath changed.

**Colour space: linear-sRGB, stated once as `WATER_COLOR_SPACE`.** The palette is authored as sRGB bytes (`WATER_PALETTE_SRGB_BYTES`) and consumed as linear floats (`WATER_PALETTE_LINEAR`), with `srgbToLinear`/`linearToSrgb` reproducing three's own transfer exactly. The spec pins `WATER_PALETTE_LINEAR.shallow` against what `THREE.Color` resolves the same bytes to, so the two spellings cannot fork again. `webgpuDiagnostic.js` now reports linear, and its cross-check spec compares against the model with no `/255` on either side.

**There are SIX palette sites, not five.** The single-declaration guard found one the plan did not count: [`js/diagnostics/glProbe.js`](../js/diagnostics/glProbe.js):130 `FOAM_WHITE_RGB = [0xea, 0xf6, 0xff]`, with its own re-derived `isNearFoamWhite`. It samples the framebuffer to detect the "ground rendered white" failure mode, so a palette change would have moved the water and left the probe judging the retired colour. Retired to the model.

**Foam is preserved as an exception, not unified.** It sits outside the tint-and-scale chain and only ever sees `foamScale`. That is unchanged and commented at the call site.

**`colorTint` is deleted with nothing folded in.** Per correction D the tint is what turns the desaturated teal `#064e62` into the saturated navy `#002477`, so folding an equivalent hue shift into the palette would re-encode the cobalt and defeat the phase. **This is a deliberate look change shipping in Phase 2**: the water moves from cobalt toward the authored teal at both presets. Phase 3 authors the pastoral palette from there.

**The model is two files, and the ratchet is why.** [`js/water/waterPalette.js`](../js/water/waterPalette.js) is a leaf holding only the palette, the space, the transfer and the foam-white predicate; [`waterSurfaceModel.js`](../js/water/waterSurfaceModel.js) re-exports every one of its symbols, so every consumer but one imports the model and never sees the split. The exception is `glProbe.js`, which `js/main.js` imports statically and which therefore rides the `main` chunk. Measured: the full model minifies to 4,753 B against **1,632 B** of `main` headroom (`mainKB` 664 with round semantics, baseline 678,805 B). Importing the model there put `main` at 667 KiB against budgets of 664 and 665, a two-budget trip on a fixture this cycle is explicitly not authorised to bump. The two alternatives were both worse: carve `glProbe` out of the single-declaration guard (a spec certifying a bug, the exact failure mode this program keeps hitting), or leave a sixth palette copy live. The leaf costs 703 B in `main` and keeps the invariant real. For the same reason the Phase 5 clock lives on the water object rather than as a model import in `main`.

**The slope field moved too, and the WebGL twin now uses it.** The twin shaded against a hardcoded up-vector, which is the claim `WATER_BEFORE.md` made about both paths and which was only ever true of this one. Both paths now call the shared field at `WATER_SLOPE_SCALE = 0.055`, so Phase 3 raises one constant. Max tilt at that scale is 8.26 degrees (RMS 2.88), not the `atan(0.055)` reading of 3.1; the spec asserts the 8.26 so Phase 3 has to update it deliberately. The twin also picked up the node path's split of terms: sharp Blinn lobe on the perturbed normal, broad sun path on the flat one.

## Phase 3 - The surface reads as water (~4hr)

The look work, authored against Phase 2's model, on both paths.

1. **Give the normal amplitude.** The current 0.055 slope scale is a 3-degree tilt. Raise it until the surface shades, and rebalance `:112` so the ripple term carries the read rather than the flat broad term. Judge this against `cycle118-validation/water-before/` by eye, not by a number.
2. Retire the cel quantisation and the anime sparkle pass (D-W names both).
3. Keep the two-band depth gradient as a concept but **fix its range**: `minDepthT` is 0.82 on both islands, so `depthT` is confined to the deep 18% and the two-band read is nearly absent outside Newsheepdogland (0.45). Note that `depthT` is reused three ways - base colour at `:114`, glint horizon suppression at `:105`, fog ramp at `:113` - so moving it moves all three. Split them if they need different curves.
4. The palette moves into the pastoral range. Cobalt is the single loudest thing the before-capture shows.

**Acceptance (EARS):** When Phase 3 ships, then the water shall carry a perturbed normal whose slope scale is recorded in the plan and is greater than the shipped 0.055. When Phase 3 ships, then no cel quantisation step and no sparkle pass shall remain on either path. While a scene is at noon or at dusk, the water shall read as the same surface in both, differing by light rather than by palette.

## Phase 4 - Fog that tracks the sky (~3hr)

The water has its own horizon seam, and it is the same defect class Cycle 112 Phase 6 fixed for the terrain.

The cause, exactly: `webgpuAnimeWaterNodeMaterial.js:124` bakes `water.fogColor` into the node graph as a **literal `vec3`**, not a `uniform()`. The value comes from `productionWebGpuBoot.js:31-39` `resolveSceneSkyFog`, which reads the scene's **declared** `sky.preset` and calls `createAtmosphereFrame` once per boot, before a renderer exists (`skyFogSamplePacket.js:80-82` concedes it assumes the default tone curve). `AnimeWater.js`'s context carries no `fogColor` key, so every water material for the whole session resolves to that one boot-time array. `Atmosphere.applyFogColor()` runs every frame and this value never sees it.

The terrain's fix was **deletion, not re-plumbing**: `webgpuTerrainNodeMaterial.js:134-172` removed the hand-rolled fog composite and set `material.fog = true`, so Three's own fog node binds `reference()` uniforms to the live `scene.fog` instance that `Atmosphere.applyFogColor()` (`js/atmosphere/Atmosphere.js:543-556`) mutates **in place**. The in-place mutation is load-bearing.

**The water cannot copy that verbatim and the plan must not pretend otherwise.** The terrain is `MeshLambertNodeMaterial`; the water is `MeshBasicNodeMaterial` with `toneMapped = false` (`:128`) and colours authored pre-tone-map. So decide, explicitly, and record which:

- **(a) the rewritten water is tone-mapped** - then `material.fog = true`, delete `fogColor` and `fogStrength` outright, terrain-style; or
- **(b) it stays raw** - then `fogColor` becomes a live `uniform()` driven from `scene.fog.color` in the per-frame controls update. That is a per-material fog, which [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) forbids by default, so it needs the written rationale that rule demands.

Mirror the terrain's lock-in test, [`tests/terrain-scene-fog.spec.js`](../tests/terrain-scene-fog.spec.js): five specs including a source-text grep guard and an Atmosphere integration spec proving `scene.fog` is the same object at two times of day with different colours.

**Acceptance (EARS):** When the sun moves, then the water's horizon shall move with the sky's and a spec shall fail if it does not. When Phase 4 ships, then no water colour shall be sampled at boot and held for the session. If option (b) is taken, then the cycle plan shall carry the written rationale `scene-and-render.md` requires for a per-material fog.

### What Phase 4 shipped, and the decisions it was asked to record

**Option (a), and correction A is confirmed.** `grep -c toneMapped node_modules/three/build/three.webgpu.js` returns **0**. `material.toneMapped = false` deleted, `fogColor` and `fogStrength` deleted from the node material, the factories, the factory suite's water block, and both preset-tuning water blocks. `material.fog = true` written out explicitly, terrain-style. Lock-in test [`tests/water-scene-fog.spec.js`](../tests/water-scene-fog.spec.js), five specs mirroring [`tests/terrain-scene-fog.spec.js`](../tests/terrain-scene-fog.spec.js), three of which fail against pre-Phase-4 code (the two that pass are the twin's standard-fog-chunk guard and the Atmosphere in-place-mutation spec, which pin preconditions that were already correct, exactly as their terrain counterparts did).

**Measured while wiring it: `Material.fog` already defaults to `true`, so the water was ALREADY getting Three's live scene fog.** The hand-rolled ramp was a *second* fog composited underneath it, not the only one. That makes the defect shape identical to the terrain's rather than merely analogous, and it means `material.fog = true` changes no behaviour at all: the behaviour change is purely the deletion of the frozen pass. Magnitude of that pass: `smoothstep(0.7, 1.0, depthT) * 0.025`, which at the shipped depth floors is 0.0088 on Rolling Hills and Open Country and up to 0.025 at full depth. Small, real, and frozen at boot.

**WebGL twin fog scope: production only. The twin's raw-output mismatch is deliberately left.** [`js/water/AnimeWater.js`](../js/water/AnimeWater.js):201 writes `gl_FragColor` with no tonemapping or colorspace chunk, deliberately per its own header, while `fog: true` blends toward the same pre-tone-map `scene.fog.color`. Three reasons to leave it. It is a tone-curve mismatch, not the frozen-colour defect this phase exists to fix: the twin's fog already tracks the sky through the standard chunk, which is why Phase 4 is a WebGPU-only edit in the first place. Fixing it means adding the tonemapping and colorspace chunks, which changes the twin's look, and Phase 3 owns the look with pixels in front of it. And correction A's own rider flags `paintedHorizon.js`'s inverse-tone-map justification as empirically compensating for something not yet identified, so re-deriving a raw consumer's fog colour from first principles is exactly the move that rider says to probe pixels before making. The fifth spec pins that the twin still carries `THREE.UniformsLib.fog` and nothing more, so it cannot drift into a hand-rolled fog while this waits.

**`:105`'s dead glint suppression: left exactly as-is, with the warning moved into the code.** `smoothstep(0.08, 0.55, depthT)` is identically 1.0 at both shipped floors (0.82 and 0.45), so hard-coding it to 1 would be behaviour-preserving today. It was not hard-coded, because doing so destroys the information Phase 3 needs: the constants are the only surviving record that the glint was meant to fade near shore. The expression is untouched and now carries a comment stating that it is dead at the current floor, that Phase 4 removed `depthT`'s only other consumer, and that lowering `minDepthT` reactivates it. That puts the warning where Phase 3 will actually read it rather than in a plan it may not re-open.

## Phase 5 - A clock you can photograph (~2hr)

Golden captures are impossible today because TSL `time` free-runs. Five touches, and the third is the whole fix on the material side:

1. `webgpuAnimeWaterNodeMaterial.js:10` - drop `time` from the TSL destructure, add `const waterTime = uniform(0)`, substitute across the 11 call-site lines (`:55, 57, 62, 63, 82-87, 103`), which carry **15 substitutions**: `:55`, `:57`, `:62` and `:103` each hold two `time` references. Replacing 11 and stopping leaves four live.
2. `:143-148` - add `waterTime` to `webgpuWaterNodeUniforms`.
3. `:157-169` - add the missing branch: `if (Number.isFinite(state.timeSec)) nodes.waterTime.value = state.timeSec;`. **This closes the drop-on-the-floor bug** that makes `main.js`'s `timeSec` a no-op today.
4. **`js/main.js:2974-2979`** (corrected, see E) - accumulate `this._waterClock += deltaTime` and pass that in place of the `performance.now() * 0.001` at **`:2978`**. `deltaTime` is already seconds, matching that call's units. **`:2991-2995` is the rock rim-colour block and `deltaTime` is in scope there too, so editing it compiles and does nothing.** Do not simply move the block inside the **`:2959`** paused guard: `sunDir` and `sunColor` also stop updating there, which breaks `water-look.mjs`'s `setSun` flow. Sun state keeps pushing every frame; only the clock pauses.
5. `tools/validation/water-look.mjs` - a `__sdsCinema`-reachable setter to pin the clock before each `shootPose`, so the rAF ticks at `:453-460` cannot advance it.

**Acceptance (EARS):** When the sim is paused, then the water surface shall not advance. When the same pose is captured twice at the same pinned clock, then the two frames shall be byte-identical.

### What Phase 5 shipped

All five touches, on the corrected line numbers. Lock-in test [`tests/water-clock.spec.js`](../tests/water-clock.spec.js), five specs, four of which fail against pre-Phase-5 code.

**Substitution accounting, since the count moved under Phase 2.** The 15 substitutions across 11 lines were correct against the original file. Phase 2 moved six of them (the `:82-87` slope waves) into `buildWaterSlopeNormalNode`, where they collapse to that builder's single `time` parameter. So the file carries 9 call-site substitutions on 5 lines (`:55`, `:57`, `:62`, `:63`, `:103` in original numbering) plus 1 at the builder call, and 9 + 6 folded = the original 15, all accounted for. `grep -n "\btime\b"` on the finished file returns four lines: one object-literal key (`time: waterTime`, the builder's parameter name) and three in prose. The spec asserts the invariant directly instead: `time` is absent from the TSL destructure and no `time.mul(` survives.

**The accumulator is a model export, not an inline expression.** `advanceWaterClock(current, deltaTime, { paused })` lives in `waterSurfaceModel.js` so "when the sim is paused, the water surface shall not advance" is a real unit test rather than a source-text grep. `js/main.js` calls it, gated on `window.__sdsCinema?.paused`, with the sun state still pushing every frame outside the guard. `_waterClock` is initialised to 0 in `initWorld.js` next to the water build and reset in `loadScene.js` next to the teardown, so a scene swap does not carry a stale phase.

**The pin is `__sdsCinema.setWaterClock(seconds)`**, which sets the accumulator and pushes it straight through to the material rather than waiting a frame. `water-look.mjs` calls it once before the pose settles and again inside each of the four rAF ticks, because those ticks run main.js's frame and an unpinned clock would advance four times between posing the camera and reading the canvas. `PINNED_WATER_CLOCK = 12.0`, deliberately not 0: at t=0 the three rotated wave terms share a phase and the surface reads flatter than it ever does in play.

## Phase 6 - The after-capture and the verdict (~2hr)

1. **Fix the `shore-out` pitch first.** `water-look.mjs:281-283` puts the camera at `camY(..., 2.0, 2.0)` against a target 150m out at `waterY + 0.6`; on Rolling Hills' steep coast the camera lands at 14.7m and the ~5-degree downward pitch drops the shoreline out of frame, so two of that scene's four frames are duplicates of `open-water`. Clamp the pitch or scale the target distance with camera height. **Rolling Hills is the scene most players see first** and its near-shore water is currently covered by one pose.
2. Re-run against `cycle118-validation/water-after/`. The report's `purpose` (`:483`) and `phase: 1` (`:482`) are hardcoded to "before".
3. **Add a comparison step, and make it a palette histogram rather than SSIM.** The histogram is what actually answers D-W ("is it still cobalt"), and unlike SSIM it is insensitive to ripple phase, so it works whether or not Phase 5 fully lands.
4. `readWaterStateInPage` (`:335-340`) filters `userData` for scalar keys prefixed `webgpuWater`. If the rewrite renames or nests those, the after-report silently records nothing where the before-report has 13 values. Keep the prefix or update the reader in the same commit.

**Acceptance (EARS):** When Phase 6 ships, then all three water scenes shall have been captured after the rewrite and compared against the before set. When the comparison runs, then it shall report a per-frame palette histogram. When `shore-out` is captured on Rolling Hills, then the frame shall contain shoreline.

## Frozen files

- **`js/water/AnimeWater.js` and `js/water/webgpuAnimeWaterNodeMaterial.js`** are the rewrite target, authorised by D-W and D30.
- **`tests/refactor-baseline/__fixtures__/bundle-sizes.json`** is NOT authorised. No ratchet bump.

## Hard stops

1. **Every capture must prove genuine WebGPU.** `assertWebGpuEngaged` (`water-look.mjs:100-117`) throws before any frame is written. Do not relax it; headless Chrome has no `navigator.gpu` and the Cycle 103 lesson is that "WebGPU" goldens were silently WebGL for months.
2. **No ratchet bump.** Cycle 119's basis fix bought 56 KiB of headroom in `other`; that headroom is for the whole remaining program, not for this cycle to spend.
3. **Do not break the heightfield foam branch.** In production `hasHeightfield` is always 1, so the shipped foam is the heightfield-interface branch (`:63-72`), not the boundary branch. Newsheepdogland is a `coastline` with no real radius - `AnimeWater.js:207-231` synthesises a bbox disc whose radius is meaningless - so if the heightfield branch breaks, NSL's foam disappears entirely.
4. **The `userData.webgpuWater*` keys are a contract**, read by **`js/main.js:1679-1690`**'s visual probe (corrected, see E) and asserted by `tests/webgpu-water-material-adapter.spec.js`. Renaming them is a consumer migration, not a rename. The same spec pins the material's **white birth sun** at `:142`, so fixing that shadowing is also a consumer migration.
5. **Do not change the water Y (-0.05) or the plane size** without re-deriving the terrain skirt interaction. `shared/terrain/Heightfield.js:120-138` takes terrain to exactly 0.00 past `worldSize/2`, which is 5cm above the water, and there is a second mobile-only skirt at `js/TerrainBuilder.js:1198-1206` parked at -0.01. Both are above the waterline.

## Explicitly out of scope

- **The terrain skirt itself.** Measured at 130m (Rolling Hills), 190m (Open Country) and 430m (Newsheepdogland) from the shoreline. Real, recorded, and a terrain problem rather than a water problem.
- **`tools/konveyor-production-water-proof.mjs:53`**, which asserts a material name retired in Cycle 87. A cycle-pinned historical probe; leave it.
- **The bake-time heightmap double-multiply** (`scripts/bake-heightmap.mjs:202` writes metres, `Heightfield.sample` multiplies by `peakHeight` again). Found during Cycle 117 reconnaissance, load-bearing for the current look, needs its own cycle.

## Success criteria (cycle close)

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to `BACKLOG.md` carryover.
- [ ] When `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` run at cycle close, all four shall pass.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When Phase 2 ships, then every consumer shall import the model's single palette, in one stated colour space, pinned by a spec that fails on any re-declaration in any spelling.
- [ ] When Phase 2 ships, then `grep -rn "colorTint" js/water/` shall return nothing and neither water block in `skyFogPresetTuning.js` shall carry the key.
- [ ] When Phase 2 ships, then the noise strategy taken shall be recorded here.
- [ ] When Phase 3 ships, then the slope scale shall exceed 0.055 and the resulting **max and RMS tilt in degrees** shall be recorded here, and no cel quantisation or sparkle pass shall remain on either path.
- [ ] When Phase 4 ships, then the plan shall record whether the WebGL twin's raw-fog mismatch was fixed alongside production or deliberately left.
- [ ] When Phase 4 ships, then `:113`'s `fogStrength` term shall be gone and `:105`'s dead glint suppression shall be given a deliberate decision rather than reactivated as a side effect.
- [ ] When the sun moves, then the water's horizon shall move with the sky's.
- [ ] When the sim is paused, then the water surface shall not advance.
- [ ] When Phase 6 ships, then all three water scenes shall have been captured after and compared by palette histogram.
- [ ] When the cycle closes, then `bundle-sizes.json` shall be unmodified.

## References

- [`../cycle118-validation/WATER_BEFORE.md`](../cycle118-validation/WATER_BEFORE.md) - the before-capture, and the four claims corrected above
- [`../DECISIONS.md`](../DECISIONS.md) - D9 (the stylised target), D-W (rewrite not retune), D30 (the rewrite's shape), D31 (the bundle cycle)
- [`front-door-roadmap.md`](front-door-roadmap.md) - where this cycle sits
- [`../.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) - "Atmosphere drives `scene.fog`", browser probe hygiene
- [`../js/world/foliageLightingRig.js`](../js/world/foliageLightingRig.js) - the single-authority precedent Phase 2 follows
- [`../tests/terrain-scene-fog.spec.js`](../tests/terrain-scene-fog.spec.js) - the lock-in test Phase 4 mirrors
