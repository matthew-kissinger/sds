# Cycle 92 — nsl-frame-floor

> Drafted 2026-06-11 after Cycle 91 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Newsheepdogland's 1%-low frame rate reads anywhere from 54 to 70 FPS on identical code (Cycle 91 close evidence: gate battery 70.5 at 13:33Z, shipping-build re-run 54.2 at 14:40Z, A/A control proving box-state drift), with an intermittent ~146-160ms stall and a heap-drop hitch fraction of 0.37-0.44 pointing at GC. This cycle finds what actually moves the floor (in-page allocation pressure vs box state), fixes the part that is ours (allocation hot spots and the stall source), and re-runs the Experimental-pill gate under a bracketed A/A protocol so the verdict is trustworthy. Before: NSL hitches intermittently and the pill gate can only be measured in a favorable window. After: the stall class is attributed and remediated or explained with evidence, steady-state allocation is measurably lower, and the pill decision (off or stays) rests on a valid controlled measurement.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code. The ecosystem evolves; what was "the" solution last cycle may not be optimal now.
- **Measure on the actual hardware target** (RTX 3070 desktop) before committing to a technique. The jitter probe is the instrument of record; idle-camera numbers never gate.
- **Pick the simplest thing that meets the budget** rather than the most impressive. If the simple version reads correctly, ship it; escalate only on demonstrated need.

## Open questions to resolve before writing code

1. **Q1: Is the 54-70 swing dominated by in-page GC or by box state (GPU clocks, background load)?** Author lean: both contribute and they compound - GC pauses land harder when the GPU is already downclocked. The durable fix is reducing allocation so the floor is robust regardless of window; the methodology fix is bracketing every gate battery with A/A controls. Phase 2 answers this with per-run box-state telemetry correlated against heap-drop counts.
2. **Q2: Where does the steady-state garbage come from?** Author lean: per-frame temporaries in the client render/update path (vector clones, array literals, closures in hot loops, perf-monitoring aggregation). Don't guess - Phase 2's CDP sampling heap profiler names the allocating functions by stack before Phase 3 touches anything.

## Architecture / shared changes

None. All remediation is client-side (`js/`). The `shared/` deterministic core is explicitly out of scope this cycle (see Hard stops); if the heap profiler ranks a `shared/` function as a top allocator, that finding is recorded as carryover for a future cycle with the sim-change ritual, not fixed here.

## Phase shape rules

A cycle has **≤ 8 phases**. If you find yourself drafting a 9th, the work is two cycles, not one.

Each phase is either **fully autonomous** (the agent ships without Matt's pairing) or **fully paired** (Matt's hands on the keyboard for it). **Don't mix modes within a phase.** All phases this cycle are fully autonomous.

A phase has a **single sharp goal** and **≤ 4 hours** of work. Larger means split.

## Acceptance criteria — EARS format

Every phase's Acceptance section uses [EARS notation](https://kiro.dev/docs/specs/) so the lines are testable by construction:

- **Event-driven**: `When [trigger], the [system] shall [response].`
- **State-driven**: `While [precondition], the [system] shall [response].`
- **Unwanted-event**: `If [unwanted], then the [system] shall [response].`

## Phase 1 — Probe telemetry: box state, allocation rate, heap profile (~3hr)

**Independently testable.** The instrument has to see the suspects before any attribution or fix is credible. Extends [`tools/cycle89-jitter-probe.mjs`](../tools/cycle89-jitter-probe.mjs) (the living jitter instrument, already extended in Cycles 90 and 91).

1. **Box-state telemetry (`--boxState=1`).** Sample `nvidia-smi` (GPU clock, power state, temperature, utilization) plus CPU load from the Node side before and after each run; record per-run in the manifest. This is the signal that was missing when the Cycle 91 gate flipped between windows.
2. **Allocation-rate metric.** From the existing 1s heap samples, compute the steady-state allocation rate (mean heap-growth slope between drops, MB/s) and add it to `computeMetrics` output as `heap.allocRateMBs`. Tighten heap sampling to 250ms for sharper GC-drop timing.
3. **Sampling heap profile (`--heapProfile=1`).** Attach a CDP session (`HeapProfiler.startSampling` / `stopSampling`) across the measure window; fold the profile into top-N allocation sites (selfSize bytes, function name, script URL) recorded in the run manifest.

**Acceptance (EARS):**

- [x] When a driven probe run executes with `--boxState=1`, the output manifest shall record GPU clock/power/temperature/utilization samples per run. (smoke-probe2.json: before P8/210MHz, after P3/1095MHz, power/temp/util/vram + cpuLoadPct per run.)
- [x] When a driven probe run executes with `--heapProfile=1`, the output manifest shall record the top allocation sites (bytes, function, source) for the measure window. (GC-inclusive sampling; smoke run: 367.8MB sampled, top site getDynamicCacheKey@three.webgpu 68.4MB/10s.)
- [x] When a probe run completes, `metrics.heap.allocRateMBs` shall be a finite number. (Field practice: 21.4-22.2 MB/s.)
- [x] When Phase 1 ships, `npm run perf:jitter -- --check=1` (field rail) shall pass unchanged. (PASS 2026-06-11: mean 1%-low 135.7 vs >= 55, worst 13.9ms vs <= 45ms, hitch rate 1.7 vs <= 300. Note: 250ms heap sampling reads ~3x the drop count of the old 1s sampling; historical comparisons use a 1s-downsampled recount.)

## Phase 2 — Attribute the variance and the stall (~3hr)

**Depends on:** Phase 1.

1. **Batteries.** Run >= 2 driven NSL survival batteries (5 runs each) with `--boxState=1 --heapProfile=1`, spaced across the session window. Correlate per-run 1%-low against (a) GPU clock/power state, (b) heap-drop count, (c) allocation rate.
2. **Stall signature.** For every frame delta >= 100ms across all runs: does it coincide with a longtask (JS), a heap drop (major GC), a GPU clock dip (box), or none (other)? The existing hitch-correlation machinery already timestamps these; extend the per-run report with a `worstFrames` attribution list.
3. **Write it down.** `cycle92-validation/ATTRIBUTION.md` with the numbers: variance decomposition (within-battery vs between-battery), the stall class attribution, and the top-5 allocation sites ranked by bytes.

**Acceptance (EARS):**

- [ ] When Phase 2 completes, `cycle92-validation/ATTRIBUTION.md` shall attribute the >= 100ms stall class to a named source with hitch-correlation evidence.
- [ ] When Phase 2 completes, the top 5 steady-state allocation sites on driven NSL survival shall be ranked by bytes in the attribution doc.
- [ ] When Phase 2 completes, per-run 1%-low shall be tabulated against GPU clocks and heap-drop counts across >= 10 runs.

## Phase 3 — Allocation reduction in the client hot path (~4hr)

**Depends on:** Phase 2 (fix what the profiler names, not what intuition names).

1. **Fix the top-ranked allocation sites** in `js/` (render loop, per-frame update, perf monitoring, survival HUD - wherever the profile points). Typical shapes: reuse scratch vectors/arrays, hoist closures out of hot loops, replace per-frame object literals with mutated fields, gate debug aggregation behind its existing visibility flag.
2. **No `shared/` edits.** If a top site lives in `shared/`, record it in ATTRIBUTION.md as carryover and move to the next site.
3. **Re-measure** the same battery shape as Phase 2; compare allocation rate, heap drops, hitch counts.

**Acceptance (EARS):**

- [ ] When Phase 3 ships, steady-state allocation rate (`heap.allocRateMBs`) on driven NSL survival shall drop >= 30% vs the Phase 2 baseline battery.
- [ ] When Phase 3 ships, mean heap drops per 30s run shall be <= 8 on the same battery shape.
- [ ] When Phase 3 ships, `npm test` shall pass with sim-baseline fixtures byte-identical.
- [ ] When Phase 3 ships, the field rail (`npm run perf:jitter -- --check=1`) shall pass.

## Phase 4 — Stall remediation (~2hr)

**Depends on:** Phase 2's attribution (and Phase 3 if the stall is GC).

1. **If the stall is major-GC:** Phase 3's allocation cuts should shrink it; verify the >= 100ms class is gone from a fresh battery, and if a residue remains, chase the specific allocation that feeds the major GC (large transient buffers, not steady churn).
2. **If the stall is box-state (GPU power-state dip):** it is not a code defect; document the signature in ATTRIBUTION.md so future gates recognize it, and confirm the bracketed protocol (Phase 5) excludes it.
3. **If the stall is something else** (pipeline creation, shader compile, wave landing, worker message): fix at the named source.

**Acceptance (EARS):**

- [ ] When Phase 4 ships, a 5-run driven NSL battery shall show worst frame <= 45ms, or the >= 100ms stall class shall be attributed to environment with recorded evidence and an explicit carryover note.

## Phase 5 — Bracketed pill gate + decision (~2hr)

**Depends on:** Phases 3-4.

1. **Protocol.** The gate battery (5 driven runs, NSL survival, shipping build) is bracketed by two 2-run A/A control batteries of the same build, all in one session window. The window is **valid** iff the two control brackets' mean 1%-low agree within 10%. An invalid window voids the gate - re-run; never average across windows.
2. **Gate** (unchanged from Cycle 91): 5-run mean 1%-low >= 55 AND worst frame <= 45ms.
3. **Decision.** Pass with a valid bracket: remove the Experimental (WIP) pill from the NSL entrance. Fail or environment-blocked: pill stays, evidence recorded.

**Acceptance (EARS):**

- [ ] When Phase 5 completes, a gate verdict with a valid bracket (controls within 10%) shall be recorded in `cycle92-validation/REPORT.md`.
- [ ] If the gate passes, then the NSL entrance shall no longer render the Experimental (WIP) pill.
- [ ] If the gate fails, then the pill shall remain and the failing numbers shall be recorded in the report.

## Phase 6 — Rails, report, close (~1hr)

**Depends on:** everything above.

1. **Budgets.** If the NSL floor moved, update the jitter budgets deliberately with the change recorded here (the budget file is `cycle89-validation/jitter-budgets.json`; field-rail budgets do not move this cycle).
2. **Report.** `cycle92-validation/REPORT.md`: before/after allocation rate, heap drops, stall class, gate verdict, pill decision.
3. **Close ritual.** `/cycle-close`: acceptance walk, archive, BACKLOG, scaffold Cycle 93, NEXT_SESSION rewrite, memory, commit, push.

**Acceptance (EARS):**

- [ ] When Cycle 92 closes, `cycle92-validation/REPORT.md` shall exist with before/after numbers for allocation rate, heap drops, and the gate verdict.
- [ ] When Cycle 92 closes, `npm test` and `npm run build` shall pass.

## Dependencies

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6
```

Strictly serial: the instrument before the attribution, the attribution before the fix, the fix before the gate.

## Frozen files (cycle-specific additions)

The durable fence ([`INTERFACE_FENCE.md`](INTERFACE_FENCE.md)) is enough. Note the standing rule: **no `shared/` edits this cycle at all** - even allocation-neutral ones - because no phase carries the sim-change ritual.

## Hard stops

Durable hard stops apply on every cycle - see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific:

1. **A Phase 3 fix candidate lives in `shared/`** - don't touch it. Record as carryover, move on.
2. **Field rail fails after any change** (`npm run perf:jitter -- --check=1`) - revert that change before proceeding to the next.
3. **`npm test` shows any sim-baseline diff** - revert immediately; nothing this cycle may change sim behavior.
4. **Invalid gate window** (bracket controls differ > 10%): the window is void. Re-run. If 3 consecutive windows are invalid, the gate is environment-blocked: pill stays, record, stop trying.
5. **NSL median FPS drops > 5%** from the 144.9 vsync-bound baseline after Phase 3/4 - revert the regressing change.

## What NOT to do during this cycle

- No P8 lighting items (keyframed hemisphere ambient, sky-dome A/B) - survey-gated, Matt reviews first.
- No rock re-bake, no KTX2, no golden re-capture - all pending Matt's Cycle 91 visual approval.
- No render scale-back levers (canopy shadows stay on; far-switch stays at 200m) - this cycle is about the floor's variance, not trading visuals for FPS.
- No probe-methodology rabbit holes beyond what the gate needs (no OS-level perf governors, no dedicated benchmark box).
- No `shared/` edits, period.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When Cycle 92 closes, the >= 100ms NSL stall class shall be attributed with evidence, steady-state allocation rate shall be down >= 30%, and the pill verdict shall come from a valid bracketed window.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items (Cycle 91 entry has the carryover this plan draws from)
- `cycle91-validation/REPORT.md` (local) — the evidence base: perf ladder, A/A control, heap-drop history
- [EARS notation](https://kiro.dev/docs/specs/) — testable acceptance lines
