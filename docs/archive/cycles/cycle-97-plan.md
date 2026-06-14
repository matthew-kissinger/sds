# Cycle 97 — visual-queue-and-polish (paired remainder, run autonomously)

> Authored 2026-06-14 at `/cycle-start`. Re-scoped from the Cycle 96 stub after Matt's
> directive: "complete autonomously and ship - no need for human visual check - I will test
> in prod." Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then
> this doc top to bottom, then the authored shape in
> [`archive/cycles/cycle-96-plan.md`](archive/cycles/cycle-96-plan.md).

## Goal

Cycle 96 shipped the autonomous slice of the visual-queue (NSL jitter rail, rock
collider-parity harness, r185 readiness, doc sweep) and deferred the rest to a paired Phase
1 visual-review gate. This cycle removes that gate: Matt's "ship it, I test in prod"
delegates the visual sign-off to his live validation, which unblocks everything whose only
gate was the look approval. It does not hand over the genuinely-product calls (NSL as the
default world), the version/launch act (Matt's voice and hands), the upstream block (r185),
or the design direction a rock re-bake needs. So this cycle drains the autonomous-completable
remainder: re-baseline the stale golden suite to the shipped look, settle the long-parked
KTX2 go/no-go with measured numbers and a ready integration spec, and tee up the items that
remain structurally Matt's. Before: stale goldens (2026-05-16), an unanswered KTX2 question,
a paired gate blocking the queue. After: goldens match the shipped look and the diff suite is
meaningful again, KTX2 has a numbers-backed GO with a bounded integration spec, and the
paired/blocked items are clearly carried forward.

## Execution mode this cycle

Matt's directive is autonomous-and-ship with prod as the visual check. The split:

| Phase | Mode this cycle | Status |
|---|---|---|
| 1 Look-approval gate | Delegated to prod validation | Lifted. The shipped look (Cycles 92/95, live on sheepdogsim.com) is the source of truth; Matt validates in prod. |
| 2 Golden re-baseline | AUTONOMOUS | Shipped this cycle. |
| 3 KTX2 measured go/no-go + spec | AUTONOMOUS (measurement is a technical call) | Shipped this cycle. GO on merits; full integration teed up. |
| 4 three r185 | Upstream-blocked | Held. r185 not on npm (latest 0.184.0, re-verified 2026-06-14). |
| 5 Rock re-bake | Needs design direction | Held. Collider-parity harness ready from Cycle 96. |
| 6 Launch + version + NSL-as-default | PAIRED (product + Matt's voice) | Held. No version bump, no posting, no default-world flip. |

## Phase 1 — Look-approval gate (delegated to prod validation)

Matt waived the local paired visual review ("no need for human visual check - I will test in
prod"). The shipped look already on sheepdogsim.com (Cycle 92 frame-floor + trunk-split + pill
removal, Cycle 95 NSL fixes) is treated as the approved baseline; his prod validation of the
Cycle 95 A/B/C/E/D/F items is the backstop. This lifts Hard stop 1 from the Cycle 96 plan (no
golden re-capture before approval) for the purpose of this cycle.

**Acceptance (EARS):**

- [x] When the cycle runs, the look-approval gate shall be recorded as delegated to prod validation in `DECISIONS.md`, not silently skipped.
- [ ] If Matt's prod validation rejects any visual element, then the rejection becomes a fast-follow and the affected goldens are re-captured against the corrected look.

## Phase 2 — Golden visual baseline re-capture (AUTONOMOUS, shipped)

The golden suite (`tools/validation/screenshot-golden.mjs`, 12 cells: field/rolling-hills/
open-country × 2 ToD × 2 camera) was stale since 2026-05-16. A `--diff` smoke proved headless
WebGPU renders healthy frames on this box (no crash, no missing cells); the near-zero SSIM vs
the stale baselines was real obsolescence (the Cycle 91 camera/tree rework reframed the follow
shots), confirmed by inspecting the captures. Re-baselined to the current shipped look.

1. Removed the dead `konveyorRocks` codename param from the harness URL (grep confirmed no
   `js/`/`shared/` consumer since the Cycle 87 konveyor retirement; the goldens now reflect the
   default production rock path, naming-rule compliant).
2. Re-captured all 12 cells (`--baseline`).
3. Flake check: `--diff` against the fresh baselines passes (deterministic; seeded PRNG +
   fixed camera + paused sim on all-cold scenes).
4. Recorded the re-pin date + context in `tools/validation/golden/MANIFEST.md`.

NSL is deliberately **not** added to the golden matrix this cycle: its streamed foliage +
far-offset island + 14s cold load make a single-frame headless capture non-deterministic
(would bake an inconsistent baseline). Recorded as a follow-up: NSL goldens need a
streaming-aware capture (wait for `wavesDone === planned`).

**Acceptance (EARS):**

- [x] When Phase 2 ships, the golden suite shall pass on freshly captured baselines dated this cycle.
- [x] When Phase 2 ships, a `--diff` run against the fresh baselines shall pass (no flake).
- [x] If any captured frame is broken/black, then the re-baseline shall halt (gated on visual inspection of the captures; they were healthy).

## Phase 3 — KTX2 measured go/no-go + integration spec (AUTONOMOUS, shipped)

Settled the KTX2 question parked since Cycle 91 with an analytical spike
(`cycle97-validation/ktx2-census.mjs`, reads shipped `dist/` PNG dimensions, computes
download + VRAM deltas). Verdict: **GO on the merits**, integration teed up as a bounded
follow-up phase rather than blind-landed this pass.

- **Prize** (addressable set is entirely the tree impostor atlases, 12 files at 2048²; dog
  portraits + PWA icons are DOM images, not GPU textures): ~192 MB VRAM and ~10.6 MB net wire
  (after the ~0.9 MB transcoder).
- **Why not blind-land now:** greenfield transcoder pipeline (encoder toolchain + KTX2Loader
  wiring across the impostor color/normal/depth load path + mobile/desktop transcode
  targeting), concentrated on Basis's three worst cases (alpha foliage, normal maps, depth
  maps), with no measured VRAM bottleneck creating urgency. That is an unbounded render-path
  landing, which prod-testing validates poorly. Full numbers + integration spec:
  `cycle97-validation/ktx2-readiness.md`.

**Acceptance (EARS):**

- [x] When Phase 3 ships, the KTX2 go/no-go shall be answered with measured download + VRAM deltas recorded in `cycle97-validation/ktx2-readiness.md` and `DECISIONS.md`.
- [x] When Phase 3 ships, the integration spec (encoder, transcoder, load-site wiring, format choices, validation gates) shall be recorded for the greenlit follow-up.
- [ ] When the integration phase runs (greenlit), the golden suite shall pass with KTX2 live and dist size + cold-load deltas shall be recorded (ship only if dist shrinks and cold load does not regress).

## Phase 4 — three r185 adoption (HELD, upstream-blocked)

r185 is not on npm (latest `0.184.0`; `npm view "three@>=0.185.0" version` 404s, re-verified
2026-06-14). Cannot start. Checklist for when it lands: `cycle96-validation/r185-readiness.md`.
The instance-level shadow-churn fix (`js/rendering/shadowOverrideMaterialFix.js`) stays
regardless.

**Acceptance (EARS):**

- [ ] When r185 publishes, the bump shall be batteried (full vitest byte-identical sim-baselines, field rail, NSL rail, golden suite, same-window NSL control) before it ships.

## Phase 5 — Rock re-bake (HELD, needs design direction)

The collider-parity harness shipped in Cycle 96 (`tests/rock-collider-parity.spec.js`,
baseline field 334/277, rolling-hills 9/8, NSL 24/21, open-country 0). A re-bake needs a design
direction (what changes about the rocks) that is Matt's call, not derivable autonomously.
Re-baking with no intended change is a no-op. Held until a direction exists.

**Acceptance (EARS):**

- [ ] When a re-bake direction is given and the re-bake runs, the collider-parity spec shall stay green (any footprint drift = the bake does not ship).

## Phase 6 — Launch + version + NSL-as-default (HELD, paired / product)

These are not visual checks and are not delegated by "I test in prod":

- **NSL-as-default-world (Q1):** a product call about the player's first impression (Rolling
  Hills loads ~2.3s and reads instantly; NSL is a 14s cold load + survival pitch). Default
  stays Rolling Hills until Matt decides.
- **Version bump + launch posting:** explicitly paired (Matt's voice and hands; player-visible
  releases are reviewed). Code continues to deploy to prod on push; no version bump, no devlog
  or social posting this cycle.

**Acceptance (EARS):**

- [ ] When Matt runs the paired session, the NSL-as-default verdict and any version bump / launch posting shall be recorded in `DECISIONS.md` in his words.

## Frozen files

No `shared/` edits this cycle (no sim-change ritual). `DECISIONS.md` is appended (new dated
entry, the allowed pattern), not rewritten. The golden PNGs in `tools/validation/golden/` are
test ratchets re-pinned deliberately per Phase 2.

## Hard stops

Durable stops apply ([`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific:

1. **Golden re-baseline gates on visual inspection of the captures.** A broken/black frame
   must not be committed as a baseline (stale beats wrong). Verified healthy before commit.
2. **No KTX2 blind landing.** The integration is a bounded greenlit phase, not a same-pass
   prod ship.
3. **No NSL-as-default flip, no version bump, no launch posting** outside Matt's paired session.
4. **No `shared/` edits.**

## Success criteria (cycle close)

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When the cycle closes, the re-baselined golden suite shall pass `--diff` and the KTX2 verdict shall be recorded.

## References

- [`docs/archive/cycles/cycle-96-plan.md`](archive/cycles/cycle-96-plan.md) — the authored visual-queue plan
- `cycle97-validation/ktx2-readiness.md`, `cycle97-validation/ktx2-census.mjs` — KTX2 spike (local)
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
