// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
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
import { createKonveyorWaterMaterial } from './konveyorWaterMaterialAdapter.js';

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
  uniform vec3 uSunColor;
  uniform float uSunSpecularIntensity;

  // Cycle 35 Phase 6: heightfield-driven shoreline foam. When uHasHeight is
  // 1 the shader samples the terrain heightfield to place foam at the
  // visible water-terrain interface instead of the geometric boundary
  // radius (which was 37m offshore on Sheep Dog Island and 64m on Open
  // Country since the Cycle 32 depth-pre-pass removal).
  uniform sampler2D uHeightTex;
  uniform float uHeightWorldSize;
  uniform float uHeightPeak;
  uniform float uWaterY;
  uniform float uHasHeight;

  #include <fog_pars_fragment>

  // Sample heightfield at world (x, z) and return terrain Y in metres,
  // matching Heightfield.sample() (raw texel * peakHeight). Clamp UV to
  // edge so off-island queries return the baked seaLevel (~ -2 * peakHeight
  // metres) rather than wrapping.
  float sampleTerrainY(vec2 worldXZ) {
    vec2 uv = worldXZ / uHeightWorldSize + 0.5;
    uv = clamp(uv, 0.0, 1.0);
    float texel = texture2D(uHeightTex, uv).r;
    return texel * uHeightPeak;
  }

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
    // Cycle 35 Phase 6: when a heightfield is bound, foam tracks the
    // visible water-terrain interface. Past the heightfield extent the
    // sampled value is the baked seaLevel (~-12m) so terrain_y << waterY
    // and no foam appears — correct for the open ocean. Without a
    // heightfield (Field has no water anyway), fall back to the original
    // boundary-radius band.
    float foamDist = mix(distanceFromShore, abs(sampleTerrainY(vWorldPos.xz) - uWaterY), uHasHeight);
    float foamMask = 1.0 - step(foamThreshold, foamDist);

    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 N = vec3(0.0, 1.0, 0.0);
    vec3 H = normalize(uSunDirection + viewDir);
    float NdotH = max(dot(N, H), 0.0);
    float spec = pow(NdotH, 64.0);
    float sparkleMask = snoise(vWorldPos.xz * 0.8 + vec2(uTime * 0.15));
    float sparkles = step(0.85, spec) * step(0.55, sparkleMask) * uSparkleStrength;

    float sunGlint = pow(NdotH, 8.0) * uSunSpecularIntensity;
    vec3 sunGlintColor = uSunColor;

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

function makeHeightTexture(heightfield) {
    // R32F: one float per texel, raw values straight out of Heightfield.data
    // (already in metres × peakHeight per the Heightfield.sample contract).
    // LinearFilter so per-fragment interpolation matches the CPU bilinear
    // path; ClampToEdgeWrapping so off-island queries return the baked
    // seaLevel rather than wrapping.
    const tex = new THREE.DataTexture(
        heightfield.getRawArray(),
        heightfield.width,
        heightfield.height,
        THREE.RedFormat,
        THREE.FloatType,
    );
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
}

export function createAnimeWaterMaterial({
    boundary,
    heightfield = null,
    waterY = -0.05,
    search,
    konveyorWaterFactories,
}) {
    const shoreline = getBoundaryUniforms(boundary);
    const heightTex = heightfield ? makeHeightTexture(heightfield) : null;
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
            uSunColor: { value: new THREE.Color(1, 1, 1) },
            uSunSpecularIntensity: { value: 0.6 },

            // Cycle 35 Phase 6 heightfield-driven foam.
            uHeightTex: { value: heightTex },
            uHeightWorldSize: { value: heightfield ? heightfield.worldSize : 1 },
            uHeightPeak: { value: heightfield ? heightfield.peakHeight : 1 },
            uWaterY: { value: waterY },
            uHasHeight: { value: heightfield ? 1 : 0 },
        }
    ]);

    const createDefaultMaterial = () => {
        const material = new THREE.ShaderMaterial({
            uniforms,
            vertexShader: VERT,
            fragmentShader: FRAG,
            fog: true,
            transparent: false,
            depthWrite: true,
            side: THREE.FrontSide,
        });
        // THREE.UniformsUtils.merge clones uniform values, so the merged
        // uHeightTex.value is a stale Texture clone with no source. Re-bind
        // the real DataTexture so the GPU samples the heightfield data.
        if (heightTex) {
            material.uniforms.uHeightTex.value = heightTex;
        }
        return material;
    };
    const materialResult = createKonveyorWaterMaterial('anime-water', 'createAnimeWaterMaterial', {
        createDefaultMaterial,
        search,
        factories: konveyorWaterFactories,
        context: {
            shoreline: {
                center: shoreline.center.clone(),
                radius: shoreline.radius,
                falloff: shoreline.falloff,
            },
            waterY,
            hasHeightfield: !!heightfield,
            heightTexture: heightTex,
            heightfield: heightfield ? {
                width: heightfield.width,
                height: heightfield.height,
                worldSize: heightfield.worldSize,
                peakHeight: heightfield.peakHeight,
            } : null,
            shallowColor: uniforms.uShallowColor.value.clone(),
            deepColor: uniforms.uDeepColor.value.clone(),
            foamColor: uniforms.uFoamColor.value.clone(),
            foamThickness: uniforms.uFoamThickness.value,
            rippleStrength: uniforms.uRippleStrength.value,
            sparkleStrength: uniforms.uSparkleStrength.value,
            sunDirection: uniforms.uSunDirection.value.clone(),
            sunColor: uniforms.uSunColor.value.clone(),
            sunColorSource: 'skyFog.sunColor',
            sunSpecularIntensity: uniforms.uSunSpecularIntensity.value,
        },
    });
    const material = materialResult.material;
    material.userData = material.userData ?? {};
    material.userData.heightTexture = heightTex;
    material.userData.konveyorWaterMaterialControls = materialResult.controls;
    material.userData.konveyorWaterMaterialSummary = materialResult.summary;
    return material;
}

export function createAnimeWater({ boundary, heightfield = null, size = 4000, y = -0.05, segments = 64, search, konveyorWaterFactories }) {
    const material = createAnimeWaterMaterial({ boundary, heightfield, waterY: y, search, konveyorWaterFactories });
    const waterControls = material.userData?.konveyorWaterMaterialControls ?? null;
    const baseSparkleStrength = material.uniforms?.uSparkleStrength?.value ?? 0.7;
    let qualitySparkleScale = 1;

    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    mesh.receiveShadow = false;
    mesh.castShadow = false;

    return {
        mesh,
        material,
        konveyorWaterMaterialSummary: material.userData?.konveyorWaterMaterialSummary ?? null,
        get qualitySparkleScale() {
            return qualitySparkleScale;
        },
        setQualityState(state = {}) {
            qualitySparkleScale = Number.isFinite(state.waterSparkleScale)
                ? THREE.MathUtils.clamp(state.waterSparkleScale, 0, 1.25)
                : 1;
            const sparkleStrength = baseSparkleStrength * qualitySparkleScale;
            if (waterControls?.update) {
                waterControls.update({ sparkleStrength, material });
            } else if (material.uniforms?.uSparkleStrength) {
                material.uniforms.uSparkleStrength.value = sparkleStrength;
            }
        },
        update(timeSec, sunDirection, sunColor) {
            if (waterControls?.update) {
                waterControls.update({
                    timeSec,
                    sunDirection,
                    sunColor,
                    sparkleStrength: baseSparkleStrength * qualitySparkleScale,
                    material
                });
                return;
            }
            if (material.uniforms?.uTime) {
                material.uniforms.uTime.value = timeSec;
            }
            if (sunDirection && material.uniforms?.uSunDirection) {
                material.uniforms.uSunDirection.value.copy(sunDirection);
            }
            if (sunColor && material.uniforms?.uSunColor) {
                material.uniforms.uSunColor.value.copy(sunColor);
            }
            if (material.uniforms?.uSparkleStrength) {
                material.uniforms.uSparkleStrength.value = baseSparkleStrength * qualitySparkleScale;
            }
        },
        resize() {},
        dispose() {
            waterControls?.dispose?.();
            geometry.dispose();
            const heightTex = material.userData?.heightTexture;
            if (heightTex) heightTex.dispose();
            material.dispose?.();
        }
    };
}
