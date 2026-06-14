# Next Session - Cycle 101 (impostor-bake-repass)

> **Updated:** 2026-06-14
> **For:** Cycle 101 (`docs/cycle-101-plan.md`)
> **Pickup priority:** Start with Phase 1 (the spike). Prove a view-dependent relit impostor on a single tree in the orbit lab and pick latlon-vs-octahedral + channels + resolution + the per-chunk-extension approach WITH NUMBERS before the bake. The plan is fully authored (not a stub).

## First action: the spike

Cycle 101 implements proper impostors. The plan is authored end-to-end, but the representation is deliberately unresolved: Phase 1 is a risky-primitive spike that answers Q1-Q4 (octahedral vs latlon-hemi, depth channel kept or dropped, atlas resolution, and how to give the per-chunk islands a far band) with measured numbers, saved to `cycle101-validation/`. Use `js/impostors/impostorOrbitLab.js` + the `?webgpuNativeTreeImpostors` debug route. Do not start the bake (Phase 2) until Q1-Q4 are RESOLVED in the plan.

## The decisive finding (why this cycle exists)

Four research agents (SDS-current, pixel-forge, terror-in-the-jungle, vegetation-research/ez-tree) converged on one fact: **the far-tree impostor players see is a flat single-angle cross-billboard.** On the only default path that renders far-tree impostors (NSL / coastline consolidated compute-cull), far trees are `createColdImpostorGeometry(atlas.sidecar, 0)` - a static 3-quad cross-billboard sampling ONE azimuth tile (column 0) with a plain `MeshBasicMaterial` (no view-dependent tile select, no normal relight, no depth). The sophisticated kiln material (`js/kiln-impostor-material.js` WebGL + `js/webgpuKilnImpostorNodeMaterial.js` TSL: camera-driven 3-tile blend + per-fragment relight) ships on NO default path - debug route only. SDS already owns ~80% of the pieces; this cycle wires them onto production + re-bakes to feed them properly, and extends the far band to Rolling Hills + Open Country (LOD0-only today).

## References to borrow from

- **pixel-forge v0.2.0** (`../pixel-forge`): the mature Kiln BAKER. Full octahedral 8x8, baseColor-unlit + capture-view normal + depth, `bleedTransparentRgb` edge-bleed, ortho pole-flip capture. Runtime shader NOT included.
- **Fable5 demo** (vendored in TIJ at `../terror-in-the-jungle/examples/fable5-world-demo`): the gold-standard RUNTIME. `src/vegetation/Impostors.ts` (bake) + `src/render/ImpostorRuntime.ts` (4-tile bilinear blend + normal relight via `transformNormalToView` rotated by instance yaw, depth-in-normal-alpha, BFS dilation, `specularIntensity 0.25`).
- Gotchas already paid for: skinny-trunk double-image on azimuth blend (pin stable azimuth / enough angles); transparent-black dark halo (dilation); night ambient multiply INSIDE albedo; far impostors must NOT cast shadows (SDS durable rule - Fable5's crown-proxy far shadows stay OUT unless Matt authorizes).

## Cold-Start Orientation

Read in order: this file -> [`docs/cycle-101-plan.md`](docs/cycle-101-plan.md) -> `.claude/rules/scene-and-render.md` (foliage LOD, far-tree impostors, no-far-impostor-shadow, scene-def-flag rule) -> `docs/archive/research/webgpu-octahedral-impostor-spike-2026-05-16.md` (prior octahedral spike) -> [`docs/BACKLOG.md`](docs/BACKLOG.md) (Cycle 100 + 99 entries) -> `git log --oneline -6`.

## Where it stands

**Cycle 100 (`terrain-compression`) closed + shipped + deployed.** Brotli-pre-compress terrain heightfields on the CF Pages build: 16 MiB -> 3.85 MiB on the wire, lossless (`Content-Encoding: br` decodes below `fetch()`, byte-identical float32), zero baseline moves. Feature `17d1ebf0`, deploy `27514489101` green; 1552 vitest / lint / build green; no version bump (still 2.3.4). The fence dissolved by measurement: terrain `.bin` is a client-only asset (Worker sim loads no heightfield), so `shared/terrain/Heightfield.js` was untouched.

**Cycle 101 (`impostor-bake-repass`) is fully authored.** 7 phases (spike -> bake -> material -> NSL wire -> per-chunk band -> validation -> paired close). Atlas/sidecar/`objects.manifest.json` are not fence-frozen (re-bake allowed); `shared/` untouched.

## Standing carryover (do not drop)

- **itch/native terrain wire win** - Cycle 100 scoped the win to Cloudflare Pages; an explicit-decode (`DecompressionStream`) path would cover itch/native if measured worth it.
- **Golden harness staleness (test-infra)** - `tools/validation/golden/` no longer reproduces against the current capture environment (7/12 below 0.95, run-to-run stable, LOD0-tree deltas unrelated to any recent render change). Re-baseline under the canonical environment or gate the capture on a deterministic scene-settled signal. Cycle 101 explicitly does NOT use it as the impostor gate.
- **Paired launch session** - NSL-as-default-world (still Rolling Hills), version bump, itch/devlog/social posting (Matt's voice), S24+ device pass.
- **three r185** blocked until it publishes (latest 0.184.0); checklist `cycle96-validation/r185-readiness.md`.
- **Rock re-bake** behind the Cycle 96 collider-parity harness; needs a design direction.
- **Matt's Cycle 95 prod validation** (A/B/C/E/D/F) - if prod shows a rejected element, re-capture the affected goldens.
- **Survival onboarding translation** (es/ja/pt/zh-CN) once the English copy locks.
- **NPC-sheepdogs** owner intake - needs an approach proposal before dispatch.
