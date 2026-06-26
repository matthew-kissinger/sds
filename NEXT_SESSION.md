# Next Session - Post-Launch Verification

> **Updated:** 2026-06-26
> **For:** launch follow-up
> **Pickup priority:** Verify the `v2.4.0` deploy/tag state, then decide whether to update itch.

## Current State

Cycles 106-110 are complete. Matt approved the launch after the fresh in-game screenshot pass. The worktree now includes refreshed public docs, press kit, launch copy, site metadata, scene pages, manifest, sitemap, `llms.txt`, SEO regression tests, version metadata, fresh WebGPU hero/social images, release-candidate validation, deploy-target proof, native package proof, Steam readiness docs, itch docs, portal matrix, repo metadata report, and final launch packet.

The immediate post-launch work is verification:

1. Confirm the GitHub `Deploy` workflow for the launch commit is green.
2. Confirm `https://sheepdogsim.com/`, `/about`, `/scenes/*`, `/sitemap.xml`, `/robots.txt`, and the production Worker health endpoint are green.
3. Confirm live HTML references `assets/scenes/social/*.webp` for OG/Twitter metadata and `assets/scenes/entrance/*.webp` for page heroes.
4. Confirm the `v2.4.0` tag exists on the intended launch commit.
5. Decide whether to update itch now using `docs/launch/itch-launch-brief.md`.

## Review Entry Points

1. [`docs/launch/final-launch-review.md`](docs/launch/final-launch-review.md) - launch packet and human decisions.
2. [`docs/launch/release-candidate.md`](docs/launch/release-candidate.md) - release-candidate proof.
3. [`docs/launch/release-checklist.md`](docs/launch/release-checklist.md) - exact launch/rollback commands.
4. [`docs/launch/itch-launch-brief.md`](docs/launch/itch-launch-brief.md) - itch publish prep.
5. [`docs/launch/steam-store-brief.md`](docs/launch/steam-store-brief.md) - Steam prep and blockers.
6. [`docs/launch/portal-target-matrix.md`](docs/launch/portal-target-matrix.md) - portal recommendations.

## Autonomy Rules

- Web deploy/tag/repo launch updates were approved after the screenshot refresh.
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
