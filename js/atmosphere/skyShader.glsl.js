/**
 * Hosek-Wilkie analytic sky shader.
 *
 * Ported from terror-in-the-jungle's atmosphere module. The fragment shader
 * implements the per-channel radiance distribution function from Hosek &
 * Wilkie's 2012 paper "An Analytic Model for Full Spectral Sky-Dome
 * Radiance" using nine precomputed coefficients (A..I) supplied as uniforms.
 *
 * Coefficients are recomputed JS-side per sun position; see
 * HosekWilkieSky.updateSun().
 */

export const vertexShader = /* glsl */ `
    varying vec3 vWorldDirection;

    void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldDirection = normalize(worldPosition.xyz);

        // gl_Position.z = w forces depth = 1.0 so the sky always renders behind everything.
        vec4 clip = projectionMatrix * viewMatrix * vec4(worldPosition.xyz, 1.0);
        gl_Position = clip.xyww;
    }
`;

export const fragmentShader = /* glsl */ `
    precision highp float;

    varying vec3 vWorldDirection;

    uniform vec3 uSunDirection;     // normalized world-space sun direction
    uniform vec3 uA;                // Hosek-Wilkie coefficient A per RGB
    uniform vec3 uB;
    uniform vec3 uC;
    uniform vec3 uD;
    uniform vec3 uE;
    uniform vec3 uF;
    uniform vec3 uG;
    uniform vec3 uH;
    uniform vec3 uI;
    uniform vec3 uZenithRadiance;
    uniform float uExposure;
    uniform vec3 uGroundAlbedo;

    // Hosek-Wilkie radiance distribution:
    //   F(theta, gamma) = (1 + A * exp(B / (cos(theta) + 0.01)))
    //                   * (C + D * exp(E * gamma)
    //                       + F * cos(gamma)^2
    //                       + G * chi(H, gamma)
    //                       + I * sqrt(cos(theta)))
    // where chi is the Henyey-Greenstein-like Mie phase term.
    vec3 hosekWilkie(float cosTheta, float gamma, float cosGamma) {
        vec3 chi = (1.0 + cosGamma * cosGamma)
                 / pow(1.0 + uH * uH - 2.0 * uH * cosGamma, vec3(1.5));
        vec3 zenithFalloff = vec3(sqrt(max(cosTheta, 0.0)));

        return (1.0 + uA * exp(uB / (cosTheta + 0.01)))
             * (uC + uD * exp(uE * gamma)
                   + uF * (cosGamma * cosGamma)
                   + uG * chi
                   + uI * zenithFalloff);
    }

    // ACES filmic tonemapping (Narkowicz fit).
    vec3 acesFilm(vec3 x) {
        const float a = 2.51;
        const float b = 0.03;
        const float c = 2.43;
        const float d = 0.59;
        const float e = 0.14;
        return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    void main() {
        vec3 dir = normalize(vWorldDirection);

        // Below-horizon: soft fade from horizon colour to ground albedo so the
        // dome remains coherent when the camera tilts down past the horizon.
        if (dir.y < 0.0) {
            float t = clamp(-dir.y * 4.0, 0.0, 1.0);
            vec3 horizonCol = acesFilm(uZenithRadiance * uExposure * 0.6);
            vec3 groundCol = uGroundAlbedo * 0.5;
            gl_FragColor = vec4(mix(horizonCol, groundCol, t), 1.0);
            return;
        }

        float cosTheta = max(dir.y, 0.0);                          // angle from zenith
        float cosGamma = clamp(dot(dir, uSunDirection), -1.0, 1.0); // angle from sun
        float gamma = acos(cosGamma);

        vec3 radiance = uZenithRadiance * hosekWilkie(cosTheta, gamma, cosGamma);
        gl_FragColor = vec4(acesFilm(radiance * uExposure), 1.0);
    }
`;
