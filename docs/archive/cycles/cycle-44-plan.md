# Cycle 44 — release-readiness-sweep

> Drafted 2026-05-28 after Cycle 43 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Cycle 44 is an autonomous hygiene + cleanup sweep. It clears the dependency/security and build-bloat carryover that has accrued since Cycle 40 and finishes two long-tail code/doc cleanups, without touching the deterministic sim, the scene schema, or player-visible behavior. Concretely: resolve the moderate `uuid` Dependabot advisory (dev-tooling-only, transitive through `browserstack-node-sdk`, never in `dist/`); bring the main bundle back under its accepted ratchet or re-baseline that ratchet with a written rationale; dedup the triplicated `pointToSegmentDistance` / `isPointInPolygon` helpers onto the canonical [`js/gamestate/polygonSpawn.js`](../js/gamestate/polygonSpawn.js); and give the four undocumented Cycle 5 primitives first-class [`ARCHITECTURE.md`](../ARCHITECTURE.md) entries. The paired taste / real-device / playtest buckets (C, D, E below) are deferred to a separate paired-track cycle, since they cannot ship without Matt at the keyboard. No version bump; this cycle ships no player-visible change.

## How to read this plan

This is a scaffold with a curated candidate backlog, written at Cycle 43 close on Matt's instruction to "gather all and anything worth adding to next cycle." Triage it at `/cycle-start`. The standing long-tail of deferred items lives in [`BACKLOG.md`](BACKLOG.md) under "Deferred / not blocking" — pull from there too if a theme has room.

## Candidate scope (triage at /cycle-start into ≤ 8 phases)

Grouped by theme and execution mode. Mode matters: autonomous buckets can ship without Matt at the keyboard; paired buckets need his taste, a real device, or credentials.

### A. Dependency / security hygiene (autonomous)

- Resolve the moderate Dependabot advisory at `security/dependabot/25` (the `uuid` advisory, transitive through Google / BrowserStack dev tooling). The Cycle 42 close noted it as maintenance carryover; the GitHub security tab still flags it and the `uuid` Dependabot update run failed. Decide: override the transitive version, bump the parent, or document why it stays. Confirm `npm test` + `npm run build` stay green after any dependency change.

### B. Build / bundle (autonomous)

- Vite large-chunk warning is creeping: `main` is ~607 kB and `three` is ~617 kB after minification. The Cycle 41 close accepted a main-bundle ratchet at 593 KiB; it has grown since. Investigate `manualChunks` / dynamic-import code-splitting for the main bundle, or re-baseline the ratchet with a written rationale. Measure gzip transfer size, not just raw.

### C. WebGPU painterly parity follow-through (paired — taste)

- The six low-sun actor / Open Country material-lock manual-review classifications from `npm run validation:cycle42-material-lock` are still open for Matt's approval. Walk them and either accept or open targeted parity fixes.
- Broader WebGPU terrain / foliage material parity with the WebGL reference remains a standing polish item (Cycle 41 carryover).

### D. Mobile / real-device proofs (paired — blocked locally)

- Android WebGPU water / device proof: blocked in Cycles 41-42 by no authorized ADB device. Needs a real device or the Hub's ADB path set up.
- BrowserStack iOS Safari water canary: blocked by missing `BROWSERSTACK_*` / `BS_*` credentials in the local env. Needs creds wired before it can run.

### E. Multiplayer / playtest (paired)

- Open Country paired two-client playtest: deferred since Cycle 40. Needs two clients and Matt's eyes.

### F. Code / doc cleanup (autonomous)

- Cross-module polygon-spawn dedup: [`js/OptimizedSheep.js`](../js/OptimizedSheep.js), [`js/SandboxConfig.js`](../js/SandboxConfig.js), and [`js/StructureBuilder.js`](../js/StructureBuilder.js) each keep their own `pointToSegmentDistance` / `isPointInPolygon` copies. Cycle 29 B2 extracted the canonical pair to [`js/gamestate/polygonSpawn.js`](../js/gamestate/polygonSpawn.js) but only repointed GameState. Note: `OptimizedSheep.js` is cohesive-by-design (see [`DECISIONS.md`](../DECISIONS.md)) so dedup there means importing the shared helper, not decomposing the file.
- `ARCHITECTURE.md` has no entries for four load-bearing Cycle 5 primitives: `Boundary` (rect/island discriminated schema), `SceneObstacles` (kdbush proxy collider), `AnimeWater` (shoreline-boundary shader post-Cycle 32), and `Random` (`mulberry32` shared PRNG). Add them on the next ARCHITECTURE pass.

## Open questions (resolved at /cycle-start)

1. **Q1 [RESOLVED 2026-05-28]: Which single theme (or autonomous + paired split) is Cycle 44?** Resolved with Matt: bundle A + B + F as this autonomous "hygiene + cleanup" cycle (Phases 1-4 below). Buckets C + D + E (paired taste, real-device proofs, multiplayer playtest) are deferred to a separate paired-track cycle and stay recorded in the candidate scope above + carried into [`BACKLOG.md`](BACKLOG.md) at close.

## Phase shape rules

A cycle has **≤ 8 phases**. If you find yourself drafting a 9th, the work is two cycles, not one.

Each phase is either **fully autonomous** or **fully paired** — never mixed. A phase has a **single sharp goal** and **≤ 4 hours** of work.

## Phase 1 — Resolve the `uuid` Dependabot advisory (A, autonomous, ~1.5hr)

`security/dependabot/25` flags the moderate `uuid` advisory. `npm ls uuid` confirms the only path is dev tooling: `browserstack-node-sdk@1.55.3 → googleapis@126.0.1 → google-auth-library → gaxios → uuid@9.0.1` (and `googleapis-common → uuid@9.0.1`); `browserstack-node-sdk` also pulls a current `uuid@11.1.1` directly. None of this reaches the browser bundle (`dist/`). Decide and apply one of: (a) an npm `overrides` entry forcing the transitive `uuid` to a patched version, (b) bump `browserstack-node-sdk` to a release whose `googleapis` chain no longer pulls the flagged `uuid`, or (c) document why it stays (dev-only, never shipped) with a dated [`DECISIONS.md`](../DECISIONS.md) entry and annotate/dismiss the alert.

**Files touched:** `package.json`, `package-lock.json`, possibly [`DECISIONS.md`](../DECISIONS.md) (append-only).

**Acceptance (EARS):**

- When Phase 1 ships, then either the GitHub alert `security/dependabot/25` shall be resolved (no flagged `uuid` in `npm ls uuid`), or [`DECISIONS.md`](../DECISIONS.md) shall carry a dated entry recording why the dev-only transitive `uuid` stays.
- When Phase 1 ships, then `npm test` shall stay green and `npm run build` shall stay clean.
- If a dependency change reddens `npm test` or `npm run build`, then the agent shall stop and surface; it shall not pin past a real break.

## Phase 2 — Resolve the main-bundle ratchet (B, autonomous, ~3hr)

The Vite main chunk is ~607 kB raw vs the 593 KiB ratchet accepted in Cycle 41; the durable bundle-size emergency stop is effectively already tripped. Measure both raw and gzip transfer size of the `main-*.js` chunk, then either (a) reduce it under the recorded baseline via `manualChunks` / dynamic-import code-splitting, or (b) re-baseline the ratchet with a written rationale (what grew, why it is justified, gzip transfer impact). Gzip transfer size is what players pay; measure it, not raw alone.

**Frozen-file authorization (this phase only):** Phase 2 MAY edit [`tests/refactor-baseline/__fixtures__/bundle-sizes.json`](../tests/refactor-baseline/__fixtures__/bundle-sizes.json) — **only if** the decision is re-baseline. Migration story: the file is a characterization ratchet with no runtime consumer; re-baselining updates the recorded chunk sizes and records the rationale in this phase's Acceptance + a dated [`DECISIONS.md`](../DECISIONS.md) entry. No other consumer changes.

**Files touched:** `vite.config.js` (if code-split), [`tests/refactor-baseline/__fixtures__/bundle-sizes.json`](../tests/refactor-baseline/__fixtures__/bundle-sizes.json) (if re-baseline, fence-authorized above), possibly [`DECISIONS.md`](../DECISIONS.md).

**Acceptance (EARS):**

- When Phase 2 ships, then either `npm run build`'s `main-*.js` chunk shall be ≤ the recorded baseline, or [`tests/refactor-baseline/__fixtures__/bundle-sizes.json`](../tests/refactor-baseline/__fixtures__/bundle-sizes.json) shall be re-baselined with a dated rationale in [`DECISIONS.md`](../DECISIONS.md).
- When Phase 2 ships, then the gzip transfer size of the `main-*.js` chunk shall be measured and recorded (not raw size alone).
- When Phase 2 ships, then `npm test` shall stay green and `npm run build` shall stay clean.
- If the bundle work pushes the `main-*.js` chunk further over baseline instead of resolving it, then the agent shall stop and surface.

## Phase 3 — Dedup polygon-spawn helpers (F1, autonomous, ~2hr)

[`js/OptimizedSheep.js`](../js/OptimizedSheep.js), [`js/StructureBuilder.js`](../js/StructureBuilder.js), and [`js/SandboxConfig.js`](../js/SandboxConfig.js) each carry their own `pointToSegmentDistance` / `isPointInPolygon` copies. Cycle 29 B2 extracted the canonical pair to [`js/gamestate/polygonSpawn.js`](../js/gamestate/polygonSpawn.js) but repointed only GameState. Repoint the three remaining consumers to import the shared helpers and delete the local copies. The dedup must be **behavior-preserving**: confirm the canonical implementation is numerically identical to the copies before deleting (scatter placement feeds the refactor-baseline scatter-positions golden). [`js/OptimizedSheep.js`](../js/OptimizedSheep.js) is cohesive-by-design — import the helper, do **not** decompose the file.

**Files touched:** [`js/OptimizedSheep.js`](../js/OptimizedSheep.js), [`js/StructureBuilder.js`](../js/StructureBuilder.js), [`js/SandboxConfig.js`](../js/SandboxConfig.js).

**Acceptance (EARS):**

- When Phase 3 ships, then a grep for a local `function pointToSegmentDistance` / `function isPointInPolygon` definition across the three consumer files shall return 0 (each imports from [`js/gamestate/polygonSpawn.js`](../js/gamestate/polygonSpawn.js)).
- When Phase 3 ships, then `npm test` shall stay green, including the refactor-baseline scatter-positions golden (behavior unchanged).
- If the refactor-baseline scatter-positions or terrain fixtures drift after the repoint, then the agent shall stop and surface before regenerating — the dedup must be behavior-preserving.

## Phase 4 — Document the four Cycle 5 primitives in ARCHITECTURE.md (F2, autonomous, ~1hr)

[`ARCHITECTURE.md`](../ARCHITECTURE.md) lacks first-class entries for four load-bearing Cycle 5 primitives: `Boundary` (rect/island discriminated schema), `SceneObstacles` (kdbush proxy collider), `AnimeWater` (shoreline-boundary shader, post-Cycle 32), and `Random` (`mulberry32` shared PRNG). Add concise entries placing each in the repo's module map.

**Files touched:** [`ARCHITECTURE.md`](../ARCHITECTURE.md) (soft fence — additive update).

**Acceptance (EARS):**

- When Phase 4 ships, then [`ARCHITECTURE.md`](../ARCHITECTURE.md) shall contain entries for `Boundary`, `SceneObstacles`, `AnimeWater`, and `Random`.

## Dependencies

```
Phase 1 (uuid)         ─┐
Phase 2 (bundle)       ─┤  all four independent (disjoint files); any order or parallel
Phase 3 (poly dedup)   ─┤
Phase 4 (ARCHITECTURE) ─┘
```

Each phase ends green (`npm test` + `npm run build`) before the next starts. Phases 1 and 2 both touch the package/build surface but different files, so there is no ordering constraint between them.

## Frozen files (cycle-specific additions)

- **[`tests/refactor-baseline/__fixtures__/bundle-sizes.json`](../tests/refactor-baseline/__fixtures__/bundle-sizes.json)** — **Phase 2 only**, **only if** the decision is re-baseline. Migration story is in Phase 2 (characterization ratchet, no runtime consumer, rationale recorded in Phase 2 Acceptance + a dated [`DECISIONS.md`](../DECISIONS.md) entry).
- **[`ARCHITECTURE.md`](../ARCHITECTURE.md)** — soft fence; Phase 4 additive entries only.
- **[`DECISIONS.md`](../DECISIONS.md)** — append-only; Phases 1 and 2 may append a dated decision. Never rewrite prior entries.
- All [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) deterministic-sim cores and [`shared/scenes/types.js`](../shared/scenes/types.js) stay untouched this cycle.

## Hard stops

Durable hard stops apply on every cycle — see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. If a dependency change (Phase 1) reddens `npm test` or `npm run build`, stop and surface; do not pin past a real break.
2. If Phase 2's bundle work pushes the `main-*.js` chunk further over baseline rather than resolving it, stop and surface (durable bundle-size stop).
3. If Phase 3's polygon-spawn dedup drifts the refactor-baseline scatter-positions or terrain fixtures, stop and surface before regenerating — the dedup must be behavior-preserving (it touches no `shared/` sim core but feeds visible scatter placement).

## What NOT to do during this cycle

- Do not author every candidate bucket as a phase of one cycle. Triage first.
- Do not mix autonomous and paired work inside a single phase.
- Do not bump the version or ship a release unless a phase explicitly scopes it.

## Success criteria (cycle close)

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) — pickup-state contract
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/archive/cycles/`](archive/cycles/) — past cycle plans
- [EARS notation](https://kiro.dev/docs/specs/) — testable acceptance lines
