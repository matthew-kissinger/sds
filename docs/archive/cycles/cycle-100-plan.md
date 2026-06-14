# Cycle 100 — terrain-compression

> Drafted 2026-06-14 after Cycle 99 closed; Goal + Phases filled 2026-06-14 at `/cycle-start` after the Q1/Q2 measurement. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Stop shipping the baked terrain heightfields uncompressed. Each scene's `public/terrain/<scene>.bin` is 4 MiB of raw float32, served by Cloudflare with no `content-encoding` (measured: `application/octet-stream` is outside CF's default-compressible set), so a full asset load pulls 16 MiB of terrain over the wire. Ship brotli-pre-compressed `.bin` on the Cloudflare Pages build and declare it with `Content-Encoding: br` + `Cache-Control: no-transform` in `_headers`, so the browser transparently decodes the byte-identical float32. The win is a smaller per-scene-load download (rolling-hills 4 MiB -> ~1.3 MiB, NSL 4 MiB -> ~0.9 MiB; 16 MiB -> ~3.94 MiB across all four) with zero change to terrain shape, zero precision loss, and no baseline moves. Lossless only; int16 quantization is explicitly out of scope (see Q2).

## How to read this plan

The decisive constraint was determinism + the heightfield single source of truth, and the measurement retired it: the terrain `.bin` is a **client-only** asset (the Worker sim loads no heightfield; grep of `worker/` finds zero `Heightfield` usage). `Content-Encoding: br` decodes in the browser network stack **below** `fetch()`, so `Heightfield.load`'s `arrayBuffer()` returns the byte-identical original float32. Therefore:

- `shared/terrain/Heightfield.js` (fence-frozen) is **not touched**.
- No sim-baseline or refactor-baseline fixture moves (bytes are byte-identical after decode).
- No MP-desync risk (no Worker consumer; the wire format the Worker speaks is unchanged).
- The change is purely client-side transport on the Cloudflare Pages target.

## Open questions — RESOLVED at /cycle-start (2026-06-14)

1. **Q1: What does the wire cost today?** RESOLVED: 16 MiB, fully uncompressed. `curl` against sheepdogsim.com returned no `content-encoding` and the full 4,194,304 B for all four scenes. CF does not compress `application/octet-stream` by default. A real win exists. (`cycle100-validation/q1-q2-measurement.md`.)
2. **Q2: Lossless or lossy?** RESOLVED: **lossless.** Brotli (q11) on the existing float32 bytes takes 16 MiB -> 3.94 MiB (-76%) with zero precision loss and no baseline moves. int16 quantization would reach ~1.34 MiB but saves only ~1.7 MiB more in exchange for a recorded sim+refactor baseline regeneration and a Worker/client lockstep concern - a bad trade. Vindicates the plan's lean. int16 is dropped from scope.

## Delivery decision (resolved)

Three lossless delivery mechanisms were weighed (CF Compression Rule; pre-compress + `Content-Encoding`; pre-compress + explicit client decode). Chosen: **pre-compress + `Content-Encoding: br` via Pages `_headers`** (the documented CF Pages end-to-end-compression path, gated by `Cache-Control: no-transform` so the edge does not re-transform). Rationale:

- A CF Compression Rule needs a **Pro plan** and a dashboard/API step; the `_headers` path is repo-only and needs no manual Cloudflare step.
- Transparent decode means no client decode code and no touch to the frozen loader.
- Build-target isolation: only the default web (CF Pages) build pre-compresses. The `itchio` and `native` builds keep raw `.bin` (itch ignores `_headers`; native loads off disk where `Content-Encoding` does not apply).

## Phases

### Phase 1 — Build-time pre-compression + headers + preview parity (autonomous)

Brotli-compress `dist/terrain/*.bin` in place during the web build, declare it in `_headers`, keep `vite preview` working (preview does not read `_headers`), and lock losslessness with a test.

- Files: `vite.config.js` (new `precompressTerrainPlugin`: `closeBundle` compresses, `configurePreviewServer` sets `Content-Encoding: br` for `/terrain/*.bin`), `public/_headers` (split `/terrain/*` into `/terrain/*.json` cache-only and `/terrain/*.bin` with `Content-Encoding: br` + `no-transform`), `tests/terrain-precompress.spec.js` (new).
- Acceptance (EARS):
  - When `npm run build` runs with no `BUILD_TARGET`, then every `dist/terrain/*.bin` shall be brotli-encoded and shall brotli-decode byte-identical to its `public/terrain/*.bin` source.
  - When `BUILD_TARGET=itchio` or a native target builds, then `dist/terrain/*.bin` shall remain raw float32 (byte-identical to source).
  - While `vite preview` serves a web build, the `/terrain/*.bin` responses shall carry `Content-Encoding: br` and the `/terrain/*.bin.json` responses shall not.
  - When `npm test` runs, a spec shall assert brotli round-trip losslessness and that `public/_headers` declares `Content-Encoding: br` and `no-transform` for `/terrain/*.bin`.
  - When the web build completes, no `tests/sim-baseline/*.json`, `tests/refactor-baseline/*`, or `bundle-sizes.json` fixture shall change.

### Phase 2 — Deploy + live wire verification (autonomous; gated on commit/push approval)

Land on `main`, let CI deploy to Cloudflare Pages, and prove the wire win on the live origin.

- Files: none beyond Phase 1 (deploy is CI). Verification via `curl` + a browser spot-check.
- Acceptance (EARS):
  - When the change deploys to sheepdogsim.com, then `curl -H 'Accept-Encoding: br'` on `/terrain/rolling-hills.bin` shall return `content-encoding: br` and a transfer size near the brotli artifact (about 1.3 MiB, down from 4 MiB).
  - When a browser loads a scene on sheepdogsim.com, then the heightfield shall decode and terrain shall render with no console error.
  - If the live response has no `content-encoding: br` (CF stripped the header), then stop and surface; fall back to a CF Compression Rule via the CF API token (or a dashboard notepad) as the contingency.

## Frozen files (cycle-specific)

- `shared/terrain/Heightfield.js` — deterministic-sim core + heightfield SSOT ([`INTERFACE_FENCE.md`](INTERFACE_FENCE.md)). **Not touched this cycle** (transparent decode below `fetch`). Listed so the fence is explicit.
- `tests/sim-baseline/*.json`, `tests/refactor-baseline/__fixtures__/*` — must not move (lossless = byte-identical). If any moves, a non-lossless bug crept in: stop.

## Hard stops

- If any sim-baseline or refactor-baseline fixture differs at build/test, stop and surface: lossless must not move a baseline, so a diff means the round-trip is not byte-identical. Do not regenerate to go green.
- If the live origin does not return `content-encoding: br` after deploy, stop and surface before further changes (Phase 2 contingency).
- Union with [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md).

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass (including the new `terrain-precompress` spec).
- [ ] When `npm run build` runs at cycle close, the production build shall be clean and `dist/terrain/*.bin` shall be brotli-compressed and lossless.
- [ ] When the cycle closes, no sim-baseline or refactor-baseline fixture shall have moved (lossless invariant).
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed and `curl -H 'Accept-Encoding: br'` on a terrain `.bin` shall return `content-encoding: br`.

## Carryover (not necessarily this cycle's scope)

- **itch/native wire win** - this cycle scopes the win to Cloudflare Pages. If itch's CDN also serves terrain uncompressed and it matters, an explicit-decode (`DecompressionStream`) path would cover all targets; deferred unless measured worth it.
- **Impostor bake re-pass (paired)** - atlas resolution, normal-vs-depth necessity, the unbenchmarked Pixel Forge Kiln tool.
- **Golden harness staleness (test-infra)** - `tools/validation/golden/` no longer reproduces against the current capture environment (surfaced Cycle 99 Phase 1; not KTX2-related). Re-baseline or gate the capture on a deterministic scene-settled signal.
- **Paired launch session** - NSL-as-default-world, version bump, itch/devlog/social posting, S24+ device pass.
- **three r185** (upstream-blocked, latest 0.184.0); **rock re-bake** (needs design direction); Cycle 95 prod-validation; NPC-sheepdogs owner intake; Survival-copy translation.

## References

- `cycle100-validation/q1-q2-measurement.md` — the wire measurement + compressibility matrix (Q1/Q2 evidence)
- `tools/terrain-compress-probe.mjs` — the reusable compressibility spike
- `DECISIONS.md` "Cycle 98" — the asset-weighting analysis (terrain `.bin` named as the biggest remaining load lever)
- [`docs/archive/cycles/cycle-99-plan.md`](archive/cycles/cycle-99-plan.md) — the KTX2 Phase 5 plan (the prior asset-diet win)
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
