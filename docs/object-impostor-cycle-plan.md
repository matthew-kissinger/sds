# Object-Driven Impostor Pipeline — render cycle plan (drafted, not yet sequenced)

> Drafted 2026-05-29. This is a **drafted future render cycle**, not the active cycle and not yet assigned a number. The active work is the Pastoral UI program (Cycle 49 done, Cycles 50-52 planned in [`ui-migration-map.md`](ui-migration-map.md) / [`entrance-loading-spec.md`](entrance-loading-spec.md)). It is independent of and does not block that program.
>
> **To activate:** assign a cycle number when prioritized (expected after the UI program), copy the active sub-cycle into `docs/cycle-N-plan.md`, point [`NEXT_SESSION.md`](../NEXT_SESSION.md) at it, and run `/cycle-start`. Recommended shape: a **2-cycle split** (Cycle A then Cycle B); a single 8-phase cycle is the fallback. Source: the approved plan and the constraints in [`DECISIONS.md`](../DECISIONS.md) + [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md).

## Goal (program)

Make the tree "impostor" (billboard far-LOD) pipeline **object-driven** instead of preset/fixture-driven. Today [`tools/bake-tree-impostors.mjs`](../tools/bake-tree-impostors.mjs) bakes from a hardcoded `TREES = ['tree1','tree2']` list (line 43); each type yields one atlas that every placed instance shares, and only trees get impostors. After this program, an object/variant **manifest** drives the offline bake (no hardcoded list), any object category (trees, rocks, structures, future objects) can get a far-LOD impostor through one pipeline, and instances of a type can vary (seasonal, worn, per-object drift) via render-only per-instance modulation with no runtime mesh baking. The user-visible difference is none in Cycle A (pure refactor) and subtle per-instance/biome variation plus impostors on more object kinds in Cycle B.

## How to read this plan

This doc fixes the *shape* of the changes (the manifest contract, where code slots in, acceptance criteria), not the implementation choices. Each agent picking up a phase researches current best practice, reads the named files before editing, measures on the RTX 3070 / mid-tier mobile targets before committing to a technique, and picks the simplest thing that meets the budget. The production tree render path must never regress: Cycle A holds tree1/tree2 byte-identical and only Cycle B adds capability.

## Resolved decisions

- **Q1 scope (user):** generic across object types AND per-instance variation, not just one atlas per type.
- **Q2 bake timing (user):** build-time, data-driven (offline bakes preserved per the polish-program perf decision; no per-frame or per-instance runtime mesh baking on the hot path).
- **Q3 cycle shape (recommended):** 2-cycle split. Cycle A is a zero-visual-change refactor (manifest + generalized baker + parity); Cycle B is the capability cycle (variation + new object types). Single 8-phase cycle is the fallback.

The per-instance-variation-meets-offline-baking tension resolves as: bake a discrete set of variant atlases offline (manifest-driven), then at runtime each instance **selects** a variant and applies cheap **shader modulation** (tint/hue/scale, and an atlas-page index for structural variants). True per-instance unique geometry is out of scope.

## Architecture / shared changes

- **Manifest `assets/objects.manifest.json`** (new, standalone) mirrors the placement-bake precedent ([`tools/bake-placement.mjs`](../tools/bake-placement.mjs) + [`js/world/placementManifest.js`](../js/world/placementManifest.js) + `public/placement/<scene>.json` + a determinism golden). It is a global render-asset catalog, not a `SceneDef` field (that file is fence-frozen and sim-consumed). Per object: `{ id, category, source, runtimeModel, lod1?, impostor: { enabled, layouts[], variants[] } }`, plus a `layoutPresets` block centralizing today's magic Kiln knobs (`angles`, `axis`, `tileSize`, `auxLayers`).
- **Generalized baker:** the hardcoded loop becomes `for object (impostor.enabled) -> for layout -> for variant -> kiln bake`, reusing the existing `execFile`/tsx-bin/Windows plumbing ([`tools/bake-tree-impostors.mjs:50-101`](../tools/bake-tree-impostors.mjs)). A shared `impostorAssetBase(obj, layout, variant)` helper computes output paths; the base variant of a tree emits byte-identical paths. The baker augments the Kiln sidecar with `objectId/category/variant/layoutId` (additive, optional, defaulted) and writes a bake report the parity golden pins.
- **Per-instance variation, render-only:** a `kilnInstanceTint` instanced attribute (written once at placement) multiplied into the fragment color in [`js/kiln-impostor-material.js`](../js/kiln-impostor-material.js) is the default mechanism (zero extra atlas); a `kilnVariantPage` attribute selecting a baked page is the escalation for structural change. The variant selector is a pure client function seeded from already-deterministic instance data (`(x,z,rotationY)` hash) and lives **never in `shared/`**.
- **Generic seam:** generalize [`js/world/TreeImpostorRuntime.js`](../js/world/TreeImpostorRuntime.js) to `js/world/ObjectImpostorRuntime.js` exposing `attachImpostorLOD(...)`; placement modules stay independent and call it when their manifest entry opts in. The per-frame sync ([`js/TerrainBuilder.js:1219`](../js/TerrainBuilder.js)) iterates one generic `_impostorSyncTargets` list; the global ToD `setImpostorTint` already iterates a material list generically.

## Phase shape rules

Each phase has a single sharp goal and <= 4 hours of work, and is fully autonomous unless marked paired. Acceptance is EARS-format and grep-testable.

---

# Cycle A — object-impostor plumbing and parity (refactor, zero visual change)

**Goal.** Introduce the manifest and drive the baker, sidecars, and runtime route from it, while tree1/tree2 stay byte-identical and the production render path is untouched. No user-visible change. Outcome: the hardcoded `['tree1','tree2']` list is gone, octahedral is reproducible through the committed baker, and a determinism golden guards the manifest -> atlas mapping.

## Phase A1 — Manifest + generalized baker, tree output byte-identical (~3-4hr) [autonomous]

1. Add [`assets/objects.manifest.json`](../assets/objects.manifest.json) cataloging tree1/tree2 (`impostor.enabled: true`, `category: "tree"`, `layouts: ["latlon-hemi-y"]`, one `base` variant) and the existing rocks/structures with `impostor.enabled: false`. Add the `layoutPresets` block.
2. Generalize the baker in place ([`tools/bake-tree-impostors.mjs`](../tools/bake-tree-impostors.mjs)): read the manifest, loop object x layout x variant, compute output paths via `impostorAssetBase`, keep the npm script name. Base-variant tree paths stay byte-identical.
3. Add `tests/objects-manifest.spec.js` asserting the schema and that every `objects[].source` GLB exists on disk.

**Acceptance (EARS):**
- When Phase A1 ships, then `grep -c "'tree1', 'tree2'" tools/bake-tree-impostors.mjs` shall return 0.
- When Phase A1 ships, then the manifest shall list tree1 and tree2 with `impostor.enabled: true` and `category: "tree"`, and `tests/objects-manifest.spec.js` shall assert every `source` GLB exists.
- While an object has `impostor.enabled: false`, the baker shall emit no atlas for it.
- When `npm test` and `npm run build` run, both shall pass.

## Phase A2 — Sidecar generalization + determinism golden (~3hr) [autonomous]

1. The baker writes `objectId/category/variant/layoutId` into each sidecar (additive). Regenerate `tree1.imposter.json` / `tree2.imposter.json`.
2. Generalize [`tests/imposter-sidecar.spec.js`](../tests/imposter-sidecar.spec.js) from the hardcoded `TREES` to the manifest, asserting the new fields.
3. Add `tests/objects-impostor-parity.spec.js` mirroring [`tests/placement-manifest.spec.js`](../tests/placement-manifest.spec.js): re-running the baker against the unchanged manifest yields byte-identical sidecars (a recorded content-hash per atlas).
4. [`js/kiln-impostor-material.js`](../js/kiln-impostor-material.js) reads `variant`/`objectId` for the konveyor summary only (no shader-math change).

**Acceptance (EARS):**
- When Phase A2 ships, then every manifest tree sidecar shall carry `objectId`, `variant: "base"`, and `layoutId: "latlon-hemi-y"` (asserted by the generalized sidecar spec).
- When the baker re-runs against an unchanged manifest, then the emitted `tree1.imposter.json` shall be byte-identical to the committed file.
- If a sidecar's `tilesX*tilesY !== angles`, then `tests/objects-impostor-parity.spec.js` shall fail.
- When `npm test` and `npm run build` run, both shall pass.

## Phase A3 — Runtime route reads the manifest (~3-4hr) [autonomous]

1. Add `js/world/objectImpostorManifest.js` (client loader, mirrors [`js/world/placementManifest.js`](../js/world/placementManifest.js), degrade-not-crash on fetch failure).
2. [`js/world/TreePlacement.js`](../js/world/TreePlacement.js): the route resolver and `loadKilnImpostor` callsites resolve from `impostorAssetBase()` via the manifest, removing the `tree1/tree2` string templates. Production tree rendering unchanged.

**Acceptance (EARS):**
- When a scene loads on the native route, then `loadKilnImpostor` shall be called with a manifest-resolved base, and `grep -c "models/trees/\${treeType}" js/world/TreePlacement.js` shall return 0.
- While `?konveyorNativeTreeImpostors=octahedral` is set, the resolved base shall point at the `octahedral/` layout assets; otherwise it shall resolve `latlon-hemi-y`.
- If the manifest fetch fails, then the runtime shall fall back to the existing path without throwing.
- When `npm test` and `npm run build` run, both shall pass.

## Phase A4 — Octahedral reproducible through the manifest (~2-3hr) [autonomous]

1. The baker emits the octahedral layout when a tree lists `octahedral` in `layouts` (closing the un-reproducible one-off-bake gap), writing to `assets/models/trees/octahedral/`. Runtime octahedral stays lab-gated; latlon stays production default.
2. Generalize [`tests/imposter-octahedral-sidecar.spec.js`](../tests/imposter-octahedral-sidecar.spec.js) to assert reproducibility + the new fields.

**Acceptance (EARS):**
- When the baker runs with `octahedral` in a tree's `layouts`, then `assets/models/trees/octahedral/tree1.imposter.png` shall be (re)written.
- When Phase A4 ships, then the octahedral sidecar shall carry `version: 2`, `layout: "octahedral"`, `objectId`, and `layoutId: "octahedral"`.
- While no `?konveyorNativeTreeImpostors=octahedral` query is present, the production route shall still resolve `latlon-hemi-y`.
- When `npm test` and `npm run build` run, both shall pass.

## Cycle A — dependencies, frozen files, hard stops, success criteria

**Dependencies:** A1 -> A2 -> A3; A4 depends on A2 and can run parallel to A3.

**Frozen files:** none modified. `shared/scenes/types.js` stays frozen (no schema field this cycle). Deterministic sim core, `tests/sim-baseline/`, and the Worker untouched. `DECISIONS.md` not edited (Cycle B appends).

**Hard stops (cycle-specific, union with [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)):**
1. If the base-variant re-bake is not byte-identical to the committed atlas/sidecar, stop and surface (the determinism golden is the gate).
2. If the Pixel Forge Kiln tool (`../pixel-forge`) is unavailable, do the code/test work but stop before claiming bake reproduction; surface that the reproduction step is unverified.
3. If a change appears to need a `shared/scenes/types.js` or Worker change, stop and surface (fence).

**Success criteria (close):**
- [ ] All A-phases shipped or deferred to BACKLOG.
- [ ] `npm test` and `npm run build` pass; deploy on `main` succeeds.
- [ ] `grep -c "'tree1', 'tree2'" tools/bake-tree-impostors.mjs` returns 0.
- [ ] The base-variant re-bake is byte-identical (determinism golden green).
- [ ] `git diff` shows `shared/`, `tests/sim-baseline/`, and the Worker untouched.

---

# Cycle B — variation, new object types, polish (capability)

**Goal.** Add render-only per-instance variation (tint then variant pages), prove genericity by giving rocks an impostor through the same manifest+helper, and tidy. User-visible: subtle per-instance/biome variation and impostors on more object kinds. Depends on Cycle A.

## Phase B1 (P5) — Per-instance tint modulation (~4hr) [autonomous]

1. `js/world/ObjectImpostorRuntime.js` (generalized from `TreeImpostorRuntime.js`) gains the `kilnInstanceTint` attribute and the render-only variant selector seeded from instance data.
2. [`js/kiln-impostor-material.js`](../js/kiln-impostor-material.js) declares the attribute and multiplies it into the final color (guarded so the non-instanced inspector path still compiles).
3. Variant `modulation` blocks added to the manifest. Add `tests/object-impostor-variant-selection.spec.js`.

**Acceptance (EARS):**
- When two instances at different `(x,z)` are placed, then the selector shall return deterministically-seeded tints derived only from instance position/rotation (no `Math.random`).
- While variant selection runs, then `grep -rn "pickVariant" shared/` shall return 0.
- When the base variant with empty `modulation` is selected, then the tint attribute shall equal `(1,1,1,0)` and output shall match Cycle A.
- When `npm test` and `npm run build` run, both shall pass.

## Phase B2 (P6) — Variant atlas pages (~4hr) [autonomous]

1. The baker emits a second tree variant (e.g. seasonal canopy) as a separate-file page; the runtime selects it via `kilnVariantPage` and groups instances per page; the material adds a page UV offset.

**Acceptance (EARS):**
- When an object declares two impostor variants, then the baker shall emit two atlas sets and the parity test shall assert both exist and are non-empty.
- While `packing: "files"`, then each variant page shall be a distinct committed `.imposter.<variantId>.png`.
- When an instance selects page index k, then its `kilnVariantPage` attribute shall equal k.
- When `npm test` and `npm run build` run, both shall pass.

## Phase B3 (P7) — Rocks plug into the same pipeline (~3-4hr) [autonomous]

1. Flip a rock's `impostor.enabled` in the manifest; [`js/world/RockPlacement.js`](../js/world/RockPlacement.js) attaches an impostor LOD via the shared `attachImpostorLOD` helper; [`js/TerrainBuilder.js:1219`](../js/TerrainBuilder.js) sync iterates `_impostorSyncTargets`.

**Acceptance (EARS):**
- When a rock's manifest entry sets `impostor.enabled: true` and the baker runs, then `assets/models/rocks/<rock>.imposter.json` shall exist with `category: "rock"`.
- While rocks opt in, then `grep -c attachImpostorLOD js/world/RockPlacement.js` shall be >= 1.
- When the per-frame sync runs, then `_impostorSyncTargets` shall include both tree and rock impostor meshes.
- When `npm test` and `npm run build` run, both shall pass.

## Phase B4 (P8) — Polish + docs (optional, ~2-3hr) [autonomous]

1. Manifest lint as a build gate (fails if any `source` GLB is missing; sums projected atlas bytes against the transfer budget). Append a dated [`DECISIONS.md`](../DECISIONS.md) entry (append-only, supersedes the 2026-05 far-tree note). Update [`ARCHITECTURE.md`](../ARCHITECTURE.md).

**Acceptance (EARS):**
- When Cycle B closes, then `DECISIONS.md` shall contain a new dated "Object-driven impostor pipeline" entry (the prior note unedited).
- When `npm run build` runs, then the manifest-lint step shall fail the build if any `objects[].source` GLB is missing.

## Cycle B — dependencies, frozen files, hard stops, success criteria

**Dependencies:** B1 -> B2; B3 needs Cycle A plus the B1 runtime split and can run parallel to B2.

**Frozen files:** `shared/scenes/types.js` is touched only if per-scene variant *weighting* is wanted, and only as an optional-field-with-default plus the full fence ceremony (migration "absent -> neutral weighting"; consumer = the client selector only). **Lean: keep variant weighting in `assets/objects.manifest.json` and leave the fence closed.** `DECISIONS.md` append-only.

**Hard stops (cycle-specific):**
1. If silhouette-IoU drops below budget (>= 0.97 vs committed baseline for a base re-bake; >= 0.90 vs base for a variant page), stop and surface.
2. If projected impostor transfer exceeds the budget (~24 MB committed production PNG across objects+variants; lab octahedral route-gated out), stop and surface before committing atlases.
3. If variant selection needs to touch `shared/`, stop (fence). Selection stays render-only.

**Success criteria (close):**
- [ ] All B-phases shipped or deferred to BACKLOG.
- [ ] `npm test` and `npm run build` pass; deploy on `main` succeeds.
- [ ] `grep -rn "pickVariant" shared/` returns 0 (variant selection never crosses the sim fence).
- [ ] A rock renders an impostor through the manifest with no per-object bake or runtime code.
- [ ] `git diff` shows `shared/`, `tests/sim-baseline/`, and the Worker untouched.

---

## What NOT to do during this program

- Do not reintroduce runtime mesh baking on the hot path; baking stays offline (the runtime cross-billboard fallback may remain as a fallback only).
- Do not reintroduce a desktop LOD1 mid-tier or change the LOD0 -> impostor ladder without a silhouette-IoU budget ([`DECISIONS.md`](../DECISIONS.md)).
- Do not promote octahedral to production; it stays lab-gated. Keep latlon-hemi the default and the `?renderer=webgpu&konveyorNativeTreeImpostors=latlon` rollback escape hatch.
- Do not put variant selection in `shared/`, regenerate sim-baseline, or change the Worker / wire protocol.
- Do not merge the placement modules into a god-object; add the `attachImpostorLOD` seam only (cohesive-by-design stance).
- Do not bump the app version unless Matt calls a release.

## References

- Approved source plan: the object-driven impostor remediation plan.
- [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md), [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md), [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md), [`BACKLOG.md`](BACKLOG.md).
- [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) (far-tree impostors, foliage LOD, browser-probe hygiene), [`DECISIONS.md`](../DECISIONS.md) (polish program, octahedral lab-only, far-tree note).
- Precedent to mirror: [`tools/bake-placement.mjs`](../tools/bake-placement.mjs) + [`js/world/placementManifest.js`](../js/world/placementManifest.js) + [`tests/placement-manifest.spec.js`](../tests/placement-manifest.spec.js).
- [EARS notation](https://kiro.dev/docs/specs/).
