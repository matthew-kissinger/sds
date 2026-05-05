# Cycle 23 — `heightfield-amplitude-fix-and-cinema` (stub)

> Drafted 2026-05-05 at Cycle 22 close. **Direction not yet chosen — Matt picks at /cycle-start.** This stub catalogues the leading candidates surfaced by Cycles 19–22 carryover.

## Candidate goals (pick one as primary)

### A. Heightfield amplitude bug — root fix (deferred since Cycle 19)

Root cause documented in [`NEXT_SESSION.md`](../NEXT_SESSION.md): `Heightfield.sample()` multiplies stored data by `peakHeight` while `scripts/bake-heightmap.mjs` already writes pre-multiplied metres. RH/OC terrain has shipped at peakHeight² metres for ~14 cycles. Visual character of the game now depends on the amplified state.

Phases:
1. Reproduce in a unit test against `tests/heightfield.spec.js` — confirm the doubled amplification.
2. Decide direction: (a) fix `Heightfield.sample()` and re-bake heightmaps at intended `peakHeight` — terrain becomes flatter, scene presets need a peakHeight bump from 5 → 25 (OC) and 6 → 36 (RH) to preserve the visual character players have come to expect; or (b) fix `scripts/bake-heightmap.mjs` to write raw `[0, 1]` data and leave `Heightfield.sample()` as the multiplier — also requires re-bake.
3. Re-bake heightmaps + verify GrassSystem clamp `> 50` can revert to `> 10`.
4. Re-capture OG cards + cinematic videos (depends on Cycle 22 deferred Cinema runner fix).

### B. Cinema runner fix + 4 deferred cinematic videos

`tools/cinematic/run.mjs` has a `page.screenshot: Timeout 30000ms exceeded — waiting for fonts to load` then hang. Affects all shots. Workaround used in Cycle 19 + 21: capture via Playwright MCP directly. Defer cycle ships these videos:
- `dog-into-sunset`
- `lightning-strike`
- `chaos-5000`
- `oc-portal`

Phases:
1. Diagnose font-wait timeout (likely Three's Inter font load + Vite's dev-server proxy interaction).
2. Fix runner with `waitForFunction` over `document.fonts.status === 'loaded'` instead of `waitForFunction` over font-load promises.
3. Capture all 4 deferred shots; commit under `tools/cinematic/output/`.

### C. WebGPU/TSL exploratory spike

Cycle 22 Phase E parking lot. Q4 2026 / Q1 2027 candidate. Out of scope for an autonomous run; needs Matt's direct input.

## Open questions

- Which goal is primary? A is the cleaner technical fix; B unblocks press-kit cinematic content; C is the long-term direction question.
- For A: does the player visual character get preserved (option a — bump `peakHeight` config), or accept flatter terrain (option b — reset to design intent)?
- For B: should the runner wait for `document.fonts.ready` *and* a hand-tuned 500ms idle, or look for the actual underlying race?

## Frozen files (cycle-specific additions)

All [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) entries apply.

## Hard stops

1. Frozen-file change without scope authorization.
2. Sim-baseline byte drift.
3. Re-rebaking heightmaps without an explicit Matt go-ahead — this changes visual character of every scene.

## What NOT to do during this cycle

- **Don't migrate to BatchedMesh.** Phase E recommends defer to Cycle 24+.
- **Don't re-introduce pine.** Cycle 22 Phase A removed it intentionally.
- **Don't touch the kiln impostor color-match path.** Cycle 22 closed that with the unified atmospheric desat.

## References

- [`docs/cycle-22-plan.md`](cycle-22-plan.md) — predecessor.
- [`docs/cycle-22-batchedmesh-research.md`](cycle-22-batchedmesh-research.md) — BatchedMesh defer reasoning.
- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — template.
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items.
