/**
 * Grass Mobile Vertex Shader
 * Simplified version - no wind animation for better performance
 *
 * Placeholders replaced at runtime:
 * - %MAX_INTERACTORS% - Maximum number of interactors (entities)
 */

attribute vec4 bladeData;

varying vec2 vUv;
varying vec3 vWorldPos;
varying float vHeight;
varying float vColorVariation;
varying float vShadow;

uniform vec3 interactorPositions[%MAX_INTERACTORS%];
uniform int interactorCount;
uniform float interactionRadius;
uniform float interactionStrength;

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

    float windPower = vHeight * vHeight;

    // Player interaction on mobile - grass bends AWAY
    vec3 totalPush = vec3(0.0);
    if (interactorCount > 0) {
        vec3 entityPos = interactorPositions[0];
        vec2 fromEntity = vWorldPos.xz - entityPos.xz;
        float dist = length(fromEntity);

        if (dist < interactionRadius && dist > 0.1) {
            float pushStrength = smoothFalloff(dist, interactionRadius) * interactionStrength;
            vec2 pushDir = normalize(fromEntity); // Points AWAY from entity
            totalPush.xz += pushDir * pushStrength * windPower;
            totalPush.y -= pushStrength * 0.15 * windPower;
        }
    }

    worldPos4.x += totalPush.x;
    worldPos4.z += totalPush.z;
    worldPos4.y += totalPush.y;

    vColorVariation = sin(vWorldPos.x * 0.2) * cos(vWorldPos.z * 0.15) * 0.5 + 0.5;
    vShadow = 1.0 - clamp(length(totalPush) * 0.1, 0.0, 0.15);

    gl_Position = projectionMatrix * viewMatrix * worldPos4;
}
