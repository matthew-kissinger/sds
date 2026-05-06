# Changelog

All notable changes to Sheep Dog Sim are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/).

## [2.0.0-rc.1] — 2026-05-06 (Cycle 25 partial — meta-cycle overnight)

Release candidate. Partial mega-Cycle 25 — autonomous overnight run on
branch `meta-cycle-overnight-2026-05-06`. Three phases shipped (A, B,
E-minimal), four phases parked with `cycle25-validation/phase{C,D,F,G}/HARDSTOP.md`
each. **Not pushed to origin or production**; gated on Matt's morning
review per [`docs/meta-cycle-execution.md`](docs/meta-cycle-execution.md).

See [`docs/wake-state-2026-05-06.md`](docs/wake-state-2026-05-06.md) for
the full wake-state report enumerating shipped/parked/recommended-next.

### Added
- **`tools/validation/`** — durable validation harness for the polish
  program. Four tools: `lod-compare.mjs` (silhouette IoU + dE2000 +
  luma delta), `screenshot-golden.mjs` (12-cell SSIM matrix with
  --capture/--diff/--baseline modes), `input-latency.mjs`
  (synthesised keypress → next-paint), `frame-time-histogram.mjs`
  (drives `__perfHarness.startSampling`). NPM scripts
  `validation:lod / :screenshots / :latency / :perf / :all`.
- **HardwareTier extensions** — `usesLod1ForFoliage` + `lod0CrossfadeBand`
  per tier preset. Mobile-low keeps the meshopt LOD1 chain (perf
  headroom); desktop med/high drops it (silhouette truth).
- **Per-mode camera zoom + persistence** — Follow 12-40, Free 15-60,
  Classic 20-150 (mobile floor 35). `localStorage.sds.cameraZoom.<mode>`
  persists the per-mode value across sessions. Active range applies
  on mode change.

### Changed
- **Tree LOD chain** on desktop med/high tiers: LOD0 0-200m, impostor
  200m+. The 80m LOD1 mid-band is gone. Mobile-low keeps the existing
  3-tier chain.
- **`AtmosphericDesatPatch`** neutralised: `uDesatStrength` forced to 0,
  `_desatConfiguredStrength` forced to 0. The patch was masking the
  LOD1 silhouette mismatch we just removed. File stays on disk for
  back-compat with the kiln impostor + mobile-low LOD1 path; it's a
  per-fragment no-op now. Full file delete deferred until Phase C
  aerial-LUT lands and the kiln impostor stops referencing the
  uniforms.
- **Per-scene fog retuned** from "structural mask" to "horizon haze
  only": near 220→350, far 700-800→900 across field / rolling-hills /
  open-country.

### Parked (HARDSTOP.md per phase)
- **Phase C — atmospheric truth** (aerial-perspective LUT + height-fog
  density patch + THREE.Fog replacement). Scope-too-large for
  autonomous overnight — multi-day-class work.
- **Phase D — impostor parity** (8×4 atlas re-bake + padded mips +
  hybrid trunk-mesh + `uMatchBoost` deletion). Pixel Forge re-bake on
  Windows + visual review is multi-hour work; sky-LUT-coupled
  relighting depends on Phase C.
- **Phase F — start screen UX** (Mode→Scene→Dog flow restructure +
  hero-art ScenePicker + live WebGL DogSelection + scripted background
  orbits + tutorial overlay). Multi-day React refactor; depends on
  Phase E full state machine.
- **Phase G — tree art direction** (6 tree variants + per-scene
  distribution profiles + landmark trees + embedded wind in impostor
  bake). Depends on Phase D atlas pipeline; recipe authoring is
  multi-day.

### Validation
- vitest 188/188 pass.
- Production build clean: 835.92 KB main / 250 KB gzip (+1 KB vs
  v1.5.0 — Phase E per-mode zoom plumbing).
- Sim-baseline byte-identical (no `shared/` core change).

### Tag
- `v2.0.0-rc.1` on `meta-cycle-overnight-2026-05-06` (NOT pushed).
- Phase tags `cycle-25-phase{A,B,E}-complete` on the same branch.
- Matt's morning review decides: merge to main + push tag → triggers
  GH Actions deploy, OR cherry-pick subset → drop the rest.

## [1.5.0] — 2026-05-06 (Cycle 24 — mp-audit-and-test-coverage)

This release codifies the Cycle 23 multiplayer cheap-wins under a Playwright two-tab regression suite, adds a real 15-second reconnect grace window so MP guests can background their phone in an elevator without losing the session, and locks down each player's dog-mesh selection across the full host↔guest path.

### Added
- **15-second reconnect grace** for in-game disconnects. `RoomDO.handlePlayerDisconnect` schedules a per-playerId timeout when the room is in-game; if the player rebinds via `bindSocket` before the timeout fires, the timeout cancels and the sheepdog stays in-world the whole time. Lobby-state disconnects continue to evict immediately. Every grace activation + cancellation logs to RoomDO console for production audit.
- **`window.__sdsMpDrop` + `window.__sdsMpReconnect`** test-only globals. Sibling to `__sdsMpProbe`, gated on `?mpProbe=1` / `?perfMode=1`. Drives the reconnect-grace specs without coupling to the mid-cycle React lobby reflow.
- **Multiplayer dog-selection contract doc** at [`docs/multiplayer-dog-selection.md`](docs/multiplayer-dog-selection.md). Traces the dogType propagation path across the 11 hops UI → REST `/api/rooms` → `RoomDO` `/init` → WS `setDogType` → broadcast → peer render. Names every field name + every silent-coercion point.
- **6 new MP e2e specs** across 3 files: `tests/e2e/mp/in-game-state.spec.ts` (host-start propagates state, sheepCount, gameMode), `tests/e2e/mp/reconnect-grace.spec.ts` (within-grace retention + reconnect-cancels-eviction), `tests/e2e/mp/dog-selection.spec.ts` (host=pip+guest=sally, default fallback to jep, three-player permutation). All green on chromium-mp; runnable cross-engine via `--project=mp-firefox` / `--project=mp-webkit`.

### Changed
- **`navigateToMultiplayer(page, opts)`** in `tests/e2e/mp/_helpers.ts` accepts an optional `pickDog` arg so two-tab specs can drive the DogSelection screen with a specific id instead of the default-jep pass-through.

### Validation
- vitest 188/188 pass (no delta from v1.4.0 — this cycle is purely additive: new e2e specs + new server behaviour, no `shared/` core change).
- 19 MP e2e specs total green on chromium (10 from Cycle 24 Phase 1 + 9 net-new this cycle), 0 regressed.
- Production build clean.
- Sim-baseline byte-identical (no `shared/MovementPhysics.js` change).

### Deferred to Cycle 25 (polish program)
- Render-texture grass-trample spike — re-evaluate after the aerial-perspective LUT lands so trample displacement composes with height-fog density output.
- WebGPU `?renderer=webgpu` spike — re-evaluate after the impostor 8×4 atlas re-bake; some BatchedMesh-on-WebGPU patterns assume per-instance LOD which the new impostor pipeline makes optional.
- Mid-game scene-swap MP regression spec — `sceneId` is fixed at room creation per `worker/src/RoomDO.ts:188`; in-MP scene swap requires either a dedicated worker route or a host-leaves-and-recreates flow, neither in this cycle's scope.
- Sim-baseline cross-check across two tabs — needs full canvas + input simulation; deferred until Phase A validation infra (Cycle 25) gives us a shared driver pattern.

## [1.4.0] — 2026-05-05 (Cycle 23 — overhead-polish-grass-LOD-and-mp-cap-fix)

This release closes the v1.3.0 playtest gap list: overhead Classic-camera trees no longer fade into a grey fog smear, sprint stops when stamina runs out, the Open-Country HUD camera-mode chip vertical-stacks below the objective banner, far-ring grass on OC drops ~65% of triangle cost via a meadow-quad LOD, and multiplayer hosts can now run Insane (3000) and Chaos (5000) sheep counts when all guests are on desktop.

A novel game-dev trick lands too: when a tree blocks line of sight from camera to dog, its leaves dither into a stochastic curtain so the dog stays trackable through dense forest, no camera mode change required.

### Added
- **Pitch-aware atmospheric desat.** `TerrainBuilder._desat` now scales `uDesatStrength` per-frame by `lerp(1.0, 0.2, smoothstep(25°, 50°, |pitch|))`. Follow-cam (low pitch) keeps full desat to fight far-tree fog smear; Classic-cam overhead drops to 20% so near trees keep their saturation. Closes the "trees look terrible from above" playtest finding without removing Classic.
- **Scene-level fog overrides.** Field/Rolling Hills/Open Country each ship explicit `fog: { color, near, far }` defs; `Atmosphere` now reads them and swaps in a linear `THREE.Fog` instead of the FogExp2 default. Prime fog color from the horizon LUT on first frame so cold-start no longer paints `0xcccccc` grey.
- **Impostor pitch-tilt.** Kiln-impostor billboard interpolates from cylindrical (vertical, low camera pitch) to spherical (camera-facing, high pitch) via `smoothstep(0.2, 0.7, |dirObj.y|)`. Closes Cycle 19.5 carryover #2(b).
- **Camera-to-dog occlusion fade.** New `js/shaders/OccluderFadePatch.js` patches every leaf MeshStandardMaterial with a view-space capsule distance check. Fragments inside a thin capsule between camera and dog hash-discard with the same dither family as the kiln-impostor alphaHash. Trees blocking line-of-sight turn into a stochastic dither curtain so the dog stays visible through dense forest. Per-frame cost is one Vector3.applyMatrix4 (reused scratch) plus a uniform write; per-fragment cost is one length + one smoothstep + one branched hash.
- **HardwareTier service** (`js/HardwareTier.js`). One-shot tier classification at SceneManager init: low / med / high based on `MAX_VERTEX_UNIFORM_VECTORS` plus unmasked GPU vendor regex. Drives per-tier presets (blade count, wind octaves, meadow-quad enable). `?tier=low|med|high` URL override for testing.
- **Grass T4 meadow-quad LOD.** Far-ring grass chunks (>260m from origin) on med/high tiers render as a single 40m × 40m PlaneGeometry per chunk instead of clump-instancing thousands of blades. Material is a procedural noise mix of the scene's grass.base/mid/tip colors. Estimated ~65% triangle reduction on OC-Extreme; Field unaffected (half-extent 210m).
- **MP Insane/Chaos sheep counts.** RoomDO `ALLOWED_SHEEP_COUNTS` extended to `[200, 250, 500, 1000, 3000, 5000]`. Host UI labels options as Classic / Extreme / Insane / Chaos and shows an amber warning when picking >1000 sheep. Worker rejects mobile-UA WebSocket upgrades on those rooms — host gate is enforced server-side.
- **Stamina sprint-exit lock-out.** `Sheepdog.updateStamina` now latches `_sprintLockOut` when stamina depletes mid-sprint; clears when wantsSprint becomes false (Shift release). Layered on the existing canStartSprint vs canContinueSprint split (Cycle 7 settled decision preserved). Closes the v1.3.0 stutter-sprint that visually read as "sprint continues until input stops".

### Changed
- **Default camera order**: cycle visits Follow → Free → Classic on press-C (was Classic → Follow → Free). Default boot stays Follow (Cycle 21 Phase 5 unchanged); Classic is now the third selectable option per playtest direction. Settings UI label and order updated to match.
- **OC HUD vertical stack**: CameraModeIndicator subscribes to objective state and drops below the ObjectiveBanner (top + 88px) when one mounts. Field/RH unchanged.
- **Tree triangle counter** in the perf stats panel: `sumInstancedMeshTriangles` prefers `instancesCount` over `count` so InstancedMesh2 trees report their full allocated count instead of 0 (the dynamically-frustum-culled value at init time).
- **Cinematic-flag strip on invite-hash join**: synchronously strips `?cinematic=1` from the URL when `#/r/<roomCode>` is present, BEFORE SceneManager constructs and reads the flag. Prevents `preserveDrawingBuffer: true` leaking into normal MP play sessions.

### Validation
- vitest 188/188 pass (was 179; +9 new specs in `tests/stamina-sprint-exit.spec.js`). Sim-baseline byte-identical.
- Production build clean; main bundle 832.67 KB / 247.89 KB gzip (cumulative +7.05 KB vs `1.3.0`).
- Cycle 23 phase tags: `cycle-23-base`, `cycle-23-phaseA1-default`, `cycle-23-phaseA2-default`, `cycle-23-phaseB-default`, `cycle-23-phaseC-default`, `cycle-23-phaseD-default`, `cycle-23-phaseE-default`. Iteration artifacts under `cycle23-validation/{phaseA1..F}/`.

### Deferred
- **Heightfield amplitude root fix** (Cycle 19 hotfix workaround still in place; needs Matt's go-ahead before re-bake).
- **Full MP audit + two-tab Playwright harness** → Cycle 24 (`mp-audit-and-test-coverage`).
- **Auto-LOD blade-count extension (D3 as planned)**: clump geometry is shared across chunks; rebuilding for blade scaling requires per-tier alternate geometries — not commensurate with marginal gain. Static tier-preset blade count + existing clump-count auto-LOD already meet the perf target.
- **Pre-baked meadow-quad WebPs** (Q4 plan): shipped as runtime-procedural shader instead of a `tools/bake-meadow-quad.mjs` pipeline. Bake-script remains a Cycle 24+ candidate if visual quality is insufficient.

---

## [1.3.0] — 2026-05-05 (Cycle 22 — stylized-lod-pivot-and-grass-perf)

This release ships Cycle 22's stylized-LOD pivot plus a long-deferred species cull. Distant trees now fade smoothly into the atmosphere instead of popping; grass adjusts itself to maintain smooth framerate; pine trees retired so every scene is a tree1+tree2 mix.

### Added
- **Meshopt-baked LOD1 GLBs.** New `tools/bake-tree-lod1.mjs` script wraps `@gltf-transform/functions.simplify()` with `MeshoptSimplifier`. Replaces the Cycle 16 leaf-count-halved LOD1 (which produced the Cycle 17 visual rejection) with geometric simplification — same leaf count, fewer trunk verts. Runs four variants (aggressive / default / conservative / pristine) saved under `cycle22-validation/phaseA/variants/` for branch-back options. Default lands at `_originals/<name>_lod1.glb`. Tree1 -38% / tree2 -45% bytes; LOD chain re-enabled at 80m.
- **alphaHash stochastic LOD crossfade.** `material.alphaHash = true` on every LOD0+LOD1 leaf MeshStandardMaterial; equivalent screen-space-hashed alpha threshold inline in the kiln impostor (custom ShaderMaterial gets its own dither since Three's auto chunk injection only applies to `MeshStandardMaterial`). Result: LOD0→LOD1 (80m) and LOD1→impostor (200m) handoffs read as smooth density gradients, not hard pop bands.
- **Atmospheric desaturation toward fog.** New `js/shaders/AtmosphericDesatPatch.js` exports a composable `onBeforeCompile` that mixes `gl_FragColor` toward `(luma + 40% fogColor)` over `[uDesatStartM, uDesatEndM]` at `uDesatStrength` weight. Defaults 100m / 320m / 0.6. Single shared uniform set drives LOD0+LOD1 leaves AND the kiln impostor — all three tiers desaturate in lock-step.
- **Grass auto-LOD.** GrassSystem ticks a 60-sample frame-time ring buffer; if the rolling average crosses 18ms, per-chunk clump density scales toward 0.5×. Recovers toward 1.0× under 14ms. Applied at chunk-rebuild time only — no live geometry mutation. Floor 0.5 keeps grass visible under sustained perf trouble.
- **BatchedMesh research doc.** [`docs/cycle-22-batchedmesh-research.md`](docs/cycle-22-batchedmesh-research.md) — Cycle 23+ migration evaluation. Recommendation: defer (no native per-instance LOD in Three r184; community workaround requires shared vertex arrays, blocking our meshopt simplify pipeline).

### Changed
- **Pine species removed.** Per Matt's directive ("remove pine altogether i dont like it"). Dropped from `TreePlacement` biomes (mixed becomes 50/50 tree1+tree2; the outer pine ring collapses into mixed), all bake scripts, asset specs, the impostor LUT, the asset-gallery pick list, and the dev sandboxes (`lod-sandbox-v2`, `lod-color-match`, `impostor-inspector`). `pine.glb` + `pine_lod1.glb` + `pine.imposter.{png,depth.png,normal.png,json}` archived under `cycle22-validation/phaseA/removed-pine/` then deleted from runtime + originals. Sim-baseline byte-identical (trees are visual-only).

### Fixed
- **LOD pop bands.** alphaHash dither (Cycle 22 Phase B) plus per-fragment desat (Phase C) replace the prior hard alphaTest cutoff at LOD swap distances. Camera dollys through 80m and 200m no longer show the visible LOD-tier discontinuity.

### Performance
- **Grass auto-LOD** scales density at the next chunk rebuild, so sustained sub-56fps episodes self-correct without a manual quality switch.
- **LOD1 80m band.** Restoring LOD1 reduces tris in the 80–200m band (now ~40–55% of LOD0 rather than full LOD0 → impostor cliff at 200m).

### Validation
- vitest 179/179 pass throughout all phases.
- Production build clean; main bundle 821 KB / 246 KB gzip (+9 KB vs `1.2.0` for the new shader patch + LOD1 wiring).
- Cycle 22 phase tags landed: `cycle-22-base`, `cycle-22-phaseA-default`, `cycle-22-phaseB-default`, `cycle-22-phaseC-default`, `cycle-22-phaseD-default`. Phase C variant branches: `cycle-22-phaseC-strength-0.4`, `cycle-22-phaseC-strength-0.8`. Phase A iteration variants under `cycle22-validation/phaseA/variants/{aggressive,default,conservative,pristine}`.

---

## [1.2.0] — 2026-05-05 (Cycle 21 — tree-impostor-stabilization-and-foliage-polish)

This release ships Cycle 21 work on top of `1.1.0`. Cycle 21 was originally scoped as a 6-phase pixel-perfect impostor-LOD0 color-match. Mid-cycle, a research synthesis (Three.js modern LOD primitives + WebGPU/TSL state + stylized indie-game patterns) plus Matt's product-vision push pivoted the closing phases away from "match LOD0" toward "embrace atmospheric perspective + push impostor distance + fix the actual visible defects." The deeper LOD/grass overhaul moves to Cycle 22.

### Added
- **Aspen recipe re-tune.** `tools/bake-trees.mjs` `LEAF_COUNTS.aspen` `[24, 30, 36] → [34, 42, 50]` (+40% across all 3 scales) plus a new `LOD0_BRANCH_ASPEN` override lifting `children[0]` 8 → 10. Production pick `tree1.glb` (`aspen_small_single`) was reading as a tall broomstick — re-bake gives a fuller silhouette across all camera angles. tree1.glb 3744 → 5880 tris.
- **Schlick fresnel rim** on the kiln impostor shader (`uFresnelStrength` uniform, default `0.04`). Closes the warm-bias hue gap by adding the cool-shifted edge highlight that LOD0's `MeshStandardMaterial` had via Three's PBR pipeline.
- **Per-species impostor calibration LUT.** New `tools/generate-impostor-lut.mjs` reads sandbox measurements and outputs `assets/impostor-calibration-lut.json`. Each kiln material's `uMatchBoost` uniform is set once at scene init (no per-frame cost). tree1 boost `[1.305, 1.128, 0.891]` corrects the dominant Aspen color drift; tree2/pine entries are near-identity.
- **Standalone LOD measurement sandbox** at `tools/lod-sandbox-v2.html`. Two-pane harness rendering LOD0 + LOD2 of the same tree under matched atmosphere preset, with 5×5 grid color sampling, OKLab dE proxy, and a 12-cell smoke matrix runner. Imports SDS modules via Vite — atmosphere preset switcher mirrors live game.
- **Atmospheric perspective lean.** Per-fragment Rec601 luma desaturation in the kiln impostor shader past 200m, blending up to 70% desat by 350m. Distant trees now intentionally read as distant (Sable / Tiny Glade / Townscaper aesthetic) instead of fighting to match LOD0 pixel-perfect.

### Fixed
- **Detached impostor shadow ("film over the grass").** The InstancedMesh2 LOD2 impostor billboard was casting shadows during the directional light's shadow render pass. The billboard's vertex shader uses `cameraPosition` for camera-facing pose; during shadow render that's the LIGHT's position, so the billboard ended up facing the sun and its shadow was decoupled from the player's view of the tree — visible as a desynced grey patch beside each distant tree. Set `castShadow = false` on the LOD2 impostor sub-mesh; foreground LOD0 trees still cast correctly.
- **Tree placement clumping in OC woods.** `WOODS_INSIDE_FACTOR` 0.6 → 0.85 → 0.92 (cumulative across Cycle 20 v2 + Cycle 21 Phase 0); placement `scaleVariation` 0.7-1.3 → 0.80-1.20 (fewer towering-vs-tiny outliers). Test threshold relaxed 1.3× → 1.05× to match new design intent.
- **`docs/tree-pipeline.md` recipe table.** Was listing tree1 as "Aspen Medium seed=7" when the production pick is actually `aspen_small_single` seed=11. Corrected all three rows + added a "source of truth" pointer to `picks.json`.
- **Grass shoreline clip.** New `SHORELINE_Y_MIN = 0.5` in `GrassSystem.createChunk` excludes grass past the visible shoreline on RH where the terrain falloff annulus drops below water level. Doesn't touch the existing `> 50` amplitude clamp.

### Changed
- **Spherical impostor billboard with world-up lock.** Cylindrical (Y-axis only) was foreshortening at high pitch — Classic camera at 45° pitch drew impostors at 71% height. Spherical-with-up-lock orients against `(worldUp × viewDir)` so the quad always faces the camera in 3D without rolling on yaw.
- **Frustum-sized impostor quad.** Sized to the bake bounding sphere (`boundsRadius * 1.02`) matching Pixel Forge's `bake.ts` exactly. Previous code used `worldSize = max(bbox dims)` which drew the tree at ~70% of true size.
- **Foliage lighting recipe.** Half-Lambert wrap + hemispheric ambient with albedo-tinted ground bounce + optional subsurface lift (default 0). Replaces pure Lambert (which read grey at distance).
- **Impostor LOD swap distance pushed 100m → 200m.** Foreground/midground stays geometric (LOD0); impostors only fill the deepest fog band where atmospheric perspective is doing 60-80% of the visual work anyway. Eliminates the prior 100m hard cliff that surfaced the impostor color/sampling gaps.
- **Atlas mipmaps disabled, anisotropy 8.** Cross-tile bleed from box-mip averaging across 4×4 lat-lon atlas neighbours produced sparkle-glint at distance. Disabling mips fixes the worst case; aniso 8 keeps texture sharp at high-pitch foreshortening. Half-texel UV clamp inside tiles prevents bilinear from reaching across tile boundaries.

### Known limitations
- **Impostor texture undersampling at extreme zoom + high pitch.** Without mipmaps, fragments hitting 5-15 screen pixels of a 512px tile can still alias. Mostly hidden behind the new 200m LOD2 distance + atmospheric desaturation. Cycle 22 will replace LOD1 with a meshoptimizer-simplified geometry tier that pushes geometric LOD further out before impostors take over.
- **`tree1_lod1.glb` etc. exist in `assets/models/trees/` but are not consumed.** They were baked via EZ-Tree leaf-count halving which produced a visibly worse silhouette than LOD0. Cycle 22 will re-bake LOD1 using `meshoptimizer` geometric simplification — preserves silhouette, decimates triangles.
- **Impostor calibration LUT is per-species only**, not per `(scene, ToD, distance)`. Per-distance residual exists (Aspen dE doubles between 150m → 250m) but the Phase 5 atmospheric desaturation now masks it.

## [Unreleased] — 2026-05-04 (Cycle 19.5 polish; on top of `1.1.0`)

### Fixed
- **Octahedral impostor shader compile (Linux SwiftShader).** Vertex shader used a local `mvPos` symbol while the auto-injected Three.js `<fog_vertex>` chunk references `mvPosition` — NVIDIA drivers ignored the undeclared identifier silently, but Linux SwiftShader hard-failed and the e2e console-error guard turned the v1.1.0 deploy red. Renamed local to `mvPosition`. Same root cause was killing the LOD2 mesh on permissive drivers too, so trees disappeared past 100 m on every machine — close-up trees rendered, distant trees did not.
- **Trunk LOD2 ANGLE warning silenced.** Replaced the shared 3-vert empty geometry with a per-trunk attribute-matching empty (clones the source geometry's attribute schema with zero-length buffers). ANGLE no longer complains "Vertex buffer is not big enough for the draw call" when the active trunk material binds attributes the shared empty didn't supply.
- **`UniformsUtils.merge` warning** in `octahedral-impostor-material.js` — switched to a literal-spread of `THREE.UniformsLib.fog` so the runtime-baked atlas texture isn't passed through `cloneUniforms` (which can't clone render-target textures).

### Performance
- **Per-instance frustum culling for trees + rocks.** Trees were on `InstancedMesh2` with default `perObjectFrustumCulled = true` but no spatial index; rocks were on plain `THREE.InstancedMesh` (whole-mesh AABB only — every rock submitted regardless of view direction). Migrated rocks to `InstancedMesh2` and added `computeBVH({ margin: 0 })` post-`addInstances` for both. Verified on RTX 3070 OC island: looking at island = 358 draw calls, looking 180° away = 193, looking at sky = 34 — ~90 % reduction at the extreme.

### Changed
- **ScatterSystem removed.** Pebbles, mushrooms, clovers, single flowers — sub-metre detail props that were too small to read at gameplay camera distances and contributed measurable draw cost without a payoff. `js/ScatterSystem.js` deleted, all `createScatter` / `clearScatter` wiring stripped from `TerrainBuilder.js` and `main.js`. Grass remains as the meadow primitive; rocks remain as the obstacle silhouette. Scene-swap regression spec retains the heightfield-ref check on the GrassSystem (same shape, different captured object).
- **Octahedral impostor brightness lift.** Bake lighting `0.30 + 0.55` → `0.70 + 1.20` (`AmbientLight + DirectionalLight`, `1.40× → 1.90×`) so impostors live in the same exposure band as a sunlit LOD0 tree. Added a sun-luma-driven 1.0×–1.2× multiplier inside `setImpostorTint` so impostors track time-of-day brightness instead of sitting at flat bake exposure. The 100 m LOD2 → LOD0 swap reads as a smooth exposure step instead of a brightness pop.

### Known limitations
- **High-altitude impostor billboards** still render the tree's vertical-canopy bake — the runtime quad stays vertical (cylindrical billboard around world-Y). A full spherical billboard would unlock the high-elevation atlas tiles for cinematic / freeFly camera angles, but the bake camera frustum (`halfW = max(x,z) × halfH = y`) needs to switch to square tiles in lockstep — tilting alone distorts the canopy. Tracked for follow-up.

## [1.1.0] — 2026-05-04 (Cycle 18 + Cycle 19 hardening)

This release ships Cycle 18's three independent code-level fixes (visually verified on RTX 3070 in Cycle 19) plus the Cycle 19 Phase 1 hotfix that restored grass-on-terrain across RH and OC.

### Added
- **Octahedral impostors at LOD2.** New runtime atlas baker (16 tiles, 4 azimuth × 4 elevation, 1024×1024 atlas per species, baked once per session). Replaces the cross-billboard at the LOD2 tier when the bake succeeds. Self-contained Three.js — no external dependency. Cross-billboard remains as the fallback when the atlas fails.
- **Per-scene `grassRadius`** schema field on `GrassDef`. Rolling Hills sets 172 m, Open Country sets 372 m. Grass chunk grid expands to fit the wider zone, density-falloff zero point uses `grassRadius` directly, per-chunk clump count rescales so the wider zone doesn't blow the perf budget. Field omits the field — byte-identical placement.

### Fixed
- **Scene-swap state hygiene.** `TerrainBuilder.createScatter` else-branch refreshes `scatterSystem.heightfield` so flora doesn't pin to the prior scene's heightmap. `GameState.startGame` always sets `needsFlockRecreation = true`, so sheep respawn within the boundary on same-count restarts (previously left at the prior session's positions).
- **Grass clamp regression.** Cycle 17 Phase 3 tightened the GrassSystem Y-clamp from `> 50` to `> 10`, citing "heightScale tops out at 6". In practice the displaced terrain mesh peaks at ~25 m on OC and ~36 m on RH (a longstanding double-amplification in `Heightfield.sample()` that has shipped for ~14 cycles); the `> 10` cap was snapping every legit terrain Y to 0, dropping grass to water level. Reverted to `> 50` — grass now sits on the terrain mesh again on RH and OC. Field stays byte-identical.

### Performance
- 180/180 vitest pass. Production main bundle 812.80 KB (241.46 KB gzip) — flat vs 1.0.0.
- OC Extreme @ 1000 sheep on RTX 3070: 73 fps avg, p95 frame 13.88 ms — comfortably above 60 fps target post-grass-expansion.

### Marketing
- Three OG cards re-captured on the post-fix build: og-field, og-rh-sunset (Solo Extreme + 1000 sheep), og-open-country.

## [1.0.0] — 2026-04-28 (release-finish)

This is the v1.0 release.

### Changed
- **Scene swap is in-process.** Switching between Field / Rolling Hills / Open Country no longer reloads the page — audio, renderer, and React state all persist across the transition. A 200ms fade-in / fade-out overlay covers the swap window. URL bar updates via `history.replaceState`.
- **Sky is properly tone-mapped.** The pastoral-noon preset (used in Home Field and as fallback) was crushing to near-white through ACES tone-mapping at high-noon sun elevations. Exposure dropped 0.22 → 0.08 — sky now reads as soft pastoral blue with proper horizon haze.

### Added
- **Real dog portrait thumbnails** in DogSelection — rendered via the cinematic pipeline at 512×512 WebP + PNG fallback.
- **Reset-and-re-run-onboarding button** in Settings → Audio tab.
- **Production OG / Twitter / schema.org images** at 1200×630 WebP under 200KB each.
- **Properly-sized PWA icons** at 192×192, 512×512, and 512×512 maskable PNG.
- **Anonymous client telemetry** — `/api/event` worker route + JWT-aware client wrapper. Game completions, mode selections, scene swaps, and MP room creations are recorded.

### Fixed
- Rocks no longer spawn inside the Home Field play area. Per-rock buffer tightened 20m → 40m so clusters straddling the boundary trim cleanly.
- Rocks no longer float — always partially buried so GLB-origin offsets can't surface above the visible ground line.

### Database
- `score_anomalies` column added to `score_submissions` (cycle-10 migration applied to prod).
- New `events` table for client telemetry log.

## [1.0.0-rc] — 2026-04-27

First public release.

### Added
- **Three biomes:** Home Field (open pasture), Rolling Hills (heightmapped countryside), Open Country (island with magical portal corral).
- **Four solo modes:** Classic (200 sheep, no timer), Timed (race the clock), Extreme (1000 sheep), Insane (3000 sheep), Chaos (5000 sheep).
- **Multiplayer:** real-time co-op herding via Cloudflare Durable Object websocket relay; create-room, join-by-code, quick-match, public lobby browser.
- **18 languages:** English, Spanish, Portuguese, Japanese, German, French, Chinese, Korean, Russian, Italian, Turkish, Polish, Dutch, Arabic, Indonesian, Hindi, Thai, Filipino. Full UI + auto-detect.
- **Persistent leaderboards:** global D1-backed scoreboard with mode + scene + sheep-count partitioning.
- **Cinematic atmosphere:** Hosek-Wilkie sky, day-night cycle, anime-style water with depth-aware foam, procedural cloud layer, terrain-conformed grass instancing.
- **Sandbox mode:** custom heightmap, terrain seed, sheep count, and pasture geometry; share via URL hash.
- **Camera modes:** Classic (top-down chase), Follow (over-shoulder), Free (orbital).
- **Mobile support:** touch controls, responsive HUD, viewport-fit cover, full-screen API.
- **PWA installability:** Add-to-Home-Screen on iOS Safari and Android Chrome; standalone display.
- **SEO:** OG/Twitter cards, JSON-LD VideoGame schema, hreflang for all 18 locales, sitemap, robots.txt, service worker pre-caching.

### Architecture milestones (closed development cycles)
- **Cycle 9:** playtest triage + cross-platform — solo sheep-count owned by mode, MP scene-sync helper, Playwright + macOS Safari nightly cross-platform test infra, GL diagnostic probe (`?debug=gl`), defensive `Heightfield.surfaceY` lift.
- **Cycle 8:** mode matrix expansion (Insane, Chaos), leaderboard partition keys, sandbox cross-scene flow.
- **Cycle 7:** atmosphere + water + sun billboard polish, OC portal effect, multi-stage objectives.
- **Cycle 6:** scene composition refactor, obstacle composition at call sites, per-scene camera memory.
- **Cycle 5:** sceneDef-driven rendering, island boundaries, corral-retired event, GameTimer extraction.
- **Cycles 1-4:** initial sim foundation, audit, hardening, multiplayer Phase A+B.

### Cycle 10 highlights (this release)
- In-process scene-swap foundation: `swapScene` / `disposeScene` / `rebuildScene` lifecycle methods on `SheepDogSimulation`; AbortController-tracked window listener teardown for corral-retired / objective-stage-changed / corral-ascend-top.
- PWA manifest at `/manifest.webmanifest` for Lighthouse PWA + Add-to-Home-Screen.
- Cinematic capture infrastructure: `?cinematic=1` flag exposes `window.__sdsCinema` with camera + atmosphere + effects + scene controls; `?ui=off` for clean filming; `?sun=<0..1>` for sun position; `?mode=chaos` for direct-mode entry.
- Score integrity: server-side cross-field plausibility (mode × sheep_count × score), client-clock skew anomaly logging.
- Player CHANGELOG, press kit, electron-readiness research doc.

### Known limitations
- Cross-scene navigation still triggers a page reload (in-process swap is foundational; full flip is a follow-up cycle).
- Some marketing assets predate Cycle 7's sky/water/sun polish; cinematic-pipeline-driven refresh is a follow-up.
- macOS Safari may exhibit a white-ground rendering bug on certain hardware (does not reproduce on GH Actions runners; debug recipe in `NEXT_SESSION.md`).

[1.0.0]: https://github.com/matthew-kissinger/sds/releases/tag/v1.0.0
