# Cycle 123 - grass reads the light

> Authored 2026-07-26 from a defect Cycle 120 exposed and could not fix inside its own scope. **This cycle exists because making the sun honest revealed that one large surface was never listening.** D33. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom.

## Goal

Grass responds to the scene lights, so night is dark everywhere instead of dark everywhere except the grass. Then Home Field gets its evening and D25 closes.

## Why this cycle exists

Cycle 120 made the production directional light track time of day. It had been frozen at `1.1 * Math.PI` = 3.45575 white, at every hour, on every scene, because nothing was ever wired to update it. Fixing that exposed the thing underneath:

**Grass is `MeshBasicNodeMaterial` taking baked indirect only. It does not read the scene lights at all.** Cycle 115's own census records this and nobody had reason to care, because a light that never changed and a surface that never listened produce the same picture.

Measured at the end of Cycle 120, over a ground-heavy strip on Rolling Hills:

| | noon | night |
|---|---:|---:|
| terrain floor (p05) | 14.30 | ~0 |
| grass top (p95) | 115.81 | 102.10 |
| **grass : terrain** | **8.1 : 1** | **204 : 1** |

Terrain goes to black and grass falls 12%. The result is a self-lit field hanging over nothing.

## What a second read-only pass found (2026-07-26)

Run before any code, per the practice that has paid for itself in every cycle from 117 on. **One claim above is overstated and the correction makes this cycle materially cheaper.**

**1. "It does not read the scene lights at all" is too strong. Grass already takes a live, per-frame sun direction, on both render paths.** [`js/GrassSystem.js`](../js/GrassSystem.js):2732 `setSunDirection` is driven from the per-frame loop at [`js/main.js`](../js/main.js):2989, and it already forks correctly: the WebGPU path goes through `webgpuGrassBladeMaterialControls.setSunDirection` (and the streamed material alongside it), the WebGL path writes `uniforms.uSunDirection`. The blade shader spends it on the Cycle 14 fake-SSS backlight and a `sunTip` highlight.

**What grass does not read is sun _intensity_, sun _colour_, or ambient.** That is the whole defect, stated precisely: **the direction rotates all day and the brightness never changes.** Which is exactly why night is a glowing field - the sun sets, the grass dutifully re-aims a highlight at it, and nothing dims.

**2. This makes hard stop 3 much cheaper than it reads.** "Both render paths, one shape" already has a shape: one setter, already symmetric, already per-frame, already covering the streamed material. Phase 1 extends an existing channel rather than inventing two new ones. **Do not build a parallel path for intensity next to the existing one for direction** - that is how the two twins drift.

**3. Do not reach for `MeshStandardNodeMaterial`.** [`js/world/webgpuGrassBladeNodeMaterial.js`](../js/world/webgpuGrassBladeNodeMaterial.js):261 reads `MeshBasicNodeMaterial ?? MeshStandardNodeMaterial`, which looks like a lit branch waiting to be switched on and is not: it is a defensive fallback for when the basic class is unavailable, and the material tags itself `webgpuGrassLighting: 'shader-owned-unlit'` versus `'standard-fallback'` at :308. The blade shader owns its entire colour graph - gradient, hue nudge, AO, contact shadow, backlight, rim, fog. Handing that to a standard material would take all of it over at once and blow hard stop 1 on the first frame.

**4. Hard stop 1 has a provable form, and it should be proved rather than eyeballed.** Normalise the new term so it is **exactly 1.0 at the reference preset**, and noon cannot move by construction. [`js/world/sceneLightingRig.js`](../js/world/sceneLightingRig.js) already names every constant that needs: `SUN_REFERENCE_INTENSITY` (`1.1 * Math.PI`), `AMBIENT_REFERENCE_INTENSITY` (`0.75 * Math.PI`), `REFERENCE_AMBIENT_HINT` (0.55, the `pastoral-noon` hint both were tuned at) and `ambientIntensityForHint`. This is the same shape as Cycle 120's finding that the measured 3.456 was just `1.1 * Math.PI` - **a unit test pinning the multiplier to 1.0 at the reference is worth more than a golden here**, because it fails at the cause instead of at the pixel.

**This is currently bounded and about to stop being bounded.** Newsheepdogland is the only scene with a live day loop and it is entrance-gated, so no player sees it today. Cycle 120 Phase 3 wants to give Home Field an evening, and Home Field is wall-to-wall grass, the default scene, and the entrance backdrop. That is why D33 puts this cycle first.

## Phase 1 - Grass takes the light (~4hr)

1. Establish what the grass shader actually receives today, on **both** paths, before changing anything. **Finding 1 above did this** - it receives a live per-frame sun direction and nothing else. Confirm that reading rather than repeating it, then move on; the expensive part of this phase is item 4, not item 1.
2. **Extend the existing channel.** `GrassSystem.setSunDirection` is already the per-frame, both-paths, streamed-material-aware setter. Widen what it carries (intensity and colour, plus ambient) rather than adding a second setter beside it. A name change may fall out of that honestly - if it now carries the light rather than the direction, say so - but that is a consequence, not the goal.
3. Give it the scene's light from the authority. [`js/world/sceneLightingRig.js`](../js/world/sceneLightingRig.js) is what Cycle 120 built and is where the sun and ambient now live; grass should read it rather than sampling a light directly or restating a constant. The rig exists precisely so a consumer cannot silently bind the wrong object, which is the defect Cycle 120 was fixing.
4. **Noon must not move, and prove it by construction rather than by eye.** Per finding 4, normalise the term to exactly 1.0 at the reference preset and pin that with a unit test. The grass look at full sun is shipped, reviewed and in every golden. This cycle changes what happens as the sun goes down, not what the field looks like at midday. A change that improves noon is out of scope and is a separate decision.
5. **Do not switch material classes** (finding 3). The blade shader owns its colour graph; the new term multiplies into it.

**Watch item:** grass is one InstancedMesh with a custom shader and per-instance attributes, and [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) forbids decomposing it. Whatever this costs per blade, it is paid 5,000 times on Solo Chaos. Measure the frame cost rather than assuming a lighting term is free.

**Acceptance (EARS):** When the sun sets, then the grass shall darken with it, and a spec shall fail if it does not. When the light is at the reference preset, then the new lighting term shall evaluate to exactly 1.0, pinned by a unit test. When the sun is at the reference noon, then the grass shall be unchanged from its shipped look, pinned by a golden. When Phase 1 ships, then both render paths shall take the same light from the same authority through the same setter, and a spec shall fail if only one does. When Phase 1 ships, then the grass material class shall be unchanged.

## Phase 2 - The ratio, measured (~2hr)

The defect was found by measurement and it closes by measurement.

1. Re-run the grass-to-terrain ratio at noon, golden hour and night, on all four biomes, on genuine WebGPU. The Cycle 120 numbers above are the before.
2. State the target plainly: at night the two surfaces should sit in a plausible relationship rather than 204:1. **Do not pick a number and tune to it blindly** - judge by eye against the captures, and record what the ratio came out as.
3. Newsheepdogland is the scene that has been shipping this defect to anyone who opened it, so it is the one to look at hardest.

**Acceptance (EARS):** When Phase 2 ships, then the grass-to-terrain ratio shall be recorded at three times of day on all four biomes, before and after. When the ratio is judged acceptable, then the judgement shall be recorded with the capture it was made against.

## Phase 3 - Home Field gets an evening (~3hr)

Cycle 120's deferred Phase 3, unblocked. **This is the phase that closes D25.**

1. `dayNight` on [`../shared/scenes/field.js`](../shared/scenes/field.js). Suggested conservative values, recorded by Cycle 120: `{ enabled: true, secondsPerDay: 3600, initialT: 0.5 }`. That holds the noon everyone knows for about six minutes, brings golden hour around ten, and starts the lamp around twelve.
2. **`DEFAULT_SCENE_ID` is `field`, so this moves the entrance backdrop too.** The entrance hero and the first-load impression are both downstream of it. Look at the entrance, not just the round.
3. The dusk lamp then fires. Cycle 120 already proved the ramp works off the live material (`emissiveIntensity` 0 at noon, 0.2696 at golden hour, 2.2 at night, `cycle120-validation/browser/lamp-zoom__night.png`), so this phase confirms it in play rather than discovering it.

**`shared/scenes/field.js` is a scene-data edit and is authorised by D33 for this phase.** It is not on the fence list; the constraint that deferred it was that the change is a look change to the default scene, which is now decided.

**Acceptance (EARS):** When Home Field runs past sundown, then the scene shall read as evening and the dusk lamp shall light, observed in a browser. When Phase 3 ships, then the entrance backdrop shall have been reviewed at more than one time of day. When Phase 3 ships, then D25 shall be recorded as closed.

## Phase 4 - The browser probe and the goldens (~2hr)

1. Capture all four biomes at noon, golden hour and night on the production WebGPU path. `assertWebGpuEngaged` is not optional: headless Chrome has no `navigator.gpu` and the Cycle 103 lesson is that "WebGPU" goldens were silently WebGL for months.
2. `npm run validation:screenshots -- --diff`, read the delta, re-baseline only after. **Noon cells should barely move** (Phase 1 item 3) and night cells should move a lot; that split is itself the evidence. **Attribute by block, not by score** - the harness replaces `Math.random` globally with one seeded stream and `js/OptimizedSheep.js` draws from it 32 times for the flock layout. Cycles 118 and 120 both used mean absolute luma over the region of interest against an unaffected cell as the noise floor.
3. Review the entrance backdrop specifically, since Phase 3 moved it.

**Acceptance (EARS):** When Phase 4 ships, then all four biomes shall have been captured at three times of day on a genuine WebGPU session. When the goldens are re-baselined, then the delta shall have been read with `--diff` first and the noon-versus-night split shall be reported.

## Frozen files

- **[`../shared/scenes/field.js`](../shared/scenes/field.js)** - not fence-listed, but named here because Phase 3's edit is a deliberate look change to the default scene and the entrance backdrop, authorised by D33. Any other `shared/` edit is out of scope; if the cycle appears to need one, it has drifted.
- **[`../tests/refactor-baseline/__fixtures__/bundle-sizes.json`](../tests/refactor-baseline/__fixtures__/bundle-sizes.json)** is **NOT authorised.** Cycle 119 freed the headroom for the remaining cycles, not for any one of them to spend.

## Hard stops

1. **Noon does not move.** If Phase 1's goldens shift at the reference sun, the change is doing more than it was asked to and the phase stops until that is understood.
2. **No decomposition of `GrassSystem.js`.** Cohesive by design, locked in [`../DECISIONS.md`](../DECISIONS.md).
3. **Both render paths, one shape.** A lighting term in the node material and not in the GLSL twin is a defect regardless of how it looks.
4. **Measure the per-blade cost.** 5,000 sheep is the flock ceiling and the grass field is larger than that. A lighting term is not free until it is measured.
5. **No ratchet bump.**
6. **Every capture proves genuine WebGPU** or it is not a capture.

## Explicitly out of scope

- **The island terrain albedo.** Cycle 120 measured a 4.2x spread in the terrain floor across four biomes **under an identical sun and ambient** (Home Field 60.08 against Rolling Hills 14.30), which is albedo and not lighting. Its own entry.
- **Improving the noon grass look.** Hard stop 1. A separate decision.
- **Mobile grass wind.** [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) says the mobile grass shader has no wind by design; this cycle does not reopen it.
- **Newsheepdogland's regression burn-down.** D19. Still gated.

## Success criteria (cycle close)

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to [`BACKLOG.md`](BACKLOG.md) carryover.
- [ ] When `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` run at cycle close, all four shall pass.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When the sun sets, then the grass shall darken with it, pinned by a spec.
- [ ] When the sun is at the reference noon, then the grass shall be unchanged from its shipped look.
- [ ] When the light is at the reference preset, then the lighting term shall evaluate to exactly 1.0, pinned by a unit test.
- [ ] When the cycle closes, then the grass material class shall be unchanged and no second sun-update path shall exist beside the first.
- [ ] When Phase 1 ships, then both render paths shall take the same light from the same authority, pinned by a spec.
- [ ] When Phase 2 ships, then the grass-to-terrain ratio shall be recorded before and after, at three times of day, on all four biomes.
- [ ] When Home Field runs past sundown, then the dusk lamp shall light, observed in a browser.
- [ ] When Phase 3 ships, then the entrance backdrop shall have been reviewed at more than one time of day.
- [ ] When the cycle closes, then D25 shall be recorded as closed.
- [ ] When the cycle closes, then the per-blade frame cost of the lighting term shall be measured and recorded.
- [ ] When the goldens are re-baselined, then the noon-versus-night split shall be reported.
- [ ] When the cycle closes, then `bundle-sizes.json` shall be unmodified.

## References

- [`../DECISIONS.md`](../DECISIONS.md) - D33 (this cycle's order), D25 (the lamp, closed by Phase 3), D26/D27 (worn ground, Cycle 121)
- [`archive/cycles/cycle-120-plan.md`](archive/cycles/cycle-120-plan.md) - the lighting fix that exposed this, and the deferred Phase 3
- [`archive/cycles/cycle-115-plan.md`](archive/cycles/cycle-115-plan.md) - the dusk lamp ramp, correct since it shipped
- [`../js/world/sceneLightingRig.js`](../js/world/sceneLightingRig.js) - the lighting authority Phase 1 reads
- [`../.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) - grass discipline, no-decompose, one shape across both paths
