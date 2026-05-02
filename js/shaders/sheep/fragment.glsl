/**
 * Sheep Fragment Shader - Premium Wool Edition
 * Enhanced toon shading with wool texture, rim lighting, and SSS
 */

varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vWorldPosition;
varying float vDisplacement;
varying float vIsBody;
varying float vVertexId;

uniform float time;
uniform vec3 fogColor;
uniform float fogDensity;

// Noise functions for wool texture
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

float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 3; i++) {
        value += amplitude * noise(p);
        p *= 2.2;
        amplitude *= 0.5;
    }
    return value;
}

void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    vec3 lightDir = normalize(vec3(0.3, 1.0, 0.5));

    // Perturb normal with high-frequency noise for micro-detail (body only)
    vec3 perturbedNormal = normal;
    if (vIsBody > 0.5) {
        vec3 noisePos = vWorldPosition * 10.0;
        float n = fbm(noisePos);
        perturbedNormal = normalize(normal + vec3(n - 0.5) * 0.3);
    }

    float NdotL = dot(perturbedNormal, lightDir);

    // Enhanced toon shading with 5 levels
    float toon = smoothstep(-0.15, 0.15, NdotL) * 0.55 + 0.45;
    toon = floor(toon * 5.0) / 5.0;

    // Subtle color shift (neutral - no brown/warm tints)
    vec3 warmShift = vec3(1.02, 1.02, 1.0);
    vec3 coolShift = vec3(0.96, 0.97, 1.0);
    vec3 colorShift = mix(coolShift, warmShift, toon);

    // Base color with subtle wool variation (pure black and white, no brown)
    vec3 woolColor = vColor;
    if (vIsBody > 0.5) {
        float woolNoise = fbm(vWorldPosition * 6.0);
        woolColor -= vec3(0.03) * (1.0 - woolNoise); // Subtle dark patches
        woolColor += vec3(0.02) * woolNoise; // Pure white highlights (no warm tint)
    }

    vec3 finalColor = woolColor * toon * colorShift;

    // Fresnel rim lighting (fluffy edge glow - pure white)
    float fresnel = pow(1.0 - abs(dot(viewDir, normal)), 2.8);
    vec3 rimColor = vec3(1.0, 1.0, 1.0);
    finalColor += rimColor * fresnel * 0.35 * vIsBody;

    // Fake subsurface scattering (neutral backlight - no warm/brown tint)
    float sss = max(0.0, dot(-lightDir, viewDir));
    sss = pow(sss, 3.0) * 0.12;
    finalColor += vec3(1.0, 1.0, 0.98) * sss * vIsBody;

    // Edge darkening for definition
    float edge = 1.0 - pow(abs(dot(viewDir, normal)), 0.7);
    finalColor *= 1.0 - edge * 0.2 * vIsBody;

    // Subtle displacement-based shading
    finalColor -= vec3(0.03) * vDisplacement * 1.5;

    // FogExp2 — matches scene.fog (driven per-frame by Atmosphere to the
    // sky horizon color). Without this, sheep faded to a hardcoded sky-blue
    // while terrain faded to the warm horizon, making far sheep look blue.
    float depth = length(vViewPosition);
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * depth * depth);
    finalColor = mix(finalColor, fogColor, fogFactor);

    gl_FragColor = vec4(finalColor, 1.0);
}
