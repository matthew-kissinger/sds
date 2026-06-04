// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Grass Desktop Vertex Shader
 * Full wind animation and entity interaction
 *
 * NON-LIVE BACKUP. The live desktop grass shader is the inline string built by
 * GrassSystem.getDesktopVertexShader(); createGrassMaterial() never wires this
 * file. It uses an older world-axis ellipse interaction model and is kept only
 * as a fallback load path. Cycle 55 narrowed the live footprint and unified the
 * extents into GrassSystem.config.interaction; this backup was intentionally
 * NOT migrated to the oriented rounded-rect SDF, so do not treat it as the
 * source of truth for interaction width.
 *
 * Placeholders replaced at runtime:
 * - %MAX_INTERACTORS% - Maximum number of interactors (entities)
 * - %INTERACTION_RADIUS% - Player/dog interaction radius
 * - %SHEEP_INTERACTION_RADIUS% - Sheep interaction radius
 * - %INTERACTION_STRENGTH% - Player/dog push strength
 * - %SHEEP_INTERACTION_STRENGTH% - Sheep push strength
 */

// Cycle 12 Phase 4: pin precision at source. Sampling noiseTexture +
// computing wind/interaction displacement on Apple WebKit-on-Metal can
// silently downcast to mediump and cause grass blade jitter on iOS Safari
// — independent of the Mac white-ground bug but in the same hypothesis
// class as the sky/cloud precision fix.
precision highp float;
precision highp int;

uniform float time;
uniform sampler2D noiseTexture;
uniform float windStrength;
uniform float windSpeed;
uniform vec2 windDirection;
uniform float gustStrength;

uniform vec3 interactorPositions[%MAX_INTERACTORS%];
uniform float interactorData[%MAX_INTERACTORS%]; // w component: 0=player, 1=sheep
uniform int interactorCount;
uniform float interactionRadius;
uniform float interactionStrength;

attribute vec4 bladeData;

varying vec2 vUv;
varying vec3 vWorldPos;
varying float vHeight;
varying float vColorVariation;
varying float vShadow;

// Smooth falloff for interaction
float smoothFalloff(float dist, float radius) {
    float t = clamp(dist / radius, 0.0, 1.0);
    return 1.0 - t * t * (3.0 - 2.0 * t);
}

float hash11(float n) {
    return fract(sin(n) * 43758.5453123);
}

void main() {
    vUv = uv;
    vHeight = bladeData.y;

    vec3 pos = position;
    vec4 worldPos4 = modelMatrix * instanceMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos4.xyz;

    // Wind power — t² weighting keeps base anchored, tip gets full sway.
    float windPower = vHeight * vHeight;
    vec2 perp = vec2(-windDirection.y, windDirection.x);

    // Cycle 14 Phase 2: layered analytic wind (no texture sampling).
    // Gust envelope scrolls across world space along windDirection at
    // ~1.5 m/s; modulates two octaves of low-freq sway.
    vec2 windFlow = windDirection * time * 1.5;
    vec2 gustPos = vWorldPos.xz - windFlow;
    float gA = sin(gustPos.x * 0.045 + gustPos.y * 0.038);
    float gB = sin(gustPos.x * 0.022 + gustPos.y * 0.029 + 1.7);
    float gustEnv = smoothstep(-0.2, 1.0, gA * 0.6 + gB * 0.4);

    float t = time * windSpeed;
    float sway1 = sin(vWorldPos.x * 0.13 + vWorldPos.z * 0.09 + t * 0.85);
    float sway2 = sin(vWorldPos.x * 0.07 - vWorldPos.z * 0.11 + t * 0.55 + 1.3);
    float sway = sway1 * 0.6 + sway2 * 0.4;

    float carrier = 0.45 + sway * 0.5 * (0.4 + gustEnv * 0.8);
    vec2 windDisp = windDirection * carrier * windStrength * windPower;

    float bladeJitter = hash11(float(gl_InstanceID) * 0.137);
    windDisp *= 0.85 + bladeJitter * 0.3;

    // Tip-only flutter — leaf-tip shimmer on the top ~35% of the blade.
    float tipMask = smoothstep(0.65, 1.0, vHeight);
    float flutter = sin(vWorldPos.x * 0.7 + vWorldPos.z * 0.6 + time * 4.5 + bladeJitter * 6.28);
    windDisp += perp * flutter * 0.06 * tipMask * windStrength;

    // Entity interaction - grass bends AWAY from entities
    vec3 totalPush = vec3(0.0);
    for (int i = 0; i < %MAX_INTERACTORS%; i++) {
        if (i >= interactorCount) break;

        vec3 entityPos = interactorPositions[i];
        float entityType = interactorData[i]; // 0=player/dog, 1=sheep
        vec2 fromEntity = vWorldPos.xz - entityPos.xz;

        // Different radius/strength for player vs sheep
        float radius = entityType < 0.5 ? %INTERACTION_RADIUS% : %SHEEP_INTERACTION_RADIUS%;
        float strength = entityType < 0.5 ? %INTERACTION_STRENGTH% : %SHEEP_INTERACTION_STRENGTH%;

        // For player (entityType 0), use elliptical shape (longer body)
        float dist;
        if (entityType < 0.5) {
            // Elliptical distance - dog is longer than wide
            // Scale X more to make it narrower, keeping Z longer
            vec2 scaledDist = fromEntity * vec2(1.8, 1.0); // Narrower in X, full length in Z
            dist = length(scaledDist);
        } else {
            dist = length(fromEntity);
        }

        if (dist < radius && dist > 0.1) {
            float pushStrength = smoothFalloff(dist, radius) * strength;
            vec2 pushDir = normalize(fromEntity);
            totalPush.xz += pushDir * pushStrength * windPower;
            totalPush.y -= pushStrength * 0.1 * windPower;
        }
    }

    // Apply displacements
    worldPos4.x += windDisp.x + totalPush.x;
    worldPos4.z += windDisp.y + totalPush.z;
    worldPos4.y += totalPush.y;

    // Color variation based on world position
    vColorVariation = sin(vWorldPos.x * 0.2) * cos(vWorldPos.z * 0.15) * 0.5 + 0.5;

    // Subtle shadow from interaction
    vShadow = 1.0 - clamp(length(totalPush) * 0.15, 0.0, 0.2);

    gl_Position = projectionMatrix * viewMatrix * worldPos4;
}
