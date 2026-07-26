# Cycle 119 - bundle

> Authored 2026-07-26, from the measured work list in [`front-door-roadmap.md`](front-door-roadmap.md) that a six-angle hunt with adversarial verification produced. **Phase 1 already shipped, out of order and before this plan existed**, because Cycle 117 could not build without it. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom.

## Goal

Payload before more features (D31). Three cycles of the front-door program still have to land and every one of them adds code, so the ratchets need headroom that arbitrates design merit rather than running order. This cycle takes the measured dead weight out of the shipped bundle without raising a single budget, and it takes the largest items first so the remaining cycles inherit room rather than a queue.

**The first thing it did was disqualify its own biggest item.** Phase 2's 38,900-byte ZSTD decoder turned out to decode all ten shipped impostor atlases rather than nothing, so it is retained and the phase is dropped. That is the measurement working, not the cycle failing: the same discipline is what made Phase 1 worth 56 KiB.

## The one rule this cycle exists to protect

**Do not raise the ratchets.** They have caught real design errors twice in three cycles, most recently a four-module split that should have been one. A cycle whose stated goal is "make the bundle smaller" is the single most dangerous place to bump a budget, because the bump would look like bookkeeping. [`tests/refactor-baseline/__fixtures__/bundle-sizes.json`](../tests/refactor-baseline/__fixtures__/bundle-sizes.json) is fence-frozen and is **not authorised by this plan**.

Current budgets, for reference. Do not edit this table into the fixture:

| family | budget KiB |
|---|---:|
| main | 665 |
| three | 615 |
| client | 177 |
| ui | 127 |
| App | 27 |
| i18n | 141 |
| vendor | 60 |
| webgpuDiagnostic | 85 |
| other | 692 |

Five of these sat at exactly zero headroom at the end of Cycle 117 (`client`, `ui`, `App`, `vendor`, `webgpuDiagnostic`). That is not a crisis and it is not this cycle's target either. The target is `other` and `main`, which is where the measured weight is.

## Phase 1 - The duplicate basis transcoder - DONE

Shipped as `3b977964`, refactored to the repo's own pattern as `d75a7546`. Recorded here because a closed cycle's plan is the record, and because the second commit is the more interesting one.

`three/examples/jsm/loaders/KTX2Loader.js:106-107` evaluates `new URL('../libs/basis/basis_transcoder.{js,wasm}', import.meta.url)` at module scope. Vite emits both as hashed assets unconditionally, and both are unreachable, because `KTX2Loader` only reads those URLs when `transcoderPath === ''` and [`js/rendering/ktx2Loader.js`](../js/rendering/ktx2Loader.js):51 always sets it. Every build since Cycle 98 shipped **two byte-identical copies** (md5 `3acfda59...`): 57,529 bytes of dead JS that the ratchet counts, plus 527,333 bytes of dead wasm that it does not.

`other` went from 691.882 KiB against a 692 KiB budget (**121 bytes of headroom across 97 chunks**) to 651,393 bytes. **56 KiB freed.**

**The refactor is the lesson.** The first fix was a new `generateBundle` plugin that deleted the emitted assets by filename regex. It worked, and it was wrong: the repo already had `externalizeThreeDracoDecoderUrlsPlugin` twenty lines above, doing the same job by rewriting the URL strings instead of deleting the files they point at. Deleting the asset while leaving the URL string live means the shipped bundle contains a URL to a file that is not there. The existing pattern was better for a reason the first attempt had missed. It was renamed `externalizeThreeDecoderUrlsPlugin` and extended, and it throws by name if a `three` upgrade reformats the source it patches, so the failure is loud rather than a silently reintroduced duplicate.

**Acceptance (EARS):** shipped. When the build runs, then exactly one copy of `basis_transcoder.js` and one of `basis_transcoder.wasm` shall be emitted. When a `three` upgrade changes the patched source, then the build shall fail with a named error rather than silently shipping a duplicate.

## Phase 2 - The ZSTD decoder - MEASURED, AND IT IS NOT DEAD

A 29 KB ZSTD decoder ships as a **38,976-character base64 literal** inside `KTX2Loader-*.js`. Measured at **38,900 B**. The plan asked, before any code, whether any shipped `.ktx2` actually uses ZSTD supercompression, on the reasoning that Phase 1's whole value came from proving unreachability rather than assuming it.

**Measured 2026-07-26. Every one of the 10 shipped `.ktx2` files uses ZSTD (`supercompressionScheme = 2`).** Container headers read directly, in `dist/` and `assets/` alike:

| file | size | scheme |
|---|---|---|
| `assets/models/trees/tree{1,2}.imposter.ktx2` | 2048x2048 | ZSTD |
| `assets/models/trees/tree{1,2}.imposter.normal.ktx2` | 2048x2048 | ZSTD |
| `assets/models/trees/tree{1,2}.imposter.depth.ktx2` | 2048x2048 | ZSTD |
| `assets/models/trees/octahedral/tree{1,2}.imposter.ktx2` | 1024x1024 | ZSTD |
| `assets/models/trees/octahedral/tree{1,2}.imposter.normal.ktx2` | 1024x1024 | ZSTD |

All ten carry `vkFormat = 0`, meaning Basis Universal, so they need the basis transcoder **and** the ZSTD layer on top. **The decoder is load-bearing for every far-tree impostor on every scene.** Deleting it would leave the whole impostor band blank. This is the opposite of Phase 1, and the measurement is exactly what separated the two.

Lazy-loading buys nothing either: impostors are part of first-interactive coverage on streamed scenes per [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md), so a deferred decoder would be fetched immediately anyway.

**So the phase is dropped as scoped.** What remains is a real but different question, deliberately NOT taken in this cycle: the atlases are already BC7/UASTC and ZSTD is an outer layer, so re-baking without it would drop 38,900 B of JS in exchange for larger asset files. That trades parse cost for transfer cost, and asset bytes are cacheable while JS bytes are not. It is a genuine tradeoff and it is also uncomfortably close to gaming a ratchet that counts JS and not assets. **It needs a measured before-and-after on both sides and an explicit decision, which is its own phase in a future cycle, not a substitution inside this one.**

**Acceptance (EARS):** shipped as a measurement. When Phase 2 closed, then the `supercompressionScheme` of every shipped `.ktx2` shall be recorded here, and the decoder shall be retained because all ten are ZSTD. If a future cycle re-bakes the atlases without ZSTD, then it shall record measured JS and asset deltas on both sides before taking it.

## Phase 3 - GLSL comments and indentation (~3hr)

**15,907 B.** esbuild minifies JavaScript and does not look inside template literals, so every GLSL shader authored as a tagged or plain template string in `js/**` ships its comments and its indentation.

This is the phase most likely to do harm, because the shaders are heavily commented and those comments are load-bearing for the next person. The rule: **strip at build time, keep in source.** A Vite transform that minifies GLSL inside template literals leaves every comment exactly where it is in the repo. Do not hand-strip comments out of source files.

Constraints:

- The strip must not touch `#version`, `#define`, `#include`, `#ifdef` or any other preprocessor line, and must not join lines across a `//` comment.
- `js/GrassSystem.js` and `js/OptimizedSheep.js` are the biggest shader carriers and are explicitly protected from decomposition by [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md). This phase does not decompose them; it changes what the build emits from them.
- WebGPU node materials are TSL, not GLSL template strings. They are not in scope and a transform that matched them would be a bug.

**Acceptance (EARS):** When Phase 3 ships, then GLSL comments shall be absent from the built bundle and present in every source file they are in today. When a shader is compiled after the strip, then it shall produce a byte-identical render to before, verified by the golden harness rather than by inspection.

## Phase 4 - Dev surfaces that ship to production (~3hr)

Five items, **17,644 B** together. Each is reachable only behind a URL param or a dev flag, and the fix is the same for all five: gate the **import**, not the render, so Rollup can drop the chunk. A `const X = await import(...)` inside the `if` is the shape; a static import with an `if` around the JSX is not.

| item | trigger | bytes |
|---|---|---:|
| `ExtremeTuningPanel` | none, dead import in `App.js`, never rendered | 4,314 |
| PlaytestNote | `?notes=1` | 4,656 |
| wolf harness | `?wolf=1` | 4,192 |
| grassInteractionProof | `?grassInteractionProof` | 2,962 |
| ScreenshotCapture | F12, imported unconditionally on every production boot | 1,520 |

**Take `ExtremeTuningPanel` first.** It is the largest of the five and it is a dead import with no consumer, so it is a deletion rather than a gating change, and it is the only one of the five that cannot regress a working feature.

**Read the verifier's objection on PlaytestNote before starting it.** The roadmap records that half the proposed change is unimplementable as written. That objection was not preserved in a validation directory, so it has to be re-derived: work out for yourself what about `?notes=1` resists import-gating, and record the answer here. If it turns out to be genuinely unimplementable, drop it and say so rather than forcing it.

**Acceptance (EARS):** When Phase 4 ships, then a production boot with no URL params shall not download any of the five chunks. When `?notes=1`, `?wolf=1` or `?grassInteractionProof` is present, then the corresponding surface shall still work exactly as it does today. When `ExtremeTuningPanel` is removed, then `grep -rn ExtremeTuningPanel js/` shall return nothing.

## Phase 5 - Measure, and close the ratchet story (~2hr)

1. Rebuild clean and record every family against its budget, before and after the cycle. **Build in a clean tree.** Concurrent builds sharing one tree double-compress `dist/terrain/*.bin`; Cycle 117 chased that as a phantom regression and the ladder showed eight bytes per pass over five passes. `emptyOutDir` makes a single clean build correct and a concurrent one wrong.
2. Report headroom per family, not just pass or fail. The five families at zero headroom are the reason the next cycle needs this number.
3. **Do not spend the headroom.** Cycles 120, 121 and 122 are what it is for.

**Acceptance (EARS):** When Phase 5 ships, then every chunk family shall be inside its budget and `bundle-sizes.json` shall be unmodified. When the cycle closes, then the plan shall record measured before and after bytes for `main`, `other` and `three`.

## Open questions for Matt, surfaced not answered

1. **`__sdsCinema.freeFly()` and its OrbitControls chunk, 20,875 B.** Retiring `freeFly` would drop its sole consumer, the 19,739-byte OrbitControls chunk. [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) says removing the `?cinematic=1` harness is a separate decision, and `tools/validation/*.mjs` probes depend on it, including the harnesses this program has used in four consecutive cycles to look at the build. **Do not take this without asking.** It is the largest single remaining item after Phase 2 and it is the one an agent should not decide.

## Refuted, recorded so it is not re-proposed

- **Vendoring OrbitControls out of the top-level assets scan.** That is a fixture bump laundered through directory depth, not a saving, and it would add 40,525 bytes of unminified source to ship 19,739 fewer measured ones.
- **Moving the two `webgpuDiagnostic`-only placement-plan chunks out of the `other` catchall.** Overstated. That family has only 1,146 bytes of its own headroom, so the move trades one zero-headroom family for another.

## Frozen files

- **[`tests/refactor-baseline/__fixtures__/bundle-sizes.json`](../tests/refactor-baseline/__fixtures__/bundle-sizes.json)** is **NOT authorised**. No ratchet bump, in any phase, for any reason. If a phase cannot fit, the phase is wrong.
- **[`vite.config.js`](../vite.config.js)** is not fence-listed but is treated as care-required here: Phases 2 and 3 both change what the build emits, and a build-config error is invisible until it ships. Every change to it carries a named-failure guard like `d75a7546`'s.

## Hard stops

1. **No ratchet bump.** Stated three times in this plan on purpose.
2. **No decomposition of `GrassSystem.js` or `OptimizedSheep.js`.** Phase 3 changes the build output, not the module structure.
3. **No `freeFly` or OrbitControls removal** without Matt's explicit answer to the open question.
4. **No concurrent builds.** One build at a time in one tree, or the terrain payload numbers are fiction.
5. **A saving that changes rendered output is not a saving.** Phase 3 in particular must prove byte-identical renders through the golden harness.

## Success criteria (cycle close)

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's [`BACKLOG.md`](BACKLOG.md) carryover.
- [ ] When `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` run at cycle close, all four shall pass.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When the cycle closes, then `bundle-sizes.json` shall be byte-identical to its state at cycle start.
- [ ] When the cycle closes, then every chunk family shall be inside its budget.
- [x] When Phase 2 ships, then the `supercompressionScheme` of every shipped `.ktx2` shall be recorded in this plan. **All 10 are ZSTD; the decoder is retained and the phase is dropped as scoped.**
- [ ] When Phase 3 ships, then GLSL comments shall be absent from the build and present in source.
- [ ] When Phase 3 ships, then the golden harness shall show no render change attributable to the shader strip.
- [ ] When Phase 4 ships, then a production boot with no URL params shall download none of the five dev chunks.
- [ ] When Phase 4 ships, then `grep -rn "ExtremeTuningPanel" js/` shall return nothing.
- [ ] When the cycle closes, then measured before and after bytes for `main`, `other` and `three` shall be recorded here.
- [ ] When the cycle closes, then `__sdsCinema.freeFly()` shall still exist, unless Matt has answered the open question.

## References

- [`front-door-roadmap.md`](front-door-roadmap.md) - the measured work list this plan is built from
- [`../DECISIONS.md`](../DECISIONS.md) - D31 (payload before more features)
- [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - `bundle-sizes.json` and the authorisation protocol
- [`../.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) - the `?cinematic=1` decision, and the no-decompose rule for grass and sheep
