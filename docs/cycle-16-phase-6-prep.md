# Cycle 16 — Phase 6 prep (hero cards + v1.1.0 tag)

> Recorded 2026-05-03. Phase 6 needs Matt at the keyboard with mouse for camera posing — autonomous agents can't drive `__sdsCinema.freeFly()` interactively. This doc captures the exact workflow so the live session is friction-free.

## Pre-flight

Phases 1-3 + 5 are committed. Phase 4 (perf baseline capture) is the gating checkpoint:

```bash
# Local baseline capture (good for sanity-check; CI Linux baseline is what
# gates v1.1.0 per the cycle plan):
npm run dev                    # in one terminal
npm run perf:baseline          # in another; ~15min
git add tests/perf-baseline/baseline.json
git commit -m "perf: pin local baseline post-cycle-16-phase-1-3"
```

For the **canonical** Linux baseline, use the workflow_dispatch route added to deploy.yml in Phase 5:

1. GitHub → Actions tab → Deploy workflow → Run workflow.
2. Set `capture_baseline: true`.
3. The `perf-baseline-capture` job spins up the dev server on a Linux runner, runs `perf:baseline`, and commits the result back via `perf-baseline-bot`.
4. Once that lands, the `perf-check` job becomes meaningful. To make it run on every push (not just workflow_dispatch), edit `.github/workflows/deploy.yml` and remove the `if: ${{ github.event_name == 'workflow_dispatch' }}` line on `perf-check`.

## OG cards (3 stills)

URL params + commands per the cycle-15 close notes:

| Card | URL | Pose source |
| --- | --- | --- |
| `og-rh-sunset` | `?cinematic=1&scene=rolling-hills&sun=0.18` | `tools/cinematic/shot-list.mjs` (existing) |
| `og-field` | `?cinematic=1&scene=field` | existing |
| `og-open-country` | `?cinematic=1&scene=open-country&sun=0.30` | existing |

Workflow per card:

```bash
# 1. Open the URL in Chrome
# 2. Click "Solo Play → Confirm Selection → Extreme Mode"
# 3. Wait for the world to settle (5-10s)
# 4. In the DevTools console:
await __sdsCinema.freeFly()           # detach camera, mouse-look enabled
# Move + look with WASD + mouse to the desired framing
__sdsCinema.snapshotPose()            # logs pose JSON to console — copy it
# 5. Open tools/cinematic/shot-list.mjs and paste the pose into the matching shot id
# 6. Re-render the still:
npm run cinema -- --shot=og-rh-sunset --headed
# 7. Verify in tools/playtest/cinematic/<shot>.webp
```

The `--headed` flag is required for local re-render so you can see the framing before the WebP encode locks it in.

## Cinematic videos (4 mp4s)

Camera coords already live in `tools/cinematic/shot-list.mjs` from Cycle 13. Iterate framing on the polished post-LOD-chain world:

| Video | Shot id | Notes |
| --- | --- | --- |
| Dog into sunset | `dog-into-sunset` | RH scene; check that the new tree LOD swap doesn't pop during the camera dolly |
| Lightning strike | `lightning-strike` | Field; storm preset; confirm trees still read at ~150m+ post-LOD2 |
| Chaos 5000 | `chaos-5000` | Field; spawn 5000 sheep; verify perf holds at the new tree budget |
| OC portal | `oc-portal` | OC; confirms the cross-billboard impostors still look clean from the cinematic camera angle |

```bash
npm run cinema -- --shot=dog-into-sunset --headed
# Iterate framing → re-pose via __sdsCinema.freeFly() → re-render
```

If LOD pop is visible in any video, raise the LOD2 distance in `js/TerrainBuilder.js` (currently `addLOD(billboardGeo, billboardMat, 150)` → bump to 180) and re-shoot.

## Tag v1.1.0

After all 7 deliverables (3 OG cards + 4 videos) land cleanly:

```bash
# Bump versions
npm version 1.1.0 -m "release: v1.1.0 — tree foliage LOD chain + perf harness + visuals polish"
# (npm version updates package.json + creates a git tag)

# Worker has its own package.json — bump that too:
cd worker && npm version 1.1.0 --no-git-tag-version && cd ..
git add worker/package.json
git commit -m "release: bump worker to v1.1.0"

# Append CHANGELOG.md — hand-write the player-facing entry under
# "## v1.1.0 — 2026-05-XX" with bullets for:
#   - Distant trees stop costing the full canopy (per-instance LOD chain)
#   - Mid-distance trees use a reduced-canopy LOD1 sibling
#   - Bark coherence pass + symmetric-canopy seed re-roll
#   - Hero rocks variants integrated
#   - Dandelion clusters + readable mushrooms
#   - Perf baseline + CI gate

git push origin main --tags
```

## Hard stops (don't ship v1.1.0 if any of these)

- `perf:check` showing >5% regression on any of the 6 configs (per cycle plan Phase 4 acceptance + cycle plan Hard Stops).
- Visible LOD pop at typical play distances on any scene.
- Visual regression on a previously-passing scene (e.g., OC horizon ring of impostors looking obviously worse than Cycle 15).
- `npm test` failure.
- Production `npm run build` not clean.

## Post-tag

- Merge the `v1.1.0` tag to GH Releases (gh release create v1.1.0 --notes "see CHANGELOG.md").
- Update sheepdogsim.com landing-page to reference the v1.1.0 OG cards (if marketing surface differs from the auto-served ones).
- Update [`NEXT_SESSION.md`](../NEXT_SESSION.md) with the cycle-16 close summary.
- Run `/cycle-close` to archive the cycle plan, update BACKLOG, scaffold cycle 17.
