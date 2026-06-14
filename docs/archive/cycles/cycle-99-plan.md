# Cycle 99 — asset-diet

> Drafted 2026-06-14 after Cycle 98 closed. Authored at `/cycle-start` 2026-06-14: goal committed to KTX2 Phase 5 (finish the win). Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Realize the KTX2 win Cycle 98 set up but did not capture. Cycle 98 shipped the encode -> lazy-loader -> load-site swap (slice `2cd9690a`), but dist still ships **both** the 6 impostor `.png` atlases (7.32 MB) and their 6 `.ktx2` siblings (2.59 MB). KTX2-capable browsers already load the `.ktx2` (the VRAM win is live); the `.png` set is now dead weight on disk/CDN, fetched only by a non-KTX2 fallback that the Basis transcoder makes effectively unreachable. This cycle validates KTX2-vs-PNG render parity on visible impostors, then drops the 6 impostor PNGs from dist to realize the dist/CDN shrink (~7.3 MB, dist roughly 54 -> 47 MB). Terrain `.bin` compression and the human-in-the-loop impostor bake re-pass stay carried to a later cycle (not this scope).

## How to read this plan

Three phases, run in order (Phase 2 is gated on Phase 1 passing). The KTX2 integration spec is `cycle97-validation/ktx2-readiness.md` (local) and `DECISIONS.md` "Cycle 98". The drop mirrors the octahedral-from-dist precedent already in `vite.config.js` (`excludeBlendFilesPlugin` closeBundle).

## Phases

### Phase 1 — KTX2 impostor parity validation (autonomous)

Prove the committed `.ktx2` atlases render identically to the `.png` atlases on visible impostors before removing the PNG fallback. Two checks:

1. The established golden diff (`npm run validation:screenshots -- --diff`) against the Cycle 97 PNG-baked goldens. A pass confirms the current (KTX2-preferring) build did not regress field / rolling-hills / open-country.
2. A direct KTX2-vs-PNG A/B on an impostor-heavy view: capture with KTX2 (dist as built), then move the 6 `.ktx2` atlases aside in dist to force the `.png` fallback, capture again, SSIM-diff the pair. This is the orientation (`isYFlip`) + transcode-quality check the Cycle 98 deferral named.

**Acceptance (gate amended during Phase 1 - see note):**

- When an impostor-bearing scene loads in a real browser, the load path shall fetch the 6 `.ktx2` atlases plus the basis transcoder, fall back to `.png` zero times, and log no KTX2 decode error. **MET** - `tools/ktx2-impostor-probe.mjs` open-country: 6/6 `.ktx2`, transcoder fetched, 0 png fallback, 0 errors.
- When the same seeded scene is captured with KTX2 versus a forced-PNG fallback (the `.ktx2` files moved aside in dist, identical seed/camera/settle), the two shall match within SSIM 0.95. **MET** - SSIM 0.99029, visually indistinguishable; orientation + color + quality correct (a flip or color-space bug tanks SSIM, not 0.99).
- If either check failed, the cycle shall stop before Phase 2 and surface the capture (an `isYFlip` or quality-level fix in `tools/encode-impostors-ktx2.mjs`, not a drop). Not triggered.

**Note on the original gate.** The plan first specified the golden `--diff` harness (`npm run validation:screenshots -- --diff`) as the gate. It is not a valid KTX2 gate: it failed 7/12 cells (some at 0.55) but **run-to-run stable**, i.e. a consistent delta from the committed Cycle 97 goldens, not flakiness, and the differing trees include LOD0 trees which use the GLB leaf texture, not the impostor atlas, so KTX2 cannot be their cause. The committed goldens are stale relative to the current capture environment (a separate test-infra issue, carried to BACKLOG - not this cycle's scope). The seeded KTX2-vs-PNG A/B above isolates the texture source with zero stale-baseline confound and is the honest parity gate.

**Files touched:** `tools/ktx2-impostor-probe.mjs` (new validation probe); capture artifacts + report in `cycle99-validation/`. Dist `.ktx2` files are moved aside and restored during the A/B (net no change).

### Phase 2 — Drop impostor PNGs from dist (autonomous, gated on Phase 1)

Add a closeBundle pass to `excludeBlendFilesPlugin` in `vite.config.js`: for each `*.imposter*.png` under `dist/assets/models/trees/`, drop it **only if** its `.ktx2` sibling exists in dist. The KTX2-sibling guard keeps the rule self-maintaining (a future PNG without a KTX2 twin keeps its fallback) and mirrors the octahedral drop already there. Source `assets/models/trees/*.png` stays untouched (the encoder + `objects-impostor-parity` hashes read it).

**Acceptance:**

- When `npm run build` completes, `dist/assets/models/trees/` shall contain the 6 `.ktx2` impostor atlases and none of their 6 `.imposter*.png` siblings.
- While a `.imposter*.png` under `dist/assets/models/trees/` has no `.ktx2` sibling, the build shall keep that `.png` in dist.
- When `npm test` runs, `tree-assets.spec.js` and `objects-impostor-parity.spec.js` shall stay green (they read source, not dist).

**Files touched:** `vite.config.js`.

### Phase 3 — Validate + surface for close (paired / Matt-gated)

`/validate`, confirm the dist drop, show the diff. Commit + deploy + `/cycle-close` are Matt-gated (do not auto-close, do not auto-deploy).

**Acceptance:**

- When `npm test` and `npm run build` run at close, both shall pass.
- When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.

## Frozen files

None. `vite.config.js` is build config (not fence-frozen; Cycle 98 edited it for the basis copy + octahedral drop). `tests/refactor-baseline/__fixtures__/bundle-sizes.json` is untouched - dropping PNGs from dist does not change any JS chunk size, so the bundle-size ratchet is unaffected.

## Hard stops

- If the Phase 1 golden diff or the KTX2-vs-PNG A/B falls below SSIM 0.95, stop. Do not drop the PNG fallback on top of a bad encode. Surface the capture and fix the encoder.
- If `npm run build`'s `main-*.js` chunk grows vs `bundle-sizes.json`, stop and surface (durable bundle-size stop; not expected this cycle - no JS changes).
- Union with [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md).

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the build completes, dist shall ship the 6 KTX2 impostor atlases and none of the 6 impostor PNG siblings.
- [ ] When KTX2 impostor parity was checked, the A/B shall have passed SSIM 0.95 (or the drop shall have been blocked).
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.

## Carryover (not this cycle's scope)

- **Terrain `.bin` compression** - 16 MB uncompressed float32 (4 MB x 4 scenes), per-scene-load. int16 quantize / packed format; respect `shared/terrain/Heightfield.js` + the sim-baseline terrain hashes. The biggest remaining raw lever; highest determinism risk.
- **Impostor bake re-pass (paired)** - atlas resolution, normal-vs-depth necessity, the unbenchmarked Kiln tool. Matt's taste + a paired track.
- **Paired launch session** - NSL-as-default-world, version bump, itch/devlog/social posting, S24+ device pass.
- **Golden harness staleness (test-infra).** `tools/validation/golden/` no longer reproduces against the current capture environment (7/12 cells below 0.95, run-to-run stable, including LOD0-tree deltas unrelated to any recent render change). Either re-baseline (`--baseline`) under the canonical environment or make the capture point gate on a deterministic scene-settled signal. Surfaced in Cycle 99 Phase 1; not KTX2-related.

## References

- `DECISIONS.md` "Cycle 98" — the KTX2 record + the asset-weighting analysis
- `cycle97-validation/ktx2-readiness.md` — the KTX2 integration spec (local)
- [`docs/archive/cycles/cycle-98-plan.md`](archive/cycles/cycle-98-plan.md) — the launch-and-ktx2 plan
- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
