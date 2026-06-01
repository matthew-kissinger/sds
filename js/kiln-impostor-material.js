import * as THREE from 'three';
import { createKonveyorImpostorMaterial } from './konveyorImpostorMaterialAdapter.js';

/**
 * Cycle 20 Phase 2 — Kiln impostor material (replaces octahedral-impostor-material.js).
 *
 * Consumes the offline-baked Pixel Forge / Kiln atlas + sidecar pair
 * (`assets/models/trees/<name>.imposter.{png,normal.png,depth.png,json}`),
 * produced by `npm run bake-tree-impostors`.
 *
 * Improvements over the Cycle 18 runtime octahedral baker:
 *
 *   - **Per-fragment relighting** via the normal aux atlas. Decodes the
 *     capture-view-space normal, transforms back to object space using
 *     each picked tile's view rotation, blends across 3 tiles, dot-with-
 *     sun-direction. Replaces the `tex.rgb * uColor` global tint hack.
 *
 *   - **3-tile barycentric blend** across the lat/lon (azimuth, elevation)
 *     cell. Closes Bug 3 (single-tile pick → visible azimuth-step at
 *     90° boundaries). Triangulation: cell split along the TR-BL diagonal
 *     (u + v < 1 ? upper-left triangle TL/TR/BL : lower-right TR/BR/BL).
 *
 *   - **Anchor via sidecar `bbox` center**. Quad sized in object
 *     space to the BAKE FRUSTUM (= boundsRadius × 2 × 1.02 from the bbox
 *     diagonal, matching Pixel Forge's `bake.ts:444-447`). Anchored at
 *     bbox center on all three axes — same point Pixel Forge's bake
 *     camera looks at. Cycle 20 v2 fix: previous code used
 *     `worldSize = max(bbox dims)` from the sidecar, which is the bbox
 *     longest axis — but the bake frustum is sized to the bounding
 *     SPHERE (covers any rotation). Quad-vs-frustum mismatch drew the
 *     tree at ~70% of true size. Now matches the frustum exactly.
 *
 *   - **Spherical billboard (camera-facing in 3D, world-up locked)**.
 *     Cycle 20 v2 fix: previous cylindrical (Y-axis only) billboard
 *     foreshortened cos(camera_pitch) — Classic camera at 45° pitch
 *     drew impostors at 71% height; cinematic overhead drew them
 *     edge-on as a "thin slice." Spherical-with-up-lock orients the
 *     quad against (worldUp × viewDir) so it always faces the camera
 *     in 3D without rolling when the camera yaws. The tile-pick
 *     content already encodes the angle-dependent silhouette, so
 *     drawing it onto a camera-facing quad presents it without
 *     geometric distortion.
 *
 *   - **Parallax depth offset + depth-discard ghost suppression**:
 *     scaffolded as uniforms `uParallaxScale` (0 = disabled) and
 *     `uDepthDiscardThr` (1 = disabled). Phase 2 ships v1 with parallax
 *     OFF; tune up per optical Layer F findings. Atlas already includes
 *     the depth aux layer — no re-bake required to enable.
 *
 * SDS-specific constraints:
 *
 *   - The runtime is InstancedMesh2 (@three.ez/instanced-mesh). Custom
 *     ShaderMaterial vertex shaders MUST `#include <batching_pars_vertex>`
 *     + `#include <batching_vertex>` so `getInstancedMatrix()` is in
 *     scope when `USE_INSTANCING_INDIRECT` is defined. Cycle 18 finding;
 *     forgetting these silently collapses LOD2 to nothing.
 *
 *   - `<fog_pars_vertex>` + `<fog_vertex>` chunks need the local symbol
 *     `mvPosition` to compile against strict drivers (SwiftShader on
 *     headless CI). Cycle 18 finding (commit `d0fcb66`).
 *
 *   - Locked to tilesX = tilesY = 4 (Q2 verdict — Phase 0). Future
 *     8×4 escalation requires bumping uAzimuths.length + the cell-pick
 *     loop bounds.
 */

const TILES_X = 4;
const TILES_Y = 4;

const VERTEX_SHADER = /* glsl */`
uniform vec4 uAzimuths;          // length-4, ascending; matches sidecar.azimuths
uniform vec4 uElevations;        // length-4, descending; matches sidecar.elevations
uniform vec3 uTreeOriginObj;     // bbox center in object space (matches bake camera target)
uniform vec3 uSunDirWorld;

varying vec2 vUv;
varying vec3 vT0;                // (azIdx, elIdx, weight) for picked tile 0
varying vec3 vT1;                // ... tile 1
varying vec3 vT2;                // ... tile 2
varying vec3 vSunDirObj;         // sun direction transformed into instance-object space
varying vec3 vViewDirObj;        // camera direction in instance-object space (parallax input)

#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>

void main() {
  // InstancedMesh2 routes per-instance matrices through a matricesTexture
  // + getInstancedMatrix() — these chunks pull both into scope.
  #include <batching_vertex>

  // Decompose instanceMatrix (column-major). Same approach as the Cycle
  // 18 octahedral shader — uniform scale assumed at the placement site
  // (trees are placed with Vector3(s, s, s) scale).
  vec3 col0 = instanceMatrix[0].xyz;
  vec3 col1 = instanceMatrix[1].xyz;
  vec3 col2 = instanceMatrix[2].xyz;
  vec3 trans = instanceMatrix[3].xyz;
  float scaleVal = length(col0);
  mat3 instRot = mat3(col0 / scaleVal, col1 / scaleVal, col2 / scaleVal);

  // Per-instance origin in world space — bbox center, not trunk base.
  vec3 originLocal = trans + (instRot * uTreeOriginObj) * scaleVal;
  vec3 originWorld = (modelMatrix * vec4(originLocal, 1.0)).xyz;

  // Camera direction in world + object space. Object-space dir feeds the
  // tile pick (so per-instance Y-rotation rotates which face is shown);
  // world dir feeds the spherical-billboard quad orientation.
  vec3 dirWorld = cameraPosition - originWorld;
  mat3 modelRot = mat3(modelMatrix);
  mat3 worldFromObj = modelRot * instRot;
  vec3 dirObj = transpose(worldFromObj) * dirWorld;
  if (length(dirObj) < 1e-4) dirObj = vec3(0.0, 0.0, 1.0);
  dirObj = normalize(dirObj);
  vViewDirObj = dirObj;

  // Sun direction in object space — fragment shader does dot(N_obj, sunObj),
  // saving a per-fragment world-rotate of the blended normal.
  vSunDirObj = transpose(worldFromObj) * uSunDirWorld;

  // Tile pick: lat/lon cell + barycentric weights.
  float TWO_PI = 6.28318530718;
  float az = atan(dirObj.z, dirObj.x);
  if (az < 0.0) az += TWO_PI;
  float el = clamp(asin(clamp(dirObj.y, -1.0, 1.0)), 0.0, 1.5707963);

  // Azimuth cell: uniform 2π / tilesX step. azI in [0, tilesX-1].
  float tilesX = ${TILES_X.toFixed(1)};
  float azStep = TWO_PI / tilesX;
  float azFloat = az / azStep;
  float azI = floor(azFloat);
  float u = azFloat - azI;
  azI = mod(azI, tilesX);
  float azI2 = mod(azI + 1.0, tilesX);

  // Elevation cell — search the 4-row table. Top row (elJ=0) is highest.
  // For SDS gameplay (camera ~1-4° elevation), elJ ends up at 2 with
  // v ≈ 1 almost always — we still handle the full range for cinema /
  // hilltop-to-valley views.
  float elJ;
  float v;
  if (el >= uElevations.x) {
    elJ = 0.0; v = 0.0;
  } else if (el >= uElevations.y) {
    elJ = 0.0; v = (uElevations.x - el) / (uElevations.x - uElevations.y);
  } else if (el >= uElevations.z) {
    elJ = 1.0; v = (uElevations.y - el) / (uElevations.y - uElevations.z);
  } else if (el >= uElevations.w) {
    elJ = 2.0; v = (uElevations.z - el) / (uElevations.z - uElevations.w);
  } else {
    elJ = 2.0; v = 1.0;
  }

  // Triangle split along the TR-BL diagonal (u + v = 1).
  // Triangle A (upper-left): TL, TR, BL with weights (1-u-v, u, v).
  // Triangle B (lower-right): TR, BR, BL with weights (1-v, u+v-1, 1-u).
  if (u + v < 1.0) {
    vT0 = vec3(azI,  elJ,        1.0 - u - v);
    vT1 = vec3(azI2, elJ,        u);
    vT2 = vec3(azI,  elJ + 1.0,  v);
  } else {
    vT0 = vec3(azI2, elJ,        1.0 - v);
    vT1 = vec3(azI2, elJ + 1.0,  u + v - 1.0);
    vT2 = vec3(azI,  elJ + 1.0,  1.0 - u);
  }

  vUv = uv;

  // Pitch-aware billboard with world-up lock. The bake camera always uses
  // up=(0,1,0); the runtime quad's "up" is the camera-up projected onto
  // the plane perpendicular to viewDir.
  //
  // Cycle 23 Phase A1: smoothstep from CYLINDRICAL (worldUp) to SPHERICAL
  // (cross(viewDir, billRight)) as |dirObj.y| crosses ~0.2-0.7. At low
  // camera elevation (Follow cam, ~0° dirObj.y), trees stand upright with
  // vertical billboards so trunks read as vertical lines and the canopy
  // doesn't read as a horizontal smear. At high pitch (Classic / cinematic
  // overhead), the billboard tilts toward camera-facing-in-3D so the quad
  // doesn't render edge-on. Closes Cycle 19.5 carryover #2(b).
  vec3 viewDir = dirWorld;
  float vdLen = length(viewDir);
  viewDir = vdLen > 1e-4 ? viewDir / vdLen : vec3(0.0, 0.0, 1.0);

  vec3 worldUp = vec3(0.0, 1.0, 0.0);
  vec3 billRight = cross(worldUp, viewDir);
  float rLen = length(billRight);
  // Degenerate when viewing straight down (viewDir parallel to worldUp).
  // Pick any horizontal axis; Up follows from the cross.
  billRight = rLen > 1e-4 ? billRight / rLen : vec3(1.0, 0.0, 0.0);
  vec3 billUpSpherical = cross(viewDir, billRight);
  float pitchT = smoothstep(0.2, 0.7, abs(dirObj.y));
  vec3 billUp = normalize(mix(worldUp, billUpSpherical, pitchT));

  vec3 vertexWorld = originWorld
    + billRight * (position.x * scaleVal)
    + billUp    * (position.y * scaleVal);

  vec4 mvPosition = viewMatrix * vec4(vertexWorld, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`;

const FRAGMENT_SHADER = /* glsl */`
uniform sampler2D uAtlas;
uniform sampler2D uNormal;
uniform sampler2D uDepth;
uniform vec4 uAzimuths;
uniform vec4 uElevations;
uniform vec3 uSunColor;          // pre-multiplied by sun.intensity
uniform vec3 uAmbientColor;      // pre-multiplied by ambient.intensity (sky-side fill)
uniform vec3 uGroundBounceColor; // ground-bounce ambient tint, pre-multiplied
uniform float uWrapPow;          // half-Lambert wrap exponent (1.0 = standard, 1.5 = more contrast)
uniform float uSubsurfaceLift;   // chromatic floor magnitude (0..0.5, foliage-typical 0.10-0.20)
uniform float uFresnelStrength;  // Schlick rim term magnitude (0 = disabled; 0.04 ≈ MeshStandard metalness=0)
uniform float uAlphaTest;
uniform float uAlphaHashScale;      // Cycle 22 Phase B; 0 = disabled, 1 = full dither
uniform float uParallaxScale;       // 0 = disabled (v1 default)
uniform float uDepthDiscardThr;     // 1 = disabled (v1 default; tune to ~0.15 to enable)

varying vec2 vUv;
varying vec3 vT0;
varying vec3 vT1;
varying vec3 vT2;
varying vec3 vSunDirObj;
varying vec3 vViewDirObj;

#include <common>
#include <packing>
#include <fog_pars_fragment>
// tonemapping_pars_fragment + colorspace_pars_fragment are auto-injected
// by Three WebGLProgram when toneMapped:true + the renderer outputColorSpace
// requires conversion. Including them manually here caused duplicate
// function definitions on compile (Cycle 20 v2 finding 2026-05-04).

// Cycle 22 Phase B: screen-space hashed alpha test. Mirrors the trick Three's
// built-in alphahash chunk uses (3D screen-space hash → per-fragment threshold)
// but written inline since this is a custom ShaderMaterial without Three's
// auto chunk injection. The result is a dithered crossfade band over the
// alpha-edge taper of the impostor billboard, matching alphaHash on the LOD0
// + LOD1 leaf MeshStandardMaterials so the LOD0→LOD1→impostor handoff reads
// uniformly stochastic. uAlphaHashScale=0 falls back to hard alphaTest.
float kilnHash2D(vec2 v) {
  return fract(1.0e4 * sin(17.0 * v.x + 0.1 * v.y) * (0.1 + abs(sin(13.0 * v.y + v.x))));
}
float kilnAlphaThreshold(vec3 viewPos) {
  // Drive the threshold from screen-space derivative of the view-space
  // position, so the dither pattern stays roughly stable in pixel-space
  // (no shimmer when camera moves slowly through near-equal alpha).
  float h = kilnHash2D(floor(gl_FragCoord.xy));
  return clamp(uAlphaTest + (h - 0.5) * uAlphaHashScale, 0.001, 0.999);
}

const float TILES_X = ${TILES_X.toFixed(1)};
const float TILES_Y = ${TILES_Y.toFixed(1)};
const vec2  TILE_SCALE = vec2(1.0 / TILES_X, 1.0 / TILES_Y);

float pickFromVec4(vec4 v, float idx) {
  if (idx < 0.5) return v.x;
  if (idx < 1.5) return v.y;
  if (idx < 2.5) return v.z;
  return v.w;
}

// Per-tile rotation: capture-view → object space.
// Capture camera placed at dirCapture(az,el) from origin, looking back at
// origin with up=(0,1,0). View basis: viewZ = dirCapture, viewX =
// normalize(world_up × viewZ), viewY = viewZ × viewX.
mat3 captureRotForTile(float azIdx, float elIdx) {
  float az = pickFromVec4(uAzimuths, azIdx);
  float el = pickFromVec4(uElevations, elIdx);
  float ce = cos(el), se = sin(el);
  float ca = cos(az), sa = sin(az);
  vec3 viewZ = vec3(ca * ce, se, sa * ce);
  vec3 viewX = normalize(cross(vec3(0.0, 1.0, 0.0), viewZ));
  vec3 viewY = cross(viewZ, viewX);
  return mat3(viewX, viewY, viewZ);
}

// Atlas UV for a tile + tile-local UV. Atlas has top row = highest
// elevation (elIdx = 0); image-Y axis ascends to the bottom in normal UV
// space, but Three.js auto-flips loaded textures to make uv.y=0 = bottom
// of image. So tile (azIdx=0, elIdx=0) sits at uv.y high; we map elIdx=0
// to the top by inverting. Sidecar's tilesY=4, so the top row's UV.y range
// is [3/4, 4/4].
//
// Cycle 20 v5 (2026-05-04): UV clamped to half-texel INSIDE tile bounds so
// bilinear sampling at tile edges cannot reach across to the neighbour
// tile. Without this clamp, fragments near uvLocal=0 or 1 read 50% of
// adjacent-tile content via bilinear — produces glints / hue shifts
// because adjacent tiles are completely different views (azimuth or
// elevation neighbours). 0.5/atlasW = 0.5/2048 ≈ 0.000244 inset per axis.
const float HALF_TEXEL_U = 0.5 / 2048.0;  // atlas is 4 tiles × 512px square
const float HALF_TEXEL_V = 0.5 / 2048.0;

vec2 atlasUvForTile(float azIdx, float elIdx, vec2 uvLocal) {
  vec2 base = vec2(azIdx * TILE_SCALE.x, (TILES_Y - 1.0 - elIdx) * TILE_SCALE.y);
  // Clamp uvLocal to [HALF_TEXEL/TILE_SCALE, 1 - HALF_TEXEL/TILE_SCALE] so the
  // resulting global UV stays at least half a texel inside the tile.
  vec2 inset = vec2(HALF_TEXEL_U / TILE_SCALE.x, HALF_TEXEL_V / TILE_SCALE.y);
  vec2 uvLocalClamped = clamp(uvLocal, inset, vec2(1.0) - inset);
  return base + uvLocalClamped * TILE_SCALE;
}

struct TileSample {
  vec3 albedoPremul;   // albedo × alpha (for correct edge-aware blend)
  float alpha;
  vec3 normalCaptureView;  // [-1, 1]^3 in capture-view space
  float depth;             // [0, 1] from MeshDepthMaterial RGBADepthPacking
};

TileSample sampleTile(float azIdx, float elIdx, vec2 uvLocal, mat3 captureRot) {
  vec2 baseUv = atlasUvForTile(azIdx, elIdx, uvLocal);

  // Parallax: project view direction into tile-tangent (capture-view xy)
  // space. uParallaxScale=0 disables (v1 default). Sample depth at
  // unmodified UV, offset by parallax, then resample.
  vec2 sampleUv = baseUv;
  if (uParallaxScale > 0.0001) {
    vec3 viewInCapture = transpose(captureRot) * vViewDirObj;
    vec2 parallaxDir = viewInCapture.xy / max(abs(viewInCapture.z), 0.05);
    float d0 = unpackRGBAToDepth(texture2D(uDepth, baseUv));
    sampleUv = baseUv + parallaxDir * (d0 - 0.5) * uParallaxScale;
  }

  vec4 alb = texture2D(uAtlas, sampleUv);
  vec4 nrm = texture2D(uNormal, sampleUv);
  float depthFinal = unpackRGBAToDepth(texture2D(uDepth, sampleUv));

  TileSample s;
  s.alpha = alb.a;
  s.albedoPremul = alb.rgb * alb.a;
  // Three's MeshNormalMaterial outputs (N+1)*0.5 in view space. Our view
  // space here is the per-tile capture frame.
  s.normalCaptureView = nrm.rgb * 2.0 - 1.0;
  s.depth = depthFinal;
  return s;
}

void main() {
  mat3 R0 = captureRotForTile(vT0.x, vT0.y);
  mat3 R1 = captureRotForTile(vT1.x, vT1.y);
  mat3 R2 = captureRotForTile(vT2.x, vT2.y);

  TileSample s0 = sampleTile(vT0.x, vT0.y, vUv, R0);
  TileSample s1 = sampleTile(vT1.x, vT1.y, vUv, R1);
  TileSample s2 = sampleTile(vT2.x, vT2.y, vUv, R2);

  float w0 = vT0.z;
  float w1 = vT1.z;
  float w2 = vT2.z;

  // Depth-discard ghost suppression. Disabled when uDepthDiscardThr >= 1
  // (v1 default). When enabled, drop weight on tiles whose sampled depth
  // disagrees with the median by > threshold — eliminates the double-
  // image ghost during blend.
  if (uDepthDiscardThr < 1.0) {
    float dMin = min(min(s0.depth, s1.depth), s2.depth);
    float dMax = max(max(s0.depth, s1.depth), s2.depth);
    float dMed = s0.depth + s1.depth + s2.depth - dMin - dMax;
    if (abs(s0.depth - dMed) > uDepthDiscardThr) w0 = 0.0;
    if (abs(s1.depth - dMed) > uDepthDiscardThr) w1 = 0.0;
    if (abs(s2.depth - dMed) > uDepthDiscardThr) w2 = 0.0;
    float wSumGuard = w0 + w1 + w2;
    if (wSumGuard < 1e-3) {
      // All discarded (degenerate alpha-edge case) — fall back to original.
      w0 = vT0.z; w1 = vT1.z; w2 = vT2.z;
    } else {
      float inv = 1.0 / wSumGuard;
      w0 *= inv; w1 *= inv; w2 *= inv;
    }
  }

  // Premultiplied-alpha blend (avoids dark fringes at alpha cutoffs).
  float aBlended = s0.alpha * w0 + s1.alpha * w1 + s2.alpha * w2;
  // Cycle 22 Phase B: screen-space hashed alpha test (dithered crossfade
  // band) when uAlphaHashScale > 0; hard alphaTest when 0.
  float kilnThr = uAlphaHashScale > 0.0
    ? kilnAlphaThreshold(vec3(0.0))
    : uAlphaTest;
  if (aBlended < kilnThr) discard;

  vec3 albedoPremulBlended = s0.albedoPremul * w0 + s1.albedoPremul * w1 + s2.albedoPremul * w2;
  vec3 albedoBlended = albedoPremulBlended / max(aBlended, 1e-4);

  // Decode per-tile capture-view normals into object space, then blend.
  vec3 N0 = R0 * s0.normalCaptureView;
  vec3 N1 = R1 * s1.normalCaptureView;
  vec3 N2 = R2 * s2.normalCaptureView;
  vec3 nObjBlended = N0 * w0 + N1 * w1 + N2 * w2;
  // Re-normalize; weighted-sum of unit vectors isn't unit-length.
  float nLen = length(nObjBlended);
  vec3 N_obj = nLen > 1e-4 ? nObjBlended / nLen : vec3(0.0, 1.0, 0.0);

  // Foliage-specific lighting model — research-backed (see Cycle 20 v4
  // 2026-05-04). Three primitives, each chosen for chromatic preservation:
  //
  // 1) HALF-LAMBERT WRAP. pow(N.L * 0.5 + 0.5, k) — Valve foliage
  //    standard. Replaces saturate(N.L) so even back-facing leaves get
  //    50% sun. Avoids the grey-shadow-side failure mode of pure
  //    Lambert. k=1 (standard) softens, k=1.5 retains some contrast;
  //    tunable via uWrapPow.
  //
  // 2) HEMISPHERIC AMBIENT WITH ALBEDO-TINTED GROUND BOUNCE. Top of canopy
  //    (N.y to +1) gets uAmbientColor (sky-side, neutral). Bottom (N.y
  //    to -1) gets uGroundBounceColor * albedo — the ground-bounce term
  //    multiplies albedo so the underside picks up its OWN color back,
  //    matching how MeshLambertMaterial diffuse retains saturation via
  //    BRDF_Lambert(diffuseColor). Cures shadow-side-goes-grey without
  //    half-Lambert blunt lift.
  //
  // 3) SUBSURFACE FLOOR. albedo * uSubsurfaceLift added unconditionally
  //    (no N.L gate) — un-darkenable chromatic floor mimicking foliage
  //    SSS / leaf translucency. Small (0.15 default) so it doesn't wash
  //    directional shading.
  //
  // Energy conservation: BRDF_Lambert (1/π) applied to the direct term
  // only — the hemispheric + subsurface terms are already in irradiance
  // space (pre-multiplied by intensity in setImpostorTint).
  // Match Three's MeshLambertMaterial structurally: irradiance flows through
  // BRDF_Lambert(albedo) = albedo / pi. We modify only the irradiance
  // computation — keeping the BRDF applied uniformly preserves chroma.
  //
  //   reflected = irradiance(direct) * BRDF_Lambert(albedo)
  //             + irradiance(indirect) * BRDF_Lambert(albedo)
  //             + sssFloor(albedo)
  //
  // direct.irradiance: half-Lambert wrap × sunColor (foliage standard,
  //   replaces saturate(N.L) so back-leaves still pick up some sun).
  // indirect.irradiance: hemi-blend between sky-side (uAmbientColor) and
  //   ground-bounce (uGroundBounceColor). BRDF then tints by albedo so
  //   underside leaves pick up their own color back — the IceFall
  //   chromatic-bounce trick, expressed as irradiance not as direct
  //   color injection.
  // sssFloor: small albedo-tinted constant added OUTSIDE the BRDF — a
  //   foliage-specific subsurface translucency cheat. Not part of LOD0
  //   but small enough (0.15 default) not to break parity.
  float dotNL = dot(N_obj, vSunDirObj);
  float wrap = pow(saturate(dotNL * 0.5 + 0.5), uWrapPow);
  vec3 directIrradiance = wrap * uSunColor;

  float hemiBlend = N_obj.y * 0.5 + 0.5;  // 0=down (ground bounce), 1=up (sky)
  vec3 indirectIrradiance = mix(uGroundBounceColor, uAmbientColor, hemiBlend);

  vec3 reflected = (directIrradiance + indirectIrradiance) * (albedoBlended * RECIPROCAL_PI)
                 + albedoBlended * uSubsurfaceLift;

  // Cycle 21 Phase 0 (2026-05-04): Schlick fresnel rim. LOD0 leaves use
  // MeshStandardMaterial roughness=1 metalness=0 — Three internally
  // applies a Schlick fresnel × F0=0.04 (the dielectric "metalness=0"
  // implicit reflectance) at glancing angles. Without it, our pure-
  // diffuse impostor reads warm-biased vs LOD0's subtle cool rim.
  // dotNV uses object-space view dir + blended object-space normal, so
  // the rim sits where the leaf surface looks edge-on to the camera.
  // F0=0.04 × pow5 falls off fast — at 0° incidence ~0.04, at glancing
  // ~1.0 × uFresnelStrength. Added directly to reflected as a sun-
  // colored highlight (matches Three's reflected-light direct path).
  float dotNV = max(dot(N_obj, normalize(vViewDirObj)), 0.0);
  float fresnel = pow(1.0 - dotNV, 5.0) * uFresnelStrength;
  reflected += fresnel * uSunColor;

  // Cycle 25 Phase D (2026-05-06): the per-species uMatchBoost calibration
  // vector was deleted. Phase 21's calibration LUT compensated for the
  // 4x4 atlas's sampling/bake-property delta against LOD0; with Phase B's
  // LOD seam dissolved (LOD0 holds 0-200m on desktop, alphaHash crossfade
  // 180-200m), the boost was correcting a delta that no longer biases the
  // visible silhouette. Atlas re-bake (8x4 + padded mips) deferred to a
  // real Cycle 26 — the existing 4x4 atlas stays.

  // Cycle 26 v2.0.5: atmospheric desat removed. Was a no-op since Cycle 25
  // Phase B forced uDesatStrength to 0 (the desat was hiding the LOD1
  // silhouette mismatch with LOD0; with LOD1 dropped on desktop med/high
  // the mismatch is gone). Mobile-low LOD1 unaffected — the patch had
  // already been zeroed for them too.

  gl_FragColor = vec4(reflected, aBlended);
  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * @typedef {Object} KilnImpostorParams
 * @property {THREE.Texture} albedoAtlas
 * @property {THREE.Texture} normalAtlas
 * @property {THREE.Texture} depthAtlas
 * @property {object}        sidecar     Parsed Kiln sidecar JSON (see schema.ts in pixel-forge)
 */

/**
 * @param {KilnImpostorParams} params
 * @returns {THREE.ShaderMaterial}
 */
export function createKilnImpostorMaterial({
  albedoAtlas,
  normalAtlas,
  depthAtlas,
  sidecar,
  search,
  konveyorImpostorFactories,
  tileSelectionMode,
} = {}) {
  const layoutTilesX = sidecar.tilesX ?? TILES_X;
  const layoutTilesY = sidecar.tilesY ?? TILES_Y;
  if (sidecar.layout !== 'octahedral' && (layoutTilesX !== TILES_X || layoutTilesY !== TILES_Y)) {
    console.warn(
      `[KILN] sidecar is ${layoutTilesX}×${layoutTilesY}, shader compiled for ${TILES_X}×${TILES_Y}. ` +
      `Re-bake or update the shader constants.`
    );
  }

  // Sidecar arrays are ascending azimuth + descending elevation, length 4 each.
  const azimuths = Array.isArray(sidecar.azimuths) ? sidecar.azimuths : [];
  const elevations = Array.isArray(sidecar.elevations) ? sidecar.elevations : [];
  const azPad = [
    azimuths[0] ?? 0,
    azimuths[1] ?? 0,
    azimuths[2] ?? 0,
    azimuths[3] ?? 0,
  ];
  const elPad = [
    elevations[0] ?? 0,
    elevations[1] ?? 0,
    elevations[2] ?? 0,
    elevations[3] ?? 0,
  ];

  // Anchor at the bbox center on all three axes — this is the point Pixel
  // Forge's bake camera looks at (`bake.ts:447: camera.lookAt(boundsCenter)`),
  // so the tile content is centered around it. Trees with non-zero x/z
  // offsets in their authoring (pine has x-center ≈ -0.035) align cleanly.
  // Y prefers sidecar.yOffset (already (min+max)/2, but explicit).
  const xCenter = (sidecar.bbox.min[0] + sidecar.bbox.max[0]) * 0.5;
  const yCenter = sidecar.yOffset ?? (sidecar.bbox.min[1] + sidecar.bbox.max[1]) * 0.5;
  const zCenter = (sidecar.bbox.min[2] + sidecar.bbox.max[2]) * 0.5;
  const tileSize = sidecar.tileSize ?? null;
  const atlasSize = [
    sidecar.atlasWidth ?? layoutTilesX * (tileSize ?? 512),
    sidecar.atlasHeight ?? layoutTilesY * (tileSize ?? 512),
  ];

  const uniforms = {
    ...THREE.UniformsLib.fog,
    uAtlas:           { value: albedoAtlas },
    uNormal:          { value: normalAtlas },
    uDepth:           { value: depthAtlas },
    uAzimuths:        { value: new THREE.Vector4(...azPad) },
    uElevations:      { value: new THREE.Vector4(...elPad) },
    uTreeOriginObj:   { value: new THREE.Vector3(xCenter, yCenter, zCenter) },
    uSunDirWorld:     { value: new THREE.Vector3(0.5, 0.7, 0.3).normalize() },
    // sun + ambient pre-multiplied by light intensity in setImpostorTint.
    // Defaults are sane fallbacks for the boot-frame paint.
    uSunColor:        { value: new THREE.Color(1.0, 1.0, 1.0) },
    uAmbientColor:    { value: new THREE.Color(0.7 * Math.PI, 0.7 * Math.PI, 0.7 * Math.PI) },
    // Ground-bounce ambient — irradiance value for the ground-side of the
    // hemi blend. Live updates via setImpostorTint multiply atmosphere
    // ambient by a small earth-tilt factor at half-strength. Default
    // here is a neutral 50% of sky-side magnitude, no hue tilt — so
    // the sandbox (which bypasses setImpostorTint) renders neutrally.
    uGroundBounceColor: { value: new THREE.Color().setRGB(0.35 * Math.PI, 0.35 * Math.PI, 0.35 * Math.PI) },
    // Half-Lambert wrap exponent. 1.0 = standard Valve wrap (very soft);
    // 1.5 retains slightly more directional contrast. Foliage typically
    // wants 1.0-1.5.
    uWrapPow:         { value: 1.2 },
    // Subsurface "constant glow" floor — albedo-tinted lift independent
    // of N.L. 0.10-0.20 typical for foliage; 0 disables. Cycle 20 v4
    // measured at 0.0 in the LOD-color-match sandbox: with the hemi
    // ambient already lifting shadow-side saturation, SSS pushed
    // impostor +13 luma over LOD0. Re-enable if shadow side still
    // reads grey at distance.
    uSubsurfaceLift:  { value: 0.0 },
    // Cycle 21 Phase 0 (2026-05-04): Schlick fresnel rim magnitude.
    // 0.04 matches MeshStandardMaterial's implicit F0 at metalness=0
    // (dielectric reflectance). Closes the warm-bias hue gap by
    // adding the cool-shifted edge highlight LOD0 had via Three's
    // PBR pipeline. 0 disables.
    uFresnelStrength: { value: 0.04 },
    // 0.30 instead of 0.40: alpha is bleed-padded 2px into transparent
    // neighbours by Pixel Forge so a lower test pulls in the soft fringe,
    // closing the "snappy" silhouette gap vs LOD0 geometric edges.
    uAlphaTest:       { value: 0.3 },
    // Cycle 22 Phase B: dithered alphaTest band. 0 disables; 0.30 typical
    // (threshold jitter +/-0.15 around uAlphaTest 0.3, well within the
    // 0.30-band the impostor's bleed-padded alpha taper covers). Pairs
    // with material.alphaHash=true on LOD0+LOD1 leaf MeshStandardMaterials
    // so all three LOD tiers crossfade with matching dither pattern.
    uAlphaHashScale:  { value: 0.30 },
    // v1 defaults: parallax + depth-discard scaffolded but disabled.
    // Tune via TerrainBuilder.setKilnImpostorTunables() per Layer F.
    uParallaxScale:   { value: 0.0 },
    uDepthDiscardThr: { value: 1.0 },
  };
  const materialOptions = {
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    fog: true,
    toneMapped: true,
  };
  const createDefaultMaterial = () => new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    fog: true,
    // Hook into the renderer's tone-mapping + output-colorspace pipeline
    // (ACESFilmic + sRGB on this project — see SceneManager.js:99-106).
    // Without this, our raw albedo×lit values bypass the gamma curve LOD0
    // gets and read noticeably darker / less saturated.
    toneMapped: true,
  });
  const materialResult = createKonveyorImpostorMaterial('kiln-impostor', 'createKilnImpostorMaterial', {
    createDefaultMaterial,
    search,
    factories: konveyorImpostorFactories,
    context: {
      albedoAtlas,
      normalAtlas,
      depthAtlas,
      sidecar,
      uniforms,
      shaders: {
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
      },
      layout: {
        layout: sidecar.layout ?? null,
        axis: sidecar.axis ?? null,
        version: sidecar.version ?? 1,
        // Cycle 50 Phase 2: manifest identity stamped on the sidecar. Surfaced
        // for the konveyor summary / inspector only — not a shader-math input.
        objectId: sidecar.objectId ?? null,
        variant: sidecar.variant ?? null,
        layoutId: sidecar.layoutId ?? null,
        tilesX: layoutTilesX,
        tilesY: layoutTilesY,
        shaderTilesX: TILES_X,
        shaderTilesY: TILES_Y,
        sidecarTilesX: sidecar.tilesX,
        sidecarTilesY: sidecar.tilesY,
        tileSize,
        atlasSize,
        azimuths: azPad,
        elevations: elPad,
      },
      lighting: {
        sunDirection: uniforms.uSunDirWorld.value.clone(),
        sunColor: uniforms.uSunColor.value.clone(),
        ambientColor: uniforms.uAmbientColor.value.clone(),
        groundBounceColor: uniforms.uGroundBounceColor.value.clone(),
      },
      fog: {
        color: uniforms.fogColor.value.clone(),
        near: uniforms.fogNear?.value ?? 18,
        far: uniforms.fogFar?.value ?? 92,
      },
      origin: {
        x: xCenter,
        y: yCenter,
        z: zCenter,
      },
      material: materialOptions,
      tunables: {
        alphaTest: uniforms.uAlphaTest.value,
        alphaHashScale: uniforms.uAlphaHashScale.value,
        parallaxScale: uniforms.uParallaxScale.value,
        depthDiscardThreshold: uniforms.uDepthDiscardThr.value,
        wrapPower: uniforms.uWrapPow.value,
        subsurfaceLift: uniforms.uSubsurfaceLift.value,
        fresnelStrength: uniforms.uFresnelStrength.value,
      },
      tileSelectionMode,
    },
  });
  const material = materialResult.material;

  // Tag for setImpostorTint() so the per-frame sun update knows to write
  // uSunColor + uSunDirWorld + uAmbientColor instead of uColor.
  material.userData = material.userData ?? {};
  material.userData.isKilnImpostor = true;
  // Stash sidecar for downstream consumers (e.g. the inspector page).
  material.userData.sidecar = sidecar;
  // Cycle 50 Phase 2: manifest identity (objectId/variant/layoutId), summary-only.
  material.userData.impostorIdentity = {
    objectId: sidecar.objectId ?? null,
    variant: sidecar.variant ?? null,
    layoutId: sidecar.layoutId ?? null,
  };
  material.userData.konveyorImpostorMaterialControls = materialResult.controls;
  material.userData.konveyorImpostorMaterialSummary = materialResult.summary;
  return material;
}

/**
 * Square quad sized to the bake frustum so each tile's content maps 1:1
 * to the runtime quad. Pixel Forge bakes with a square ortho frustum sized
 * to the bounding SPHERE (`bake.ts:444: const half = boundsRadius * 1.02`)
 * so the tree fits at any rotation. We match that here:
 *
 *   boundsRadius = sqrt(dx² + dy² + dz²) / 2   (bbox diagonal × 0.5)
 *   frustumHalf  = boundsRadius * 1.02         (bake camera's half-extent)
 *
 * Quad spans [-frustumHalf, +frustumHalf] on both X and Y, centered around
 * the bbox center (translated in by the vertex shader's uTreeOriginObj).
 * UV (0,0) is bottom-left, matching the bake atlas's tile orientation
 * after Three's auto Y-flip on PNG load.
 *
 * @param {object} sidecar
 * @returns {THREE.BufferGeometry}
 */
export function createKilnImpostorGeometry(sidecar) {
  const dx = sidecar.bbox.max[0] - sidecar.bbox.min[0];
  const dy = sidecar.bbox.max[1] - sidecar.bbox.min[1];
  const dz = sidecar.bbox.max[2] - sidecar.bbox.min[2];
  const boundsRadius = Math.sqrt(dx * dx + dy * dy + dz * dz) * 0.5;
  const frustumHalf = boundsRadius * 1.02;

  const positions = new Float32Array([
    -frustumHalf, -frustumHalf, 0,
     frustumHalf, -frustumHalf, 0,
     frustumHalf,  frustumHalf, 0,
    -frustumHalf, -frustumHalf, 0,
     frustumHalf,  frustumHalf, 0,
    -frustumHalf,  frustumHalf, 0,
  ]);
  const uvs = new Float32Array([
    0, 0,
    1, 0,
    1, 1,
    0, 0,
    1, 1,
    0, 1,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Fetch the four impostor artifacts for one tree type and build a
 * `{ material, geometry, sidecar }` triple ready to plug into an
 * InstancedMesh2.addLOD chain.
 *
 * Result is cached by URL — call as many times as needed during one
 * scene swap; only the first call hits the network.
 *
 * @param {string} basePath  e.g. 'assets/models/trees/tree1.imposter'
 *                           (without extension; the loader appends .png /
 *                           .normal.png / .depth.png / .json)
 * @returns {Promise<{ material: THREE.ShaderMaterial, geometry: THREE.BufferGeometry, sidecar: object } | null>}
 */
const _cache = new Map();
export async function loadKilnImpostor(basePath, options = {}) {
  const cacheKey = [
    basePath,
    options.tileSelectionMode ?? 'default',
  ].join('|');
  if (_cache.has(cacheKey)) return _cache.get(cacheKey);

  const promise = (async () => {
    const sidecarUrl = `${basePath}.json`;
    const albedoUrl  = `${basePath}.png`;
    const normalUrl  = `${basePath}.normal.png`;
    const depthUrl   = `${basePath}.depth.png`;

    let sidecar;
    try {
      const res = await fetch(sidecarUrl);
      if (!res.ok) throw new Error(`fetch ${sidecarUrl} → ${res.status}`);
      sidecar = await res.json();
    } catch (err) {
      console.warn(`[KILN] sidecar load failed for ${basePath}:`, err);
      return null;
    }

    const loader = new THREE.TextureLoader();
    const loadTex = (url, colorSpace = THREE.SRGBColorSpace) => new Promise((resolve, reject) => {
      loader.load(
        url,
        (tex) => {
          tex.colorSpace = colorSpace;
          // Cycle 20 v5 (2026-05-04): NO mipmaps but KEEP anisotropy.
          // Adjacent tiles in the 4x4 lat/lon atlas are completely
          // different views (azimuth/elevation neighbours); the box-mip
          // generator averaged across these boundaries → "glinted
          // reflective" sparkle at distance. Disabling mips fixes that.
          // Anisotropy stays at 8 because at high camera pitch the
          // impostor quad is foreshortened along its azimuth-tile axis,
          // and aniso is what keeps the texture sharp under that
          // foreshortening — without it, distant impostors read as
          // washed-out grey ghosts. The two evils are NOT equivalent:
          // aniso reads ~8 texels along ONE axis (mostly within the same
          // tile if the camera-yaw axis aligns with the texel grid),
          // while mip generation averages 2x2 across BOTH axes including
          // tile boundaries.
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.anisotropy = 8;
          tex.wrapS = THREE.ClampToEdgeWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.generateMipmaps = false;
          tex.needsUpdate = true;
          resolve(tex);
        },
        undefined,
        (err) => reject(err),
      );
    });

    let albedoAtlas, normalAtlas, depthAtlas;
    try {
      // Albedo is sRGB color data. Normal + depth are linear data — load
      // as NoColorSpace so Three doesn't gamma-correct them on sample.
      [albedoAtlas, normalAtlas, depthAtlas] = await Promise.all([
        loadTex(albedoUrl, THREE.SRGBColorSpace),
        loadTex(normalUrl, THREE.NoColorSpace),
        loadTex(depthUrl, THREE.NoColorSpace),
      ]);
    } catch (err) {
      console.warn(`[KILN] atlas load failed for ${basePath}:`, err);
      return null;
    }

    const material = createKilnImpostorMaterial({
      albedoAtlas,
      normalAtlas,
      depthAtlas,
      sidecar,
      tileSelectionMode: options.tileSelectionMode,
    });
    const geometry = createKilnImpostorGeometry(sidecar);
    return { material, geometry, sidecar };
  })();

  _cache.set(cacheKey, promise);
  return promise;
}
