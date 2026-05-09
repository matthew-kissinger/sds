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
