# Cycle 20 Phase 2 — Kiln impostor color/hue/glint handoff

> Pause point 2026-05-04. Live impostors look better than session-start but not equal to LOD0 at all camera angles + distances. Matt: "classic looks bad and it is worse the higher up it goes." Follow mode is acceptable.
>
> The next session should build a proper optical sandbox before continuing to tune. This doc captures every diagnosis, fix, and dead-end so we don't re-walk them.

## What you're inheriting

- ✅ Tile-pick math correct (4×4 lat-lon barycentric blend over the kiln atlas; matches Pixel Forge bake)
- ✅ Spherical billboard with world-up lock (was cylindrical → fixed Cycle 20 v2)
- ✅ Frustum-sized runtime quad (was bbox-max-dim → fixed Cycle 20 v2; tree was 70% of true size before)
- ✅ Tonemap + sRGB output via `toneMapped: true` chunks
- ✅ Half-Lambert wrap + albedo-tinted hemi ambient (Valve / IceFall foliage recipe — Cycle 20 v4)
- ✅ Mipmaps disabled on atlases (cross-tile bleed glint — Cycle 20 v5)
- ⚠️ Anisotropy = 8 (compromise; aniso=1 looked grey, aniso=8 still has subtle glint at extreme zoom + high pitch)
- ⚠️ Half-texel UV clamp inside tiles (untested addition — shipped 2026-05-04, may not be sufficient)
- ❌ **Hue mismatch** — impostors slightly off-color vs LOD0
- ❌ **Brightness mismatch** — impostors slightly darker vs LOD0
- ❌ **Glint at extreme zoom + classic camera high pitch** — texel undersampling without mipmaps
- ❌ **No PBR specular** — LOD0 leaves are MeshStandardMaterial roughness=1 metalness=0; my impostor is pure Lambert. Schlick fresnel + GGX lobe missing.

## Where the code lives

- [`js/kiln-impostor-material.js`](../js/kiln-impostor-material.js) — the runtime shader. All the impostor lighting math is in this file.
- [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) `setImpostorTint()` — per-frame uniform updates from `atmosphere.sun` + `atmosphere.ambientLight`.
- [`js/main.js`](../js/main.js) — calls `setImpostorTint` once per render frame, also exposes `window.__sds.{sceneManagerRef, atmosphereRef, terrainBuilderRef}` for live introspection.
- [`tools/lod-color-match.html`](../tools/lod-color-match.html) — first-pass optical sandbox. **Insufficient — see "Sandbox v2 design" below.**
- [`assets/models/trees/*.imposter.{png,normal.png,depth.png,json}`](../assets/models/trees/) — the bake artifacts. 4×4 atlas, 512px tiles. Re-bake with `npm run bake-tree-impostors`.

## Bugs diagnosed + fixes shipped this session

### Cycle 20 v1 — original ship (commit `dbcc06d`)

Got the kiln pipeline integrated. Cylindrical billboard, plain Lambert. **Foliage looked thin slice in classic camera, ~70% size of LOD0.**

### Cycle 20 v2 — geometry fixes

- **Spherical billboard with world-up lock** ([kiln-impostor-material.js:174-188](../js/kiln-impostor-material.js)). Quad always faces camera in 3D, never goes edge-on at high pitch. Closes Cycle 19.5 carryover #2.
- **Frustum-sized quad** ([kiln-impostor-material.js:528-547](../js/kiln-impostor-material.js)). `frustumHalf = sqrt(dx² + dy² + dz²) / 2 × 1.02` matches Pixel Forge's `bake.ts:444 boundsRadius * 1.02`. Tile content now maps 1:1 to runtime quad.
- **Bbox-center anchor on all three axes** (was just yOffset).

### Cycle 20 v3 — first lighting pass

Added `/π` (BRDF_Lambert), tonemapping, intensity multiply. **Trees became too dark + greyish at distance.**

### Cycle 20 v4 — foliage lighting recipe

Two parallel research agents ran. Findings:
- **Production engines** (UE5 Impostor Baker, Megascans, SpeedTree) DON'T use pure Lambert on baked impostors. They use a foliage-specific BRDF: half-Lambert wrap + albedo-tinted hemi ambient + optional subsurface floor.
- **Three.js MeshLambertMaterial formula**: `reflected = (saturate(N·L) × lightColor + ambientLightColor) × diffuseColor / π`.
- **@three.ez/octahedral-impostor** uses pure Lambert and has the same "grey at distance" problem we have. Not a useful reference.

Applied:
- **Half-Lambert wrap** `pow(saturate(N·L * 0.5 + 0.5), uWrapPow)` ([kiln-impostor-material.js:367](../js/kiln-impostor-material.js))
- **Hemispheric ambient** with `mix(uGroundBounceColor, uAmbientColor, hemiBlend)` — albedo multiplied via BRDF
- **uSubsurfaceLift** uniform (defaulted 0.0 — measured at 0.15 it caused +13 luma over LOD0)
- **Tuned at noon in sandbox**: dE 30 → 16, dLuma +16 → +1

### Cycle 20 v5 — texture filtering

- **Disabled mipmaps** on atlas textures ([kiln-impostor-material.js:602](../js/kiln-impostor-material.js)). Three's box-mip generator averages across tile boundaries; adjacent tiles in the lat-lon atlas are different views → pseudo-specular sparkle at distance. Big visible improvement on glints.
- **Anisotropy 8** (kept). aniso=1 left distant impostors washed-out grey. aniso=8 is compromise.
- **Half-texel UV clamp inside tile bounds** ([kiln-impostor-material.js:259-278](../js/kiln-impostor-material.js)) — bilinear sampling at tile edges should no longer reach across tile boundaries. **Untested in-game as of pause.**

## Why classic camera + high pitch is the worst case

Classic camera mode at maxZoom puts the camera at distance 150 with a 45° pitch:
- Many trees fall into the LOD2 (impostor) zone (>100m)
- The camera looks DOWN at the impostors at a steep angle
- The runtime quad faces the camera (spherical billboard), so it's foreshortened along its azimuth-tile axis on screen
- At the impostor's screen-pixel resolution (5-15px), the GPU undersamples the 512px tile texture
- Without mipmaps: bilinear can only average 4 texels per fragment → aliasing + flicker
- With aniso 8: averages along one axis but not perpendicular → still misses much of the tile content
- With mipmaps: cross-tile bleed → glint

This is a fundamental texture-sampling bandwidth problem for distance + pitch.

## Diagnosis: what's still wrong with color/hue

Live game uniform values measured via `window.__sdsImpostorProbe` in golden-hour OC:
```
uSunColor   = (1.0, 0.687, 0.352)        // strong warm orange
uAmbientColor = (0.276, 0.217, 0.131)    // dim warm-tan
uGroundBounceColor = (0.117, 0.076, 0.036)  // dimmer warm
sunDir.y = 0.37                           // 22° elevation
```

LOD0 leaf material: **MeshStandardMaterial** roughness=1 metalness=0 with map (sRGB). Per-tree color×map varies (tree1 yellow `(1, 0.96, 0.12)`, others muted).

What our impostor doesn't have that LOD0 does:
1. **PBR specular term**: GGX lobe + Schlick fresnel × ~5-10% of lit-side brightness. Mildly cool-shifted at glancing angles (Schlick fresnel formula). Could explain the warm-bias mismatch.
2. **Per-pixel multiscatter normals**: LOD0's normals come from tangent-space normalmap × geometry normals. Each fragment a unique normal. Our impostor: one bake-time normal per pixel, mipmap-style averaged at distance.
3. **Three.js's full lighting pipeline**: directional + ambient + (potentially) hemisphere + (potentially) light probe. Currently sun + ambient only.

The "still has a hue" impression is most likely the **missing fresnel rim** — it's what gives LOD0 trees a subtle cool edge that our pure-Lambert impostor lacks.

## Sandbox v2 design (for next session)

The current `tools/lod-color-match.html` only tests one scene at one distance at one camera pitch with one time-of-day. Insufficient. Required upgrades:

### What to test (matrix)

| Variable | Values |
|---|---|
| Scene | field (noon), rolling-hills (dusk), open-country (golden-hour) |
| Camera mode | classic (45° pitch), follow (~26° pitch), free overhead (70° pitch) |
| Distance | LOD0 zone (50m), LOD swap (100m), mid impostor (150m), far impostor (250m) |
| Tree species | tree1, tree2, pine |
| Time of day | each scene's default + noon (high sun) + dusk (warm low sun) + overcast |

That's 3 × 3 × 4 × 3 × 4 = **432 cells**. Doesn't all need explicit testing, but the sandbox should let an operator step through them.

### Sandbox capabilities required

1. **Real atmosphere setup** — instantiate `Atmosphere` from `js/atmosphere/Atmosphere.js`, apply preset by name. Currently the sandbox uses hardcoded `(1, 1, 1)` sun + `2.2` ambient — this misled me into thinking dE=16 at noon meant the live game was fine.
2. **Real fog** — the SDS atmosphere applies FogExp2 with per-preset density + color. Far impostors get fog'd.
3. **Atmosphere preset switcher** — dropdown for `noon`/`dusk`/`overcast`/`dawn`/`golden-hour`.
4. **Camera modes that match the game** — Classic offset `(0, distance, -distance)` (45° pitch), Follow at `(0, 11, -22)` (26° pitch). Drive via `CameraController` if possible.
5. **Distance/pitch ramp** — slider to dolly the camera from 50m → 250m so you can SEE the LOD0→LOD2 transition.
6. **Side-by-side LOD0 + impostor** — currently does this. Keep.
7. **Multi-pixel sampler** — sample 25 pixels in a 5×5 grid across the canopy of each tree, return mean RGB. Single-pixel sampling at the canopy center is too noisy (one bake pixel could be lit, neighboring pixel dark).
8. **A/B brightness equalizer** — compute the per-channel ratio impostor/LOD0, output as a uniform calibration vector (so we can see "if we multiplied impostor by `(0.95, 1.0, 1.10)` it'd match exactly").
9. **Per-tree per-preset-time test report** — a button that runs all distance × pitch × preset combinations, takes screenshots, computes deltas, dumps to `cycle20-validation/sandbox-matrix.json`.
10. **Force ALL trees to LOD0 or all to LOD2** — currently in-game LOD selection is per-instance per-frame. Need a way to force one mode in the sandbox so we can compare apples-to-apples on identical instance pose.

### Implementation hint

Don't try to instantiate the full SDS game. Instead:

1. Import `Atmosphere`, `loadKilnImpostor` from the SDS source. Build a minimal scene with `THREE.Scene`, two trees side by side, atmosphere bound to scene.
2. For LOD0: load the same GLB the game does (`assets/models/trees/{name}.glb`), apply the wind shader patch (`_patchTreeWindMaterial`) for parity.
3. For impostor: use `loadKilnImpostor(...)`, wrap in InstancedMesh with 1 instance.
4. Drive both with the same atmosphere — call `setImpostorTint` per frame on the impostor material with the same intensity values atmosphere.sun + atmosphere.ambientLight have.

### What the sandbox needs to PROVE before tuning code

The fastest way to make progress: instead of guessing what's wrong, MEASURE the gap then build the fix to match.

1. Sandbox boots OC scene with golden-hour preset, camera at classic 150m (matches Matt's screenshot).
2. Sample LOD0 leaf center pixel. Sample impostor leaf center pixel.
3. Report dE, dLuma, dRGB per channel.
4. Repeat at 50m, 100m, 200m. Plot delta vs distance.
5. Repeat at follow pitch (26°) and overhead (70°). Plot delta vs pitch.

The measurements will tell us:
- Is the hue gap constant with distance? (→ lighting math issue)
- Does it grow with distance? (→ sampling/aniso issue)
- Does it grow with pitch? (→ billboard/spherical math issue)
- Different at golden-hour vs noon? (→ time-of-day-dependent)

Each "yes" answer points at a different fix.

## Specific things to try in next session

In order of expected impact, NOT yet tried:

1. **Add Schlick fresnel rim term** to the impostor shader. `fresnel = pow(1 - max(dot(N, V), 0), 5.0); reflected += fresnel × uSunColor × 0.04`. This is what MeshStandard implicitly does at metalness=0. ~10 LOC. May close the hue mismatch.

2. **Generate per-tile mipmaps with edge padding**. Currently disabled. Padding 16px around each tile, generated mipmaps stay within tile. Implementation: build a separate atlas at bake time with `2px tile padding × 2^mipLevel` for the deepest mip. Or do it in-shader via manual `textureLod` with UV clamping (already half-done with the half-texel clamp).

3. **Switch the impostor material to extend MeshLambertMaterial via onBeforeCompile**. Inherit Three's full lighting (multiple lights, hemi, fog, shadow if applicable). Brittle but eliminates "what's missing from my custom shader" guesswork.

4. **Add a calibration multiplier uniform** `uMatchBoost = (r, g, b)` that's tuned per-preset. Cheap workaround if structural fixes don't fully match.

5. **Re-bake with smaller tiles** (256px) so undersampling at distance is less severe. 1024×1024 atlas instead of 2048×2048. Sidecar update needed.

6. **Bake an additional "indirect bounce color" auxiliary atlas** (UE5 SSS-channel approach). Captures the per-tile color of a leaf that's NOT directly lit. Multiply into shadow side at runtime. The Pixel Forge bake already supports custom aux layers (it has normal + depth).

## Debug surfaces available

When dev server is running, these globals are populated:

```js
window.__sds.sceneManagerRef     // SceneManager instance
window.__sds.atmosphereRef        // Atmosphere instance
window.__sds.terrainBuilderRef    // TerrainBuilder instance
window.__sdsImpostorProbe         // {input, live, count, scene, trees, kilnMaterial}
```

You can introspect uniforms, walk scene, etc. from `playwright_evaluate` or the browser console without launching a separate harness.

## Visual references in this session

Numbered by chronological order of capture, all at `cycle20-validation/phase2v2/`:

| File | What it shows |
|---|---|
| `04-classic-final.jpeg` | v2 baseline (cylindrical → spherical, frustum size fix) |
| `05-classic-bright.jpeg` | v3 too-bright/over-warm |
| `08-classic-recip-pi.jpeg` | v3 with /π — too dim, greyish |
| `10-game-v4d.jpeg` | v4d (half-Lambert + hemi). Looks ~good at noon. |
| `11-no-mips-classic.jpeg` | v5 no-mipmaps. Best so far. |
| `13-no-mips-field.jpeg` | v5 in field — still pale at extreme distance |
| `14-no-aniso-classic.jpeg` | aniso=1 — much worse. **Don't ship this.** |
| `15-aniso8-maxzoom-classic.jpeg` | back to aniso=8. Last image of session. |

Matt's user-supplied screenshots showed darker / more-glinted than `15-aniso8-maxzoom-classic.jpeg` — possibly captured before the no-mipmaps fix landed. Worth re-validating against current built code.

## Sign-off state

- 186/186 tests pass
- Production build clean (812.93 KB main / 242.36 KB gzip)
- Code shipped in working tree but **not committed** — review the diff before commit so half-texel UV clamp can be evaluated.
- Vite dev server running on port 3000 (cmd.exe wrapper) at session pause; safe to kill.
