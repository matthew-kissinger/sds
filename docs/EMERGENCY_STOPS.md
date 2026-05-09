# Emergency stops

> Drafted Cycle 28 Stream C4. Durable list of stop-and-surface conditions that apply on **every** cycle. Cycle-specific hard stops live in the active cycle plan's `## Hard stops` section. If you hit one of these, **stop the change, surface to the user, wait for explicit OK** before proceeding.

## Why this list exists

Some failures are not "fix and continue" problems. They are "stop the agent, get the human's attention, decide together" problems. The cost of pushing through one of these is hours-to-days of cleanup; the cost of pausing is one user round-trip.

Emergency stops are written as **EARS unwanted-event** lines: `If [unwanted condition], then the agent shall [stop / surface / wait].`

## Durable stops

### Sim-baseline drift

**If a `tests/sim-baseline/*.json` fixture differs from what the harness produces today, then the agent shall stop, read the diff, and surface to the user before regenerating the fixture.**

The fixtures encode 60Hz traces of the deterministic sim. A drift means either:

1. The change was intentional → record the decision in the active cycle plan's Acceptance section, then regenerate.
2. The change was accidental → fix the sim change first.

Don't regenerate as a shortcut to make tests pass. The MP-desync class of bugs (Worker and client diverge mid-game) only surfaces here.

### Refactor-baseline drift

**If a `tests/refactor-baseline/*.json` fixture differs (terrain-mesh-hash, scatter-positions, bundle-sizes), then the agent shall stop and surface before regenerating.**

Same posture as sim-baseline. Refactor-baseline fixtures lock in characterization-test output for code paths the sim-baseline doesn't cover (visible mesh, scatter positions, bundle byte size). Drift = behavior change, intentional or otherwise.

### Frozen-file change without authorization

**If a phase wants to modify a file listed in [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) (or in the active cycle plan's `## Frozen files` section), and that file is NOT explicitly authorized by the active phase's scope, then the agent shall stop and surface.**

The fence exists because these files are multi-consumer schemas, one-way ratchets, deterministic-sim cores, or process docs. Pushing a change through hoping it gets reverted in review is unsafe.

### Visual regression on a previously-passing scene

**If a playwright e2e visual golden fails SSIM tolerance on a scene that passed before this change, then the agent shall stop and surface before adding new scope.**

Fix or revert. Don't layer new work on top.

### Bundle-size regression

**If `npm run build`'s `main-*.js` chunk is larger than the recorded baseline (currently `tests/refactor-baseline/__fixtures__/bundle-sizes.json`), then the agent shall stop and surface.**

Bundle bloat compounds across cycles. A 30 KB regression that "isn't a big deal this cycle" stacks with the next two cycles' regressions until it's a 100 KB regression nobody can justify. Surface the bytes early.

### Multiplayer desync

**If the deterministic sim produces different output between Worker and client builds for the same input, then the agent shall stop, mark the cycle as MP-broken, and surface immediately.**

This is the "production is on fire" case. MP desyncs only surface several seconds after divergence and only at scale, so the offline harness must catch them. Re-run sim-baseline; if Worker and client builds disagree, the sim core has drifted.

### CI deploy red

**If the last deploy on `main` is in a `failure` state at cycle close, then `/cycle-close` shall not proceed; the agent shall fix the failing deploy first.**

Closing a cycle on a red main hides the actual close commit's outcome behind a stale failure. Fix forward, then close.

### Test failure mid-refactor

**If a refactor commit makes a test fail that was previously green, the agent shall stop and surface before adding new commits to the refactor branch.**

Test failures during a refactor mean either the refactor changed behavior (revert / reduce scope) or the test was wrong (separate, deliberate decision). Don't paper over with adjusted test expectations in the same commit.

## Cycle-specific stops

These live in the active cycle plan's `## Hard stops` section, NOT here. Examples (kept for shape; do not treat as durable):

- "Phase A beacon shows zero pageviews after 1hr → pull the hook." (Cycle 26-specific)
- "Sim-baseline goldens drift in Stream B (one float ULP) → revert and re-think." (Cycle 28-specific paraphrase of the durable rule)

When you read a cycle plan's `## Hard stops`, mentally union it with this file. Both apply.

## What an emergency stop looks like in practice

1. **Stop the change.** Don't add the next commit; don't try to silence the symptom.
2. **Capture context.** Which condition fired (which line of this file)? What does the diff look like? What's the most likely explanation?
3. **Surface to the user.** One paragraph: "I hit emergency stop X. Here's the diff. Here's my best guess at the cause. Should I (a) revert the last N commits, (b) regenerate the fixture and record the decision, or (c) something else?"
4. **Wait.** Do not proceed without explicit OK.

The right answer is sometimes "yes, regenerate the fixture, the change is intentional, I forgot to flag it." That answer is cheap to give. The cost of skipping the surface step is what we're guarding against.

## How to add a durable stop

A durable stop earns its place by recurring across cycles. If a cycle-specific stop fires twice (in two different cycles), promote it here. Drafting checklist:

1. Write the rule as an EARS unwanted-event line (`If X, then agent shall Y`).
2. Add a short explanation paragraph — *why* the stop matters, not *what* it does.
3. Reference the underlying primitive (sim-baseline file, fence list, etc.) so future readers can find it.
4. Update the active cycle plan's `## References` section to point here if it doesn't already.

Don't pad the list. Each entry should be a load-bearing rule that has cost the project hours when it was missing.
