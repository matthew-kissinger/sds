# Next Session - v2.6.0 Beta Release

> **Updated:** 2026-06-30
> **For:** web-only `v2.6.0` beta release
> **Pickup priority:** Post-release beta follow-up: community/playtest loop, seasonal leaderboard implementation decision, and first-session route review.

## Current State

The repo has released the web-only `v2.6.0` beta. Matt's current GTM decisions:

1. Newsheepdogland is a gated lab, not a launch promise.
2. Public copy should say three public playable scenes.
3. The beta identity is `v2.6.0 beta`.
4. The beta channel is web-only on `https://sheepdogsim.com`.
5. Steam remains the ultimate target if beta succeeds, but it is not a current public-launch task.
6. Itch, portals, and ad SDKs are deferred.

The public beta posture is recorded across [`docs/launch/seo-content-matrix.md`](docs/launch/seo-content-matrix.md), [`docs/launch/release-checklist.md`](docs/launch/release-checklist.md), [`docs/launch/leaderboard-season-plan.md`](docs/launch/leaderboard-season-plan.md), and [`docs/launch/v2.6.0-beta-release-notes.md`](docs/launch/v2.6.0-beta-release-notes.md): telemetry disclosure with a Settings opt-out for nonessential events, all-time leaderboard preservation plus a seasonal follow-up plan, and `/privacy` and `/support` public pages.

Completed in this GTM alignment pass:

1. Public SEO/crawler/store copy now says three public scenes and keeps Newsheepdogland as a gated lab.
2. Newsheepdogland is `noindex, follow` and removed from `sitemap.xml`; support/privacy are in the sitemap.
3. `/privacy` and `/support` exist and are included in the Vite build input.
4. Mobile active-play source notice is removed from the HUD; source remains reachable from Pause, About, and static pages.
5. Tutorial offer gets compact/mobile top spacing to avoid the entrance top rail.
6. Public lobby discovery uses `NetworkManager.requestPublicLobbies()` directly instead of waiting on a channel listener.
7. Settings now include a product telemetry toggle; tutorial offer shown/accepted/skipped events are emitted.
8. Leaderboard season planning and beta release notes are documented.

Immediate remaining work after release:

1. Owner decision: keep Rolling Hills as the first visual default with a Home Field tutorial offer, or make Home Field the first-time primary path until tutorial completion.
2. Engineering follow-up: implement seasonal leaderboard storage/UI only as a scoped Worker/D1 cycle; do not reset production scores as a shortcut.
3. Community follow-up: start the first small playtest loop before adding new launch channels.

## Review Entry Points

1. [`docs/cycle-111-plan.md`](docs/cycle-111-plan.md) - implementation plan, EARS acceptance, and validation notes.
2. [`docs/launch/seo-content-matrix.md`](docs/launch/seo-content-matrix.md) - canonical public copy constraints.
3. [`docs/launch/leaderboard-season-plan.md`](docs/launch/leaderboard-season-plan.md) - seasonal leaderboard plan and no-reset guardrails.
4. [`docs/launch/v2.6.0-beta-release-notes.md`](docs/launch/v2.6.0-beta-release-notes.md) - beta release notes.
5. [`docs/launch/release-checklist.md`](docs/launch/release-checklist.md) - approved web beta release/rollback commands.

## Autonomy Rules

- Web beta planning and docs alignment are approved.
- Do not publish paid, irreversible, or public marketplace submissions without explicit approval.
- Do not perform itch upload, Steam Direct, Steam depot, CrazyGames, Poki, Newgrounds, Kongregate, or Y8 submission actions without explicit approval.
- Do not store API keys in repo files, docs, memory notes, screenshots, or launch packets.
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
