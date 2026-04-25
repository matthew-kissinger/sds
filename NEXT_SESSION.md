# Next Session — Cycle 4 Hardening

> Updated 2026-04-25. Cold-start agents: read this page top-to-bottom, then [`docs/cycle-4-hardening.md`](docs/cycle-4-hardening.md) for the live punch list and the full table of what shipped. Earlier-cycle context: [`docs/cycle-4-plan.md`](docs/cycle-4-plan.md), [`docs/cycle-4-phase-b.md`](docs/cycle-4-phase-b.md), [`docs/cycle-3-plan.md`](docs/cycle-3-plan.md), [`docs/cycle-2-report.md`](docs/cycle-2-report.md).

## Running locally

First time on a fresh clone:

```
npm install
cp worker/.dev.vars.example worker/.dev.vars   # sets JWT_SECRET for local
npm run dev:setup                              # applies D1 migrations to local sqlite
```

Every session after that:

```
npm run dev    # starts Vite (:3000) + wrangler (:8787) together
```

Granular alternatives: `npm run dev:client` (just Vite), `npm run dev:worker` (just wrangler), `npm run dev:lan` (Vite with `--host` + wrangler).

Open `http://localhost:3000` (or `:3001` if :3000 is taken — Vite auto-increments). `?scene=field`, `?scene=rolling-hills`, `?scene=open-country` to skip the picker.

## Where the project stands (2026-04-25)

- `sheepdogsim.com` is live on Cloudflare Pages + Worker + DO + D1 (see [`docs/cycle-2-report.md`](docs/cycle-2-report.md)).
- Gameplay loop (solo, sandbox, local 2P, online 2-4P, three modes) is stable.
- Droplet decommissioned target ~2026-05-01 (see [`docs/cycle-2-todo.md`](docs/cycle-2-todo.md)).
- **Cycle 3 done.** [`DECISIONS.md`](DECISIONS.md) § Cycle 3.
- **Cycle 4 Phase A done** (PRs B–M). 11 parallel units shipped: Three.js 0.184, baked heightmaps, scene schema widened, `Heightfield`, Atmosphere (Hosek-Wilkie sky), `ProceduralMountains`, `CameraController`, open-country biome, GrassSystem polish, scene retunes. Detail: [`docs/cycle-4-plan.md`](docs/cycle-4-plan.md).
- **Cycle 4 Phase B done** (#42 + tonemap fix). Heightfield wired through TerrainBuilder/GrassSystem/sheep/dog; Atmosphere wired into render path; slope-modulated sheep speed; prop placement on terrain; camera y-clamp.
- **Cycle 4 Hardening — substantially complete and deployed.** 24 fixes shipped across three playtest-driven batches in 7 commits on `main` (66b0df6 → 593f175); full table at [`docs/cycle-4-hardening.md`](docs/cycle-4-hardening.md). 74/74 vitest specs pass; production build clean. GH Actions deploys ran green. **Verified live on sheepdogsim.com 2026-04-25** — zero console errors, all visual checks pass.

### What changed this session (one-line summary, full table in the hardening doc)

Visual / perception:
- **Mountains gone**, terrain plane extended to 2400m / 1600m with a smooth radial heightfield falloff so the play area reads as an island in a flat skirt, fading to fog horizon (no abrupt edge).
- **Terrain fog driven by `scene.fog`** (Atmosphere-managed, FogExp2 density 0.0006). Color matches the sky's horizon per-frame so the terrain-to-sky transition is seamless across all presets (pastoral-noon, dusk, golden-hour, dawn, overcast). Earlier custom fog (warm-grey-green at 350/1100m) was replaced because it didn't match the dynamic sky.
- **Atmosphere is the single source of truth for sky + fog** (Phase B removed `scene.background` and the legacy `scene.fog` setup; Hardening removed the terrain's competing custom fog).

Grass:
- **Stochastic LOD dither** in the vertex shader hides density transitions — smooth gradient in every camera, no ring snap.
- **Zen wind** — three noise samples at different rotations averaged; field shimmers softly, no advancing wavefront.
- **Body-shaped interaction** — each entity reports a facing direction; the shader uses an oriented rounded-rectangle SDF so the dog's bend zone follows the dog's actual mesh footprint as it turns. Sheep get the same treatment with smaller extents.

Terrain entities:
- **Sheep + dog tilt on slopes** via `heightfield.normal`, clamped to ~22°/18°, YXZ rotation order.
- **Trees + farmhouse no longer sink** — child mesh transforms baked into geometries at GLB load time + per-model `bbox.min.y` offset compensation.
- **Far trees as 3-quad impostors past 250m** — ~99% triangle reduction; offscreen-baked texture per tree type.
- **Fence rails span terrain slope** via per-rail `userData.railSpan` metadata + post-process quaternion rebuild.

Game loop / structure:
- **Open Country pen has a front fence** flanking the gate (sheep can no longer walk around).
- **Open Country has no perimeter fence** (already shipped batch 1; flag-driven via `perimeterFence: false`).

UX:
- **Camera-mode HUD chip** at top-center, tappable on every platform (`C` on desktop, "Tap" on mobile) — full mobile parity.
- **Player chevron** now tracks `mesh.position.y` instead of y=0 (no more parallax drift on hills).
- **Scene descriptions** rewritten — em-dashes removed; Rolling Hills no longer says "more sheep" (sheep count is mode-driven, not scene-driven).

Post-deploy polish:
- **Camera far plane bumped** (commit 0a077d7) from 1000m / 500m to 2800m / 1800m (desktop / mobile). Was clipping the new 2400m / 1600m terrain plane diagonals at wide zoom-outs, leaving a black wedge between terrain edge and atmosphere skybox. The skybox glues to the far plane, so the far plane now also controls how far the visible sky reaches.
- **Trees no longer spawn on big rock formations** (commit 0a077d7). `addEnvironmentDetails` populates `this.rockPositions = [{x, z, radius}]` as it places each rock; `createTrees` now runs after rocks (call order swapped in `main.js`) and the Poisson-disk validator rejects candidates inside any rock's footprint plus a 4m padding.
- **Terrain shader wired to `scene.fog` instead of a custom hand-rolled fog** (commit 593f175). The terrain previously faded to a fixed warm-grey-green via its own uniforms, while Atmosphere drove `scene.fog` to match the sky's horizon color per-frame — so the meeting line between terrain (grey-green) and sky (whatever the preset showed: white at noon, dark at night) was a visible cutoff. Replaced with Three.js's standard fog chunks (`fog_pars_*` + `fog_*`), `material.fog = true`, and `THREE.UniformsLib.fog` merged into the material. Terrain now fades into the same color as the sky at the same distance regardless of preset; transition is seamless.

## What to pick up next

Read [`docs/cycle-4-hardening.md`](docs/cycle-4-hardening.md) for the live list. Big rocks remaining (none of these are blocking — all gameplay works today):

1. **Rolling Hills as an island** (game loop, ~5 hr). User-aligned design: water-bounded island, sheep roam free, find-the-corral objective. Spec in the hardening doc § 1.
2. **Open Country game loop pick** (still undecided). Three options sketched in the hardening doc § 2; author preference is **time attack** (cheapest, distinct register from Rolling Hills). Needs user sign-off before code.
3. **Resize behavior** — on hold pending user reproduction; resize handler looks correct.

Smaller items / future:
- Octahedral impostors as v2 of the tree LOD (current 3-quad version is solid).
- Tree exclusion in play area is already implemented; verify visually if heightmaps re-bake.

### Standing risks

- **Y-sample regression surface is wide.** A bad heightfield change still makes the dog float, sheep sink, grass clip — all simultaneously. After any change in this area, manually verify all three scenes in all three camera modes.
- **MP joiner renderer sync.** Joiners whose URL-param scene differs from the room's see correct sim but mismatched visuals. Phase B's terrain displacement makes this more visible. Carried over from Cycle 3.
- **Sim-baseline fixtures are one-way.** Don't regenerate without understanding the diff. They were last regenerated for the slope-modulated sheep speed in Phase B; do not touch unless `MovementPhysics` changes again.

### Deferred (not blocking hardening)

- **Cycle 3 Track 2 follow-through** (UI/UX polish): scene-first state machine in `App.js`, mode-shaped HUD profile, onboarding overlay, compass locator (now part of hardening item #1), real dog PNG thumbnails, MP-joiner renderer reactivity. Detail: [`docs/cycle-3-ui-ux.md`](docs/cycle-3-ui-ux.md).
- **Cycle 3 Track 1 polish:** JSX flip (mechanical codemod), boid consolidation (needs architectural decision). See [`docs/cycle-3-cleanup.md`](docs/cycle-3-cleanup.md) § Remaining.

## How to read the rest of the repo

| Area | Source of truth |
|---|---|
| Live hardening punch list | [`docs/cycle-4-hardening.md`](docs/cycle-4-hardening.md) |
| Cycle 4 Phase A plan | [`docs/cycle-4-plan.md`](docs/cycle-4-plan.md) |
| Cycle 4 Phase B integration | [`docs/cycle-4-phase-b.md`](docs/cycle-4-phase-b.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| What Cycle 2 shipped | [`docs/cycle-2-report.md`](docs/cycle-2-report.md) |
| Cycle 2 punch list | [`docs/cycle-2-todo.md`](docs/cycle-2-todo.md) |
| Cycle 3 plan + tracks | [`docs/cycle-3-plan.md`](docs/cycle-3-plan.md) |
| How to add a biome | [`docs/adding-a-biome.md`](docs/adding-a-biome.md) |
| Prior postmortem | [`docs/archive/POSTMORTEM.md`](docs/archive/POSTMORTEM.md) |

## What NOT to do

- Don't rearchitect multiplayer. It works.
- Don't reintroduce procedural mountains. If we want a horizon ring later, the right path is a height-displaced skirt that blends into the play-area heightfield, not the annulus shader.
- Don't add new scenes. Three is the right number; finish the loops on the ones we have.
- Don't move sim logic out of `shared/`. Island boundary work belongs in `MovementPhysics` so the Worker sim stays in lockstep.
- Don't blow up `main.js` in one PR. Shrink it one responsibility at a time.
- Don't regenerate `tests/sim-baseline/` fixtures unless you understand exactly what changed and why.
