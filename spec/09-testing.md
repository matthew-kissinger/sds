# 09 - Testing and validation

## Layers

1. **Sim trace fixtures (the backbone).** Committed 60 Hz fixed-seed traces exercising the exported `step` directly (spec/02). Any diff is a behavior change; regeneration requires recorded intent in the same PR. These are the multiplayer-desync tripwire: if the trace differs between the Worker build and the client build of `sim/`, co-op will desync, and the fixture catches it offline.
2. **Unit tests (vitest)** for sim modules, protocol encode/decode, delta reconstruction (port `sds/tests/delta-client-reconstruction.spec.ts` as the acceptance harness), store logic, and worker handlers (workerd-compatible test env).
3. **Worker integration tests**: room lifecycle (join, rejoin-reclaims-slot, host migration, grace eviction), auth chain (register, TOFU re-prove, ticket expiry), rate limits and backpressure eviction against a local DO.
4. **Browser probes (tools/, Playwright)** driving the real app through its normal path: boot-to-interactive timing, a scripted herding run to completion, screenshot capture for the art critic loop, frame-time percentile capture, WebGPU and forced-WebGL2 backend both. Probes are never in-bundle modes and never add URL params beyond the sanctioned three (sds failure mode: 23 load-bearing debug params).
5. **Determinism cross-check**: a CI job runs the same trace seed through `sim/` bundled by Vite and by esbuild (the wrangler path) and byte-compares, pinning the toolchain-difference risk that TypeScript-in-three-toolchains introduces.

## Gates

- No phase closes with failing tests or build.
- Visual work additionally passes the harsh-critic loop (spec/05); juice and audio pass their in-motion critic loops (spec/06, spec/07).
- Every phase report includes: test counts, perf probe percentiles, bundle size, and screenshots.

## Fixture hygiene

- 4-decimal rounding before writing traces.
- Placement manifests byte-compared (bake determinism).
- Goldens live with a manifest of the exact camera/time/seed that produced them.
