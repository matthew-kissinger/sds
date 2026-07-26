# Cycle 120 - lighting

> Authored 2026-07-26 from a read-only trace of the production boot path. **The roadmap's unverified claim is refuted and the real defect is bigger and simpler than the entry describes.** Read "What the trace found" before the phases. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom.

## Goal

The sun starts telling the truth about what time it is. Today the production directional light is a boot constant that never changes intensity, colour or direction, on every scene at every hour, which is why full night is lit like mid-afternoon and why Cycle 115's dusk lamp has never had anything to fire against. Make the light that is actually in the scene the light the atmosphere drives, then give Home Field an evening.

## What the trace found

**1. The measured 3.456 is not a light that failed to update. It is a light nothing was ever wired to update.**

[`js/rendering/productionWebGpuBoot.js`](../js/rendering/productionWebGpuBoot.js):244-323 `installProductionWebGpuLightingBridge` constructs both production lights and adds both to the scene:

- `:256` `new AmbientLight(0xffffff, 0.75 * Math.PI)` = 2.356
- `:257` `new DirectionalLight(0xffffff, 1.1 * Math.PI)` = **3.45575**

`1.1 * Math.PI` is 3.45575, which is D25's "3.456 white at every time of day including full night" to three decimals.

`Atmosphere` drives **different objects**. [`js/main.js`](../js/main.js):222 and `:1192` both call `bindAmbientLight(this.sceneManager.ambientLight)`, which is the WebGL `SceneManager` ambient at [`js/SceneManager.js`](../js/SceneManager.js):196 (`0.7 * Math.PI`), a different instance. The sun is the same story: [`js/atmosphere/SunSystem.js`](../js/atmosphere/SunSystem.js):49 wraps its own `DirectionalLight`.

Two disjoint sets:

| | in the production scene | driven by `Atmosphere` |
|---|---|---|
| bridge ambient + directional (`productionWebGpuBoot.js:256-257`) | yes | **no** |
| `SceneManager.ambientLight`, `SunSystem.light` | no | yes |

**2. The roadmap's unverified claim is REFUTED.** It records that "on the production WebGPU path the `AmbientLight` may be constructed and never added to the scene". It is added: `:298` adds ambient, `:300` the directional, `:301` `directional.target`, and `:307-313` builds a `proof` object asserting `scene.children.includes()` for both, surfaced through [`js/diagnostics/sceneManagerWebGpuProof.js`](../js/diagnostics/sceneManagerWebGpuProof.js):185. **The defect is not a missing `add`. It is a missing bind.** Do not spend a phase looking for the `add`.

**3. All three of intensity, colour and direction are frozen, not just intensity.** `sceneManager.webgpuSunLight = directional` (`:305`) is the only published handle, and it has exactly three consumers: [`js/boot/initWorld.js`](../js/boot/initWorld.js):441 and [`js/main.js`](../js/main.js):1510 recenter the shadow frustum, and [`js/world/TreePlacement.js`](../js/world/TreePlacement.js):298 reads it. Not one of them touches `intensity` or `color`, and the only writes to `position` are shadow-box recentering, which moves the light without meaning to change the sun angle. The direction is frozen at `normalize(1.5, 2.2, 3.0) * 260` from `:263-268`: one fixed mid-afternoon angle for every scene, forever.

**4. There is a real consumer of the 1.1 pi constant and the roadmap does not mention it.** [`js/webgpuKilnImpostorNodeMaterial.js`](../js/webgpuKilnImpostorNodeMaterial.js):239-248 calibrates the far-tree impostor relight against `new DirectionalLight(0xffffff, 1.1 * Math.PI)` **by name and by value**, and Cycle 104 P3 deliberately retired a magic `brightness=6` in favour of that principled derivation. If the production directional stops being a constant 1.1 pi, that calibration is downstream of a value that now moves. This is the single highest-risk consequence in the cycle and Phase 1 must confront it before Phase 2 changes any number.

## Phase 1 - One light, and a bind that cannot be wrong (~4hr)

The identity fix, with no look change. Ship this on its own and prove nothing moved.

1. Make the production scene's lights the ones `Atmosphere` binds. Prefer a single ownership point over a second bind call: two `bindAmbientLight` sites already exist and adding a third path is how this defect happened.
2. **Make the wrong wiring fail loudly.** Today, binding a light that is not in the scene is a silent no-op. A bind that asserts the light it is handed is in the scene it is meant to light would have caught this at the moment it was introduced. [`js/world/foliageLightingRig.js`](../js/world/foliageLightingRig.js) is the precedent the project already uses for "one authority", and it is the shape to follow.
3. **Pin the impostor calibration before anything moves.** Decide explicitly whether `js/webgpuKilnImpostorNodeMaterial.js` reads the live sun or keeps a fixed reference intensity, and record which and why. A silent coupling to a value that starts moving is the failure mode.

**Acceptance (EARS):** When Phase 1 ships, then the light `Atmosphere` drives shall be the same object identity as the light in the production scene, and a spec shall fail if it is not. When Phase 1 ships, then binding a light absent from the target scene shall raise rather than no-op. While Phase 1 alone is shipped, then the golden harness shall show no render change, since no intensity, colour or direction value has yet moved.

## Phase 2 - The sun tracks the sky (~4hr)

Now that the bound light is the lit light, drive it.

1. Intensity, colour and **direction** all track the atmosphere's sun. Direction is the one the roadmap does not ask for and the one that matters most: a fixed angle is why shadows point the same way at dawn and dusk.
2. Full night must actually be dark. The current 3.456 at midnight is the headline defect.
3. **The shadow frustum recentering must survive.** `initWorld.js:441` and `main.js:1510` write `position` to move the shadow box, and the sun direction is `position - target.position`. Those two meanings are now in conflict on one vector. Separate them explicitly rather than letting the last writer win; this is the most likely source of a subtle regression in the cycle.

**Acceptance (EARS):** When the sun sets, then the directional light's intensity shall fall and a spec shall fail if it does not. When the time of day changes, then the sun's direction shall change with it. While a day-loop scene recenters its shadow frustum, then the sun's direction shall be unchanged by that recentering, and a spec shall pin both behaviours together.

## Phase 3 - Home Field gets an evening (~3hr)

D25's second half. With Phase 2 shipped this is scene data and a preset rather than new machinery.

Cycle 115's dusk lamp then fires for free, which is the stated payoff. Verify it does rather than asserting it: [`js/atmosphere/duskLamp.js`](../js/atmosphere/duskLamp.js) and `Atmosphere.bindDuskLamps` are already wired and have simply never had a sundown to react to.

**Acceptance (EARS):** When Home Field is played in the evening, then the scene shall read as evening and the dusk lamp shall light. When Phase 3 ships, then the dusk lamp's activation shall have been observed in a browser, not inferred from the code.

## Phase 4 - The browser probe and the goldens (~2hr)

Every cycle in this program ends by looking at the build, and this one changes what every scene looks like at every hour, so it is the least skippable instance of it.

1. Capture all four biomes at noon, golden hour and night, on the production WebGPU path. `assertWebGpuEngaged` is not optional: headless Chrome has no `navigator.gpu` and the Cycle 103 lesson is that "WebGPU" goldens were silently WebGL for months.
2. **Test the near-black island terrain against this cycle.** Cycle 117's probe found the island terrain reads near-black under the grass in every frame and recorded it as pre-existing, identical in a pre-116 golden. A frozen light direction is a plausible cause and it is now testable. Measure it. If Phase 2 fixes it, say so; if it does not, it is an albedo problem and belongs to its own entry rather than being quietly folded in here.
3. `npm run validation:screenshots -- --diff`, read the delta, re-baseline only after. Every golden frame contains lighting, so the whole set will move and "it all moved" is not a reason to skip reading it.

**Acceptance (EARS):** When Phase 4 ships, then all four biomes shall have been captured at three times of day on a genuine WebGPU session. When the goldens are re-baselined, then the delta shall have been read with `--diff` first. When Phase 4 ships, then the near-black island terrain shall be recorded as fixed by this cycle or as a separate defect with evidence.

## Frozen files

None of this cycle's work needs a frozen file. `shared/` is untouched: this is render-path only and no sim value depends on a light. If a phase finds it needs one, stop and surface rather than self-authorising.

- **[`tests/refactor-baseline/__fixtures__/bundle-sizes.json`](../tests/refactor-baseline/__fixtures__/bundle-sizes.json)** is NOT authorised. Cycle 119 freed headroom for the rest of the program, not for this cycle to spend.

## Hard stops

1. **Phase 1 ships with no render change.** If the goldens move on the identity fix alone, something other than the bind changed and the cycle stops until it is understood.
2. **No ratchet bump.**
3. **The impostor calibration is not collateral.** If `js/webgpuKilnImpostorNodeMaterial.js` starts reading a moving sun, that is a deliberate decision recorded in Phase 1, not something Phase 2 discovers.
4. **Do not fold the near-black terrain into this cycle without evidence.** It is recorded as pre-existing. Measure first.
5. **Every capture proves genuine WebGPU** or it is not a capture.

## Explicitly out of scope

- **The WebGL twin's lighting.** Production boots `webgpu-production`. The WebGL path keeps working and keeps its own lights; converging the two is not this cycle.
- **Shadows on small grassed scenes.** `castShadow` is off by default for a measured reason (144 to 48 FPS median on field/practice). Reopening that is a perf cycle.
- **Newsheepdogland's regression burn-down.** D19. Still gated.

## Success criteria (cycle close)

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's [`BACKLOG.md`](BACKLOG.md) carryover.
- [ ] When `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` run at cycle close, all four shall pass.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When Phase 1 ships, then the bound light and the scene's light shall be one object, pinned by a spec.
- [ ] When Phase 1 ships alone, then the goldens shall be unchanged.
- [ ] When the sun sets, then the directional light's intensity shall fall, pinned by a spec.
- [ ] When the time of day changes, then the sun's direction shall change with it.
- [ ] While a day-loop scene recenters its shadow frustum, then the sun's direction shall be unchanged by that recentering.
- [ ] When Home Field is played in the evening, then the dusk lamp shall light, observed in a browser.
- [ ] When the cycle closes, then the impostor relight's relationship to the live sun shall be recorded as a decision.
- [ ] When the cycle closes, then the near-black island terrain shall be recorded as fixed or as a separate defect with evidence.
- [ ] When the cycle closes, then `bundle-sizes.json` shall be unmodified.

## References

- [`front-door-roadmap.md`](front-door-roadmap.md) - the Cycle 120 entry this plan corrects
- [`../DECISIONS.md`](../DECISIONS.md) - D25 (lighting is the root cause under two other things)
- [`archive/cycles/cycle-115-plan.md`](archive/cycles/cycle-115-plan.md) - the dusk lamp that has never had a sundown
- [`../.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) - atmosphere drives `scene.fog`, and the single-authority precedent
