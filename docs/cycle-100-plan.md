# Cycle 100 — terrain-compression

> Drafted 2026-06-14 after Cycle 99 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **Scaffold stub.** Cycle 99 realized the KTX2 dist win (dist 54 -> 46 MB). The asset-weighting analysis (`DECISIONS.md` Cycle 98) named terrain `.bin` as the single biggest remaining per-scene-load asset. Fill the Goal + Phases at `/cycle-start`.

## Goal

(Fill at `/cycle-start`.) Compress the baked terrain heightfields. Each scene ships a `public/terrain/<scene>.bin` of uncompressed float32 (4 MB x 4 scenes = ~16 MB), downloaded per scene-load - the largest single per-scene-load asset now that impostors are KTX2. Candidate approaches: int16 quantization (2x), a packed/normalized integer format, or gzip/br at the CDN layer (Cloudflare may already br-compress; measure the wire reality before quantizing). The user-visible win is faster scene-load (less to download), with zero change to terrain shape.

## How to read this plan

The hard constraint is determinism + the heightfield single source of truth. The terrain mesh and every entity that sits on the ground read the same Y at every (x, z) via `shared/terrain/Heightfield.js` -> `TerrainBuilder._groundY`. Any change to the baked values (quantization rounding included) changes that Y, which:

- Moves the visible terrain mesh and every grounded entity (trees, rocks, dog, sheep, camera ridge clamp).
- Changes the deterministic sim if slope-modulated speed reads a different height -> MP desync risk + sim-baseline drift.
- Trips the refactor-baseline terrain-mesh-hash and any sim-baseline terrain hash.

So the cycle must decide: is the compression **lossless** (gzip/br, packed-but-exact) - in which case no baseline moves - or **lossy** (int16 quantize) - in which case the quantization is a deliberate, recorded sim/refactor-baseline regeneration with the decision in this plan's Acceptance, and the quantization step must be small enough that gameplay/visuals are unaffected. Prefer lossless first; reach for quantization only if the wire measurement shows lossless is not enough.

Read before authoring: [`shared-sim.md`](../.claude/rules/shared-sim.md) (deterministic-sim contract + sim-baseline discipline), [`scene-and-render.md`](../.claude/rules/scene-and-render.md) (heightfield single-source-of-truth), `scripts/bake-heightmap.mjs` (the baker that writes the `.bin`), `shared/terrain/Heightfield.js` (the runtime reader, fence-frozen).

## Open questions to resolve before writing code

1. **Q1: What does the wire actually cost today?** Author lean: measure the deployed `.bin` transfer size (Cloudflare may already serve br/gzip). If the wire is already ~4 MB compressed, int16 quantization buys little and the determinism risk is not worth it - pivot to the bake re-pass instead.
2. **Q2: Lossless or lossy?** Author lean: lossless (a content-encoding or exact packed format) keeps every baseline pinned and is the safe default. Lossy int16 only if Q1 shows lossless is insufficient, and only with a recorded sim-baseline + refactor-baseline regeneration.

## Frozen files (cycle-specific)

- `shared/terrain/Heightfield.js` - deterministic-sim core + heightfield SSOT ([`INTERFACE_FENCE.md`](INTERFACE_FENCE.md)). A runtime-decode change here needs a migration story (does it change MP for in-flight sessions? does any baseline move?) per the fence protocol.
- `tests/sim-baseline/*.json` and `tests/refactor-baseline/__fixtures__/*` (terrain-mesh-hash) - regenerate only with a recorded decision (durable emergency stop).

## Hard stops

- If a lossy step moves a sim-baseline trace, stop and surface before regenerating (durable sim-baseline drift stop). A lossy terrain change is a deliberate, recorded act, not a shortcut to green tests.
- Union with [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md).

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the terrain compression is lossy, the sim-baseline + refactor-baseline regeneration shall be recorded in this plan's Acceptance with the explicit decision; when lossless, no baseline shall move.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.

## Carryover (not necessarily this cycle's scope)

- **Impostor bake re-pass (paired)** - atlas resolution, normal-vs-depth necessity, the unbenchmarked Pixel Forge Kiln tool.
- **Golden harness staleness (test-infra)** - `tools/validation/golden/` no longer reproduces against the current capture environment (surfaced Cycle 99 Phase 1; not KTX2-related). Re-baseline or gate the capture on a deterministic scene-settled signal.
- **Paired launch session** - NSL-as-default-world, version bump, itch/devlog/social posting, S24+ device pass.
- **three r185** (upstream-blocked, latest 0.184.0); **rock re-bake** (needs design direction); Cycle 95 prod-validation; NPC-sheepdogs owner intake; Survival-copy translation.

## References

- `DECISIONS.md` "Cycle 98" — the asset-weighting analysis (terrain `.bin` named as the biggest remaining load lever)
- [`docs/archive/cycles/cycle-99-plan.md`](archive/cycles/cycle-99-plan.md) — the KTX2 Phase 5 plan
- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
