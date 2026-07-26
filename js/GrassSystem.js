// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';
import { geometryTriangleCount } from './utils/TriangleCount.js';
import { TIER_PRESETS } from './HardwareTier.js';
import { createWebGpuGrassMaterial } from './world/webgpuGrassMaterialAdapter.js';
import { mulberry32 } from '../shared/Random.js';
import { getCoastlineField, sampleSignedDistance } from '../shared/CoastlineField.js';
import { createGrassComputeCull } from './world/grassComputeCull.js';
import { getWebGpuModules } from './world/webgpuModules.js';
import {
    GRASS_HUE_GLSL,
    GROUND_CONTACT,
    GROUND_CONTACT_GLSL,
    GROUND_VARIATION_GLSL,
    GRASS_VARIATION_TINT,
    GROUND_WEAR,
    groundApproachGrassKeep,
    groundPositionHash01,
    resolveEntityFacing,
    wornZoneCoverage01,
    wornZoneDistance,
} from './world/groundShading.js';

// Cycle 20 Phase 2 v3 (2026-05-04): minimum displaced-terrain Y under which
// grass is excluded — keeps clumps off the water-merging strip past the
// visible shoreline. 0.5m gives ~one-blade-base of clearance above the water
// plane (Y=0). Tuned with RH's heightfield falloff curve in mind: terrain
// drops past Y=0.5 near the outer half of the falloff annulus where the
// shore visually meets the water.
const SHORELINE_Y_MIN = 0.5;

// Cycle 114 Phase 1 introduced the metres over which grass thins OUTSIDE an
// exclusion zone's edge instead of stopping dead at it. Every zone used to be a
// hard boolean, so the pen and the farmhouse yard each sat inside a knife-edged
// bald rectangle - the first defect the front-door review named. 4m is about two
// dog-lengths: wide enough to read as ground worn down on the approach, narrow
// enough that the pen's footprint still reads as a pen rather than as a soft
// smear.
//
// It stays a module constant rather than a SceneDef field (Cycle 114 open
// question Q2). The scene-knobs rule in .claude/rules/scene-and-render.md is
// about branching on scene ID, which this does not do: one falloff width applied
// uniformly to every zone is a property of the effect, not of a scene. It also
// keeps the fence-frozen shared/scenes/types.js untouched.
//
// Cycle 121 moved the NUMBER to GROUND_WEAR.falloff in js/world/groundShading.js,
// unchanged at 4.0. The terrain now darkens over the same band the grass thins
// over, and two copies of one width is how they would come to disagree.

// Blade height at the very edge of an exclusion zone, as a fraction of full
// height. Density alone thins to a speckle, which reads as instances gone
// missing; tapering height as well reads as grass worn down by traffic.
const EXCLUSION_EDGE_HEIGHT_MIN = 0.45;

// Cycle 114 Phase 2: how far each scene's base and tip colours are pulled
// toward its own mid. Home Field shipped #5a7a3e -> #8aa860 -> #c4d68c, a
// base-to-tip luminance span of ~0.37, which reads as high-contrast striping at
// gameplay distance and fights the ground underneath instead of sitting on it.
// A mix toward the scene's OWN mid keeps the ramp shape and the per-scene
// identity (Rolling Hills stays golden, Open Country stays pale) while cutting
// the span to (1 - this) of what it was: one knob rather than four hand-tuned
// hex triples, and no edit to the scene defs.
const GRASS_RAMP_COMPRESSION = 0.4;

const GRASS_PROFILES = Object.freeze({
    'sds-hybrid-v1': Object.freeze({
        id: 'sds-hybrid-v1',
        label: 'SDS hybrid sparse grass v1',
        clumpDensityScale: 0.68,
        streamedClumpDensityScale: 0.58,
        bladesPerClump: 5,
        bladeWidth: 0.145,
        bladeHeightScale: 0.9,
        bladeHeightVariation: 0.5,
        windStrengthScale: 0.82,
        gustStrengthScale: 0.75,
        lodDecimateMidScale: 0.86,
        lodDecimateFarScale: 0.82,
        grassFadeStart: 58,
        grassFadeEndScale: 0.84,
        interactionRadius: 1.02,
        interactionStrength: 0.58,
        sheepInteractionRadius: 1.05,
        sheepInteractionStrength: 0.58,
        dogFootprint: Object.freeze({ halfLen: 1.16, halfWid: 0.48, falloff: 0.68 }),
        sheepFootprint: Object.freeze({ halfLen: 0.7, halfWid: 0.48, falloff: 0.82 }),
        flattenAmount: 0.20,
        node: Object.freeze({
            visualScale: 7.1,
            laydownStrength: 1.05,
            maxDisplacement: 1.35,
            shadowStrength: 0.18,
            tipDampen: 0.44,
            backlightStrength: 0.62,
            rimStrength: 0.14,
            hueVariation: 0.028,
            colorScale: 0.98,
        }),
        groundContact: Object.freeze({
            enabled: true,
            opacity: 0.16,
            color: 0x4f6327,
            dogScale: Object.freeze({ x: 1.35, z: 2.35 }),
            sheepScale: Object.freeze({ x: 1.25, z: 1.45 }),
            yOffset: 0.035,
        }),
    }),
});
const DEFAULT_GRASS_PROFILE_ID = 'sds-hybrid-v1';
const LEGACY_GRASS_PROFILE_IDS = new Set(['legacy', 'classic', 'off', 'none']);

function hashString32(input) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

function createVisualGoldenRandom() {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    if (params.get('visualGolden') !== '1') return null;
    const sceneId = params.get('scene') || 'default';
    return mulberry32(hashString32(`visual-golden-grass:${sceneId}`));
}

function resolveGrassProfile(search) {
    let params = null;
    if (typeof search === 'string') {
        params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    } else if (typeof window !== 'undefined') {
        params = new URLSearchParams(window.location.search);
    }
    const requestedId = params?.get('grassProfile') ?? params?.get('grassDesign') ?? null;
    if (requestedId && LEGACY_GRASS_PROFILE_IDS.has(requestedId)) return null;
    const id = requestedId ?? DEFAULT_GRASS_PROFILE_ID;
    return id ? (GRASS_PROFILES[id] ?? null) : null;
}

function applyGrassProfile(config, profile) {
    if (!profile) return;
    config.clumpsPerChunk = Math.max(1, Math.round(config.clumpsPerChunk * profile.clumpDensityScale));
    config.bladesPerClump = profile.bladesPerClump;
    config.bladeWidth = profile.bladeWidth;
    config.bladeHeight *= profile.bladeHeightScale;
    config.bladeHeightVariation = profile.bladeHeightVariation;
    config.windStrength *= profile.windStrengthScale;
    config.gustStrength *= profile.gustStrengthScale;
    config.lodDecimateMid *= profile.lodDecimateMidScale;
    config.lodDecimateFar *= profile.lodDecimateFarScale;
    config.grassFadeStart = profile.grassFadeStart;
    config.grassFadeEnd = Math.max(
        config.grassFadeStart + 20,
        Math.round(config.grassFadeEnd * profile.grassFadeEndScale)
    );
    config.interactionRadius = profile.interactionRadius;
    config.interactionStrength = profile.interactionStrength;
    config.sheepInteractionRadius = profile.sheepInteractionRadius;
    config.sheepInteractionStrength = profile.sheepInteractionStrength;
    config.interaction.dog = { ...profile.dogFootprint };
    config.interaction.sheep = { ...profile.sheepFootprint };
    config.interaction.flattenAmount = profile.flattenAmount;
}

// Cycle 114 Phase 2: `preloadGrassShaders` and js/shaders/grass/*.glsl are gone.
// The .glsl files were a mirror of the inline shaders, fetched at scene load and
// then thrown away, because createGrassMaterial always picked the inline variant
// (the mirrors never carried the polish varyings). Nothing outside this file
// called the preloader either. They had already drifted a year behind, and this
// phase would have had to hand-carry the ground field, the coherent hue and the
// contact term into a fifth and sixth copy that nobody renders. A mirror nobody
// renders is a mirror nobody keeps correct. The inline shaders below are now the
// only grass shaders. js/shaders/ShaderLoader.js stays: OptimizedSheep still
// loads js/shaders/sheep/*.glsl through it, and those ARE the live source.

/**
 * GrassSystem - Advanced grass rendering with:
 * - Chunk-based frustum culling
 * - Grass clump instancing (multiple blades per instance)
 * - Noise-texture based wind animation
 * - Player/animal interaction displacement
 * - LOD per chunk
 * - Mobile optimizations
 */
export class GrassSystem {
    /**
     * @param {THREE.Scene} scene
     * @param {boolean} [isMobile=false]
     * @param {import('../shared/scenes/types.js').GrassDef} [sceneGrass] Optional scene-sourced grass config; when present, its `clumpsPerChunk` wins over the default.
     * @param {import('../shared/terrain/Heightfield.js').Heightfield | null} [heightfield] Optional heightfield; when present, clumps sit on the displaced terrain instead of y=0.
     * @param {import('../shared/scenes/types.js').BoundaryDef | null} [boundary] Optional scene boundary; for `kind:'island'` scenes, grass past `radius+falloff` is culled so clumps don't extend over the water.
     * @param {{ tier?: 'low'|'med'|'high', search?: string, webgpuGrassFactories?: Object }} [opts] Cycle 23 Phase D1 — hardware tier overrides isMobile-binary defaults.
     */
    constructor(scene, isMobile = false, sceneGrass = null, heightfield = null, boundary = null, opts = {}) {
        this.scene = scene;
        this.isMobile = isMobile;
        this.sceneGrass = sceneGrass;
        this.heightfield = heightfield;
        this.boundary = boundary || null;
        // Cycle 64: for a coastline scene, grass density + chunk extent follow
        // the signed-distance field (dense inside, fading at the shore) instead
        // of the origin-radial falloff, which would starve a play area that
        // sits far from the world origin (Newsheepdogland's foot). Built once here.
        this._isCoastline = this.boundary?.kind === 'coastline';
        this._coastField = this._isCoastline ? getCoastlineField(this.boundary) : null;
        // Cycle 81: set when the field renders as one compute-culled InstancedMesh
        // (flagship coastline desktop WebGPU). Picked up + driven + disposed by
        // TerrainBuilder; null on every per-chunk path.
        this._computeCullController = null;
        // Cycle 87 Phase 3: second compute-cull controller for the streamed
        // grass annulus (built post-first-interactive by foliageStreaming via
        // buildStreamedGrass). Own material instance (the compute remap nodes
        // are per-controller), driven alongside the primary in TerrainBuilder
        // and updated in the per-frame fan-outs below.
        this._streamedCullController = null;
        this._streamedMaterial = null;
        this._streamedBladeControls = null;
        // Grass thins to zero over the last `_coastShoreFade` metres before the
        // shore. The shoreline-Y cull still owns the exact waterline.
        this._coastShoreFade = 28;
        // Cycle 64: optional tall-grass bands (axis-aligned rects with a blade-
        // height multiplier). Absent on every pre-64 scene.
        this._tallZones = Array.isArray(sceneGrass?.tallZones) ? sceneGrass.tallZones : null;
        // Cycle 64: grid centre (origin unless a scene moves its grass onto an
        // off-origin play area, e.g. Newsheepdogland's foot).
        this._grassCenter = sceneGrass?.grassCenter ?? { x: 0, z: 0 };
        this.webgpuGrassSearch = opts.search;
        this.webgpuGrassFactories = opts.webgpuGrassFactories;
        this.grassProfile = resolveGrassProfile(opts.search);
        this.webgpuMeadowQuadMaterialSummary = null;
        this.webgpuGrassBladeMaterialSummary = null;
        this.webgpuGrassBladeMaterialControls = null;
        this.random = createVisualGoldenRandom() ?? Math.random;
        // Cycle 23 Phase D1: tier overrides the isMobile binary. 'low' inherits
        // mobile-style defaults; 'med' / 'high' get desktop defaults with
        // wind-octave and meadow-quad enable knobs differentiated.
        this.tier = opts.tier ?? (isMobile ? 'low' : 'med');
        const grassPresetTier = isMobile ? 'low' : this.tier;
        const tierPreset = TIER_PRESETS[grassPresetTier] ?? TIER_PRESETS.med;
        this._tierPreset = tierPreset;

        const sceneClumps = sceneGrass?.clumpsPerChunk;
        const clumpsPerChunk = sceneClumps
            ? (isMobile ? sceneClumps.mobile : sceneClumps.desktop)
            : (isMobile ? 800 : 1800);

        // Defaults match the original hardcoded values so behavior is
        // byte-identical when sceneGrass.colors is absent.
        const sceneColors = sceneGrass?.colors;
        const baseColor = sceneColors?.base
            ? new THREE.Color(sceneColors.base)
            : new THREE.Color(0.08, 0.28, 0.04);
        const midColor = sceneColors?.mid
            ? new THREE.Color(sceneColors.mid)
            : new THREE.Color(0.18, 0.48, 0.12);
        const tipColor = sceneColors?.tip
            ? new THREE.Color(sceneColors.tip)
            : new THREE.Color(0.55, 0.82, 0.30);
        // Cycle 114 Phase 2: compress the base-to-tip ramp toward the scene's own
        // mid. lerpColors is linear, so the base-to-tip luminance span comes out
        // at exactly (1 - GRASS_RAMP_COMPRESSION) of what the scene declared,
        // which is the number the phase records. The mid is the anchor and does
        // not move, so the ramp SHAPE (the break at vHeight 0.4) and the scene's
        // colour identity both survive. Recorded per-scene on the config below so
        // a spec can read the before and after without re-deriving the maths.
        this.grassRampCompression = GRASS_RAMP_COMPRESSION;
        this.grassRampBeforeCompression = {
            base: baseColor.clone(),
            mid: midColor.clone(),
            tip: tipColor.clone(),
        };
        baseColor.lerp(midColor, GRASS_RAMP_COMPRESSION);
        tipColor.lerp(midColor, GRASS_RAMP_COMPRESSION);

        // Cycle 18 Phase 1: explicit per-scene grass radius takes precedence
        // over the legacy `worldSize * densityRange` formula. When set on a
        // scene's grass config, two things happen here:
        //   (1) the chunk grid extent grows to (grassRadius + buffer) * 2 if
        //       that's larger than the device-default worldSize — so chunks
        //       actually exist out at the radius the scene asked for.
        //   (2) the density-falloff zero point uses grassRadius directly,
        //       independent of worldSize (no implicit area math).
        // Field omits grassRadius and stays byte-identical to pre-cycle-18.
        const baseWorldSize = isMobile ? 220 : 420;
        const baseDensityRange = sceneGrass?.densityRange ?? 0.6;
        const explicitGrassRadius = (typeof sceneGrass?.grassRadius === 'number')
            ? sceneGrass.grassRadius
            : null;
        const grassRadius = explicitGrassRadius ?? (baseWorldSize * baseDensityRange);
        // 40m buffer = one chunk past the falloff zero point so the curve's
        // 0.2 acceptance floor still has chunks to populate at the perimeter.
        const worldSize = explicitGrassRadius != null
            ? Math.max(baseWorldSize, (explicitGrassRadius + 40) * 2)
            : baseWorldSize;

        // Grass configuration
        this.config = {
            // World bounds for grass — drives the chunk grid extent.
            worldSize,

            // Density-falloff zero point in metres from origin. Defaults to
            // pre-cycle-18 `worldSize * densityRange = 252m` for opt-out
            // scenes; explicit `grassRadius` on the scene config wins.
            grassRadius,

            // Whether the scene opted into the cycle-18 explicit-radius path.
            // Used for the per-area clump-budget rescale + tighter circular
            // cull (so OC's expanded grid doesn't blow the perf budget).
            hasExplicitGrassRadius: explicitGrassRadius != null,

            // Legacy fallback when `grassRadius` isn't set (pre-cycle-18).
            densityRange: baseDensityRange,

            // Chunk system - smaller chunks = more grass density control
            chunkSize: 40,

            // Grass density per chunk - MUCH denser
            clumpsPerChunk,
            // Cycle 23 Phase D1: blades per clump from tier preset (low=5,
            // med=7, high=7). Replaces isMobile-binary so the same low blade
            // count lands on weaker desktop GPUs that fail vendor regex.
            bladesPerClump: tierPreset.bladesPerClump,

            // Blade geometry - varied heights for lush look
            bladeWidth: 0.12,
            bladeHeight: 1.0,
            bladeHeightVariation: 0.7,

            // Colors - sourced from sceneGrass.colors when provided, else
            // the original richer-green defaults
            baseColor,
            midColor,
            tipColor,

            // Wind - gentle and zen-like
            windStrength: isMobile ? 0 : 0.12,
            windSpeed: 0.6,
            gustStrength: 0.05,

            // Interaction - subtle natural push effect.
            // Cycle 55: the parting-footprint extents and the falloff curve are
            // the single source of truth here, consumed by the inline WebGL
            // shaders (getDesktop/MobileVertexShader) and routed to the WebGPU
            // node material via the adapter context below. Narrowed from the
            // old ~4m-wide dog / ~2.8m-wide sheep swaths so the parted band hugs
            // the body, and the falloff is sharpened (pushFalloffPower) so the
            // push concentrates near the body the way the boona13 reference
            // push field reads. interactionRadius/sheepInteractionRadius now
            // feed only the WebGPU node proximity reach (scaled x1.6 desktop /
            // x2.0 mobile in the node factory) and the non-live .glsl backup;
            // the live WebGL SDF uses interaction.*.falloff, not these.
            interactionRadius: 0.9,
            interactionStrength: 0.6,
            sheepInteractionRadius: 0.62,
            sheepInteractionStrength: 0.4,
            interaction: {
                // Oriented rounded-rect body footprint per entity (metres).
                // halfLen = along facing, halfWid = sideways, falloff = push
                // ring outside the body box.
                dog: { halfLen: 1.1, halfWid: 0.45, falloff: 0.6 },
                sheep: { halfLen: 0.4, halfWid: 0.3, falloff: 0.4 },
                // Curve sharpness on the outside-body push. 1.0 == the old
                // 1-smoothstep falloff; 2.0 == the reference squared falloff
                // that keeps the parting tight near the body.
                pushFalloffPower: 2.0,
                // Downward press applied to bent blades (the "pressed" read).
                flattenAmount: 0.18,
            },
            recoverySpeed: 3.0,
            // iOS Safari has ~128 vec4 uniform limit - use small array for mobile
            maxInteractors: isMobile ? 10 : 220,

            // Legacy LOD distance fields - settings.js still mutates
            // config.lodFar via the quality preset, so keep all three.
            lodNear: 100,
            lodMid: 180,
            lodFar: 280,

            // Instance-decimation LOD: render fewer instances per chunk
            // beyond these distances. Hard count-step is the cheap part of
            // the LOD; the shader does the perceptual smoothing via
            // stochastic dither (see grassFadeStart/End below). Pushed out
            // so the count step lands inside the already-stochastic-culled
            // zone where it's invisible.
            lodDecimateMid: 200,   // > 200m: 50% of instances
            lodDecimateFar: 280,   // > 280m: 25% of instances
            lodHysteresis: 14,

            // Stochastic LOD dither in the vertex shader. Each blade has a
            // stable per-instance hash; as `dist(camera, blade.xz)` grows
            // through [grassFadeStart, grassFadeEnd], an increasing fraction
            // of blades collapse to degenerate triangles (gl_Position with
            // w=clipped). Result: a smooth density gradient — no ring snap
            // visible in Classic top-down (where the entire LOD band is on
            // screen) or in Follow (where it's out of view anyway).
            //
            // Reference technique: Cesium-for-Unreal "smoother LOD",
            // Witcher-3-style stochastic foliage cull.
            grassFadeStart: 70,
            grassFadeEnd: 260,

            // Fog — placeholders only. update() syncs to scene.fog every
            // frame so distant grass fades to the same horizon color the
            // Atmosphere driver writes into scene.fog (matches sky + terrain).
            fogDensity: 0.0006,
            fogColor: new THREE.Color(0xcccccc)
        };
        applyGrassProfile(this.config, this.grassProfile);
        this.grassProfileSummary = this.grassProfile ? {
            id: this.grassProfile.id,
            label: this.grassProfile.label,
            clumpDensityScale: this.grassProfile.clumpDensityScale,
            streamedClumpDensityScale: this.grassProfile.streamedClumpDensityScale,
            bladesPerClump: this.config.bladesPerClump,
            bladeHeight: this.config.bladeHeight,
            bladeWidth: this.config.bladeWidth,
            sheepFootprint: { ...this.config.interaction.sheep },
            groundContact: this.grassProfile.groundContact
                ? { ...this.grassProfile.groundContact }
                : null,
        } : null;

        // Runtime state
        this.chunks = new Map();
        this.noiseTexture = null;
        this.grassMaterial = null;
        this.time = 0;
        // Golden capture: freeze the wind/LOD clock so full-frame grass renders
        // deterministically run-to-run (matches the existing visualGolden streaming
        // + scatter-RNG opt-outs). Production (no flag) advances time as normal.
        this._visualGoldenFreezeTime = (typeof window !== 'undefined') &&
            new URLSearchParams(window.location.search).get('visualGolden') === '1';
        this.interactorPositions = new Float32Array(this.config.maxInteractors * 3);
        this.interactorData = new Float32Array(this.config.maxInteractors); // 0=player/dog, 1=sheep
        // Per-entity facing direction (unit vec2 in XZ). Used by the shader
        // to push grass along an oriented body footprint instead of a
        // world-axis-locked ellipse — so the dog's wake follows where the
        // dog is heading.
        this.interactorFacings = new Float32Array(this.config.maxInteractors * 2);
        this.interactorCount = 0;
        this.groundContactMesh = null;
        this._groundContactMaterial = null;
        this._groundContactTexture = null;
        this._groundContactEnabled = true;
        this._groundContactMatrix = new THREE.Matrix4();
        this._groundContactQuaternion = new THREE.Quaternion();
        this._groundContactPosition = new THREE.Vector3();
        this._groundContactScale = new THREE.Vector3();
        this._groundContactUp = new THREE.Vector3(0, 1, 0);
        this.qualityDistanceScale = 1;
        this.qualityDensityScale = 1;
        this._qualityBase = {
            lodDecimateMid: this.config.lodDecimateMid,
            lodDecimateFar: this.config.lodDecimateFar,
            grassFadeEnd: this.config.grassFadeEnd,
        };

        // Frustum culling
        this.frustum = new THREE.Frustum();
        this.frustumMatrix = new THREE.Matrix4();
        // Reusable scratch sphere for per-frame frustum culling, hoisted out of
        // updateFrustumCulling (THREE.Sphere also default-allocates a Vector3).
        this._cullSphere = new THREE.Sphere();

        // Cycle 22 Phase D: grass auto-LOD. Tracks recent frame times in a
        // ring buffer; if the rolling average exceeds the high-water mark
        // (18ms ≈ < 56fps) we scale per-chunk clump density down at the next
        // chunk rebuild, and back up if the average is comfortably under
        // the low-water mark (14ms ≈ > 71fps). Floor at 0.5 so extreme
        // perf trouble can't collapse grass entirely. Acts on chunk
        // (re)creation only — no live geometry mutation per frame, so the
        // factor change costs nothing until the next scene-swap or first
        // chunk-paint after init.
        this._frameTimes = new Float32Array(60);
        this._frameTimeIdx = 0;
        this._frameTimeCount = 0;
        this._autoLodFactor = 1.0;
        this._autoLodHi = 18; // ms rolling avg → scale down
        this._autoLodLo = 14; // ms rolling avg → scale up
        this._autoLodFloor = 0.5;
        // Cycle 82: cold-load warmup grace (seconds of accumulated update time).
        // The 30-sample ring above only warms over ~0.5 s, far short of the
        // multi-second pipeline-compile + texture-upload settling on the WebGPU
        // flagship, so the rolling avg floored _autoLodFactor to 0.5 from the boot
        // spike and thinned grass on a capable desktop. Hold the factor steady
        // until the scene has been running this long, then react normally.
        this._autoLodWarmupS = 6;

        // Performance stats
        this.stats = {
            totalClumps: 0,
            visibleClumps: 0,
            chunksVisible: 0,
            lastUpdateTime: 0,
            autoLodFactor: 1.0,
            avgFrameMs: 0,
        };

        // Exclusion zones (farm house, pasture, etc.)
        this.exclusionZones = [];

        // Cycle 115 Phase 4: the worn approach to the pen gate, pushed in by
        // TerrainBuilder before init() so the scatter can thin over it. Null on
        // every scene without a pen gate, and on those the scatter is
        // byte-identical to pre-Cycle-115.
        /** @type {{mouth: {x: number, z: number}, axis: {x: number, z: number}, gateWidth: number} | null} */
        this.gateApproach = null;
    }

    /**
     * Declare the worn approach to this scene's pen gate. Must be called before
     * `init()`; the scatter reads it once, at build time.
     *
     * @param {{mouth: {x: number, z: number}, axis: {x: number, z: number}, gateWidth: number} | null} approach
     */
    setGateApproach(approach) {
        this.gateApproach = approach ?? null;
    }

    /**
     * Initialize the grass system
     */
    async init() {
        // Detect iOS Safari for special handling
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        this.isIOSSafari = isIOS || isSafari;

        console.log(`[GRASS] Initializing (mobile=${this.isMobile}, iOS=${isIOS}, Safari=${isSafari})`);

        try {
            // Generate procedural noise texture for wind
            console.log('[GRASS] Creating noise texture...');
            this.noiseTexture = this.createNoiseTexture();

            // Create shared grass material
            console.log('[GRASS] Creating grass material...');
            this.grassMaterial = this.createGrassMaterial();

            // Verify shader compiled (Three.js doesn't throw on shader errors immediately)
            if (this.grassMaterial && this.grassMaterial.program === undefined) {
                console.log('[GRASS] Material created, shader will compile on first render');
            }

            // Create grass geometry (clump with multiple blades)
            console.log('[GRASS] Creating grass geometry...');
            this.clumpGeometry = this.createClumpGeometry();

            // Generate chunks. Cycle 84: on the flagship coastline WebGPU
            // path, build ONE consolidated InstancedMesh driven by a TSL compute
            // frustum-cull + indirect draw instead of the per-chunk fan-out
            // (collapses ~740 meshes to 1; pixel-identical). Any failure falls back
            // to the per-chunk path inside the builder.
            console.log('[GRASS] Generating chunks...');
            if (this._shouldComputeCullGrass()) {
                this._buildConsolidatedComputeCullGrass();
            } else {
                this.generateChunks();
            }
            this.createGroundContactMesh();

            this.initializationSucceeded = true;
            console.log(`[GRASS] GrassSystem initialized: ${this.stats.totalClumps} clumps in ${this.chunks.size} chunks (${this.isMobile ? 'mobile' : 'desktop'}, maxInteractors=${this.config.maxInteractors})`);
        } catch (error) {
            console.error('[GRASS] Failed to initialize:', error);
            this.initializationSucceeded = false;
            // On iOS/Safari, don't let grass failure break the game
            if (this.isIOSSafari) {
                console.warn('[GRASS] iOS Safari grass error - game will continue without grass');
            }
        }
    }

    /**
     * Create procedural noise texture for wind animation
     */
    createNoiseTexture() {
        const size = 256;
        const data = new Uint8Array(size * size * 4);

        // Generate multi-octave Perlin-like noise
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = (y * size + x) * 4;

                // Multiple octaves of noise for organic look
                let nx = 0, ny = 0, nz = 0;

                // Octave 1 - large scale wind patterns
                nx += Math.sin(x * 0.02 + y * 0.01) * 0.5 + 0.5;
                ny += Math.cos(x * 0.015 - y * 0.02) * 0.5 + 0.5;

                // Octave 2 - medium turbulence
                nx += Math.sin(x * 0.05 + y * 0.03) * 0.25;
                ny += Math.cos(x * 0.04 - y * 0.05) * 0.25;

                // Octave 3 - small detail
                nx += Math.sin(x * 0.1 + y * 0.08) * 0.125;
                ny += Math.cos(x * 0.09 - y * 0.11) * 0.125;

                // Octave 4 - fine detail for gusts
                nz = Math.sin(x * 0.15 + y * 0.12) * Math.cos(x * 0.08 + y * 0.15) * 0.5 + 0.5;

                // Normalize to 0-255
                data[idx] = Math.floor(Math.max(0, Math.min(1, nx)) * 255);     // R - X displacement
                data[idx + 1] = Math.floor(Math.max(0, Math.min(1, ny)) * 255); // G - Z displacement
                data[idx + 2] = Math.floor(Math.max(0, Math.min(1, nz)) * 255); // B - Gust intensity
                data[idx + 3] = 255; // A
            }
        }

        const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;

        return texture;
    }

    createGroundContactTexture() {
        if (typeof document === 'undefined') return null;
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 96;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const gradient = ctx.createRadialGradient(48, 48, 4, 48, 48, 48);
        gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
        gradient.addColorStop(0.48, 'rgba(255,255,255,0.45)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 96, 96);
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    createGroundContactMesh() {
        if (this.groundContactMesh) return this.groundContactMesh;
        const contact = this.grassProfile?.groundContact;
        if (!contact?.enabled) return null;

        this._groundContactTexture = this.createGroundContactTexture();
        const geometry = new THREE.PlaneGeometry(1, 1);
        geometry.rotateX(-Math.PI / 2);
        const materialOptions = {
            color: contact.color,
            transparent: true,
            opacity: contact.opacity,
            depthWrite: false,
            depthTest: true,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
        };
        if (this._groundContactTexture) {
            materialOptions.alphaMap = this._groundContactTexture;
        }
        const material = new THREE.MeshBasicMaterial(materialOptions);
        const mesh = new THREE.InstancedMesh(geometry, material, this.config.maxInteractors);
        mesh.name = 'SDSHybridGrassGroundContact';
        mesh.count = 0;
        mesh.visible = false;
        mesh.frustumCulled = false;
        mesh.renderOrder = 3;
        this.groundContactMesh = mesh;
        this._groundContactMaterial = material;
        this.scene.add(mesh);
        return mesh;
    }

    /**
     * Create grass clump geometry (multiple blades baked together)
     * Simple triangle blades for reliable rendering
     */
    createClumpGeometry() {
        const { bladeWidth, bladeHeight, bladesPerClump } = this.config;

        // Each blade is a simple quad (4 vertices, 2 triangles) - more reliable
        const verticesPerBlade = 4;

        const totalVertices = bladesPerClump * verticesPerBlade;

        const positions = new Float32Array(totalVertices * 3);
        const uvs = new Float32Array(totalVertices * 2);
        const indices = [];
        const bladeData = new Float32Array(totalVertices * 4);

        let vIdx = 0;

        for (let blade = 0; blade < bladesPerClump; blade++) {
            // Distribute blades in a natural clump pattern
            const angle = (blade / bladesPerClump) * Math.PI * 2 + (this.random() - 0.5) * 0.8;
            const radius = this.random() * 0.6;
            const offsetX = Math.cos(angle) * radius;
            const offsetZ = Math.sin(angle) * radius;

            // Random blade properties
            const heightScale = 0.4 + this.random() * 0.8;
            const widthScale = 0.7 + this.random() * 0.5;
            const rotY = this.random() * Math.PI; // Random facing direction
            const lean = (this.random() - 0.5) * 0.4;

            const h = bladeHeight * heightScale;
            const w = bladeWidth * widthScale;

            // Calculate rotated offsets
            const cosR = Math.cos(rotY);
            const sinR = Math.sin(rotY);

            const baseVertex = blade * verticesPerBlade;

            // Bottom-left vertex (0)
            positions[vIdx * 3] = offsetX + (-w * 0.5) * cosR;
            positions[vIdx * 3 + 1] = 0;
            positions[vIdx * 3 + 2] = offsetZ + (-w * 0.5) * sinR;
            uvs[vIdx * 2] = 0;
            uvs[vIdx * 2 + 1] = 0;
            bladeData[vIdx * 4] = offsetX;
            bladeData[vIdx * 4 + 1] = 0;
            bladeData[vIdx * 4 + 2] = offsetZ;
            bladeData[vIdx * 4 + 3] = heightScale;
            vIdx++;

            // Bottom-right vertex (1)
            positions[vIdx * 3] = offsetX + (w * 0.5) * cosR;
            positions[vIdx * 3 + 1] = 0;
            positions[vIdx * 3 + 2] = offsetZ + (w * 0.5) * sinR;
            uvs[vIdx * 2] = 1;
            uvs[vIdx * 2 + 1] = 0;
            bladeData[vIdx * 4] = offsetX;
            bladeData[vIdx * 4 + 1] = 0;
            bladeData[vIdx * 4 + 2] = offsetZ;
            bladeData[vIdx * 4 + 3] = heightScale;
            vIdx++;

            // Top-left vertex (2) - with lean
            positions[vIdx * 3] = offsetX + (-w * 0.3) * cosR + lean * cosR;
            positions[vIdx * 3 + 1] = h;
            positions[vIdx * 3 + 2] = offsetZ + (-w * 0.3) * sinR + lean * sinR;
            uvs[vIdx * 2] = 0.2;
            uvs[vIdx * 2 + 1] = 1;
            bladeData[vIdx * 4] = offsetX;
            bladeData[vIdx * 4 + 1] = 1;
            bladeData[vIdx * 4 + 2] = offsetZ;
            bladeData[vIdx * 4 + 3] = heightScale;
            vIdx++;

            // Top-right vertex (3) - with lean
            positions[vIdx * 3] = offsetX + (w * 0.3) * cosR + lean * cosR;
            positions[vIdx * 3 + 1] = h;
            positions[vIdx * 3 + 2] = offsetZ + (w * 0.3) * sinR + lean * sinR;
            uvs[vIdx * 2] = 0.8;
            uvs[vIdx * 2 + 1] = 1;
            bladeData[vIdx * 4] = offsetX;
            bladeData[vIdx * 4 + 1] = 1;
            bladeData[vIdx * 4 + 2] = offsetZ;
            bladeData[vIdx * 4 + 3] = heightScale;
            vIdx++;

            // Front face triangles
            indices.push(baseVertex, baseVertex + 1, baseVertex + 2);
            indices.push(baseVertex + 1, baseVertex + 3, baseVertex + 2);

            // Back face triangles (reverse winding)
            indices.push(baseVertex + 2, baseVertex + 1, baseVertex);
            indices.push(baseVertex + 2, baseVertex + 3, baseVertex + 1);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geometry.setAttribute('bladeData', new THREE.BufferAttribute(bladeData, 4));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        return geometry;
    }

    /**
     * Create advanced grass shader material.
     * Inline shaders are the source of truth for polish features (hue hash,
     * rim-light); external glsl files mirror these and are kept as a backup
     * load path. We pick whichever variant carries the polish varyings — the
     * inline one — to keep the runtime visually consistent with the constants.
     */
    createGrassMaterial(computeCull = null) {
        let vertexShader, fragmentShader;

        if (this.isMobile) {
            vertexShader = this.getMobileVertexShader();
        } else {
            vertexShader = this.getDesktopVertexShader();
        }
        fragmentShader = this.getFragmentShader();

        const uniforms = {
            time: { value: 0 },
            noiseTexture: { value: this.noiseTexture },

            // Wind
            windStrength: { value: this.config.windStrength },
            windSpeed: { value: this.config.windSpeed },
            windDirection: { value: new THREE.Vector2(0.7, 0.7) },
            gustStrength: { value: this.config.gustStrength },

            // Colors
            baseColor: { value: this.config.baseColor },
            midColor: { value: this.config.midColor },
            tipColor: { value: this.config.tipColor },

            // Interaction
            interactorPositions: { value: this.interactorPositions },
            interactorData: { value: this.interactorData },
            interactorFacings: { value: this.interactorFacings },
            interactorCount: { value: 0 },
            interactionRadius: { value: this.config.interactionRadius },
            interactionStrength: { value: this.config.interactionStrength },

            // Fog (synced to scene.fog every frame in update())
            fogColor: { value: this.config.fogColor },
            fogDensity: { value: this.config.fogDensity },

            // Camera for distance calculations
            uCameraPos: { value: new THREE.Vector3() },

            // Cycle 14 Phase 2: world-space sun direction for fake-SSS
            // back-light. main.js calls grassSystem.setSunDirection() per
            // frame from atmosphere.getSunDirection(). Default points up
            // (overhead noon) so the term is harmless before first update.
            uSunDirection: { value: new THREE.Vector3(0, 1, 0) },

            // Distance-based blade-height fade (smooth LOD transition)
            grassFadeStart: { value: this.config.grassFadeStart },
            grassFadeEnd: { value: this.config.grassFadeEnd }
        };

        const createDefaultMaterial = () => new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms,
            side: THREE.FrontSide,
            transparent: false,
            depthWrite: true,
            depthTest: true
        });
        const materialResult = createWebGpuGrassMaterial('grass-blade', 'createGrassBladeMaterial', {
            createDefaultMaterial,
            search: this.webgpuGrassSearch,
            factories: this.webgpuGrassFactories,
            context: {
                computeCull, // Cycle 81 Path 1: consolidated compute-cull instance remap (null = per-chunk path)
                isMobile: this.isMobile,
                tier: this.tier,
                vertexShader,
                fragmentShader,
                noiseTexture: this.noiseTexture,
                wind: {
                    strength: this.config.windStrength,
                    speed: this.config.windSpeed,
                    direction: new THREE.Vector2(0.7, 0.7),
                    gustStrength: this.config.gustStrength,
                },
                geometry: {
                    bladeHeight: this.config.bladeHeight,
                    bladeWidth: this.config.bladeWidth,
                    bladeHeightVariation: this.config.bladeHeightVariation,
                },
                colors: {
                    baseColor: this.config.baseColor.clone(),
                    midColor: this.config.midColor.clone(),
                    tipColor: this.config.tipColor.clone(),
                },
                lighting: {
                    sunDirection: new THREE.Vector3(0, 1, 0),
                    sunColor: new THREE.Color(0xffffff),
                },
                interaction: {
                    maxInteractors: this.config.maxInteractors,
                    positions: this.interactorPositions,
                    data: this.interactorData,
                    facings: this.interactorFacings,
                    radius: this.config.interactionRadius,
                    strength: this.config.interactionStrength,
                    sheepRadius: this.config.sheepInteractionRadius,
                    sheepStrength: this.config.sheepInteractionStrength,
                    // Cycle 55: route the unified body-footprint extents so the
                    // WebGPU node material reads the same source of truth as the
                    // inline WebGL shaders instead of its own hardcoded extents.
                    dogHalfLen: this.config.interaction.dog.halfLen,
                    dogHalfWid: this.config.interaction.dog.halfWid,
                    sheepHalfLen: this.config.interaction.sheep.halfLen,
                    sheepHalfWid: this.config.interaction.sheep.halfWid,
                    visualScale: this.grassProfile?.node?.visualScale,
                    laydownStrength: this.grassProfile?.node?.laydownStrength,
                    maxDisplacement: this.grassProfile?.node?.maxDisplacement,
                    shadowStrength: this.grassProfile?.node?.shadowStrength,
                },
                fog: {
                    color: this.config.fogColor.clone(),
                    density: this.config.fogDensity,
                },
                fade: {
                    start: this.config.grassFadeStart,
                    end: this.config.grassFadeEnd,
                    strength: 1,
                },
                material: {
                    side: THREE.FrontSide,
                    transparent: false,
                    depthWrite: true,
                    depthTest: true,
                    alphaHash: true,
                    alphaTest: 0.06,
                },
                tipDampen: this.grassProfile?.node?.tipDampen,
                backlightStrength: this.grassProfile?.node?.backlightStrength,
                rimStrength: this.grassProfile?.node?.rimStrength,
                hueVariation: this.grassProfile?.node?.hueVariation,
                colorScale: this.grassProfile?.node?.colorScale,
                grassProfile: this.grassProfileSummary,
            },
        });
        const material = materialResult.material;
        material.userData = material.userData ?? {};
        material.userData.webgpuGrassBladeMaterialControls =
            materialResult.controls ?? material.userData.webgpuGrassBladeMaterialControls ?? null;
        material.userData.webgpuGrassBladeMaterialSummary = materialResult.summary;
        this.webgpuGrassBladeMaterialSummary = materialResult.summary;
        this.webgpuGrassBladeMaterialControls = material.userData.webgpuGrassBladeMaterialControls;
        return material;
    }

    /**
     * Desktop vertex shader with full wind and interaction
     */
    getDesktopVertexShader() {
        const I = this.config.interaction;
        const dog = I.dog;
        const sheep = I.sheep;
        return `
            // Cycle 12 Phase 4 required highp on every grass stage, and
            // tests/shader-precision.spec.js has asserted it ever since - but
            // against js/shaders/grass/*.glsl, which were mirrors nobody
            // rendered. The inline shaders that actually compile never carried
            // the declaration, so the guarantee was vacuous here for years.
            // Cycle 114 Phase 2 deleted the mirrors and moved the assertion
            // onto these, which is what surfaced it. Restored rather than
            // dropped: GLSL ES defaults vertex float to highp so nothing was
            // visibly wrong, but relying on the default is not what the rule
            // said, and the fragment stage below (where the default is mediump)
            // has always declared it.
            precision highp float;
            precision highp int;

            uniform float time;
            uniform sampler2D noiseTexture;
            uniform float windStrength;
            uniform float windSpeed;
            uniform vec2 windDirection;
            uniform float gustStrength;

            uniform vec3 interactorPositions[${this.config.maxInteractors}];
            uniform float interactorData[${this.config.maxInteractors}]; // 0=player/dog, 1=sheep
            uniform vec2 interactorFacings[${this.config.maxInteractors}];
            uniform int interactorCount;
            uniform float interactionRadius;
            uniform float interactionStrength;

            uniform vec3 uCameraPos;
            uniform float grassFadeStart;
            uniform float grassFadeEnd;

            attribute vec4 bladeData;

            varying vec2 vUv;
            varying vec3 vWorldPos;
            varying float vHeight;
            varying float vColorVariation;
            varying float vShadow;
            varying float vHueOffset;

            ${GROUND_VARIATION_GLSL}
            ${GRASS_HUE_GLSL}
            ${GROUND_CONTACT_GLSL}

            // Smooth falloff for interaction
            float smoothFalloff(float dist, float radius) {
                float t = clamp(dist / radius, 0.0, 1.0);
                return 1.0 - t * t * (3.0 - 2.0 * t);
            }

            // Per-instance hash → small hue offset for blade-by-blade variety
            float hash11(float n) {
                return fract(sin(n) * 43758.5453123);
            }

            void main() {
                vUv = uv;
                vHeight = bladeData.y;

                // Stochastic LOD dither — collapse this blade to a degenerate
                // triangle when its per-instance hash falls below the
                // distance-derived threshold. Result: smooth density gradient
                // from 100% near camera to 0% past grassFadeEnd. Hides the
                // count-decimation step in Classic top-down view (where the
                // entire LOD band is visible on screen). Stable per-blade
                // hash (gl_InstanceID + chunk world XZ) so blades neither
                // swap with each other across frames nor dither in lockstep.
                vec4 baseWorld = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
                float distXZ = length(baseWorld.xz - uCameraPos.xz);
                float fadeT = clamp((distXZ - grassFadeStart) / (grassFadeEnd - grassFadeStart), 0.0, 1.0);
                float bladeHash = hash11(float(gl_InstanceID) * 0.137 + baseWorld.x * 0.13 + baseWorld.z * 0.07);
                if (bladeHash < fadeT) {
                    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                    vWorldPos = vec3(0.0);
                    vColorVariation = 0.0;
                    vShadow = 1.0;
                    vHueOffset = 0.0;
                    return;
                }

                // Cycle 114 Phase 2: hue offset keyed off the CLUMP's world
                // position rather than its instance id. A per-instance hash gives
                // every neighbour an independent tint, which reads as television
                // snow; quantising to roughly clump scale lets a patch of the
                // meadow share a tint, which is what real grass does. Same total
                // amplitude as before (0.04), just correlated.
                vHueOffset = sdsGrassHueOffset(baseWorld.xz, 0.04);

                vec3 pos = position;
                vec4 worldPos4 = modelMatrix * instanceMatrix * vec4(pos, 1.0);
                vWorldPos = worldPos4.xyz;

                // Wind power — smooth t² curve with the base anchored. This
                // is the Bezier-spine analogue: with only 2 vertical levels
                // in geometry, weighting amplitude by vHeight² keeps the
                // root still and pushes the tip most, which is what a 4-CP
                // Bezier curve would do for a flat-quad blade.
                float windPower = vHeight * vHeight;
                vec2 perp = vec2(-windDirection.y, windDirection.x);

                // === Cycle 14 Phase 2 wind playbook ===
                // Per docs/research-grass-2026-05.md: replace per-vertex
                // simplex noise with a layered analytic field — two octaves
                // of low-frequency sway in world space, modulated by a
                // slow scrolling gust envelope. The envelope is the single
                // biggest "zen" lever: it's what makes the field "breathe"
                // in waves instead of shaking uniformly.

                // Gust envelope: stacked sinusoids in world space, scrolled
                // at ~1.5 m/s along windDirection. Reads as gusts crossing
                // the meadow with ~30m wavelength and slow temporal drift.
                vec2 windFlow = windDirection * time * 1.5;
                vec2 gustPos = vWorldPos.xz - windFlow;
                float gA = sin(gustPos.x * 0.045 + gustPos.y * 0.038);
                float gB = sin(gustPos.x * 0.022 + gustPos.y * 0.029 + 1.7);
                // Bias toward calm with occasional strong gusts (~30/70).
                float gustEnv = smoothstep(-0.2, 1.0, gA * 0.6 + gB * 0.4);

                // Two octaves of analytic low-frequency sway in world space.
                // No texture sampling — sin/cos is cheap and avoids the
                // temporal aliasing of low-res scrolling noise.
                float t = time * windSpeed;
                float sway1 = sin(vWorldPos.x * 0.13 + vWorldPos.z * 0.09 + t * 0.85);
                float sway2 = sin(vWorldPos.x * 0.07 - vWorldPos.z * 0.11 + t * 0.55 + 1.3);
                float sway = sway1 * 0.6 + sway2 * 0.4;

                // Carrier: constant background lean + gust-modulated sway.
                // The constant lean is what makes blades visibly point
                // downwind in calm air; the gust modulation is the breath.
                float carrier = 0.45 + sway * 0.5 * (0.4 + gustEnv * 0.8);
                vec2 windDisp = windDirection * carrier * windStrength * windPower;

                // Per-blade decorrelator so neighbouring blades aren't in
                // lockstep along the wind axis.
                float bladeJitter = hash11(float(gl_InstanceID) * 0.137);
                windDisp *= 0.85 + bladeJitter * 0.3;

                // Tip-only flutter: high-freq, perpendicular to wind, only
                // the top ~35% of blade height. Reads as leaf-tip shimmer
                // without the whole-blade rattle that signaled "noisy"
                // before.
                float tipMask = smoothstep(0.65, 1.0, vHeight);
                float flutter = sin(vWorldPos.x * 0.7 + vWorldPos.z * 0.6 + time * 4.5 + bladeJitter * 6.28);
                windDisp += perp * flutter * 0.06 * tipMask * windStrength;

                // Entity interaction — grass bends AWAY from each entity's
                // oriented body footprint. Each entity has a forward direction;
                // we transform the world-space delta into the entity's local
                // frame, scale by its body half-extents, and use the SDF
                // distance to a rounded rectangle. Result: the grass-bend
                // zone follows the dog's actual mesh footprint as it turns,
                // instead of being locked to a world-axis ellipse.
                vec3 totalPush = vec3(0.0);
                // Cycle 114 Phase 5: contact darkening under the DOG, accumulated
                // alongside the push. Push magnitude is the wrong driver for
                // "the dog has weight": it peaks at the body's EDGE and can fall
                // off directly underneath, which is precisely where the shadow
                // should be darkest. This is a separate proximity term on its own
                // footprint, and it shares that footprint and its falloff radius
                // with the terrain shader (js/world/groundShading.js) so the
                // darkening does not change size when the dog steps off the grass.
                float contactShade = 0.0;
                for (int i = 0; i < ${this.config.maxInteractors}; i++) {
                    if (i >= interactorCount) break;

                    vec3 entityPos = interactorPositions[i];
                    float entityType = interactorData[i]; // 0=dog, 1=sheep
                    vec2 facing = interactorFacings[i];
                    if (length(facing) < 0.01) facing = vec2(0.0, 1.0); // safe default
                    vec2 fwd = normalize(facing);
                    vec2 right = vec2(fwd.y, -fwd.x);

                    vec2 fromEntity = vWorldPos.xz - entityPos.xz;
                    // Entity-local frame: x = sideways, y = forward.
                    vec2 local = vec2(dot(fromEntity, right), dot(fromEntity, fwd));

                    // Body half-extents per entity type. Dog is elongated
                    // along its facing axis; sheep are roughly square.
                    // Cycle 55: sourced from this.config.interaction (one source
                    // of truth shared with mobile + the WebGPU node material).
                    float halfLen = entityType < 0.5 ? ${dog.halfLen.toFixed(2)} : ${sheep.halfLen.toFixed(2)}; // along forward
                    float halfWid = entityType < 0.5 ? ${dog.halfWid.toFixed(2)} : ${sheep.halfWid.toFixed(2)}; // along right
                    float falloff = entityType < 0.5 ? ${dog.falloff.toFixed(2)} : ${sheep.falloff.toFixed(2)}; // outside-body push radius

                    // Rounded-rect SDF: distance from blade XZ to the body box.
                    // Negative inside, zero on edge, positive outside.
                    vec2 q = abs(local) - vec2(halfWid, halfLen);
                    float sdf = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);

                    // Push only when the blade is within the falloff ring of
                    // the body. Inside the body (sdf<0), full push. Outside,
                    // smoothstep-fall to zero over the falloff metres.
                    if (sdf < falloff) {
                        float strength = entityType < 0.5
                            ? ${this.config.interactionStrength.toFixed(1)}
                            : ${this.config.sheepInteractionStrength.toFixed(1)};
                        // Inside body: full push. Outside: smooth fade to 0.
                        // pushFalloffPower sharpens the curve so displacement
                        // concentrates near the body (boona13 squared-falloff
                        // feel); 1.0 reproduces the old 1-smoothstep falloff.
                        float t = clamp(sdf / falloff, 0.0, 1.0);
                        float pushStrength = pow(1.0 - t * t * (3.0 - 2.0 * t), ${I.pushFalloffPower.toFixed(2)}) * strength;
                        vec2 pushDir = length(fromEntity) > 0.001
                            ? normalize(fromEntity)
                            : right;
                        totalPush.xz += pushDir * pushStrength * windPower;
                        totalPush.y -= pushStrength * ${I.flattenAmount.toFixed(2)} * windPower;
                    }

                    // Dog only. Never sheep: a 5,000-instance version is a
                    // different problem with a different budget.
                    if (entityType < 0.5) {
                        contactShade = max(contactShade, sdsGroundContactFalloff(local.y, local.x));
                    }
                }

                // Apply displacements
                worldPos4.x += windDisp.x + totalPush.x;
                worldPos4.z += windDisp.y + totalPush.z;
                worldPos4.y += totalPush.y;

                // Cycle 114 Phase 2: colour variation is the terrain's own ground
                // field now, at the terrain's frequencies and rotation, instead of
                // sin(x * 0.2) * cos(z * 0.15) - a regular plaid at roughly 31m by
                // 42m. A varied ground under a plaid-varied grass layer is exactly
                // why the grass read as a carpet laid over the surface rather than
                // as the surface. Now a blade standing on a browner patch of
                // ground is itself browner, for the same reason.
                vColorVariation = sdsGroundVariation01(vWorldPos.xz);

                // Subtle shadow from interaction, times the dog's contact.
                vShadow = (1.0 - clamp(length(totalPush) * 0.15, 0.0, 0.2))
                    * (1.0 - contactShade * ${GROUND_CONTACT.strength});

                gl_Position = projectionMatrix * viewMatrix * worldPos4;
            }
        `;
    }

    /**
     * Mobile vertex shader - simplified, no wind animation
     */
    getMobileVertexShader() {
        const I = this.config.interaction;
        const dog = I.dog;
        return `
            // See getDesktopVertexShader: the precision declaration lived only
            // in the deleted js/shaders/grass mirrors, never in the shader that
            // compiles.
            precision highp float;
            precision highp int;

            attribute vec4 bladeData;

            varying vec2 vUv;
            varying vec3 vWorldPos;
            varying float vHeight;
            varying float vColorVariation;
            varying float vShadow;
            varying float vHueOffset;

            uniform vec3 interactorPositions[${this.config.maxInteractors}];
            uniform vec2 interactorFacings[${this.config.maxInteractors}];
            uniform int interactorCount;
            uniform float interactionRadius;
            uniform float interactionStrength;

            uniform vec3 uCameraPos;
            uniform float grassFadeStart;
            uniform float grassFadeEnd;

            ${GROUND_VARIATION_GLSL}
            ${GRASS_HUE_GLSL}
            ${GROUND_CONTACT_GLSL}

            float smoothFalloff(float dist, float radius) {
                float t = clamp(dist / radius, 0.0, 1.0);
                return 1.0 - t * t * (3.0 - 2.0 * t);
            }

            float hash11(float n) {
                return fract(sin(n) * 43758.5453123);
            }

            void main() {
                vUv = uv;
                vHeight = bladeData.y;

                // Stochastic LOD dither (same as desktop) — smooth density
                // gradient, no count-step ring visible to the player.
                vec4 baseWorld = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
                float distXZ = length(baseWorld.xz - uCameraPos.xz);
                float fadeT = clamp((distXZ - grassFadeStart) / (grassFadeEnd - grassFadeStart), 0.0, 1.0);
                float bladeHash = hash11(float(gl_InstanceID) * 0.137 + baseWorld.x * 0.13 + baseWorld.z * 0.07);
                if (bladeHash < fadeT) {
                    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                    vWorldPos = vec3(0.0);
                    vColorVariation = 0.0;
                    vShadow = 1.0;
                    vHueOffset = 0.0;
                    return;
                }

                // Cycle 114 Phase 2: clump-coherent hue, identical to desktop.
                vHueOffset = sdsGrassHueOffset(baseWorld.xz, 0.04);

                vec3 pos = position;
                vec4 worldPos4 = modelMatrix * instanceMatrix * vec4(pos, 1.0);
                vWorldPos = worldPos4.xyz;

                float windPower = vHeight * vHeight;

                // Player interaction on mobile — grass bends AWAY from the
                // dog's oriented body footprint (same SDF as desktop, just
                // applied to the first interactor only — mobile keeps a
                // single push to fit the iOS Safari uniform limit).
                vec3 totalPush = vec3(0.0);
                // Cycle 114 Phase 5: the contact term, same shared footprint and
                // radius as desktop and as the terrain. Mobile only ever pushes
                // interactor 0, which is always the player's dog (main.js pushes
                // the player slot first), so there is no sheep to exclude here.
                float contactShade = 0.0;
                if (interactorCount > 0) {
                    vec3 entityPos = interactorPositions[0];
                    vec2 facing = interactorFacings[0];
                    if (length(facing) < 0.01) facing = vec2(0.0, 1.0);
                    vec2 fwd = normalize(facing);
                    vec2 right = vec2(fwd.y, -fwd.x);
                    vec2 fromEntity = vWorldPos.xz - entityPos.xz;
                    vec2 local = vec2(dot(fromEntity, right), dot(fromEntity, fwd));
                    // Cycle 55: dog footprint sourced from this.config.interaction.
                    float halfLen = ${dog.halfLen.toFixed(2)};
                    float halfWid = ${dog.halfWid.toFixed(2)};
                    float falloff = ${dog.falloff.toFixed(2)};
                    vec2 q = abs(local) - vec2(halfWid, halfLen);
                    float sdf = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
                    if (sdf < falloff) {
                        float t = clamp(sdf / falloff, 0.0, 1.0);
                        float pushStrength = pow(1.0 - t * t * (3.0 - 2.0 * t), ${I.pushFalloffPower.toFixed(2)}) * interactionStrength;
                        vec2 pushDir = length(fromEntity) > 0.001
                            ? normalize(fromEntity)
                            : right;
                        totalPush.xz += pushDir * pushStrength * windPower;
                        totalPush.y -= pushStrength * ${I.flattenAmount.toFixed(2)} * windPower;
                    }
                    contactShade = sdsGroundContactFalloff(local.y, local.x);
                }

                worldPos4.x += totalPush.x;
                worldPos4.z += totalPush.z;
                worldPos4.y += totalPush.y;

                // Cycle 114 Phase 2: the shared ground field, same as desktop.
                vColorVariation = sdsGroundVariation01(vWorldPos.xz);
                vShadow = (1.0 - clamp(length(totalPush) * 0.1, 0.0, 0.15))
                    * (1.0 - contactShade * ${GROUND_CONTACT.strength});

                gl_Position = projectionMatrix * viewMatrix * worldPos4;
            }
        `;
    }

    /**
     * Fragment shader - rich color gradients and lighting
     */
    getFragmentShader() {
        return `
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
            varying float vHueOffset;

            void main() {
                // Rich three-point color gradient
                vec3 color;
                if (vHeight < 0.4) {
                    color = mix(baseColor, midColor, vHeight / 0.4);
                } else {
                    color = mix(midColor, tipColor, (vHeight - 0.4) / 0.6);
                }

                // Per-blade hue offset (subtle G/-R/+B nudge for variety)
                color += vec3(-vHueOffset, vHueOffset, vHueOffset * 0.5);

                // Add natural color variation. Cycle 114 Phase 2: the amplitudes
                // are unchanged; what changed is that vColorVariation is now the
                // terrain's own ground field, so a warmer, browner tint lands on
                // the blades standing where the ground itself is warmer and
                // browner. Constants live in js/world/groundShading.js.
                vec3 variation = vec3(
                    vColorVariation * ${GRASS_VARIATION_TINT.red},
                    vColorVariation * ${GRASS_VARIATION_TINT.green} + (${GRASS_VARIATION_TINT.greenBias}),
                    vColorVariation * (${GRASS_VARIATION_TINT.blue})
                );
                color += variation;

                // Apply shadow from interaction
                color *= vShadow;

                // Subtle ambient occlusion at base
                float ao = 0.7 + 0.3 * vHeight;
                color *= ao;

                vec3 toCamera = normalize(uCameraPos - vWorldPos);

                // Slight translucency effect at tips (brighter when backlit)
                float backlight = 1.0 + (1.0 - abs(dot(toCamera, vec3(0.0, 1.0, 0.0)))) * vHeight * 0.15;
                color *= backlight;

                // Cycle 14 Phase 2 fake-SSS: sun-aligned back-lit term.
                // pow^4 keeps the halo tight to the sun silhouette so the
                // rim only fires on sunrise/sunset compositions where the
                // camera is looking toward the sun through the blade.
                // tipColor (~30% brighter than base) gives the warm-yellow
                // halo grass needs to read as thin organic foliage.
                vec3 toSun = normalize(uSunDirection);
                float tipMask = smoothstep(0.6, 1.0, vHeight);
                float backlitSun = pow(max(dot(toCamera, -toSun), 0.0), 4.0);
                color += backlitSun * tipColor * 0.7 * tipMask;

                // Soft vertical rim — generic ambient lift on tips, kept at
                // ~⅓ the previous strength so the new sun-aligned halo
                // dominates without losing the all-day "tip catches light"
                // read.
                float verticalRim = pow(max(dot(toCamera, vec3(0.0, 1.0, 0.0)), 0.0), 4.0);
                color += verticalRim * tipColor * 0.2 * tipMask;

                // FogExp2 — matches scene.fog (Atmosphere keeps the color
                // and density in sync with the sky horizon every frame).
                float dist = length(vWorldPos - uCameraPos);
                float fogFactor = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
                color = mix(color, fogColor, fogFactor);

                gl_FragColor = vec4(color, 1.0);
            }
        `;
    }

    /**
     * Generate chunks with grass instances
     */
    generateChunks() {
        const { worldSize, chunkSize, clumpsPerChunk, grassRadius, hasExplicitGrassRadius } = this.config;
        const halfWorld = worldSize / 2;
        const chunksPerSide = Math.ceil(worldSize / chunkSize);

        // Cycle 18 Phase 1: when a scene declares `grassRadius`, cull chunks
        // tighter (`grassRadius + chunkSize`) so the expanded grid doesn't
        // generate dead chunks on the corners — total chunk count tracks the
        // declared radius rather than the bounding-box default. Legacy
        // (Field, no explicit radius) keeps the original `halfWorld * 1.2`
        // generous cull byte-identical.
        const cullDistance = hasExplicitGrassRadius
            ? grassRadius + chunkSize
            : halfWorld * 1.2;

        // Per Cycle 18 Phase 1 step 4: when grassRadius is wider than the
        // pre-cycle-18 default falloff (`baseWorldSize * 0.6 = 252m` desktop,
        // `132m` mobile), rescale per-chunk clump count down so the user-tuned
        // `clumpsPerChunk` lands roughly the same per-m² density across the
        // wider zone. min(1, defaultRadius / grassRadius) caps at 1 so RH
        // (172m, smaller than default 252m) keeps full clump density.
        // Total clump count still grows for OC because more chunks exist —
        // but the per-chunk number doesn't get multiplied a second time.
        const defaultRadius = (this.isMobile ? 220 : 420) * 0.6;
        const clumpScale = hasExplicitGrassRadius
            ? Math.min(1, defaultRadius / grassRadius)
            : 1;
        // Cycle 22 Phase D: apply auto-LOD multiplier. _autoLodFactor sits
        // at 1.0 until update() observes sustained frame-time pressure; when
        // it dips, chunk rebuilds (scene swap, first build) materialize at
        // the lower density. Floored at _autoLodFloor (0.5) so the player
        // never sees totally bare ground.
        const adjustedClumpsPerChunk = Math.max(
            1,
            Math.round(clumpsPerChunk * clumpScale * this._autoLodFactor)
        );

        // Cycle 23 Phase D2: meadow-quad LOD. Chunks whose center sits
        // beyond MEADOW_QUAD_RADIUS_M from origin render as a single
        // textured plane instead of clump-instancing thousands of blades.
        // Static decision at build time (not camera-relative). Disabled on
        // 'low' tier (mobile-class) which already runs reduced clump density.
        const meadowQuadEnabled = this._tierPreset.meadowQuadEnabled === true;
        const MEADOW_QUAD_RADIUS_M = 260;

        // Cycle 64: the grid centres on grassCenter (origin for every pre-64
        // scene) so a large island can place its grass over the play area
        // instead of spanning the whole island from the world origin.
        const gridOriginX = this._grassCenter.x;
        const gridOriginZ = this._grassCenter.z;
        for (let cx = 0; cx < chunksPerSide; cx++) {
            for (let cz = 0; cz < chunksPerSide; cz++) {
                const chunkMinX = gridOriginX - halfWorld + cx * chunkSize;
                const chunkMinZ = gridOriginZ - halfWorld + cz * chunkSize;
                const chunkMaxX = chunkMinX + chunkSize;
                const chunkMaxZ = chunkMinZ + chunkSize;
                const chunkCenterX = (chunkMinX + chunkMaxX) / 2;
                const chunkCenterZ = (chunkMinZ + chunkMaxZ) / 2;

                // Skip chunks that are too far from center (create circular field).
                // Cycle 64: coastline scenes cull by the signed-distance field so
                // the grass spans the whole island polygon, not a disc round the
                // world origin (the boot's foot is ~1.1km from origin).
                const distFromCenter = Math.sqrt(chunkCenterX * chunkCenterX + chunkCenterZ * chunkCenterZ);
                if (this._isCoastline) {
                    const sd = sampleSignedDistance(this._coastField, chunkCenterX, chunkCenterZ);
                    if (sd < -chunkSize) continue; // chunk fully outside the shore
                } else if (distFromCenter > cullDistance) {
                    continue;
                }

                // Cycle 23 Phase D2: far-ring meadow-quad path. Chunks within
                // [MEADOW_QUAD_RADIUS_M, cullDistance] become single textured
                // planes; near chunks keep clump instancing. Disabled for
                // coastline (the origin-radial ring would tile water over the
                // boot's bays); coastline relies on per-blade dither LOD instead.
                if (meadowQuadEnabled && !this._isCoastline && distFromCenter > MEADOW_QUAD_RADIUS_M) {
                    const quadChunk = this.createMeadowQuadChunk(
                        cx, cz, chunkMinX, chunkMinZ, chunkMaxX, chunkMaxZ
                    );
                    if (quadChunk) {
                        const key = `${cx}_${cz}`;
                        this.chunks.set(key, quadChunk);
                    }
                    continue;
                }

                // Create chunk
                const chunk = this.createChunk(
                    cx, cz,
                    chunkMinX, chunkMinZ,
                    chunkMaxX, chunkMaxZ,
                    adjustedClumpsPerChunk
                );

                if (chunk) {
                    const key = `${cx}_${cz}`;
                    this.chunks.set(key, chunk);
                }
            }
        }
    }

    /**
     * Cycle 84: the flagship coastline renders its whole grass field as one
     * compute-culled InstancedMesh on the WebGPU path. Gated to that path:
     * coastline + the webgpu (WebGPU) blade material applied + the three.webgpu
     * namespace available. WebGL keeps the per-chunk path byte-identical.
     */
    _shouldComputeCullGrass() {
        return this._isCoastline
            && this.webgpuGrassBladeMaterialSummary?.applied === true
            && !!getWebGpuModules()?.TSL;
    }

    /**
     * Cycle 81: build the consolidated compute-cull grass. Gathers every clump's
     * transform across the field (RNG-order-identical to the per-chunk path), then
     * drives ONE InstancedMesh via a TSL compute frustum-cull + indirect draw. The
     * blade material reads per-instance data through the GPU compaction remap and
     * folds T*R*S into positionNode (pixel-identical). Falls back to the per-chunk
     * path on any failure.
     */
    _buildConsolidatedComputeCullGrass() {
        const webGpuModules = getWebGpuModules();
        const { offsets, transforms, count } = this._gatherComputeCullClumps();
        if (count === 0) {
            console.warn('[GRASS] compute-cull gathered 0 clumps; per-chunk fallback');
            this.generateChunks();
            return;
        }
        try {
            const controller = createGrassComputeCull(webGpuModules, {
                clumpGeometry: this.clumpGeometry,
                offsets,
                transforms,
                count,
                cullRadius: Math.max(4, this.config.chunkSize * 0.15),
                // Rebuild the blade material with the compute-cull remap nodes
                // (pixel-identical) and point the live controls at it. The throwaway
                // material created during init (to detect webgpu support) is disposed.
                buildMaterial: (nodes) => {
                    const prev = this.grassMaterial;
                    const m = this.createGrassMaterial(nodes);
                    if (prev && prev !== m) { try { prev.dispose(); } catch { /* ignore */ } }
                    this.grassMaterial = m;
                    return m;
                },
            });
            this._computeCullController = controller;
            this.scene.add(controller.mesh);
            this.stats.totalClumps = count;
            this.stats.visibleClumps = count;
            console.log(`[GRASS] consolidated compute-cull: ${count} clumps -> 1 InstancedMesh (indirect=${controller.diag.indirectAttached})`);
        } catch (e) {
            console.error('[GRASS] compute-cull build failed; per-chunk fallback:', e);
            this._computeCullController = null;
            this.generateChunks();
        }
    }

    /**
     * Cycle 81: gather every clump's (offset, transform) across the whole field into
     * flat arrays, mirroring generateChunks' grid iteration + cull exactly so the
     * random stream advances identically to the per-chunk path.
     */
    _gatherComputeCullClumps() {
        const { worldSize, chunkSize, clumpsPerChunk, grassRadius, hasExplicitGrassRadius } = this.config;
        const halfWorld = worldSize / 2;
        const chunksPerSide = Math.ceil(worldSize / chunkSize);
        const cullDistance = hasExplicitGrassRadius ? grassRadius + chunkSize : halfWorld * 1.2;
        const defaultRadius = (this.isMobile ? 220 : 420) * 0.6;
        const clumpScale = hasExplicitGrassRadius ? Math.min(1, defaultRadius / grassRadius) : 1;
        const adjustedClumpsPerChunk = Math.max(1, Math.round(clumpsPerChunk * clumpScale * this._autoLodFactor));
        const gridOriginX = this._grassCenter.x;
        const gridOriginZ = this._grassCenter.z;

        const offsets = [];
        const transforms = [];
        for (let cx = 0; cx < chunksPerSide; cx++) {
            for (let cz = 0; cz < chunksPerSide; cz++) {
                const chunkMinX = gridOriginX - halfWorld + cx * chunkSize;
                const chunkMinZ = gridOriginZ - halfWorld + cz * chunkSize;
                const chunkMaxX = chunkMinX + chunkSize;
                const chunkMaxZ = chunkMinZ + chunkSize;
                const chunkCenterX = (chunkMinX + chunkMaxX) / 2;
                const chunkCenterZ = (chunkMinZ + chunkMaxZ) / 2;
                const distFromCenter = Math.sqrt(chunkCenterX * chunkCenterX + chunkCenterZ * chunkCenterZ);
                if (this._isCoastline) {
                    const sd = sampleSignedDistance(this._coastField, chunkCenterX, chunkCenterZ);
                    if (sd < -chunkSize) continue;
                } else if (distFromCenter > cullDistance) {
                    continue;
                }
                this._gatherChunkClumps(chunkMinX, chunkMinZ, chunkMaxX, chunkMaxZ, adjustedClumpsPerChunk, offsets, transforms);
            }
        }
        return {
            offsets: new Float32Array(offsets),
            transforms: new Float32Array(transforms),
            count: offsets.length / 3,
        };
    }

    /**
     * Cycle 81: per-chunk clump gather. Two-phase to mirror createChunk's RNG order
     * EXACTLY (all x/z/density randoms first, then per-valid yaw/scale), so the
     * consolidated field layout is byte-identical to the per-chunk path.
     */
    _gatherChunkClumps(minX, minZ, maxX, maxZ, clumpCount, offsets, transforms) {
        const valid = [];
        for (let i = 0; i < clumpCount * 1.5; i++) {
            const x = minX + this.random() * (maxX - minX);
            const z = minZ + this.random() * (maxZ - minZ);
            if (this.isExcluded(x, z)) continue;
            let densityFactor;
            if (this._isCoastline) {
                const sd = sampleSignedDistance(this._coastField, x, z);
                densityFactor = Math.max(0, Math.min(1, sd / this._coastShoreFade));
            } else {
                const d = Math.sqrt(x * x + z * z);
                densityFactor = Math.max(0, 1 - d / this.config.grassRadius);
            }
            if (this.random() > densityFactor * 0.8 + 0.2) continue;
            // Cycle 114 Phase 1: same soft exclusion band as createChunk, drawn
            // in the same place in the random stream so the consolidated field
            // stays byte-identical to the per-chunk one. Cycle 115 Phase 4 moved
            // both that band and the gate approach behind one call, for the same
            // reason: this line and createChunk's twin must stay equivalent.
            const groundKeep = this._rollGroundKeep(x, z);
            if (groundKeep <= 0) continue;
            valid.push({ x, z, groundKeep });
            if (valid.length >= clumpCount) break;
        }
        for (const pos of valid) {
            let baseY = this.heightfield ? this.heightfield.meshSampleY(pos.x, pos.z) : 0;
            if (!Number.isFinite(baseY) || baseY > 50 || baseY < -10) baseY = 0;
            const yaw = this.random() * Math.PI * 2;
            const d = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
            const distanceScale = Math.max(0.5, 1 - d / (this.config.worldSize * 0.8));
            const scale = (0.7 + this.random() * 0.6) * distanceScale;
            const heightMul = this._tallHeightMul(pos.x, pos.z)
                * this._exclusionHeightMul(pos.groundKeep);
            offsets.push(pos.x, baseY, pos.z);
            transforms.push(yaw, scale, heightMul);
        }
    }

    /**
     * Cycle 87 Phase 3: build the streamed grass annulus declared by
     * `sceneGrass.streamed` ({ grassRadius, clumpsPerChunk }). Called by
     * js/world/foliageStreaming.js as the final wave, AFTER first-interactive.
     * Covers the grid out to streamed.grassRadius around grassCenter, skipping
     * every cell the cold grid already covered. On the consolidated WebGPU
     * path this builds a SECOND compute-cull controller with its own material
     * (the compaction remap nodes are per-controller); on the per-chunk path
     * it adds ordinary chunks sharing the live material.
     *
     * Inert (returns {built:false}) when the scene declares no streamed grass,
     * the per-tier clump count is 0, init failed, or a visual-golden run is
     * active (goldens stay byte-identical).
     *
     * @returns {{built: boolean, reason?: string, clumps?: number}}
     */
    buildStreamedGrass() {
        const streamed = this.sceneGrass?.streamed;
        if (!streamed || typeof streamed.grassRadius !== 'number') return { built: false, reason: 'no-config' };
        if (!this.initializationSucceeded) return { built: false, reason: 'init-failed' };
        if (createVisualGoldenRandom()) return { built: false, reason: 'visual-golden' };
        if (this._streamedCullController) return { built: false, reason: 'already-built' };
        const rawClumpsPerChunk = this.isMobile
            ? (streamed.clumpsPerChunk?.mobile ?? 0)
            : (streamed.clumpsPerChunk?.desktop ?? 0);
        const clumpsPerChunk = this.grassProfile
            ? Math.max(1, Math.round(rawClumpsPerChunk * this.grassProfile.streamedClumpDensityScale))
            : rawClumpsPerChunk;
        if (!(clumpsPerChunk > 0)) return { built: false, reason: 'zero-clumps' };
        if (streamed.grassRadius <= this.config.grassRadius) return { built: false, reason: 'radius-inside-cold' };

        const { chunkSize } = this.config;
        const streamedWorldSize = (streamed.grassRadius + 40) * 2;
        const halfWorld = streamedWorldSize / 2;
        const chunksPerSide = Math.ceil(streamedWorldSize / chunkSize);
        const gridOriginX = this._grassCenter.x;
        const gridOriginZ = this._grassCenter.z;
        // The cold grid's coverage bbox: cells whose center falls inside it
        // were already considered by the cold build (generated or SDF-culled).
        const coldHalf = this.config.worldSize / 2;
        const coldMinX = gridOriginX - coldHalf, coldMaxX = gridOriginX + coldHalf;
        const coldMinZ = gridOriginZ - coldHalf, coldMaxZ = gridOriginZ + coldHalf;

        const offsets = [];
        const transforms = [];
        const perChunkCells = [];
        for (let cx = 0; cx < chunksPerSide; cx++) {
            for (let cz = 0; cz < chunksPerSide; cz++) {
                const chunkMinX = gridOriginX - halfWorld + cx * chunkSize;
                const chunkMinZ = gridOriginZ - halfWorld + cz * chunkSize;
                const chunkMaxX = chunkMinX + chunkSize;
                const chunkMaxZ = chunkMinZ + chunkSize;
                const chunkCenterX = (chunkMinX + chunkMaxX) / 2;
                const chunkCenterZ = (chunkMinZ + chunkMaxZ) / 2;
                if (chunkCenterX >= coldMinX && chunkCenterX <= coldMaxX
                    && chunkCenterZ >= coldMinZ && chunkCenterZ <= coldMaxZ) continue;
                if (this._isCoastline) {
                    const sd = sampleSignedDistance(this._coastField, chunkCenterX, chunkCenterZ);
                    if (sd < -chunkSize) continue;
                } else {
                    const dx = chunkCenterX - gridOriginX;
                    const dz = chunkCenterZ - gridOriginZ;
                    if (Math.sqrt(dx * dx + dz * dz) > streamed.grassRadius + chunkSize) continue;
                }
                if (this._computeCullController) {
                    this._gatherChunkClumps(chunkMinX, chunkMinZ, chunkMaxX, chunkMaxZ, clumpsPerChunk, offsets, transforms);
                } else {
                    perChunkCells.push({ cx, cz, chunkMinX, chunkMinZ, chunkMaxX, chunkMaxZ });
                }
            }
        }

        if (!this._computeCullController) {
            // Per-chunk path (WebGL fallback): ordinary chunks sharing the live
            // material; keyed with an 's' prefix so streamed cells never
            // collide with cold grid keys.
            let added = 0;
            for (const cell of perChunkCells) {
                const chunk = this.createChunk(
                    cell.cx, cell.cz,
                    cell.chunkMinX, cell.chunkMinZ, cell.chunkMaxX, cell.chunkMaxZ,
                    clumpsPerChunk
                );
                if (chunk) {
                    this.chunks.set(`s${cell.cx}_${cell.cz}`, chunk);
                    added += chunk.mesh?.count ?? 0;
                }
            }
            this.stats.totalClumps = (this.stats.totalClumps ?? 0) + added;
            console.log(`[GRASS] streamed per-chunk grass: +${added} clumps`);
            return { built: added > 0, clumps: added };
        }

        const count = offsets.length / 3;
        if (count === 0) return { built: false, reason: 'no-clumps-gathered' };
        try {
            const webGpuModules = getWebGpuModules();
            // createGrassMaterial repoints the instance-level controls/summary
            // at the newest material; snapshot the primary's and restore after
            // so per-frame updates keep driving BOTH (see the fan-outs below).
            const primaryControls = this.webgpuGrassBladeMaterialControls;
            const primarySummary = this.webgpuGrassBladeMaterialSummary;
            let streamedMaterial = null;
            const controller = createGrassComputeCull(webGpuModules, {
                clumpGeometry: this.clumpGeometry,
                offsets: new Float32Array(offsets),
                transforms: new Float32Array(transforms),
                count,
                cullRadius: Math.max(4, this.config.chunkSize * 0.15),
                buildMaterial: (nodes) => {
                    streamedMaterial = this.createGrassMaterial(nodes);
                    return streamedMaterial;
                },
            });
            this._streamedBladeControls = streamedMaterial?.userData?.webgpuGrassBladeMaterialControls ?? null;
            this._streamedMaterial = streamedMaterial;
            this.webgpuGrassBladeMaterialControls = primaryControls;
            this.webgpuGrassBladeMaterialSummary = primarySummary;
            this._streamedCullController = controller;
            this.scene.add(controller.mesh);
            this.stats.totalClumps = (this.stats.totalClumps ?? 0) + count;
            console.log(`[GRASS] streamed compute-cull grass: +${count} clumps -> 1 InstancedMesh`);
            return { built: true, clumps: count };
        } catch (e) {
            console.warn('[GRASS] streamed grass build failed (cold grass unaffected):', e);
            this._streamedCullController = null;
            this._streamedMaterial = null;
            this._streamedBladeControls = null;
            return { built: false, reason: String(e?.message || e) };
        }
    }

    /**
     * Create a single chunk of grass
     */
    createChunk(cx, cz, minX, minZ, maxX, maxZ, clumpCount) {
        const validPositions = [];
        const dummy = new THREE.Object3D();

        // Generate grass positions within chunk
        for (let i = 0; i < clumpCount * 1.5; i++) { // Oversample then filter
            const x = minX + this.random() * (maxX - minX);
            const z = minZ + this.random() * (maxZ - minZ);

            // Check exclusion zones
            if (this.isExcluded(x, z)) continue;

            // Distance-based density falloff. Cycle 18 Phase 1: zero point is
            // `grassRadius` — `worldSize * densityRange` for opt-out scenes
            // (byte-identical to pre-cycle-18) or the explicit per-scene
            // value for RH/OC (172m / 372m respectively). The 0.2 acceptance
            // floor keeps a sparse outer ring up to the chunk-cull distance,
            // which lets the boundary cull (island scenes) draw the actual
            // shoreline rather than the density curve.
            // Cycle 64: coastline density follows the signed-distance field
            // (full inside, fading to zero across the last `_coastShoreFade` m
            // before the shore) so the whole boot is grassed, not a disc round
            // the origin. Other scenes keep the origin-radial falloff.
            let densityFactor;
            if (this._isCoastline) {
                const sd = sampleSignedDistance(this._coastField, x, z);
                densityFactor = Math.max(0, Math.min(1, sd / this._coastShoreFade));
            } else {
                const distFromCenter = Math.sqrt(x * x + z * z);
                densityFactor = Math.max(0, 1 - distFromCenter / this.config.grassRadius);
            }
            if (this.random() > densityFactor * 0.8 + 0.2) continue;

            // Cycle 114 Phase 1: probabilistic reject inside an exclusion zone's
            // falloff band, so grass thins toward the pen instead of stopping at
            // a knife edge. The random is only drawn when the clump is actually
            // in a band (keep < 1), which keeps the scatter stream - and every
            // golden frame away from a zone - byte-identical to pre-Cycle-114.
            //
            // Cycle 115 Phase 4 moved that test, and the gate approach's, behind
            // _rollGroundKeep. It draws the exact same randoms in the exact same
            // order; the approach's own reject reads a position hash rather than
            // adding a draw, which keeps the shift it causes to the chunks it
            // actually touches. _gatherChunkClumps carries the identical line;
            // the two must not drift.
            const groundKeep = this._rollGroundKeep(x, z);
            if (groundKeep <= 0) continue;

            validPositions.push({ x, z, groundKeep });

            if (validPositions.length >= clumpCount) break;
        }

        if (validPositions.length === 0) return null;

        const usesWebGpuBladeMaterial = this.webgpuGrassBladeMaterialSummary?.applied === true;
        const chunkGeometry = usesWebGpuBladeMaterial
            ? this.clumpGeometry.clone()
            : this.clumpGeometry;
        const instanceWorldOffsets = usesWebGpuBladeMaterial
            ? new Float32Array(validPositions.length * 3)
            : null;

        // Create instanced mesh for this chunk
        const instancedMesh = new THREE.InstancedMesh(
            chunkGeometry,
            this.grassMaterial,
            validPositions.length
        );

        // Set up instances
        validPositions.forEach((pos, i) => {
            // Cycle 14 Phase 1: meshSampleY returns the exact visible mesh Y
            // via triangle interpolation, so the old -0.1 "dip into mesh"
            // hack is gone. Blades sit on the surface, not 10cm below it.
            let baseY = this.heightfield ? this.heightfield.meshSampleY(pos.x, pos.z) : 0;
            // Cycle 19 Phase 1 hotfix (2026-05-04): reverted Cycle 17 Phase
            // 3's tighten of `> 50` → `> 10`. The tighten assumed terrain
            // mesh Y stays under heightScale (max 6m). In practice the
            // baked heightmaps store values already in metres while
            // `Heightfield.sample()` multiplies by `peakHeight` again — a
            // longstanding double-amplification (since Cycle 4/5) that
            // makes OC peaks ~25m and RH peaks ~36m on the rendered mesh.
            // The `> 10` cap was snapping every legit displaced-mesh Y to
            // 0 across both scenes, dropping grass to water level. Relaxing
            // back to `> 50` restores grass-on-terrain. The original
            // gallery-review "skyward blade near trees" spike concern
            // remains; if it re-surfaces after this revert, fix the bake-
            // amplitude bug at the root (`scripts/bake-heightmap.mjs` writes
            // pre-multiplied metres) instead of clamping the symptom.
            if (!Number.isFinite(baseY) || baseY > 50 || baseY < -10) baseY = 0;
            if (instanceWorldOffsets) {
                const offsetIndex = i * 3;
                instanceWorldOffsets[offsetIndex] = pos.x;
                instanceWorldOffsets[offsetIndex + 1] = baseY;
                instanceWorldOffsets[offsetIndex + 2] = pos.z;
            }
            dummy.position.set(pos.x, baseY, pos.z);

            // Random rotation and scale
            dummy.rotation.y = this.random() * Math.PI * 2;

            // Scale variation with distance falloff
            const distFromCenter = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
            const distanceScale = Math.max(0.5, 1 - distFromCenter / (this.config.worldSize * 0.8));
            const scale = (0.7 + this.random() * 0.6) * distanceScale;
            // Cycle 64: a tall-grass band scales blade HEIGHT (Y) only, leaving
            // the footprint unchanged so it reads as taller grass, not bigger
            // clumps. heightMul = 1 everywhere outside a declared tallZone.
            // Cycle 114 Phase 1 multiplies in the exclusion edge taper on the
            // same Y-only channel, for the same reason: shorter grass near the
            // pen, not smaller clumps.
            const heightMul = this._tallHeightMul(pos.x, pos.z)
                * this._exclusionHeightMul(pos.groundKeep);
            if (heightMul !== 1) {
                dummy.scale.set(scale, scale * heightMul, scale);
            } else {
                dummy.scale.setScalar(scale);
            }

            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);
        });

        if (instanceWorldOffsets) {
            chunkGeometry.setAttribute(
                'instanceWorldOffset',
                new THREE.InstancedBufferAttribute(instanceWorldOffsets, 3)
            );
        }
        instancedMesh.instanceMatrix.needsUpdate = true;
        instancedMesh.frustumCulled = false; // We handle culling per-chunk
        // Cycle 90: grass never casts shadows. With a shadow-casting scene
        // light live on WebGPU, per-chunk blade geometry in the depth pass
        // measured field/practice at 48 FPS median with 687ms worst frames
        // (cycle90-validation) for shadows no one can see. The consolidated
        // compute-cull grass path has always shipped castShadow = false.
        instancedMesh.castShadow = false;
        instancedMesh.receiveShadow = true;

        // Calculate chunk bounding sphere for frustum culling
        const centerX = (minX + maxX) / 2;
        const centerZ = (minZ + maxZ) / 2;
        const radius = Math.sqrt(2) * (maxX - minX) / 2;

        const chunk = {
            mesh: instancedMesh,
            cx, cz,
            bounds: { minX, minZ, maxX, maxZ },
            center: new THREE.Vector3(centerX, 0.5, centerZ),
            radius,
            clumpCount: validPositions.length,
            fullCount: validPositions.length, // Full instance count for LOD decimation
            visible: true,
            lodLevel: 0, // 0 = full, 1 = 50%, 2 = 25%
            ownsGeometry: chunkGeometry !== this.clumpGeometry,
        };

        this.scene.add(instancedMesh);
        this.stats.totalClumps += validPositions.length;

        return chunk;
    }

    /**
     * Cycle 23 Phase D2 — far-ring meadow-quad chunk. Single 40m × 40m plane
     * laid flat at the chunk's terrain-Y, colored from the scene's grass.mid
     * with a procedural noise mix toward grass.tip. Replaces ~67k tris of
     * clump instancing with 2 tris per chunk where the camera can't tell.
     *
     * @param {number} cx
     * @param {number} cz
     * @param {number} minX
     * @param {number} minZ
     * @param {number} maxX
     * @param {number} maxZ
     */
    createMeadowQuadChunk(cx, cz, minX, minZ, maxX, maxZ) {
        const centerX = (minX + maxX) / 2;
        const centerZ = (minZ + maxZ) / 2;

        // Skip if outside boundary (matches isExcluded for clump chunks).
        if (this.isExcluded(centerX, centerZ)) return null;

        let centerY = this.heightfield ? this.heightfield.meshSampleY(centerX, centerZ) : 0;
        if (!Number.isFinite(centerY) || centerY > 50 || centerY < -10) centerY = 0;
        // Skip quads that would sit below the shoreline (water-merge strip).
        if (centerY < SHORELINE_Y_MIN) return null;

        const size = maxX - minX;
        // Cycle 51 fix: the far-ring meadow quad must FOLLOW the terrain, not
        // sit as a single flat plane pinned to the center height. On a relief
        // island (Open Country) a flat 40m quad floats above the dips and
        // sinks into the rises, reading as detached planes near the shore.
        // Give each chunk a lightly subdivided plane and displace every vertex
        // to the heightfield, so it conforms while staying a couple-dozen tris
        // (still far cheaper than clump-instancing thousands of blades).
        // The plane is rotated -PI/2 about X to lie horizontal, so local
        // (lx, ly, lz) maps to world (lx, lz, -ly): world Y is the local Z we
        // set, and the vertex's world XZ is (centerX + lx, centerZ - ly).
        const SEG = 4; // 10m spans, matching the ~10.4m terrain tessellation
        const geo = new THREE.PlaneGeometry(size, size, SEG, SEG);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const wx = centerX + pos.getX(i);
            const wz = centerZ - pos.getY(i);
            let y = this.heightfield ? this.heightfield.meshSampleY(wx, wz) : 0;
            if (!Number.isFinite(y) || y > 50 || y < -10) y = centerY;
            pos.setZ(i, y - centerY); // world Y = mesh.position.y + localZ
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();

        if (!this._meadowQuadMaterial) {
            this._meadowQuadMaterial = this.createMeadowQuadMaterial();
        }

        const mesh = new THREE.Mesh(geo, this._meadowQuadMaterial);
        mesh.rotation.x = -Math.PI / 2;
        // Slight Y lift to clear the terrain mesh and avoid z-fighting.
        mesh.position.set(centerX, centerY + 0.05, centerZ);
        mesh.receiveShadow = true;
        mesh.frustumCulled = false; // Per-chunk culling handled by GrassSystem.

        const radius = Math.sqrt(2) * (maxX - minX) / 2;
        const chunk = {
            mesh,
            cx, cz,
            bounds: { minX, minZ, maxX, maxZ },
            center: new THREE.Vector3(centerX, centerY + 0.05, centerZ),
            radius,
            clumpCount: 0,
            fullCount: 0,
            visible: true,
            lodLevel: 4, // T4 marker
            isMeadowQuad: true,
        };

        this.scene.add(mesh);
        return chunk;
    }

    /**
     * Cycle 23 Phase D2 — shared procedural-meadow material. MeshLambert
     * (cheap, shadowable) tinted by scene.grass.mid with a stable per-uv
     * noise variance so the far-ring doesn't read as flat carpet. Same
     * fog include as the rest of the scene so atmospheric desat tracks.
     */
    createMeadowQuadMaterial() {
        const baseColor = this.config.baseColor.clone();
        const midColor = this.config.midColor.clone();
        const tipColor = this.config.tipColor.clone();
        const createDefaultMaterial = () => {
            const mat = new THREE.MeshLambertMaterial({
                color: midColor,
                side: THREE.DoubleSide,
                fog: true,
                flatShading: false,
            });
            // Cycle 35 Phase 9: the onBeforeCompile injection below reads
            // `vUv` for procedural meadow tinting, but Three.js only declares
            // the `vUv` varying when USE_UV is set (normally triggered by
            // attaching a texture map). Without it the program failed to
            // compile with "ERROR: 'vUv' : undeclared identifier" on every
            // far-ring meadow quad. Defining USE_UV here makes Three.js emit
            // the standard `varying vec2 vUv;` plumbing in both shaders.
            mat.defines = { USE_UV: '' };
            mat.onBeforeCompile = (shader) => {
                shader.uniforms.uMeadowBase = { value: baseColor };
                shader.uniforms.uMeadowMid  = { value: midColor };
                shader.uniforms.uMeadowTip  = { value: tipColor };
                // Inject a per-fragment hash mix so neighbour quads don't all
                // read identical. Keyed off mesh-local UV scaled to ~5 cells per
                // 40m chunk so the pattern reads at far-ring scale (50-80m
                // perceived feature size from a 250m-far camera).
                shader.fragmentShader = shader.fragmentShader
                    .replace(
                        '#include <common>',
                        [
                            '#include <common>',
                            'uniform vec3 uMeadowBase;',
                            'uniform vec3 uMeadowMid;',
                            'uniform vec3 uMeadowTip;',
                            'float meadowHash(vec2 v) {',
                            '  return fract(sin(dot(v, vec2(127.1, 311.7))) * 43758.5453);',
                            '}'
                        ].join('\n')
                    )
                    .replace(
                        '#include <map_fragment>',
                        [
                            '#include <map_fragment>',
                            'vec2 muv = vUv * 5.0;',
                            'float n1 = meadowHash(floor(muv));',
                            'float n2 = meadowHash(floor(muv * 2.0));',
                            'float blend = mix(n1, n2, 0.5);',
                            'vec3 meadowCol = mix(mix(uMeadowBase, uMeadowMid, blend), uMeadowTip, smoothstep(0.6, 0.95, blend));',
                            'diffuseColor.rgb = meadowCol;'
                        ].join('\n')
                    );
            };
            return mat;
        };
        const materialResult = createWebGpuGrassMaterial('meadow-quad', 'createMeadowQuadMaterial', {
            createDefaultMaterial,
            search: this.webgpuGrassSearch,
            factories: this.webgpuGrassFactories,
            context: {
                baseColor,
                midColor,
                tipColor,
                uvCellsPerChunk: 5.0,
                noiseHashVector: [127.1, 311.7],
                noiseOctaves: [1, 2],
            },
        });
        this.webgpuMeadowQuadMaterialSummary = materialResult.summary;
        return materialResult.material;
    }

    /**
     * Cycle 64: blade-height multiplier at (x, z) from the scene's tallZones.
     * Returns 1 when no zone is declared or the point is outside every zone.
     * @param {number} x
     * @param {number} z
     * @returns {number}
     */
    _tallHeightMul(x, z) {
        if (!this._tallZones) return 1;
        for (const zone of this._tallZones) {
            if (x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) {
                return zone.heightMul ?? 1;
            }
        }
        return 1;
    }

    /**
     * Check if position is in an exclusion zone
     */
    isExcluded(x, z) {
        // Cycle 8: cull grass past the island boundary so clumps don't
        // extend out over the falloff/water annulus. Default `worldSize`
        // (420 desktop) and `densityRange` (0.6) lets grass scatter to
        // ~250m, which on RH (180+40=220m island) leaves ~30m of clumps
        // sitting on the bilinear-smoothed falloff above the rendered
        // shoreline. Visible as "floating grass" in third-person at the
        // shore. We use a tight inner buffer (3m) so the very edge of
        // the island still has grass.
        if (this.boundary && this.boundary.kind === 'island') {
            const cx = this.boundary.center?.x ?? 0;
            const cz = this.boundary.center?.z ?? 0;
            const dx = x - cx;
            const dz = z - cz;
            const r = this.boundary.radius + this.boundary.falloff - 3;
            if (dx * dx + dz * dz > r * r) return true;
        }

        // Cycle 20 Phase 2 v3 (2026-05-04): shoreline-Y clip. The radius +
        // falloff cull still lets grass spawn in the outer falloff annulus
        // where terrain Y has dropped below water level — visible on RH as
        // grass clumps sitting "on the water" past the visible shoreline.
        // Sample the displaced terrain mesh Y here and exclude positions
        // submerged or within a small water-line margin. Auto-adapts to any
        // future scene's island shape regardless of falloff curve.
        if (this.heightfield) {
            const baseY = this.heightfield.meshSampleY(x, z);
            if (Number.isFinite(baseY) && baseY < SHORELINE_Y_MIN) return true;
        }

        // Check dynamic exclusion zones (farmhouse, pasture, etc.)
        // No more hardcoded zones - all exclusions are added via addExclusionZone()
        //
        // Cycle 114 Phase 1: this stays the HARD test and delegates to the signed
        // distance below, so the shoreline cull above and every other caller keep
        // their exact behaviour (a point is excluded iff it is inside a zone,
        // edges inclusive, which is what the box SDF's `<= 0` means). Only the
        // scatter path consumes the soft band.
        for (const zone of this.exclusionZones) {
            if (this._exclusionZoneDistance(zone, x, z) <= 0) return true;
        }

        return false;
    }

    /**
     * Cycle 114 Phase 1: signed distance in metres from (x, z) to an exclusion
     * zone's edge. Negative inside, zero on the edge, positive outside.
     *
     * Rotated zones run the same inverse rotation the hard test always used
     * (lines below mirror the pre-Cycle-114 `type: 'rotated'` branch), so the
     * falloff band follows the rotated edge rather than an axis-aligned bounding
     * box. Both shapes then share one rounded-rectangle SDF.
     *
     * @param {object} zone
     * @param {number} x
     * @param {number} z
     * @returns {number} metres, negative inside
     */
    _exclusionZoneDistance(zone, x, z) {
        // Cycle 121: the body moved to js/world/groundShading.js#wornZoneDistance
        // so the terrain shaders measure the ground with the same ruler. Kept as
        // a method because the two scatter mirrors and several tests call it
        // through the prototype.
        return wornZoneDistance(zone, x, z);
    }

    /**
     * Cycle 114 Phase 1: probability that a clump scattered at (x, z) survives
     * the exclusion zones. 0 inside a zone, 1 once past the falloff band, and
     * monotonically increasing in between (smoothstep on the signed distance).
     *
     * Overlapping zones compose by MINIMUM, not by product: two zones whose
     * bands overlap should thin the ground the way the nearer one does, and a
     * product would drive the overlap to near-zero and reintroduce the bald
     * patch the falloff exists to remove.
     *
     * The scatter is the right place for this (Cycle 114 open question Q1): the
     * decision is static per instance, and the scatter loop already oversamples
     * and rejects, so this drops into an existing reject with no per-fragment
     * cost and no shader change on either path.
     *
     * @param {number} x
     * @param {number} z
     * @returns {number} 0..1
     */
    exclusionKeepProbability(x, z) {
        // Cycle 121: one minus the shared worn-ground coverage, which is the same
        // arithmetic Cycle 114 wrote here (a MINIMUM over per-zone smoothsteps is
        // one minus a MAXIMUM over their complements) expressed against the
        // function the terrain shaders read. That identity is what makes the
        // grass thin over exactly the band the ground darkens under, and
        // tests/worn-ground.spec.js pins it rather than trusting this comment.
        return 1 - wornZoneCoverage01(x, z, this.exclusionZones);
    }

    /**
     * Cycle 115 Phase 4: roll a clump at (x, z) against EVERY reason the ground
     * is worn - the exclusion zones' falloff bands (Cycle 114) and the approach
     * to the pen gate - and return the keep value it survived with, or 0 if it
     * did not. Survivors always score strictly above 0, so `> 0` is the whole
     * test: `isExcluded` has already rejected every candidate inside a zone,
     * which is the only case that scores 0, and the approach floors at
     * GROUND_APPROACH.grassKeepMin.
     *
     * This is the single entry point both scatter mirrors call, and that is the
     * point of it. `createChunk` and `_gatherChunkClumps` must consume the
     * identical random stream in the identical order or the consolidated WebGPU
     * field diverges from the per-chunk WebGL one. One function, called from one
     * place in each, is the cheapest way to keep that true.
     *
     * The two tests draw their randomness from deliberately different places:
     *
     * - The exclusion band keeps Cycle 114's draw off `this.random()`, at
     *   exactly the point in the stream it has always been drawn. Untouched.
     * - The approach uses a HASH OF THE POSITION instead. One scatter stream
     *   runs the whole field, so a per-candidate draw here would shift every
     *   clump scattered after the first candidate that so much as grazed the
     *   band. It is also the better decision on its own merits: a position hash
     *   thins the same spot the same way regardless of what order the scatter
     *   reached it in.
     *
     * That does NOT make the scatter downstream of the approach identical, and
     * nothing short of restructuring both loops would. The candidate loop breaks
     * early once it has `clumpCount` survivors, so rejecting more candidates
     * makes it run further and draw more x/z pairs; measured on a 40m x 20m
     * chunk straddling Home Field's gate, 300 clumps become 245, of which 238
     * are positions the un-approached scatter also produced and 7 are new. The
     * knock-on is inherent to Cycle 114's design, not to this phase, but a
     * golden re-baseline should expect grass movement past the gate as well as
     * on it.
     *
     * The surviving keep composes by MINIMUM, for the reason Cycle 114 gives
     * for overlapping zones: a product would drive the overlap of the pen's
     * band and the approach to near-zero and reintroduce the bald patch the
     * falloff exists to remove.
     *
     * @param {number} x
     * @param {number} z
     * @returns {number} 0 if rejected, else the 0..1 keep it survived with
     */
    _rollGroundKeep(x, z) {
        const exclusionKeep = this.exclusionKeepProbability(x, z);
        if (exclusionKeep < 1 && this.random() > exclusionKeep) return 0;
        if (!this.gateApproach) return exclusionKeep;
        const approachKeep = groundApproachGrassKeep(x, z, this.gateApproach);
        if (approachKeep < 1 && groundPositionHash01(x, z) > approachKeep) return 0;
        return approachKeep < exclusionKeep ? approachKeep : exclusionKeep;
    }

    /**
     * Cycle 114 Phase 1: blade-height multiplier for a clump that survived the
     * thinning above. Full height where nothing wears the ground,
     * EXCLUSION_EDGE_HEIGHT_MIN where it is fully worn (a zone edge, or the
     * centre of the gate approach).
     *
     * Density alone thins to a speckle, which reads as instances gone missing;
     * tapering height with it reads as grass worn down by traffic. That is as
     * true of the approach as it is of the pen edge, which is why the approach
     * feeds the same channel rather than inventing a second one.
     *
     * @param {number} [keep] the clump's keep probability
     * @returns {number}
     */
    _exclusionHeightMul(keep) {
        if (!(keep >= 0) || keep >= 1) return 1;
        return EXCLUSION_EDGE_HEIGHT_MIN + (1 - EXCLUSION_EDGE_HEIGHT_MIN) * keep;
    }

    /**
     * Adopt the scene's resolved worn-ground zones (Cycle 121).
     *
     * THE list, not a copy of it: `js/TerrainBuilder.js` resolves it once from
     * scene data and hands the same array to the terrain material's uniforms and
     * to this. Two systems used to describe this ground and neither knew about
     * the other, which is why the grass thinned over a rect the terrain never
     * shaded. Must land before `init()`, which is when the scatter runs.
     *
     * @param {Array<object> | null | undefined} zones
     */
    setWornZones(zones) {
        this.exclusionZones = Array.isArray(zones) ? zones : [];
    }

    /**
     * Add an exclusion zone (axis-aligned rectangle).
     *
     * `wear` defaults to the pen intensity rather than to zero: a zone added
     * here thins grass, and ground that thins without darkening is the defect
     * Cycle 121 removed. A caller that wants grass gone without touching the
     * ground has to say so.
     */
    addExclusionZone(minX, maxX, minZ, maxZ, wear = GROUND_WEAR.kindWear.pen) {
        this.exclusionZones.push({ minX, maxX, minZ, maxZ, type: 'rect', wear });
    }

    /**
     * Add a rotated rectangular exclusion zone
     * @param {number} centerX - Center X of the rectangle
     * @param {number} centerZ - Center Z of the rectangle
     * @param {number} width - Width of the rectangle (before rotation)
     * @param {number} depth - Depth of the rectangle (before rotation)
     * @param {number} angle - Rotation angle in radians
     * @param {number} [wear] - Peak terrain wear, 0..1. See addExclusionZone.
     */
    addRotatedExclusionZone(centerX, centerZ, width, depth, angle, wear = GROUND_WEAR.kindWear.pen) {
        this.exclusionZones.push({
            type: 'rotated',
            centerX,
            centerZ,
            width,
            depth,
            angle,
            // Pre-calculate cos and sin for efficiency
            cosAngle: Math.cos(-angle),
            sinAngle: Math.sin(-angle),
            wear
        });
    }

    /**
     * Update interactor positions (player, sheep, dogs)
     * Each entity should have: { position: {x, y, z}, type: 'player'|'dog'|'sheep' }
     */
    updateInteractors(entities) {
        // Skip if initialization failed
        if (!this.initializationSucceeded) {
            return;
        }

        this.interactorCount = 0;

        for (let i = 0; i < Math.min(entities.length, this.config.maxInteractors); i++) {
            const entity = entities[i];
            if (entity && entity.position) {
                const idx = this.interactorCount * 3;
                this.interactorPositions[idx] = entity.position.x || 0;
                this.interactorPositions[idx + 1] = entity.position.y || 0;
                this.interactorPositions[idx + 2] = entity.position.z || 0;

                // Entity type: 0 = player/dog (oriented elongated body),
                // 1 = sheep (oriented but more rounded).
                this.interactorData[this.interactorCount] = entity.type === 'sheep' ? 1.0 : 0.0;

                // Per-entity facing direction (unit vec2 in XZ). Used by the
                // shader to orient the body-shaped trample zone. Falls back
                // to (0, 1) (+Z forward) so a missing facing reads as "north"
                // rather than zero-length (which would NaN the math).
                // Cycle 114: shared with TerrainBuilder#_syncGroundContact via
                // groundShading.js. These rules used to live only here, and the
                // terrain's copy handled one of the three shapes, so the dog's
                // contact never rotated. One resolver, no drift.
                const entityFacing = resolveEntityFacing(entity);
                const fx = entityFacing.x, fz = entityFacing.z;
                const fIdx = this.interactorCount * 2;
                this.interactorFacings[fIdx] = fx;
                this.interactorFacings[fIdx + 1] = fz;

                this.interactorCount++;
            }
        }

        this.updateGroundContactMesh();

        // Update uniforms
        if (this.webgpuGrassBladeMaterialControls?.updateInteractors) {
            this.webgpuGrassBladeMaterialControls.updateInteractors({
                positions: this.interactorPositions,
                data: this.interactorData,
                facings: this.interactorFacings,
                count: this.interactorCount,
                material: this.grassMaterial,
            });
            this._streamedBladeControls?.updateInteractors?.({
                positions: this.interactorPositions,
                data: this.interactorData,
                facings: this.interactorFacings,
                count: this.interactorCount,
                material: this._streamedMaterial,
            });
        } else if (this.grassMaterial?.uniforms) {
            this.grassMaterial.uniforms.interactorPositions.value = this.interactorPositions;
            this.grassMaterial.uniforms.interactorData.value = this.interactorData;
            this.grassMaterial.uniforms.interactorFacings.value = this.interactorFacings;
            this.grassMaterial.uniforms.interactorCount.value = this.interactorCount;
        }
    }

    updateGroundContactMesh() {
        const mesh = this.groundContactMesh;
        const contact = this.grassProfile?.groundContact;
        if (!mesh || !contact?.enabled) return;
        if (!this._groundContactEnabled || this.interactorCount <= 0) {
            mesh.count = 0;
            mesh.visible = false;
            return;
        }

        const count = Math.min(this.interactorCount, mesh.instanceMatrix.count);
        for (let i = 0; i < count; i++) {
            const p = i * 3;
            const f = i * 2;
            const x = this.interactorPositions[p];
            const z = this.interactorPositions[p + 2];
            const y = (this.heightfield ? this.heightfield.meshSampleY(x, z) : this.interactorPositions[p + 1]) + contact.yOffset;
            const isSheep = this.interactorData[i] === 1;
            const scale = isSheep ? contact.sheepScale : contact.dogScale;
            const yaw = Math.atan2(this.interactorFacings[f], this.interactorFacings[f + 1]);

            this._groundContactPosition.set(x, y, z);
            this._groundContactQuaternion.setFromAxisAngle(this._groundContactUp, yaw);
            this._groundContactScale.set(scale.x, 1, scale.z);
            this._groundContactMatrix.compose(
                this._groundContactPosition,
                this._groundContactQuaternion,
                this._groundContactScale
            );
            mesh.setMatrixAt(i, this._groundContactMatrix);
        }
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.visible = true;
    }

    setGroundContactEnabled(enabled = true) {
        this._groundContactEnabled = enabled !== false;
        this.updateGroundContactMesh();
        return !!this.groundContactMesh && this._groundContactEnabled;
    }

    getInteractorSample(limit = 8) {
        const count = Math.max(0, Math.min(this.interactorCount, limit, this.config.maxInteractors));
        const sample = [];
        for (let i = 0; i < count; i++) {
            const p = i * 3;
            const f = i * 2;
            sample.push({
                type: this.interactorData[i] === 1 ? 'sheep' : 'dog',
                position: {
                    x: +this.interactorPositions[p].toFixed(3),
                    y: +this.interactorPositions[p + 1].toFixed(3),
                    z: +this.interactorPositions[p + 2].toFixed(3),
                },
                facing: {
                    x: +this.interactorFacings[f].toFixed(3),
                    z: +this.interactorFacings[f + 1].toFixed(3),
                },
            });
        }
        return sample;
    }

    /**
     * Update grass system each frame
     */
    update(deltaTime, camera, playerPosition) {
        // Skip if initialization failed (iOS Safari shader issues, etc.)
        if (!this.initializationSucceeded) {
            return;
        }

        // Frozen during golden capture so wind phase + autoLod density are
        // deterministic; advances normally in production.
        if (!this._visualGoldenFreezeTime) {
            this.time += deltaTime;
        }

        // Cycle 22 Phase D: tick rolling frame-time avg + adjust _autoLodFactor.
        // 60-sample ring (~1s at 60fps); we only act once we have at least 30
        // samples to avoid the warm-up burst dragging us down on first paint.
        // Step size 0.05/sec, framed in deltaTime so it's smooth on slow clocks
        // and snappy when frames stretch. Result: at sustained 18ms+ avg the
        // factor decays to 0.5 over ~10 seconds; recovery to 1.0 takes the
        // same. No clamps added to grass logic — Hard Stop #8 stays clean.
        const dtMs = deltaTime * 1000;
        if (dtMs > 0 && dtMs < 200) {
            this._frameTimes[this._frameTimeIdx] = dtMs;
            this._frameTimeIdx = (this._frameTimeIdx + 1) % this._frameTimes.length;
            if (this._frameTimeCount < this._frameTimes.length) this._frameTimeCount++;
        }
        if (this._frameTimeCount >= 30 && this.time > this._autoLodWarmupS) {
            let sum = 0;
            for (let i = 0; i < this._frameTimeCount; i++) sum += this._frameTimes[i];
            const avg = sum / this._frameTimeCount;
            this.stats.avgFrameMs = avg;
            const step = Math.min(deltaTime, 0.1) * 0.5; // up to 0.05/frame at 60fps
            if (avg > this._autoLodHi) {
                this._autoLodFactor = Math.max(this._autoLodFloor, this._autoLodFactor - step);
            } else if (avg < this._autoLodLo) {
                this._autoLodFactor = Math.min(1.0, this._autoLodFactor + step);
            }
            this.stats.autoLodFactor = this._autoLodFactor;
        }

        // Update time uniform
        if (this.webgpuGrassBladeMaterialControls?.update) {
            this.webgpuGrassBladeMaterialControls.update({
                time: this.time,
                deltaTime,
                camera,
                sceneFog: this.scene?.fog ?? null,
                material: this.grassMaterial,
            });
            this._streamedBladeControls?.update?.({
                time: this.time,
                deltaTime,
                camera,
                sceneFog: this.scene?.fog ?? null,
                material: this._streamedMaterial,
            });
        } else if (this.grassMaterial?.uniforms) {
            this.grassMaterial.uniforms.time.value = this.time;

            // Update camera position for fog/lighting calculations
            if (camera) {
                this.grassMaterial.uniforms.uCameraPos.value.copy(camera.position);
            }

            // Sync fog to scene.fog so distant grass fades to the same horizon
            // color the Atmosphere driver writes per frame (FogExp2 currently;
            // legacy linear THREE.Fog handled via density approximation).
            const sceneFog = this.scene && this.scene.fog;
            if (sceneFog) {
                this.grassMaterial.uniforms.fogColor.value.copy(sceneFog.color);
                if (sceneFog.isFogExp2) {
                    this.grassMaterial.uniforms.fogDensity.value = sceneFog.density;
                } else if (sceneFog.isFog) {
                    this.grassMaterial.uniforms.fogDensity.value = 1.732 / Math.max(1, sceneFog.far);
                }
            }
        }

        // Update frustum culling and LOD. Cycle 81: when the field is one compute-
        // culled InstancedMesh, a GPU compute pass does per-instance frustum culling
        // (driven from TerrainBuilder.update, which holds the renderer), so the
        // per-chunk CPU frustum/LOD walkers are bypassed.
        if (this._computeCullController) {
            // GPU-driven; nothing to do here.
        } else if (camera) {
            this.updateFrustumCulling(camera);

            // Decimation LOD measures distance from the camera (per spec).
            // Fall back to playerPosition only if camera is missing.
            const lodAnchor = camera?.position ?? playerPosition;
            if (lodAnchor) {
                this.updateLOD(lodAnchor);
            }
        }
    }

    /**
     * Update frustum culling for chunks
     */
    updateFrustumCulling(camera) {
        this.frustumMatrix.multiplyMatrices(
            camera.projectionMatrix,
            camera.matrixWorldInverse
        );
        this.frustum.setFromProjectionMatrix(this.frustumMatrix);

        this.stats.visibleClumps = 0;
        this.stats.chunksVisible = 0;

        const boundingSphere = this._cullSphere;

        for (const chunk of this.chunks.values()) {
            boundingSphere.center.copy(chunk.center);
            boundingSphere.radius = chunk.radius;

            const isVisible = this.frustum.intersectsSphere(boundingSphere);

            if (isVisible !== chunk.visible) {
                chunk.visible = isVisible;
                chunk.mesh.visible = isVisible;
            }

            if (isVisible) {
                this.stats.chunksVisible++;
                // Cycle 23 Phase D2: meadow-quad meshes don't have a `.count`
                // (they're Mesh, not InstancedMesh). Their visible-clump
                // contribution is conceptually 0 — they're at LOD4.
                this.stats.visibleClumps += chunk.mesh.count ?? 0;
            }
        }
    }

    /**
     * Update LOD based on chunk-to-camera distance.
     * Levels: 0 = full instances, 1 = 50%, 2 = 25%.
     */
    updateLOD(anchorPosition) {
        const { lodDecimateMid, lodDecimateFar, lodHysteresis } = this.config;
        const halfBand = lodHysteresis * 0.5;

        for (const chunk of this.chunks.values()) {
            if (!chunk.visible) continue;
            // Cycle 23 Phase D2: meadow-quad chunks are LOD4 — fixed, don't
            // step. Skip the LOD walker for them.
            if (chunk.isMeadowQuad) continue;

            const dx = chunk.center.x - anchorPosition.x;
            const dz = chunk.center.z - anchorPosition.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            // Asymmetric thresholds per current level give hysteresis: must
            // cross threshold + halfBand to step out, threshold - halfBand to step in.
            const current = chunk.lodLevel;
            let targetLOD = current;
            if (current === 0) {
                if (dist > lodDecimateMid + halfBand) targetLOD = 1;
            } else if (current === 1) {
                if (dist < lodDecimateMid - halfBand) targetLOD = 0;
                else if (dist > lodDecimateFar + halfBand) targetLOD = 2;
            } else {
                if (dist < lodDecimateFar - halfBand) targetLOD = 1;
            }

            if (targetLOD !== current) {
                chunk.lodLevel = targetLOD;
                this.applyLOD(chunk, targetLOD);
            }
        }
    }

    /**
     * Apply LOD to a chunk by scaling InstancedMesh.count.
     * createChunk samples positions in random order, so a contiguous prefix
     * is already a uniform spatial sample — no geometry rebuild needed.
     */
    applyLOD(chunk, lodLevel) {
        const fraction = (lodLevel === 0 ? 1.0 : lodLevel === 1 ? 0.5 : 0.25) * this.qualityDensityScale;
        chunk.mesh.count = Math.max(1, Math.round(chunk.fullCount * fraction));
    }

    applyQualityState(state = {}) {
        const distanceScale = Number.isFinite(state.grassDistanceScale)
            ? THREE.MathUtils.clamp(state.grassDistanceScale, 0.35, 1.25)
            : 1;
        this.qualityDistanceScale = distanceScale;
        this.qualityDensityScale = distanceScale;
        this.config.lodDecimateMid = this._qualityBase.lodDecimateMid * distanceScale;
        this.config.lodDecimateFar = this._qualityBase.lodDecimateFar * distanceScale;
        this.config.grassFadeEnd = Math.max(
            this.config.grassFadeStart + 20,
            this._qualityBase.grassFadeEnd * distanceScale
        );
        for (const [, chunk] of this.chunks) {
            if (!chunk.isMeadowQuad) this.applyLOD(chunk, chunk.lodLevel ?? 0);
        }
    }

    /**
     * Get performance stats
     */
    getStats() {
        return {
            ...this.stats,
            totalChunks: this.chunks.size,
            effectiveBlades: this.stats.visibleClumps * this.config.bladesPerClump,
            grassProfile: this.grassProfileSummary,
            groundContact: this.groundContactMesh
                ? {
                    enabled: this._groundContactEnabled,
                    drawCalls: 1,
                    instances: this.groundContactMesh.count,
                    trianglesPerInstance: geometryTriangleCount(this.groundContactMesh.geometry),
                }
                : null,
        };
    }

    /**
     * Estimate the total triangle count for the whole grass system
     * (every chunk, every clump, every blade - not just currently visible).
     * Each blade is double-sided (4 triangles) in the current quad geometry.
     * Returns 0 if the clump geometry hasn't been created yet.
     * @returns {number}
     */
    getTotalTriangleEstimate() {
        const trisPerClump = geometryTriangleCount(this.clumpGeometry);
        return Math.round(trisPerClump * this.stats.totalClumps);
    }

    getVisibleTriangleEstimate() {
        const trisPerClump = geometryTriangleCount(this.clumpGeometry);
        return Math.round(trisPerClump * (this.stats.visibleClumps ?? this.stats.totalClumps ?? 0));
    }

    /**
     * Set wind parameters
     */
    setWind(strength, direction) {
        if (this.webgpuGrassBladeMaterialControls?.setWind) {
            this.webgpuGrassBladeMaterialControls.setWind({ strength, direction, material: this.grassMaterial });
            this._streamedBladeControls?.setWind?.({ strength, direction, material: this._streamedMaterial });
        } else if (this.grassMaterial?.uniforms) {
            this.grassMaterial.uniforms.windStrength.value = strength;
            if (direction) {
                this.grassMaterial.uniforms.windDirection.value.set(direction.x, direction.y);
            }
        }
    }

    /**
     * Hand the world-space sun direction to the grass material every frame.
     * Drives the Cycle 14 Phase 2 fake-SSS back-light: blades the camera
     * looks toward the sun through gain a tipColor halo, which sells "thin
     * organic foliage" at sunrise/sunset.
     * @param {THREE.Vector3} sunDir Unit vector pointing at the sun
     */
    setSunDirection(sunDir) {
        if (!sunDir || !this.grassMaterial) return;
        if (this.webgpuGrassBladeMaterialControls?.setSunDirection) {
            this.webgpuGrassBladeMaterialControls.setSunDirection({ sunDir, material: this.grassMaterial });
            this._streamedBladeControls?.setSunDirection?.({ sunDir, material: this._streamedMaterial });
            return;
        }
        if (this.grassMaterial.uniforms?.uSunDirection) {
            this.grassMaterial.uniforms.uSunDirection.value.copy(sunDir);
        }
    }

    setInteractionShadowStrength(strength) {
        if (this.webgpuGrassBladeMaterialControls?.setInteractionShadowStrength) {
            this.webgpuGrassBladeMaterialControls.setInteractionShadowStrength({
                strength,
                material: this.grassMaterial,
            });
            this._streamedBladeControls?.setInteractionShadowStrength?.({
                strength,
                material: this._streamedMaterial,
            });
            return true;
        }
        return false;
    }

    /**
     * Cleanup
     */
    dispose() {
        for (const [, chunk] of this.chunks) {
            this.scene.remove(chunk.mesh);
            // Cycle 51: meadow-quad chunks now own a per-chunk displaced
            // geometry (each conforms to the terrain), so dispose them
            // per-chunk like any clump chunk that owns its geometry. The
            // shared material is still disposed standalone below.
            if (chunk.mesh.geometry && (chunk.isMeadowQuad || chunk.ownsGeometry === true)) {
                chunk.mesh.geometry.dispose();
            }
            // [P3-LISTENER-AUDIT] InstancedMesh chunks hold a per-chunk
            // instanceMatrix GPU buffer that geometry/material disposal does
            // not free; InstancedMesh.dispose() releases it. Optional call:
            // meadow-quad chunks are plain Meshes with no dispose().
            chunk.mesh.dispose?.();
        }

        this.chunks.clear();

        // Cycle 81: the consolidated compute-cull mesh isn't tracked in `this.chunks`;
        // remove + dispose it explicitly. The controller owns its cloned geometry; the
        // shared grass material is disposed just below.
        if (this._computeCullController) {
            try { this.scene.remove(this._computeCullController.mesh); } catch { /* ignore */ }
            try { this._computeCullController.dispose(); } catch { /* ignore */ }
            this._computeCullController = null;
        }

        // Cycle 87 Phase 3: streamed controller owns its cloned geometry and
        // its own material instance (the primary material is disposed below).
        if (this._streamedCullController) {
            try { this.scene.remove(this._streamedCullController.mesh); } catch { /* ignore */ }
            try { this._streamedCullController.dispose(); } catch { /* ignore */ }
            this._streamedCullController = null;
        }
        if (this._streamedMaterial) {
            try { this._streamedBladeControls?.dispose?.(); } catch { /* ignore */ }
            try { this._streamedMaterial.dispose(); } catch { /* ignore */ }
            this._streamedMaterial = null;
            this._streamedBladeControls = null;
        }

        if (this.grassMaterial) {
            this.webgpuGrassBladeMaterialControls?.dispose?.();
            this.grassMaterial.dispose();
        }

        if (this.noiseTexture) {
            this.noiseTexture.dispose();
        }

        if (this.clumpGeometry) {
            this.clumpGeometry.dispose();
        }

        if (this._meadowQuadMaterial) {
            this._meadowQuadMaterial.dispose();
            this._meadowQuadMaterial = null;
        }

        if (this.groundContactMesh) {
            try { this.scene.remove(this.groundContactMesh); } catch { /* ignore */ }
            try { this.groundContactMesh.geometry?.dispose?.(); } catch { /* ignore */ }
            try { this.groundContactMesh.dispose?.(); } catch { /* ignore */ }
            this.groundContactMesh = null;
        }

        if (this._groundContactMaterial) {
            this._groundContactMaterial.dispose();
            this._groundContactMaterial = null;
        }

        if (this._groundContactTexture) {
            this._groundContactTexture.dispose();
            this._groundContactTexture = null;
        }
    }
}
