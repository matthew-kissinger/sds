/**
 * Verbatim port of Terror in the Jungle's `hosekWilkie.glsl.ts`. The shader
 * implements a Preetham 1999 analytic sky model (the de facto standard used
 * by Three.js's `examples/jsm/objects/Sky.js`) wrapped in a "Hosek-Wilkie"
 * facade so the consumer-visible behaviour matches the brief: real sun
 * color, smooth zenith->horizon gradient, ground albedo bounce, optional
 * sky-integrated cloud cover.
 *
 * The CPU-side LUT bake in `HosekWilkieSky.js` mirrors this math so any
 * caller sampling sky color (fog tint, hemisphere lighting) sees values
 * consistent with what the dome paints. Source:
 *   X/games-3d/terror-in-the-jungle/src/systems/environment/atmosphere/hosekWilkie.glsl.ts
 */

export const hosekWilkieVertexShader = /* glsl */ `
varying vec3 vWorldDirection;
varying vec3 vSunDirection;
varying float vSunfade;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;

uniform vec3 uSunDirection;
uniform float uTurbidity;
uniform float uRayleigh;
uniform float uMieCoefficient;

const float e = 2.71828182845904523536028747135266249775724709369995957;
const float pi = 3.141592653589793238462643383279502884197169;

// Wavelength-tuned Rayleigh + Mie totals (Preetham primaries 680/550/450 nm).
const vec3 totalRayleigh = vec3( 5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5 );
const float v = 4.0;
const vec3 K = vec3( 0.686, 0.678, 0.666 );
const vec3 MieConst = vec3( 1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14 );

// Earth shadow falloff so sun radiance vanishes below the horizon.
const float cutoffAngle = 1.6110731556870734;
const float steepness = 1.5;
const float EE = 1000.0;

float sunIntensity( float zenithCos ) {
  zenithCos = clamp( zenithCos, -1.0, 1.0 );
  return EE * max( 0.0, 1.0 - pow( e, -( ( cutoffAngle - acos( zenithCos ) ) / steepness ) ) );
}

vec3 totalMie( float T ) {
  float c = ( 0.2 * T ) * 10e-18;
  return 0.434 * c * MieConst;
}

void main() {
  vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
  vWorldDirection = normalize( worldPosition.xyz - cameraPosition );

  // Skybox stays glued to the far plane so it never z-fights with terrain
  // and never clips when pilots climb past the dome radius.
  vec4 clip = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position = clip.xyww;

  vSunDirection = normalize( uSunDirection );
  vSunE = sunIntensity( vSunDirection.y );
  // Higher sun = more saturated rayleigh (deeper blue at noon).
  vSunfade = 1.0 - clamp( 1.0 - exp( vSunDirection.y ), 0.0, 1.0 );
  float rayleighCoeff = uRayleigh - ( 1.0 - vSunfade );
  vBetaR = totalRayleigh * rayleighCoeff;
  vBetaM = totalMie( uTurbidity ) * uMieCoefficient;
}
`;

export const hosekWilkieFragmentShader = /* glsl */ `
varying vec3 vWorldDirection;
varying vec3 vSunDirection;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;
varying float vSunfade;

uniform float uMieDirectionalG;
uniform vec3 uGroundAlbedo;
uniform float uExposure;
uniform float uCloudCoverage;
uniform float uCloudNoiseScale;
uniform float uCloudTimeSeconds;
uniform vec2 uCloudWindDir;

const vec3 up = vec3( 0.0, 1.0, 0.0 );
const float pi = 3.141592653589793238462643383279502884197169;
const float rayleighZenithLength = 8.4e3;
const float mieZenithLength = 1.25e3;
const float sunAngularDiameterCos = 0.9998;
const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
const float ONE_OVER_FOURPI = 0.07957747154594767;

float hash21( vec2 p ) {
  p = fract( p * vec2( 123.34, 456.21 ) );
  p += dot( p, p + 45.32 );
  return fract( p.x * p.y );
}

float valueNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  float a = hash21( i );
  float b = hash21( i + vec2( 1.0, 0.0 ) );
  float c = hash21( i + vec2( 0.0, 1.0 ) );
  float d = hash21( i + vec2( 1.0, 1.0 ) );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( a, b, u.x ) + ( c - a ) * u.y * ( 1.0 - u.x ) + ( d - b ) * u.x * u.y;
}

float fbm( vec2 p ) {
  float v = 0.0;
  float amp = 0.5;
  for ( int i = 0; i < 5; i++ ) {
    v += amp * valueNoise( p );
    p *= 2.03;
    amp *= 0.5;
  }
  return v;
}

float rayleighPhase( float cosTheta ) {
  return THREE_OVER_SIXTEENPI * ( 1.0 + pow( cosTheta, 2.0 ) );
}

float hgPhase( float cosTheta, float g ) {
  float g2 = pow( g, 2.0 );
  float inverse = 1.0 / pow( 1.0 - 2.0 * g * cosTheta + g2, 1.5 );
  return ONE_OVER_FOURPI * ( ( 1.0 - g2 ) * inverse );
}

void main() {
  vec3 direction = normalize( vWorldDirection );

  float zenithAngle = acos( max( 0.0, dot( up, direction ) ) );
  float inverse = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
  float sR = rayleighZenithLength * inverse;
  float sM = mieZenithLength * inverse;

  vec3 Fex = exp( -( vBetaR * sR + vBetaM * sM ) );

  float cosTheta = dot( direction, vSunDirection );
  float rPhase = rayleighPhase( cosTheta * 0.5 + 0.5 );
  vec3 betaRTheta = vBetaR * rPhase;
  float mPhase = hgPhase( cosTheta, uMieDirectionalG );
  vec3 betaMTheta = vBetaM * mPhase;

  vec3 Lin = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
  Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 0.5 ) ), clamp( pow( 1.0 - dot( up, vSunDirection ), 5.0 ), 0.0, 1.0 ) );

  // Night-sky floor + sun disc.
  vec3 L0 = vec3( 0.1 ) * Fex;
  float sundisc = smoothstep( sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta );
  L0 += ( vSunE * 19000.0 * Fex ) * sundisc;

  vec3 texColor = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );

  // Hosek-Wilkie's ground-albedo influence: bounce a fraction of the
  // ground color back into the lower hemisphere so beach/desert presets
  // brighten the underside of the dome and forest presets darken it.
  // Cheaper than full HW upper-hemisphere coefficients but captures the
  // visible effect the brief asks for.
  //
  // Cycle 7 Phase 1.5 (round 3): smoothstep onset replaces the linear
  // max(0, -direction.y). The linear ramp combined with the zenithAngle
  // clamp at horizon (line ~136) created a visible bright/warm band
  // exactly at direction.y = 0 — a horizontal "line break" in the sky
  // that no camera angle could escape. Smoothstep delays the bounce
  // contribution until direction.y < -0.05 and ramps it in over a 0.15
  // window, keeping the transition derivative-continuous.
  float bounce = smoothstep( 0.0, 0.20, -direction.y );
  texColor += uGroundAlbedo * bounce * 0.35 * ( 0.5 + vSunfade );

  texColor *= uExposure;

  // Cycle 7 Phase 1.5: gate widened from -0.02 to -0.10 so the
  // horizonFeather smoothstep (which starts at -0.05) runs through its
  // entire fade range. Prior gate stopped cloud math at -0.02 while the
  // smoothstep wanted to fade to zero at -0.05, leaving a discrete
  // cloud/no-cloud step exactly at the horizon line — visible as a
  // "line break" near the top of screen in Follow's upward pitch.
  if ( uCloudCoverage > 0.001 && direction.y > -0.10 ) {
    float altitude = clamp( direction.y, 0.0, 1.0 );
    vec2 wind = length( uCloudWindDir ) > 0.0001 ? normalize( uCloudWindDir ) : vec2( 0.0 );

    // Intersect the view ray against a horizontal cloud deck. This keeps the
    // dome clouds seamless in azimuth; the previous lat/long mapping wrapped
    // at +/-pi and could paint a hard diagonal divider across the sky.
    float deckHeight = 1500.0;
    float rayToDeck = deckHeight / max( direction.y + 0.035, 0.08 );
    vec2 cloudUv = direction.xz * rayToDeck;
    cloudUv += wind * uCloudTimeSeconds * 14.0;
    cloudUv *= uCloudNoiseScale;

    float coverage = clamp( uCloudCoverage, 0.0, 1.0 );
    float largeField = 0.55 + 0.45 * smoothstep( 0.24, 0.72, fbm( cloudUv * 0.30 ) );
    float base = fbm( cloudUv * 0.72 );
    float bodyDetail = fbm( cloudUv * 1.55 + vec2( 17.2, -9.4 ) );
    float edgeDetail = fbm( cloudUv * 3.10 + vec2( -11.6, 6.7 ) );
    float lowerEdge = mix( 0.74, 0.36, coverage );
    float body = smoothstep( lowerEdge, lowerEdge + 0.16, mix( base, bodyDetail, 0.34 ) );
    float brokenEdge = smoothstep( lowerEdge - 0.12, lowerEdge + 0.22, bodyDetail ) * ( 1.0 - smoothstep( 0.48, 0.86, edgeDetail ) * 0.35 );
    float horizonWisps = smoothstep( 0.44, 0.78, fbm( cloudUv * 2.05 + vec2( 3.0, -2.0 ) ) ) * smoothstep( 0.02, 0.22, altitude );
    float mask = clamp( max( body, max( brokenEdge * 0.48, horizonWisps * coverage * 0.42 ) ) * largeField, 0.0, 1.0 );
    // Cycle 7 Phase 1.5 (round 2): widen the upper end far past where the
    // smoothstep can saturate within the visible hemisphere. Was 0.25 →
    // upper end created a visible "ceiling" line at ~14° elevation where
    // clouds slammed to full opacity. Pushing the upper end to 0.95 means
    // the smoothstep never saturates in any practical view direction —
    // the cloud alpha keeps fading smoothly from 0 at horizon to ~1 at
    // zenith. Likewise widen the zenith fade range.
    float horizonFeather = smoothstep( -0.10, 0.95, direction.y );
    float zenithFeather = mix( 1.0, 0.72, smoothstep( 0.50, 1.0, altitude ) );
    float cloudAlpha = mask * horizonFeather * zenithFeather * mix( 0.56, 0.88, coverage );
    float veilNoise = smoothstep( 0.28, 0.82, fbm( cloudUv * 0.42 + vec2( -4.0, 11.0 ) ) );
    cloudAlpha += coverage * horizonFeather * zenithFeather * veilNoise * 0.14;

    float sunFacing = max( 0.0, dot( normalize( direction + up * 0.25 ), normalize( vSunDirection ) ) );
    vec3 cloudShadow = mix( vec3( 0.24, 0.32, 0.42 ), vec3( 0.48, 0.55, 0.62 ), altitude );
    vec3 cloudHighlight = vec3( 1.0, 0.96, 0.88 );
    float highlightAmount = pow( sunFacing, 1.4 ) * ( 1.0 - 0.58 * clamp( vSunDirection.y, 0.0, 1.0 ) );
    vec3 cloudColor = mix( cloudShadow, cloudHighlight, clamp( highlightAmount, 0.0, 1.0 ) );
    cloudColor = mix( cloudColor, vec3( 0.72, 0.78, 0.84 ), ( 1.0 - base ) * 0.12 );
    texColor = mix( texColor, cloudColor, clamp( cloudAlpha, 0.0, 0.90 ) );
  }

  gl_FragColor = vec4( texColor, 1.0 );
}
`;
