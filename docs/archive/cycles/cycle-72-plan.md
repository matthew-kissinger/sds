# Cycle 72 — webgpu-first

> Drafted 2026-06-08 after Cycle 71 (`newsheepdogland-load-fix-and-hero`) closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **This is a STUB** (Goal sketched from Matt's direction; finalize Phases at `/cycle-start`). Cycle 71 stopped the newsheepdogland load crash by pinning that one scene to WebGL. Matt wants the opposite end state: **WebGPU-first — every scene defaults to WebGPU when available**, so this cycle makes the heaviest scene actually viable on WebGPU and removes the pin. Framing: polish toward packaging + official marketing so people can play (with a good bit more development still ahead). The deferred `feel-and-media-live` paired track moves to a later cycle.

## Goal

Make WebGPU the working default for every scene, including the heaviest survival island, so the Cycle 71 WebGL pin on newsheepdogland can be removed and all scenes run WebGPU when the device supports it. The before/after a player sees: today newsheepdogland is force-routed to WebGL (the only scene not on WebGPU); after, it loads on WebGPU without the cold-compile freeze and with correct lighting, like every other scene. Also retract the inert grass far-ring so the codebase + records are honest, as part of a polish pass toward packaging-readiness.

## Open questions to resolve before writing code

1. **Q1: How to kill the ~43s cold-compile main-thread block on WebGPU?** Author lean: pre-compile the scene's pipelines off the blocking path during the existing load screen (`renderer.compileAsync(scene, camera)` before the first `renderAsync`), so the GPU driver's WGSL->DXIL compile runs without wedging the tab / tripping TDR. Measure-first: confirm where the cold block actually lands (mesh-build vs first render) on the RTX 3070 before committing. Fallback if compile is irreducibly long: keep a per-scene WebGL pin as a last resort only.
2. **Q2: Retract the far-ring, or re-gate it to actually run?** Matt's lean: **retract** (remove the dead `grass.farRing` config + the gated branch, correct the Cycle 70 record). The "37.6% cut, LIVE" never ran (gated behind `meadowQuadEnabled` = false on every tier). Re-gating is the alternative if the triangle win is wanted, but it is a visual change needing a real-browser seam check.

## Candidate phases (starting point — measure-first; finalize at /cycle-start)

- **P1 — Measure the WebGPU cold-compile (risky-primitive spike).** On the RTX 3070, instrument where the cold block lands per scene (mesh-build vs first `renderAsync`), and whether `compileAsync` moves it off the main thread. Output to `cycle72-validation/`. Gate the fix approach on numbers before touching the konveyor path.
- **P2 — Non-blocking cold compile.** Pre-compile pipelines during the load screen so newsheepdogland (and any heavy scene) never freezes/TDRs on WebGPU. Verify on the real GPU.
- **P3 — Fix the WebGPU node-lighting on newsheepdogland** ("Light node not found for AmbientLight/DirectionalLight" every frame). The scene's lights aren't binding into the node-material lighting graph.
- **P4 — Remove the WebGL pin; WebGPU-first everywhere.** Once P2+P3 verify newsheepdogland on WebGPU within budget, drop `renderer:'webgl'` from `newsheepdogland.js` (keep the `SceneDef.renderer` mechanism as an available fallback). Every scene defaults to WebGPU when available.
- **P5 — Retract the inert far-ring.** Remove the dead `grass.farRing` config + the `GrassSystem` branch (cohesion rule: it is a removal of an additive gated path, not a decomposition), drop the `GrassFarRingDef` schema field (fence migration: removal, document consumers), and correct the Cycle 70 record. Render-only; sim-baselines untouched.
- **P6 — Packaging-polish pass (optional).** Whatever small readiness items surface (entrance hero FINAL dial-in, etc.). Skip anything that does not move packaging-readiness.

## Dependencies

```
P1 -> P2 -> P3 -> P4 ; P5 parallel ; P6 last
```

## Frozen files (cycle-specific additions)

- **konveyor WebGPU subsystem** (`js/rendering/konveyorProductionWebGpuBoot.js`, the node-material factories) — sensitive; change behind the P1 measurements, not on a guess.
- **`shared/scenes/types.js`** (fence-frozen schema) — P5 removes the `farRing` field (a removal, not an additive case): list every consumer in the same PR. The `renderer` field stays.
- **`js/GrassSystem.js`** (cohesion-frozen) — P5 removes the far-ring branch only; do not decompose.
- **`shared/`** — no sim change this cycle; sim-baselines stay byte-identical by construction.

## Hard stops

Durable stops apply on every cycle — see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. If removing the WebGL pin (P4) reintroduces any multi-second main-thread block on newsheepdogland on the RTX 3070, **stop** — the pin goes back until P2 actually holds.
2. Any `shared/` sim-baseline drift aborts the phase (this cycle is render-only).

## What NOT to do during this cycle

- Don't ship P4 (remove the pin) before P2+P3 are verified on the real GPU — a regression here is the live crash again.
- Don't start the `feel-and-media-live` paired track here (it is a later cycle).

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When newsheepdogland is loaded on a WebGPU-default browser, it shall finish loading on WebGPU within budget (no multi-second freeze, no WebGL pin).
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — the template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items (Cycle 71 carryover)
- [`docs/archive/cycles/cycle-71-plan.md`](archive/cycles/cycle-71-plan.md) — the cycle just closed (the WebGL pin this cycle removes)
- `cycle71-validation/webgpu-crash/findings.md` — the cold-compile root-cause measurements
