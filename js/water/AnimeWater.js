/**
 * AnimeWater - cel/anime-shaded water surface.
 *
 * Single ShaderMaterial. Shoreline foam and two-band water color come from
 * scene boundary data instead of a per-frame depth render target.
 *
 * Stack:
 *  - Two-band shoreline gradient from island boundary radius/falloff
 *  - Sharp shoreline foam from distance-to-shore + step()
 *  - Painted ripples: 2 octaves animated simplex noise, step()-quantized
 *  - Cel sparkles: quantized Blinn step() masked by high-freq simplex
 *  - Fog match: <fog_pars_fragment>/<fog_fragment> chunks, atmosphere-driven
 *
 * Pure ShaderMaterial - skip <colorspace_fragment>, author colors in
 * linear, write gl_FragColor raw to avoid tonemap double-apply.
 */
import * as THREE from 'three';

export const WATER_PALETTE_RGB = Object.freeze({
    shallow: [0x6f, 0xd7, 0xd2],
    deep: [0x10, 0x36, 0x62],
    foam: [0xea, 0xf6, 0xff],
});

export const DEFAULT_FOAM_THICKNESS = 2.5;

function clamp01(value) {
    return Math.min(1, Math.max(0, value));
}

export function computeShorelineMetrics({
    x,
    z,
    centerX = 0,
    centerZ = 0,
    boundaryRadius,
    boundaryFalloff,
    foamThickness = DEFAULT_FOAM_THICKNESS,
}) {
    const falloff = Math.max(boundaryFalloff, 0.001);
    const radialDistance = Math.hypot(x - centerX, z - centerZ);
    const distanceFromShore = Math.abs(radialDistance - boundaryRadius);
    const depthT = clamp01(distanceFromShore / falloff);
    const foamMask = distanceFromShore < foamThickness ? 1 : 0;

    return {
        radialDistance,
        distanceFromShore,
        depthT,
        foamMask,
    };
}

export function mixWaterBaseColor(depthT) {
    const t = clamp01(depthT);
    return WATER_PALETTE_RGB.shallow.map((channel, index) => {
        const deep = WATER_PALETTE_RGB.deep[index];
        return Math.round(channel + (deep - channel) * t);
    });
}

export function isNearFoamWhiteRgb(rgb, tolerance = 14) {
    return WATER_PALETTE_RGB.foam.every((channel, index) => Math.abs(rgb[index] - channel) <= tolerance);
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;

  #include <fog_pars_vertex>

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vec4 mvPosition = viewMatrix * worldPos;
    gl_Position = projectionMatrix * mvPosition;

    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  varying vec3 vWorldPos;

  uniform vec2 uShoreCenter;
  uniform float uShoreRadius;
  uniform float uShoreFalloff;
  uniform float uTime;

  uniform vec3 uShallowColor;
  uniform vec3 uDeepColor;
  uniform vec3 uFoamColor;
  uniform float uFoamThickness;
  uniform float uRippleStrength;
  uniform float uSparkleStrength;

  uniform vec3 uSunDirection;
  uniform float uSunSpecularIntensity;

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
    float shoreFalloff = max(uShoreFalloff, 0.001);
    float radialDistance = length(vWorldPos.xz - uShoreCenter);
    float distanceFromShore = abs(radialDistance - uShoreRadius);

    float depthT = clamp(distanceFromShore / shoreFalloff, 0.0, 1.0);
    vec3 baseColor = mix(uShallowColor, uDeepColor, depthT);

    vec2 rippleUv = vWorldPos.xz * 0.05 + vec2(uTime * 0.05, uTime * 0.03);
    float r1 = snoise(rippleUv);
    float r2 = snoise(rippleUv * 2.7 + vec2(uTime * 0.07, -uTime * 0.04));
    float ripple = (r1 * 0.65 + r2 * 0.35);
    float rippleBanded = step(0.15, ripple) * 0.5 + step(0.55, ripple) * 0.5;
    baseColor += vec3(rippleBanded * uRippleStrength * 0.08);

    vec2 foamNoiseUv = vWorldPos.xz * 0.18 + vec2(uTime * 0.04, uTime * 0.02);
    float foamNoise = snoise(foamNoiseUv);
    float foamThreshold = uFoamThickness * (1.0 + foamNoise * 0.25);
    float foamMask = 1.0 - step(foamThreshold, distanceFromShore);

    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 N = vec3(0.0, 1.0, 0.0);
    vec3 H = normalize(uSunDirection + viewDir);
    float NdotH = max(dot(N, H), 0.0);
    float spec = pow(NdotH, 64.0);
    float sparkleMask = snoise(vWorldPos.xz * 0.8 + vec2(uTime * 0.15));
    float sparkles = step(0.85, spec) * step(0.55, sparkleMask) * uSparkleStrength;

    float sunGlint = pow(NdotH, 8.0) * uSunSpecularIntensity;
    vec3 sunGlintColor = vec3(1.0, 0.95, 0.82);

    vec3 color = baseColor + vec3(sparkles) + sunGlintColor * sunGlint;
    color = mix(color, uFoamColor, foamMask);

    gl_FragColor = vec4(color, 1.0);

    #include <fog_fragment>
  }
`;

function getBoundaryUniforms(boundary) {
    return {
        center: new THREE.Vector2(boundary.center?.x ?? 0, boundary.center?.z ?? 0),
        radius: boundary.radius,
        falloff: boundary.falloff,
    };
}

export function createAnimeWaterMaterial({ boundary }) {
    const shoreline = getBoundaryUniforms(boundary);
    const uniforms = THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
            uShoreCenter: { value: shoreline.center },
            uShoreRadius: { value: shoreline.radius },
            uShoreFalloff: { value: shoreline.falloff },
            uTime: { value: 0 },

            uShallowColor: { value: new THREE.Color(0x6fd7d2) },
            uDeepColor: { value: new THREE.Color(0x103662) },
            uFoamColor: { value: new THREE.Color(0xeaf6ff) },

            uFoamThickness: { value: DEFAULT_FOAM_THICKNESS },
            uRippleStrength: { value: 1.0 },
            uSparkleStrength: { value: 0.7 },

            uSunDirection: { value: new THREE.Vector3(0.4, 0.6, 0.7).normalize() },
            uSunSpecularIntensity: { value: 0.6 },
        }
    ]);

    return new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        fog: true,
        transparent: false,
        depthWrite: true,
        side: THREE.FrontSide,
    });
}

export function createAnimeWater({ boundary, size = 4000, y = -0.05, segments = 64 }) {
    const material = createAnimeWaterMaterial({ boundary });

    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    mesh.receiveShadow = false;
    mesh.castShadow = false;

    return {
        mesh,
        material,
        update(timeSec, sunDirection) {
            material.uniforms.uTime.value = timeSec;
            if (sunDirection) {
                material.uniforms.uSunDirection.value.copy(sunDirection);
            }
        },
        resize() {},
        dispose() {
            geometry.dispose();
            material.dispose();
        }
    };
}
