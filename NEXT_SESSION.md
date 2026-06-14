# Next Session - Cycle 99 (asset-diet)

> **Updated:** 2026-06-14
> **For:** Cycle 99 (`docs/cycle-99-plan.md`)
> **Pickup priority:** FIRST validate the KTX2 impostors in prod (Cycle 98 shipped them unvalidated per "I test in prod"); then pick the asset-diet goal at `/cycle-start` (KTX2 P5 win-realization, terrain `.bin` compression, impostor bake re-pass).

## First action: validate the KTX2 deploy in prod

Cycle 98 shipped + deployed the KTX2 impostor pipeline UNVALIDATED (slice `2cd9690a`; the Phase 5 A/B was GPU-contended and deferred). Load sheepdogsim.com on a KTX2-capable browser and check the tree impostors (distant trees): orientation right (not flipped/upside-down), no obvious transcode artifacts on the canopy. The `.png` fallback covers non-KTX2 browsers. **If the impostors look wrong: `git revert 2cd9690a` (the feature slice is a clean standalone commit) and redeploy.** If they look right, KTX2 Phase 5 (drop the PNGs from dist to realize the dist-shrink/VRAM win) is safe to do in this cycle.

## Cold-Start Orientation

Read in order: this file -> [`docs/cycle-99-plan.md`](docs/cycle-99-plan.md) -> `DECISIONS.md` "Cycle 98" (KTX2 record + asset-weighting analysis) -> [`docs/BACKLOG.md`](docs/BACKLOG.md) (Cycle 98 entry at the top) -> `git log --oneline -6`.

## Where it stands

**Cycle 98 (`launch-and-ktx2`) closed + shipped.** KTX2 impostor pipeline P1-4 (encode -> lazy loader -> load-site swap -> offline gates) + the dead octahedral set dropped from dist (63 -> 54 MB). Slice `2cd9690a` + the close commit; 1543 vitest / lint / build green; no version bump. The dist-shrink/VRAM win is NOT yet realized - both `.png` and `.ktx2` ship until Phase 5 drops the PNGs.

**Cycle 99 (`asset-diet`) is scaffolded.** Goal candidates (fill at `/cycle-start`):

1. **KTX2 Phase 5** - dusk-canopy A/B (orientation + depth/normal quality) then drop impostor PNGs from dist (realizes the win). Bounded.
2. **Terrain `.bin` compression** - 16 MB uncompressed float32 (4 MB x 4 scenes), per-scene-load. int16 quantize / packed format; respect `shared/terrain/Heightfield.js` + the sim-baseline terrain hashes.
3. **Impostor bake re-pass (paired)** - atlas resolution, normal-vs-depth necessity, the unbenchmarked Kiln tool. Matt's taste + a paired track.

## Standing carryover (do not drop)

- **Paired launch session** - NSL-as-default-world (still Rolling Hills), version bump, itch/devlog/social posting (Matt's voice), S24+ device pass. The unstarted other half of "launch-and-ktx2".
- **three r185** blocked until it publishes (latest 0.184.0); checklist `cycle96-validation/r185-readiness.md`.
- **Rock re-bake** behind the Cycle 96 collider-parity harness; needs a design direction.
- **Matt's Cycle 95 prod validation** (A/B/C/E/D/F) - if prod shows a rejected element, re-capture the affected goldens.
- **Survival onboarding translation** (es/ja/pt/zh-CN) once the English copy locks.
- **NPC-sheepdogs** owner intake - needs an approach proposal before dispatch.
