import * as THREE from 'three';

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
 *   - **Anchor via sidecar `worldSize` + `bbox`**. Quad sized in object
 *     space spanning bbox.min.y → bbox.max.y. Ground anchor matches LOD0
 *     trunk-base for trunk-pivot GLBs (Bug 6 was already correct for
 *     EZ-Tree GLBs but the sidecar makes the contract explicit).
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
uniform float uHalfWidth;        // worldSize / 2 in object-space units
uniform vec3 uTreeOriginObj;     // (0, yOffset, 0) — bbox center in object space
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
  // world dir feeds the cylindrical-billboard quad orientation.
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

  // Cylindrical billboard around world-Y. Same as Cycle 18 — the high-
  // elevation tiles read incorrectly because the quad never tilts back;
  // Cycle 19.5 carryover #2 is the future cycle that fixes this with
  // square tiles + tilt math in lockstep. For Cycle 20 v1, we keep the
  // billboard as-is and the lighting does the heavy lifting.
  vec3 horizForward = vec3(dirWorld.x, 0.0, dirWorld.z);
  if (length(horizForward) < 1e-4) horizForward = vec3(0.0, 0.0, 1.0);
  horizForward = normalize(horizForward);
  vec3 horizRight = normalize(cross(vec3(0.0, 1.0, 0.0), horizForward));

  // position.x ∈ [-uHalfWidth, +uHalfWidth] → billboard horizontal axis.
  // position.y ∈ [bbox.min.y, bbox.max.y] → world up.
  vec3 vertexWorld = originWorld
    + horizRight * (position.x * scaleVal)
    + vec3(0.0, (position.y - uTreeOriginObj.y) * scaleVal, 0.0);

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
uniform vec3 uSunColor;
uniform vec3 uAmbientColor;
uniform float uAlphaTest;
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
vec2 atlasUvForTile(float azIdx, float elIdx, vec2 uvLocal) {
  vec2 base = vec2(azIdx * TILE_SCALE.x, (TILES_Y - 1.0 - elIdx) * TILE_SCALE.y);
  return base + uvLocal * TILE_SCALE;
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
  if (aBlended < uAlphaTest) discard;

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

  // Lighting: object-space dot product (vSunDirObj already pre-rotated in
  // vertex shader). Lambert diffuse + ambient flat term.
  float diffuse = max(dot(N_obj, vSunDirObj), 0.0);
  vec3 lit = uAmbientColor + diffuse * uSunColor;

  gl_FragColor = vec4(albedoBlended * lit, aBlended);
  #include <fog_fragment>
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
export function createKilnImpostorMaterial({ albedoAtlas, normalAtlas, depthAtlas, sidecar }) {
  if (sidecar.tilesX !== TILES_X || sidecar.tilesY !== TILES_Y) {
    console.warn(
      `[KILN] sidecar is ${sidecar.tilesX}×${sidecar.tilesY}, shader compiled for ${TILES_X}×${TILES_Y}. ` +
      `Re-bake or update the shader constants.`
    );
  }

  // Sidecar arrays are ascending azimuth + descending elevation, length 4 each.
  const azPad = [
    sidecar.azimuths[0] ?? 0,
    sidecar.azimuths[1] ?? 0,
    sidecar.azimuths[2] ?? 0,
    sidecar.azimuths[3] ?? 0,
  ];
  const elPad = [
    sidecar.elevations[0] ?? 0,
    sidecar.elevations[1] ?? 0,
    sidecar.elevations[2] ?? 0,
    sidecar.elevations[3] ?? 0,
  ];

  const yCenter = sidecar.yOffset ?? 0;
  const halfWidth = sidecar.worldSize * 0.5;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsLib.fog,
      uAtlas:           { value: albedoAtlas },
      uNormal:          { value: normalAtlas },
      uDepth:           { value: depthAtlas },
      uAzimuths:        { value: new THREE.Vector4(...azPad) },
      uElevations:      { value: new THREE.Vector4(...elPad) },
      uHalfWidth:       { value: halfWidth },
      uTreeOriginObj:   { value: new THREE.Vector3(0, yCenter, 0) },
      uSunDirWorld:     { value: new THREE.Vector3(0.5, 0.7, 0.3).normalize() },
      uSunColor:        { value: new THREE.Color(1, 1, 1) },
      uAmbientColor:    { value: new THREE.Color(0.4, 0.4, 0.4) },
      uAlphaTest:       { value: 0.4 },
      // v1 defaults: parallax + depth-discard scaffolded but disabled.
      // Tune via TerrainBuilder.setKilnImpostorTunables() per Layer F.
      uParallaxScale:   { value: 0.0 },
      uDepthDiscardThr: { value: 1.0 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    fog: true,
  });

  // Tag for setImpostorTint() so the per-frame sun update knows to write
  // uSunColor + uSunDirWorld + uAmbientColor instead of uColor.
  material.userData.isKilnImpostor = true;
  // Stash sidecar for downstream consumers (e.g. the inspector page).
  material.userData.sidecar = sidecar;
  return material;
}

/**
 * Quad geometry sized to the sidecar's bbox. Width = worldSize, height =
 * bbox.max.y - bbox.min.y. position.x ∈ [-worldSize/2, +worldSize/2],
 * position.y ∈ [bbox.min.y, bbox.max.y], position.z = 0. uv ∈ [0,1]².
 *
 * @param {object} sidecar
 * @returns {THREE.BufferGeometry}
 */
export function createKilnImpostorGeometry(sidecar) {
  const halfWidth = sidecar.worldSize * 0.5;
  const yMin = sidecar.bbox.min[1];
  const yMax = sidecar.bbox.max[1];

  const positions = new Float32Array([
    -halfWidth, yMin, 0,
     halfWidth, yMin, 0,
     halfWidth, yMax, 0,
    -halfWidth, yMin, 0,
     halfWidth, yMax, 0,
    -halfWidth, yMax, 0,
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
export async function loadKilnImpostor(basePath) {
  if (_cache.has(basePath)) return _cache.get(basePath);

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
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.wrapS = THREE.ClampToEdgeWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.generateMipmaps = true;
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

    const material = createKilnImpostorMaterial({ albedoAtlas, normalAtlas, depthAtlas, sidecar });
    const geometry = createKilnImpostorGeometry(sidecar);
    return { material, geometry, sidecar };
  })();

  _cache.set(basePath, promise);
  return promise;
}
