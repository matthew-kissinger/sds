/**
 * Grass Desktop Vertex Shader
 * Full wind animation and entity interaction
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

void main() {
    vUv = uv;
    vHeight = bladeData.y;

    vec3 pos = position;
    vec4 worldPos4 = modelMatrix * instanceMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos4.xyz;

    // Wind power - smooth curve, tips move more
    float windPower = vHeight * vHeight;

    // Sample noise texture for gentle organic wind
    vec2 noiseUV = vWorldPos.xz * 0.008 + time * windSpeed * 0.05;
    vec4 noise = texture2D(noiseTexture, noiseUV);

    // Gentle wave-based wind - zen-like swaying
    float wave1 = sin(vWorldPos.x * 0.03 + vWorldPos.z * 0.02 + time * 0.8) * 0.5 + 0.5;
    float wave2 = sin(vWorldPos.x * 0.02 - vWorldPos.z * 0.03 + time * 0.5) * 0.5 + 0.5;
    float combinedWave = (wave1 + wave2) * 0.5;

    // Smooth wind displacement
    vec2 windDisp = windDirection * combinedWave * windStrength * windPower;

    // Add subtle noise variation
    windDisp.x += (noise.r - 0.5) * 0.03 * windPower;
    windDisp.y += (noise.g - 0.5) * 0.03 * windPower;

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
