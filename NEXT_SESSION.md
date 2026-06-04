# Next Session - Post-Cycle-55 intake

> **Updated:** 2026-06-04
> **For:** Post-Cycle-55 pickup. No active numbered cycle is open.
> **Pickup priority:** Confirm the Cycle 56 focus (steam store-prep, entity-collision, or a grass visual finish), author [`docs/cycle-56-plan.md`](docs/cycle-56-plan.md) from the template, then `/cycle-start`.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-56-plan.md`](docs/cycle-56-plan.md) (scaffolded stub) -> the chosen focus's source docs.

## Where It Stands

**Cycle 55 `grass-interaction-tuning` closed 2026-06-04.** Plan archived at [`docs/archive/cycles/cycle-55-plan.md`](docs/archive/cycles/cycle-55-plan.md); full closeout in [`docs/BACKLOG.md`](docs/BACKLOG.md). Render-only cycle. It narrowed the too-wide grass-parting footprint around the dog and sheep (dog swath ~4.0m -> ~2.3m, sheep ~2.8m -> ~1.6m) and borrowed the tight push-curve feel (squared falloff + flatten) from the starred reference repo [boona13/threejs-grass-water-shaders](https://github.com/boona13/threejs-grass-water-shaders).

- The parting footprint now lives in one place: `GrassSystem.config.interaction` (dog/sheep `{halfLen, halfWid, falloff}`, `pushFalloffPower`, `flattenAmount`). The inline WebGL shaders and the WebGPU node material both read it; the two `.glsl` files are marked NON-LIVE BACKUP.
- No `shared/` change, no SceneDef change, no Worker change, no sim-baseline regeneration.
- `npm test` 869 pass / 0 fail, `npm run build` clean. The `bundle-sizes.json` `mainKB` ratchet was reconciled 542 -> 546 (stale fixture from prior-cycle native/license work; Cycle 55 adds 0 bytes to `main.js`, proven by an identical HEAD-vs-change build).

**Open from Cycle 55 (carryover):**

- **Grass visual taste-match** across WebGL desktop, WebGL mobile, and WebGPU is Matt's in-browser review. The autonomous close could not composite WebGPU headless to taste-tune. Dial `GrassSystem.config.interaction.*` if the swath wants tightening or loosening; the values are one edit, one place.
- **Physical dog-to-sheep / sheep-to-sheep collision** (the "make collision mesh?" idea) is teed up as a candidate `entity-collision` cycle. It is a deterministic `shared/` change with sim-baseline + multiplayer cost; scope it as its own cycle.

## Recommended Next Cycle

Pick one (see [`docs/cycle-56-plan.md`](docs/cycle-56-plan.md) for detail):

1. **`steam-desktop-store-prep-1`** - queued since Cycle 54; turn the green desktop distributor proof into a Steam-ready release-candidate lane (signing, install/uninstall QA, depot dry-run, store metadata, capsule/screenshots, controller/cloud-save policy). Source docs: [`docs/archive/cycles/cycle-54-plan.md`](docs/archive/cycles/cycle-54-plan.md), [`docs/native-store-steam-readiness-checklist.md`](docs/native-store-steam-readiness-checklist.md).
2. **`entity-collision`** - hard-body dog/sheep collision in `shared/`, with the full migration story + sim-baseline regen + acceptance.
3. **Grass visual finish** - a short follow-up if Matt's review wants the Cycle 55 footprint retuned.

## Working Contract

- Do not touch `shared/` or sim-baseline goldens unless the new cycle plan explicitly authorizes it (candidate 2 would).
- Do not reopen Worker auth from the stale Cycle 53 security stub; [`docs/audit-roadmap-2026-05.md`](docs/audit-roadmap-2026-05.md) records P-SEC-1 through P-SEC-5 as shipped 2026-06-01.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | None open; next recommended in [`docs/cycle-56-plan.md`](docs/cycle-56-plan.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-55-plan.md`](docs/archive/cycles/cycle-55-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Grass discipline | [`.claude/rules/scene-and-render.md`](.claude/rules/scene-and-render.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
