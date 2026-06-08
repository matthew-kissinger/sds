# Cycle 78 — webgpu-nsl-count-collapse

> Drafted 2026-06-08 after Cycle 77 closed; authored + executed the same day, run autonomously
> (Matt: "complete cycle 78 autonomously and deploy then report back"). Measure-first, Path B.
> Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc.

## Outcome (2026-06-08): the attribute-path collapse is PROVEN and large (76s -> ~10s of main-thread blocking), but a residual ~9s synchronous build block keeps the lift out of budget. Pin STAYS (6th cycle). Prod byte-identical.

The carried-in fork was Path B (count-collapse, then a clean lift). Only Path B is autonomously
executable (Path A is an explicit risk call; the pivot is paired hands-on work), so "autonomously"
resolved to Path B, gated by hard stop 1. Result:

- **Root cause nailed (corrects Cycle 76 AND my own first hypothesis).** Each per-chunk shader is
  distinct because of the instancing uniform buffer's NAME (`NodeBuffer_<nodeId>`, unique per
  `InstancedMesh`), not just the baked instance count. Allocating a uniform capacity (count-only
  fix) did NOT collapse anything (1034 -> 1035 distinct WGSL, measured).
- **The attribute path collapses it.** Padding capacity past `maxUniformBufferBindingSize/64`
  (=1024 on the 3070) forces Three's vertex-attribute instancing path (layout-bound names, shared
  shader): cold nsl distinct WGSL 1034 -> 294 (grass) -> 16 (grass+tree); WGSL bytes 16.2 MB ->
  0.23 MB. Main-thread blocking 76s -> ~10s.
- **Pin stays.** A residual ~9s synchronous build block remains (present with only 16 pipelines, so
  not compile; it tracks the forced ~3.3x grass instance padding + per-mesh WebGPU resource
  creation). WebGL builds the same scene with a 491 ms worst block and is stable in 3.8s. A 9s
  freeze on the scene 100% of players load is not within budget and retains TDR risk -> hard stop 1
  unmet (crash-clean + error-free were reached; within-budget was not).
- **Nothing ships to `js/` / `shared/`; prod byte-identical.** Two probes committed
  (`tools/webgpu-count-collapse-probe-cycle78.mjs`, `tools/webgpu-budget-compare-cycle78.mjs`).
  Evidence: `cycle78-validation/README.md`.

The clean lift is now one concrete paired step: make grass naturally exceed 1024 instances/chunk
(fewer, larger chunks, no padding) so the attribute path is free of the padding block, validate the
culling-granularity-vs-draw-call frame-time tradeoff (hard stop 2), re-apply the Cycle 77 race fix,
lift. See `cycle78-validation/README.md`.

## Goal

Collapse the ~1034 distinct per-chunk WebGPU pipelines on newsheepdogland to a handful so the cold
load drops from ~80s toward WebGL's ~4s, then lift the WebGL pin - or prove it cannot be done
cleanly within hard stop 1 and keep the pin with new, sharper evidence. (Executed: the collapse is
proven; the lift is blocked by a residual build block; pin stays.)

## Open questions to resolve before writing code

1. **Q1: Path A, B, or pivot?** Resolved: Path B (the only autonomously-executable fork, gated by
   hard stop 1).
2. **Q2: attribute-path or shared-instance-buffer/batching?** Resolved by spike: the attribute path
   collapses the count (proven). It needs padding to force on a device whose `count <= limit/64`;
   the no-padding form is "make grass naturally > 1024/chunk" (the Cycle 79 step). A true shared
   instance buffer / batching was not needed once the attribute path was shown to collapse.
3. **Q3: does the collapse preserve per-chunk frustum culling?** Yes - every chunk stays its own
   `InstancedMesh` with its own bounds; only the `instanceMatrix` capacity changes.

## Phase 1 — SPIKE: prove the pipeline-count collapse on the 3070 (~3hr) [DONE]

**Independently testable.** Decides the whole cycle before touching frozen-cohesive code.

1. Instrument the Dawn boundary (`createRenderPipeline[Async]` + `createShaderModule`); isolate the
   nsl build via a delta snapshot; report pipeline count + distinct WGSL + WGSL bytes.
2. A/B `globalThis.__SDS_COUNT_COLLAPSE`: off / uniform-capacity / attribute-path (pad > 1024), for
   grass and trees.
3. Budget probe: path-agnostic WebGL-vs-WebGPU cold-load build/ready/stable-fps + worst long-task.

**Acceptance (EARS):**

- When the spike runs, then `tools/webgpu-count-collapse-probe-cycle78.mjs` shall report the cold
  nsl distinct-WGSL count for each mode. (Met: off 1034, uniform 1035, grass-attr 294, both-attr 16.)
- When the attribute path is forced, then distinct WGSL shall drop by > 10x. (Met: 1034 -> 16.)
- When the budget probe runs, then it shall report WebGL's worst main-thread long-task as the
  budget reference. (Met: 491 ms; WebGPU full-collapse 9,005 ms.)

## Phase 2 — Decision: lift or keep, on hard stop 1 (~1hr) [DONE]

**Acceptance (EARS):**

- If a within-budget AND crash-clean AND error-free cold load is verified on the 3070 across >= 5
  runs, then the pin shall be lifted; else the pin shall stay and all `js/`+`shared/` edits shall be
  reverted byte-identical. (Met: within-budget UNMET -> pin stays, reverted byte-identical.)
- When the cycle closes, then `git diff HEAD -- js/ shared/` shall be empty. (Met.)

## Dependencies

```
Phase 1 (spike) -> Phase 2 (decision) -> close
```

## Frozen files (cycle-specific additions)

- `shared/scenes/newsheepdogland.js` — pin lift authorized ONLY on a met hard stop 1. Not met;
  untouched (the spike commented the pin temporarily, then restored it byte-identical).
- `js/world/TreePlacement.js` + `js/GrassSystem.js` — touched flag-gated for the spike only, then
  reverted byte-identical. No production change.
- `js/main.js` `runFrame()` — the Cycle 77 race fix was NOT applied (pin stays, lift deferred).

## Hard stops

Durable hard stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific:

1. Do not remove the newsheepdogland WebGL pin unless a within-budget AND crash-clean AND
   error-free WebGPU cold load is verified on the 3070 across >= 5 runs. (Enforced: within-budget
   unmet -> pin stays.)
2. Do not degrade grass/tree visual quality or lose per-chunk frustum culling to cut compile cost
   without Matt's sign-off. (Enforced: the no-padding lift needs grass-chunk-size tuning = a perf
   call that wants Matt; deferred rather than shipped.)
3. Do not touch `shared/` sim files. (Enforced: byte-identical.)

## What NOT to do during this cycle

- Don't re-apply the storage fix or the uniform-capacity-only fix expecting a budget win (both
  refuted: storage Cycle 77, uniform-capacity this cycle - the per-mesh buffer NAME is the driver).
- Don't ship the padded attribute-path collapse to prod - it trades 70s of compile for a ~9s
  padding/build block and is a net regression for the small non-pinned scenes.

## Success criteria (cycle close)

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's
  `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] If the newsheepdogland pin is lifted, then a crash-clean, error-free, within-budget WebGPU
  cold load shall be verified on the 3070 across >= 5 runs first. (N/A - pin not lifted.)

## References

- `cycle78-validation/README.md` — the root cause, the proven attribute-path collapse, the budget
  table, and the residual-build-block finding
- `tools/webgpu-count-collapse-probe-cycle78.mjs` + `tools/webgpu-budget-compare-cycle78.mjs`
- [`docs/archive/cycles/cycle-77-plan.md`](archive/cycles/cycle-77-plan.md) — the cycle that found
  the ~80s count-dominated compile + the validated race fix
- `node_modules/three/src/nodes/accessors/InstanceNode.js` — the uniform-vs-attribute instancing
  decision (`uniformBufferSize <= getUniformBufferLimit()`)
