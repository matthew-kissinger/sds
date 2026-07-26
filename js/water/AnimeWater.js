// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The water surface, WebGL path. The WebGPU node path production runs is
 * js/water/webgpuAnimeWaterNodeMaterial.js; both are authored against
 * js/water/waterSurfaceModel.js and must not diverge.
 *
 * Single ShaderMaterial. Shoreline foam and the depth colour come from the
 * terrain heightfield rather than from a per-frame depth render target.
 *
 * Stack, after Cycle 118 Phase 3:
 *  - Shore-to-deep gradient in metres of seabed under the water plane
 *  - Shoreline foam at the water-terrain interface, as a band
 *  - Continuous signed ripple, 2 octaves of the shared value noise
 *  - A three-rotation slope normal that both shades the surface and carries
 *    the specular lobe
 *  - A light response off the sun's elevation, since this shader is unlit
 *  - Fog match: <fog_pars_fragment>/<fog_fragment>, atmosphere-driven
 *
 * The name is historical. What it described - "cel/anime-shaded", painted
 * ripples quantised with step(), cel sparkles gated with step() - is what D-W
 * called the rewrite against and what Phase 3 retired. The file name is load
 * bearing across the boot path, the diagnostics and the validation tools, so it
 * outlives the style; renaming it is its own mechanical pass.
 *
 * Pure ShaderMaterial - skip <colorspace_fragment>, author colors in
 * linear, write gl_FragColor raw to avoid tonemap double-apply.
 *
 * Cycle 118 Phase 2: the palette, the noise basis and the slope normal all come
 * from js/water/waterSurfaceModel.js now, shared with the WebGPU node path.
 * This file kept its own copies of all three and they had drifted; the
 * re-exports below are a compatibility shim for existing importers, in the
 * shape shared/GameStateValidation.js uses.
 */
import * as THREE from 'three';
import { createWebGpuWaterMaterial } from './webgpuWaterMaterialAdapter.js';
import {
    WATER_FOAM_INTERFACE_BAND,
    WATER_FOAM_THICKNESS,
    WATER_GLINT_GAIN_DEFAULTS,
    WATER_PALETTE_LINEAR,
    WATER_SLOPE_SCALE,
    WATER_SURFACE_GLSL,
    WATER_SWELL_DEPTH_SWING,
    advanceWaterClock,
} from './waterSurfaceModel.js';

export {
    WATER_PALETTE_SRGB_BYTES as WATER_PALETTE_RGB,
    WATER_FOAM_THICKNESS as DEFAULT_FOAM_THICKNESS,
    computeShorelineMetrics,
    isNearFoamWhiteRgb,
    waterBaseColorSrgbBytes as mixWaterBaseColor,
} from './waterSurfaceModel.js';

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

  // Cycle 118 Phase 2: the noise basis and the slope normal come from
  // js/water/waterSurfaceModel.js, shared with the WebGPU node path. This file
  // used to carry a 27-line Ashima simplex that the node path did not have and
  // did not agree with. waterValueNoiseSigned returns the same [-1, 1] range
  // snoise did, so every threshold below is exactly as it was authored.
${WATER_SURFACE_GLSL}

  void main() {
    float shoreFalloff = max(uShoreFalloff, 0.001);
    float radialDistance = length(vWorldPos.xz - uShoreCenter);
    float distanceFromShore = abs(radialDistance - uShoreRadius);

    // Cycle 118 Phase 3: when a heightfield is bound the depth ramp reads
    // METRES OF SEABED, the same model the node path uses, instead of distance
    // from the boundary circle. The circle branch survives as the
    // heightfield-less fallback only.
    float seabedDepth = max(uWaterY - sampleTerrainY(vWorldPos.xz), 0.0);
    float depthT = mix(
      clamp(distanceFromShore / shoreFalloff, 0.0, 1.0),
      waterDepthFromSeabed(seabedDepth),
      uHasHeight
    );

    // The slow swell reads as a nudge of apparent depth rather than as a colour
    // added on top, so it can darken as well as lighten and spells no colour of
    // its own. Same change as the node path.
    float swell = waterValueNoise(vWorldPos.xz * 0.012 + vec2(uTime * 0.025, -uTime * 0.018)) - 0.5;
    float swellDepthT = clamp(depthT + swell * ${WATER_SWELL_DEPTH_SWING.toFixed(3)}, 0.0, 1.0);
    vec3 baseColor = mix(uShallowColor, uDeepColor, swellDepthT);

    vec2 rippleUv = vWorldPos.xz * 0.05 + vec2(uTime * 0.05, uTime * 0.03);
    float r1 = waterValueNoiseSigned(rippleUv);
    float r2 = waterValueNoiseSigned(rippleUv * 2.7 + vec2(uTime * 0.07, -uTime * 0.04));
    // Cycle 118 Phase 3 retired the cel quantisation. This was
    // step(0.15, ripple) * 0.5 + step(0.55, ripple) * 0.5 - three flat bands
    // with hard edges, the "painted ripples, step()-quantized" line of the
    // anime stack D-W named. Continuous and signed now.
    float ripple = r1 * 0.65 + r2 * 0.35;
    baseColor += vec3(ripple * uRippleStrength * 0.04);

    vec2 foamNoiseUv = vWorldPos.xz * 0.18 + vec2(uTime * 0.04, uTime * 0.02);
    float foamNoise = waterValueNoiseSigned(foamNoiseUv);
    float foamThreshold = uFoamThickness * (1.0 + foamNoise * 0.25);
    // Cycle 35 Phase 6: when a heightfield is bound, foam tracks the
    // visible water-terrain interface. Past the heightfield extent the
    // sampled value is the baked seaLevel (~-12m) so terrain_y << waterY
    // and no foam appears — correct for the open ocean. Without a
    // heightfield (Field has no water anyway), fall back to the original
    // boundary-radius band. Cycle 118 Phase 3 softened the edge from a step()
    // to a band, matching the node path; the branch itself is untouched.
    float foamDist = mix(distanceFromShore, abs(sampleTerrainY(vWorldPos.xz) - uWaterY), uHasHeight);
    float foamMask = 1.0 - smoothstep(foamThreshold * ${WATER_FOAM_INTERFACE_BAND.start.toFixed(2)}, foamThreshold * ${WATER_FOAM_INTERFACE_BAND.end.toFixed(2)}, foamDist);

    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    // Cycle 118 Phase 2: this was a hardcoded up-vector, so the twin shaded
    // against a perfect plane while the node path already had a three-rotation
    // slope field. Same field on both paths now, same split of terms as the
    // node path: the sharp Blinn lobe reads the perturbed normal, the broad
    // sun path stays flat.
    vec3 N = waterSlopeNormal(vWorldPos.xz, uTime, ${WATER_SLOPE_SCALE.toFixed(4)});
    vec3 H = normalize(uSunDirection + viewDir);
    float NdotH = max(dot(N, H), 0.0);
    float flatNdotH = max(dot(vec3(0.0, 1.0, 0.0), H), 0.0);
    float spec = pow(NdotH, 64.0);
    // Cycle 118 Phase 3 retired the cel sparkle pass. It was
    // step(0.85, spec) * step(0.55, sparkleMask) * uSparkleStrength - a binary
    // on/off speck, the "cel sparkles, quantized Blinn step()" line of the
    // anime stack. The continuous lobe below is the same energy without the
    // quantisation, and it leads the read the way the node path's does.
    float glintMask = waterValueNoise(vWorldPos.xz * 0.8 + vec2(uTime * 0.15));
    float shoreFade = waterGlintShoreFade(depthT);
    float rippleGlint = spec * (glintMask * 0.72 + 0.28) * shoreFade * uSparkleStrength;
    float sunGlint = pow(flatNdotH, 8.0) * uSunSpecularIntensity * (glintMask * 0.65 + 0.20) * shoreFade;
    float waveShade = waterWaveShade(N, uSunDirection);

    vec3 color = baseColor + uSunColor * (waveShade + rippleGlint * ${WATER_GLINT_GAIN_DEFAULTS.ripple.toFixed(2)} + sunGlint * ${WATER_GLINT_GAIN_DEFAULTS.broad.toFixed(2)});
    color = mix(color, uFoamColor, foamMask);
    // Cycle 118 Phase 3: the light response, after the foam mix for the same
    // reason the node path applies it there. This shader is unlit, so without it
    // the sea keeps noon brightness under a dusk that has taken the terrain
    // nearly to black.
    color *= waterSunLevel(normalize(uSunDirection).y);

    gl_FragColor = vec4(color, 1.0);

    #include <fog_fragment>
  }
`;

function getBoundaryUniforms(boundary) {
    // Cycle 64: coastline has no radius/center. Derive a bbox-centred disc for
    // the two-band deep/shallow colour gradient; the sharp shoreline foam is
    // heightfield-driven (uHasHeight) so it tracks the real boot coast anyway.
    if (boundary.kind === 'coastline' && Array.isArray(boundary.points)) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const p of boundary.points) {
            if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
        }
        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;
        const radius = Math.max(maxX - minX, maxZ - minZ) / 2;
        return {
            center: new THREE.Vector2(cx, cz),
            radius,
            falloff: boundary.falloff ?? 40,
        };
    }
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
    minDepthT,
    search,
    webgpuWaterFactories,
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

            // Cycle 118 Phase 2: derived from the one palette rather than
            // re-spelling the three hexes. Color.fromArray sets the working
            // (linear) components directly, which is what WATER_PALETTE_LINEAR
            // holds, so these are bit-identical to the old new THREE.Color(hex).
            uShallowColor: { value: new THREE.Color().fromArray(WATER_PALETTE_LINEAR.shallow) },
            uDeepColor: { value: new THREE.Color().fromArray(WATER_PALETTE_LINEAR.deep) },
            uFoamColor: { value: new THREE.Color().fromArray(WATER_PALETTE_LINEAR.foam) },

            uFoamThickness: { value: WATER_FOAM_THICKNESS },
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
    const materialResult = createWebGpuWaterMaterial('anime-water', 'createAnimeWaterMaterial', {
        createDefaultMaterial,
        search,
        factories: webgpuWaterFactories,
        context: {
            shoreline: {
                center: shoreline.center.clone(),
                radius: shoreline.radius,
                falloff: shoreline.falloff,
            },
            waterY,
            minDepthT,
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
            // sunColor and sunSpecularIntensity are DELIBERATELY not forwarded
            // (Cycle 118 Phase 3). Both are twin-side defaults, and the twin's
            // defaults are placeholders that the per-frame update overwrites -
            // but the node factory resolves `context.X ?? bootPacket.X`, so
            // forwarding them shadowed the boot packet and cost two things.
            //
            // sunSpecularIntensity: skyFogPresetTuning specifies 0.48 for both
            // water presets and could never take effect, because this always
            // supplied 0.6 and nothing repushes it per frame. It is live now, so
            // the preset knob is wired rather than dead - the plan required one
            // or the other and deleting it would have thrown away per-preset
            // control over the broad sun path Phase 3 is rebalancing.
            //
            // sunColor: THREE.Color(1, 1, 1), a placeholder, so the material was
            // BORN with a white sun and only stopped being white on the first
            // controls update. First-frame artefact, but a capture harness that
            // poses before that update photographs it. It now takes the boot
            // packet's skyFog.sunColor, which is the sun's real colour at boot.
            sunColorSource: 'skyFog.sunColor',
        },
    });
    const material = materialResult.material;
    material.userData = material.userData ?? {};
    material.userData.heightTexture = heightTex;
    material.userData.webgpuWaterMaterialControls = materialResult.controls;
    material.userData.webgpuWaterMaterialSummary = materialResult.summary;
    return material;
}

export function createAnimeWater({ boundary, heightfield = null, size = 4000, y = -0.05, segments = 64, minDepthT, search, webgpuWaterFactories }) {
    const material = createAnimeWaterMaterial({ boundary, heightfield, waterY: y, minDepthT, search, webgpuWaterFactories });
    const waterControls = material.userData?.webgpuWaterMaterialControls ?? null;
    const baseSparkleStrength = material.uniforms?.uSparkleStrength?.value ?? 0.7;
    let qualitySparkleScale = 1;
    // Cycle 118 Phase 5: the water owns its animation clock. It used to be
    // performance.now() read at the main.js call site, which could be neither
    // paused nor pinned, so no capture of the same pose came back twice the
    // same. Living here rather than on the game instance also keeps
    // js/main.js - and therefore the `main` chunk - free of any import from
    // the surface model.
    let clock = 0;

    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    mesh.receiveShadow = false;
    mesh.castShadow = false;

    return {
        mesh,
        material,
        webgpuWaterMaterialSummary: material.userData?.webgpuWaterMaterialSummary ?? null,
        get qualitySparkleScale() {
            return qualitySparkleScale;
        },
        /** Seconds of surface animation elapsed. */
        get clock() {
            return clock;
        },
        /**
         * Advance the surface clock by one frame. Holds while the sim is
         * paused, so a static capture keeps a still surface; the caller still
         * pushes sun state every frame, which is why this is separate from
         * update() rather than folded into it.
         */
        advanceClock(deltaTime, options) {
            clock = advanceWaterClock(clock, deltaTime, options);
            return clock;
        },
        /** Pin the surface to a known phase, so two captures can be compared. */
        setClock(seconds) {
            clock = Number.isFinite(seconds) ? Number(seconds) : 0;
            return clock;
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
