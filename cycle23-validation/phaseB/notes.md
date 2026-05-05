# Phase B — stamina sprint-exit fix

## Root cause

Cycle 8 simplification removed the release-shift lock-out. v1.3.0 playtest found
that auto-resume produced a 0.83s stutter cycle (0.33s sprint at 30/sec drain
from 10→0, then 0.5s walk regen 0→10) that visually reads as continuous sprint
even though `isSprinting` flickers off briefly. Cycle 8's "drop to walk + bar
pulses red" cue did not register at gameplay pace.

## Fix

Re-add the release-shift lock-out as a third gate, on top of the existing
`canStartSprint` / `canContinueSprint` two-gate split (Cycle 7 settled
decision preserved):

- `_sprintLockOut` latches `true` when stamina depletes mid-sprint.
- While the lock is set, `canStartSprint` short-circuits to `false` even if
  stamina has recovered above `minStaminaToSprint` (10).
- The lock clears the moment `wantsSprint` is `false` (Shift released).
- `canContinueSprint` is unchanged — once sprinting, stamina > 0 keeps you
  going until the depletion cliff.

Result: holding Shift past depletion → drop to walk and STAY there. Player
must release Shift to recharge, then press again to sprint. Cycle 8's
"perceptible cliff" goal achieved without the stutter loophole.

## Test coverage

New [tests/stamina-sprint-exit.spec.js](../../tests/stamina-sprint-exit.spec.js) — 9 specs:

- engages on wantsSprint + moving + canStart
- skips engagement when not moving
- exits + locks on mid-sprint depletion
- stays exited on held Shift even with stamina recovered (the bug)
- clears lock on Shift release
- re-engages after release-then-press once stamina sufficient
- does NOT re-engage at boundary `stamina === minStaminaToSprint - 1` (gates separated)
- continues sprint mid-drain when stamina ∈ (0, minStaminaToSprint)
- regenerates faster idle than moving

## Validation

- vitest: 188 pass + 7 skipped (was 179; +9 new specs in stamina-sprint-exit).
- Sim-baseline byte-identical: worker-side stamina trace fixture
  `tests/sim-baseline/__fixtures__/stamina-curve-60hz.json` is computed
  via `shared/MovementPhysics.js` `updateStamina`, NOT `Sheepdog.updateStamina`.
  Client/worker stamina codepaths are intentionally separate.
- build: 829.06 kB main / cumulative delta since cycle-23-base +3.44 KB.

## Files touched

- [js/Sheepdog.js](../../js/Sheepdog.js) — `_sprintLockOut` field + `updateStamina`
- [tests/stamina-sprint-exit.spec.js](../../tests/stamina-sprint-exit.spec.js) — new
