# Next Session - Cycle 100 (terrain-compression)

> **Updated:** 2026-06-14
> **For:** Cycle 100 (`docs/cycle-100-plan.md`)
> **Pickup priority:** Measure the deployed terrain `.bin` wire cost FIRST (Cloudflare may already br/gzip it), then pick lossless-vs-lossy at `/cycle-start`. Lossless (content-encoding / exact packed) keeps every baseline pinned; lossy int16 quantize only if the wire measurement proves lossless is not enough, and only as a recorded sim/refactor-baseline regeneration.

## First action: measure before quantizing

Cycle 100 targets the ~16 MB of baked terrain heightfields (`public/terrain/<scene>.bin`, 4 MB float32 x 4 scenes), the biggest remaining per-scene-load asset. Before any code, measure what the CDN actually serves (`curl -sI -H 'Accept-Encoding: br,gzip' https://sheepdogsim.com/terrain/rolling-hills.bin` and check `content-encoding` + transfer size). If it is already ~4 MB compressed, int16 quantization buys little and is not worth the determinism risk - pivot to the impostor bake re-pass instead. The cycle-100 plan's Q1/Q2 frame this.

The hard constraint: terrain `.bin` feeds `shared/terrain/Heightfield.js` (fence-frozen, deterministic-sim core + the heightfield single source of truth). Any value change moves every grounded entity AND can desync MP / drift the sim-baseline. Lossless = no baseline moves; lossy = a deliberate, recorded baseline regeneration. See `docs/cycle-100-plan.md` "How to read this plan".

## Cold-Start Orientation

Read in order: this file -> [`docs/cycle-100-plan.md`](docs/cycle-100-plan.md) -> `.claude/rules/shared-sim.md` (sim-baseline discipline) + `.claude/rules/scene-and-render.md` (heightfield SSOT) -> `DECISIONS.md` "Cycle 98" (asset-weighting analysis) -> [`docs/BACKLOG.md`](docs/BACKLOG.md) (Cycle 99 entry at the top) -> `git log --oneline -6`.

## Where it stands

**Cycle 99 (`asset-diet`) closed + shipped + deployed.** KTX2 Phase 5: the impostor PNGs are dropped from dist (KTX2 is the only impostor ship), realizing the dist/CDN win - **dist 54 -> 46 MB**. Parity proven by a seeded KTX2-vs-PNG A/B at **SSIM 0.99029** (`tools/ktx2-impostor-probe.mjs`), not the golden harness (which turned out stale, carried below). Feature slice `e0989956`, deploy `27512380746` green; 1543 vitest / lint / build green; no version bump (still 2.3.4).

**Cycle 100 (`terrain-compression`) is scaffolded.** Goal stub + the lossless-vs-lossy decision framing + the determinism constraints are in `docs/cycle-100-plan.md`. Fill the Goal + Phases at `/cycle-start` after the wire measurement.

## Standing carryover (do not drop)

- **Golden harness staleness (test-infra, NEW).** `tools/validation/golden/` no longer reproduces against the current capture environment: 7/12 cells below 0.95 but run-to-run stable (a consistent delta from the Cycle 97 goldens), including LOD0-tree deltas that have nothing to do with the impostor atlas. Not KTX2-related. Either re-baseline (`--baseline`) under the canonical environment or gate the capture on a deterministic scene-settled signal. Surfaced in Cycle 99 Phase 1.
- **Impostor bake re-pass (paired)** - atlas resolution, normal-vs-depth necessity, the unbenchmarked Pixel Forge Kiln tool. The asset-diet alternative if terrain compression measures as not-worth-it.
- **Paired launch session** - NSL-as-default-world (still Rolling Hills), version bump, itch/devlog/social posting (Matt's voice), S24+ device pass. The unstarted other half of "launch-and-ktx2".
- **three r185** blocked until it publishes (latest 0.184.0); checklist `cycle96-validation/r185-readiness.md`.
- **Rock re-bake** behind the Cycle 96 collider-parity harness; needs a design direction.
- **Matt's Cycle 95 prod validation** (A/B/C/E/D/F) - if prod shows a rejected element, re-capture the affected goldens.
- **Survival onboarding translation** (es/ja/pt/zh-CN) once the English copy locks.
- **NPC-sheepdogs** owner intake - needs an approach proposal before dispatch.
