# Scene loading and render-path rules

Durable rules for scene definitions, atmosphere, terrain, grass, foliage LOD, and the heightfield contract. No cycle-specific content.

## Scene-as-data contract

Scenes are JS modules under [`shared/scenes/`](../../shared/scenes/) typed by JSDoc against [`shared/scenes/types.js`](../../shared/scenes/types.js). The Worker sim and the client renderer both consume the same `SceneDef`.

- **Scene format is `.js` + JSDoc, not `.ts`.** `shared/` is consumed by Vite, wrangler/esbuild, and Node tests; `.js` needs zero new build plumbing, JSDoc gives IDE types.
- **`SceneDef` schema is fence-frozen** — see [`docs/INTERFACE_FENCE.md`](../../docs/INTERFACE_FENCE.md). Adding an optional field with a default is the cheap case; renaming or removing requires a full consumer migration in the same PR.
- **Scene-specific knobs live on the `SceneDef`**, not as branches in `TerrainBuilder` or `GrassSystem`. Hardcoded scene-id branches in render code are a code smell — gate on a scene-def flag instead. Examples already converted: `perimeterFence` (bool), `farmHouse` (rect), `pasture` (rect), `grass.densityRange` (multiplier on `worldSize`), `objective.roundupZone` (multi-stage objective opt-in).

## Heightfield single source of truth

The terrain mesh and every entity that "sits on the ground" must agree on the same Y at every (x, z). The contract:

- **`Heightfield.sample(x, z)`** returns the raw heightfield Y, clamped to edge values past `worldSize`.
- **`TerrainBuilder._groundY(x, z)`** wraps `Heightfield.sample` and applies the same smoothstep falloff to 0 over the last 20m of `worldSize` that the visible terrain mesh uses. Anything that places visible geometry on the ground (trees, rocks, structures, the dog, sheep, the camera ridge clamp) goes through `_groundY`, not raw `sample`.
- The contract is **read-only at runtime**. Heightmaps are baked at build time by `scripts/bake-heightmap.mjs` into `public/terrain/<scene>.r32f`; runtime fBm in a Worker would cost ~30ms of CPU per scene-load.

If a future system places geometry on the ground and uses raw `sample()` outside `±worldSize`, it will float above the flat skirt at the heightfield's clamped edge value. Aerial Classic camera hides this; Follow exposes it. Always `_groundY`.

## Atmosphere drives `scene.fog`

The terrain shader uses Three.js standard fog chunks (`<fog_pars_vertex>`, `<fog_vertex>`, `<fog_pars_fragment>`, `<fog_fragment>`) and reads `scene.fog` directly. `Atmosphere` updates `scene.fog` per-frame so the fog color matches the sky's horizon at the current sun position.

- **Don't introduce per-material fog uniforms** for new render passes if you can use `scene.fog`. Custom fog drifts from the sky.
- A scene that needs different fog from the sky needs an explicit `scene.fog` override + a written rationale in the cycle plan; the standard path is shared.

## Foliage LOD strategy

Tree LOD is **per-tier divergent** by design:

- **Desktop (`HardwareTier === 'medium'` and above):** LOD0 (0–200m) → kiln impostor (180m+) with 20m alphaHash crossfade band. **No LOD1.** Reasoning: alpha-tested foliage cards can't lose detail without losing silhouette, so a mid-distance "simplified" mesh always reads as wrong. Polish-program thesis preserved in [`DECISIONS.md`](../../DECISIONS.md) — see "Polish program — thesis and outcomes (2026-05)".
- **Mobile (`HardwareTier === 'low'`):** keep meshopt LOD1 at 80m. Phone pixel density absorbs ~40% of the silhouette warp; the seam is roughly invisible at phone viewing distance.

Removing the desktop "no LOD1" rule requires re-validating mid-tier desktop perf and silhouette match. Removing the mobile LOD1 requires re-validating mid-tier mobile perf. Don't collapse to a single LOD ladder for cleanliness.

## Far-tree impostors

Trees beyond `FAR_LOD_DIST` (distance-from-origin, scene-scoped — typically 250–400m depending on island size) render as 3-quad billboards offset 60° apart, baked once via offscreen ortho render at scene load. `MeshBasicMaterial { map, alphaTest: 0.4, transparent }`.

- The threshold is **distance-from-origin**, not distance-from-camera. It's a static decision per tree at scene load.
- Camera-relative LOD would require per-frame mesh↔billboard switching — out of scope without a deliberate cycle for it.

## Grass discipline

Grass is one InstancedMesh + custom shader + per-instance attribute system. It is **internally cohesive**; do not decompose it (see [`DECISIONS.md`](../../DECISIONS.md) "OptimizedSheep + GrassSystem are large-and-cohesive by design").

- **Density LOD uses stochastic per-blade dither**, not count steps. Each blade has a stable per-instance hash; as distance grows, a fraction collapses to a degenerate triangle. Hard count-decimation runs behind the dither so its step lands inside an already-mostly-culled zone.
- **Wind uses three rotated noise octaves**, not one. Single-noise wind reads as a coherent wavefront; three rotations average to flow without a single front. Variation is tightened to 0.35–0.65 so the field shimmers/breathes instead of pulses.
- **Mobile grass shader has no wind by design.** Don't add it back without a hardware-tier-gated cycle.
- **Interaction is an oriented rounded-rectangle SDF** in the entity's local frame, not a world-axis ellipse. Each entity reports its facing; the shader rotates blade-to-entity delta into local coords. Body extents per entity: dog 1.6m × 0.6m × 1.4m falloff; sheep 0.6m × 0.5m × 0.9m falloff.

## Camera modes

Three camera modes share one controller: Classic (top-down isometric, world-axis WASD), Follow (close-up cinematic, smoothed dog-facing yaw drives camera), Free (yaw-orbit, user-controlled). Modes cycle via `C` hotkey or the in-game chip.

- **Classic stays world-axis** — camera-relative WASD would feel disorienting from above.
- **Follow `followAimYaw` is smoothed at τ=0.08s** for the look-ahead direction, separately from the camera's position lag (τ=0.35s). Raw `atan2(velocity)` jitters at refresh-rate against a smooth camera lag and reads as a wobble.
- **Camera Y is clamped above the max ridge along the camera→dog line** (sample 7 points, take the max + clearance). Catches the case where dog is on a peak and a hill between camera and dog occludes.
- **`speedNorm` is exponentially smoothed at τ=0.1s** before driving look-ahead distance, and `posK` is capped at 0.3 per frame so a single dropped frame can't lurch the camera.

## What NOT to refactor in render code

- **`OptimizedSheep.js`** — single InstancedMesh + custom shader + per-instance state machine. Cohesive by design; splitting would scatter coupling across files.
- **`GrassSystem.js`** — same pattern, same reasoning.
- **`main.js`'s per-frame update loop and mode dispatch.** Boot-sequence extraction is fair game; the loop is sequenced for a reason.
- **The `?cinematic=1` debug flag.** It's a long-standing carryover; its removal is a separate decision.

These are codified in [`DECISIONS.md`](../../DECISIONS.md). Override only with an explicit cohesion-vs-size tradeoff argument in the active cycle plan.
