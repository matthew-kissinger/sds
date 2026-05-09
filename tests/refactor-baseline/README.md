# Refactor baseline

Characterization-test goldens captured BEFORE the Cycle 28 Stream B
god-module decomposition. Regression-detect mesh and scatter behaviors
that the existing `tests/sim-baseline/` fixtures don't cover.

## What's in here

- **`harness.js`** — pure JS harness that loads each scene's heightfield from `public/terrain/<scene>.bin`, samples a fixed grid, hashes the result; runs `generateTrees(scene, mulberry32(0xC25))` and hashes the output; reads `dist/assets/main-*.js` + `three-*.js` byte sizes after build.
- **`baseline.spec.ts`** — vitest spec that asserts harness output matches the committed fixtures.
- **`__fixtures__/terrain-mesh-hash.json`** — heightfield-grid hash per scene.
- **`__fixtures__/scatter-positions.json`** — tree-position hash per scene + count + seed.
- **`__fixtures__/bundle-sizes.json`** — `mainKB` + `threeKB` recorded post-build.

## Regenerating fixtures

After an intentional refactor:

```bash
UPDATE_FIXTURES=true npm test -- refactor-baseline
```

Then review the diff. If the change is intentional, record the decision in the active cycle plan's Acceptance section before committing the regenerated fixtures.

**Don't regenerate as a shortcut to make tests pass.** Same discipline as the sim-baseline fixtures — read the diff, decide, regenerate with the decision recorded.

## What's NOT covered (yet)

- **Rock placement.** The current `TerrainBuilder.addEnvironmentDetails()` uses `Math.random()` directly, so a rock-position golden would just lock in arbitrary call-order state, not be deterministic. Phase B2 extracts rock placement to `js/world/RockPlacement.js` with an injected seed; the rock-position golden is added there, under the same regression discipline.
- **Mesh vertex positions.** The actual Three.js `BufferGeometry` produced by `TerrainBuilder.createTerrain()` is sampled here at the heightfield level (the underlying source). The 256² mesh's exact positions/normals/UVs depend on render-time Three.js state and aren't easy to capture in a Node-only vitest run. The heightfield-grid hash is the load-bearing characterization: if the heightfield samples the renderer consumes change, the mesh y-values change.

## When this file outlives its usefulness

Once Stream B (B0–B5) lands and is committed, these goldens become standing regression guards on `js/boot/` and `js/world/` — they don't need to be retired. If a future cycle moves placement logic again, run the tests under the existing fixtures first; if the move is correct, the hashes match.
