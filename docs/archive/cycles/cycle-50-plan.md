# Cycle 50 — object-impostor-plumbing

> Drafted 2026-05-29 after Cycle 49 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. This is **Cycle A** of the object-driven impostor program; the full 2-cycle design (Cycle A here, Cycle B is the variation/new-object capability cycle) lives in [`object-impostor-cycle-plan.md`](object-impostor-cycle-plan.md). Inserted ahead of the Pastoral UI program's remaining work (entrance/loading + container restyle shift to Cycles 51+).

## Goal

Make the tree impostor (billboard far-LOD) pipeline **object-driven** instead of preset/fixture-driven, as a pure refactor with zero visual change. Today [`tools/bake-tree-impostors.mjs`](../tools/bake-tree-impostors.mjs) bakes from a hardcoded `TREES = ['tree1','tree2']` list (line 43); each type yields one atlas every instance shares, and only trees get impostors. This cycle introduces a data-driven `assets/objects.manifest.json` that drives the offline bake, generalizes the sidecar and the runtime route to read it, and makes octahedral reproducible through the committed baker. tree1/tree2 stay **byte-identical** and the production render path is untouched. The user-visible difference is none; the win is that the hardcoded list is gone and adding an object/variant becomes a manifest edit plus a bake. Cycle 51 (the capability cycle, Cycle B) then adds per-instance variation and new object categories on top of this plumbing.

## How to read this plan

This doc fixes the shape of the changes (the manifest contract, where code slots in, acceptance), not the implementation. Research current best practice, read the named files before editing, and pick the simplest behavior-preserving change. The production tree path must not regress: this whole cycle holds tree1/tree2 byte-identical.

## Resolved decisions

- **Scope (user):** generic across object types + per-instance variation (per-instance variation and new object categories are Cycle 51 / Cycle B; this cycle builds the generic plumbing).
- **Bake timing (user):** build-time, data-driven; offline bakes preserved (no runtime mesh baking on the hot path).
- The full architecture, migration story, atlas/silhouette budgets, and the Cycle B phases are in [`object-impostor-cycle-plan.md`](object-impostor-cycle-plan.md).

## Architecture / shared changes

- **`assets/objects.manifest.json`** (new, standalone) mirrors the placement-bake precedent ([`tools/bake-placement.mjs`](../tools/bake-placement.mjs) + [`js/world/placementManifest.js`](../js/world/placementManifest.js) + `public/placement/<scene>.json` + a determinism golden). It is a global render-asset catalog, not a `SceneDef` field (that file is fence-frozen and sim-consumed). Per object: `{ id, category, source, runtimeModel, lod1?, impostor: { enabled, layouts[], variants[] } }`, plus a `layoutPresets` block centralizing today's magic Kiln knobs. Phase 1 enables only trees, so the manifest is byte-neutral.
- A shared `impostorAssetBase(obj, layout, variant)` helper computes output paths and is used by the baker, the runtime route resolver, and the tests. The base variant of a tree emits byte-identical paths.

## Phase 1 — Manifest + generalized baker, tree output byte-identical (~3-4hr) [autonomous]

1. Add [`assets/objects.manifest.json`](../assets/objects.manifest.json) cataloging tree1/tree2 (`impostor.enabled: true`, `category: "tree"`, `layouts: ["latlon-hemi-y"]`, one `base` variant) and the existing rocks/structures with `impostor.enabled: false`. Add the `layoutPresets` block.
2. Generalize the baker in place ([`tools/bake-tree-impostors.mjs`](../tools/bake-tree-impostors.mjs)): read the manifest, loop object x layout x variant, compute paths via `impostorAssetBase`, keep the npm script name and the existing `execFile`/tsx-bin/Windows plumbing.
3. Add `tests/objects-manifest.spec.js`.

**Acceptance (EARS):**
- When Phase 1 ships, then `grep -c "'tree1', 'tree2'" tools/bake-tree-impostors.mjs` shall return 0.
- When Phase 1 ships, then the manifest shall list tree1 and tree2 with `impostor.enabled: true` and `category: "tree"`, and `tests/objects-manifest.spec.js` shall assert every `objects[].source` GLB exists on disk.
- While an object has `impostor.enabled: false`, the baker shall emit no atlas for it.
- When `npm test` and `npm run build` run, both shall pass.

## Phase 2 — Sidecar generalization + determinism golden (~3hr) [autonomous]

1. The baker writes `objectId/category/variant/layoutId` into each sidecar (additive); regenerate `tree1.imposter.json` / `tree2.imposter.json`.
2. Generalize [`tests/imposter-sidecar.spec.js`](../tests/imposter-sidecar.spec.js) from the hardcoded `TREES` to the manifest.
3. Add `tests/objects-impostor-parity.spec.js` mirroring [`tests/placement-manifest.spec.js`](../tests/placement-manifest.spec.js): re-baking the unchanged manifest yields byte-identical sidecars (a recorded content-hash per atlas).
4. [`js/kiln-impostor-material.js`](../js/kiln-impostor-material.js) reads `variant`/`objectId` for the konveyor summary only (no shader-math change).

**Acceptance (EARS):**
- When Phase 2 ships, then every manifest tree sidecar shall carry `objectId`, `variant: "base"`, and `layoutId: "latlon-hemi-y"`.
- When the baker re-runs against an unchanged manifest, then `tree1.imposter.json` shall be byte-identical to the committed file.
- If a sidecar's `tilesX*tilesY !== angles`, then `tests/objects-impostor-parity.spec.js` shall fail.
- When `npm test` and `npm run build` run, both shall pass.

## Phase 3 — Runtime route reads the manifest (~3-4hr) [autonomous]

1. Add `js/world/objectImpostorManifest.js` (client loader, mirrors [`js/world/placementManifest.js`](../js/world/placementManifest.js), degrade-not-crash on fetch failure).
2. [`js/world/TreePlacement.js`](../js/world/TreePlacement.js): the route resolver and `loadKilnImpostor` callsites resolve from `impostorAssetBase()` via the manifest, removing the `tree1/tree2` string templates. Production tree rendering unchanged.

**Acceptance (EARS):**
- When a scene loads on the native route, then `loadKilnImpostor` shall be called with a manifest-resolved base, and `grep -c "models/trees/\${treeType}" js/world/TreePlacement.js` shall return 0.
- While `?konveyorNativeTreeImpostors=octahedral` is set, the resolved base shall point at the `octahedral/` layout; otherwise it shall resolve `latlon-hemi-y`.
- If the manifest fetch fails, then the runtime shall fall back to the existing path without throwing.
- When `npm test` and `npm run build` run, both shall pass.

## Phase 4 — Octahedral reproducible through the manifest (~2-3hr) [autonomous]

1. The baker emits the octahedral layout when a tree lists `octahedral` in `layouts` (closing the un-reproducible one-off-bake gap), writing to `assets/models/trees/octahedral/`. Runtime octahedral stays lab-gated; latlon stays production default.
2. Generalize [`tests/imposter-octahedral-sidecar.spec.js`](../tests/imposter-octahedral-sidecar.spec.js) to assert reproducibility + the new fields.

**Acceptance (EARS):**
- When the baker runs with `octahedral` in a tree's `layouts`, then `assets/models/trees/octahedral/tree1.imposter.png` shall be (re)written.
- When Phase 4 ships, then the octahedral sidecar shall carry `version: 2`, `layout: "octahedral"`, `objectId`, and `layoutId: "octahedral"`.
- While no `?konveyorNativeTreeImpostors=octahedral` query is present, the production route shall still resolve `latlon-hemi-y`.
- When `npm test` and `npm run build` run, both shall pass.

## Dependencies

`Phase 1 -> Phase 2 -> Phase 3`; Phase 4 depends on Phase 2 and can run parallel to Phase 3.

## Frozen files (cycle-specific additions)

No durable frozen file is modified. `shared/scenes/types.js` (SceneDef) stays frozen (no schema field this cycle; variant weighting lands in the manifest in Cycle 51 if wanted). The deterministic sim core, `tests/sim-baseline/`, and the Worker are untouched. `DECISIONS.md` is not edited (the capability cycle appends).

## Hard stops

Durable stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific additions:

1. If the base-variant re-bake is not byte-identical to the committed atlas/sidecar, stop and surface (the determinism golden is the gate).
2. If the Pixel Forge Kiln tool (`../pixel-forge`) becomes unavailable, do the code/test work but stop before claiming bake reproduction and surface that the reproduction step is unverified. (Verified present at cycle start.)
3. If a change appears to need a `shared/scenes/types.js` or Worker change, stop and surface (fence).

## What NOT to do during this cycle

- Do not reintroduce runtime mesh baking on the hot path; baking stays offline.
- Do not change the LOD0 -> impostor ladder or reintroduce a desktop LOD1 without a silhouette-IoU budget ([`DECISIONS.md`](../DECISIONS.md)).
- Do not promote octahedral to production; keep latlon-hemi the default and the `?renderer=webgpu&konveyorNativeTreeImpostors=latlon` rollback escape hatch.
- Do not add per-instance variation or new object categories (that is Cycle 51 / Cycle B).
- Do not touch `shared/`, regenerate sim-baseline, or change the Worker / wire protocol.
- Do not bump the app version.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs (including the manifest, sidecar, and parity specs) shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When the cycle closes, `grep -c "'tree1', 'tree2'" tools/bake-tree-impostors.mjs` shall return 0.
- [ ] When the cycle closes, the base-variant re-bake shall be byte-identical to the committed atlas/sidecar (determinism golden green).
- [ ] When the cycle closes, `git diff` against the cycle-start commit shall show `shared/`, `tests/sim-baseline/`, and the Worker untouched.

## References

- [`object-impostor-cycle-plan.md`](object-impostor-cycle-plan.md) — the full 2-cycle program (this is Cycle A; Cycle B is the capability cycle).
- [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md), [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md), [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md), [`BACKLOG.md`](BACKLOG.md).
- [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md), [`DECISIONS.md`](../DECISIONS.md) (far-tree impostors, octahedral lab-only).
- Precedent to mirror: [`tools/bake-placement.mjs`](../tools/bake-placement.mjs) + [`js/world/placementManifest.js`](../js/world/placementManifest.js) + [`tests/placement-manifest.spec.js`](../tests/placement-manifest.spec.js).
- [EARS notation](https://kiro.dev/docs/specs/).
