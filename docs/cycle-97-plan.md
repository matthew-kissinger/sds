# Cycle 97 — visual-queue-and-polish (paired remainder)

> Drafted 2026-06-14 after Cycle 96 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **Scaffold stub.** Cycle 96 shipped the autonomous slice of the visual-queue-and-polish plan (NSL jitter rail, rock collider-parity harness, three r185 readiness, doc sweep). This cycle is the PAIRED remainder, which needs Matt's hands: the Phase 1 visual review + decision gate, then the phases it unblocks. The authored shape lives in the archived [`cycle-96-plan.md`](archive/cycles/cycle-96-plan.md) (Phases 1, 2, 5, 6, 8) plus the deferred r185 bump (Phase 3) once it publishes.

## Goal

(Fill at `/cycle-start`.) Drain the paired remainder of the visual-queue: run one paired visual-review session to record the gating decisions (look approval, NSL-as-default, rock/KTX2, trailer, P8 lighting), then land what they unlock - golden re-capture, rock re-bake (behind the collider-parity harness shipped in Cycle 96), KTX2, and the launch + device pass. Adopt three r185 when it publishes.

## Candidate phases (carried from the archived cycle-96 plan)

1. **Phase 1 PAIRED** - visual review + decision gate. Folds in Matt's Cycle 95 prod validation. Prep pack: `cycle96-validation/phase1-prep.md` (local).
2. **Phase 2** - golden re-capture (gated on Phase 1 approval; Hard stop: no re-capture before the look is approved in `DECISIONS.md`).
3. **Phase 3** - three r185 (blocked until published, then after fresh goldens). Checklist: `cycle96-validation/r185-readiness.md`.
4. **Phase 5** - rock re-bake. The collider-parity spec `tests/rock-collider-parity.spec.js` must stay green (any footprint drift = the bake does not ship).
5. **Phase 6** - KTX2 (after goldens).
6. **Phase 8 PAIRED** - launch + S24+ device pass; the version bump is decided here.

## How to read this plan

At `/cycle-start`, re-author this stub into a full plan: copy the relevant phase bodies + EARS acceptance from the archived `cycle-96-plan.md`, drop the already-shipped autonomous slice (Phase 4 rail, the Phase 5 harness, the Phase 7 doc sweep), and renumber. Keep the cycle to <= 8 phases.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When Cycle 97 closes, the golden suite shall be green on baselines approved this cycle.

## References

- [`docs/archive/cycles/cycle-96-plan.md`](archive/cycles/cycle-96-plan.md) — the authored visual-queue plan; phases 1/2/3/5/6/8 carry forward.
- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
