/**
 * Sheep Fragment Shader
 * Simple toon shading with fog support
 */

varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vViewPosition;

uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;

void main() {
    // Simple toon shading
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);

    // Basic lighting
    vec3 lightDir = normalize(vec3(0.3, 1.0, 0.5));
    float NdotL = dot(normal, lightDir);

    // Toon shading steps
    float toon = smoothstep(0.0, 0.01, NdotL) * 0.5 + 0.5;
    toon = floor(toon * 3.0) / 3.0;

    // Apply vertex color with toon shading
    vec3 finalColor = vColor * toon;

    // Apply fog
    float depth = length(vViewPosition);
    float fogFactor = smoothstep(fogNear, fogFar, depth);
    finalColor = mix(finalColor, fogColor, fogFactor);

    gl_FragColor = vec4(finalColor, 1.0);
}
