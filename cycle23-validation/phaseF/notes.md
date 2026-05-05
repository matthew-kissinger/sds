# Phase F — ship v1.4.0

## Tree triangle counter unwedged

`js/utils/TriangleCount.js` `sumInstancedMeshTriangles` now prefers `instancesCount` over `count`. InstancedMesh2 sets `_instancesCount` immediately on `addInstances()` and exposes the getter; the standard `count` field is re-set per-frame by the renderer's BVH frustum culling (and is 0 at the time `registerSystemTriangleCounts` fires post-init, BEFORE the first paint). Falls back to `count` for plain THREE.InstancedMesh.

## CHANGELOG + version bumps

- `package.json`: 1.3.0 → 1.4.0
- `worker/package.json`: 1.3.0 → 1.4.0
- `package-lock.json`: not touched (was already out of sync at 1.1.0; pre-existing drift not introduced this cycle)
- `CHANGELOG.md`: new `[1.4.0]` section above `[1.3.0]` with Added / Changed / Validation / Deferred subsections.

## Final validation

- vitest: 188/188 pass + 7 skipped (sim-baseline byte-identical; all phase A1/A2/B/C/D/E changes preserved).
- Production build: `dist/assets/main-*.js` = 833.15 KB / 247.89 KB gzip. **Cumulative delta from `cycle-23-base` (825.62 KB) = +7.53 KB** across all six phases. Plan F target was `< +20 KB`; well under budget.
- Worker `tsc --noEmit`: clean (Phase E typecheck verified).
- `npm run perf:check` not re-run (requires live `npm run dev` server; the committed baseline at `tests/perf-baseline/baseline.json` reads `field-extreme` only — see `cycle23-validation/baseline.md`).

## Files touched

- [js/utils/TriangleCount.js](../../js/utils/TriangleCount.js) — `instancesCount` fallback
- [package.json](../../package.json) — version bump
- [worker/package.json](../../worker/package.json) — version bump
- [CHANGELOG.md](../../CHANGELOG.md) — new release entry

## Tag + push

`git tag v1.4.0` + `git push origin main --tags` completes the cycle close.
