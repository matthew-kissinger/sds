# Cycle 108 - release-candidate-proof

> Drafted 2026-06-26 as the third launch-readiness cycle. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md), confirm Cycles 106-107 are closed or intentionally deferred, then read this doc top-to-bottom.

## Goal

Cycle 108 turns the updated docs and SEO work into a verified release candidate. Before this cycle, the repo is technically healthy but not cut as a current launch release. After this cycle, the web build, itch build, native preflight, changelog/version posture, deployment checks, and release-candidate evidence should be in one place, with a clear ship/no-ship status feeding native/store work in Cycle 109.

## Autonomy contract

Continue autonomously into Cycle 109 if all gates pass. This cycle may prepare version bumps, release-candidate notes, build artifacts, and deployment evidence. It must not create a public release tag, GitHub release, store upload, or paid platform submission unless the user has explicitly authorized publication after reading the release-candidate report.

## Scope decisions

1. **D1: Release candidate first, public release second.** Prove the candidate before tagging or publishing.
2. **D2: Web production health is verified, not assumed.** Check current Pages, Worker, preview Worker, sitemap, robots, and key pages after local proof.
3. **D3: Itch and native payloads are built as candidates.** Store publication belongs to Cycles 109-110.
4. **D4: Sim determinism remains out of scope.** No `shared/` or sim-baseline edits are authorized.
5. **D5: Version choice must be explicit.** Record why the release is `v2.4.0`, `v2.3.5`, or another value before changing files.

## Phase 1 - Version and release decision (~2hr, autonomous)

**Independently testable.**

1. Inspect `package.json`, `package-lock.json`, `CHANGELOG.md`, latest tags, and `git describe --tags --always --dirty`.
2. Decide the release version based on player-visible scope since `v2.3.4`.
3. Write `cycle108-validation/release-version-decision.md` with the version, rationale, files to bump, and tag/publish policy.
4. If version files are bumped, keep the change limited to package metadata, changelog, native package metadata only where needed, and release notes.

**Acceptance (EARS):**

- When Phase 1 ships, then `cycle108-validation/release-version-decision.md` shall record the current latest tag, current HEAD describe output, chosen candidate version, and tag policy.
- When Phase 1 ships with a version bump, then `package.json`, lockfile, changelog, and any native package version shall agree or the report shall explain the exception.
- If the chosen version requires a public tag, then Phase 1 shall defer tag creation until the release-candidate close report is green.

## Phase 2 - Local release validation battery (~4hr, autonomous)

**Depends on:** Phase 1.

1. Run the repo's current launch validation battery:
   - `npm test`
   - `npm run lint`
   - `npm run build`
   - `npm run build:itchio`
   - `npm run native:check`
2. Run `npm run test:e2e` if Cycle 107 changed public HTML, entry flow copy, scene navigation, or image references in ways that affect browser behavior.
3. If performance-sensitive code changed in prior cycles, run the relevant jitter rail from `AGENTS.md`; otherwise record why perf rails are not needed.
4. Save command output summaries in `cycle108-validation/local-validation.md`.

**Acceptance (EARS):**

- When Phase 2 ships, then `cycle108-validation/local-validation.md` shall list each command, exit status, and relevant warnings.
- When Phase 2 ships, then `npm test`, `npm run build`, `npm run build:itchio`, and `npm run native:check` shall pass.
- If any e2e or perf check is skipped, then the report shall record the reason and the residual risk.

## Phase 3 - Deploy target verification (~3hr, autonomous)

**Depends on:** Phase 2.

1. Inspect `.github/workflows/deploy.yml`, `.github/workflows/preview.yml`, and latest GitHub Actions runs.
2. Verify production:
   - `https://sheepdogsim.com/`
   - `https://sheepdogsim.com/about`
   - key scene pages
   - `https://sheepdogsim.com/sitemap.xml`
   - `https://sheepdogsim.com/robots.txt`
   - production Worker `/healthz`
   - production leaderboard endpoint with `scene=field`
3. Verify preview Worker `/healthz` and leaderboard with `scene=field`.
4. Record whether docs-only commits did or did not trigger production deploys, and whether a code/content commit is needed for the SEO changes to reach production.

**Acceptance (EARS):**

- When Phase 3 ships, then `cycle108-validation/deploy-targets.md` shall list every verified URL, HTTP status, and key response evidence.
- When Phase 3 ships, then production Worker and preview Worker health checks shall pass or the report shall mark the release candidate blocked.
- If production Pages is not serving the candidate content, then Phase 3 shall identify the required deploy path before the cycle closes.

## Phase 4 - Release-candidate artifact packet (~3hr, autonomous)

**Depends on:** Phases 2-3.

1. Create `docs/launch/release-candidate.md` with the candidate version, commit, validation summary, deployment status, known risks, and manual review checklist.
2. Create or refresh `docs/launch/release-checklist.md` with exact commands for tagging, GitHub release, production deploy verification, itch update, Steam continuation, and rollback.
3. If build artifacts are created locally, record paths and sizes in `cycle108-validation/artifacts.md`. Do not commit bulky generated artifacts unless the repo already tracks that artifact type.

**Acceptance (EARS):**

- When Phase 4 ships, then `docs/launch/release-candidate.md` shall include version, commit, validation, deployment, known risks, and review checklist sections.
- When Phase 4 ships, then `docs/launch/release-checklist.md` shall contain exact commands or UI steps for tag, GitHub release, deploy verification, itch update, and rollback.
- If local artifacts are produced, then `cycle108-validation/artifacts.md` shall list their path, size, and whether they are committed, ignored, or external.

## Phase 5 - Candidate close and handoff (~1hr, autonomous)

**Depends on:** Phase 4.

1. Write `cycle108-validation/close-report.md` with the final ship/no-ship status.
2. Update `NEXT_SESSION.md` to point at Cycle 109 if the candidate is green.
3. If blocked, leave `NEXT_SESSION.md` pointed at Cycle 108 and name the first unblock action.

**Acceptance (EARS):**

- When Phase 5 ships with a green candidate, then `cycle108-validation/close-report.md` shall say `release-candidate: green`.
- When Phase 5 ships with a blocked candidate, then `cycle108-validation/close-report.md` shall say `release-candidate: blocked` and name the blocking gate.
- When Phase 5 ships green, then `NEXT_SESSION.md` shall identify Cycle 109 as the next cycle.

## Dependencies

```
Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5
```

## Frozen files (cycle-specific additions)

No `shared/`, sim-baseline, migration, or refactor-baseline edits are authorized. Version metadata and docs are authorized only after Phase 1 records the release decision.

## Hard stops

Durable hard stops apply on every cycle; see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific stops:

1. If `npm test`, `npm run build`, `npm run build:itchio`, or `npm run native:check` fails, then do not advance to Cycle 109.
2. If production or preview multiplayer health fails, then mark the release candidate blocked until the deploy target is understood.
3. If creating a git tag, GitHub release, or public deployment would be required, then stop unless the user has explicitly authorized publication.
4. If browser automation launches local tabs, then close them and stop dev/preview listeners before close.

## What NOT to do during this cycle

- Do not submit to Steam, itch, CrazyGames, Poki, Newgrounds, Kongregate, or any store.
- Do not buy certificates, pay Steam Direct fees, or alter platform account settings.
- Do not hide build warnings by raising budgets unless a recorded measured decision justifies the change.
- Do not regenerate sim-baseline or refactor-baseline fixtures to make the release candidate pass.

## Success criteria (cycle close)

- [ ] When Cycle 108 closes, `docs/launch/release-candidate.md` shall state green or blocked.
- [ ] When Cycle 108 closes green, core local validation shall pass and deploy targets shall be verified.
- [ ] When Cycle 108 closes green, `NEXT_SESSION.md` shall point to Cycle 109.

## References

- [`docs/cycle-107-plan.md`](cycle-107-plan.md)
- [`docs/cycle-109-plan.md`](cycle-109-plan.md)
- [`docs/launch/`](launch/)
- [`docs/native-desktop-package-cycle-54.md`](native-desktop-package-cycle-54.md)
- [`docs/native-store-steam-readiness-checklist.md`](native-store-steam-readiness-checklist.md)
