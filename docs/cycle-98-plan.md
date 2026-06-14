# Cycle 98 — launch-and-ktx2

> Drafted 2026-06-14 after Cycle 97 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **Scaffold stub.** The visual-queue (Cycles 96-97) is drained to its product, paired, and upstream-blocked remainder. This cycle is where those land. Fill the Goal + Phases at `/cycle-start`.

## Goal

(Fill at `/cycle-start`.) The candidates, from the Cycle 97 carryover:

- **KTX2 texture pipeline (greenlit follow-up).** Cycle 97 measured this as GO on the merits (~192 MB VRAM, ~10.6 MB net wire on the tree impostor atlases) and wrote the integration spec. The spec is in `cycle97-validation/ktx2-readiness.md` (local): UASTC-only encoder pass on `bake-tree-impostors`, KTX2Loader + vendored basis transcoder, per-texture format choice, gated on the golden suite + cold-load delta + the NSL jitter rail. Bounded, prod-testable.
- **Paired product + launch session (Matt's hands).** NSL-as-default-world (Q1, still Rolling Hills), the version bump, and the launch posting (itch + devlog + social, Matt's voice). The S24+ device pass folds in here.
- **three r185** when it publishes (latest 0.184.0 as of 2026-06-14); checklist `cycle96-validation/r185-readiness.md`.
- **Rock re-bake** if Matt gives a design direction (the Cycle 96 collider-parity harness gates it).

Alternatively, an entirely new theme: the **NPC sheepdogs** owner-intake candidate (needs an approach proposal before dispatch; `docs/BACKLOG.md` Distant ideas).

## How to read this plan

Re-author this stub at `/cycle-start`: pick the cycle's coherent goal from the candidates above, copy the relevant phase bodies + EARS acceptance (the KTX2 spec is ready in `cycle97-validation/ktx2-readiness.md`), and keep the cycle to ≤ 8 phases.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.

## References

- `cycle97-validation/ktx2-readiness.md` — the KTX2 integration spec (local)
- [`docs/archive/cycles/cycle-96-plan.md`](archive/cycles/cycle-96-plan.md) — the authored visual-queue plan
- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
