# Front door roadmap (Cycles 112 to 118)

> Drafted 2026-07-24 from the front-end review and the 21-decision alignment pass. Decision register lives in [`../DECISIONS.md`](../DECISIONS.md) under "Front door alignment". Cite decisions by number (D1 to D20, D-W); do not re-derive them.

## Why this program exists

The gameplay is good and the front door is not. A first-time visitor met 7 decision rows before Play, two competing green primary buttons, and a hero image where the dog was four pixels wide. None of the three entrance heroes contained a readable dog or flock. Underneath that, the display face the design language specifies was never shipped, the default dog is 6x the size of its peers on the critical path, and the island's objective is a red flag plus an invisible radius that fires lightning.

This program fixes the front door, the art that sells it, and the legibility of the objective behind it. It does not touch the deterministic sim, the multiplayer contract, or the render path beyond grounding and water.

## Program shape

Seven cycles. Each is shippable on its own, and nothing depends on a cycle below it. Per D20 everything rolls continuously; there is no release gate.

| Cycle | Slug | Goal in one line | Gated by |
|---|---|---|---|
| 112 | `front-door-foundations` | Clear the noise and re-shoot the art, so the new entrance can be judged on its merits | Nothing |
| 113 | `entrance-one-door` | Replace the entrance with Direction A, in TypeScript on a stylesheet | 112 (heroes must exist) |
| 114 | `grounding-pass` | Props sit in the world instead of on it. Shader and placement only, no new geometry | Nothing, but informs 115 |
| 115 | `fence-and-homestead` | New fence kit, five-bar gate, farmhouse kit-bash, homestead yard | 114 (D11) |
| 116 | `gate-legibility` | The four-state gate cue, one language across every scene | 115 (needs the gate posts) |
| 117 | `island-pasture` | Sheep Dog Island's zap becomes a fenced pasture with one gate | 115 + 116 |
| 118 | `water-rewrite` | Replace the anime water with a stylised painterly surface | 112 Phase 6 (the horizon seam fix, moved out of 114) |

Cycle 118 is independent of 113 to 117 and can run in parallel with any of them if the queue allows.

## Cycle 112 - front-door-foundations

Plan: [`cycle-112-plan.md`](cycle-112-plan.md). Eight phases, seven autonomous and one paired.

The free wins plus the capture session. Nothing here needs a design decision, everything is visible, and it clears the noise before anyone judges a mockup. The paired phase is the hero re-shoot, which follows the D8 brief.

**Amended 2026-07-24: the horizon seam fix moved here from Cycle 114**, as Phase 6. It was the single defect blocking all four heroes, and leaving it in 114 meant the capture phase was pre-blocked by its own hard stop from the day the plan was written. The fix is colour only (fog now reads the colour the sky actually paints at the horizon rather than the raw horizon LUT value); Cycle 114 keeps the geometric skirt work and the rest of the grounding pass.

## Cycle 113 - entrance-one-door

**Shipped 2026-07-25, seven phases.** Plan: [`archive/cycles/cycle-113-plan.md`](archive/cycles/cycle-113-plan.md).

Direction A with C's typographic restraint (D3). This was the actual fix, and it sets the UI pattern the rest of the interface migrates onto.

What shipped:

- [`../css/entrance.css`](../css/entrance.css), the front door's own sheet. Pastoral tokens only (D16), no hex and no bare rgba; phone case as the base rule set with one 721px upgrade to desktop; motion inside `prefers-reduced-motion: no-preference`. `Entrance.tsx` went from 449 lines and 47 inline style objects to 253 and none.
- One primary action. World, rung and dog collapse into one summary line that opens `EntrancePicker` in place.
- Three rungs plus More (D7), where "three" is the first three of whatever ladder the armed world carries and the armed rung is always visible. World switching moved to arrows on the image edges.
- D6 emptied the primary surface: the name field left entirely, and sandbox, 2-player, leaderboard and achievements moved into one corner menu alongside the licence line. Four corner icons became two. Multiplayer keeps its text-weight line.
- The tutorial moved inside the first round (D4) with no accept step at all, which is what removed the second primary button. `TutorialOffer` deleted, along with `RailPortal` and the offer copy in five locales.
- The loading surface became the entrance holding still: same sheet, same glass, same dock position, world name unmoved across the cut.
- The world name moved onto the photograph. That was a measurement, not a preference: the D8 heroes put the dog between 70.8% and 78.0% of frame height, so a panel carrying the world name settled at 70.1% and covered every dog. Collapsed it now sits at 79.3% and clears all four.
- Per-world `objectPosition` on the backdrop. A 16:9 hero in a portrait phone viewport shows only the middle 26% of its width, which put two of the four dogs off frame entirely.

Two new gates hold it: [`../tools/validation/entrance-hero-clearance.mjs`](../tools/validation/entrance-hero-clearance.mjs) measures panel-vs-dog against the live entrance at three viewports, and `tests/ui/heroCrop.spec.ts` recomputes the same invariant offline so a re-shoot that leaves the crop values stale fails in CI.

Not done here: the name field's new home at first score submission (D6 says it leaves the entrance; where it lands is its own scope), and matching the loading backdrop's framing to the live scene camera.

## Cycle 114 - grounding-pass

All shader and placement work. No new models, per D11. Buys most of the perceived asset quality before any modelling starts.

- Grass falloff at exclusion edges instead of a hard rectangular cut (the pen and the farmhouse yard both sit on bald patches today).
- Per-instance rotation and height jitter on fence posts.
- Split the farmhouse's single material into roof, wall and trim.
- ~~Fix the horizon skirt seam where the terrain skirt meets fog.~~ **Moved to Cycle 112 Phase 5's neighbour, Phase 6, and shipped there 2026-07-25.** The colour half is done: fog reads the painted sky horizon. What remains here, if anything, is the geometric rim at the terrain plane's 2000m edge, which stopped being visible once the colours converged. Re-inspect before spending a phase on it.
- Lower grass blade contrast, add per-clump hue variation, put a low-frequency ground albedo underneath, so grass reads as a surface rather than as static.
- Ground contact darkening under the dog so it separates from the field at any camera distance.

## Cycle 115 - fence-and-homestead

Authored in-repo per D10, against the stylised painterly target from D9.

- New `tools/bake-fence.mjs` following the `bake-rocks.mjs` pattern. Chamfered posts, sag on long runs, vertex-colour weathering darkening toward the ground.
- A five-bar hanging gate distinct from the perimeter run, so the threshold reads as the important one. This is the asset Cycle 116 and 117 both depend on.
- Farmhouse as a modular kit-bash: wall panels, gable roof planes, porch, chimney, window frames, separate materials.
- **Checkpoint:** Matt reviews the farmhouse. If it reads correct but not charming, it goes external and the cycle closes with the yard instead.
- The homestead yard: dirt approach from the gate, trough, bales, a lamp that comes on toward dusk.

## Cycle 116 - gate-legibility

The four-state cue from D13, one language across every scene per D14.

- Far or off-screen: world-space light column tall enough to clear the treeline, plus an edge-of-frame chevron with distance.
- Near and on-screen: column fades out, gate posts pick up a warm rim light, a lantern carries it, the ground threshold draws as a soft arc between the posts. No HUD element.
- Flock approaching: the threshold arc brightens in proportion to funnel occupancy. The only moving cue, and it moves because the player is doing well.
- Crossed: a single warm pulse along the threshold. Quiet enough to repeat 5,000 times.
- The existing `CorralCompass` demotes to the off-screen fallback only.
- Open Country's portal keeps its own effect and adopts the threshold behaviour.

## Cycle 117 - island-pasture

Sheep Dog Island's objective changes, so this cycle touches sim behaviour and needs its own acceptance and fixture story per [`../.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md).

- Replace `corral: { center, radius }` with a pasture rect plus a gate, the shape Home Field already uses.
- Sheep retire on threshold crossing and settle, not on radius entry.
- Size the pasture so the flock has to be lined up rather than nudged.
- Retire the lightning from gameplay. `js/effects/CorralZapEffect.js` stays one more cycle (D15).
- **Re-verify the leaderboard before the delete lands** (D12). As of 2026-07-24 the affected boards held 2 rows, both "Dev" test entries. If a player-authored score has appeared, archive as all-time and start a new board instead.
- Sim-baseline fixtures regenerate with the behaviour change recorded explicitly in the cycle's Acceptance section.

## Cycle 118 - water-rewrite

Per D-W, a rewrite rather than a retune. `js/water/AnimeWater.js` (417 lines) plus its WebGPU node-material twin (`js/water/webgpuAnimeWaterNodeMaterial.js`, 188 lines) both rebuild against the D9 stylised painterly target.

What to keep from the current implementation: shoreline foam driven by boundary distance rather than a depth render target, the two-band depth gradient concept, and the `<fog_pars_fragment>` atmosphere match. What goes: the cel quantisation, the anime sparkle pass, and the cobalt-and-teal palette that does not sit in the pastoral range.

Capture the current water in good light and at dusk before starting, so the rewrite has a before to beat.

## The program extends: Cycles 119 to 122

Locked 2026-07-25 in the round-two register ([`../DECISIONS.md`](../DECISIONS.md), D22 to D32). The original 112-118 program was authored before anyone had looked at the build in a browser. Cycle 116's probe changed that, and the work below is what it found plus what Matt decided about it.

## Cycle 119 - bundle

Payload before more features (D31). `main-*.js` survived Cycle 116 by **14 bytes** and the `other` chunk family needed a design fix to get under its budget. Every remaining cycle adds code, and a ratchet with no headroom stops arbitrating design merit and starts arbitrating whichever phase happens to run last.

Do not raise the ratchets. They have caught real design errors twice in three cycles, most recently a four-module split that should have been one.

### Phase 1 shipped early, out of order

`other` was measured at 691.882 KiB against a 692 KiB budget: **121 bytes of headroom across 97 chunks**, while Cycle 117 Phase 1 alone needed 439. The cycle could not ship, so the biggest item was pulled forward as commit `3b977964`.

`three/examples/jsm/loaders/KTX2Loader.js:106-107` evaluates `new URL('../libs/basis/basis_transcoder.{js,wasm}', import.meta.url)` at module scope. Vite emits both as hashed assets unconditionally, and both are unreachable, because KTX2Loader only reads those URLs when `transcoderPath === ''` and `js/rendering/ktx2Loader.js:51` always sets it. Every build since Cycle 98 shipped **two byte-identical copies** (md5 `3acfda59...`): 57,529 bytes of dead JS that the ratchet counts, plus 527,333 bytes of dead wasm that it does not. `other` is now 651,393 bytes, with 56 KiB of headroom for the rest of the program.

### The measured work list for the rest of the cycle

From a six-angle hunt with adversarial verification on every proposal. Byte figures are the verifiers', not the proposers'.

**Confirmed, dev surfaces shipping to production.** Each is reachable only behind a URL param or a dev flag, and gating the *import* (not the render) lets Rollup drop the chunk:

- `?notes=1` PlaytestNote, **4,656 B**. The verifier notes half the proposed change is unimplementable as written; read its objection before starting.
- `?wolf=1` wolf harness, **4,192 B**.
- `?grassInteractionProof` harness, **2,962 B**.
- ScreenshotCapture, imported unconditionally on every production boot for an F12 tool, **1,520 B**.
- `ExtremeTuningPanel`, a dead import in `App.js` that is never rendered, **4,314 B** (proposed, not separately verified).

**Confirmed but Matt's call, not an agent's.** Retiring `__sdsCinema.freeFly()` would drop its sole consumer, the 19,739-byte OrbitControls chunk, for **20,875 B**. `.claude/rules/scene-and-render.md` says removing the `?cinematic=1` harness is a separate decision, and `tools/validation/*.mjs` probes depend on it. **Do not take this without asking.**

**Larger items worth their own phase:** a 29 KB ZSTD decoder that ships as a 38,976-character base64 literal inside `KTX2Loader-*.js` (**38,900 B**), and GLSL comments and indentation inside `js/**` template literals, which esbuild never minifies (**15,907 B**).

**Refuted, recorded so it is not re-proposed:** vendoring OrbitControls out of the top-level assets scan. That is a fixture bump laundered through directory depth, not a saving, and it would add 40,525 bytes of unminified source to ship 19,739 fewer measured ones.

**Overstated:** moving the two `webgpuDiagnostic`-only placement-plan chunks out of the `other` catchall. That family has only 1,146 bytes of its own headroom.

## Cycle 120 - lighting

The root cause under two other things (D25). The production `DirectionalLight` reads **3.456 white at every time of day including full night**, measured across 14 points while fog tracks correctly and dramatically. Make it track time of day, then give Home Field an evening, then Cycle 115's dusk lamp fires for free.

Also recorded and unverified beyond a code read: on the production WebGPU path the `AmbientLight` may be constructed and never added to the scene. Confirm or refute before building on it.

**Closed 2026-07-26, and both claims above needed correcting.** The `AmbientLight` guess is **refuted**: both lights are added, with a proof object asserting `scene.children.includes()` for each. The real defect was a missing **bind** - `Atmosphere` drove a different object instance - and `1.1 * Math.PI` is 3.45575, which is the measured 3.456 to three decimals. It was never a light that failed to update. Direction was frozen too, not just intensity. Phases 1, 2 and 4 shipped; Phase 3 deferred to Cycle 123 by D33.

## Cycle 121 - worn ground

D26 and D27, deliberately one cycle rather than two. Cycle 114's grass exclusion smoothstep is correct, but a zero-grass zone with nothing in it reads as a flat painted plane, and the transition still reads as the knife edge the cycle set out to remove. The pen interior, the 80m farmhouse yard and the gate approach are all the same surface: ground where grass has been removed. They get one treatment.

**CLOSED 2026-07-26, 3/3 phases.** One zone list with two readers, taken by reference. **This entry's instinct about the falloff was wrong and the cycle recorded why:** the transition read as a knife edge because the ground under the grass never changed, so `EXCLUSION_FALLOFF_M` stayed at 4.0 and the ground was shaded instead. Widening the band would have softened the wrong thing.

Two defects this entry did not know about. **Rolling Hills and Newsheepdogland had no grass exclusion at all** (the registration was keyed on `pasture`, which only Home Field declares), so grass grew inside the island pasture every ranked solo run drives into. And **every mode start rebuilt the exclusion list from Home Field's default rect on every scene**, which nothing re-scattered against, so it had never shown. Full entry atop [`BACKLOG.md`](BACKLOG.md).

## Cycle 122 - N pastures

D24. One pasture per player for island competitive, which needs `shared/CompetitiveLayout.js` made scene-aware. Deterministic-sim work that moves `competitive.json`, touching live multiplayer rooms, so it needs an in-flight-session migration story per [`../.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md). Last of the four because it is the riskiest.

**De-risked read-only on 2026-07-26, and the plan's central mechanism did not exist.** It derived the layout from the scene's `bounds`; `bounds` is the legacy rect-only field and **only Home Field declares it**, so on every island `createCompetitiveGameState` silently fell back to a hardcoded Home Field rect that then drove the competitive sheep clamp. Two stacked hardcodes, not one. The cardinal-ring derivation is now proven against all three shipped tables, and running it on the islands is what showed it would place every island pasture outside a hard radial clamp, where a sheep cannot arrive and the round cannot complete. Placement is kind-aware, not just measurement. See the plan's corrected "What the trace found".

Until it ships, Rolling Hills competitive uses the wrong layout and is knowingly left that way (D23). The one constraint: it stays broken as it is, never newly crashing.

## Cycle 123 - grass reads the light

**Added 2026-07-26 by D33.** Not in the original register, because nobody could see the defect until Cycle 120 fixed the light in front of it.

Grass is `MeshBasicNodeMaterial` taking baked indirect only, so it does not read the scene lights at all. A frozen sun and a surface that never listened produce the same picture, which is why five cycles of visual work never surfaced it. With the light honest, night is a self-lit grass field over near-black ground: grass-to-terrain goes from 8.1:1 at noon to **204:1** at night on Rolling Hills.

**It also blocks Cycle 120's Phase 3.** Home Field is wall-to-wall grass, the default scene and the entrance backdrop, so giving it an evening before this lands would ship a glowing pasture at midnight on the first thing every player sees. Phase 3 of this cycle takes that deferred work and closes D25.

Plan: [`cycle-123-plan.md`](cycle-123-plan.md).

## The round-three answers, so nobody re-opens them

Locked 2026-07-26 ([`../DECISIONS.md`](../DECISIONS.md), "Front door alignment, round three", D33 to D36). Three of the four are decisions **not** to do things, recorded so the same proposals do not come back:

- **`__sdsCinema.freeFly()` and its 20,875-byte OrbitControls chunk stay** (D34). The harness has found real defects in six consecutive cycles and Cycle 119 removed the bundle pressure that would have justified the trade.
- **PlaytestNote, the wolf harness and grassInteractionProof stay on production** (D35). Excluding them would save roughly 11.8 KB and break sending a playtester a URL with a param on it, which is why they are reachable at all. Note the finding underneath: **gating an already-lazy import saves nothing**, because the ratchet sums every emitted chunk with no notion of whether it is fetched.
- **The impostor atlases keep their ZSTD layer** (D36). Re-baking without it moves 38,900 bytes off the JS bundle and onto the assets, which is close enough to gaming a ratchet that counts one and not the other that the honest measurement is worth more than the bytes.

## Deliberately not in this program

- **GPU flocking.** D18. Harness only.
- **Newsheepdogland's regression burn-down.** D19. Stays gated until the front door ships.
- **A broad UI refactor.** D16. The new entrance is the reference pattern; Settings, Pause and Completion migrate when each is touched for its own reasons. Refactoring first and redesigning second would cost twice and prove nothing.
- **The seasonal leaderboard.** Still a scoped Worker and D1 cycle of its own, unchanged by this program except for the D12 island reset.

## References

- [`../DECISIONS.md`](../DECISIONS.md) - the 21-decision register, "Front door alignment"
- [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - cycle plan template
- [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`launch/leaderboard-season-plan.md`](launch/leaderboard-season-plan.md) - the no-reset guardrail D12 is measured against
- [`../.claude/rules/prose-and-voice.md`](../.claude/rules/prose-and-voice.md) - player-facing copy rules, including the biome framing
