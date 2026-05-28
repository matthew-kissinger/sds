# SDS · Locked Decisions

> Created during Track A of the agent development cycle (2026-04-23). These decisions were made with the human during the initial planning session and are treated as constraints by all subsequent agents. Do not re-litigate.

---

1. **Backend migrates to Cloudflare Workers + Durable Objects + WebSockets.** SpacetimeDB was considered and deferred. Geckos/WebRTC and the droplet go away in Track C/G.
2. **Frontend moves to Cloudflare Pages.** GitHub Pages retires in Track F.
3. **Leaderboard moves to Cloudflare D1.** Not DO storage, not external SQLite. The 207-player SQLite dataset on the droplet gets migrated.
4. **Tick rate drops from 60Hz to 20Hz** server-side once on DO. Clients interpolate.
5. **Wire protocol becomes MessagePack over WebSocket** with delta-encoded sheep state. JSON-everywhere is out.
6. **Auth:** persistent_id (localStorage) + Worker-issued short-lived signed token. Signed with `JWT_SECRET` Workers secret.
7. **Lobby UX:** shareable invite URLs, public lobby list, host-starts, host-migration on disconnect, game-mode cycling in public rooms.
8. **Drop `framer-motion` and `stats.js`** - unused. Node engines pin to `>=22.0.0`.
9. **SpacetimeDB - not now.** Revisit for a future persistent-world project.
10. **Keep the droplet running in parallel for 30 days after DO cutover** as rollback. Track G destroys it.

---

## Track F - CF Pages Setup (2026-04-23)

Cloudflare Pages project `sds-frontend` created with production branch `main`. GitHub Actions workflows added: `deploy.yml` (auto-deploy on push to main via `cloudflare/pages-action@v1`) and `build-itchio.yml` (manual or tag-triggered itch.io zip builds). CF Pages `_redirects` (SPA fallback) and `_headers` (security headers) added to `public/`. DNS cutover and CNAME removal deferred to Track G after CF Pages is verified live.

**Revert procedure (14-day safety window):** Re-enable GitHub Pages in repo Settings > Pages, point source back to `gh-pages` branch or `main`/`docs` folder, update Cloudflare DNS to point `sheepdogsim.com` CNAME back to `matthew-kissinger.github.io`. The CNAME file remains in repo root until Track G.

---

## Track C4 - Cutover - 2026-04-23 (ROLLED BACK SAME DAY)

Worker was deployed to `sheepdogsim.com/api/*` and `/r/*`, D1 had 207 players migrated, CF Pages was serving frontend on `sheepdogsim.com` as a custom domain.

**Rollback executed 2026-04-23:** Opus 4.7 audit found 7+ launch-blocking bugs (see `docs/archive/cycle-1-audit.md` and `docs/archive/POSTMORTEM.md`). The multiplayer happy path was non-functional (missing `/api/rooms` endpoint, no `players` table insert on register, no materialized-best update on score). Production was returned to Geckos/droplet within the hour.

**Artifacts scrubbed:**
- CNAME reverted to `matthew-kissinger.github.io`
- CF Pages `sds-frontend` project deleted
- Worker `sds-worker` deleted (routes removed automatically)
- D1 database `sds-db` deleted
- Agent API token revoked
- GitHub repo secrets `CF_API_TOKEN`, `CF_ACCOUNT_ID` removed
- `worker/`, `.env.production`, `public/_redirects`, `public/_headers`, both workflows deleted
- `@msgpack/msgpack` dep removed
- `NetworkManager.js`, `README.md`, `ARCHITECTURE.md` reverted to pre-cycle state

**Decisions 1-5 above remain intact** as intent for the next attempt. Decision 10 (30-day droplet parallel) was never triggered because cutover was reverted. Track F's 14-day safety window also moot.

**For the next cycle:** read `docs/archive/POSTMORTEM.md` first. Do not start writing code until you can answer "how will I playtest this" concretely.

---

## Cycle 2 — CF backend shipped (2026-04-23, overnight)

The migration from Geckos.io + DigitalOcean to Cloudflare Workers + Durable Objects + D1 + Pages shipped and is live. DNS cutover completed 2026-04-24: `sheepdogsim.com` now CNAMEs at `sds-frontend.pages.dev`; the legacy `api.sheepdogsim.com` record was removed in the same operation. The DigitalOcean droplet ran in parallel for ~1 day as rollback safety, then was destroyed 2026-04-25 (soak shortened from 1 week — CF stack was stable). `server/`, `DROPLET_DEPLOYMENT.md`, and the `server:*` npm scripts were removed in the same housekeeping pass.

Full closeout: [docs/cycle-2-report.md](docs/cycle-2-report.md).

**Deviations from the Cycle 2 plan documented in `docs/archive/c-retry/`:**

- **Tick rate:** Decision 4 in the original list called for 20 Hz on DO. We kept 60 Hz at the user's instruction — the 20 Hz rubber-banding was one of the Cycle 1 regressions the 7-day soak was meant to catch, and running 60 Hz inside an active DO is a known-good pattern. Reopen the 20 Hz question only if DO CPU cost becomes a real constraint.
- **Identity handshake:** `protocol-v2.md` Section 5 proposed a post-upgrade `hello` message. We kept identity on the WS URL (`?playerId=<sessionId>`) because the REST join has already stored the session in the DO, so the WS upgrade is a lookup, not a credential handshake. Simpler and one round-trip faster. `authority.md` §1 called this out as the contract-doc-vs-protocol-doc tension; this is the resolution.
- **Staging subdomain:** dropped. The Cycle 1 postmortem's 7-day-soak, mandatory-gate process ceremony was retired for this cycle per the `docs/archive/NEXT_SESSION.md` directive. Ship to prod, find bugs there, fix them.
- **`sheepRetired` is always emitted.** We kept the droplet's behavior: `sheepRetired` is a top-level field on every state broadcast in every mode (not just coop). The client reads it in the HUD regardless.
- **Route bindings deferred:** `wrangler.toml` does not currently declare routes for `sheepdogsim.com/api/*` or `/r/*` — the frontend hits the `workers.dev` hostname directly. The route binding is part of the DNS cutover, not a prereq for the new stack working.

**Follow-ups that stayed on the list:**

- GitHub Actions workflow for auto-deploy (Pages + Worker) — not re-added this cycle.
- ~~207-row leaderboard migration from droplet SQLite to D1.~~ Moot — droplet destroyed 2026-04-25 without a final dump; leaderboard rebuilt organically.
- Switching the worker to the Hibernation WebSocket API — deferred until idle-room cost matters.
- ~~Droplet destroy once the soak window closes (~1 week).~~ Done 2026-04-25, soak shortened from 1 week.

**Decisions 1-5 from the top of this file remain in force** as the direction. Decision 10 (30-day parallel droplet) was further relaxed in execution: actual soak was ~1 day (destroyed 2026-04-25).

---

## Cycle 3 — Cleanup + Scene-as-data + minimal Track 2 (2026-04-24)

Structural foundation for content expansion. Full closeout: [docs/cycle-3-plan.md](docs/cycle-3-plan.md) § Progress log.

**What shipped:**

- **Track 1 — Cleanup.** Deleted dead code (`StaminaUI`, `ExtremeBoid`, `js/styles/`, 13 of 18 runtime locales). Renamed misnamed controllers (`StartScreen` → `MenuController`, `MultiplayerUI` → `MultiplayerState`; the latter also trimmed 501 → 95 lines by removing DOM-write paths that targeted hidden elements). Replaced HUD polling (`setInterval(16)`) with a frame-event bus on `GameBridge`. Local-dev DX: `npm run dev` runs Vite + wrangler concurrently, `dev:setup` applies D1 migrations, invite URLs use `location.origin`, `.dev.vars.example` committed. Polish: dead-DOM references removed, `GameBridge.js` compressed 310 → 86 lines.
- **Track 3 — Scenes as data.** `shared/scenes/{types,field,index,rolling-hills}.js` — JSDoc-typed `SceneDef`, registry with `loadScene` / `listScenes` / `DEFAULT_SCENE_ID`. Sim (`shared/index.js createGameState`, `worker/src/GameSim.js`) and client renderer (`TerrainBuilder`, `GrassSystem`) both consume scene data. Second scene (Rolling Hills) registered; today it's a sim-differentiated variant (250 sheep, scattered spawn) — visual differentiation lands when `TerrainBuilder` consumes `terrain.heightScale` / `grass.colors` / `props[]`. `?scene=<id>` URL param for pre-UI switching. Extension guide: [docs/adding-a-biome.md](docs/adding-a-biome.md).
- **Track 2 (stepping stone).** `ScenePicker` tile strip above `ModeSelection` surfaces the scene registry to players. Full scene-first state-machine restructure, mode-shaped HUD profiles, onboarding, compass locator, and real dog PNG thumbnails are deferred to a dedicated UI session.

**Decisions recorded:**

- **Game identity: mode-shaped.** Classic = zen register (no timer, soft stamina, ambient copy). Timed/Racing = arcade register (prominent timer, scoreboard, celebrations). Sandbox = playground register (tools, no score). Menu shell stays tonally neutral. Detail: [docs/cycle-3-ui-ux.md](docs/cycle-3-ui-ux.md) § Vision.
- **Default scene naming: `field` / "Home Field", not "valley".** The current scene is a flat fenced play area with mountain props ringing the perimeter — not a true valley. User correction mid-cycle; docs and code aligned.
- **Scene format: `.js` + JSDoc, not `.ts`.** `shared/` is consumed by three contexts (Vite, wrangler/esbuild, Node tests); `.js` needs zero new build plumbing, JSDoc gives IDE types. Reverts to `.ts` trivially if strict type-checking becomes valuable later; the other direction is worse.

**Known open questions** (not blockers for content work):

- Client `FieldConfig` / `SandboxConfig` vs `SceneDef` harmonization. Today solo/sandbox use client-side field configs orthogonal to the scene registry; the scene picker UI for MP is straightforward, but deciding how solo "picks a scene" vs "picks a field shape" needs a call.
- MP joiner renderer sync: host's picked `sceneId` flows to Worker sim end-to-end (shipped post-initial-push 2026-04-24), but each client still renders its own URL-param scene. Joining a room whose host picked a different scene gives correct sim but mismatched visuals. Fix lands with Track 2 (either a pre-join redirect or runtime scene reactivity).
- Client `ExtremeBoidSystem` vs shared `FlockingAlgorithms` consolidation — deferred per user ("not sure what is best solution"). The drift is real; a cross-check of runtime behavior is prerequisite.

---

## Cycle 4 — Foundation for biome variety + pastoral aesthetic + user camera (2026-04-24)

Cycle 3 made biomes a data change but left them visually identical (Rolling Hills shipped with `heightScale: 0`). Cycle 4 builds the foundation needed to make biomes actually look different — heightfield terrain, an analytic sky, real grass color variance — and introduces a user-controlled camera so the dog can be framed cinematically. Full plan: [`docs/cycle-4-plan.md`](docs/cycle-4-plan.md). Sequential follow-up: [`docs/cycle-4-phase-b.md`](docs/cycle-4-phase-b.md).

**Decisions recorded:**

- **Phase A vs Phase B split.** Phase A shipped 11 parallel units (standalone modules, asset pipeline, schema, polish, camera). Phase B is one sequential PR by the user that wires those modules into the render path (TerrainBuilder displacement, GrassSystem y-sample, Sheep/Sheepdog y-clamp, Atmosphere wiring, ProceduralMountains wiring, slope-modulated sheep speed, prop placement on terrain, camera y-clamp). The split exists because every Phase B item touches the y-axis and shares a regression surface — running them in parallel would force constant rebases against the very files Phase A's M/H/I just rewrote, and a single bad Heightfield sample would surface as "dog floats, sheep sink, grass clips" simultaneously across three worktrees. Sequencing it as one PR keeps the verification loop tight.
- **Heightmap baked, not runtime-generated.** The rolling-hills and open-country heightmaps are 1024×1024 R32F floats baked once by `scripts/bake-heightmap.mjs` and shipped as static assets in `public/terrain/`. Runtime fBm in a Worker would cost ~30ms of CPU per scene-load on the Worker hot path, which is unacceptable when the same biome is loaded thousands of times across rooms. Baking once at build time is free per-load. The 4MB asset cost is acceptable (CF Pages caches it). Re-bake by editing the script and re-running; manifest carries a `version` field so consumers can detect staleness.
- **Hosek-Wilkie ported from Terror in the Jungle.** The sibling repo on Three.js 0.184 already had a working Hosek-Wilkie analytic sky shader, scenario preset table, and weather-modulated fog. Porting it (TS → JS + JSDoc, GLSL is verbatim) saved an estimated 2-3 days of shader debugging vs. building from scratch. The port lives in `js/atmosphere/`. Trade-off accepted: we now carry a small dependency on the sibling repo's preset format; if Terror evolves the format, we either re-port or fork. Acceptable because the sky math is well-understood and the preset enum is stable.
- **Camera modes: Classic preserved as default.** The current isometric (distance 80, height 60, no rotation) is the established UX; returning players should not see a different game on first load. Cycle 4 adds Follow (close-up cinematic) and Free (yaw-orbit) as opt-in modes, cycled with the `C` hotkey or the settings panel. Snap freeYaw to Follow yaw on mode switch so there's no jump-cut. Future cycles may revisit the default (the new camera framing makes the dog read as "the player character" much more strongly), but not this cycle.
- **Three.js bumped to 0.184.** Low-risk migration. 0.181 → 0.184 has no breaking API changes that affect this codebase (verified by build + test). The bump aligns us with the sibling repo's Atmosphere port (which was authored against 0.184) and unlocks any 0.182/0.183/0.184 fixes for free. Future-bumps remain incremental and routine.

---

## Cycle 4 Hardening — post-Phase-B fixes (2026-04-25)

After Phase B merged, the first playtest exposed a chain of bugs that all traced back to the same root cause: the rendered terrain mesh (64×64 segments over 1000 m) was much coarser than the heightfield it was supposed to render (1024² over 400 m), so anything sampling the heightfield (sheep, grass, trees, fences, dog, camera) ended up displaced by up to ~0.6 m relative to the visible ground. Plus several scene-shape mistakes the playtest surfaced. Live punch list: [`docs/cycle-4-hardening.md`](docs/cycle-4-hardening.md).

**Decisions recorded:**

- **Terrain plane subdivision: 256×256 desktop / 128×128 mobile** (was 64×64). At ~3.9 m / quad on desktop the rendered surface is fine enough that entities sampling the heightfield end up at the visible ground rather than ±0.6 m off. Cost is ~131 K triangles desktop / ~33 K mobile — same order as the sheep instancing total; verified clean on `npm run build`. Alternatives considered: have entities sample at the same low-res as the mesh (rejected — every consumer would need its own bilinear interpolant against a sparse grid; this move keeps the heightfield as the single source of truth). Or use displacement-map textures (rejected for now — limited material support without a custom shader).
- **Procedural mountains: removed.** The `js/ProceduralMountains.js` annulus is a flat ring shader-displaced upward only — no closed bottom, sky-gaps between peaks, no relationship to the heightfield underneath. `addMountains()` is now a no-op. The class is left on disk; revisit when we want a real horizon ring (the correct shape is a height-displaced skirt that the play-area heightfield blends into, not an annulus). Backdrop framing now comes from atmosphere/sky on each scene.
- **`perimeterFence` flag on the scene def, with a `buildGateAndPenOnly` builder path.** Open Country always claimed "no perimeter fence" in its description but the code unconditionally built one. Adding a scene-level flag is cleaner than a scene-id branch in `StructureBuilder` because it keeps the construction logic data-driven (any future scene can opt out). The fenceless path still surfaces the gate + pen to terrain via the same `_surfaceToTerrain` post-process.
- **Surface-to-terrain via `userData.surfaceToTerrain` tags.** New `_surfaceToTerrain(group)` walks the structure tree, samples the heightfield at each tagged node's world (x,z), and offsets `position.y`. Tags are placed in `FencePresets` per construction site (post, rail, gate group, threshold, edge, corner flag). Per-piece tagging on posts/rails so they each ride hills independently; gate-group-as-a-unit so the two gate posts + arch + threshold stay coplanar on slopes. Considered: passing the heightfield through `FencePresets.create*` constructors. Rejected because it threads heightfield into 6+ functions whose other call sites (sandbox builder, polygon builder) don't have a heightfield. Post-process-with-tags is opt-in, idempotent, and confined to one helper.
- **Follow camera now camera-relative for WASD.** Same input-rotation pattern as Free mode but uses `followYaw` (smoothed dog facing = camera look direction) instead of user-controlled `freeYaw`. W is "forward in the direction the camera is facing" in both modes. Classic stays world-axis (top-down isometric — camera-relative would feel disorienting from above).
- **Camera ridge-clearance clamp via `_sampleMaxTerrainAlong`.** Sample 7 points along the camera→dog line, clamp camera Y above the max ridge + clearance. Catches the case where dog is on a peak and a hill between camera and dog occludes the dog. Added to both Follow and Free; Classic doesn't need it (60 m height is well above any 6 m hill). Cheap (7 bilinear samples per frame per active mode).
- **Grass LOD thresholds pushed past Follow visible radius.** Was 40 m / 80 m; bumped to 90 m / 160 m mid-hardening, then to 140 m / 220 m (hysteresis 12 m) when a per-blade height-fade attempt killed foreground grass and was reverted. Follow camera at FOLLOW_DISTANCE=22, FOLLOW_HEIGHT=11 sees ~50–60 m; pushing to 140 m keeps the count snap fully outside the visible band on flat scenes too. Hard cutoff retained; revisit only if it pops at scene transitions.

### Second batch of hardening (2026-04-25, post-compaction)

- **Open Country pen front fence flanks the gate.** When `perimeterFence: false`, the pen previously had only a gate on its front side — the rest of the pen-width was open air, and sheep walked around. `buildGateAndPenOnly` now adds two short border segments flanking the gate so the pen is closed on all four sides. Reuses `createBorderSegment` with the `_surfaceToTerrain` post-process.
- **Tree + farmhouse y-offset compensation via baked transforms.** GLB origin conventions vary by artist (trunk-base, trunk-mid, canopy-center). At load time, child mesh transforms are baked into geometries (so InstancedMesh-per-child correctly represents nested layouts), then `bbox.min.y` is stored on the model. At placement, `placementY = terrainY + (-bboxMinY) * scale` lifts the visible base to terrain regardless of origin. This replaces an earlier attempt that used `Box3.setFromObject` on the un-baked tree, which gave wrong offsets when InstancedMesh dropped child transforms. The same pattern applies to the farmhouse (no instancing, single root clone).
- **Far-tree LOD via 3-quad impostors past 250 m.** Trees beyond 250 m render as three textured quads at 60° apart (vs. the 2-quad cross which read as edge-on at 45° angles). Each tree GLB is rendered to a 512² RenderTarget once via an offscreen ortho camera with transparent background; `MeshBasicMaterial { map, alphaTest: 0.4, transparent }`. ~99% triangle reduction in the farField + horizon zones (~3000 distant trees → ~36 K → ~36 K → trivial). Octahedral impostors (8×8 atlas + view-direction shader) remain the right v2 if 3-quad billboards feel cheap; they'd add ~6-8 hr of work + a build-time bake step.
- **Terrain plane: 2400 m desktop / 1600 m mobile.** Mountains were removed in the first hardening batch; without a horizon ring the previous 1000 m plane just ended in fog with a visible edge. Bumped to 2400 m × 384 segments desktop (~6.25 m / quad, ~295 K tris) and 1600 m × 192 segments mobile (~8.3 m / quad). Heightfield content fades to 0 over the last 20 m of its `worldSize` so the play-area "island" blends smoothly into the flat skirt — no plateau at the edge texel value.
- **Terrain fog: warm-grey-green, pushed further out.** Was sky-blue (`0x87CEEB`) at 200/600; now `0xa9b8a8` at 350/1100. With the bigger plane visible, the strong blue fog made the field read as "field floating in sky" — the horizontal green-to-blue gradient was unmistakable mid-frame. Warm-grey-green at greater distance keeps foreground terrain its true colour while still dissolving distant edges into atmosphere.
- **Sheep + dog tilt on slopes via `heightfield.normal`.** Both compute pitch (forward slope projection) + roll (sideways slope projection), clamped to ~22° (dog) / ~18° (sheep). Mesh `rotation.order = 'YXZ'` so yaw applies first then pitch + roll around the entity's local axes. The dog smooth-lerps toward target tilt at ~6 Hz; sheep snap (each frame is stateless across the sheep array, no per-instance interpolation state worth keeping).
- **Fence rails span terrain slope.** New `_slopeRailToTerrain` in `StructureBuilder` reads `userData.railSpan = { halfLen, axis, geomAxis, baseY }` placed on each rail at construction time. Samples heightfield at both endpoints, lifts each endpoint to terrain + baseY, sets the rail's local position to the midpoint and `quaternion.setFromUnitVectors(geomAxisVector, lifted_dir)`. Replaces the rail's existing rotation entirely (it's redundant once the quaternion is computed). Posts still surface independently; gate group still surfaces as one rigid unit.
- **Player chevron tracks the dog's mesh.y, not y=0.** `distanceIndicator.position` previously hardcoded `y = 0`, which on hills made the chevron parallax-drift away from the dog through the angled camera. Now it follows `mesh.position.y` (terrain-clamped) so arrow + diamond stay at fixed offsets above the dog regardless of slope.
- **Camera-mode HUD chip — same chip is the mobile button.** One component renders for both platforms: a tappable badge at top-center showing the active mode. Desktop also shows the `C` key hint; mobile shows "Tap." On click/touch it cycles modes via `getCameraController().cycleMode()`. This avoids a separate mobile button + ensures full feature parity (mobile users can switch cameras without keyboard).
- **Grass wind: directional flowing noise replaces wave-magnitude pulse.** Was `sin(time * 0.8) * 0.5 + 0.5` magnitudes that made all blades pulse synchronously across the field. Now samples a noise texture translating along `windDirection` at two scales — a slow base flow + a higher-freq ripple — so gusts visibly *flow* across the field. Magnitudes are roughly equivalent in mean but the time signature is uncorrelated across blades. Mobile shader has no wind by design; this change is desktop-only.
- **Grass wind: three rotated noise octaves, not one.** First pass at "flowing wind" used a single noise field translating along `windDirection`. The result was technically flowing but visually a wavefront — a coherent line of magnitude advancing across the grass. Replaced with three samples at different rotations (windDirection, perpendicular, bisector) and slightly different scales + scroll speeds, averaged. Mean magnitude still leans along the wind, but the modulation has no single front. Variation tightened to 0.35–0.65 (was 0.4–1.2) so the field shimmers/breathes instead of pulses. Same shader change is desktop-only; mobile has no wind by design.
- **Grass interaction: oriented body SDF, not world-axis ellipse.** The previous "elliptical" interaction (`fromEntity * vec2(1.8, 1.0)`) was locked to world axes — the bend zone was always longer along world Z, regardless of which way the dog was facing. Replaced with a rounded-rectangle SDF in the entity's local frame: each entity reports its facing direction (yaw for dog from `currentRotation`, scalar angle for sheep from `renderFacingDirection`); the shader rotates the blade-to-entity delta into local coords, computes `q = abs(local) - halfExtents`, then `sdf = length(max(q, 0)) + min(max(q.x, q.y), 0)`. Push falls smoothly outside the body over `falloff` metres. Dog body: 1.6m long × 0.6m wide × 1.4m falloff ring. Sheep: 0.6×0.5m × 0.9m falloff. Mobile uses the same SDF for the single first-interactor. Cost is one extra `vec2[]` uniform array and a few extra arithmetic ops per blade per entity.
- **Grass density LOD: stochastic dither, not count step.** The hard 100/50/25% count-decimation LOD was visible as a "ring snap" in Classic top-down (where the entire LOD band is on screen) and during fast camera pans (camera covers ~10-15 m/s; the ring shifted at the same rate, very obvious). Replaced perceptually with stochastic per-blade culling in the vertex shader: each blade has a stable per-instance hash; as distance to camera grows through `[grassFadeStart, grassFadeEnd]`, an increasing fraction of blades whose hash falls below the threshold collapse to a degenerate triangle (`gl_Position = vec4(2)`, all-axes outside the frustum). Density gradient is smooth — no perceptible step. Hard count-decimation LOD still runs (CPU savings) but is now pushed behind the dither (200/280m), so the count step lands inside an already-mostly-culled zone where it's invisible. Same dither in both desktop and mobile shaders for parity. Standard production technique (Cesium-for-Unreal, Witcher 3, RDR2).
- **Scene descriptions de-em-dashed and corrected.** Removed em-dashes from Rolling Hills + Open Country descriptions per user style. Rewrote Rolling Hills ("Hills you have to climb. The flock scatters wider; the gate sits across the ridge.") since "more sheep" was misleading (sheep count is mode-dependent, not scene-dependent). Dropped "ringed by mountains" from Home Field since mountains are gone.

### Post-deploy polish (2026-04-25)

- **Camera far plane sized to extended terrain.** Was 1000/500m (desktop/mobile) from before the plane extension; left a black wedge between terrain edge and atmosphere skybox at wide zoom-outs. Bumped to 2800/1800m to cover the 2400/1600m plane's diagonal (~1700/1130m) plus margin. Atmosphere skybox glues to the far plane in its shader, so this also controls how far the visible sky reaches. Near plane unchanged (0.1/2.0m); precision ratio stays acceptable (~28000:1 / 900:1).
- **Trees no longer spawn on rock formations.** `addEnvironmentDetails` and `createTrees` originally ran independently with no shared placement data, so trees and rocks could land in the same world XZ. Now: rocks place first (call order swapped in `main.js`), each rock records `{x, z, radius}` (radius = `finalScale * 1.2`) on `this.rockPositions`, and `createTrees`'s Poisson validator rejects candidates inside any rock's footprint plus a 4m padding. Storing minimal metadata (xz + radius) instead of the full instance keeps the validator hot loop tight.
- **Terrain shader uses `scene.fog` instead of a custom hand-rolled fog.** The terrain previously faded to a fixed warm-grey-green via its own `fogColor`/`fogNear`/`fogFar` uniforms, while Atmosphere drove `scene.fog` to match the sky's horizon colour per-frame (FogExp2, density 0.0006). The result was a visible cutoff line where terrain met sky — terrain stayed grey-green while the sky cycled through preset colours (white at noon, dark at night, etc). Replaced the custom fog with Three.js's standard fog chunks: `material.fog = true`, `THREE.UniformsLib.fog` merged into the uniforms, `#include <fog_pars_vertex>` + `#include <fog_vertex>` in the vertex shader, `#include <fog_pars_fragment>` + `#include <fog_fragment>` in the fragment. Now terrain fades into the *same* colour as the sky at the *same* distance regardless of preset; transition is seamless. Trade-off: we trust Atmosphere to keep `scene.fog` set on every preset switch (it does); if a future scene wants different fog behaviour from the sky, it would need its own `scene.fog` override or back to a custom shader.

### Post-deploy polish round 2 (2026-04-25, post-decompaction)

- **Follow-camera look-ahead direction is smoothed (τ=0.08s), not raw velocity atan2.** `_updateFollow` smoothed camera *position* with τ=0.35s by design (the slow rotational lag is what makes the Follow camera feel cinematic on turns), but the look-ahead point — placed in front of the dog so you see what's coming — used the *raw* `Math.atan2(velocity.x, velocity.z)`. PC keyboard input + physics micro-noise (fence contact frames, slope re-projection, boundary nudges) made that raw atan2 jitter at 144Hz refresh, while the camera position lerp was perfectly smooth. The visible result was a wobbly look-at sweeping a smooth camera. Mobile felt fine because the analog joystick produces a steady velocity vector — the raw atan2 had nothing to chatter on. Added a separate `followAimYaw` smoothed at τ=0.08s (fast enough to track a real heading change tightly, slow enough to filter frame-to-frame velocity noise) and used it for the look-ahead direction. Camera position lag (0.35s) preserved.
- **Mobile camera-mode chip moved to top-left, not top-center.** `CameraModeIndicator` was top-center on every platform. On mobile the centered MobileHUD chip (pause + sheep + timer + stamina) lives at the same position; the two stacked. Top-right collides with the zoom rail in landscape and with a wide MobileHUD on narrow portrait phones. Top-left is empty on mobile (`SheepCounter` is desktop-only and folded into MobileHUD on mobile) and well above the joystick. Desktop unchanged (top-center is empty there: SheepCounter top-left, GameTimer top-right).
- **Terrain plane: 4000m desktop / 3200m mobile** (was 2400/1600). User saw a faint cutoff line at the terrain edge during max-zoom-out and asked for "a bit bigger" rather than denser fog. The earlier 2400m plane left the perpendicular edge ~40% fogged at FogExp2 density 0.0006 — visible. Growing the plane to 4000m / 3200m pushes the edge to 76% / 69% fogged with no fog change. Heightfield content is unchanged (still confined to ±200m via the existing radial falloff), so the new outer area is a longer flat skirt that fades into existing fog. Segments bumped on mobile (192 → 256) to keep inner-zone heightfield sampling usable; desktop's 384 stayed the same. Quad sizes ~10.4m / 12.5m. Camera far plane bumped 2800/1800 → 4500/3700 to cover the new diagonals (~2828m / 2263m). Skybox auto-glues to far plane via `gl_Position = clip.xyww` so no shader change needed. Trade-off: slightly coarser quads in inner heightfield zone (was 6.25m, now 10.4m on desktop), but the heightfield wavelength content (~25m features) still resolves well.
- **`_groundY(x, z)` helper for entity placement, mirroring terrain falloff.** `Heightfield.sample()` clamps to edge values past `worldSize` (typically ±200m), but the *terrain mesh* applies a smoothstep falloff to 0 over the last 20m of `worldSize`. So at radial > 200m, the visible ground is dead-flat at y=0, but anything that called `heightfield.sample()` got the heightfield's clamped edge value. Trees in midField/farField/horizon zones (up to ±800m) and rocks in the same zones placed Y from the raw sample — they sat floating above the flat skirt at the heightfield's edge value. Aerial Classic camera hid this; Follow exposes it. Added a `_groundY(x, z)` helper on `TerrainBuilder` that samples the heightfield AND applies the same smoothstep falloff the terrain mesh uses — so entity Y matches what's actually drawn at every radius. Routed tree, rock, and farmhouse placement through it. Sheep/dog/camera/grass already stay within ±200m radial in normal play (falloff=1, no change), but using the helper everywhere prevents future bugs if zone definitions move.
- **Smoothed `Sheepdog.smoothMaxSpeed` instead of hard velocity clamp.** When stamina hit 0 mid-sprint, `move()` was calling `velocity.normalize().multiply(currentMaxSpeed)` — a hard clamp that dropped velocity from 25 → 15 in one frame the moment `isSprinting` flipped false. Three downstream effects: (1) `speedNorm` in the camera look-ahead halved instantly, popping the look-ahead point closer to the dog; (2) the camera position lerp surged forward as the dog's actual position decelerated; (3) the animation state crossfaded SPRINTING → RUNNING faster than the leg-cycle blend could keep up. Diagonals + mid-turn made it worse because `followYaw` smoothing was already actively transitioning. Replaced with `smoothMaxSpeed` that snaps on the way UP (sprint-press stays responsive) and eases with τ=0.2s on the way DOWN. The safety clamp now uses the smoothed cap, so velocity decays naturally via the existing acceleration logic over ~75ms instead of jumping in one frame. Animation passes cleanly through SPRINTING → RUNNING (speed crosses the 17 hysteresis floor smoothly), camera tracks smoothly. The asymmetry matters: smoothing on the up-direction would make pressing sprint feel sluggish; the user expects an instant kick when the key fires.

### Cycle 7 — Camera + sky/water + OC outer-ring + multi-stage objective (shipped 2026-04-25)

Full detail in [`docs/archive/cycles/cycle-7-plan.md`](docs/archive/cycles/cycle-7-plan.md). Headline decisions worth pinning here:

- **`targetVelocity` reads `smoothMaxSpeed`, not raw `currentMaxSpeed`.** Cycle 6 added the smoothed cap as a safety clamp only; the `targetVelocity` calc kept reading the raw value, so on diagonal stamina-out the velocity vector still whipped (just clamped down externally). Now `targetVelocity = direction.normalize() * smoothMaxSpeed` — the easing flows into the target, not just the post-hoc clamp. Snap-up structure preserved so sprint-press stays instant. The two parts of the smoothing finally agree.
- **Force-based dog obstacle avoidance layered in front of the existing hard push-out.** Sheep have force-based avoidance at strength 6.0 / 30m broad-phase and never hit trunks. Dog had 0m hard contact + 0.85 reflection. The asymmetry was the camera-lurch root: at contact, velocity reflected (whip), camera tracked the whip. Added force-based avoidance at strength 4.0 (gentler than sheep — don't fight player input) + kept hard push-out as fallback for direct sprint-into-trunk. Reuses the same kdbush queries; sim-baseline fixtures unaffected (audited Q4: all 4 fixtures capture sheep state or stationary-dog kinematics only).
- **Camera `speedNorm` smoothed and `posK` capped.** Defense-in-depth atop the sim-side fixes. `speedNorm` exponentially smoothed at τ=0.1s before feeding look-ahead distance; `posK` from `expSmooth(dt, FOLLOW_POS_LAG_TAU)` capped at 0.3 per frame so a single dropped frame can't lurch the camera most-of-the-way to the target. Cap engages only below ~22fps in practice.
- **TWO cloud systems exist, not one.** Took 4 rounds of fixes to discover. The dome shader has integrated cloud math in `skyShader.glsl.js`; `CloudLayer.js` is a *separate* planar mesh (36000×24000m at altitude 1200m, locked to camera) with its own `cloudShader.glsl.js`. The visible "horizontal line in the sky" was the planar layer's `horizonFade = smoothstep(0.02, 0.18, abs(viewDir.y))` saturating at 10.4° elevation. Widened to `(0.02, 0.85)` so opacity grows continuously to near-zenith. Lesson: when debugging sky artifacts, both systems must be checked.
- **`FAR_LOD_DIST` is distance-from-origin, not distance-from-camera.** This is a static decision per tree at scene load. For a 380m island, raising the threshold from 250 → 280 was insufficient; 400 was needed to cover the full island. Camera-relative LOD would require per-frame mesh↔billboard switching — out of scope for this cycle. Trees in horizon zone (>400m radius) stay billboards as designed.
- **Per-scene `grass.densityRange` (multiplier on `worldSize`).** GrassSystem hardcoded `worldSize × 0.6` as the radial density-falloff zero point. RH (safe radius ~161m, fits inside 0.6×420=252m) and Field (perimeter fence) didn't need this changed. OC's 380m island reaches well past 252m, so its outer ring rendered as bare terrain. Defaulted to 0.6 for backward compatibility; OC overrides to 0.92 (extends grass to ~387m, past the shoreline).
- **Multi-stage objective schema (`gameState.objective`) opt-in via scene def.** RH and Field leave it null and run the standard single-stage corral-entry retirement. OC sets `objective.roundupZone + requiredSheep + holdRequired`. Per-tick logic in `GameState.updateSheepBehaviors` counts sheep in the zone and increments a hold timer; transition fires `objective-stage-changed` event. Portal `setIntensity()` lerps 0→1 over 0.6s on transition; round-up decal hides; `CorralCompass` retargets. Tuned 120/3.0 → 40/2.0 mid-playtest.
- **PortalEffect adds `uIntensity` uniform + `setIntensity()` API.** Ring shader scales by it; `speedFactor = 0.4 + intensity * 0.6` slows particle rise + ring rotation when "closed". Visual floor of 0.25 keeps the closed portal discoverable as a landmark instead of disappearing. Pulse-on-retirement preserved.
- **CorralCompass refactored to accept generic `targetPoint`.** Was reading `gameState.corral` directly; now reads from `gameState.objective.roundupZone` while objective is in `roundup` stage, falls back to `gameState.corral` otherwise. ~20-line refactor; no callers needed updating.
- **Hardcoded grass-exclusion zones gated on scene def.** `TerrainBuilder.createGrass` had a hardcoded farmhouse rect AND a hardcoded `(-35..35, 98..138)` pasture rect, both applied to *every* scene. Now both gated on `sceneDef?.farmHouse` and `sceneDef?.pasture`. RH and OC no longer have a 70×40m bare grass patch on the spawn→corral corridor.
- **Stamina state machine: `canStartSprint` (≥10) AND `canContinueSprint` (>0), separate.** Pre-Cycle-7 logic gated both on `stamina >= minStaminaToSprint(10)`, so stamina oscillated around 10 (drain when above, regen when below) and never hit 0. The exhaustion-lock branch was unreachable. Phase 1a's smoothing exposed this — sprint felt continuous because it actually was. Now: must clear 10 to *start* a sprint, but once sprinting can drain to 0 and only then is the lock set. Lock clears on key release.
- **Stamina bar `transition: all` removed.** Both desktop CompactStaminaBar and MobileHUD used `transition: all 0.3s` which animated the **width** alongside color/glow. Bar lagged the percentage text by 300ms. Now only `background` and `box-shadow` transition; width is instant.
- **Lightning retirement (RH zap) traces the bolt.** Was 22m vertical float with late-shrink (lightning bolt is 60m). Looked like the sheep stopped early and "drifted off". Now: 60m ascend matching `BOLT_HEIGHT`, smoothstep ease, scale shrinks continuously across the rise (`1 - t²`, ~50% at midpoint), position locked to `ascendStartX/Z` at zap moment so residual physics doesn't drift the sheep sideways. New `corral-ascend-top` event dispatched at t=1; `CorralZapEffectPool.fireSpark()` (particle-only burst, no second bolt) marks the disappearance.
- **Classic-mode sheep count reads `sceneSpawnDef.count`.** Was hardcoded 200 regardless of scene. RH's scene def says 250, Field/OC say 200 — those should be honored. Boost modes (extreme/insane/chaos = 1000/3000/5000) still apply uniformly.
- **OC sheep spawn: 5 cluster centers across the southern + central island.** Was a single tight cluster at (0, -150) radius 160m — players saw the entire flock at spawn and never had a "find them" phase. Now spread across 5 centers with 90m per-cluster radius. Solo client previously ignored `scene.sheepSpawn` overrides for centerX/Z/spreadRadius (used bounds-derived defaults); added `setSheepSpawn()` on GameState to wire through.
- **Round-up zone decal is terrain-conformed.** Initial flat-Y `RingGeometry` got eaten by terrain at radius 30m on OC (back of the ring sank below ground). Replaced with a 96-segment custom `BufferGeometry` where each vertex pair (inner/outer) samples heightfield Y independently. Conforms to ground contour at any radius.
- **SunBillboard halo doesn't terminate at quad boundary.** Initial halo used `smoothstep(0, 0.95, r)` with `discard` at alpha < 0.001 — the 0.95→1.0 boundary band created a visible soft ring under additive blending. Now `smoothstep(0, 1.0, r)` and alpha further multiplied by `haloFalloff` so it fades to zero at the quad edge naturally. Discard threshold lowered to 0.0005.

---

## Polish program — thesis and outcomes (2026-05)

Drafted 2026-05-06 mid-Cycle-24 as a 5-cycle program (Cycles 25–30, ~38 dev-days) shipping `v2.0.0`. Collapsed 2026-05-06 into a single autonomous overnight mega-cycle (Cycle 25, Phases A–H). Original umbrella doc archived at [`docs/archive/polish-program.md`](docs/archive/polish-program.md). This entry preserves the durable thesis so future cycles can reason about it without rehydrating the original execution doc.

### The thesis: stacked patches mask LOD1 silhouette mismatch

Cycles 16–23 added one compensating layer per cycle to mask a foundational mismatch — **LOD1 (the 80–200m mid-distance tree mesh) does not match LOD0's silhouette**. Each layer makes the seam less visible at one camera angle and reveals new mismatches at others.

| Cycle | Patch | What it actually masks |
|---|---|---|
| 16 | First LOD1 with halved leaves | (failed — Cycle 17 rejected as "less leaves does not look good") |
| 18 | AlphaHash on LOD0 + impostor | LOD seam alpha-edge pop |
| 20 | uMatchBoost calibration LUT | LOD0↔impostor color drift |
| 21 | Schlick fresnel on impostor | LOD0↔impostor warm-bias hue gap |
| 22A | Meshopt-baked LOD1 | (current — silhouette warps at leaf-card UV edges) |
| 22B | AlphaHash on LOD1 leaves | LOD1↔LOD0 transition pop (masking 22A's silhouette warp) |
| 22C | Atmospheric desaturation | Overall LOD0↔LOD1↔impostor color contrast at the seam distance |
| 23A1 | Pitch-aware desat ramp | Desat over-applies when overhead camera shows the masking |
| 23A2 | Camera-to-dog occluder fade | Adjacent problem domain, similar layer-on-layer pattern |

Each row is "make the prior row's tell less visible." The pattern stops only when **the seam itself stops existing** — drop LOD1 from the desktop pipeline entirely. Once the seam is gone, the masking patches lose their primary justification and **delete cleanly**.

### Why "no LOD1" is the right answer for foliage

LOD1 is a hard problem specifically for *alpha-tested foliage cards*:

1. **The silhouette IS the alpha edge.** Cards are 2 triangles each; "simplifying" them means deleting cards or warping their UVs, both of which mutate silhouette directly.
2. **Halving the card count was tried (Cycle 16) and rejected (Cycle 17)** — silhouette read as sparse, individual missing leaves stood out.
3. **Meshopt-simplifying card mesh (Cycle 22)** preserves card count but warps card edges, producing the "looks weird at 80m" tell.

Both approaches fail because LOD1 is being asked to do something foliage geometry can't do gracefully: lose detail without losing silhouette. The clean answer is to skip LOD1 on platforms with the perf headroom and keep LOD0 active until the impostor takes over with a long alphaHash crossfade band.

- **Desktop (RTX 3070-class):** LOD0 (0–200m) → kiln impostor (180m+) with 20m alphaHash crossfade.
- **Mobile (Adreno 730-class):** keep meshopt LOD1 at 80m as a `HardwareTier === 'low'` branch. Phone pixel density absorbs ~40% of the silhouette warp.

### Net-negative LOC tracking

The program is **net-negative LOC** despite adding sophisticated systems. Cycles 25-27 expected to delete: `AtmosphericDesatPatch.js` (~130 LOC), `_desat*` fields in `TerrainBuilder` (~30 LOC), `setKilnImpostorDesat` plumbing (~20 LOC), `tools/generate-impostor-lut.mjs` (~120 LOC), `uMatchBoost` uniform plumbing (~40 LOC). Targeted ~590 LOC out, ~250 LOC in → **~340 LOC net-negative**.

### Outcome (post-collapse)

The 5-cycle program collapsed into Cycles 25 + 26 + 27 (~3 mega-cycles). LOD1 was dropped from the desktop pipeline; AlphaHash crossfade band was extended; the masking-patch deletion cascade played out across those three cycles. Polish program goal — `v2.0.0` ship — landed inside Cycle 27's window. Per-tier divergence (desktop drops LOD1, mobile keeps meshopt LOD1) was preserved via the `HardwareTier` service shipped Cycle 23 Phase D for grass.

### Decisions to preserve forward

- **Desktop LOD path is LOD0 → kiln impostor.** Do not re-introduce a desktop LOD1 mid-tier without a silhouette-IoU regression budget.
- **Mobile keeps `HardwareTier === 'low'` meshopt LOD1** at 80m. Removing it requires re-validating mid-tier mobile perf.
- **Per-tier branching is acceptable** when geometry constraints diverge across hardware classes. Don't collapse to a single LOD ladder for cleanliness if it forces a foundational mismatch.
- **Track net-negative LOC across cycles** when the program is "remove a foundational mismatch." Patch-deletion is the success signal; if patches are still landing, the seam isn't gone.

---

## Research findings — durable summaries (2026-05, Cycle 28 Stream A3)

Compact summaries of research dossiers archived to [`docs/archive/research/`](docs/archive/research/) during Stream A3. Each entry: what we considered, what we picked, why. Originals preserved for future agents to revisit.

### Grass rendering ([archive/research/research-grass-2026-05.md](docs/archive/research/research-grass-2026-05.md))

Considered: single-noise wind, multi-octave layered wind, GPU-driven TSL pipeline, render-texture trample. **Picked:** three rotated noise octaves at different scales averaged to a 0.35–0.65 modulation envelope, plus oriented rounded-rectangle SDF interaction in the entity's local frame. Reason: single-noise reads as a coherent wavefront; three rotations break the front. Render-texture trample deferred (cost/benefit not justified at our blade count; uniform-array interactor scales to the per-frame interactor count we actually have).

### Rocks + ground scatter ([archive/research/research-rocks-and-scatter-2026-05.md](docs/archive/research/research-rocks-and-scatter-2026-05.md))

Considered: Quaternius/Kenney/KayKit CC0 packs, runtime procedural rock generation (icosa + noise displacement), bake-once GLBs. **Picked:** in-repo bake (`scripts/bake-rocks.mjs` icosa+noise) with 6–8 variants exported as GLBs at build time. Reason: keeps collision/heightfield logic deterministic; no per-frame CPU; Pixel-Forge-quality silhouettes via parameter tuning. CC0 packs noted as fallback if commission timeline slips.

### Tree rendering survey ([archive/research/research-trees-2026-05.md](docs/archive/research/research-trees-2026-05.md))

Considered: CC0 GLB libraries (Quaternius, Kenney, Poly Pizza), Genshin/BotW cross-quad leaves, EZ-Tree procedural, FloraSynth, BatchedMesh vs InstancedMesh2. **Picked:** EZ-Tree procedural bake (`bake-trees.mjs`) + `@three.ez/instanced-mesh` `addLOD` chain. Reason: native LOD support kills the impostor hand-off seam and reuses kdbush colliders; CC0 packs flagged as backup if EZ-Tree silhouette doesn't read.

### Cycle 16 tree-foliage decision ([archive/research/cycle-16-tree-research.md](docs/archive/research/cycle-16-tree-research.md), [archive/research/cycle-16-tree-gallery-review.md](docs/archive/research/cycle-16-tree-gallery-review.md), [archive/research/cycle-16-phase-6-prep.md](docs/archive/research/cycle-16-phase-6-prep.md))

Considered: PIF vertex-shader leaf cull, octahedral impostors, recipe re-tune, `addLOD` chain, billboard count tweaks. **Picked:** A+B+E (recipe re-tune + `addLOD` chain + 3-quad cross-billboard migrated into `addLOD` LOD2). Reason: combines three free wins (no new deps), preserves existing cross-billboard work, and gives per-instance per-frame distance test instead of scene-load decision. **Cycle 17 result:** halved-leaves LOD1 was rejected as "less leaves does not look good" — see polish-program thesis.

### Cycle 20 kiln impostor color handoff ([archive/research/cycle-20-impostor-color-handoff.md](docs/archive/research/cycle-20-impostor-color-handoff.md))

Considered: per-(scene, ToD) calibration LUT, Schlick fresnel + GGX lobe on impostor, half-Lambert wrap + albedo-tinted hemi ambient, padded-mip pre-filter, optical sandbox v2. **Picked:** the calibration LUT (uMatchBoost) as the v1 fix, padded mips deferred to Cycle 21. Reason: bridges hue + brightness gap quickly; LUT is small (~196 KB). **Cycle 25 outcome:** uMatchBoost was deleted as the polish-program thesis predicted — masking the LOD1 silhouette gap rather than fixing it.

### Cycle 21 tree impostor research ([archive/research/cycle-21-tree-impostor-research.md](docs/archive/research/cycle-21-tree-impostor-research.md))

Considered: NeRF/splats, hybrid mesh-canopy + impostor-trunk, RiLoD, padded-atlas pre-filtered radiance, octahedral parametrization. **Picked:** padded-atlas mipmaps + Schlick fresnel + per-(scene, ToD) calibration LUT (the convergent recommendation from 6 parallel research agents). Reason: highest-leverage path that didn't require a forklift architecture change. **Cycle 22+ outcome:** still wasn't enough; polish-program thesis identified LOD1 silhouette as the real root cause.

### Cycle 22 stylized-tree implementation ([archive/research/cycle-22-stylized-tree-research.md](docs/archive/research/cycle-22-stylized-tree-research.md))

Considered: 6-game survey (Tiny Glade, Sable, A Short Hike, Lil Gator, Among Trees, Townscaper). **Headline finding:** zero of the 6 reference indie games use impostors. **Picked:** Sable's inverted-hull outline fade + two-color near/far fog as the right stylization direction; defer impostor rework until LOD1 mismatch is solved. Reason: at our poly counts, an instanced mesh is cheaper than the impostor + bake pipeline + atlas streaming + the eternal "doesn't match LOD0" tax.

### Cycle 22 BatchedMesh migration ([archive/research/cycle-22-batchedmesh-research.md](docs/archive/research/cycle-22-batchedmesh-research.md))

Considered: BatchedMesh (Three.js core r184), `@three.ez/batched-mesh-extensions`, sticking with InstancedMesh2. **Picked:** stay on InstancedMesh2. Reason: BatchedMesh has no native per-instance LOD; the extensions package requires LODs to share vertex arrays (rules out our `@gltf-transform` meshopt simplify pipeline). Revisit only if Three.js core lands `addGeometryLOD` or we exceed ~1M instances.

### Cycle 24 BatchedMesh + WebGPU rescope ([archive/research/cycle-24-research-batched-webgpu.md](docs/archive/research/cycle-24-research-batched-webgpu.md))

Considered: re-evaluating BatchedMesh post-r184, WebGPU/TSL pivot now that Safari 26 ships WebGPU. **Picked:** stay on InstancedMesh2 + meshopt LOD + kiln impostor + meadow-quad. Reason: nothing structural shifted; BatchedMesh per-instance LOD still absent; WebGPU readiness is necessary-but-not-sufficient (TSL foliage shaders are not yet a clear net win for our scene complexity). 1-phase WebGPU spike behind a feature flag is defensible if a future cycle has slack.

### Cycle 24 foliage rendering SOTA ([archive/research/cycle-24-research-foliage.md](docs/archive/research/cycle-24-research-foliage.md))

Considered: agargaro hemi-octahedral impostor, RiLoD (EGSR 2025), Ghost of Yōtei cut-buffer, AC Shadows Atmos system, render-texture trample. **Picked:** keep kiln stack; defer hemi-octahedral spike until Cycle 23 v1.4 visual ships clean; no skeleton-per-tree wind. Reason: octahedral gives ~2× tile efficiency vs lat-lon but at architectural cost; RiLoD is academic SOTA but not browser-tractable in 2026.

### Cycle 24 MP testing ([archive/research/cycle-24-research-mp-testing.md](docs/archive/research/cycle-24-research-mp-testing.md))

Considered: Browserbase, Playwright with two pages, Playwright with two contexts, multi-tab. **Picked:** Playwright with two `browser.newContext()` per test (host + N guests). Reason: two pages in the same context share storage/cookies/BroadcastChannel — silent test breakage. Two contexts give clean isolation. Backend uses `wrangler dev` (Miniflare under the hood) — same code path as production. Reconnect grace: 15s in-game, 0s in lobby.

### Electron readiness ([archive/research/electron-readiness.md](docs/archive/research/electron-readiness.md))

Considered: Electron, Tauri, Capacitor, NW.js, native packagers. Research-only — no implementation. **Punted.** Conclusion: introduce build-time `SDS_WORKER_BASE` env so the same source compiles to relative URLs (web) or absolute (desktop). Solo modes already degrade gracefully when worker is unreachable. Revisit when there's a market signal for a downloadable.

### Mac rendering bug ([archive/research/mac-bug-research.md](docs/archive/research/mac-bug-research.md))

Two distinct issues conflated as "the Mac bug": white-ground (terrain shader on Matt's specific Safari) and rainbow horizon-band (sky shader precision). **Picked:** `precision highp float` + `precision highp int` on sky/cloud/grass shaders + 1/255 hash dither at sky's final write. Rainbow band fixed; white-ground reproduces only on Matt's hardware (not GH macOS runner) — unresolved, hardware-specific.

### Multiplayer dog selection ([archive/research/multiplayer-dog-selection.md](docs/archive/research/multiplayer-dog-selection.md))

Reference doc: dog-id contract (`jep`, `pip`, `sally`, `shiloh`, `george_washington`) is the source of truth across `DogSelection.js` UI list and `RoomDO.ts` `DOG_TYPES` allowlist. Adding/removing requires both files; mismatches surface as silent worker coercion. Anchors regression specs in `tests/e2e/mp/dog-selection.spec.ts`.

### Meta-cycle execution policy ([archive/research/meta-cycle-execution.md](docs/archive/research/meta-cycle-execution.md))

Considered: how to run an autonomous overnight cycle when Matt is asleep. **Picked:** branch-only commits, no tag push, no production deploy, no destructive shared-state ops, no interactive prompts, no PII in logs. Hard-stop matrix: surface to wake-state report, don't fail forward. **Cycle 25 outcome:** policy was applied; mega-cycle landed end-to-end with one parked phase. Cycle 28's autonomous-cycle execution model is the descendant of this policy.

---

## OptimizedSheep + GrassSystem are large-and-cohesive by design (2026-05-09, Cycle 28 Stream B3)

[`OptimizedSheep.js`](js/OptimizedSheep.js) (2,107 LOC) and [`GrassSystem.js`](js/GrassSystem.js) (1,603 LOC) are large, but **internally cohesive**. Stream B's decomposition pass leaves them untouched. Codifying the rule so future cycles don't repeat the question.

### Why not decompose

Both modules are a single InstancedMesh + custom shader + per-instance attribute system + per-instance state machine. The pieces are coupled by:

- **Shared shader-attribute schema.** Each `OptimizedSheep` instance has per-instance attributes (state, retirement timer, facing direction, animation phase, gate-passed flag) that the vertex/fragment shader reads. Splitting "state machine" from "shader update" would force every state mutation to also mutate a separate attribute buffer at a precise point in the frame. The current single-file pattern keeps that coupling local.
- **Tight per-frame ordering.** Sheep flocking → boundary collision → state-machine tick → attribute-buffer write → render must happen in a specific order each frame. Cross-file boundaries here introduce reordering risk for no readability win.
- **Shader patch points.** GrassSystem has multiple `onBeforeCompile` injections (wind octaves, density dither, oriented-rectangle SDF interaction, clump-density AO). Splitting them into per-feature files duplicates the uniform binding ceremony in each.

A god-module test fails on these (LOC, method count) but a cohesion test passes. The Stillwater playbook's stop-condition — "if extracting forces you to thread the same coupling through a new boundary, the boundary is wrong" — applies.

### When to revisit

This rule **is** revisitable, but only with a deliberate cohesion-vs-size tradeoff argument. Acceptable triggers:

- A new feature legitimately needs only a *subset* of the system's state (e.g. a sheep-only AI experiment that doesn't need the InstancedMesh path) → that subset extracts cleanly.
- Profiling identifies a hot path where the current organization causes a measurable cache miss / shader recompile / memory-bandwidth hit.
- A decomposed alternative passes the existing visual + sim goldens AND the bundle-size + perf budgets, AND has a Matt-readable rationale for why the new boundary is right.

Without one of those, **don't decompose**. Adding files isn't a refactor; it's churn.

### What B1/B2 did instead

Stream B's god-module pass targeted [`main.js`](js/main.js) (3,529 → 2,188 LOC) and [`TerrainBuilder.js`](js/TerrainBuilder.js) (2,785 → 1,387 LOC) — two modules where the coupling argument *didn't* hold. The extracted pieces (boot sequence, scene-swap teardown, MP event handlers, completion overlays, rock placement, tree placement, shader patches, sandbox rebuild) all had clean boundaries: no shared attribute buffers, no per-frame ordering constraints across the seam, no shader-patch-point sprawl.

---

## Heightfield visual-Y has one home (2026-05-09 · Cycle 30)

The visible terrain Y at world (x, z) is owned by [`Heightfield.meshSampleY`](shared/terrain/Heightfield.js), which triangle-interps against a `displacedHeights` grid bound via [`Heightfield.bakeMeshGrid`](shared/terrain/Heightfield.js) (or the lower-level `setMeshGrid`). The displacement algorithm — per-vertex `sample()` + square-radial smoothstep falloff over the last 20m of `worldSize` — lives on `Heightfield`, not [`TerrainBuilder`](js/TerrainBuilder.js). `TerrainBuilder.createTerrain` calls `bakeMeshGrid` and writes the returned array onto its `PlaneGeometry`.

### What's gone (do not reintroduce)

- **The `+ 0.05m` defensive lift** in `meshSampleY` / `surfaceY` (Cycle 9 Phase 5, carried through Cycle 14). The bilinear-vs-mesh gap that motivated it is closed by the triangle-interp path; outside the runtime path (worker, tests), the answer to "what visual Y does (x, z) have?" with no bound mesh is `undefined`, not `sample() + 0.05`. The API throws to surface this clearly.
- **Two parallel displacement loops.** `TerrainBuilder` no longer carries an inline `for (let i = 0; i < positions.count; i++) { sample / smoothstep / write }` loop alongside `Heightfield`'s `bakeMeshGrid`. There's one algorithm to read and one place to test it.

### What stays

- **Sim/physics keep using raw `sample(x, z)`.** The split between sim-Y (`sample()`, deterministic across worker + client) and visual-Y (`meshSampleY()`, render-mesh-aligned) is the whole point of the `meshSampleY` / `sample` distinction. Sim is decoupled from any render-time mesh resampling; that decoupling stays.
- **`TerrainBuilder._groundY(x, z)`** as the named entry point for "place visible geometry on the ground." It's a one-liner today, but [`.claude/rules/scene-and-render.md`](.claude/rules/scene-and-render.md) treats `_groundY` as the seam everything visible routes through — inlining it is a separate decision.

### Failure mode if reintroduced

If a future change adds back a `sample(x, z) + offset` fallback to "be defensive" against an unbound grid: it papers over the real bug (grid not bound) with a wrong-by-an-offset answer. The throw makes the missing bind loud. Don't add it back.

---

## Apple-facing water avoids per-frame depth RTT (2026-05-10 · Cycle 32, [research](docs/archive/research/apple-water-bug-research-2026-05-09.md))

The SDS island water shader no longer depends on a per-frame scene-depth render target. `AnimeWater` derives foam and shallow/deep color from scene boundary geometry: `boundary.radius` defines the shoreline and `boundary.falloff` defines the shallow/deep transition band. This replaced the deleted `js/water/DepthPrePass.js` path.

### Why

The iPhone Safari water failure was a real Apple/WebGL path bug: the visible water could collapse toward a solid foam-white surface while desktop Chromium/WebKit stayed green. The depth pre-pass made water correctness depend on render-target support, depth texture behavior, camera near/far packing, and per-frame render-to-texture state on the most fragile target. The scene already owns an explicit island boundary, so the shoreline should be driven by that source of truth instead of by a screen-depth reconstruction.

### Rule

Do not add a per-frame render-to-texture shader dependency on an Apple-facing render path unless there is a real-device gate for that exact path. Playwright WebKit is useful smoke coverage, but it is not a substitute for real Safari on Apple hardware.

### Gate

`npm run test:ios-water` drives BrowserStack Automate on `iPhone 15 Pro Max / iOS 17 / Safari`, samples water pixels, attaches screenshot + JSON artifacts, and fails if the sampled region is near solid `#eaf6ff`. The GitHub workflow is manual while the account is on the free proof tier.

---

## Multi-stage objective lives in `shared/`, not `js/` (2026-05-10 · Cycle 34 Phase 2)

The Open Country gather → drive → portal state machine ([`shared/objective.js`](shared/objective.js)) is the **single source of truth** for both the client predictor and the Worker authoritative sim. The js-side path at [`js/gamestate/objective.js`](js/gamestate/objective.js) is a one-line re-export shim that exists only so existing `js/` callers keep importing from the same path.

### Why

Cycle 29 Stream B4 extracted the state machine from `GameState` into `js/gamestate/objective.js`. At the time, the multi-stage objective was solo-only (the Worker `GameSim.js` ignored `scene.objective`), so a client-side home was sufficient. Cycle 34 made `?scene=open-country` first-class in multiplayer rooms; the worker now needs to authoritatively advance `roundup → drive` and gate corral retirement on `isCorralOpen(this.objective)`. Two divergent implementations would desync MP within a few seconds of stage-transition time. Promoting the module into `shared/` enforces byte-identical transitions by construction.

### Rule

The objective state machine — `createObjective`, `refreshObjective`, `tickObjective`, `isCorralOpen` — has **one home**: [`shared/objective.js`](shared/objective.js). Don't fork. Don't add a Worker-only or client-only branch. Per-mode count scaling delegates to [`shared/ObjectiveLogic.js`](shared/ObjectiveLogic.js) `getRequiredSheep`; it stays out of `objective.js` so the formula has its own pure-function home.

### Failure mode if forked

A "tiny" fork (e.g. "the client predictor wants to ramp `holdTimer` smoothly while the server stair-steps it") would desync MP rooms whenever the threshold-met edge ticks: client predicts stage flip at tick N, server actually flips at tick N+1, the snapshot mirror overwrites the predicted stage on the next 60Hz broadcast and the portal flickers visibly. The whole reason the state machine is small enough to live in one place is that the latency bound on stage transitions is generous (`holdRequired = 2.0s`); there is no value in predicting it harder than the server does.

---

## Wire-format additions are net-additive optional fields, no version handshake (2026-05-10 · Cycle 34 Phase 3)

When a cycle phase adds a new field to a `gameStateUpdate` snapshot, the field is **optional** and the omission case is the legacy behavior. Pre-cycle clients ignore the unknown field; post-cycle clients connecting to a pre-cycle worker receive no field and fall back to the legacy code path. No protocol-version handshake. No DO migration.

### Why

The `.claude/rules/multiplayer.md` "When wire-protocol changes" rule lists four fence-required pieces for a wire change: scope, migration story, consumer list, version-tag confirmation. Cycle 34's optional `objective` block on snapshots passes the four checks **without** needing a version tag — the migration story is "missing field = legacy prompt; present field = stage-aware HUD" and the consumer list is `worker/src/GameSim.js` (emit) + `js/boot/initNetwork.js` (mirror into `gameState.objective`). Because both directions of mismatch are safe, no version handshake is required. This is the cheapest viable wire-format extension and should be the default shape for additions.

### Rule

When adding a snapshot field:

1. **Make it optional in both directions.** Worker omits the field when not applicable (e.g. scenes without `objective`); client treats absence as legacy behavior.
2. **Mirror the local state shape, not a translated wire shape.** Cycle 34's snapshot uses `{stage, sheepInZone, requiredSheep, holdTimer, holdRequired}` matching the local `ObjectiveState` so the client mirrors directly into `game.gameState.objective` with no translation layer. Translation layers rot.
3. **Confirm both directions of mismatch.** Spec it explicitly in the cycle plan: "old client + new worker = X; new client + old worker = Y." If either case requires action (re-render, error, soft-degrade), the rule above doesn't apply and you need a version tag.

### Failure mode if you skip the additive contract

A wire-format change shaped as a *replacement* (e.g. renaming `sheepInZone` to `inZone` to save bytes) breaks every pre-cycle client mid-game. The cost-benefit on bytes is almost never worth it; MessagePack already collapses repeated keys in the room snapshot.

---

## `allowedModes` enforcement at room init (2026-05-10 · Cycle 34 Phase 4)

[`worker/src/RoomDO.ts`](worker/src/RoomDO.ts) `initRoom` cross-checks the requested `gameMode` against the resolved scene's `allowedModes` array. A host attempting to create an Open Country room in `competitive` mode (OC declares `allowedModes: ['cooperative', 'timed']`) gets HTTP 400 `mode_not_allowed_on_scene`.

### Why

Pre-Cycle-34, the worker validated `gameMode` against the legacy `['cooperative', 'competitive', 'timed']` list and ignored `scene.allowedModes`. A host could open OC + competitive and the worker would happily start a competitive sim that's never been tuned for the island shape (no four-gate competitive-gate layout fits the OC island, no playtest budget had been spent on it). The defensive guard fails fast with a clear error message instead of silently producing a busted game.

### Rule

When a scene declares `allowedModes`, the worker is the source of truth for enforcement. The client lobby UI (Cycle 34 Phase 5) filters the mode dropdown by the same array as a UX courtesy, but the worker check is the durable guarantee — a malicious or stale client can't bypass it.

### Future-proofing

The check short-circuits when `scene.allowedModes` is absent, so adding new scenes that opt out of the constraint is zero-cost. If a future cycle wants per-mode-class restrictions (e.g. `solo.allowedModes` separate from `mp.allowedModes`), the existing field can split without breaking pre-split scene defs.

---

## Post-Cycle-35 ops hardening (2026-05-12 · between-cycles)

Between-cycles hygiene pass on the Cloudflare zone, Web Analytics duplication, and one static-page SEO asymmetry. Triggered by a GSC audit that surfaced "Crawled - currently not indexed" on 5 content URLs.

### Zone settings raised to standard

- `min_tls_version`: 1.0 → 1.2. The 2026-04-24 Pages setup left it at the CF default of 1.0; 1.2 is the modern security floor.
- `always_use_https`: off → on. The HTTP→HTTPS redirect was previously Pages-level only; the zone-wide setting closes the http:// surface area completely.

Both via `PATCH /zones/{zone}/settings/...` with a scoped API token (`Zone Settings:Edit`). Live change. Verified: `curl -sI http://sheepdogsim.com/` returns 301 to https://.

### Web Analytics dedup

Two RUM `site_info` entries were active on the account, splitting metrics across two beacon tokens:

- **Kept:** explicit Pages-injected entry from 2026-04-26, token `b5895c76...`, host filter `(sds-frontend.pages.dev|sheepdogsim.com)$`. This is the one referenced in [dist/index.html:410](dist/index.html) (auto-included by the Pages build).
- **Deleted:** stale auto-install ruleset from 2025-07-06, token `20b970e6...`. Leftover from the pre-Pages stack; the auto-install ruleset was zone-level so the beacon was firing on every response regardless of build content.

The `rum/site_info` API doesn't accept scoped tokens reliably (returns 10000 even with `Web Analytics:Edit` scope after multiple re-mint attempts). Deletion was done via the dashboard cookie session through Claude in Chrome, calling `DELETE /api/v4/accounts/{acct}/rum/site_info/{site_tag}` with the site_tag identified programmatically (auto_install:true).

### Rule

For Web Analytics / RUM lifecycle operations, the dashboard cookie session is the supported path; scoped API tokens are unreliable for the `rum/*` endpoints. Treat this as dashboard-only.

### Crawler Hints + IndexNow

Toggled ON in dashboard → Caching → Configuration. Auto-pings IndexNow on every content change. Bing/Yandex/Naver get crawl-time discovery without manual submission. Free.

The CF API does not expose these as zone settings (`/settings/crawler_hints` and `/settings/index_now` both return "Undefined zone setting"; `/cache/crawler_hints` returns "No route for that URI"). Dashboard-only as of 2026-05.

### about.html parity (not a CF change, but landed in the same pass)

GSC reported 5 content pages "Crawled - currently not indexed": `/about`, `/scenes/home-field`, `/scenes/open-country`, `/devlog/cycle-29-gamestate-decomp`, `/devlog/cycle-30-heightfield-unify`. Root cause is site age + low authority on a 3-week-old domain (CF cutover 2026-04-24), not config — Google has crawled the pages and chosen not to index. Manual "Request Indexing" loops in GSC were rejected as patches.

But `/about` had a real asymmetry vs the sibling pages in [public/scenes/](public/scenes/) and [public/devlog/](public/devlog/): no `<meta name="robots">`, no `og:image`, no Twitter card, no JSON-LD, no internal cross-links to other site pages. The other 4 stuck pages had all of these — only `/about` was structurally thin. Brought to parity:

- `<meta name="robots" content="index, follow">` (default is index/follow anyway, but the asymmetry was a real signal worth removing)
- og:image (reusing existing og-field.webp), og:image:width, og:image:height
- Twitter card meta (card, title, description, image)
- JSON-LD: `AboutPage` with `mainEntity: Person` (Matthew Kissinger), `sameAs` GitHub
- Internal cross-links footer: three /scenes/* + /devlog/

### Rule

Static pages under public/* and at-root (about.html, etc.) must match the meta/JSON-LD/cross-link pattern of [public/scenes/home-field.html](public/scenes/home-field.html). Treat that file as the template.

### Cycle 35 D1 telemetry carryover, closed

The Cycle 35 post-deploy verification ("confirm the first real `game_completed` lands in the events table after the telemetry route fix") was verified via remote D1 query:

- `mode_selected` event landed 2026-05-11 23:34:45 (after the 18:53 deploy), proving the `js/telemetry.js` POST to `https://sds-worker.matt-m-kissinger.workers.dev/api/event` flows through to the D1 `events` table.
- `score_errors` table: 0 entries. No submission failures since the table was added in Cycle 35 Phase 2.
- No `game_completed` events yet, but that's traffic, not a route bug. GSC reports 3 web search clicks in the same period.

The Cycle 35 carryover is closed.

---

## Konveyor campaign supersedes WebGPU deferral (2026-05-14 · Cycle 36 scoping)

[`docs/archive/konveyor/sds.md`](docs/archive/konveyor/sds.md) is now the campaign doctrine for
the SDS WebGPU, optimization, and native-shipping push. This supersedes the
Cycle 24 posture that treated `?renderer=webgpu` as a possible future spike but
not a committed migration direction.

### Why

SDS has shipped enough surface area that optimization work should no longer be
treated as incidental polish. The current game is still WebGL-first, and the
existing perf baseline is not trustworthy enough to guide major renderer work.
Konveyor makes measurement repair, WebGPU proof, and native runtime proof the
first-class path before any tree, grass, sheep, or shader rewrite.

### Corrections to the draft doctrine

Native runtime guarantees must be precise:

- Tauri 2 uses platform WebViews: WebView2 on Windows, WebKit on macOS, and
  WebKitGTK on Linux. It does not bundle one pinned Chromium runtime across all
  desktop platforms.
- Electron remains the desktop fallback if SDS needs one bundled Chromium engine
  across Windows, macOS, and Linux.
- Capacitor uses WKWebView on iOS and Android WebView / Chrome-backed WebView on
  Android. It does not pin WKWebView independently of the OS.
- Safari 26 WebGPU support makes an iOS 26+ target plausible, but SDS still
  needs WKWebView proof in the actual shell.

### Rule

Konveyor phases run through normal SDS cycle plans. Phase 0 is measurement and
platform proof, not a renderer rewrite. Do not touch deterministic `shared/**`
files, sim-baseline fixtures, or Worker migration history for Konveyor unless
the active cycle explicitly authorizes that file and records the acceptance
criteria.

---

## Konveyor runs on an experimental branch until objective or hard stop (2026-05-14 · post-foundation)

Cycle 36 completed the foundation pass by documented hard stop: measurement
repair, validation reconciliation, runtime proof, and a WebGPU hero-scene
blocker report. Matt then redirected the campaign away from numbered cycle
boundaries and into a full autonomous run on `exp/konveyor-webgpu-migration`.

### Why

The foundation pass proved that the next real work is not "one more cycle
plan." SDS needs an experimental migration branch where agents can keep moving
through ordinary implementation blockers, like the TIJ Konveyor campaign did,
without repeatedly stopping at phase boundaries. The risk is managed by
branch isolation, feature flags, validation gates, and durable hard stops rather
than by keeping the work artificially small.

### Rule

For Konveyor autonomous work:

- Work on `exp/konveyor-webgpu-migration`, not `main`.
- Use [`docs/archive/konveyor/autonomous-run.md`](docs/archive/konveyor/autonomous-run.md) as
  the active handoff and [`docs/archive/konveyor/sds.md`](docs/archive/konveyor/sds.md) as the
  campaign doctrine. (Konveyor docs moved to archive on 2026-05-20; campaign
  merged via PR #52 on 2026-05-16. See [`docs/archive/konveyor-campaign.md`](docs/archive/konveyor-campaign.md).)
- Treat [`docs/archive/cycles/cycle-36-plan.md`](docs/archive/cycles/cycle-36-plan.md) as completed
  foundation evidence, not the active stopping point.
- Keep WebGL default until a fallback decision is recorded.
- Keep WebGPU work diagnostic or feature-flagged until gates pass.
- Stop only for documented hard stops: frozen-file authorization, unexpected
  sim-baseline drift, broken measurement with no route around, contradicted
  platform assumptions, destructive production changes, store/public release
  decisions, or completion of the full objective.

---

## Native-readiness seam before native-shell dependency (2026-05-14 · Konveyor autonomous branch)

Konveyor now has a code-level native-prep seam without choosing Tauri, Electron,
or Capacitor yet.

### Why

The native path needs more than docs: native shells change asset base paths,
service-worker behavior, worker origins, WebSocket origins, telemetry, and
profiling assumptions. Those seams are useful before a shell dependency lands,
and they let the autonomous branch compare web and native-shaped builds with
the same validation language.

### Rule

- `BUILD_TARGET=native npm run build` creates a relative-asset build with
  service-worker registration disabled.
- `SDS_WORKER_BASE=<origin>` controls the Worker HTTP and WebSocket origin for
  packaged builds.
- `js/runtimeConfig.js` owns Worker API base, Worker WebSocket base,
  local-runtime detection, and telemetry enablement.
- `npm run native:check` runs the native build and `tools/native-preflight.mjs`
  to verify generated bundle posture.
- Tauri, Electron, and Capacitor dependencies are still deferred until a
  scoped shell proof step.

---

## Cycle 36 runtime proof defers native shell choice (2026-05-14 · Cycle 36 Phase 3)

[`docs/archive/research/cycle-36-konveyor-runtime-proof.md`](docs/archive/research/cycle-36-konveyor-runtime-proof.md)
records the current official-source and local-probe evidence for the Konveyor
runtime assumptions.

### Decision

Native desktop shell selection is explicitly deferred.

Tauri remains a candidate because its Windows WebView2 path can plausibly use a
modern WebGPU-capable runtime, and it is the lighter shell. Electron remains
the fallback if SDS needs one pinned Chromium runtime across Windows, macOS,
and Linux. The repo currently has no Tauri, Electron, or Capacitor dependency,
and no native shell has booted SDS.

### Evidence

- Installed Chrome 148 on the Windows workstation creates a WebGPU adapter and
  device with the RTX 3070 D3D11 GPU path.
- Playwright's bundled Chromium 147 exposes `navigator.gpu` and an adapter, but
  `requestDevice()` fails with a D3D12 `dxil.dll` load error. Therefore adapter
  presence is not a sufficient gate.
- Three r184 exposes `three/webgpu` and `WebGPURenderer`, but Rolling Hills is
  built on custom GLSL `ShaderMaterial` and `onBeforeCompile` surfaces.

### Rule

WebGL remains the default renderer. WebGPU work stays opt-in and must prove
adapter plus device creation in the actual runtime. Native packaging
dependencies should not be added until a later cycle is specifically scoped to
boot SDS in that shell and measure multiplayer, fullscreen, input, audio,
visual, latency, and perf behavior there.

---

## WebGPU diagnostic island stays outside the default bundle (2026-05-14 · Konveyor autonomous branch)

SDS now has a minimal WebGPU/TSL diagnostic boot path, but it is intentionally
not a production renderer path.

### Why

Directly bundling `three/webgpu` and `three/tsl` into the Vite graph pulled
WebGPU and node-material internals into the default Three chunk, violating the
existing refactor-baseline bundle ratchet. The diagnostic needs to prove
renderer/device viability without making every normal WebGL player download the
WebGPU renderer surface.

### Rule

- `?renderer=webgpu&diagnostic=1` is the only WebGPU boot path.
- The default SDS runtime still constructs `THREE.WebGLRenderer`.
- The diagnostic loads copied `three.webgpu.min.js` and `three.core.min.js`
  vendor modules only after the diagnostic flag is present.
- `three/webgpu` and `three/tsl` must not be statically imported by production
  game modules until the active handoff records a bundle and fallback decision.
- Runtime proof must record both the flagged WebGPU path and the default WebGL
  path before claiming progress.

---

## Screenshot goldens use deterministic Konveyor validation mode (2026-05-15 · Konveyor autonomous branch)

The 12-cell screenshot matrix now has committed goldens and is allowed to run as
a hard gate for the WebGPU migration.

### Why

The old screenshot diff either passed an empty matrix or failed noisily from
ambient randomness: strict `isReady()` checks did not match the perf hook,
Playwright full-page screenshots depended on browser screenshot behavior, scene
construction used random grass and rock placement, and live sim/camera movement
made same-scene captures drift.

### Rule

- `npm run validation:screenshots -- --diff` must find all 12 expected goldens.
- Captures use `probeRender=1`, `cinematic=1`, `visualGolden=1`, canvas
  `toDataURL`, paused simulation, seeded gameplay placement, and the
  fail-closed deterministic Konveyor rock route.
- Captures remain 1280x720, but SSIM is computed on normalized 320x180 luma so
  dense grass and alpha-hash shimmer do not dominate scene-level regression
  detection.
- `--baseline` rewrites are acceptable only for intentional visual changes with
  explicit acceptance recorded in the active handoff, a cycle plan, or this log.

---

## Production renderer setup is an explicit WebGL boundary (2026-05-15 · Konveyor autonomous branch)

SDS still boots production through WebGL, but renderer creation and WebGL-only
setup no longer live as loose constructor code inside `SceneManager`.

### Why

The migration needs a narrow production renderer boundary before any true
scene-bound WebGPU proof. `SceneManager` still owned renderer construction,
WebGL capability logging, context-loss handlers, shadow setup, pixel-ratio
setup, and tonemapping selection inline. That made it too easy to hide
WebGL-only assumptions while adding WebGPU material islands.

### Rule

- `SceneManager` must keep using the default WebGL renderer until the WebGPU
  production-scene gates pass.
- `js/rendering/sceneRendererSetup.js` owns production renderer setup and must
  guard WebGL-specific context access.
- `SceneManager` may accept an explicit renderer/configure factory for proof
  runs, but normal gameplay construction must continue to use the default WebGL
  setup until the production WebGPU fallback decision is recorded.
- `SceneManager.rendererSetup` is evidence of renderer posture, not a WebGPU
  boot claim.
- `SceneManager` must own async renderer readiness for injected proof renderers;
  `SceneManager.render()` must support async renderer backends without
  overlapping in-flight frames, and expose render status for proof artifacts.
- At this boundary point, a future WebGPU production proof must consume this
  boundary explicitly and keep plain `?renderer=webgpu` fail-closed until a
  narrower production gate or fallback decision is recorded.
- `?renderer=webgpu&diagnostic=1&konveyorSceneManagerProof=1` is allowed to
  inject `WebGPURenderer` into `SceneManager` for diagnostic proof artifacts.
  That proof must initialize through `SceneManager.whenRendererReady()`, render
  through `SceneManager.render()` using the async WebGPU path, and may route
  production `Atmosphere` sky/cloud/fog constructors
  plus production `SunBillboard`, `TerrainBuilder.createTerrain()`, and
  `AnimeWater.createAnimeWater()` construction plus representative
  `PortalEffect`, `CorralZapEffectPool`, tree/rock GLB
  material-replacement/native-instancing, `GrassSystem`, and
  `OptimizedSheepSystem` construction plus a Kiln impostor material/geometry
  slice through the diagnostic-installed
  `window.__sdsKonveyor*MaterialFactories` WebGPU supply on the injected
  `SceneManager` scene. It may add WebGPU-module
  ambient/directional lights inside the diagnostic harness to bridge the
  vendored WebGPU Three module split for lit node materials. It does not change
  the normal production call site, production lighting, or default renderer
  mode.

---

## Production WebGPU boot scout is guarded shell evidence only (2026-05-15 · Konveyor autonomous branch)

The campaign now needs evidence from the normal `main.js` entry, not only from
diagnostic scene modules. The first step is a minimal boot-shell scout that can
construct `SheepDogSimulation` with injected WebGPU `SceneManager` options
without claiming full gameplay rendering.

### Why

The injected `SceneManager` proof already demonstrates the renderer boundary,
factory supply, readiness, and async render loop. It still starts from the
diagnostic harness. Before production scene-body rendering can move, the normal
entry must prove it can accept a WebGPU renderer option without confusing
players, changing default boot, or silently treating WebGPU as production-ready.

### Rule

- The production boot scout is allowed only under
  `?renderer=webgpu&diagnostic=1&konveyorProductionBootScout=1&testNoCanvas=1`.
- The route must bypass the diagnostic scene boot, construct the normal
  `SheepDogSimulation` shell with injected `SceneManager` options, wait through
  `SceneManager.whenRendererReady()`, and record renderer setup/status evidence.
- `konveyorProductionSceneBody=1` may extend that guarded route to install the
  centralized WebGPU factory globals, run one normal scene-body init, and render
  one proof frame. It must remain under `testNoCanvas=1` until the normal
  animation/gameplay loop has its own gate.
- `konveyorNativeInstancing=1` may extend that scene-body proof to replace the
  guarded tree/rock placement path with native `THREE.InstancedMesh`. The proof
  must record tree/rock instance counts and an empty WebGL-only suppression list
  before claiming the `InstancedMesh2` blocker is cleared for that guarded route.
- `konveyorProductionLoopScout=1` may extend the same guarded route to advance a
  controlled async WebGPU scene-loop scout after scene-body init. It should
  drive `SheepDogSimulation.runFrame(deltaTime)` rather than duplicating the
  normal frame body. It must record frame count, render status, grass time
  advancement, performance-monitor frame count, shared-frame-step evidence,
  frame errors, console/page errors, and any warmup/per-frame timings. It is
  not a substitute for the normal browser `requestAnimationFrame` gameplay path
  or a perf threshold gate.
- `konveyorProductionRafScout=1` may extend the same guarded route to advance a
  bounded `requestAnimationFrame` scout through `SheepDogSimulation.runFrame`.
  It must record scheduler identity, monotonic timestamps, delta samples, shared
  frame-step evidence, render status, grass time advancement,
  performance-monitor frame count, frame errors, and console/page errors. It is
  still not normal gameplay parity while `testNoCanvas=1` owns the route.
- `konveyorProductionGameplayScout=1` may extend the guarded route without
  `testNoCanvas=1` only while `diagnostic=1` and
  `konveyorProductionBootScout=1` are present. It must use the normal
  constructor `init()` plus `animate()` path, autostart solo gameplay, record
  initialized/menu/gameplay state, dog and sheep presence, normal animation-loop
  frame advancement, grass advancement, async render status, a nonblank canvas
  screenshot, and console/page/init errors.
- Any WebGL-only production objects suppressed to make a proof render must be
  recorded in the artifact.
- This scout is not full production WebGPU boot, not gameplay parity, not
  full-scene tree/rock LOD parity, and not a fallback decision.
- At this decision point, non-diagnostic `?renderer=webgpu` must continue to
  fail closed to WebGL until the production WebGPU scene gates and fallback
  decision are recorded. Later decisions may add a narrower explicit production
  gate without changing default WebGL.

## Browser probe hygiene is part of render evidence (2026-05-15 · Konveyor autonomous branch)

Browser validation is not neutral if it leaves tabs, GPU contexts, animation
timers, service workers, or local servers alive after a probe. Those leftovers
can change perf profiles, screenshot comparisons, metrics, and WebGL/WebGPU
benchmark results.

### Rule

- Every browser probe must close Playwright pages, contexts, browsers, and any
  manually opened localhost tab before recording final evidence.
- Every probe-owned Vite dev or preview listener must be stopped after the
  artifact is captured.
- Agent-launched Vite dev servers must set `SDS_SUPPRESS_BROWSER_OPEN=1` so the
  repo's human-friendly `server.open` setting does not create real Chrome tabs
  during automation.

---

## Guarded WebGPU default-readiness uses semantic scene parity, not full-frame SSIM alone (2026-05-16 · Konveyor autonomous branch)

The guarded production WebGPU route now has a WebGL-vs-WebGPU gameplay parity
artifact across Field, Rolling Hills, and Open Country. The proof still keeps
WebGL as the default and keeps plain `?renderer=webgpu` fail-closed unless an
explicit production gate is present.

### Why

Full-frame SSIM is useful as a warning light, but it overweights high-frequency
alpha-hashed foliage and grass differences that are structurally different
between WebGL and WebGPU. The renderer migration needs a gate that catches
scene-level color, luma, terrain, camera, and placement regressions without
blocking on expected stochastic foliage differences.

### Rule

- `tools/konveyor-production-gameplay-parity-proof.mjs --enforce-default-parity`
  may mark the guarded route default-ready only when capture/runtime gates pass
  and semantic regions pass for upper-sky chroma, horizon chroma, ground chroma,
  and ground luma.
- Full-frame SSIM remains recorded as `advisoryChecks.fullSsim`; a miss there is
  polish evidence, not by itself a default-readiness blocker.
- The proof must continue to record renderer identity, WebGL default status,
  guarded WebGPU status, console/page errors, camera terrain clearance, and
  sheep placement against terrain/water.
- Scene-rebuild frame stalls must not advance gameplay by the stall duration.
  The client frame step caps `deltaTime` at 0.05s, and in-process scene rebuilds
  reset `lastTime` before re-enabling gameplay updates.
- `OptimizedSheepSystem` must receive the active scene heightfield before first
  instance matrices are written, and it must use terrain surface height for
  reset, update, force-update, and corral ascent transforms.

---

## Plain WebGPU request route may use production WebGPU (2026-05-16 · Konveyor autonomous branch)

The default-ready parity proof is now backed by an explicit non-diagnostic
production WebGPU request proof across all shipped scenes. After the request
and perf proofs passed, plain `?renderer=webgpu` is allowed to enter the
production WebGPU route on browsers exposing `navigator.gpu`, while default
URLs remain WebGL.

### Rule

- Default URLs remain WebGL.
- Plain `?renderer=webgpu` without `diagnostic=1` may construct the normal
  `SheepDogSimulation` shell with an injected `WebGPURenderer`, centralized
  Konveyor WebGPU factory globals, the WebGPU lighting bridge, native
  `THREE.InstancedMesh` tree/rock placement, and the production terrain, grass,
  sheep, water, and tree/rock material routes.
- If `navigator.gpu` is absent for a plain WebGPU request, the route must fail
  closed to WebGL with `fallbackReason: "webgpu-unavailable"`.
- If `navigator.gpu` is present but adapter/device creation fails, the route
  must fail closed to WebGL before constructing the WebGPU scene, with the
  device-preflight failure recorded.
- `konveyorProduction=1` remains a compatible marker for older proof URLs, but
  it is no longer required.
- `tools/konveyor-production-webgpu-request-proof.mjs` must pass across Field,
  Rolling Hills, and Open Country before treating that route as current truth.
  The proof must record `effective: "webgpu-production"`, no fallback,
  nonblank screenshots, WebGPU renderer identity, material/native-instancing
  gates, no console/page errors, default URL WebGL preservation, and a
  no-`navigator.gpu` fallback case plus a device-request failure fallback case.

---

## Explicit production WebGPU perf must be post-warmup and threshold-gated (2026-05-16 · Konveyor autonomous branch)

The explicit production WebGPU request route now has a separate perf proof. The
request proof validates renderer identity, route gating, materials, instancing,
screenshots, and clean console/page state; the perf proof validates sustained
post-warmup frame timing.

### Rule

- `tools/konveyor-production-webgpu-perf-proof.mjs` must run against the built
  preview route `?renderer=webgpu&autostart=1&mode=classic`
  for Field, Rolling Hills, and Open Country.
- The proof must warm each scene before sampling, reset `window.__perfHarness`
  so startup/shader compilation does not pollute the rolling frame-time window,
  then sample the steady-state window.
- The local desktop production WebGPU perf gate is average <= 22 ms,
  p95 <= 30 ms, and at least 240 samples for each shipped scene.
- A passing route still does not make WebGPU the default by itself. Default
  enablement remains gated by the broader Konveyor fallback and release
  decision.

---

## WebGPU default policy needs real renderer-resolution telemetry (2026-05-16 · Konveyor autonomous branch)

Current browser support tables are not enough to choose the public web default.
SDS needs its own route-resolution data because `navigator.gpu` can be present
while device creation fails, and because WebGPU availability still varies by
browser, OS, GPU family, and WebView shell.

### Rule

- Production boot may emit `renderer_mode_resolved` through the existing
  `/api/event` telemetry route.
- The payload must stay low-cardinality and primitive-only: requested renderer,
  effective renderer, fallback reason, WebGPU API presence, production WebGPU
  success, device-preflight success, and scene id.
- Do not flip `sheepdogsim.com` default URLs to WebGPU-first until the renderer
  telemetry, Cloudflare Web Analytics, and cross-browser/WebView proofs support
  the policy.

---

## Progressive WebGPU default and opt-in Cycle 38 tree route are current release policy (2026-05-16)

Matt approved moving the low-traffic web route to a progressive WebGPU request
after the production request, fallback, perf, settings-toggle, and multiplayer
proof packets landed. PR #52 merged that policy to `main`. The later Cycle 38
tree-impostor release packet is version `2.1.5` on
`codex/cycle-38-tree-impostors`.

### Rule

- Default web boot requests WebGPU on browsers that can create a WebGPU device.
- Unsupported WebGPU or failed adapter/device creation must fall back to WebGL.
- `?renderer=webgl` remains a forced WebGL escape hatch.
- The settings toggle must keep the experimental WebGPU opt-out path alive.
- The Cycle 38 tree path behind `?konveyorNativeTreeImpostors=1` is an opt-in
  review route: near native LOD0, mid branch-preserving native LOD1, and far
  lat/lon-hemi Kiln impostor quads with per-instance tile attributes.
- Do not describe the Cycle 38 tree route as production octahedral impostors.
  True octahedral sidecars, depth/parallax parity, transition polish, and green
  Android frame budgets remain future work.
- Do not call SDS mobile-ready. The current Android WebGPU matrix is
  screenshot-valid but budget-red.
- After any deploy carrying this packet, rerun the iOS Safari water canary and
  review renderer-resolution telemetry before making a stronger public default
  or mobile-readiness claim.

---

## Production WebGPU boot scout scaffolding is retired (2026-05-28 · Cycle 43)

The boot scout described above (2026-05-15) was diagnostic-only shell evidence:
a guarded `?renderer=webgpu&diagnostic=1&konveyorProductionBootScout=1` route
that constructed the simulation shell, recorded renderer setup, and (under
further query extensions) ran scene-body, loop, raf, and gameplay scouts. It was
the staging ground for moving production scene-body rendering onto WebGPU.

Cycle 42 shipped plain `?renderer=webgpu` as the proven production default
(v2.1.10). The scout's job was finished. Its routes, recorder, and tool runners
were dead weight that still parsed query params, branched boot, and imported a
557-line recorder on a path no shipped URL takes.

### What was removed

- `js/diagnostics/konveyorProductionBootScoutRecorder.js` (the 557-line recorder).
- `tools/konveyor-production-boot-scout.mjs` and
  `tools/konveyor-production-gameplay-parity-proof.mjs` (scout-only runners).
- The `productionBootScout` query parse, the `webgpu-production-boot-scout`
  effective mode, and `__sdsG.productionBootScout` in `index.html`.
- The scout dispatch branch and dead scout-error block in `js/main.js`.
- The `konveyorProductionBootScout` dataset marker in
  `js/rendering/konveyorProductionWebGpuBoot.js`.
- The `explicitScoutRoute` clause in
  `shouldUseKonveyorProductionNativeInstancing` and the scout-route test.

### Why it was safe

Production native tree/rock instancing never depended on the scout query. It
rides `isKonveyorProductionWebGpuActive()` (the shipped
`effective === 'webgpu-production'` window state) plus the explicit
`konveyorNativeTreeImpostors` opt-in route. The instancing-adapter tests were
repointed to simulate the real production WebGPU window rather than the dead
scout query, which tightened coverage onto the actual ship gate. All affected
tests pass unchanged in behavior.

### What stayed

- `isKonveyorProductionWebGpuActive()` and the production WebGPU window state.
- The `konveyorNativeTreeImpostors` opt-in review route.
- The `konveyorNativeInstancing` userData marker in `js/world` (the production
  native-instancing signal, not scout-only).
- `tools/konveyor-production-webgpu-request-proof.mjs` and
  `tools/konveyor-production-webgpu-perf-proof.mjs` (the surviving production
  WebGPU proofs).

## Cycle 44 Phase 1 — dependency-security overrides (2026-05-28)

Two moderate, dev-only transitive npm advisories were resolved with top-level
`overrides` rather than parent bumps, matching the existing `qs` / `tmp` /
`@tootallnate/once` override pattern.

- **uuid** (GHSA-w5hq-g745-h8pq, "missing buffer bounds check in v3/v5/v6 when
  buf is provided", Dependabot alert 25). The flagged copy was `uuid@9.0.1`,
  pulled transitively through `browserstack-node-sdk -> googleapis ->
  google-auth-library -> gaxios` (and `googleapis-common`). Pinned `uuid` to
  `^11.1.1`, the patched line. `^11.1.1` stays inside 11.x and deliberately does
  not float to 12.0.0 / 13.0.0, which are themselves in vulnerable ranges per
  the advisory. The direct `browserstack` uuid was already 11.1.1, so the tree
  dedupes to one patched copy.
- **protobufjs** (GHSA-jggg-4jg4-v7c6, "DoS via unbounded recursive JSON
  descriptor expansion"). The flagged copy was `protobufjs@7.5.7`, pulled
  through `browserstack-node-sdk -> @grpc/*` / `@google-cloud/compute`. Pinned
  to `^7.5.8` (resolves to 7.6.1), staying in the 7.x line that
  `@grpc/proto-loader` expects rather than jumping to 8.x.

Both packages are `devDependencies` only (BrowserStack test tooling) and never
reach the browser bundle in `dist/`. Override was chosen over a parent bump
because the parents (`browserstack-node-sdk` and the deep google/grpc chain)
had no newer release that drops the flagged versions, and over "document and
leave" because a one-line override is cheaper to carry and takes `npm audit` to
zero. Verified: `npm audit` reports 0 vulnerabilities, `npm test` 498/505 green,
`npm run build` clean.

## Cycle 44 Phase 2 — main-bundle ratchet via vendor chunk split (2026-05-28)

The Vite `main-*.js` chunk had grown to ~607 kB (Vite's 1000-based display),
tripping the Cycle 41 bundle-size ratchet. Resolved by extending `manualChunks`
in `vite.config.js` with a `vendor` group for two eager leaf node_modules deps
that were being folded into `main`: `@three.ez/instanced-mesh` (used by
TerrainBuilder / RockPlacement / TreePlacement) and `kdbush` (used by
shared/SceneObstacles). This mirrors the existing `react` / `three` / `i18n`
chunk groups: leaf deps, one-way `main -> chunk` import, no circular risk.

Result (Vite 1000-based raw display / gzip / harness 1024-based KiB):

- `main-*.js`: 607 -> 546.42 kB raw, gzip 159.85 kB. Harness KiB: 593 -> 534.
- `vendor-*.js`: new, 60.79 kB raw, gzip 18.65 kB. Splitting it out also lets it
  cache across deploys independently of the churnier `main`.
- `three-*.js`: unchanged at 617.79 kB raw, gzip 157.33 kB. In the harness's
  1024-based KiB this is 603, exactly the recorded baseline. The "~617 kB"
  figure in the Cycle 44 plan was Vite's 1000-based raw display, not the
  1024-based KiB the ratchet records, so `three` never actually crossed its
  ratchet and no `three` re-baseline was needed.

Gzip transfer (what players actually pay): main 159.85 kB, vendor 18.65 kB,
three 157.33 kB.

Re-baselined `tests/refactor-baseline/__fixtures__/bundle-sizes.json` `mainKB`
593 -> 534 to record the new post-build actual. The refactor-baseline README
convention is "recorded post-build", and Cycle 41 set the ratchet at the actual
with zero headroom; recording 534 restores an honest floor so `main` cannot
silently re-bloat from 534 back to the stale 593 before tripping. `threeKB`
stays 603 (unchanged). The fixture is a characterization ratchet with no runtime
consumer, so re-baselining changes no behavior. Verified: `npm run build` clean,
`npm test` green including the refactor-baseline bundle-size assertions.
