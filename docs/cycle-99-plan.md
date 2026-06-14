# Cycle 99 — asset-diet

> Drafted 2026-06-14 after Cycle 98 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **Scaffold stub.** Cycle 98 shipped the KTX2 encode -> load pipeline + the dead-octahedral dist drop; the asset-weighting analysis (`DECISIONS.md` Cycle 98) pointed the remaining big levers at terrain `.bin` size and the impostor bake. Fill the Goal + Phases at `/cycle-start`.

## Goal

(Fill at `/cycle-start`.) The candidates, from the Cycle 98 carryover + the asset-weighting analysis:

- **KTX2 Phase 5 (finish the win).** The dusk-canopy A/B (orientation/`isYFlip` + depth/normal transcode quality are the top checks; the desktop golden suite already exercises tree1/tree2 impostors), then DROP the impostor PNGs from dist. dist currently ships both `.png` and `.ktx2`, so the dist-shrink and the ~96 MB live-set VRAM win are not realized until the PNGs leave dist. Bounded, prod-testable.
- **Terrain `.bin` compression.** 16 MB of uncompressed float32 (4 MB x 4 scenes), downloaded per scene-load - the single biggest per-scene-load asset. int16 quantize or a packed format; validate against the heightfield single-source-of-truth contract (`shared/terrain/Heightfield.js`) + the sim-baseline terrain hashes.
- **Impostor bake re-pass (human-in-the-loop).** Trees are ~33% of dist. Atlas resolution (2048^2 for 2 tree types?), whether normal AND depth are both needed, edge-bleed/tile count. The bake tool (`tools/bake-tree-impostors.mjs` -> Pixel Forge Kiln) is unbenchmarked. Matt flagged this; it is a paired track (taste + the unbenchmarked tool).

Also still queued (not asset-diet, but carried): the **paired launch session** (NSL-as-default, version bump, itch/devlog/social, S24+ pass), **three r185** (upstream), the **rock re-bake**.

## How to read this plan

Re-author this stub at `/cycle-start`: pick the cycle's coherent goal from the candidates above, copy the relevant phase bodies + EARS acceptance, and keep the cycle to <= 8 phases. The KTX2 P5 spec is in `cycle97-validation/ktx2-readiness.md` (local) + `DECISIONS.md` Cycle 98.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.

## References

- `DECISIONS.md` "Cycle 98" — the KTX2 record + the asset-weighting analysis
- `cycle97-validation/ktx2-readiness.md` — the KTX2 integration spec (local)
- [`docs/archive/cycles/cycle-98-plan.md`](archive/cycles/cycle-98-plan.md) — the launch-and-ktx2 plan
- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
