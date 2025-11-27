/**
 * Sheep Vertex Shader
 * GPU-based animation for instanced sheep rendering
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

    vNormal = normalMatrix * normal;

    // Animate vertex position
    vec3 animatedPosition = animateVertex(position, vertexId);

    // Apply instance transformation with proper matrix multiplication
    vec4 instancePosition = instanceMatrix * vec4(animatedPosition, 1.0);

    vec4 mvPosition = modelViewMatrix * instancePosition;
    vViewPosition = -mvPosition.xyz;

    gl_Position = projectionMatrix * mvPosition;
}
