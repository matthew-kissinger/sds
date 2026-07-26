# The browser probe, finally

> Captured 2026-07-25 against `1ff9f54f` on the production WebGPU path (`webgpu-production`, real Chrome, RTX 3070 via ANGLE/D3D11). Harness: [`tools/validation/homestead-probe.mjs`](../tools/validation/homestead-probe.mjs). Frames in [`probe/`](probe/).

Cycles 114 and 115 shipped every visual acceptance line verified by unit test, analytic bound, or reading the shader. Nobody looked. This is the look. Twelve framings on Home Field plus one on Rolling Hills, posed at the subjects those two cycles changed rather than at the standing golden matrix's zoom-60 overview, where a leaning fence post is two pixels.

## Confirmed working

| # | Claim | Frame | What is actually there |
|---|---|---|---|
| 1 | C112 P6 - the horizon seam is gone | `09-horizon` | Clean at the playable time of day. Sky graduates to a pale horizon, the terrain past the treeline fades into it, and the transition is soft. No white band. |
| 2 | C115 P6 - the farmhouse has three materials | `11-lamp-closeup` | Reads as four: dark brown roof, mid-brown walls, light tan trim on porch posts and window frames, grey stone chimney. Legible at 15m. |
| 3 | C115 P1/P2 - fence authoring, wear, per-post jitter | `03-pen-interior`, `04-fence-run` | Posts, rails and metal bases all read. Per-post variation is present and visible close up. Subtle at play distance, which is the right side of subtle. |
| 4 | C114 P5 - the dog darkens the ground under it | `01-gate-approach`, `07-dog-contact` | A soft dark ellipse tracks the dog. Present on both grass and bare ground. |
| 5 | C114 P2/P3 - low-frequency ground albedo | `05-farmhouse`, `08-ground-variation` | Visible mottling across the pasture. Reads as field, not as noise. |
| 6 | C115 P4 - the pen gate has a worn approach | `01-gate-approach` | Grass genuinely thins inside the fan. The mechanism works. See defect 4 for how it looks. |
| 7 | C115 P7 - the dusk lamp ramp | measured | `duskLampFactor` is exactly right: 0 above 19 degrees elevation, 0.27 at 12.75, 1.05 at 6.34, 2.2 (full) at -8. See defect 1 for why that does not matter. |

## Defects

### 1. The dusk lamp cannot fire in play

Measured on Home Field: `dayNightEnabled: false`, `dayNightRunning: false`, `boundLampCount: 1`, `sunElevationDeg: 70`, preset `pastoral-noon`.

`dayNight: { enabled: true }` appears on exactly one scene, `shared/scenes/newsheepdogland.js:185`. Home Field is the only scene with a `farmHouse`, and `js/boot/initWorld.js:276` binds the lamp to it. So the lamp is a correct function of a constant: the sun is pinned at 70 degrees, the trigger is 19 degrees, and nothing in the shipping build moves it.

Cycle 115's acceptance line for Phase 7 is unreachable, not wrong. The ramp is right. It is wired to a sun that never sets.

### 2. The directional light never tracks time of day

Swept `setTimeOfDay` across 14 values. Fog tracks correctly and dramatically (`#5f8ac9` at noon, `#8e7360` at golden, near-black past 0.8). The `DirectionalLight` reads **3.456, `#ffffff`, at every single one**, including full night.

Forced to dusk, Home Field is a navy sky over a noon-lit field (`06-farmhouse-dusk`). The Cycle 116 plan recorded this from a code read and scoped it out; it is now confirmed numerically and visually. It is only reachable today through the cinematic harness and on Newsheepdogland, which has the cycle and is entrance-gated, so it is not player-visible on the three public scenes - but it is the reason any future evening on Home Field looks broken, and it blocks defect 1's fix.

### 3. The pen interior is bald

`03-pen-interior`. Inside the pen is a flat, uniform, saturated green plane. No grass, no texture, no variation. Outside the fence the grass is dense. The transition reads as a knife edge at the fence from most angles.

Cycle 114 Phase 4's stated goal was "grass thins toward the pen and the farmhouse yard instead of stopping at a knife edge". Half of that shipped: the keep-probability smoothstep exists and is correct, but the band is narrow enough that at any oblique angle it is invisible, and the fully-excluded interior has nothing in it. The farmhouse yard is the same, at 80m x 80m (`05-farmhouse`) - a bald expanse many times the size of the buildings standing in it.

The fix is not a wider band. It is that a zero-grass zone needs *something* - short-grass, dirt, worn ground - or it reads as unfinished.

### 4. The gate approach reads as a stain

`01-gate-approach`. The worn fan is a soft olive-brown radial vignette with no texture and no edge, sitting on saturated green. It reads as a shadow or a mud slick rather than as ground worn by traffic. The grass thinning inside it is correct and is doing real work; the colour treatment is what fails.

### 5. The gate is indistinguishable from a gap in the fence

`01-gate-approach`, `02-gate-oblique`. Cycle 115 Phase 3's leaves default to fully open and swing flat against the fence line, so there is no gate-shaped object at the opening - just an 8m break between two posts.

This is Cycle 116's whole premise, now confirmed by looking rather than assumed.

### 6. The existing objective marker is a floating diamond

`01-gate-approach`, `05-farmhouse`, `09-horizon`. A flat white diamond with a green chevron under it, billboarded, hanging in the air above the gate with no connection to the ground. It is visible from everywhere, including from behind and below the gate (`09-horizon` catches it beneath the camera). This is what the four-state cue replaces.

## Not defects - probe artifacts worth recording

- **Black skies.** `cinema.captureFrame()` renders through `renderer.render(scene, camera)` directly, which skips whatever paints the sky dome, so every frame taken through it has a black sky. Verified against a live unpaused frame at the same pose. The probe now lets the game's own render loop paint and reads the canvas, and `freeFlyActive = true` is what stops the gameplay camera overwriting a hand-set pose (`js/SceneManager.js:232`).
- **The standing golden matrix captures at night.** `MATRIX` uses `sun: 0.85` and `sun: 0.5`; measured, 0.85 is night. It has never shown because those cells look nearly straight down. Worth knowing before anyone reads a golden as a lighting reference.

## What this changes

Defects 5 and 6 are Cycle 116's brief and are confirmed. Defects 1, 3 and 4 are carryover from closed cycles and belong in the backlog, not in this cycle's scope - with the caveat that defect 1 is a shipped acceptance line that is false, so it is recorded as such rather than as a nice-to-have. Defect 2 is the lighting cycle the Cycle 116 plan already named.

## What Rolling Hills showed, for the two cycles after this one

`10-rh-corral`, the one non-Home-Field framing, confirms two later cycles' premises by looking.

**Cycle 118's water.** The surface is exactly the cel-shaded cobalt-and-teal sheet D-W describes: a saturated deep blue with hard bright-cyan streaks where the ripple quantisation bands, sitting against a warm green island. It does not belong to the same world as the grass and the sky. The "before" capture this cycle needs is not going to be a subtle comparison.

**Cycle 117's findability.** The corral flag pillar is a handful of pixels at play distance, and the objective marker over it is a green diamond a few pixels across. The island currently sells "find it from the far shore" on an affordance that is close to invisible in the frame the player actually looks at. That is the thing Cycle 116's column has to replace, and it is a stronger argument for the column than the plan made.

Also worth recording: the island terrain reads much darker than Home Field's, near-black green with lime speckle, while the trees on it are lit normally. Not investigated. Noted here so a later lighting cycle has a starting point rather than a surprise.

## Post-implementation: the cue, looked at

Re-ran the same framings after Cycle 116 shipped, into [`cue/`](cue/). Four visual acceptance lines confirmed by eye rather than by unit test, which is the thing the last two cycles did not do.

- **`cue/09-horizon`, camera 190m out.** The column stands over the gate and clears the treeline. Visible, and it reads as a marker at a destination.
- **`cue/01-gate-approach`, camera 26m out.** No column, which is correct: 26m is inside the 60m near threshold, so state 1 has handed over to state 2. The ground arc draws between the gate posts and the posts carry a warm rim, so the gate now reads as a gate rather than as an 8m break in a fence.

Two honest notes rather than defects.

**The column is thin and pale.** At 190m it reads more like a pole than a warm beacon. The acceptance line is that it renders and it does, but if the intent is "seen from the far shore" on a 380m island, it wants more presence. Tuning, and it is cheap to tune since the numbers are in one module.

**The floating white diamond is still there.** The plan treated `CorralCompass` as the thing to reconcile with, and correctly found it already self-hides when the target is on-screen. But the diamond billboard over the gate is a different object on a different path, and it now competes with the column for the same job. It should go, or become the column's own head. Carryover.
