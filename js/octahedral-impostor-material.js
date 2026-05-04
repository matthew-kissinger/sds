import * as THREE from 'three';

/**
 * Cycle 18 Phase 3 — octahedral impostor material.
 *
 * Replaces the Cycle 16/17 cross-billboard at the LOD2 tier when the bake
 * succeeds. Each tree instance picks one tile out of an atlas of pre-baked
 * views, sized by the (col, row) grid passed at construction. Per cycle-18
 * Q5 lean: single-tile picker (no 3-tile blend) — escalation to a 3-tile
 * blend is a Phase 4 polish item if the visible step is unacceptable.
 *
 * Camera distribution is azimuth × elevation (NOT a true Brucks octahedron).
 * Trade-off:
 *   - Trees are usually viewed from close to horizontal, so the 4-row
 *     elevation grid covers most of the camera trajectory at LOD2 distance.
 *   - Implementation is simpler — easy to inverse-map a runtime view
 *     direction to a (col, row) integer pair without acos/octahedral math.
 *   - The visible step at azimuth quadrant boundaries (90° apart with
 *     cols=4) is the price; a 3-tile blend or 8-azimuth bake closes it.
 *
 * Sun-tint: `material.uniforms.uColor` is updated by TerrainBuilder
 * .setImpostorTint to follow time-of-day.
 *
 * Geometry: a single quad in object-space coords
 *   `(±halfW, [yMin..yMax], 0)`
 * with uv ∈ [0,1]² spanning the quad. The vertex shader billboards the
 * quad around Y to face the camera; the fragment shader maps uv into the
 * picked tile of the atlas.
 */

const VERTEX_SHADER = /* glsl */`
uniform float uAtlasCols;
uniform float uAtlasRows;
uniform vec3 uTreeOriginObj;

#include <common>
// InstancedMesh2 (@three.ez/instanced-mesh) routes per-instance matrices
// through a matricesTexture + getInstancedMatrix() declared by these
// chunks. Without them, the instanceMatrix reference below would be
// undefined: the package adds USE_INSTANCING_INDIRECT + matricesTexture
// uniform via onBeforeCompile, but the function and the
// "mat4 instanceMatrix = getInstancedMatrix();" declaration arrive via
// the chunk includes here and inside main().
#include <batching_pars_vertex>
#include <fog_pars_vertex>

varying vec2 vUvAtlas;

void main() {
    // Brings "mat4 instanceMatrix = getInstancedMatrix();" into scope
    // when USE_INSTANCING_INDIRECT is defined (i.e. when the material
    // is mounted on an InstancedMesh2 LOD). USE_BATCHING isn't set, so
    // the batching branch in this chunk is a no-op.
    #include <batching_vertex>

    // Decompose instanceMatrix (column-major). Each column is a 4-vec;
    // .xyz of cols 0/1/2 are the basis vectors (rotation × scale), col 3
    // .xyz is the translation. Tree instances use uniform scale, so
    // length(col0) recovers the scale and (col / scale) recovers the
    // unit rotation matrix. Non-uniform scale would require a different
    // decomposition; we assert uniform scale at the JS placement site.
    vec3 col0 = instanceMatrix[0].xyz;
    vec3 col1 = instanceMatrix[1].xyz;
    vec3 col2 = instanceMatrix[2].xyz;
    vec3 trans = instanceMatrix[3].xyz;
    float scaleVal = length(col0);
    mat3 instRot = mat3(col0 / scaleVal, col1 / scaleVal, col2 / scaleVal);

    // Per-instance tree origin in world space.
    vec3 originLocal = trans + (instRot * uTreeOriginObj) * scaleVal;
    vec3 originWorld = (modelMatrix * vec4(originLocal, 1.0)).xyz;

    // Camera direction in world space (tree → camera).
    vec3 dirWorld = cameraPosition - originWorld;

    // Camera direction in object space (undo per-instance rotation +
    // per-scene model rotation). modelMatrix is typically identity for
    // an InstancedMesh added straight to scene, but be defensive.
    mat3 modelRot = mat3(modelMatrix);
    mat3 worldFromObj = modelRot * instRot;
    vec3 dirObj = transpose(worldFromObj) * dirWorld;
    if (length(dirObj) < 1e-4) dirObj = vec3(0.0, 0.0, 1.0);
    dirObj = normalize(dirObj);

    // Tile pick: azimuth × elevation grid. Cycle 18 Phase 3 ships a
    // single-tile picker (no blend) per Q5 lean.
    float TWO_PI = 6.28318530718;
    float HALF_PI = 1.5707963;
    float azimuth = atan(dirObj.z, dirObj.x);
    if (azimuth < 0.0) azimuth += TWO_PI;
    float elevation = clamp(asin(clamp(dirObj.y, 0.0, 1.0)), 0.0, HALF_PI);

    float colIdx = floor(azimuth / (TWO_PI / uAtlasCols));
    if (colIdx >= uAtlasCols) colIdx = uAtlasCols - 1.0;
    float rowIdx = floor(elevation / (HALF_PI / uAtlasRows));
    if (rowIdx >= uAtlasRows) rowIdx = uAtlasRows - 1.0;

    vec2 tileSize = vec2(1.0 / uAtlasCols, 1.0 / uAtlasRows);
    vec2 tileBase = vec2(colIdx * tileSize.x, rowIdx * tileSize.y);
    vUvAtlas = tileBase + uv * tileSize;

    // Cylindrical billboard around world-Y. The high-elevation atlas tiles
    // (rows near zenith) are mostly dead space at gameplay camera angles,
    // and tilting the quad to face an overhead camera distorts the tile's
    // baked aspect ratio (the bake uses halfW=max(x,z) × halfH=y, so a
    // top-down tile letterboxes the canopy inside a tall rectangle).
    // Tracked as follow-up: bake square tiles + tilt the quad so high-
    // elevation views read correctly from cinematic altitudes.
    vec3 horizForward = vec3(dirWorld.x, 0.0, dirWorld.z);
    if (length(horizForward) < 1e-4) horizForward = vec3(0.0, 0.0, 1.0);
    horizForward = normalize(horizForward);
    vec3 horizRight = normalize(cross(vec3(0.0, 1.0, 0.0), horizForward));

    // Quad vertices are object-space coords. position.x in [-halfW, halfW]
    // maps to the billboard's horizontal axis; position.y in [yMin, yMax]
    // maps to world up.
    vec3 vertexWorld = originWorld
        + horizRight * (position.x * scaleVal)
        + vec3(0.0, (position.y - uTreeOriginObj.y) * scaleVal, 0.0);

    // Three.js's <fog_vertex> chunk references the symbol mvPosition by
    // name, so we keep the local name in lockstep instead of inventing
    // mvPos. Otherwise the injected "vFogDepth = - mvPosition.z;" fails
    // to compile on strict drivers (e.g. SwiftShader in headless CI),
    // which silently collapses the impostor LOD to nothing on permissive
    // drivers too.
    vec4 mvPosition = viewMatrix * vec4(vertexWorld, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    #include <fog_vertex>
}
`;

const FRAGMENT_SHADER = /* glsl */`
uniform sampler2D uAtlas;
uniform vec3 uColor;
uniform float uAlphaTest;

#include <common>
#include <fog_pars_fragment>

varying vec2 vUvAtlas;

void main() {
    vec4 tex = texture2D(uAtlas, vUvAtlas);
    if (tex.a < uAlphaTest) discard;
    gl_FragColor = vec4(tex.rgb * uColor, tex.a);
    #include <fog_fragment>
}
`;

/**
 * @typedef {Object} OctahedralImpostorParams
 * @property {THREE.Texture} atlas   The composed atlas texture
 *   (`atlasW × atlasH`, with cols×rows tiles).
 * @property {number} cols           Number of azimuth tiles in the atlas.
 * @property {number} rows           Number of elevation tiles.
 * @property {number} halfWidth      Quad half-width in object-space metres.
 * @property {number} bboxMinY       Quad lower y in object space (= GLB bbox.min.y).
 * @property {number} bboxMaxY       Quad upper y in object space (= GLB bbox.max.y).
 */

/**
 * @param {OctahedralImpostorParams} params
 * @returns {THREE.ShaderMaterial}
 */
export function createOctahedralImpostorMaterial({ atlas, cols, rows, bboxMinY, bboxMaxY }) {
    const yCenter = (bboxMinY + bboxMaxY) * 0.5;
    const material = new THREE.ShaderMaterial({
        // Spread instead of UniformsUtils.merge — merge calls cloneUniforms
        // which emits a "Textures of render targets cannot be cloned"
        // warning per material instance because `atlas` is the runtime-
        // baked atlas texture (i.e. a RenderTarget.texture). Spreading
        // shares the same uniform descriptors directly. Fog uniforms
        // (fogColor / fogNear / fogFar / fogDensity) are auto-driven by
        // WebGLRenderer so we don't need our own writes — Three.js sees
        // `fog: true` on the material and pushes the scene fog values
        // every frame.
        uniforms: {
            ...THREE.UniformsLib.fog,
            uAtlas: { value: atlas },
            uColor: { value: new THREE.Color(1, 1, 1) },
            uAlphaTest: { value: 0.4 },
            uAtlasCols: { value: cols },
            uAtlasRows: { value: rows },
            uTreeOriginObj: { value: new THREE.Vector3(0, yCenter, 0) }
        },
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        side: THREE.DoubleSide,
        transparent: false,
        depthWrite: true,
        depthTest: true,
        fog: true
    });
    // Tag for setImpostorTint() so the per-frame sun-tint update knows
    // to write `uColor` instead of `MeshBasicMaterial.color`.
    material.userData.isOctahedralImpostor = true;
    return material;
}

/**
 * Build the single-quad impostor geometry. position.x ∈ [-halfW, halfW],
 * position.y ∈ [bboxMinY, bboxMaxY], position.z = 0. uv ∈ [0,1]².
 *
 * The vertex shader billboards this quad around Y per-frame.
 *
 * @param {number} halfWidth
 * @param {number} bboxMinY
 * @param {number} bboxMaxY
 * @returns {THREE.BufferGeometry}
 */
export function createOctahedralImpostorGeometry(halfWidth, bboxMinY, bboxMaxY) {
    const positions = new Float32Array([
        -halfWidth, bboxMinY, 0,
         halfWidth, bboxMinY, 0,
         halfWidth, bboxMaxY, 0,
        -halfWidth, bboxMinY, 0,
         halfWidth, bboxMaxY, 0,
        -halfWidth, bboxMaxY, 0
    ]);
    const uvs = new Float32Array([
        0, 0,
        1, 0,
        1, 1,
        0, 0,
        1, 1,
        0, 1
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    return geo;
}
