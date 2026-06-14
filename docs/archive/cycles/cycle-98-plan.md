# Cycle 98 — launch-and-ktx2

> Authored 2026-06-14 at `/cycle-start`. Goal locked to the **KTX2 texture pipeline** (Matt's pick from the Cycle 97 carryover). The paired launch session, three r185, and the rock re-bake stay queued in [`BACKLOG.md`](BACKLOG.md) carryover for a later cycle. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom.

## Goal

Ship the KTX2 texture pipeline for the tree-impostor atlases - the only KTX2-addressable GPU textures in the build. Cycle 97 measured the prize (~10.6 MB net wire saved, ~192 MB VRAM saved across the 12 impostor color/normal/depth atlases) and wrote the integration spec (`cycle97-validation/ktx2-readiness.md`, local). This cycle stands up the encoder pass, vendors the basis transcoder, swaps the two impostor load sites to KTX2, and validates that nothing foliage-visible regresses. The hard line carried from the spec: any golden failure or visible parallax/lighting/alpha-edge drift on the impostor canopy and KTX2 stays out - no "close enough" on transcodes.

## Status (2026-06-14)

Phases 1-4 shipped (Matt: "run phase 1-3" + "fold your recommendations in", then "ship now, I test in prod" at close). CLOSED 2026-06-14, slice `2cd9690a`; KTX2 deployed unvalidated (the `.png` fallback is the safety net; Matt validates the impostor look in prod). Phase 5 (the dusk-canopy A/B + the PNG-from-dist drop that realizes the dist-shrink/VRAM win) and the paired launch session carry to Cycle 99 (`asset-diet`).

- **P1 encode** done: `tools/encode-impostors-ktx2.mjs` (wasm `ktx2-encoder`, `npm run encode-impostors-ktx2`), 6 live atlases 7.32 -> 2.59 MB (35%).
- **P2 loader** done: `js/rendering/ktx2Loader.js` lazy singleton (own 59 KiB chunk, off main), basis transcoder vendored to `assets/vendor/basis/`.
- **P3 swap** done: both load sites prefer `.ktx2` with `.png` fallback; `detectSupport` warmed at renderer-ready as a detached side-effect.
- **P4 offline gates** done: 1543 vitest + lint + build green; KTX2Loader off main; bundle budgets bumped (deliberate KTX2 growth, recorded in `DECISIONS.md`).
- **Free win folded in:** dead octahedral set dropped from dist (`vite.config.js`), dist 63 -> 54 MB.
- **P5 deferred (GPU-gated):** golden suite + 20 Mbps cold-load delta + NSL jitter rail + dusk-canopy A/B, then drop impostor PNGs from dist to realize the wire/VRAM win. Top A/B checks: orientation (`isYFlip`) + depth/normal transcode quality.
- **Next-cycle theme surfaced** (asset-weighting analysis in `DECISIONS.md`): compress terrain `.bin` (16 MB uncompressed float32) + a human-in-the-loop impostor bake re-pass.

## Execution mode

- **Phases 1-4 (encoder, transcoder, load-site swap, offline validation) are GPU-free** (build / code / Node tests) and run autonomously.
- **Phase 5 (golden suite + cold-load delta + jitter rail + dusk-canopy A/B) is GPU/browser-bound and is deferred until the concurrent perf run in the other repo clears.** Shared RTX 3070; running them together contaminates both perf numbers and violates the browser-probe-hygiene rule (a perf probe needs a clean GPU).
- **Visual posture for the dusk-canopy A/B:** _(pending Matt's pick at start - paired glance vs ship-and-test-in-prod)._

## Phases

### Phase 1 — Encoder pass (build-time, autonomous)

Pick + pin a portable KTX2/basis encoder (wasm npm devDep preferred over a system `toktx` binary, for repo portability). Extend `tools/bake-tree-impostors.mjs` with a KTX2 pass over the **live** atlas set only (drop the dead `trees/octahedral/` set from the target): color -> UASTC4 + zstd supercompression (alpha preserved), normal -> UASTC + normal-map flag, depth -> UASTC high. No ETC1S on any of the three. Emit `.ktx2` / `.normal.ktx2` / `.depth.ktx2` next to the source PNGs; the PNGs remain in source for regen/diagnostics. Run the bake.

- **Acceptance:** When `tools/bake-tree-impostors.mjs` runs, then it shall emit a `.ktx2` for each live impostor atlas with alpha preserved via UASTC (never ETC1S).
- **Acceptance:** When the bake completes, then the `.ktx2` set total shall be smaller than the corresponding `.png` set (census target 16.6 -> ~5 MB).
- **Files:** `tools/bake-tree-impostors.mjs`, `package.json` (encoder devDep), the baked `.ktx2` atlas artifacts.

### Phase 2 — Transcoder vendoring + KTX2Loader singleton (runtime, autonomous)

Vendor `basis_transcoder.{wasm,js}` (from the pinned three 0.184.0 `examples/jsm/libs/basis` copy) into the served asset tree (confirm `public/` vs the `assets/` + `vite-plugin-static-copy` convention this repo uses). Add a single `getKtx2Loader(renderer)` helper that instantiates `KTX2Loader` once, calls `setTranscoderPath`, and `detectSupport(renderer)` after the WebGPU renderer exists. The transcoder WASM must load lazily (dynamic import / runtime fetch), never bundled into the main chunk.

- **Acceptance:** When the WebGPU renderer is created, then a single `KTX2Loader` shall be initialized with `detectSupport(renderer)` before any impostor texture load.
- **Acceptance:** When `npm run build` runs, then `main-*.js` shall not grow versus the recorded baseline (transcoder stays lazy - bundle-size emergency stop).
- **Files:** new `js/rendering/ktx2Loader.js` (or sibling), vendor dir under the served asset root, `vite.config.js` (static-copy / optimizeDeps as needed).

### Phase 3 — Load-site swap, dist-copy switch, degrade-not-crash (runtime, autonomous)

Swap `THREE.TextureLoader` -> the shared KTX2 loader at the two live impostor load sites: `js/world/TreePlacement.js:948` (`loadColdImpostorAtlas`, color only) and `js/kiln-impostor-material.js:788` (`loadKilnImpostor`, color + normal + depth). Resolve `.ktx2` / `.normal.ktx2` / `.depth.ktx2`. Preserve every texture setting: `SRGBColorSpace` color, `NoColorSpace` normal/depth, `LinearFilter` min/mag, `anisotropy = 8`, `ClampToEdgeWrapping`, no generated mips. Switch the dist copy so the impostor atlases ship as `.ktx2`, not `.png` (this is where the wire/dist win is realized). Runtime degrade-not-crash leans on KTX2Loader's built-in uncompressed transcode (covers GPUs without a compressed format) plus the existing try/catch -> null; revisit a PNG-in-dist hard fallback only if a real device lacks basis support.

- **Acceptance:** When an impostor atlas loads on a KTX2-capable renderer, then it shall load the `.ktx2`; if the transcoder fails to load, then the existing null-degrade path shall keep the scene crash-free.
- **Acceptance:** When an impostor texture loads as KTX2, then its colorspace, filtering, anisotropy, and wrap settings shall match the prior PNG path.
- **Files:** `js/world/TreePlacement.js`, `js/kiln-impostor-material.js`, `vite.config.js` (dist copy glob).

### Phase 4 — Offline validation (autonomous, GPU-free)

GPU-free gates: `npm test` and `npm run build` green; dist includes the `.ktx2` set and the dist total shrinks; transcoder absent from the main chunk; the impostor-parity hash test (`tests/objects-impostor-parity.hashes.json`) considered (regenerate only with recorded acceptance if the atlas set legitimately changed). Capture the dist-size delta to `cycle98-validation/`.

- **Acceptance:** When `npm test` runs at this phase, then all vitest specs shall pass.
- **Acceptance:** When `npm run build` runs, then dist shall include the `.ktx2` atlases and the dist total shall be smaller than the pre-KTX2 baseline.
- **Files:** `cycle98-validation/` (local artifacts), optional `getKtx2Loader` unit test.

### Phase 5 — GPU/browser validation (DEFERRED past the concurrent perf run; autonomous capture + Matt's look)

Run only when the other repo's perf testing has cleared the GPU. Golden suite green (all 12 cells >= 0.95 SSIM - this is why goldens were re-baselined in Cycle 97); 20 Mbps cold-load delta recorded (ship only if dist shrank and cold load did not regress); NSL jitter rail unaffected (`perf:jitter:nsl`); per-texture A/B at the NSL dusk impostor canopy (Basis's worst case: alpha foliage + normal + depth). Artifacts to `cycle98-validation/`.

- **Acceptance:** When the golden suite runs after the swap, then all 12 cells shall stay >= 0.95 SSIM.
- **Acceptance:** When the cold-load delta is measured at 20 Mbps, then cold load shall not regress versus the pre-KTX2 baseline.
- **Hard stop:** If any golden fails or visible parallax/lighting/alpha-edge drift appears on the impostor canopy, then KTX2 stays out (revert the swap) - no "close enough."
- **Files:** `cycle98-validation/` (golden diffs, cold-load numbers, A/B PNGs).

### Phase 6 — Close

`/validate` then `/cycle-close`. Record the KTX2 land, or - if Phase 5's hard stop fired - the decision to hold KTX2 with the encoder/transcoder infra parked.

- **Acceptance:** When the cycle closes, then `npm test` and `npm run build` shall pass and the `main` deploy shall be green.

## Frozen files

None of the spec's touched files are fence-frozen. The fence entries to stay clear of: the `shared/` sim cores + `shared/scenes/types.js`, the sim/refactor baseline fixtures, and the process docs. The impostor-parity hash fixture (`tests/objects-impostor-parity.hashes.json`) is a test ratchet - if the atlas bake legitimately changes it, regenerate with recorded acceptance in Phase 4, never as a shortcut.

## Hard stops

Union with [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific:

- **KTX2 transcode drift:** any golden failure or visible parallax/lighting/alpha-edge drift on the impostor canopy = KTX2 stays out. No "close enough."
- **Bundle-size:** transcoder WASM must stay lazy; if `main-*.js` grows, stop and surface.
- **Cold-load regression:** if the 20 Mbps cold-load delta regresses despite the smaller dist, stop and surface (the win is wire + VRAM, not at the cost of first-frame).

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When KTX2 ships, the dist total shall be smaller and the golden suite shall stay green (or KTX2 is explicitly held per the hard stop, infra parked).

## References

- `cycle97-validation/ktx2-readiness.md` — the integration spec (local)
- `cycle97-validation/ktx2-census.mjs` — the measurement probe (local)
- [`tools/bake-tree-impostors.mjs`](../tools/bake-tree-impostors.mjs) — the impostor baker (encoder pass target)
- `js/world/TreePlacement.js:948`, `js/kiln-impostor-material.js:788` — the two load sites
- [`js/world/objectImpostorManifest.js`](../js/world/objectImpostorManifest.js) — atlas base-path resolution
- [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md), [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable stops + fence
