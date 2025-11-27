/**
 * Grass Fragment Shader
 * Rich color gradients with fog and lighting effects
 */

precision highp float;

uniform vec3 baseColor;
uniform vec3 midColor;
uniform vec3 tipColor;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform vec3 uCameraPos;

varying vec2 vUv;
varying vec3 vWorldPos;
varying float vHeight;
varying float vColorVariation;
varying float vShadow;

void main() {
    // Rich three-point color gradient
    vec3 color;
    if (vHeight < 0.4) {
        color = mix(baseColor, midColor, vHeight / 0.4);
    } else {
        color = mix(midColor, tipColor, (vHeight - 0.4) / 0.6);
    }

    // Add natural color variation
    vec3 variation = vec3(
        vColorVariation * 0.08,
        vColorVariation * 0.05 - 0.02,
        -vColorVariation * 0.03
    );
    color += variation;

    // Apply shadow from interaction
    color *= vShadow;

    // Subtle ambient occlusion at base
    float ao = 0.7 + 0.3 * vHeight;
    color *= ao;

    // Slight translucency effect at tips (brighter when backlit)
    vec3 toCamera = normalize(uCameraPos - vWorldPos);
    float backlight = 1.0 + (1.0 - abs(dot(toCamera, vec3(0.0, 1.0, 0.0)))) * vHeight * 0.15;
    color *= backlight;

    // Distance fog
    float dist = length(vWorldPos - uCameraPos);
    float fogFactor = smoothstep(fogNear, fogFar, dist);
    color = mix(color, fogColor, fogFactor);

    gl_FragColor = vec4(color, 1.0);
}
