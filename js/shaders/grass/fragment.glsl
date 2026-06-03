// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Grass Fragment Shader
 * Rich color gradients with fog and lighting effects
 */

precision highp float;

uniform vec3 baseColor;
uniform vec3 midColor;
uniform vec3 tipColor;
uniform vec3 fogColor;
uniform float fogDensity;
uniform vec3 uCameraPos;
uniform vec3 uSunDirection;

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

    vec3 toCamera = normalize(uCameraPos - vWorldPos);
    float backlight = 1.0 + (1.0 - abs(dot(toCamera, vec3(0.0, 1.0, 0.0)))) * vHeight * 0.15;
    color *= backlight;

    // Cycle 14 Phase 2 fake-SSS: sun-aligned back-lit term. pow^4 keeps
    // the halo tight to the sun silhouette so the rim only fires on
    // sunrise/sunset compositions.
    vec3 toSun = normalize(uSunDirection);
    float tipMask = smoothstep(0.6, 1.0, vHeight);
    float backlitSun = pow(max(dot(toCamera, -toSun), 0.0), 4.0);
    color += backlitSun * tipColor * 0.7 * tipMask;

    // Soft vertical rim — generic ambient lift on tips.
    float verticalRim = pow(max(dot(toCamera, vec3(0.0, 1.0, 0.0)), 0.0), 4.0);
    color += verticalRim * tipColor * 0.2 * tipMask;

    // FogExp2 — matches scene.fog (kept in sync with the sky horizon).
    float dist = length(vWorldPos - uCameraPos);
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
    color = mix(color, fogColor, fogFactor);

    gl_FragColor = vec4(color, 1.0);
}
