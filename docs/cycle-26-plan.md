# Cycle 26 — STUB (post-v2.0.1)

> Drafted 2026-05-06 after the v2.0.0 polish-mega-cycle close + v2.0.1
> camera/scene-picker patch. This is a stub for the next focused cycle.
> Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md)
> first, then [`cycle-25-plan.md`](cycle-25-plan.md) for the
> polish-program context, then this doc.

## Goal

Pick **one** of the deferred-from-Cycle-25 deliverables and ship it
clean. None of these have been started — each is a "Cycle of its own"
sized between 4 and 8 days.

## Candidates

Picked at `/cycle-start` based on playtest signal + which gap is
loudest after a week with v2.0.0 in the wild:

### Candidate A — Aerial-perspective LUT (atmospheric truth full)

**Builds on:** `js/shaders/HeightFogPatch.js` foundation (shipped
v2.0.0 unused).

Hillaire 2020 / Bruneton-style precomputed scattering 3D texture
(32×32×32 R11G11B10F, ~196 KB) regenerated when sun moves > 2°.
Replace `THREE.Fog` entirely — every patched material samples the LUT
for fog tint instead of the static `fogColor`. Closes the
"atmospheric truth" half of the polish-program thesis.

### Candidate B — 8×4 impostor atlas re-bake + padded mips

`tools/bake-tree-impostors.mjs` extends with `--azimuths=8
--elevations=4 --tileSize=256`. Output 2048×1024 atlas. 16px tile
padding for proper mipmaps (Halen 2022 / HPG technique). Hybrid
trunk-mesh for 180-200m band (Cycle 21 Phase 4 deferred). Sky-LUT
relighting only if Candidate A landed first.

Note: Pixel Forge CLI on Windows still has the bun→tsx workaround
documented in NEXT_SESSION.md standing risks. Bake time per tree is
~30+ minutes.

### Candidate C — Camera state-machine collapse

`_updateClassic / _updateFollow / _updateFree` consolidated to a
single state reading `{ targetDistance, targetHeight, yawSource,
fov }` per-mode-derived. ~170 LOC of duplicate camera math
collapses to ~70. Risky refactor on game-feel-critical code; the
v2.0.0 + v2.0.1 additive cinematics already close most of the
user-visible gap, so this is "cleanup" more than "new value."

### Candidate D — Start-screen flow restructure

Mode → Scene → Dog flow with hero-art ScenePicker (already shipped
v2.0.1!), live WebGL DogSelection inset, scripted background-scene
orbit per selected scene, first-time tutorial overlay. Multi-day
React refactor; depends on Candidate C (the cinematic orbits use the
new state machine).

### Candidate E — 6 fresh tree variants + landmark trees

`tools/bake-trees.mjs` extends with `tree-deciduous-small`,
`tree-deciduous-large`, `tree-birch`, `tree-conifer-reintro`,
`tree-fall-color`. Per-scene profile lookups already shipped v2.0.0
(`shared/TreePlacement.js` reads `scene.treeProfile`); just plug new
variants in. Authored landmark trees per scene (4-6 per).

Best paired with Candidate B (re-bake new variants under the new 8×4
pipeline at the same time).

## Open questions

Resolved at `/cycle-start`. Until then:

1. **Which candidate?** Likely B + E together (impostor + tree art is
   one art-direction story), OR A alone (atmospheric is one shader
   story). Don't bundle A with B — both have heavy review demands.
2. **Push cadence?** v2.0.0 was a single autonomous overnight that
   shipped to prod next morning. Cycle 26 may want a per-phase push
   so each landing gets its own playtest window before the next phase
   builds on it.
3. **HeightFogPatch activation?** If picking Candidate A, does the
   new aerial-LUT replace HeightFogPatch or layer on top? Author
   lean: layer — height-fog density is the per-fragment shape, the
   LUT is the per-fragment tint.

## Frozen files

All [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) entries apply.

## What NOT to do

- **Don't reintroduce the LOD1 mid-band on desktop med/high.** Phase B
  killed it deliberately; the alphaHash crossfade band 180-200m is
  the new seam.
- **Don't reintroduce `uMatchBoost`.** Phase D killed the per-species
  calibration LUT; if Candidate B re-bakes the atlas, the new bake
  should match LOD0 closely enough that no matchBoost is needed.
- **Don't fix the heightfield amplitude bug.** Standing carryover
  across 14+ cycles; visual character of game depends on the
  amplified state.
- **Don't auto-deploy without playtesting.** v2.0.1 caught a Phase E
  regression (Follow/Free zoom dead) post-deploy because the
  autonomous run didn't have a real-GPU manual smoke. Future
  candidate cycles should bake in a manual smoke gate before each
  push to main.

## References

- [`docs/cycle-25-plan.md`](cycle-25-plan.md) — predecessor (polish-mega-cycle)
- [`docs/wake-state-2026-05-06.md`](wake-state-2026-05-06.md) — what landed v2.0.0
- [`CHANGELOG.md`](../CHANGELOG.md) `[2.0.0]` + `[2.0.1]` — deferred items list
- [`docs/polish-program.md`](polish-program.md) — original 6-cycle program (mostly absorbed into v2.0.0)
