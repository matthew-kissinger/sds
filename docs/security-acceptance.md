# Security advisory acceptance log

> Append-only record of GitHub Dependabot / `npm audit` advisories that have been reviewed and accepted as tolerable risk for this project, with a documented rationale and a re-evaluation trigger. New advisories are not appended here automatically; only after a deliberate review concludes "accept and document."

## Posture

When a Dependabot or `npm audit` alert fires, the default is to fix it. We accept-and-document only when:

1. The advisory's exploit path does not apply to our usage (e.g. server-only CVE on a code path we never run, region-validation CVE on an SDK we never instantiate).
2. No patched version exists in the affected major (so an "auto-fix" PR cannot land).
3. The fix path requires a major upstream change outside our control (a transitive dep cleanup we cannot drive).
4. The severity is low (CVSS < 4.0) and the threat model is limited.

If any of those four checks fails, the answer is to fix, not to accept.

Each entry below carries a re-evaluation trigger. Before a release that bumps the affected SDK family, walk this log and confirm the rationale still holds.

## Accepted advisories

### `aws-sdk@2.x` — JavaScript SDK v2 region-string validation (low)

- **Advisory:** [GHSA-j965-2qgj-vjmq](https://github.com/advisories/GHSA-j965-2qgj-vjmq)
- **Severity:** low (CVSS 3.7, `AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N`)
- **Affected range:** `>=2.0.0 <=3.0.0` of `aws-sdk`
- **Patched version:** none in the v2 line. Fix path is migrating callers to `@aws-sdk/client-*` v3.
- **Our exposure:** transitive only. `browserstack-node-sdk@1.53.2 → aws-sdk@2.1693.0`. The aws-sdk dep ships with the BrowserStack test SDK; we do not import `aws-sdk` anywhere in the repo.
- **Threat model:** the advisory describes a region-string validation gap when the consumer accepts user-supplied region strings without validation. Our usage is the BrowserStack SDK calling its own AWS endpoints with hard-coded region strings inside the BrowserStack runner. There is no path from a user input to an `aws-sdk` region argument in this project.
- **Why we are not fixing today:** the only fix path is `browserstack-node-sdk` migrating to aws-sdk v3, which is upstream work outside our control. The Dependabot-suggested "fix" of downgrading to `browserstack-node-sdk@1.22.0` is a major regression that loses iOS Safari device support we rely on for the water canary.
- **Re-evaluation triggers:**
  - Every BrowserStack SDK upgrade — confirm whether the new version still pulls aws-sdk v2 or has migrated to v3.
  - If a `High` or `Critical` advisory on aws-sdk v2 publishes — re-evaluate immediately.
  - If we ever start importing `aws-sdk` directly — this entry no longer applies; fix at that time.
- **Decision date:** 2026-05-10 (Cycle 33)
- **Reviewed by:** Matt Kissinger via Cycle 33 plan acceptance

### `@tootallnate/once@2.x` — Incorrect Control Flow Scoping (low)

- **Status:** RESOLVED (not accepted). Patched 2026-05-10 via `package.json` `overrides` pinning `@tootallnate/once` to `^3.0.0`. Listed here for cross-reference only; the active alert log is on GitHub.
