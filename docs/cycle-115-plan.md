# Cycle 115 - fence-and-homestead

> Authored 2026-07-25 from a four-agent reality check against the shipping build. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom.

## Goal

Most of what the roadmap asks for here already shipped, so this cycle is not the one the roadmap describes. What is actually missing is narrower and sharper: the fence kit has **no authoring source anywhere**, so its weathering, sag and chamfer cannot be touched without rebuilding it; Home Field's gate renders permanently frozen in its baked-open pose because the leaf rig is trapped inside a Newsheepdogland branch; and the game has no light that comes on at dusk because it has **no point or spot light at all**. After this cycle the fence is a thing that can be authored and re-baked rather than an opaque binary, the gate on every scene can open and close (which is what Cycle 116 needs), and the homestead reads as inhabited after sundown.

## What the reality check changed

The roadmap's five bullets, checked against the repo:

| Roadmap bullet | Reality |
|---|---|
| New `tools/bake-fence.mjs`, chamfered posts, sag, vertex-colour weathering | **Missing, and worse than missing.** No bake tool, no `COLOR_0` on any fence mesh, rails are straight bars, posts are 156 tris of hand-authored surface noise. Critically there is **no authoring source of any kind**: the kit exists only as an opaque binary GLB. |
| A five-bar hanging gate distinct from the perimeter run | **Shipped**, with one real gap. `Gate_Assembly-v1.0.0.glb` is genuinely distinct: 8 meshes, 720 tris, 3 materials, slant-capped posts, iron hinge brackets, two leaves on pivots. But it is a **three-bar double-leaf**, not a five-bar single. And Home Field renders it **frozen in the baked-open pose**. |
| Farmhouse as a modular kit-bash with separate materials | **Done, both halves, and neither in this cycle.** The geometry already shipped (55 role-named meshes). The materials shipped in **Cycle 114 Phase 4**, which found the real cause: the atlas gives roof, gables, porch roof and body walls the same swatch, so the house was one colour from the eaves down. Three role materials now, by a named table in [`../js/world/farmhouseMaterialRoles.js`](../js/world/farmhouseMaterialRoles.js). Nothing left here. |
| Checkpoint: Matt reviews the farmhouse, external if not charming | **Already fired, already resolved to external.** `cycle105-validation/homestead-playfield-pack-report.md` records the Kiln pack item `01-farmhouse-a` being approved in the live scene after one-off candidates were rejected as "too generic and blocky". Do not re-author the farmhouse. |
| Homestead yard: dirt approach from the gate, trough, bales, dusk lamp | **Props shipped** (trough, both bale variants, 8 more), placed across four scenes. **Dirt approach absent. Dusk lamp absent.** And the yard is nowhere near the gate. |

**The yard is not on the gate approach, which makes the roadmap's phrasing impossible as written.** Home Field's gate is at `(0, 100)`. Every homestead prop sits at `x 156-188, z 132-153`, clustered around the farmhouse at `(180, 160)`, which is outside the `+/-100` play bounds entirely. There is no yard between the player and the gate to lay a dirt path across. Either the dirt approach serves the **pen gate** (where the player actually goes) or the yard moves. This cycle picks the pen gate, because that is the threshold the game is about.

## Open questions resolved before writing code

1. **Q1: rebuild the fence kit from a new authoring source, or keep the GLB and skin it?** **Rebuild the source.** D10 is explicit that the fence is authored in-repo and does not go external. Weathering needs `COLOR_0`, which the shipped kit does not have; sag needs geometry the shipped rail does not have; chamfer needs parametric control over 85 irregular Y rings that were never authored parametrically. Each of the three roadmap asks is blocked on the same missing thing. Build `tools/bake-fence.mjs` following `tools/bake-rocks.mjs`, which D10 names as the pattern.

2. **Q2: does the new fence have to match the old one?** **Silhouette yes, surface no.** The kit's post is 2.18m with rails at `[0.5, 1.2, 1.9]`, and `js/StructureBuilder.js` instances against those heights. Changing the silhouette means re-tuning every placement and re-shooting the heroes. Keep the profile, replace the surface.

3. **Q3: is the dusk lamp a real light?** **Decide by measurement, default to emissive.** There is **no `PointLight` or `SpotLight` anywhere in `js/`**, on any scene, on any tier. Adding the first one is a lighting-architecture change with a per-tier cost this cycle has not budgeted. An emissive material plus a soft ground falloff term buys the read at a fraction of the cost, and it is what the game already does for the sun and the portal. Measure a real light before ruling it in.

4. **Q4: where does the gate leaf rig live?** **Promoted to the gate builder, not the scene branch.** `js/StructureBuilder.js:551-576` `_buildAuthoredGateDoor` finds `Mesh_LeftGateWood` / `Mesh_RightGateWood`, renames their pivots and records `{closed: 0, open: <authored angle>}` on a controller. Only the Newsheepdogland path calls it (`:505-512`). Cycle 116's four-state cue needs every scene's gate to have that controller, so it moves.

## Phase 1 - An authoring source for the fence (~4hr)

**Depends on nothing. Blocks Phases 2.**

1. **Write `tools/bake-fence.mjs`** following `tools/bake-rocks.mjs`: headless Chromium, three.js, `GLTFExporter`, then `gltf-transform` with Draco and meshopt.
2. **Author the post parametrically.** Chamfered top, a taper, and controllable ring count. The current 156-tri post has 85 distinct Y levels of hand-authored noise; a parametric post with deliberate chamfer at a similar budget is the deliverable.
3. **Preserve the silhouette** per Q2: 2.18m post, rails at `[0.5, 1.2, 1.9]`.
4. **Emit `COLOR_0`.** The shipped kit has only `POSITION`, `NORMAL`, `TEXCOORD_0`. Weathering in Phase 2 needs the channel to exist.
5. **Keep the shared palette texture.** The kit samples a 32x4 `PaletteBaseColor` PNG and the whole point of `190847b6` was one shared texture. Do not regress to per-asset textures.
6. **Do not delete the old kit yet.** Ship the new one alongside and switch the loader, so a revert is a one-line change.

**Acceptance (EARS):**

- When Phase 1 ships, then `tools/bake-fence.mjs` shall exist and shall regenerate the fence kit from source.
- When the new kit is inspected, then every mesh shall carry a `COLOR_0` attribute.
- When the new post is measured, then its height and rail attachment heights shall match the shipped kit's within a stated tolerance.
- If the new kit changes the post silhouette enough to move placement, then the phase shall stop and surface.

## Phase 2 - Weathering and sag (~3hr)

**Depends on Phase 1.**

1. **Vertex-colour weathering** darkening toward the ground, baked into `COLOR_0`.
2. **Sag on long runs.** The rail is a straight bar scaled on X and rotated as a straight chord between post tops. Give it a catenary droop that scales with span.
3. **Confirm the material reads vertex colours.** The GLB path uses `PaletteMaterial001`; the procedural fallback at `js/FencePresets.js:260-321` uses flat `MeshPhongMaterial` with no `vertexColors`. Both need it.
4. **Check `_slopeRailToTerrain`** (`js/StructureBuilder.js:259+`), which re-orients each rail between its two posts. Sag must compose with terrain slope, not fight it.

**Acceptance (EARS):**

- While a fence post stands on the ground, its lower vertices shall render darker than its upper vertices.
- When a fence run spans more than one post gap, then its rails shall droop between posts rather than reading as straight chords.
- When the WebGL and WebGPU paths render the same fence run, then the weathering shall read the same on both.

## Phase 3 - Every gate can open (~2hr)

**Depends on nothing. Blocks Cycle 116.** The highest-leverage phase here, and the smallest.

1. **Promote `_buildAuthoredGateDoor`** out of `js/StructureBuilder.js`'s Newsheepdogland branch so every scene's gate gets the leaf controller.
2. **Fix Home Field's frozen gate.** `js/FencePresets.js:396-405` clones the gate assembly and only scales and rotates it, so the leaves render in their baked-open pose (-72 and 252 degrees) forever.
3. **Give the controller a neutral API** that Cycle 116 can drive: current state, target state, and a settable open fraction.
4. **Do not animate it on a timer here.** What opens the gate is a gameplay question Cycle 116 and 117 own. This phase only makes it possible.

**Acceptance (EARS):**

- When any scene with a gate loads, then its gate shall expose a leaf controller with `closed` and `open` angles.
- When Home Field loads, then its gate leaves shall render in the controller's current state rather than in the asset's baked pose.
- If the gate assembly fails to load, then the fallback path shall still expose a controller, so consumers need no null branch.

## Phase 4 - The approach to the gate (~3hr)

**Depends on Cycle 114 Phase 1** (the grass falloff), because a dirt path through grass that stops at a knife edge reads worse than no path.

1. **Serve the pen gate, not the farmhouse yard**, per the reality check. The player walks to `(0, 100)`; the yard at `(180, 160)` is outside the play bounds.
2. **Reuse the terrain's existing dirt.** The terrain material already carries a `dirt` colour and a `dirtMask` from `smoothstep(0.54, 0.74, n1 * n2)`. An approach path is a shaped contribution to that mask, not a new material.
3. **Both paths.** `js/TerrainBuilder.js` and `js/world/webgpuTerrainNodeMaterial.js`.
4. **Thin the grass over it** using Cycle 114's keep-probability function, so the path is worn rather than painted.

**Acceptance (EARS):**

- When the player approaches the pen gate, then the ground shall read as a worn approach rather than as uniform pasture.
- When Phase 4 ships, then the approach shall be expressed through the terrain's existing dirt mask rather than a new material.
- While the approach crosses grass, the grass shall thin over it rather than stopping at an edge.

## Phase 5 - A lamp at dusk (~3hr)

**Depends on Phase 3** (it hangs off the gate and the homestead).

1. **Measure a real light first**, per Q3, and record the number. If a single `PointLight` costs less than a stated budget on the mid tier, it is on the table. Otherwise go emissive.
2. **Drive it from the time of day.** `Atmosphere.setTimeOfDay` is the lever, and dusk is `t = 0.75`.
3. **Use the geometry that already exists.** `Farm house.glb` carries `Mesh_LanternBracket`, `Mesh_LanternGlow` and `Mesh_LanternCap`, all currently non-emissive. No new geometry needed.
4. **Both paths.**

**Acceptance (EARS):**

- While the time of day is past dusk, the homestead lantern shall render emissive.
- While the time of day is noon, the lantern shall render unlit.
- When Phase 5 ships, then the decision between a real light and an emissive fake shall be recorded with the measurement that decided it.

## Phase 6 - Gate, docs, close (~2hr)

1. Full gate: `npm run lint`, `npm test`, `npm run typecheck`, `npm run build`.
2. **Re-baseline the goldens deliberately, and discharge Cycle 114's carryover 1 while you are in there.** The fence appears in Home Field's golden cells, so Phases 1 and 2 move them. Cycle 114 also left its own ground-colour delta un-rebaselined and unviewed. Run `npm run validation:screenshots -- --diff`, read the numbers, confirm the delta is confined to the fence and the ground, then re-baseline. Do not run `--capture` and call it verified.
3. **Look at Home Field.** Cycle 114 shipped a grass falloff, post lean, three farmhouse materials and a dog contact shadow that nobody has seen. This cycle's browser probe covers both cycles' visual work. Per `.claude/rules/scene-and-render.md`, close every Playwright page, context and browser, stop any dev listener started for the probe, and set `SDS_SUPPRESS_BROWSER_OPEN=1`.
4. Update the roadmap's Cycle 115 section with the reality-check table, so the next reader does not re-derive it.
5. Record what Phase 1 learned about the kit for Cycle 116, which depends on the gate.

**Acceptance (EARS):**

- When Phase 6 ships, then `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` shall all pass.
- When the goldens are re-baselined, then the delta shall be shown to be confined to the fence and the ground, with the numbers recorded.
- When Phase 6 ships, then Home Field shall have been viewed in a browser and the Cycle 114 grounding work confirmed or its defects recorded.
- When the close commit lands on `main`, then the sheepdogsim.com deploy shall succeed via GitHub Actions.

## Frozen files

None expected. If the gate controller needs a `SceneDef` field, stop and surface: `shared/scenes/types.js` is frozen.

## Hard stops

1. **Re-authoring the farmhouse.** The checkpoint already fired and resolved to external.
2. **Changing the fence silhouette.** Q2. It would move every placement and invalidate the heroes.
3. **Adding a real light without measuring it.** Q3. There are none in the game today; the first one is an architecture decision.
4. **Deleting the old fence kit before the new one ships and holds.**
5. **A bundle regression.** Cycle 114 already spent 10 KiB of the `main` chunk and had to bump the ratchet. A new baked asset does not touch `main`, but a new authoring tool must stay in `tools/` and out of the client bundle. `EMERGENCY_STOPS.md` makes a `main-*.js` growth a stop-and-surface.

## Success criteria (cycle close)

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` run at cycle close, all four shall pass.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When Phase 1 ships, then `tools/bake-fence.mjs` shall exist and shall regenerate the fence kit from source.
- [ ] When the new kit is inspected, then every mesh shall carry a `COLOR_0` attribute.
- [ ] While a fence post stands on the ground, its lower vertices shall render darker than its upper vertices.
- [ ] When a fence run spans more than one post gap, then its rails shall droop between posts rather than reading as straight chords.
- [ ] When any scene with a gate loads, then its gate shall expose a leaf controller with `closed` and `open` angles.
- [ ] When Home Field loads, then its gate leaves shall render in the controller's current state rather than in the asset's baked-open pose.
- [ ] While the time of day is past dusk, the homestead lantern shall render emissive, and unlit at noon.
- [ ] When Phase 5 ships, then the decision between a real light and an emissive fake shall be recorded with the measurement that decided it.
- [ ] When Phase 6 ships, then Home Field shall have been viewed in a browser and Cycle 114's unviewed grounding work confirmed or its defects recorded.
- [ ] When the cycle closes, then `main-*.js` shall not have grown, since no new client code is required.

## References

- [`front-door-roadmap.md`](front-door-roadmap.md) - where this cycle sits in the seven-cycle program
- [`../DECISIONS.md`](../DECISIONS.md) - D9 (stylised painterly), D10 (fence and farmhouse authored in-repo, with the checkpoint), D20 (roll continuously)
- [`../.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) - render-path rules and browser probe hygiene
- [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`archive/cycles/cycle-114-plan.md`](archive/cycles/cycle-114-plan.md) - the grounding pass this builds on, and its carryover
