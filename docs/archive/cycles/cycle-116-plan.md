# Cycle 116 - gate-legibility

> Authored 2026-07-25 from a six-agent reconnaissance pass over the gate cue and the lighting rig. **Corrected 2026-07-25** after a second five-agent recon plus an adversarial cross-check settled five claims the first pass got wrong, and after the deferred browser probe finally ran. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom.

## Goal

The player can see where the sheep are supposed to go, from anywhere, in one visual language. Today the answer is a screen-edge chevron plus a floating white diamond, and at the gate itself there is nothing: the ground threshold effect that would mark the crossing exists in the code and never renders. D13 fixes that with four states, and D14 says the same language on every scene so learning "warm means go there" on Home Field transfers to the island. After this cycle a player 140 metres out sees a warm column clearing the treeline, a player near the destination sees a threshold arc draw on the ground, the arc brightens as the flock funnels in, and each crossing gives one quiet warm pulse.

## What the browser probe changed

The probe deferred out of Cycles 114 and 115 ran first, before any code. Full record: [`../cycle116-validation/PROBE_FINDINGS.md`](../cycle116-validation/PROBE_FINDINGS.md).

It **confirms this cycle's premise by looking rather than assuming**. The gate leaves default fully open and swing flat against the fence line, so the gate is an 8m break between two posts and nothing more. The current cue is a flat white diamond billboarded in the air above it, visible from behind and below, with no connection to the ground.

It also found three carryover defects that are **not** this cycle's scope and go to the backlog: the pen interior and the 80m farmhouse yard are bald rather than thinned, the gate approach reads as a mud stain rather than worn ground, and Cycle 115 Phase 7's dusk lamp is a correct ramp wired to a sun that never moves - Home Field is the only scene with a farmhouse and the only public scene without a day/night cycle, so the lamp can never fire in play.

## What the reconnaissance changed

**1. Nothing here should be a light.** There is no `PointLight`, `SpotLight`, `RectAreaLight` or `LightProbe` anywhere in the repo.

On WebGPU the terrain and meadow quads are `MeshLambertNodeMaterial`, and sheep, tree leaves and tree branches are `MeshStandardNodeMaterial`, all genuinely lit. Grass, water and impostors are `MeshBasicNodeMaterial`, unlit in effect. On WebGL the rig is three lights, not two. So a new light would be visible on one render path and not the other, which is worse than invisible. Every state below is shader work or emissive geometry, and Cycle 115's [`js/atmosphere/duskLamp.js`](../js/atmosphere/duskLamp.js) is the worked example.

Recorded and out of scope, now measured rather than read: the production `DirectionalLight` sits at intensity 3.456 white at **every** time of day including full night. That belongs in a lighting cycle.

**2. `CorralCompass` already self-hides.** The first plan said it is mounted unconditionally and D13 demotes it. `CorralCompass.tsx:102` is `if (view.onScreen) return null;`. It is **already** the off-screen fallback. There is no demotion to perform; what is left is making the column and the compass share one visibility decision so states 1 and 2 hand over instead of stacking.

**3. The ground threshold exists and is dead code** - `FencePresets.addThresholdEffect` builds the glowing plane and edge lines, and `createGateStructure` returns early with the authored GLB before reaching it.

**4. But resurrecting it in place would ship the arc on two scenes out of four.** `js/StructureBuilder.js:417-427` returns early whenever the scene has a `corral`, so `createGateStructure` is **never called** on Rolling Hills or Open Country. Those two scenes build no gate at all. Putting the arc inside the gate group is a direct violation of D14 in substance: the player learns the language on Home Field and it is absent on both islands. **The arc therefore belongs to the cue, not to the gate group** - a scene-graph mesh at `descriptor.position`, grounded through `TerrainBuilder._groundY`, drawing on Home Field's gate mouth, Rolling Hills' corral disc, Open Country's roundup zone and then its portal. `FencePresets`' remaining job shrinks to the post rim on the two scenes that have posts.

**5. The retirement dispatch is in `GameState`, not `OptimizedSheep`.** `js/OptimizedSheep.js:2457-2486` is a pure predicate; the `corral-retired` dispatch is `js/GameState.js:359-363`, inside `if (triggered)` behind `if (this.corral)`. An implementer following the first plan would have edited the wrong layer, inside a method two harnesses stub to `false`.

**6. The rock rim is sun-driven on one path only.** `js/world/webgpuRockRimNodeMaterial.js` is 25 lines with no uniform and no setter - a compile-time constant. Only the WebGL `onBeforeCompile` twin is driven per frame from `js/main.js:3007`, and their numbers already disagree (rimPower 2.0 vs 2.25, strength 0.35 vs 0.22). It is a precedent for the *look*, not for the *drive*.

**7. `PortalEffect` is not a free precedent.** It is additive-blended unlit geometry with three hand-written node twins and a factory inventory spec. The real precedents are the corral flag pillar and `duskLamp.js`: a stock material with no node twin, live-resolved per `js/world/farmhouseMaterialRoles.js:294-301`.

**8. Home Field has four gate objects, and the visible one is FieldConfig's.** The sim gate and the cue gate do agree numerically today - both `(0, 100)` width 8, verified by executing both modules. But `js/boot/initWorld.js:291` places the gate *mesh* from `gameState.getGate()` (FieldConfig), so on the client FieldConfig is the single source for retirement **and** geometry, and `scene.gate` has exactly one client reader: the compass. The sibling `pasture` has **already drifted** - FieldConfig computes `maxZ 125 / centerZ 113.5`, `field.js` authors `maxZ 130 / centerZ 115`. That divergence is client-vs-Worker, inert today because `js/GameState.js:324` disables client retirement in MP, and fixing it is a `shared/` edit. Backlog, not this cycle.

**9. Newsheepdogland has no reachable pulse hook outside `shared/`.** NSL has `gate` + `pen` and no `corral`, so `js/GameState.js:342` runs `checkGatePassageAndRetire` against FieldConfig's passage zone 1,200m from NSL's actual gate; it never fires. NSL retires at `shared/survival/pen.js:214`, which dispatches nothing and cannot be edited under Hard stop 2. So "a pulse on any scene" is unmeetable as first written. The compliant hook is a client-side observer on the retired-count delta in `js/gamestate/penContainment.js`.

## Open questions resolved before writing code

1. **Q1: does this cycle touch `shared/`?** **No, verified.** The cue reads gate position and sheep positions, both client-held. The new sim-adjacent things are a client-side event on Home Field retirement dispatched from `js/GameState.js`, and a client-side observer for NSL. Nothing crosses into the Worker; no wire change, no fixture regeneration.

2. **Q2: one module or one per scene?** **One module, one normalised descriptor.** `js/world/gateCue.js` owns all four states for all four scenes and takes `{ position, facing, width, kind }`, so a scene's differences are data. Per-scene modules would drift by construction, which is the whole of D14.

3. **Q3: how does the column stay readable at 140m without being a light?** **A world-space emissive mesh, not a post-process** - occludes correctly behind hills and gives distance for free through perspective. Built on the corral-flag-pillar / `duskLamp.js` idiom (stock material, live-resolved), **not** on `PortalEffect`.

4. **Q4: is funnel occupancy cheap?** **Yes.** The client already holds every sheep position and already runs a per-sheep retirement test each frame. Counting sheep inside an approach rect is one pass over data that is already hot.

5. **Q5: can this land without bumping the bundle ratchet?** **Yes, and it must.** Measured at HEAD: `main` 679,436 bytes against a 680,447 gate (**1,011 bytes** headroom) and `three` 628,824 against 629,247 (**423 bytes**, the tighter of the two and unnamed in the first plan). `RingGeometry`, `CylinderGeometry`, `CircleGeometry`, `PlaneGeometry` and `MeshBasicMaterial` are already in the built `three` chunk, so every geometry proposed here is free. `TorusGeometry` is not - do not reach for it. The rule for this cycle: **no new THREE class, no new node-material module.** `tests/refactor-baseline/__fixtures__/bundle-sizes.json` is fenced and this cycle does not bump it.

## Architecture

**`js/world/gateCue.js`**, one client-side module, four states driven by one descriptor.

| State | Trigger | What draws | Built from |
|---|---|---|---|
| 1. Far or off-screen | distance beyond the near threshold, or target off-screen | world-space warm column, plus the existing chevron and distance pill | new emissive mesh + `CorralCompass` sharing one visibility decision |
| 2. Near and on-screen | inside the near threshold and projecting on-screen | column fades out, threshold arc on the ground, gate posts rim-light where posts exist | cue-owned arc mesh + `applyGatePostRim` |
| 3. Flock approaching | funnel occupancy above zero | threshold arc brightens in proportion | one pass over sheep positions |
| 4. Crossed | retirement event | one warm pulse along the threshold | `corral-retired` from `js/GameState.js:359`; a new sibling for the gate path; a count-delta observer for NSL |

## Phase 1 - One gate descriptor, one source (~2hr)

Solo, first. Everything else reads it.

1. `js/world/gateCue.js` exports `resolveGateDescriptor(sceneDef, gameState)` returning `{ position, facing, width, kind }` for all four scenes: Home Field's gate, Rolling Hills' corral, Open Country's roundup zone then portal, NSL's gate.
2. **Resolve from `sceneDef` only.** `disposeScene` step 10 nulls `corral`/`objective`/`boundary` but **not** `gate`/`pasture`, so a descriptor that falls back to `gameState` inherits the previous scene's on a swap.
3. Assert in a spec that the sim's gate and the cue's gate agree, so finding 8's coincidence cannot silently drift.

**Acceptance (EARS):** When any scene loads, then exactly one gate descriptor shall resolve for it. If the sim's gate and the cue's gate disagree, then a spec shall fail.

## Phase 2 - The column, one hook, one dispose (~3hr)

Owns the single per-frame hook, the single construct site and the single dispose entry that Phases 3-B and 4 then extend in place. Three phases proposing their own insertion into `js/main.js:3029-3036` is how two near-thresholds drift apart.

1. World-space emissive column at the descriptor, tall enough to clear the treeline, occluding correctly behind terrain.
2. Fade it out inside the near threshold so states 1 and 2 hand over rather than stack, and give the column and `CorralCompass` **one** visibility decision.
3. Construct inside the path that runs on both boot and rebuild; **bind unconditionally**, so an empty resolve clears the prior scene. Do not mirror the `if (sceneDef.X)` guards at `js/main.js:1172-1176` - that pattern is what leaves a stale cue on a swap. Follow `bindDuskLamps` at `js/boot/initWorld.js:276`.
4. Both render paths, stock-material idiom.

**Acceptance (EARS):** While the gate is beyond the near threshold, a world-space column shall render at it. While the gate is nearer than the near threshold, the column shall not render. While the column renders, `CorralCompass` shall be driven by the same visibility decision. When a scene swap completes, then no cue from the previous scene shall remain.

## Phase 3-A - The threshold numbers and the post rim (~2hr)

Runs in parallel with Phase 2. Disjoint files: 3-A never touches `gateCue.js`, `main.js`, `initWorld.js` or `loadScene.js`.

1. New `js/world/gateThreshold.js` owning the arc numbers, `applyGatePostRim` and `gateRimFactor`.
2. Rim the gate posts on the two scenes that have them, **both paths driven the same way** - the existing rock rim is a compile-time constant on WebGPU and a per-frame uniform on WebGL, and copying that is how a rim tracks the sun on half the machines.
3. **A module-level `WeakMap` keyed on the source material is mandatory, not stylistic.** `clearAllStructures` deliberately disposes geometries only and never materials, `FencePresets.loadModels` caches forever, and `cloneModel` shares material refs - so a per-gate derived material leaks every swap and a mutated source material lights every gate for the rest of the session.
4. `tests/fence-presets.spec.js:38` **and** `:101` both find the threshold by `geometry?.type === 'PlaneGeometry'`. Both change in this commit, not one.

**Acceptance (EARS):** When the gate posts are within the near threshold, then they shall carry a warm rim on both render paths. While scenes swap repeatedly, the rim shall not accumulate materials.

## Phase 3-B - The arc, on all four scenes (~2hr)

Strictly after Phase 2; needs the cue's per-frame owner and its `_groundY` resolve.

1. Cue-owned arc mesh at `descriptor.position`, radius from `descriptor.width`, grounded through `TerrainBuilder._groundY`.
2. Draws on all four scenes, per finding 4. This is the phase that satisfies D14.

**Acceptance (EARS):** When any of the four scenes loads, then the ground threshold arc shall render at its destination. While the destination sits on sloped ground, the arc shall follow the heightfield.

## Phase 4 - Occupancy and the pulse (~3hr)

Last; re-enters `gateCue.js` and `initWorld.js`, both owned by Phase 2, and is the only phase touching `js/GameState.js`.

1. Count sheep inside the approach rect; drive arc brightness from it.
2. Add the gate-path retirement event as a sibling of the `corral-retired` dispatch at `js/GameState.js:359-363`, client-side only.
3. Add the NSL count-delta observer in `js/gamestate/penContainment.js`, since NSL's own retirement is in `shared/` and cannot be touched.
4. One warm pulse per crossing, cheap enough to repeat 5,000 times.

**Acceptance (EARS):** While sheep occupy the gate approach, the threshold arc shall brighten in proportion. When one or more sheep are retired on a frame, then at most one pulse shall fire on that frame and never zero. While 5,000 sheep retire, the pulse cost shall not scale per sheep.

## Phase 5 - Gate, docs, close (~2hr)

Standard close, plus a browser probe on all four scenes at all four states using the harness Phase 0 built. The probe is now a repeatable tool, not a one-off.

## Frozen files

`tests/refactor-baseline/__fixtures__/bundle-sizes.json` is fenced ([`INTERFACE_FENCE.md`](INTERFACE_FENCE.md):52). **This cycle does not bump it** - Q5 establishes the headroom is there. If a phase finds it needs a bump, that is a signal the design went wrong; stop and surface rather than editing the fixture.

Otherwise none. Q1 established the cycle is shared-free. If a state needs sim data the client does not have, stop and surface.

## Hard stops

1. **Adding a real light.** There are none in the repo and it would land on one render path only.
2. **Any `shared/` change.** Q1 says this cycle does not need one; needing one means the design went wrong. This is also why NSL's pulse goes through a client observer.
3. **A per-scene cue variant.** D14 is the point of the cycle, and finding 4 is where the first plan would have produced one by accident.
4. **A pulse whose cost scales per sheep.** Chaos is 5,000.
5. **A new THREE class or a new node-material module.** `three-*.js` has 423 bytes of headroom.

## Success criteria (cycle close)

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` run at cycle close, all four shall pass.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When any scene loads, then exactly one gate descriptor shall resolve for it.
- [ ] If the sim's gate and the cue's gate disagree, then a spec shall fail.
- [ ] While the gate is beyond the near threshold, a world-space column shall render at it.
- [ ] While the gate is nearer than the near threshold, the column shall not render.
- [ ] While the column renders, `CorralCompass` shall be driven by the same visibility decision.
- [ ] When a scene swap completes, then no cue from the previous scene shall remain.
- [ ] When any of the four scenes loads, then the ground threshold arc shall render at its destination.
- [ ] When the gate posts are within the near threshold, then they shall carry a warm rim on both render paths.
- [ ] While scenes swap repeatedly, the rim shall not accumulate materials.
- [ ] While sheep occupy the gate approach, the threshold arc shall brighten in proportion.
- [ ] When one or more sheep are retired on a frame, then at most one pulse shall fire on that frame and never zero.
- [ ] While 5,000 sheep retire, the pulse cost shall not scale per sheep.
- [ ] When the cycle closes, then no `PointLight` or `SpotLight` shall have been added.
- [ ] When the cycle closes, then neither `main-*.js` nor `three-*.js` shall have grown past its current ratchet, and `bundle-sizes.json` shall be unmodified.
- [ ] When the cycle closes, then Home Field shall have been viewed in a browser and the unviewed Cycle 114 and 115 work confirmed or its defects recorded.
- [ ] When the goldens are re-baselined, then the delta shall have been read with `--diff` first and shown to be confined to what changed.

## References

- [`../cycle116-validation/PROBE_FINDINGS.md`](../cycle116-validation/PROBE_FINDINGS.md) - the browser probe this cycle inherited and finally ran
- [`front-door-roadmap.md`](front-door-roadmap.md) - where this cycle sits in the seven-cycle program
- [`../DECISIONS.md`](../DECISIONS.md) - D13 (the four-state cue), D14 (one language per scene), D20 (roll continuously)
- [`../.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) - render-path rules and browser probe hygiene
- [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`archive/cycles/cycle-115-plan.md`](archive/cycles/cycle-115-plan.md) - the gate leaf controller this depends on
