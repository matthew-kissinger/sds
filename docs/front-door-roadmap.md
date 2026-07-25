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
