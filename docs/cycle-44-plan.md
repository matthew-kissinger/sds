# Cycle 44 — release-readiness-sweep

> Drafted 2026-05-28 after Cycle 43 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

(Needs a one-paragraph goal before `/cycle-start`.) This is a consolidation cycle: gather the loose ends carried across Cycles 40-43 and anything else worth clearing before a full release, then ship a coherent slice of them. The candidate scope below is a triage list, **not** a ready single-cycle plan. At `/cycle-start`, shape it into one coherent goal and **≤ 8 phases**. The candidate set is larger than one cycle and mixes autonomous and paired/real-device work, so expect to either (a) pick one autonomous theme and defer the rest, or (b) split the paired real-device proofs into their own paired-track cycle. Do not author all of the buckets below as phases of a single cycle.

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

## Open questions to resolve before writing code

1. **Q1: Which single theme (or autonomous + paired split) is Cycle 44?** Author lean: bundle A + B + F as one autonomous "hygiene + cleanup" cycle; spin C + D + E into a separate paired-track cycle, since real-device and taste work can't ship without Matt and shouldn't be mixed into an autonomous phase.

## Phase shape rules

A cycle has **≤ 8 phases**. If you find yourself drafting a 9th, the work is two cycles, not one.

Each phase is either **fully autonomous** or **fully paired** — never mixed. A phase has a **single sharp goal** and **≤ 4 hours** of work.

## Phase 1 — <name> (~Xhr)

(Fill in at `/cycle-start` after triaging the candidate scope.)

**Acceptance (EARS):**

- When Phase 1 ships, then `<system>` shall `<response>`.

## Dependencies

```
(Fill in once phases are chosen.)
```

## Frozen files (cycle-specific additions)

- (Likely `ARCHITECTURE.md` soft-fence if bucket F is in scope; the durable fence in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) otherwise covers it.)

## Hard stops

Durable hard stops apply on every cycle — see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. If a dependency change (bucket A) reddens `npm test` or `npm run build`, stop and surface; do not pin past a real break.

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
