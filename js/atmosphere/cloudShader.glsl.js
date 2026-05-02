/**
 * Procedural cloud shader source for `CloudLayer.js`. Ported from Terror
 * in the Jungle's `CloudLayer.ts` (planar fbm field) with one structural
 * fix: the SDS-side mesh is rendered slightly tilted on its long axis so
 * its boundary feathers across multiple horizon cells, hiding the hard
 * tile edge the previous version exposed when the camera looked along
 * the tile's seam at low altitude. The shader itself is verbatim.
 */

export const cloudVertexShader = /* glsl */ `
// Cycle 12 Phase 4: pin precision at source so Apple WebKit-on-Metal
// doesn't downcast in the cloud-noise math. See skyShader.glsl.js
// for the full hypothesis.
precision highp float;
precision highp int;

varying vec2 vWorldXZ;
varying vec2 vPlaneUv;
varying vec3 vWorldPos;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldXZ = worldPos.xz;
  vPlaneUv = uv;
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const cloudFragmentShader = /* glsl */ `
precision highp float;
precision highp int;

varying vec2 vWorldXZ;
varying vec2 vPlaneUv;
varying vec3 vWorldPos;

uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uCoverage;
uniform float uEdgeFade;
uniform float uNoiseScale;
uniform float uTimeSeconds;
uniform vec2 uWindDir;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * valueNoise(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return v;
}

void main() {
  vec2 wind = length(uWindDir) > 0.0001 ? normalize(uWindDir) : vec2(0.0);
  vec2 windOffset = wind * uTimeSeconds * 10.0;
  vec2 uv = (vWorldXZ + windOffset) * uNoiseScale;

  vec2 bigUv = uv * 0.2;
  float bigField = 0.5 + 0.5 * smoothstep(0.20, 0.70, fbm(bigUv));

  float base = fbm(uv);

  float lowerEdge = mix(1.0, -0.4, clamp(uCoverage, 0.0, 1.0));
  float upperEdge = lowerEdge + 0.35;
  float mask = smoothstep(lowerEdge, upperEdge, base);
  mask *= bigField;

  if (mask <= 0.001) {
    discard;
  }

  float e = 1.0;
  float nx = fbm(uv + vec2(e, 0.0)) - fbm(uv - vec2(e, 0.0));
  float nz = fbm(uv + vec2(0.0, e)) - fbm(uv - vec2(0.0, e));
  vec3 puffNormal = normalize(vec3(-nx, 0.5, -nz));
  float sunLight = max(0.0, dot(puffNormal, normalize(uSunDirection)));
  float shade = mix(0.55, 1.15, sunLight);

  vec3 baseColor = vec3(0.95, 0.95, 0.98);
  vec3 color = baseColor * mix(uSunColor, vec3(1.0), 0.5) * shade;

  float alpha = mask * mix(0.55, 0.95, clamp(uCoverage, 0.0, 1.0));
  // Footprint feather widened from 0.035 -> 0.08 so the finite plane edge
  // never reads as a tile seam at any view angle. Pair with the tilted
  // mesh in CloudLayer.js to spread the seam across multiple horizon
  // cells.
  float edgeDist = min(min(vPlaneUv.x, 1.0 - vPlaneUv.x), min(vPlaneUv.y, 1.0 - vPlaneUv.y));
  float footprintFade = smoothstep(0.0, 0.08, edgeDist);
  vec3 viewDir = normalize(vWorldPos - cameraPosition);
  // Cycle 7 Phase 1.5 (round 4): horizonFade upper end widened from 0.18
  // to 0.85 so the smoothstep never saturates within the visible upper
  // hemisphere. The prior 0.18 value created a sharp horizontal "line"
  // at ~10° elevation where the planar cloud layer slammed to full
  // opacity; now alpha grows continuously from 0 at horizon to ~1 near
  // zenith, hiding the fact that the layer is a flat plane.
  float horizonFade = smoothstep(0.02, 0.85, abs(viewDir.y));
  alpha *= uEdgeFade * footprintFade * horizonFade;

  if (alpha <= 0.001) {
    discard;
  }

  gl_FragColor = vec4(color, alpha);
}
`;
