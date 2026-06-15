# Cycle 102 - impostor-ktx2-and-polish

> Drafted 2026-06-15 after Cycle 101 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **Closed 2026-06-15.** Phases 1-3 shipped autonomously (octahedral KTX2 encode + dist drop + encode-matrix parity guard; -1.10 MiB off the wire, ktx2 at 36% of png; 1562 vitest / lint / build green; no version bump, still 2.3.4). Phase 4 (the paired SSIM A/B + warm jitter rails) carries forward - it is GPU-bound and this box has no headless WebGPU (measured Cycle 101).

## Goal

The Cycle 101 octahedral far-impostor atlas (tree1/tree2 albedo + capture-view normal, 1024^2, no depth) ships as lossless `.png`. KTX2 wire-encoding it was deferred from Cycle 101 Phase 4 so the UASTC transcode would not be conflated with the new material as an unvalidated variable. This cycle realizes that wire win: extend the encoder past its latlon-only filter so it transcodes the octahedral atlas to UASTC `.ktx2`, drop the dist `.png` once its `.ktx2` sibling exists (the loader already prefers `.ktx2`), and guard the encode matrix so it cannot silently drop a layer. There is no player-visible look change. The user-visible difference is less data on the wire and less VRAM on the far-impostor atlas (the same win Cycle 98/99 landed for the latlon set). The carried-over GPU-bound Cycle 101 validation (the settled impostor-vs-LOD0 SSIM A/B + the warm jitter rails on NSL + Rolling Hills + Open Country) plus the new ktx2-vs-png SSIM A/B run in the paired close, because this box has no headless WebGPU (measured Cycle 101, `cycle101-validation/webgpu-availability-check.mjs` reads `hasGpu:false`). The octahedral selector fold-seam note (54/64 round-trip, off-by-one at the steep-down seam) is the one thing to confirm in the paired A/B.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code.
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile) before committing to a technique.
- **Pick the simplest thing that meets the budget** rather than the most impressive.

## Open questions to resolve before writing code

1. **Q1: Drop the octahedral dist `.png` in the same pass, or ship both until the paired SSIM A/B?** Resolved: drop in-pass via the sibling-guarded dedup. The octahedral `.ktx2` is the same q3 UASTC encode of the same atlas type that validated at SSIM 0.99 for latlon (Cycle 99); the runtime degrades-not-crashes on a load failure; Cycle 98 shipped the latlon KTX2 unvalidated under the same posture. Shipping both `.png` + `.ktx2` would grow the wire (a regression) and not "realize the win." The paired ktx2-vs-png A/B is the visual backstop; the revert path is one `vite.config.js` hunk (PNGs back in dist).
2. **Q2: Re-bake the octahedral atlas this cycle?** Resolved: no. This cycle is the transcode of the committed Cycle 101 bake, not a re-bake. A re-bake is a separate, explicitly-recorded act (it trips `objects-impostor-parity.hashes.json`).

## Phase shape rules

A cycle has **<= 8 phases**, each fully autonomous or fully paired (no mixed mode), each a single sharp goal of <= 4 hours.

## Acceptance criteria - EARS format

Every phase's Acceptance section uses [EARS notation](https://kiro.dev/docs/specs/):

- **Event-driven**: `When [trigger], the [system] shall [response].`
- **State-driven**: `While [precondition], the [system] shall [response].`
- **Unwanted-event**: `If [unwanted], then the [system] shall [response].`

## Phase 1 - Octahedral KTX2 encode (autonomous, ~1.5hr)

**Independently testable.** The encode is the headline; everything else builds on the `.ktx2` existing.

Extend [`tools/encode-impostors-ktx2.mjs`](../tools/encode-impostors-ktx2.mjs): drop the latlon-only `LIVE_LAYOUT` filter so it transcodes every impostor-enabled target, and derive the per-target map set from `preset.auxLayers` (albedo always, sRGB/perceptual; each aux layer linear) instead of the hardcoded `[albedo, normal, depth]`. This mirrors the `atlasLayers` preset-derivation already in [`tests/objects-impostor-parity.spec.js`](../tests/objects-impostor-parity.spec.js) so the bake matrix and the encode matrix cannot drift. Latlon keeps albedo + normal + depth; octahedral gets albedo + normal (no depth, per the Cycle 101 drop). Run `npm run encode-impostors-ktx2`; commit the 4 new octahedral `.ktx2`. Refresh the file header comment (it currently says the octahedral set is dead in prod).

**Files touched:** `tools/encode-impostors-ktx2.mjs`, `assets/models/trees/octahedral/{tree1,tree2}.imposter{,.normal}.ktx2` (new).

**Acceptance (EARS):**

- When `npm run encode-impostors-ktx2` runs, the encoder shall emit a `.ktx2` for the albedo and every `auxLayers` entry of every impostor-enabled target (latlon: albedo + normal + depth; octahedral: albedo + normal).
- If a target's layout declares no `depth` aux layer, then the encoder shall not emit or expect a `.depth.ktx2` for it.
- When the octahedral encode completes, each octahedral `.ktx2` shall be smaller than its source `.png`.
- If the encode would alter a source `.png` atlas or sidecar, then the run shall abort (post-process only; `objects-impostor-parity` hashes stay green).

## Phase 2 - Realize the wire win: dist drop (autonomous, ~1hr)

**Depends on Phase 1.** The `.ktx2` must exist before the `.png` can be dropped.

Extend the impostor-`.png` dedup in [`vite.config.js`](../vite.config.js) (`excludeBlendFilesPlugin` closeBundle) to also walk the `assets/models/trees/octahedral/` subdir, sibling-guarded by the same rule as the top-level latlon dir (drop a `.png` only when its `.ktx2` sibling is present). Refresh the stale comment block (the octahedral set no longer "ships as .png for now"). Build; confirm dist ships the octahedral `.ktx2` set + the sidecar `.json` and 0 octahedral `.imposter*.png`; record the dist delta.

**Files touched:** `vite.config.js`.

**Acceptance (EARS):**

- When `npm run build` runs, dist shall contain the octahedral `.ktx2` set and 0 octahedral `.imposter*.png`.
- When `npm run build` runs, the octahedral sidecar `.json` shall remain in dist (the loader fetches it for the directions + bbox).
- If an octahedral `.png` has no `.ktx2` sibling, then the dedup shall keep the `.png` (degrade-not-crash fallback intact).
- When the build completes, [`tests/refactor-baseline/__fixtures__/bundle-sizes.json`](../tests/refactor-baseline/__fixtures__/bundle-sizes.json) shall be unchanged (no JS chunk moved; the change is asset-only).

## Phase 3 - Encode-matrix parity guard (autonomous, ~1hr)

**Depends on Phase 1.** Guards that a future bake cannot add a target or layer without re-encoding.

Add a vitest spec asserting every enabled impostor target has its full `.ktx2` set (albedo + each `auxLayers` layer) present in `assets/`, each non-empty and smaller than its source `.png`. Reuse `enabledImpostorTargets` + the preset-derived layer list (the same single source of truth as `objects-impostor-parity.spec.js`) so the two specs cannot drift. Existence + size (not a content hash) keeps it robust across encoder-version bumps while still catching a missing or stale layer.

**Files touched:** `tests/impostor-ktx2-parity.spec.js` (new).

**Acceptance (EARS):**

- When the suite runs, the guard shall assert a `.ktx2` exists for the albedo and every `auxLayers` layer of every impostor-enabled target.
- If an impostor target is missing any expected `.ktx2`, then the guard shall fail naming the missing file.
- When the guard runs, it shall assert each impostor `.ktx2` is non-empty and smaller than its source `.png`.

## Phase 4 - Paired validation + close (paired, Matt's WebGPU box)

**Depends on Phases 1-3.** Headless WebGPU is unavailable here (measured Cycle 101), so the rendered gates are paired.

On Matt's box:

1. Add the `?forceTreeLod0=1` reference toggle (small render-code add) so the impostor-vs-LOD0 A/B has a clean reference arm.
2. **Octahedral ktx2-vs-png SSIM A/B.** Force-png arm = move the octahedral `.ktx2` aside in dist so `loadImpostorTexture` falls back to `.png`; identical scene/seed/camera; only the texture source differs. Mirror `tools/ktx2-impostor-probe.mjs` (Cycle 99). Bar: SSIM >= the Cycle 99 latlon ~0.99.
3. **Carried Cycle 101 impostor-vs-LOD0 SSIM A/B** across a yaw sweep on NSL + Rolling Hills + Open Country (runbook: `cycle101-validation/phase6-validation-notes.md`, cycle90 noise-floor method).
4. **Warm jitter rails:** `npm run perf:jitter:nsl -- --check=1` within the Cycle 96 budget, plus RH/OC via `perf:jitter --scene=`.
5. Confirm the 54/64 octahedral fold-seam reads clean in the A/B (off-by-one bounded inside the 4-tile blend).
6. Fold in any far-impostor polish the review surfaces. Then `/validate` + `/cycle-close`.

**Files touched:** `js/world/TreePlacement.js` or the far-impostor route (the `?forceTreeLod0=1` toggle), `cycle102-validation/*` (local, gitignored).

**Acceptance (EARS):**

- When the octahedral ktx2-vs-png A/B runs, the SSIM shall be >= the Cycle 99 latlon bar (~0.99), or the regression shall be surfaced before the dist `.png` drop is trusted in prod.
- When the carried impostor-vs-LOD0 A/B runs, the relit octahedral impostor shall read as the tree silhouette across the yaw sweep on all three islands.
- When the warm jitter rails run, NSL shall stay within the Cycle 96 budget (1%-low >= 100, worst <= 45ms, hitch <= 30 per 30s).
- If the paired review surfaces a far-impostor visual regression, then it shall be fixed or carried with an explicit note before close.

## Dependencies

```
Phase 1 -> Phase 2 -> Phase 3   (autonomous chain, this box)
                        -> Phase 4   (paired, Matt's WebGPU box)
```

## Frozen files (cycle-specific additions)

- The impostor atlas, the `.ktx2` outputs, the sidecars, and `assets/objects.manifest.json` are not fence-frozen (the encode is the authorized change). [`tests/refactor-baseline/__fixtures__/bundle-sizes.json`](../tests/refactor-baseline/__fixtures__/bundle-sizes.json) (fence-frozen) - bump only with a recorded decision if the encode shifts a JS chunk (it should not; the change is asset-only).

## Hard stops

Durable hard stops apply on every cycle - see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. The encode is a post-process: it must not touch the source `.png` atlases or the sidecars (the `objects-impostor-parity` hashes guard them). Any PNG/sidecar byte change aborts the phase.
2. No runtime render-code change to the impostor load path in Phases 1-3 (the loader already prefers `.ktx2`). The only render-code add is the paired `?forceTreeLod0=1` debug toggle in Phase 4.
3. Don't drop the octahedral `.png` from dist before its `.ktx2` sibling exists. The sibling guard enforces this; don't bypass it.

## What NOT to do during this cycle

- Don't re-bake the octahedral atlas (this cycle is the transcode, not a re-bake; a re-bake trips the parity hashes and is a separate recorded act).
- Don't add depth to the octahedral encode (Cycle 101 dropped it deliberately; no production consumer).
- Don't bump the version (2.3.4 holds; nothing player-visible).
- Don't run `/cycle-close` on failing tests or build.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the octahedral encode lands, every enabled impostor target shall have its full `.ktx2` set and dist shall ship 0 octahedral `.imposter*.png`.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] (Paired, carryover-eligible) When Matt runs the carried validation, the octahedral ktx2-vs-png SSIM, the impostor-vs-LOD0 A/B, and the warm jitter rails shall pass (or a regression shall be surfaced).

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - the template this was scaffolded from
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items (Cycle 101 carryover seeds this cycle)
- [`cycle101-validation/phase6-validation-notes.md`] - the GPU-bound validation runbook carried into this cycle
- [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) - foliage LOD, far-tree impostors, no-far-impostor-shadow
