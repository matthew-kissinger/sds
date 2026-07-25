# Cycle 116 - gate-legibility

> Authored 2026-07-25 from a six-agent reconnaissance pass over the gate cue and the lighting rig. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom.

## Goal

The player can see where the sheep are supposed to go, from anywhere, in one visual language. Today the answer is a screen-edge chevron with a distance pill, and at the gate itself there is nothing at all: the ground threshold effect that would mark the crossing exists in the code and never renders. D13 fixes that with four states, and D14 says the same language on every scene so learning "warm means go there" on Home Field transfers to the island. After this cycle a player 140 metres out sees a warm column clearing the treeline, a player near the gate sees the posts pick up a rim light and a threshold arc draw between them, the arc brightens as the flock funnels in, and each crossing gives one quiet warm pulse.

## What the reconnaissance changed

**1. Nothing here should be a light, and the reason is sharper than "it would be invisible".** There is no `PointLight`, `SpotLight`, `RectAreaLight` or `LightProbe` anywhere in the repo.

The first version of this plan said the node materials are self-lit and would never see a new light. Cycle 115 Phase 5 checked that and it is **only true on the WebGL path**. On WebGPU the terrain and meadow quads are `MeshLambertNodeMaterial`, and sheep, tree leaves and tree branches are `MeshStandardNodeMaterial`, all genuinely lit by the bridge's ambient plus directional. Grass, water and impostors are `MeshBasicNodeMaterial`, which is unlit in effect even though `lights === true` on the class.

So a new `PointLight` would **not** be invisible. It would be visible on one render path and not the other, which is a worse outcome than invisibility and a stronger argument for shader work: a lantern that lights the ground on WebGPU and does nothing on WebGL is a bug that only shows up on half the machines.

The rig is also not "exactly two lights" across the board. The WebGPU bridge installs two (`js/rendering/productionWebGpuBoot.js:256,257`); `SceneManager`'s WebGL rig installs **three**, ambient plus two directionals, the second a warm `0xffd4a3` fill (`js/SceneManager.js:196, 201, 222`). `SunSystem` constructs a third directional that no production caller ever attaches.

Every state below is therefore shader work or emissive geometry, and Cycle 115's `js/atmosphere/duskLamp.js` is the worked example to follow.

Two related findings, recorded but out of scope: on the production WebGPU path the `AmbientLight` is **created and never added to the scene** (the code early-returns between construction and `scene.add`, and the atmosphere then binds the orphan), and the production `DirectionalLight` never tracks time of day, with colour and intensity set once at construction. Neither blocks this cycle. Both belong in a lighting cycle.

**2. Half of state 1 already ships, and half of state 4 already has its hook.** `CorralCompass` is mounted **unconditionally** for every scene and mode, and is already a screen-edge chevron plus distance pill that hides when the target projects on-screen. Its target resolution is a four-way chain (roundup zone, corral, `scene.gate.position`, `scene.pen.center`) that already covers all four scenes. D13 demotes it to the off-screen fallback, which is close to what it already is.

**3. The ground threshold exists and is dead code.** `FencePresets.addThresholdEffect` builds exactly the glowing ground plane and two edge glow lines D13 describes. It is unreachable whenever the authored gate GLB loads, because `createGateStructure` returns early with the GLB before reaching it. So state 2's threshold is a resurrection, not a build.

**4. State 4's hooks are asymmetric, and Home Field has none.** Rolling Hills' `OptimizedSheep.checkCorralAndRetire` dispatches `corral-retired` carrying the sheep's x/y/z, which a threshold pulse can consume directly. Home Field's `checkGatePassageAndRetire` dispatches **nothing**. One event has to be added, and it must be added on the client only.

**5. Home Field's gameplay gate and the gate the compass points at are two different objects** that happen to agree numerically. Retirement reads `FieldConfig`'s module-level default; the compass reads `shared/scenes/field.js`'s `gate`. Nothing in the standard scene-load path pushes `scene.gate` into `GameState`. A cue that reads one while the sim reads the other will drift the moment either moves.

## Open questions resolved before writing code

1. **Q1: does this cycle touch `shared/`?** **No, and that is verified rather than hoped.** The cue reads gate position and sheep positions, both of which the client already holds. The only new sim-adjacent thing is a client-side event on Home Field retirement, dispatched from `js/`, mirroring what the corral path already does. Nothing crosses into the Worker, so there is no wire change and no fixture regeneration.

2. **Q2: one module or one per scene?** **One module, one normalised descriptor.** D14's whole point is that a player who learns the language on Home Field must not relearn it. Per-scene modules would drift by construction. `js/world/gateCue.js` owns all four states for all four scenes and takes `{ position, facing, width, kind }`, so a scene's differences are data.

3. **Q3: how does the column stay readable at 140m without being a light?** **A world-space emissive mesh, not a post-process.** The repo already draws exactly this class of thing: `js/effects/PortalEffect.js`, the corral flag pillar in `js/StructureBuilder.js` `buildCorralStructure`, and the sun. A vertical emissive quad or cylinder occludes correctly behind hills and gives distance for free through perspective, which is the reason D13 chose a world-space column over a screen-space marker.

4. **Q4: is funnel occupancy cheap?** **Yes.** The client already holds every sheep position and already computes per-sheep retirement tests each frame. Counting sheep inside an approach rect near the gate is one pass over data that is already hot.

## Architecture

**`js/world/gateCue.js`**, one client-side module, four states driven by one descriptor.

| State | Trigger | What draws | Built from |
|---|---|---|---|
| 1. Far or off-screen | distance beyond the near threshold, or target off-screen | world-space warm column, plus the existing chevron and distance pill | new emissive mesh + `CorralCompass` demoted |
| 2. Near and on-screen | inside the near threshold and projecting on-screen | column fades out, gate posts rim-light, threshold arc on the ground | rim-light precedent in `js/world/webgpuRockRimNodeMaterial.js` (it has a WebGL twin, already sun-driven per frame) + the resurrected `addThresholdEffect` |
| 3. Flock approaching | funnel occupancy above zero | threshold arc brightens in proportion | one pass over sheep positions |
| 4. Crossed | retirement event | one warm pulse along the threshold | `corral-retired` on the island; a new equivalent on Home Field |

## Phase 1 - One gate descriptor, one source (~2hr)

**Depends on Cycle 115 Phase 3** (the gate leaf controller).

1. Resolve one descriptor per scene: position, facing, width, and which retirement kind the scene uses.
2. **Fix the two-gates problem** (finding 5) by having the cue read the same object the sim retires against, or by making the discrepancy explicit and asserting the two agree in a spec.
3. Give Open Country's roundup zone and portal the same descriptor shape, per D14.

**Acceptance (EARS):** When any scene loads, then exactly one gate descriptor shall resolve for it. When the sim's gate and the cue's gate disagree, then a spec shall fail.

## Phase 2 - The column, and the compass demotes (~3hr)

1. World-space emissive column at the gate, tall enough to clear the treeline, occluding correctly behind terrain.
2. Fade it out inside the near threshold, so states 1 and 2 hand over rather than stack.
3. Demote `CorralCompass` to the off-screen fallback only. It is currently mounted unconditionally.
4. Both render paths.

**Acceptance (EARS):** While the gate is beyond the near threshold, a world-space column shall render at it. While the gate is nearer than the threshold, the column shall not render. While the gate projects on-screen, `CorralCompass` shall not render.

## Phase 3 - The threshold, resurrected (~3hr)

1. Bring `FencePresets.addThresholdEffect` back onto the authored-GLB path, where `createGateStructure` currently returns early past it.
2. Restyle it as the D13 soft arc between the posts rather than a glowing plane.
3. Rim-light the gate posts using the existing rim precedent, both paths.

**Acceptance (EARS):** When a scene with an authored gate GLB loads, then the ground threshold shall render. When the gate posts are within the near threshold, then they shall carry a warm rim.

## Phase 4 - Occupancy and the pulse (~3hr)

1. Count sheep inside the approach rect; drive arc brightness from it.
2. Add a Home Field retirement event mirroring `corral-retired`, client-side only.
3. One warm pulse per crossing, quiet enough to repeat 5,000 times. That constraint is real: Solo Chaos is 5,000 sheep, so the pulse must be cheap and must not stack.

**Acceptance (EARS):** While sheep occupy the gate approach, the threshold arc shall brighten in proportion. When a sheep is retired on any scene, then exactly one pulse shall fire. While 5,000 sheep retire, the pulse shall not accumulate cost per sheep.

## Phase 5 - Gate, docs, close (~2hr)

Standard close, plus a browser probe on all four scenes at all four states, which is the only way this cycle's work can be judged.

## Frozen files

None expected. Q1 established the cycle is shared-free. If a state needs sim data the client does not have, stop and surface.

## Hard stops

1. **Adding a real light.** There are none in the repo and the node materials would not see one.
2. **Any `shared/` change.** Q1 says this cycle does not need one; needing one means the design went wrong.
3. **A per-scene cue variant.** D14 is the point of the cycle.
4. **A pulse whose cost scales per sheep.** Chaos is 5,000.

## Success criteria (cycle close)

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` run at cycle close, all four shall pass.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When any scene loads, then exactly one gate descriptor shall resolve for it.
- [ ] If the sim's gate and the cue's gate disagree, then a spec shall fail.
- [ ] While the gate is beyond the near threshold, a world-space column shall render at it.
- [ ] While the gate is nearer than the near threshold, the column shall not render.
- [ ] While the gate projects on-screen, `CorralCompass` shall not render.
- [ ] When a scene with an authored gate GLB loads, then the ground threshold shall render.
- [ ] While sheep occupy the gate approach, the threshold arc shall brighten in proportion.
- [ ] When a sheep is retired on any scene, then exactly one pulse shall fire.
- [ ] While 5,000 sheep retire, the pulse cost shall not scale per sheep.
- [ ] When the cycle closes, then no `PointLight` or `SpotLight` shall have been added.
- [ ] When the cycle closes, then `main-*.js` shall not have grown past its current ratchet, since a third bump is a bundle cycle.
- [ ] When the cycle closes, then Home Field shall have been viewed in a browser and the unviewed Cycle 114 and 115 work confirmed or its defects recorded.
- [ ] When the goldens are re-baselined, then the delta shall have been read with `--diff` first and shown to be confined to what changed.

## References

- [`front-door-roadmap.md`](front-door-roadmap.md) - where this cycle sits in the seven-cycle program
- [`../DECISIONS.md`](../DECISIONS.md) - D13 (the four-state cue), D14 (one language per scene), D20 (roll continuously)
- [`../.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) - render-path rules and browser probe hygiene
- [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`archive/cycles/cycle-115-plan.md`](archive/cycles/cycle-115-plan.md) - the gate leaf controller this depends on
