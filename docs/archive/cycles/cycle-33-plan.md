# Cycle 33 — operational-hardening

> Drafted 2026-05-10 after Cycle 32 (`apple-platform-validation`) closed at v2.1.4. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Sweep the operational backlog before the next architecture lift. Cycle 32 left four ops carryovers: deprecated GHA actions (Node 20 cutoff 2026-06-02), an iOS-water workflow that has only been validated against a public URL, two open Dependabot alerts that keep failing their auto-fix runs, and a long-standing reconciliation-hook bug that misreads cycle plans. Cycle 33 closes all four, then produces a design doc for MP island scenes so Cycle 34 can start on architecture instead of design. No player-visible delta. No version bump. No frozen-sim or wire-format change.

## How to read this plan

Each phase is fully autonomous (no Matt-pickup dependencies). Phases 1–4 are operational fixes with mechanical acceptance lines. Phase 5 is a design doc that primes Cycle 34's MP work; it does not implement anything.

Where the plan suggests a specific technique, treat it as a starting point for current best practice. The autonomous mandate is "ship the cycle"; the cycle plan is the contract for what "shipped" means.

## Open questions to resolve before writing code

None block this cycle. Phase 5 produces the design doc that will surface MP-island-scene open questions for Cycle 34.

## Architecture / shared changes

None. No frozen-sim, no wire format, no schema change.

## Phase shape rules

A cycle has ≤ 8 phases. This cycle has 5. Each phase is fully autonomous.

## Acceptance criteria — EARS format

Every phase below uses [EARS notation](https://kiro.dev/docs/specs/) — `When [trigger], the [system] shall [response]` / `While [precondition], the [system] shall [response]` / `If [unwanted], then the [system] shall [response]`. Each line is grep-testable.

## Phase 1 — GHA Node 20 deprecation bump (~30min)

**Independently testable.** GitHub annotated deploy run `25619016791` that `actions/checkout@v4`, `actions/setup-node@v4`, and `actions/upload-artifact@v4` (Node 20 runtime) are deprecated and default to Node 24 on 2026-06-02. The newer `browserstack-ios-water.yml` already uses `@v5` versions; bring the others in line so we are not surprised by a forced upgrade mid-cycle.

1. **Bump `deploy.yml`.** Change every `actions/checkout@v4` → `@v5`, `actions/setup-node@v4` → `@v5`, `actions/upload-artifact@v4` → `@v5` in [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml). Five `setup-node` blocks and five `checkout` blocks; one `upload-artifact` block in `e2e`, one in `perf-baseline-capture`, one in `perf-check`.
2. **Bump `macos-safari.yml`.** Same three replacements in [`.github/workflows/macos-safari.yml`](../.github/workflows/macos-safari.yml).
3. **Sanity-check Node version.** All workflows pin `node-version: 22` already; `setup-node@v5` continues to honour that. Leave the version pin alone.
4. **Verify the bump works** by pushing the cycle branch and confirming the next `Deploy` run completes without action-version warnings.

**Acceptance (EARS):**

- When Phase 1 ships, then `grep -E '@v4' .github/workflows/deploy.yml` shall return zero matches.
- When Phase 1 ships, then `grep -E '@v4' .github/workflows/macos-safari.yml` shall return zero matches.
- When Phase 1 lands on `main`, the next `Deploy` workflow run shall complete `success` without Node 20 deprecation annotations.

## Phase 2 — BrowserStack workflow self-sufficiency on Linux (~1hr)

**Depends on:** Phase 1 (so the workflow run is on `@v5`).

The current [`.github/workflows/browserstack-ios-water.yml`](../.github/workflows/browserstack-ios-water.yml) only runs `npm ci && npm run test:ios-water`. With `IOS_WATER_BASE_URL` empty, the runner inside `tools/browserstack/run-ios-water.mjs` defaults to `http://localhost:3000` and forces `BROWSERSTACK_LOCAL=true`, but no server is actually started. So today the workflow silently only works against a public URL. Cycle 32 noted "prove the local tunnel through the GitHub workflow / Linux runner" as the gate before paying for BrowserStack — that proof requires the workflow to actually start a server.

The water canary does not need the worker (no D1, no DO). [`macos-safari.yml`](../.github/workflows/macos-safari.yml) already proves the pattern: `npm run build` then `npx http-server dist -p 3000 -s &`.

1. **Add a build + static-serve step** to [`.github/workflows/browserstack-ios-water.yml`](../.github/workflows/browserstack-ios-water.yml) that runs only when `inputs.base_url` is empty: `npm run build`, then `npx --yes http-server dist -p 3000 -s &`, then a 30-iteration `curl` poll against `http://localhost:3000/`.
2. **Document the two modes** in a comment at the top of the workflow: public URL (release smoke) vs. local tunnel (pre-release verification of unmerged changes).
3. **Add a workflow-summary echo** so dispatch runs show whether they used the public URL or the local tunnel.
4. **Manual dispatch test against `https://sheepdogsim.com`** to confirm the existing public-URL path still works after the workflow changes.
5. **Manual dispatch test against the local tunnel** (no `base_url` input) to confirm BrowserStack Local works on the Ubuntu runner. Capture the run URL in the cycle close.

**Acceptance (EARS):**

- When Phase 2 ships, then `grep -E 'http-server dist' .github/workflows/browserstack-ios-water.yml` shall return ≥ 1 match.
- When Phase 2 ships, then `grep -E 'inputs.base_url == .{0,3}\b' .github/workflows/browserstack-ios-water.yml` shall return ≥ 1 match (the gating expression on the build step).
- When the public-URL workflow_dispatch runs after Phase 2 ships, the BrowserStack iOS Water run shall complete `success` against `https://sheepdogsim.com`.
- When the local-tunnel workflow_dispatch runs after Phase 2 ships, the BrowserStack iOS Water run shall complete `success` against the dev server with `nearFoamWhite: false` in the sample report.

## Phase 3 — Dependabot/security hygiene (~1hr)

**Independently testable.** Two open Dependabot alerts on `main`:

- **#21** — `@tootallnate/once@2.0.1` (low). Fix in 3.0.1. Transitive: `browserstack-node-sdk → @google-cloud/compute → google-gax → retry-request → teeny-request → http-proxy-agent@5 → @tootallnate/once@2.0.1`.
- **#20** — `aws-sdk@2.1693.0` (low). No patched v2 version exists; advisory recommends migrating callers to v3 region validation. Transitive: `browserstack-node-sdk → aws-sdk@2`. We do not import aws-sdk anywhere; it ships only with the BrowserStack SDK at test time.

Two `Dependabot Updates` workflow runs (e.g. `25619018736`) have failed trying to auto-bump `@tootallnate/once` because the dep tree pins a version range below 3.x.

1. **Add npm overrides** to [`package.json`](../package.json) `"overrides": { "@tootallnate/once": "^3.0.0" }`. The 3.x release is API-compatible with 2.x for `http-proxy-agent`'s usage (single CommonJS function).
2. **Run `npm install`** to update [`package-lock.json`](../package-lock.json); confirm no new vulnerabilities and `npm ls @tootallnate/once` shows only `@tootallnate/once@3.x`.
3. **Re-run `npm test`, `npm run build`, and `npm run test:e2e -- --project=chromium --grep-invert @local-only`** — the override only affects a transitive of a test-only SDK, so production behaviour is unchanged. Confirm.
4. **Document the aws-sdk v2 acceptance** in [`docs/security-acceptance.md`](security-acceptance.md) (new file). Frame: alert #20 is a transitive of `browserstack-node-sdk`; we do not import aws-sdk; the advisory is a region-string validation issue that does not apply to our usage; severity low; no patched v2 exists; the only fix path is the upstream BrowserStack SDK migrating to aws-sdk v3 (out of our hands). Re-evaluate at every BrowserStack SDK upgrade.
5. **Dismiss alert #20 on GitHub** with reason "tolerable risk" and link the doc.

**Acceptance (EARS):**

- When Phase 3 ships, then `node -e "process.exit(require('./package.json').overrides?.['@tootallnate/once'] ? 0 : 1)"` shall exit 0.
- When Phase 3 ships, then `npm ls @tootallnate/once 2>&1 | grep -E '@tootallnate/once@2'` shall return zero matches.
- When Phase 3 ships, then `npm test` shall pass.
- When Phase 3 ships, then [`docs/security-acceptance.md`](security-acceptance.md) shall exist.
- When Phase 3 ships, then GitHub Dependabot alert #20 shall be dismissed with the linked rationale.
- When Phase 3 ships, then GitHub Dependabot alert #21 shall be auto-resolved (or the next Dependabot Updates run shall complete `success`).

## Phase 4 — cycle-close-reconcile hook regex collision fix (~30min)

**Independently testable.** [`.claude/hooks/cycle-close-reconcile.mjs`](../.claude/hooks/cycle-close-reconcile.mjs)'s `extractAcceptanceLines` matches the first `## (Success|Acceptance) criteria` heading. Cycle plans contain two such headings — `## Acceptance criteria — EARS format` (a generic explanation copied from [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md), no checkboxes) appears before `## Success criteria (cycle close)` (the actual checkboxes). The hook reads the explanation section, finds zero `- [ ]` items, and silently no-ops. NEXT_SESSION carryover #6 has tracked this as fence-touched, but the cleaner fix is in the hook, not the template.

**Frozen file consideration.** `.claude/hooks/*.mjs` is not on [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md). [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) is on the fence. The hook fix removes the need for any template change; do not touch the template this phase.

1. **Replace the `search()` + slice approach** in `extractAcceptanceLines` with `matchAll()` over `^##+\s+(?:Success|Acceptance) criteria.*$`. For each candidate section, slice to the next `\n## ` heading and count `- [ ]` items. Pick the first section that has ≥ 1 item.
2. **Preserve current behaviour** when a plan has only one matching section (Cycle 27 etc.). The fix should be additive.
3. **Smoke-check against archived plans** — run the hook against [`docs/archive/cycles/cycle-31-plan.md`](archive/cycles/cycle-31-plan.md) and [`docs/archive/cycles/cycle-32-plan.md`](archive/cycles/cycle-32-plan.md) and confirm both surface their actual Success criteria (cycle close) checklist items, not zero items.

**Acceptance (EARS):**

- When Phase 4 ships, then `grep -c 'matchAll' .claude/hooks/cycle-close-reconcile.mjs` shall return ≥ 1.
- When Phase 4 ships, then running `node .claude/hooks/cycle-close-reconcile.mjs` against a plan that has both `## Acceptance criteria — EARS format` and `## Success criteria (cycle close)` shall report N ≥ 1 acceptance items, not zero.
- If [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) is modified during Phase 4, then the agent shall stop and surface (frozen file).

## Phase 5 — MP island scenes design doc (~2hr)

**Depends on:** nothing in this cycle (can be drafted in parallel with Phases 1–4 once the cycle plan exists).

Cycle 34's leading candidate is "MP island scenes" — Rolling Hills and Open Country playable in multiplayer rooms. Today the worker DO only knows Home Field's flat fenced pasture: no per-island heightfield replay, no Open Country multi-stage objective state, no scene-def MP gates. Implementing this without a written design first is a recipe for shared-sim regen surprise, wire-format churn mid-cycle, and host-migration gaps. Cycle 33 produces the design doc; Cycle 34 implements it.

1. **Read** [`worker/src/`](../worker/src/), [`shared/scenes/`](../shared/scenes/), [`shared/MovementPhysics.js`](../shared/MovementPhysics.js), [`shared/GameStateValidation.js`](../shared/GameStateValidation.js), [`js/network/`](../js/network/), [`worker/migrations/`](../worker/migrations/), and [`tests/sim-baseline/`](../tests/sim-baseline/).
2. **Draft** [`docs/mp-island-scenes-design.md`](mp-island-scenes-design.md) covering, in order:
   - **Goal and non-goals.** What "MP island scenes" means today (Rolling Hills round-up + Open Country gather-and-portal in multiplayer rooms). What stays Cycle 35+ (custom modes per island, host-set difficulty, etc.).
   - **Shared-sim implications.** Whether the heightfield replay (`Heightfield.sample` + `_groundY` falloff) currently runs deterministically on the worker side, and what changes if not. Whether boundary-collision + flocking need any per-island branching today.
   - **Worker DO state additions.** What new fields the DO needs: per-scene heightfield reference (or signature), Open Country objective stage state, gate trigger state.
   - **Wire format additions.** What the DO must broadcast that today's wire format doesn't include — objective stage transitions, gate state. Whether existing message kinds extend or new kinds are added. Migration story for in-flight sessions.
   - **Sim-baseline regen plan.** Which scenes need new baseline fixtures, which seeds, and the Acceptance line phrasing for the cycle that does the regen.
   - **Scene-def MP gates.** What flags/fields on `SceneDef` (currently `boundary`, `pasture`, `objective`) need to be MP-aware vs. ignored in MP. Whether `objective.roundupZone` MP semantics differ from solo.
   - **Host-migration semantics.** What happens to objective stage state when the host disconnects mid-stage. Whether the DO snapshots stage state on every transition or only on host change.
   - **Open questions** that Cycle 34 needs to answer before phase 1 (e.g. "Do MP rooms allow scene voting or is the room-creator's choice locked?", "Does the Open Country portal trigger still teleport individual sheep to a stage 2 pen, or does it fail-fast on >X sheep?").
   - **Suggested cycle 34 phase shape** (≤ 5 phases, with EARS-form Acceptance lines).
3. **Append a forward-pointer entry** to [`docs/BACKLOG.md`](BACKLOG.md) under "Deferred / next-cycle leads" so future agents find the design doc without grepping.
4. **Do not implement anything in `shared/`, `worker/`, or `js/network/`** during this cycle. The design doc is the deliverable.

**Acceptance (EARS):**

- When Phase 5 ships, then [`docs/mp-island-scenes-design.md`](mp-island-scenes-design.md) shall exist.
- When Phase 5 ships, then `grep -c '^## ' docs/mp-island-scenes-design.md` shall return ≥ 7 (sections enumerated above).
- When Phase 5 ships, then `git diff --name-only HEAD~5 HEAD -- shared/ worker/src/ js/network/` shall return zero entries (no implementation drift).
- If Phase 5 modifies any file under `shared/`, `worker/src/`, `js/network/`, `tests/sim-baseline/`, or `worker/migrations/`, then the agent shall stop and surface (out of scope).

## Dependencies

Mostly serial, with Phase 5 running in parallel:

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → cycle-close
                    Phase 5 (parallel any time)
```

Phase 2 depends on Phase 1 only because the workflow under test should be running on the bumped action versions. Phases 3 and 4 are independent of Phase 2 but bundling them together keeps the diff focused.

## Frozen files (cycle-specific additions)

The durable fence ([`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md)) applies. Cycle-specific additions:

- None. Phase 4 explicitly does not touch [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md). Phase 5 explicitly does not touch `shared/`, `worker/`, `js/network/`, sim-baselines, or worker migrations.

## Hard stops

The durable hard stops in [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) apply. Cycle-specific additions:

1. **If Phase 1 deploy run regresses** (a previously-green check turns red after the action bump), then revert the bump before adding Phase 2 changes.
2. **If Phase 2 BrowserStack Local dispatch hits an account-tier error** (free-tier session minutes exhausted, parallel-session cap), then capture the error and stop the BrowserStack work; document the gate condition in [`NEXT_SESSION.md`](../NEXT_SESSION.md) at cycle close. Do not pay for an upgraded plan autonomously.
3. **If Phase 3 `npm install` after the override bumps `package-lock.json` byte size by > 100 KB**, then stop and surface — that suggests the override pulled an unexpected sub-tree.
4. **If Phase 4 hook fix breaks any existing archived plan's reconciliation output**, then revert and re-think. The hook is informational; a regression in coverage is worse than the original bug.
5. **If Phase 5 produces a design doc that requires sim-baseline regen across ≥ 4 fixtures**, then split the cycle 34 plan into 2 cycles in the design doc itself and note it under "Suggested cycle 34 phase shape".

## What NOT to do during this cycle

- **Don't bump the version** in [`package.json`](../package.json). Cycle 33 is operational; no player-visible delta.
- **Don't write a new CHANGELOG entry.** No release.
- **Don't update [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md), [`.claude/rules/*`](../.claude/rules/), or [`.claude/commands/*`](../.claude/commands/).** The hook fix is the cleaner alternative.
- **Don't start MP implementation** in Phase 5. Design doc only. Phase 5 acceptance explicitly forbids implementation drift.
- **Don't touch any sim-baseline fixture.** Phase 5 plans the regen for Cycle 34; it does not execute it.
- **Don't introduce new GitHub Actions** during the bump. Phase 1 is a one-for-one swap.

## Success criteria (cycle close)

- [x] When the cycle closes, all 5 phases shall be shipped or explicitly deferred to next cycle's [`BACKLOG.md`](BACKLOG.md) carryover.
- [x] When `npm test` runs at cycle close, all vitest specs shall pass.
- [x] When `npm run build` runs at cycle close, production build shall be clean.
- [x] When `npm run test:e2e -- --project=chromium --grep-invert @local-only` runs at cycle close, all chromium e2e specs shall pass.
- [ ] When the close commit lands on `main`, sheepdogsim.com Deploy workflow shall succeed.
- [ ] When the close commit lands on `main`, the next Deploy run shall not emit Node 20 deprecation annotations.
- [ ] When the close commit lands on `main`, GitHub Dependabot alert count shall be 0 or 1 (alert #20 dismissed; alert #21 auto-resolved by override).
- [x] When the close commit lands on `main`, [`docs/mp-island-scenes-design.md`](mp-island-scenes-design.md) shall exist.
- [x] When the close commit lands on `main`, [`docs/security-acceptance.md`](security-acceptance.md) shall exist.
- [x] When the close commit lands on `main`, `git diff --name-only HEAD~10 HEAD -- shared/ worker/src/ js/network/ tests/sim-baseline/ worker/migrations/ docs/CYCLE_TEMPLATE.md .claude/rules/ .claude/commands/` shall return zero entries.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — cycle plan template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard stops
- [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) — pickup-state contract
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/archive/cycles/cycle-32-plan.md`](archive/cycles/cycle-32-plan.md) — prior cycle (`apple-platform-validation`)
- [EARS notation](https://kiro.dev/docs/specs/) — testable acceptance lines
