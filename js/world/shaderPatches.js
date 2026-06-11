// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Material/shader patches extracted from `TerrainBuilder` in Cycle 28
 * Stream B2: tree wind sway, rock fresnel rim-light, and per-frame
 * impostor tinting.
 *
 * Each function reads/writes the same builder fields the original
 * methods did (`builder._patchedTreeMaterials`, `builder._treeWind`,
 * `builder._rockShader`, `builder._impostorMaterials`,
 * `builder._occluder`). Behavior is unchanged.
 */

import * as THREE from 'three';

import { patchMaterialOccluder } from '../shaders/OccluderFadePatch.js';

/**
 * Patch a leaf material with a wind-sway vertex shader.
 *
 * @param {object} builder
 * @param {THREE.Material} material
 * @param {number} bboxMinY GLB bbox min.y.
 * @param {number} bboxMaxY GLB bbox max.y.
 */
export function patchTreeWindMaterial(builder, material, bboxMinY, bboxMaxY) {
    if (!material || builder._patchedTreeMaterials.has(material)) return;
    builder._patchedTreeMaterials.add(material);

    // Cycle 22 Phase B: alphaHash stochastic transparency. Kills the hard
    // alphaTest cutoff edge that snaps leaves on/off as alpha ramps near
    // the test threshold.
    if (material.transparent !== true) {
        material.alphaHash = true;
    }

    // Cycle 23 Phase A2: camera-to-dog occluder fade.
    patchMaterialOccluder(material, builder._occluder);

    const uTime = builder._treeWind.uTime;
    const uWindStrength = builder._treeWind.uWindStrength;
    const uWindDirection = builder._treeWind.uWindDirection;
    const uTreeBaseY = { value: bboxMinY };
    const uTreeTopY = { value: bboxMaxY };

    const prev = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
        if (typeof prev === 'function') prev(shader, renderer);
        shader.uniforms.uTime = uTime;
        shader.uniforms.uWindStrength = uWindStrength;
        shader.uniforms.uWindDirection = uWindDirection;
        shader.uniforms.uTreeBaseY = uTreeBaseY;
        shader.uniforms.uTreeTopY = uTreeTopY;

        // Cycle 91: the re-baked leaf cards carry rounded canopy normals
        // (geometry normals pointing outward from each card's origin,
        // ez-tree main #43). The default double-sided backface flip
        // (`normal *= faceDirection`) inverts them on back-facing cards,
        // shading half the canopy as if lit from inside. Skip the flip on
        // double-sided tree materials, mirroring ez-tree's own shader.
        if (material.side === THREE.DoubleSide) {
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_begin>',
                THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '')
            );
        }

        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                [
                    '#include <common>',
                    'uniform float uTime;',
                    'uniform float uWindStrength;',
                    'uniform vec2 uWindDirection;',
                    'uniform float uTreeBaseY;',
                    'uniform float uTreeTopY;'
                ].join('\n')
            )
            .replace(
                '#include <project_vertex>',
                [
                    'vec4 mvPosition = vec4( transformed, 1.0 );',
                    '#ifdef USE_INSTANCING',
                    '  mvPosition = instanceMatrix * mvPosition;',
                    '#endif',
                    '{',
                    '  // Vertical fraction up the tree (0=base, 1=top).',
                    '  float treeRange = max(uTreeTopY - uTreeBaseY, 0.001);',
                    '  float posY01 = clamp((position.y - uTreeBaseY) / treeRange, 0.0, 1.0);',
                    '  float windWeight = smoothstep(0.25, 1.0, posY01);',
                    '  windWeight *= windWeight;',
                    '  if (windWeight > 0.001) {',
                    '    vec3 worldPos = (modelMatrix * mvPosition).xyz;',
                    '    vec2 perp = vec2(-uWindDirection.y, uWindDirection.x);',
                    '    vec2 windFlow = uWindDirection * uTime * 1.2;',
                    '    vec2 gustPos = worldPos.xz - windFlow;',
                    '    float gA = sin(gustPos.x * 0.04 + gustPos.y * 0.034);',
                    '    float gB = sin(gustPos.x * 0.018 + gustPos.y * 0.022 + 1.4);',
                    '    float gustEnv = smoothstep(-0.2, 1.0, gA * 0.6 + gB * 0.4);',
                    '    float sway1 = sin(worldPos.x * 0.15 + worldPos.z * 0.11 + uTime * 0.85);',
                    '    float sway2 = sin(worldPos.x * 0.07 - worldPos.z * 0.13 + uTime * 0.55);',
                    '    float sway = sway1 * 0.6 + sway2 * 0.4;',
                    '    float carrier = sway * (0.4 + gustEnv * 0.8);',
                    '    vec2 windDisp = uWindDirection * carrier * uWindStrength * 0.18 * windWeight;',
                    '    float flutter = sin(worldPos.x * 0.6 + worldPos.z * 0.5 + uTime * 4.5);',
                    '    windDisp += perp * flutter * 0.05 * windWeight * uWindStrength;',
                    '    mvPosition.xz += windDisp;',
                    '  }',
                    '}',
                    'mvPosition = modelViewMatrix * mvPosition;',
                    'gl_Position = projectionMatrix * mvPosition;'
                ].join('\n')
            );
    };
    material.needsUpdate = true;
}

/**
 * Walk every tree-type GLB cached on `builder.models.trees` and apply the
 * leaf-wind shader patch to each child material. The WeakSet guard makes
 * re-invocation a no-op.
 *
 * @param {object} builder
 */
export function setupTreeWind(builder) {
    for (const treeType of Object.keys(builder.models.trees)) {
        const model = builder.models.trees[treeType];
        if (!model) continue;
        const minY = model.userData?.modelBboxMinY ?? 0;
        const maxY = model.userData?.modelBboxMaxY ?? 1;
        model.traverse(child => {
            if (!child.isMesh || !child.material) return;
            if (Array.isArray(child.material)) {
                child.material.forEach(m => patchTreeWindMaterial(builder, m, minY, maxY));
            } else {
                patchTreeWindMaterial(builder, child.material, minY, maxY);
            }
        });
    }
}

/**
 * Cycle 14 Phase 4: patch a rock material with a fresnel rim-light shader.
 * Per docs/archive/research/research-rocks-and-scatter-2026-05.md, rim-light
 * is the single biggest "AAA tell" for stylized rocks — brightens the
 * silhouette against grass without changing geometry.
 *
 * @param {object} builder
 * @param {THREE.Material} material
 */
export function patchRockMaterial(builder, material) {
    if (!material || builder._patchedRockMaterials.has(material)) return;
    builder._patchedRockMaterials.add(material);

    const uRimColor = builder._rockShader.uRimColor;
    const uRimStrength = builder._rockShader.uRimStrength;

    const prev = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
        if (typeof prev === 'function') prev(shader, renderer);
        shader.uniforms.uRimColor = uRimColor;
        shader.uniforms.uRimStrength = uRimStrength;

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                [
                    '#include <common>',
                    'uniform vec3 uRimColor;',
                    'uniform float uRimStrength;'
                ].join('\n')
            )
            .replace(
                '#include <emissivemap_fragment>',
                [
                    '#include <emissivemap_fragment>',
                    '{',
                    '  vec3 viewDir = normalize(vViewPosition);',
                    '  float ndv = max(dot(viewDir, normal), 0.0);',
                    '  float rockRim = pow(1.0 - ndv, 2.0);',
                    '  totalEmissiveRadiance += rockRim * uRimColor * uRimStrength;',
                    '}'
                ].join('\n')
            );
    };
    material.needsUpdate = true;
}

/**
 * Walk every rock-type GLB and apply the rim-light patch. WeakSet guard
 * makes re-invocation a no-op across scene swaps.
 *
 * @param {object} builder
 */
export function setupRockShader(builder) {
    for (const rockType of Object.keys(builder.models.rocks)) {
        const model = builder.models.rocks[rockType];
        if (!model) continue;
        model.traverse(child => {
            if (!child.isMesh || !child.material) return;
            if (Array.isArray(child.material)) {
                child.material.forEach(m => patchRockMaterial(builder, m));
            } else {
                patchRockMaterial(builder, child.material);
            }
        });
    }
}

/**
 * Update the shared rock-rim color from the atmosphere's sun light. Called
 * per-frame so rim hue tracks sunrise/sunset.
 *
 * @param {object} builder
 * @param {THREE.Color} color
 */
export function setRockRimColor(builder, color) {
    if (!color || !builder._rockShader) return;
    builder._rockShader.uRimColor.value.copy(color);
}

/**
 * Cycle 17 follow-up: tint cross-billboard tree impostors by the current
 * sun light color so they track time-of-day. Cycle 20 Phase 2 split this
 * into two paths — kiln impostors run proper per-fragment relighting
 * (consume sunColor + sunDirWorld + ambientColor); cross-billboard
 * fallback keeps the Cycle 19 sun-luma boost.
 *
 * @param {object} builder
 * @param {THREE.Color} sunColor
 * @param {THREE.Vector3 | null} [sunDirWorld]
 * @param {THREE.Color | null} [ambientColor]
 * @param {number} [sunIntensity]
 * @param {number} [ambientIntensity]
 */
// Cycle 91 Phase 4: hoisted per-frame scratch (setImpostorTint runs every
// frame; the two Color allocations per call were measurable GC churn).
const _tintScratch = new THREE.Color();
// Cycle 20 v4: ground-bounce hemi term. Foliage research recipe
// (Megascans / IceFall / NedMakesGames URP): shadow side of canopy must
// pick up SOME chromatic bounce, not flat-grey ambient, or impostor reads
// desaturated vs LOD0. Synthesize the bounce color by tilting the current
// ambient toward a warm earth tone — half-strength of the sky-side fill.
const GROUND_BOUNCE_TILT = new THREE.Color(0.85, 0.70, 0.55);
const GROUND_BOUNCE_SCALE = 0.5;

export function setImpostorTint(builder, sunColor, sunDirWorld = null, ambientColor = null, sunIntensity = 1, ambientIntensity = 1) {
    if (!sunColor || !builder._impostorMaterials) return;

    // Cross-billboard fallback path — kiln impostors do proper relighting and
    // need no pre-multiplied tint hack.
    const BLEND = 0.35;
    const tmp = _tintScratch.set(0xffffff).lerp(sunColor, BLEND);
    const lum = 0.299 * sunColor.r + 0.587 * sunColor.g + 0.114 * sunColor.b;
    const boost = 1.0 + 0.20 * Math.max(0, Math.min(1, lum));
    tmp.multiplyScalar(boost);

    for (const mat of builder._impostorMaterials) {
        if (mat.userData?.isKilnImpostor) {
            const controls = mat.userData?.webgpuImpostorMaterialControls;
            if (controls?.setTint) {
                controls.setTint({
                    sunColor,
                    sunDirWorld,
                    ambientColor,
                    sunIntensity,
                    ambientIntensity,
                    groundBounceTilt: GROUND_BOUNCE_TILT,
                    groundBounceScale: GROUND_BOUNCE_SCALE,
                    material: mat,
                });
                continue;
            }
            if (!mat.uniforms?.uSunColor || !mat.uniforms?.uSunDirWorld || !mat.uniforms?.uAmbientColor || !mat.uniforms?.uGroundBounceColor) {
                continue;
            }
            mat.uniforms.uSunColor.value
                .copy(sunColor)
                .multiplyScalar(sunIntensity);
            if (sunDirWorld) mat.uniforms.uSunDirWorld.value.copy(sunDirWorld);
            if (ambientColor) {
                mat.uniforms.uAmbientColor.value
                    .copy(ambientColor)
                    .multiplyScalar(ambientIntensity);
                mat.uniforms.uGroundBounceColor.value
                    .copy(ambientColor)
                    .multiply(GROUND_BOUNCE_TILT)
                    .multiplyScalar(ambientIntensity * GROUND_BOUNCE_SCALE);
            } else {
                // Default ambient when atmosphere hasn't bound yet — use Three's
                // physical-light convention (color × π).
                const fallback = 0.7 * Math.PI;
                mat.uniforms.uAmbientColor.value.setRGB(fallback, fallback, fallback);
                mat.uniforms.uGroundBounceColor.value.setRGB(
                    fallback * GROUND_BOUNCE_TILT.r * GROUND_BOUNCE_SCALE,
                    fallback * GROUND_BOUNCE_TILT.g * GROUND_BOUNCE_SCALE,
                    fallback * GROUND_BOUNCE_TILT.b * GROUND_BOUNCE_SCALE,
                );
            }
        } else if (mat.color) {
            // Cross-billboard fallback path.
            mat.color.copy(tmp);
        }
    }

    // Cycle 20 v4 debug tap: surface the latest input + first impostor
    // material's uniforms via window so the LOD-color-match sandbox /
    // playwright_evaluate can introspect the live values. Cycle 91 Phase 4:
    // gated on ?probeRender=1 - rebuilding this object (toArray allocations,
    // a filter pass) every frame in production fed the GC for no consumer.
    if (builder._probeRender && typeof window !== 'undefined') {
        const firstKiln = builder._impostorMaterials.find(m => m.userData?.isKilnImpostor);
        window.__sdsImpostorProbe = {
            input: {
                sunColor: sunColor ? sunColor.toArray() : null,
                sunIntensity,
                sunDirWorld: sunDirWorld ? sunDirWorld.toArray() : null,
                ambientColor: ambientColor ? ambientColor.toArray() : null,
                ambientIntensity,
            },
            live: buildLiveImpostorProbe(firstKiln),
            count: builder._impostorMaterials.filter(m => m.userData?.isKilnImpostor).length,
            scene: builder.scene,
            trees: builder.trees,
            kilnMaterial: firstKiln,
        };
    }
}

function buildLiveImpostorProbe(material) {
    if (!material) return null;
    if (
        material.uniforms?.uSunColor
        && material.uniforms?.uAmbientColor
        && material.uniforms?.uGroundBounceColor
        && material.uniforms?.uSunDirWorld
    ) {
        return {
            materialMode: 'shader-uniforms',
            uSunColor: material.uniforms.uSunColor.value.toArray(),
            uAmbientColor: material.uniforms.uAmbientColor.value.toArray(),
            uGroundBounceColor: material.uniforms.uGroundBounceColor.value.toArray(),
            uSunDirWorld: material.uniforms.uSunDirWorld.value.toArray(),
            uWrapPow: material.uniforms.uWrapPow?.value ?? null,
            uSubsurfaceLift: material.uniforms.uSubsurfaceLift?.value ?? null,
        };
    }
    const controls = material.userData?.webgpuImpostorMaterialControls;
    return {
        materialMode: material.isNodeMaterial ? 'node-material' : 'factory-material',
        hasSetTintControl: typeof controls?.setTint === 'function',
        summary: material.userData?.webgpuImpostorMaterialSummary ?? null,
    };
}
