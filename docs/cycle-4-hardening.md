# Cycle 4 Hardening — post-Phase-B polish + game-loop differentiation

> Written 2026-04-25 after the Phase B PR merged. Phase A built the standalone modules; Phase B wired them in; Hardening fixes what playtest exposed and decides the actual game loops for the new scenes.
> Read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first if you are a cold-start agent. This file is the source of truth for what's left.

## Where things stand

After Phase B, all three scenes load with displaced terrain, atmosphere, and the new camera. The first playtest pass surfaced a chain of bugs whose root cause was the same: the rendered terrain mesh was too coarse compared to the heightfield it was supposed to render, so anything that sampled the heightfield (sheep, grass, trees, fences, the dog, the camera) ended up displaced relative to the visible ground. Plus several scene-level mistakes: mountains looked paper-thin, fences were buried under terrain, the gate had no objective in the new scenes, the camera looked at y=0 in Classic mode which made the dog drift on hills, and the procedural mountain ring read as a paper-thin shell.

### Shipped in the hardening pass (2026-04-25)

| Bug | Root cause | Fix |
|---|---|---|
| Dog drifts off-centre on hills (Classic) | `_updateClassic` look-at hardcoded y=0 | Sample heightfield at dog (x,z), lift target Y → camera rig follows hills. [CameraController.js](../js/CameraController.js) |
| Fences buried under terrain | Fences placed at constant y=0 baseline | New `setHeightfield` + `_surfaceToTerrain` post-process on `StructureBuilder`; per-piece `userData.surfaceToTerrain` tags in `FencePresets`. Posts/rails surface individually; gate group surfaces as one rigid unit. Corner flags also tagged. [StructureBuilder.js](../js/StructureBuilder.js), [FencePresets.js](../js/FencePresets.js) |
| Sheep / grass / trees clip into terrain | Terrain plane was 64×64 segments over 1000 m (~15.6 m / quad) — much coarser than the 1024² heightfield | Bumped to 256×256 desktop / 128×128 mobile in `TerrainBuilder.createTerrain`. Single change fixes all three. |
| Grass LOD ring visible in Follow camera | `lodDecimateMid: 40 m` was inside Follow's ~50 m visible radius | Bumped to 90 m / 160 m, hysteresis 8 m. [GrassSystem.js](../js/GrassSystem.js) config block |
| Mountains look hollow / paper-thin | `ProceduralMountains` is a flat annulus shader-displaced upward only — no closed bottom, gaps between peaks | `addMountains()` is now a no-op. Atmosphere/sky carries the framing. The `ProceduralMountains` class is untouched; revisit when we want a real horizon ring. [TerrainBuilder.js addMountains](../js/TerrainBuilder.js) |
| Open Country had a perimeter fence the scene def claimed didn't exist | `buildSinglePlayerStructures` always built the four border segments | New `perimeterFence: false` flag on the scene def + `buildGateAndPenOnly` path on `FenceConfigBuilder`. `main.js` reads `currentScene.perimeterFence` and threads it through. |
| Follow camera: WASD stayed world-axis when dog turned | `transformMovement` only rotated input in Free mode | Follow now rotates input by `followYaw` (smoothed dog facing = camera look direction). |
| Follow camera: dog disappears behind hills | Camera position only checked terrain at its own (x,z); intervening ridges occluded the dog | New `_sampleMaxTerrainAlong(x0,z0,x1,z1)` samples 7 points along the camera→dog line; camera Y is clamped above the max ridge height + clearance. Same clamp added to Free mode. |

74/74 vitest specs pass. Production build clean.

### Shipped in the second batch (2026-04-25, post-compaction)

| Bug | Fix |
|---|---|
| Open Country pen had only a gate at front; sheep walked around | `buildGateAndPenOnly` flanks the gate with two short border segments closing the front of the pen. [FencePresets.js](../js/FencePresets.js) |
| Trees + farmhouse sunk into terrain on hilly scenes | At GLB load, child mesh transforms are baked into geometries so InstancedMesh-per-child captures the right layout, then `bbox.min.y` is stored. At placement, `placementY = terrainY + (-bboxMinY) * scale`. [TerrainBuilder.js loadModels + createTrees + addFarmHouse](../js/TerrainBuilder.js) |
| Far trees rendered full-mesh past 250m, ~5k tris each | New 3-quad impostor pass: each GLB rendered once to a 512² texture by an offscreen ortho camera; far instances use a 3-plane (60° apart) impostor sharing that texture. ~99% triangle reduction on the farField + horizon zones. [TerrainBuilder.js _bakeTreeImpostor + _createCrossBillboardGeometry](../js/TerrainBuilder.js) |
| Terrain plane ended at ~500 m, abrupt edge with mountains gone | Plane now 2400m / 1600m (desktop / mobile); heightfield content fades to 0 over the last 20m of its `worldSize` so the play area blends smoothly into a flat skirt. [TerrainBuilder.js createTerrain](../js/TerrainBuilder.js) |
| Field looked blue + foggy at midrange | Terrain shader fog: `0x87CEEB → 0xa9b8a8`, `near=200/far=600 → near=350/far=1100`. Removes the green-to-blue gradient mid-frame. [TerrainBuilder.js terrainMaterial uniforms](../js/TerrainBuilder.js) |
| Sheep + dog stayed flat on slopes | `heightfield.normal(x, z)` → pitch + roll projected against facing direction; clamped 22°/18°; `rotation.order = 'YXZ'` so yaw composes cleanly. [Sheepdog.js updateTerrainTilt](../js/Sheepdog.js), [OptimizedSheep.js _applyTerrainTilt](../js/OptimizedSheep.js) |
| Fence rails were horizontal, stair-stepping over hills | New `_slopeRailToTerrain` in `StructureBuilder` reads `userData.railSpan`, samples heightfield at both endpoints, sets rail position to midpoint + `quaternion.setFromUnitVectors(geomAxis, lifted_dir)`. Posts/gate group still surface independently. [StructureBuilder.js _slopeRailToTerrain](../js/StructureBuilder.js) |
| Player chevron parallaxed away from dog on hills | `distanceIndicator.position.y` now tracks `mesh.position.y` (was hardcoded to 0). [Sheepdog.js updateDistanceIndicator](../js/Sheepdog.js) |
| `C` to switch camera was invisible, mobile had no way to switch at all | Persistent badge at top-center, tappable on every platform; cycles via `getCameraController().cycleMode()`. Desktop label "Press C", mobile label "Tap". [components/GameHUD/CameraModeIndicator.js](../js/components/GameHUD/CameraModeIndicator.js) |
| Grass wind was synchronous-pulse waves | Replaced wave-magnitude oscillator with a noise field translating along `windDirection` (slow base flow + faster ripple). Mobile shader has no wind by design, unchanged. [GrassSystem.js getDesktopVertexShader](../js/GrassSystem.js) |
| Grass density-LOD count snap visible in Classic top-down (whole band on screen) | Stochastic per-blade dither in the vertex shader — each blade has a stable hash; blades whose hash falls below `(distXZ - grassFadeStart) / (grassFadeEnd - grassFadeStart)` collapse to a degenerate triangle. Smooth density gradient, no ring. Count-decimation LOD pushed behind the dither (200/280m). Mobile shader gets the same dither. [GrassSystem.js getDesktopVertexShader + getMobileVertexShader](../js/GrassSystem.js) |
| Grass wind read as a single advancing wavefront | Three noise samples at different *rotations* (windDirection, perpendicular, bisector) at different scales/speeds, then averaged. Variation tightened to 0.35–0.65 (was 0.4–1.2) so the field shimmers instead of pulsing. [GrassSystem.js getDesktopVertexShader](../js/GrassSystem.js) |
| Grass-bend "wake" was a world-axis ellipse, not the dog's body | Each entity now reports facing direction; shader transforms blade-to-entity delta into entity-local frame and computes a rounded-rectangle SDF against body half-extents. Dog 1.6×0.6m, sheep 0.6×0.5m, 1.4m falloff. Clearing follows the entity as it turns. [GrassSystem.js + main.js](../js/GrassSystem.js) |
| Stale "ringed by mountains" + em-dashes in scene descriptions | Rewrote each scene's `description`. [shared/scenes/*.js](../shared/scenes) |

74/74 vitest specs still pass. Production build clean.

## Outstanding — what to pick up next

### 1. Rolling Hills as an island (game loop)

The user's stated design: Rolling Hills is an **island** ringed by water. Sheep roam free across the island's surface. The player navigates in Follow camera (third-person) to find scattered flocks, then herds them into a corral somewhere on the island. Sheep can't enter the water. The corral is the goal.

Why it matters: Rolling Hills today is mechanically identical to Field — same rectangular bounds, same gate-passage win condition, same fence-and-pen layout. The difference is just terrain undulation and a darker grass palette. There's no distinct dopamine loop. The "island" reframing gives Rolling Hills its own purpose: navigation + discovery on a bounded but open playfield, with the corral as a single visible goal.

Implementation outline (~5 hr of focused work, each piece independently testable):
1. **Heightfield re-bake** — modify `scripts/bake-heightmap.mjs` to apply a radial falloff so the edges of the rolling-hills heightmap drop below sea level. Existing `peakHeight=6` stays; just add a smoothstep falloff ~radius 90 m on the 200 m heightfield. [scripts/bake-heightmap.mjs](../scripts/bake-heightmap.mjs).
2. **Water plane** — add a single THREE.PlaneGeometry under the heightfield. Simple shader (no waves needed for v1) — solid colour + fog. Lives in `TerrainBuilder` next to `createTerrain`.
3. **Island boundary** — replace the rectangular bounds clamp in [shared/MovementPhysics.js](../shared/MovementPhysics.js) (or [shared/BoundaryCollision.js](../shared/BoundaryCollision.js)) with an `island` mode: when `scene.boundary.kind === 'island'`, apply an inward force when `dist(0,0) > islandRadius - falloff`, hard clamp at shoreline. Same for the dog.
4. **Corral** — replace `gate` + `pasture` with `corral { center: {x,z}, radius }` in the scene def. Reuse `FencePresets.createPenStructure` + `createGateStructure`, anchor at the corral centre (not at the bounds edge). Add a tall flag/pillar so it's findable from a distance.
5. **Win condition** — repoint `GameStateValidation.checkGameCompletion` (or a scene-aware variant) to "N sheep inside corral footprint" instead of "passed gate". The pasture-containment logic already exists; just give it a different anchor.
6. **Wayfinding HUD** — when the corral is off-screen, show an arrow pointing to it on the HUD. Append to [SheepCounter.js](../js/components/GameHUD/SheepCounter.js) or a new `CorralCompass` component.
7. **Default this scene to Follow camera** — add `defaultCamera: 'follow'` to the scene def, read it in [SettingsPanel.js loadCameraMode](../js/components/StartScreen/SettingsPanel.js) when the user hasn't pinned a preference.

Open question worth resolving first: does the Worker sim need to know about the island boundary, or is it a client-side render decision? Answer: yes — sheep boundary is sim, so `MovementPhysics` is the right home and both client and Worker pick it up automatically (it's in `shared/`). Heightfield bounds just need to match the sim bounds.

### 2. Open Country game loop (still undecided)

Three options floated; user hasn't picked. Today the scene has the perimeter fence removed (hardening pass) but no replacement loop — sheep are still bounded by the rectangular sim bounds, gate is still the goal, win condition is unchanged. So Open Country today is "Field with no walls visible," which isn't a satisfying differentiator.

| Option | Sketch | Cost |
|---|---|---|
| **a. Time attack** | Same scattered flock, multiple gates around the field, score = sheep delivered before timer expires | Low — `GameTimer` + multi-gate already exist for competitive |
| **b. Storm front** | Slowly advancing wall of weather pushes flock toward you; score = sheep delivered before sweep | Medium — needs a moving boundary force in `MovementPhysics`, plus weather visual |
| **c. Multi-pen** | 3-4 corrals scattered, each accepting only a colour/group of sheep | Medium-high — needs sheep tagging + colour rendering + multi-zone win check |

**Author's preference: (a)** for v1. Cheapest to build, maps cleanly onto the existing sim, gives Open Country a distinct register (urgency + score-attack vs Rolling Hills' patience-and-navigation).

### 3. Resize behavior — needs reproduction

User reported "it clearly is not resizing well" but no specific symptom. The renderer's resize handler in [SceneManager.onWindowResize](../js/SceneManager.js) looks correct (updates camera aspect, calls `setSize`). Hypotheses:

- Canvas not filling viewport when window resizes
- HUD panels overlap at narrow widths
- Mobile portrait layout broken
- DPR / retina scaling issue

Don't go fishing. When the user surfaces this again, ask for the specific viewport size or browser/device, then reproduce before fixing. Investigation is on hold until then.

### 4. Octahedral impostors as v2 of the tree LOD

Current 3-quad billboard impostor (60° apart, omnidirectional silhouette) is a solid v1: ~99% triangle reduction past 250m, no edge-on disappearance. If billboards still feel cheap on closer inspection, the right v2 is **octahedral impostors** — render each tree GLB to an 8×8 atlas of view directions at build time, then in the impostor shader pick the nearest atlas tile based on view-direction. Better quality at modest extra cost (~256× the texture memory but bilinear interpolation between tiles hides seams).

~6–8 hr work plus a build-time bake step. Defer until a playtest specifically calls out the 3-quad version as inadequate.

### 5. Tree exclusion verification

`createTrees` already rejects Poisson candidates inside `this.zones.playArea` with a 20m buffer ([TerrainBuilder.js:552](../js/TerrainBuilder.js)), so the original report's symptom may have been pre-fix. After any future heightmap re-bake or zone change, manually verify by playing each scene that the foreground play area stays free of trees. No code change needed today.

## What NOT to do during hardening

- Don't redesign the multiplayer protocol. The Worker sim is settled.
- Don't add new scenes. Three is the right number for now; finish the loops on these first.
- Don't reintroduce procedural mountains. If we want a horizon ring later, the right path is a proper height-displaced skirt that the play-area heightfield blends into, not the annulus shader.
- Don't move sim logic out of `shared/`. The island-boundary work belongs in `MovementPhysics`, not in client-only code, so the Worker sim stays in lockstep.
- Don't regenerate `tests/sim-baseline/` fixtures unless you understand exactly what changed and why. The fixtures are a one-way ratchet.
