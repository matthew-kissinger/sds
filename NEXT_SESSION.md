# Next Session - Cycle 111 Release Verification

> **Updated:** 2026-06-28
> **For:** v2.5.0 web release follow-up
> **Pickup priority:** Verify the `v2.5.0` deploy/tag state, then decide whether to update itch or other storefronts.

## Current State

Cycle 111 is complete. The worktree includes bark-as-core-skill behavior, calm runtime bark audio, a bark cooldown HUD, a world-space bark wave, tutorial onboarding that teaches bark, easier leaderboard discovery, completion-screen polish, and a continued Newsheepdogland public gate.

The immediate post-release work is verification:

1. Confirm the GitHub `Deploy` workflow for the `v2.5.0` release commit is green.
2. Confirm `https://sheepdogsim.com/`, `/about`, `/scenes/*`, `/sitemap.xml`, `/robots.txt`, and the production Worker health endpoint are green.
3. Confirm the live first-session tutorial offer can start the tutorial and reach the bark step.
4. Confirm bark readiness/cooldown and leaderboard navigation are visible in the live web build.
5. Confirm the `v2.5.0` tag exists on the intended release commit.
6. Decide whether to update itch now using `docs/launch/itch-launch-brief.md`.

## Review Entry Points

1. [`docs/cycle-111-plan.md`](docs/cycle-111-plan.md) - implementation plan, EARS acceptance, and validation notes.
2. [`docs/launch/v2.5.0-release-notes.md`](docs/launch/v2.5.0-release-notes.md) - player-facing release notes.
3. [`docs/bark-audio-assets.md`](docs/bark-audio-assets.md) - bark audio sources and licenses.
4. [`docs/launch/release-checklist.md`](docs/launch/release-checklist.md) - launch/rollback commands.
5. [`docs/launch/itch-launch-brief.md`](docs/launch/itch-launch-brief.md) - itch publish prep.
6. [`docs/launch/steam-store-brief.md`](docs/launch/steam-store-brief.md) - Steam prep and blockers.

## Autonomy Rules

- Web deploy/tag/repo release updates are approved for Cycle 111.
- Do not publish paid, irreversible, or public marketplace submissions without explicit approval.
- Do not perform Steam Direct, Steam depot, CrazyGames, Poki, Newgrounds, Kongregate, or Y8 submission actions without explicit approval.
- Keep `shared/`, sim-baseline goldens, and frozen process files untouched unless the active cycle plan explicitly authorizes the change.

## Reference Table

| Topic | Source |
|---|---|
| Portable agent rules | [`AGENTS.md`](AGENTS.md) |
| Active cycle sequence | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Pickup contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
| Launch copy drafts | [`docs/launch/`](docs/launch/) |

## Stop Conditions

Stop and surface before continuing if validation discovers a gameplay regression, a deploy target is red, a platform requires payment or public submission, a store/account credential is missing, or any frozen-file edit is needed outside the active plan's authorization.
