# Konveyor Campaign Archive

The Konveyor campaign was the branch-level effort to move SDS from a WebGL-only
build to progressive WebGPU with a path toward native packaging. It ran from
roughly Cycle 30 through PR
[#52](https://github.com/matthew-kissinger/sds/pull/52), which merged the
progressive WebGPU packet to `main` on 2026-05-16. Post-merge work continues
under the normal cycle methodology (Cycle 38 and successors).

This index points at the campaign-era docs. Active work reads
[`../NEXT_SESSION.md`](../../NEXT_SESSION.md) and the active cycle plan in
[`../`](../) instead.

## Documents in this archive

- [`konveyor/sds.md`](konveyor/sds.md) — campaign doctrine. Mission, scope,
  destination (WebGPU-first rendering with native packaging optionality),
  non-negotiables. Useful for orientation on why the WebGPU work happened the
  way it did.
- [`konveyor/autonomous-run.md`](konveyor/autonomous-run.md) — operating brief
  used during the autonomous WebGPU/native work. Records the material-island
  approach, the proof packet shape, and the hard stops applied during the
  campaign. The `/goal` block at the bottom is now superseded by the
  Autonomous Completion Brief in the active cycle plan.
- [`konveyor/completion-audit-2026-05-16.md`](konveyor/completion-audit-2026-05-16.md) —
  one-shot audit captured 2026-05-16 confirming the campaign was ready to
  merge. Used to justify squash-merging PR #52.
- [`konveyor/visual-polish-qa-2026-05-16.md`](konveyor/visual-polish-qa-2026-05-16.md) —
  local Chrome review notes from the WebGPU visual-polish pass. Records what
  Matt saw that triggered the first-principles visual repair work later
  archived under [`research/cycle-38-webgpu-visual-first-principles-spike-2026-05-16.md`](research/cycle-38-webgpu-visual-first-principles-spike-2026-05-16.md).
- [`konveyor/release-decision-checklist.md`](konveyor/release-decision-checklist.md) —
  pre-merge / deploy gate / post-deploy checklist used for the `2.1.x`
  packets. The deploy gate and post-deploy iOS Safari water canary remain
  active gates; they are referenced inline by the current cycle plan and by
  `NEXT_SESSION.md`.

## Active references that still point here

The post-deploy iOS water canary and renderer telemetry readout in
[`konveyor/release-decision-checklist.md`](konveyor/release-decision-checklist.md)
are the only fragments still cited by active cycle work. When the active cycle
plan needs them, it links here directly; do not duplicate.

## When to read this archive

Read when researching the WebGPU migration arc, debugging a regression that
the campaign introduced, or planning a successor campaign (mobile readiness,
native shell, store submission). Otherwise prefer the active cycle plan plus
`NEXT_SESSION.md`.
