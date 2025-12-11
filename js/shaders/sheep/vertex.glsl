/**
 * Sheep Vertex Shader - Premium Wool Edition
 * GPU-based animation with fluffy wool displacement
 */

// Use built-in color attribute from Three.js
attribute float vertexId;

// Per-instance attributes
attribute vec4 instanceData; // x: animPhase, y: speed, z: state, w: uniqueId
attribute vec4 instanceAnimation; // x: walkCycle, y: bounce, z: direction, w: blinkTimer

uniform float time;
uniform float globalAnimSpeed;

varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vWorldPosition;
varying float vDisplacement;
varying float vIsBody;
varying float vVertexId;

// Noise functions for wool displacement
float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
            mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
            mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

// Animation functions
vec3 animateVertex(vec3 position, float vId) {
    vec3 animated = position;

    float animPhase = instanceData.x;
    float speed = instanceData.y;
    float walkCycle = instanceAnimation.x;
    float bounce = instanceAnimation.y;

    // Leg animation (vertexId 100-139)
    if (vId >= 100.0 && vId < 140.0) {
        float legIndex = floor((vId - 100.0) / 10.0); // 0-3
        float legPhase = legIndex < 2.0 ? 0.0 : 3.14159; // Front/back offset
        float sidePhase = mod(legIndex, 2.0) * 1.57; // Left/right offset

        float legTime = time * globalAnimSpeed + animPhase + walkCycle;
        float legLift = max(0.0, sin(legTime * 3.0 + legPhase + sidePhase)) * bounce * 2.0;

        animated.y += legLift * speed;

        // Slight forward/back motion
        animated.z += sin(legTime * 3.0 + legPhase + sidePhase) * bounce * 0.3 * speed;
    }

    // Body bounce (vertexId 0-49)
    if (vId < 50.0) {
        float bodyTime = time * globalAnimSpeed + animPhase;
        animated.y += sin(bodyTime * 2.0) * bounce * 0.5 * speed;

        // Slight wobble
        animated.x += sin(bodyTime * 2.5) * bounce * 0.1 * speed;
    }

    // Head bob (vertexId 50-99)
    if (vId >= 50.0 && vId < 100.0) {
        float headTime = time * globalAnimSpeed + animPhase + 0.5;
        animated.y += sin(headTime * 2.0) * bounce * 0.3 * speed;

        // Look direction
        float lookAngle = instanceAnimation.z;
        animated.x += sin(lookAngle) * 0.1;
        animated.z += cos(lookAngle) * 0.1;
    }

    return animated;
}

void main() {
    // Access vertex color using built-in Three.js attribute
    #ifdef USE_COLOR
        vColor = color;
    #else
        vColor = vec3(1.0); // Default to white if no vertex colors
    #endif

    vVertexId = vertexId;
    vIsBody = vertexId < 50.0 ? 1.0 : 0.0;

    // Animate vertex position
    vec3 animatedPosition = animateVertex(position, vertexId);

    // Multi-octave displacement for realistic wool (body only)
    vDisplacement = 0.0;
    if (vIsBody > 0.5) {
        float uniqueId = instanceData.w;
        vec3 noisePos1 = position * 5.0 + vec3(time * 0.2) + vec3(uniqueId * 0.1);
        vec3 noisePos2 = position * 12.0 + vec3(time * 0.4) + vec3(uniqueId * 0.2);
        float displacement = noise(noisePos1) * 0.08 + noise(noisePos2) * 0.03;
        animatedPosition += normal * displacement;
        vDisplacement = displacement;

        // Gentle breathing
        float breathe = sin(time * 1.8 + instanceData.x) * 0.012;
        animatedPosition.y += breathe;
        animatedPosition.x += sin(time * 1.2 + instanceData.x) * 0.004; // Slight sway
    }

    vNormal = normalMatrix * normal;

    // Apply instance transformation with proper matrix multiplication
    vec4 instancePosition = instanceMatrix * vec4(animatedPosition, 1.0);
    vWorldPosition = instancePosition.xyz;

    vec4 mvPosition = modelViewMatrix * instancePosition;
    vViewPosition = -mvPosition.xyz;

    gl_Position = projectionMatrix * mvPosition;
}
