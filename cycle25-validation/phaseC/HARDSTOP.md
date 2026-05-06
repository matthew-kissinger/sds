# Phase C — atmospheric truth — PARKED

**Trigger:** scope-too-large for autonomous overnight session.

## Why parked

Phase C calls for:

1. **`js/atmosphere/AerialPerspectiveLUT.js`** — 32×32×32 R11G11B10F 3D
   texture encoding (in-scattering, transmittance) per (view-pitch,
   view-azimuth, distance) slot. Inputs: sun direction, atmosphere
   parameters from existing sky shader. Regenerates when sun moves > 2°.
2. **`js/shaders/HeightFogPatch.js`** — replaces `<fog_fragment>` chunk
   in `onBeforeCompile`. Density `ρ(y) = ρ₀ * exp(-(y - y₀) / H)`,
   integrated along view ray (closed-form for exponential height fog).
   Reads aerial-perspective LUT for tint instead of static `fogColor`.
3. **Replace `THREE.Fog`** — `Atmosphere.js` no longer instantiates
   `THREE.Fog` / `FogExp2`. All world materials patch via
   `HeightFogPatch.patchMaterial(mat, lutTexture)`.
4. **Per-scene fog config simplifies** — `sceneDef.fog: { near, far,
   color }` collapses to `sceneDef.atmosphere: { groundAlbedo,
   horizonHue }`.
5. **Kiln impostor reads LUT** — replaces inline `vFogDepth` desat math
   with LUT-sampled aerial perspective.

This is genuinely multi-day-class work — Hillaire 2020 / Bruneton-style
precomputed scattering + 3D-texture lifecycle + integration with every
patched material in the codebase + per-scene config migration. The
4-hour estimate in the cycle plan was optimistic.

## What's reverted

Nothing. Phase C never landed code; the cycle plan files documenting
its intent stay in place for Cycle 26+ pickup.

## What this means for downstream phases

- **Phase D (impostor parity)** — partial dependency on Phase C for
  sky-LUT-coupled relighting + replacing inline desat math. Without
  Phase C the impostor relighting stays on the existing 3-uniform
  (`uSunColor`/`uAmbientColor`/`uGroundBounceColor`) plumbing. Phase D
  proper (8×4 atlas re-bake + padded mips + hybrid trunk-mesh) can ship
  independently.
- **Phase G (tree art direction)** — also a soft dependency for
  per-scene atmospheric distinction; without Phase C, scenes still
  read distinct via the post-Phase-B fog retune + Phase G's per-scene
  tree distribution profiles, just less atmospheric depth at distance.

## Recommended morning actions

1. Read [`docs/cycle-25-plan.md`](../../docs/cycle-25-plan.md) Phase C
   spec.
2. Schedule Phase C as its own cycle (Cycle 26 candidate) with a
   realistic time budget (2-3 days of focused work).
3. Capture goldens for the post-Phase-B fog retune as the new baseline
   so Cycle 26 has a reference point.

## Budget delta

Plan: 4hr autonomous. Realistic: 16-24hr focused. Parked rather than
ship a half-built LUT that compounds visual debt.
