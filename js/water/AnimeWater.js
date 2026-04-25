/**
 * AnimeWater — cel/anime-shaded water surface.
 *
 * Single ShaderMaterial. No Reflector pass. Reads a scene depth texture
 * (provided by DepthPrePass) for shoreline foam + two-band depth color.
 *
 * Stack:
 *  - Two-band depth gradient (shallow → deep) via depth-diff
 *  - Sharp shoreline foam via depth-diff + step() (anime hard-edge,
 *    NOT smoothstep), modulated by scrolling voronoi so foam breathes
 *  - Painted ripples: 2 octaves animated simplex noise, step()-quantized
 *  - Cel sparkles: quantized Blinn step() masked by high-freq simplex
 *  - Fog match: <fog_pars_fragment>/<fog_fragment> chunks, atmosphere-driven
 *  - highp depth sampler for iOS precision parity
 *
 * Pure ShaderMaterial — skip <colorspace_fragment>, author colors in
 * linear, write gl_FragColor raw to avoid tonemap double-apply.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying float vViewZ;

  #include <fog_pars_vertex>

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    // The fog chunk references \`mvPosition\` by name — give it that.
    vec4 mvPosition = viewMatrix * worldPos;
    vViewZ = mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;

    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying float vViewZ;

  uniform highp sampler2D uDepthTex;
  uniform vec2 uResolution;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uTime;

  uniform vec3 uShallowColor;     // turquoise
  uniform vec3 uDeepColor;        // deep navy
  uniform vec3 uFoamColor;        // near-white
  uniform float uDepthFalloff;    // metres of depth that maps shallow→deep
  uniform float uFoamThickness;   // metres of depth diff that reads as foam
  uniform float uRippleStrength;  // 0..1 banding contrast
  uniform float uSparkleStrength; // 0..1

  uniform vec3 uSunDirection;     // world space, normalized

  #include <packing>
  #include <fog_pars_fragment>

  // Ashima Arts 2D simplex noise (public domain).
  // https://github.com/ashima/webgl-noise
  vec3 mod289_vec3(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec2 mod289_vec2(vec2 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec3 permute(vec3 x){ return mod289_vec3(((x*34.0)+1.0)*x); }
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289_vec2(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    // Sample scene depth at fragment screen position.
    vec2 screenUv = gl_FragCoord.xy / uResolution;
    float fragDepth = texture2D(uDepthTex, screenUv).x;

    // Convert to view-space Z (negative — camera looks down -Z).
    float sceneViewZ = perspectiveDepthToViewZ(fragDepth, uCameraNear, uCameraFar);
    float waterViewZ = vViewZ;

    // Positive when scene is BEHIND water (terrain underneath water surface).
    float diff = max(0.0, sceneViewZ - waterViewZ);

    // Two-band depth color
    float depthT = clamp(diff / uDepthFalloff, 0.0, 1.0);
    vec3 baseColor = mix(uShallowColor, uDeepColor, depthT);

    // Painted ripples — 2 octaves simplex, banded
    vec2 rippleUv = vWorldPos.xz * 0.05 + vec2(uTime * 0.05, uTime * 0.03);
    float r1 = snoise(rippleUv);
    float r2 = snoise(rippleUv * 2.7 + vec2(uTime * 0.07, -uTime * 0.04));
    float ripple = (r1 * 0.65 + r2 * 0.35);
    // Quantize into 3 bands for the painted look
    float rippleBanded = step(0.15, ripple) * 0.5 + step(0.55, ripple) * 0.5;
    baseColor += vec3(rippleBanded * uRippleStrength * 0.08);

    // Sharp shoreline foam — voronoi-modulated threshold for breathing edge
    // Use a different scale for the foam mask noise so it doesn't align with ripples
    vec2 foamNoiseUv = vWorldPos.xz * 0.18 + vec2(uTime * 0.04, uTime * 0.02);
    float foamNoise = snoise(foamNoiseUv);
    float foamThreshold = uFoamThickness * (1.0 + foamNoise * 0.25);
    // ANIME HARD-EDGE — step(), not smoothstep. Foam where depth diff is shallow.
    float foamMask = 1.0 - step(foamThreshold, diff);

    // Cel sparkles — quantized specular masked by high-freq simplex
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 N = vec3(0.0, 1.0, 0.0); // flat plane normal in world space
    vec3 H = normalize(uSunDirection + viewDir);
    float spec = pow(max(dot(N, H), 0.0), 64.0);
    float sparkleMask = snoise(vWorldPos.xz * 0.8 + vec2(uTime * 0.15));
    float sparkles = step(0.85, spec) * step(0.55, sparkleMask) * uSparkleStrength;

    vec3 color = baseColor + vec3(sparkles);
    color = mix(color, uFoamColor, foamMask);

    gl_FragColor = vec4(color, 1.0);

    // Fog match — matches the atmosphere preset's horizon at distance
    #include <fog_fragment>
  }
`;

/**
 * Build the AnimeWater material. Caller supplies the renderer (for
 * drawing-buffer dimensions), the camera (for near/far + aspect), and
 * a depth texture from a previously-rendered scene-without-water pass.
 *
 * @param {Object} input
 * @param {THREE.WebGLRenderer} input.renderer
 * @param {THREE.PerspectiveCamera} input.camera
 * @param {THREE.Texture} input.depthTexture
 * @returns {THREE.ShaderMaterial}
 */
export function createAnimeWaterMaterial({ renderer, camera, depthTexture }) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());

    const uniforms = THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
            uDepthTex:        { value: depthTexture },
            uResolution:      { value: new THREE.Vector2(size.x, size.y) },
            uCameraNear:      { value: camera.near },
            uCameraFar:       { value: camera.far },
            uTime:            { value: 0 },

            // Anime palette — turquoise shallow, navy deep, near-white foam
            uShallowColor:    { value: new THREE.Color(0x6fd7d2) },
            uDeepColor:       { value: new THREE.Color(0x103662) },
            uFoamColor:       { value: new THREE.Color(0xeaf6ff) },

            uDepthFalloff:    { value: 4.0 },     // metres
            uFoamThickness:   { value: 0.6 },     // metres
            uRippleStrength:  { value: 1.0 },
            uSparkleStrength: { value: 0.7 },

            uSunDirection:    { value: new THREE.Vector3(0.4, 0.6, 0.7).normalize() },
        }
    ]);

    const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        fog: true,
        transparent: false,
        depthWrite: true,
        side: THREE.FrontSide,
    });

    return material;
}

/**
 * Convenience helper: create a flat water-plane mesh under a scene.
 * Caller is responsible for adding to the THREE.Scene and calling update().
 *
 * @param {Object} input
 * @param {THREE.WebGLRenderer} input.renderer
 * @param {THREE.PerspectiveCamera} input.camera
 * @param {THREE.Texture} input.depthTexture
 * @param {number} [input.size=4000]
 * @param {number} [input.y=-0.05]   y-offset to avoid z-fighting with terrain at sea level
 * @param {number} [input.segments=64]
 * @returns {{mesh: THREE.Mesh, material: THREE.ShaderMaterial, update: (timeSec: number, sunDirection?: THREE.Vector3) => void, resize: (w: number, h: number) => void, dispose: () => void}}
 */
export function createAnimeWater({ renderer, camera, depthTexture, size = 4000, y = -0.05, segments = 64 }) {
    const material = createAnimeWaterMaterial({ renderer, camera, depthTexture });

    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2); // face up

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    mesh.receiveShadow = false;
    mesh.castShadow = false;

    return {
        mesh,
        material,
        /**
         * Call once per frame.
         * @param {number} timeSec - elapsed time, seconds (uniform-driven animation)
         * @param {THREE.Vector3} [sunDirection] - world-space sun direction; pass from atmosphere
         */
        update(timeSec, sunDirection) {
            material.uniforms.uTime.value = timeSec;
            if (sunDirection) {
                material.uniforms.uSunDirection.value.copy(sunDirection);
            }
            // Camera near/far may change at runtime; keep uniforms in sync.
            material.uniforms.uCameraNear.value = camera.near;
            material.uniforms.uCameraFar.value = camera.far;
        },
        resize(w, h) {
            material.uniforms.uResolution.value.set(w, h);
        },
        dispose() {
            geometry.dispose();
            material.dispose();
        }
    };
}
