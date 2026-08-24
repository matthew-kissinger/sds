# Treeline assets and placement

This candidate lane adapts two complete tree silhouettes from mehrasaur's
CC0 Fox Trees Pack. It preserves each source's wood and foliage proportions,
then replaces every source material with Herd's shared TSL canopy and wood
materials. No source texture, runtime model loader or generator ships.

`procedural-manifest.json` is the exact source ledger. The committed OBJ and
MTL pairs remain editable and their SHA-256 hashes, first-party page, archive,
license snapshot, generated JSON and deterministic recipe are recorded there.

## Reproducing the candidates

```powershell
node tools/bake-sourced-tree-candidates.mjs
npm run bake:placement
```

The bake separates source foliage and wood groups, normalizes the complete
tree in one shared frame and applies only a small downward foliage tuck to bury
the central branch junction. Runtime variation is deterministic whole-tree
yaw and proportional scaling from the committed placement manifest.

The active Spreading candidate contains 160 foliage and 164 wood triangles. The
field contains 209 full-tree instances and 153 shrubs, submitting 116,676
triangles before pooled shadows in three instanced draws. Shadows add the
fourth treeline draw. The active candidate uses zero textures and zero runtime
model loads.
