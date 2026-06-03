import * as THREE from 'three';
import { loadShaderWithReplacements } from './shaders/ShaderLoader.js';
import { geometryTriangleCount } from './utils/TriangleCount.js';
import { TIER_PRESETS } from './HardwareTier.js';
import { createKonveyorGrassMaterial } from './world/konveyorGrassMaterialAdapter.js';
import { mulberry32 } from '../shared/Random.js';

// Shader cache for sync access after async load
let grassDesktopVertexShader = null;
let grassMobileVertexShader = null;
let grassFragmentShader = null;
let grassShadersLoaded = false;

// Cycle 20 Phase 2 v3 (2026-05-04): minimum displaced-terrain Y under which
// grass is excluded — keeps clumps off the water-merging strip past the
// visible shoreline. 0.5m gives ~one-blade-base of clearance above the water
// plane (Y=0). Tuned with RH's heightfield falloff curve in mind: terrain
// drops past Y=0.5 near the outer half of the falloff annulus where the
// shore visually meets the water.
const SHORELINE_Y_MIN = 0.5;

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

/**
 * Preload grass shaders - call this early in app initialization
 * @param {Object} config - Grass config with placeholder values
 */
export async function preloadGrassShaders(config = {}) {
    if (grassShadersLoaded) return;

    const replacements = {
        MAX_INTERACTORS: config.maxInteractors || 50,
        INTERACTION_RADIUS: (config.interactionRadius || 3.5).toFixed(1),
        SHEEP_INTERACTION_RADIUS: (config.sheepInteractionRadius || 1.5).toFixed(1),
        INTERACTION_STRENGTH: (config.interactionStrength || 0.8).toFixed(1),
        SHEEP_INTERACTION_STRENGTH: (config.sheepInteractionStrength || 0.3).toFixed(1)
    };

    try {
        [grassDesktopVertexShader, grassMobileVertexShader, grassFragmentShader] = await Promise.all([
            loadShaderWithReplacements('./js/shaders/grass/desktop-vertex.glsl', replacements),
            loadShaderWithReplacements('./js/shaders/grass/mobile-vertex.glsl', replacements),
            loadShaderWithReplacements('./js/shaders/grass/fragment.glsl', replacements)
        ]);
        grassShadersLoaded = true;
        console.log('[SHADER] Grass shaders loaded');
    } catch (error) {
        console.warn('[SHADER] Failed to load grass shaders, using inline fallback:', error);
    }
}

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
     * @param {{ tier?: 'low'|'med'|'high', search?: string, konveyorGrassFactories?: Object }} [opts] Cycle 23 Phase D1 — hardware tier overrides isMobile-binary defaults.
     */
    constructor(scene, isMobile = false, sceneGrass = null, heightfield = null, boundary = null, opts = {}) {
        this.scene = scene;
        this.isMobile = isMobile;
        this.sceneGrass = sceneGrass;
        this.heightfield = heightfield;
        this.boundary = boundary || null;
        this.konveyorGrassSearch = opts.search;
        this.konveyorGrassFactories = opts.konveyorGrassFactories;
        this.konveyorMeadowQuadMaterialSummary = null;
        this.konveyorGrassBladeMaterialSummary = null;
        this.konveyorGrassBladeMaterialControls = null;
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

            // Interaction - subtle natural push effect
            interactionRadius: 2.2,
            interactionStrength: 0.6,
            sheepInteractionRadius: 2.5,
            sheepInteractionStrength: 0.4,
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

        // Runtime state
        this.chunks = new Map();
        this.noiseTexture = null;
        this.grassMaterial = null;
        this.time = 0;
        this.interactorPositions = new Float32Array(this.config.maxInteractors * 3);
        this.interactorData = new Float32Array(this.config.maxInteractors); // 0=player/dog, 1=sheep
        // Per-entity facing direction (unit vec2 in XZ). Used by the shader
        // to push grass along an oriented body footprint instead of a
        // world-axis-locked ellipse — so the dog's wake follows where the
        // dog is heading.
        this.interactorFacings = new Float32Array(this.config.maxInteractors * 2);
        this.interactorCount = 0;
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

            // Generate chunks
            console.log('[GRASS] Generating chunks...');
            this.generateChunks();

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

    /**
     * Create grass clump geometry (multiple blades baked together)
     * Simple triangle blades for reliable rendering
     */
    createClumpGeometry() {
        const { bladeWidth, bladeHeight, bladesPerClump } = this.config;

        // Each blade is a simple quad (4 vertices, 2 triangles) - more reliable
        const verticesPerBlade = 4;
        const trianglesPerBlade = 2;

        const totalVertices = bladesPerClump * verticesPerBlade;
        const totalIndices = bladesPerClump * trianglesPerBlade * 3 * 2; // *2 for double-sided

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
    createGrassMaterial() {
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
        const materialResult = createKonveyorGrassMaterial('grass-blade', 'createGrassBladeMaterial', {
            createDefaultMaterial,
            search: this.konveyorGrassSearch,
            factories: this.konveyorGrassFactories,
            context: {
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
            },
        });
        const material = materialResult.material;
        material.userData = material.userData ?? {};
        material.userData.konveyorGrassBladeMaterialControls =
            materialResult.controls ?? material.userData.konveyorGrassBladeMaterialControls ?? null;
        material.userData.konveyorGrassBladeMaterialSummary = materialResult.summary;
        this.konveyorGrassBladeMaterialSummary = materialResult.summary;
        this.konveyorGrassBladeMaterialControls = material.userData.konveyorGrassBladeMaterialControls;
        return material;
    }

    /**
     * Desktop vertex shader with full wind and interaction
     */
    getDesktopVertexShader() {
        return `
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
                vHueOffset = (hash11(float(gl_InstanceID) + 0.137) - 0.5) * 0.04;

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
                    return;
                }

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
                    float halfLen = entityType < 0.5 ? 1.6 : 0.6; // along forward
                    float halfWid = entityType < 0.5 ? 0.6 : 0.5; // along right
                    float falloff = entityType < 0.5 ? 1.4 : 0.9; // outside-body push radius

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
                        float t = clamp(sdf / falloff, 0.0, 1.0);
                        float pushStrength = (1.0 - t * t * (3.0 - 2.0 * t)) * strength;
                        vec2 pushDir = length(fromEntity) > 0.001
                            ? normalize(fromEntity)
                            : right;
                        totalPush.xz += pushDir * pushStrength * windPower;
                        totalPush.y -= pushStrength * 0.1 * windPower;
                    }
                }

                // Apply displacements
                worldPos4.x += windDisp.x + totalPush.x;
                worldPos4.z += windDisp.y + totalPush.z;
                worldPos4.y += totalPush.y;

                // Color variation based on world position
                vColorVariation = sin(vWorldPos.x * 0.2) * cos(vWorldPos.z * 0.15) * 0.5 + 0.5;

                // Subtle shadow from interaction
                vShadow = 1.0 - clamp(length(totalPush) * 0.15, 0.0, 0.2);

                gl_Position = projectionMatrix * viewMatrix * worldPos4;
            }
        `;
    }

    /**
     * Mobile vertex shader - simplified, no wind animation
     */
    getMobileVertexShader() {
        return `
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
                vHueOffset = (hash11(float(gl_InstanceID) + 0.137) - 0.5) * 0.04;

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
                    return;
                }

                vec3 pos = position;
                vec4 worldPos4 = modelMatrix * instanceMatrix * vec4(pos, 1.0);
                vWorldPos = worldPos4.xyz;

                float windPower = vHeight * vHeight;

                // Player interaction on mobile — grass bends AWAY from the
                // dog's oriented body footprint (same SDF as desktop, just
                // applied to the first interactor only — mobile keeps a
                // single push to fit the iOS Safari uniform limit).
                vec3 totalPush = vec3(0.0);
                if (interactorCount > 0) {
                    vec3 entityPos = interactorPositions[0];
                    vec2 facing = interactorFacings[0];
                    if (length(facing) < 0.01) facing = vec2(0.0, 1.0);
                    vec2 fwd = normalize(facing);
                    vec2 right = vec2(fwd.y, -fwd.x);
                    vec2 fromEntity = vWorldPos.xz - entityPos.xz;
                    vec2 local = vec2(dot(fromEntity, right), dot(fromEntity, fwd));
                    float halfLen = 1.6;
                    float halfWid = 0.6;
                    float falloff = 1.4;
                    vec2 q = abs(local) - vec2(halfWid, halfLen);
                    float sdf = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
                    if (sdf < falloff) {
                        float t = clamp(sdf / falloff, 0.0, 1.0);
                        float pushStrength = (1.0 - t * t * (3.0 - 2.0 * t)) * interactionStrength;
                        vec2 pushDir = length(fromEntity) > 0.001
                            ? normalize(fromEntity)
                            : right;
                        totalPush.xz += pushDir * pushStrength * windPower;
                        totalPush.y -= pushStrength * 0.15 * windPower;
                    }
                }

                worldPos4.x += totalPush.x;
                worldPos4.z += totalPush.z;
                worldPos4.y += totalPush.y;

                vColorVariation = sin(vWorldPos.x * 0.2) * cos(vWorldPos.z * 0.15) * 0.5 + 0.5;
                vShadow = 1.0 - clamp(length(totalPush) * 0.1, 0.0, 0.15);

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

        for (let cx = 0; cx < chunksPerSide; cx++) {
            for (let cz = 0; cz < chunksPerSide; cz++) {
                const chunkMinX = -halfWorld + cx * chunkSize;
                const chunkMinZ = -halfWorld + cz * chunkSize;
                const chunkMaxX = chunkMinX + chunkSize;
                const chunkMaxZ = chunkMinZ + chunkSize;
                const chunkCenterX = (chunkMinX + chunkMaxX) / 2;
                const chunkCenterZ = (chunkMinZ + chunkMaxZ) / 2;

                // Skip chunks that are too far from center (create circular field)
                const distFromCenter = Math.sqrt(chunkCenterX * chunkCenterX + chunkCenterZ * chunkCenterZ);
                if (distFromCenter > cullDistance) continue;

                // Cycle 23 Phase D2: far-ring meadow-quad path. Chunks within
                // [MEADOW_QUAD_RADIUS_M, cullDistance] become single textured
                // planes; near chunks keep clump instancing.
                if (meadowQuadEnabled && distFromCenter > MEADOW_QUAD_RADIUS_M) {
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
            const distFromCenter = Math.sqrt(x * x + z * z);
            const densityFactor = Math.max(0, 1 - distFromCenter / this.config.grassRadius);
            if (this.random() > densityFactor * 0.8 + 0.2) continue;

            validPositions.push({ x, z });

            if (validPositions.length >= clumpCount) break;
        }

        if (validPositions.length === 0) return null;

        const usesKonveyorBladeMaterial = this.konveyorGrassBladeMaterialSummary?.applied === true;
        const chunkGeometry = usesKonveyorBladeMaterial
            ? this.clumpGeometry.clone()
            : this.clumpGeometry;
        const instanceWorldOffsets = usesKonveyorBladeMaterial
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
            dummy.scale.setScalar(scale);

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
        instancedMesh.castShadow = !this.isMobile;
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
        const materialResult = createKonveyorGrassMaterial('meadow-quad', 'createMeadowQuadMaterial', {
            createDefaultMaterial,
            search: this.konveyorGrassSearch,
            factories: this.konveyorGrassFactories,
            context: {
                baseColor,
                midColor,
                tipColor,
                uvCellsPerChunk: 5.0,
                noiseHashVector: [127.1, 311.7],
                noiseOctaves: [1, 2],
            },
        });
        this.konveyorMeadowQuadMaterialSummary = materialResult.summary;
        return materialResult.material;
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
        for (const zone of this.exclusionZones) {
            if (zone.type === 'rotated') {
                // Rotated rectangle - transform point to local coordinates
                const dx = x - zone.centerX;
                const dz = z - zone.centerZ;

                // Rotate the point by -angle to align with the rectangle's local axes
                const localX = dx * zone.cosAngle - dz * zone.sinAngle;
                const localZ = dx * zone.sinAngle + dz * zone.cosAngle;

                // Check if the transformed point is within the rectangle bounds
                const halfWidth = zone.width / 2;
                const halfDepth = zone.depth / 2;
                if (localX >= -halfWidth && localX <= halfWidth &&
                    localZ >= -halfDepth && localZ <= halfDepth) {
                    return true;
                }
            } else {
                // Axis-aligned rectangle
                if (x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Add an exclusion zone (axis-aligned rectangle)
     */
    addExclusionZone(minX, maxX, minZ, maxZ) {
        this.exclusionZones.push({ minX, maxX, minZ, maxZ, type: 'rect' });
    }

    /**
     * Add a rotated rectangular exclusion zone
     * @param {number} centerX - Center X of the rectangle
     * @param {number} centerZ - Center Z of the rectangle
     * @param {number} width - Width of the rectangle (before rotation)
     * @param {number} depth - Depth of the rectangle (before rotation)
     * @param {number} angle - Rotation angle in radians
     */
    addRotatedExclusionZone(centerX, centerZ, width, depth, angle) {
        this.exclusionZones.push({
            type: 'rotated',
            centerX,
            centerZ,
            width,
            depth,
            angle,
            // Pre-calculate cos and sin for efficiency
            cosAngle: Math.cos(-angle),
            sinAngle: Math.sin(-angle)
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
                let fx = 0, fz = 1;
                if (typeof entity.facingDirection === 'number') {
                    // Sheep / Boid: scalar angle in radians.
                    fx = Math.cos(entity.facingDirection);
                    fz = Math.sin(entity.facingDirection);
                } else if (entity.facing && typeof entity.facing.x === 'number') {
                    // Pre-supplied unit vector (caller may pass one explicitly).
                    fx = entity.facing.x;
                    fz = entity.facing.z;
                } else if (typeof entity.currentRotation === 'number') {
                    // Sheepdog: yaw mapped to forward via the same convention
                    // the mesh uses (forward = (sin(yaw), 0, cos(yaw))).
                    fx = Math.sin(entity.currentRotation);
                    fz = Math.cos(entity.currentRotation);
                }
                const fIdx = this.interactorCount * 2;
                this.interactorFacings[fIdx] = fx;
                this.interactorFacings[fIdx + 1] = fz;

                this.interactorCount++;
            }
        }

        // Update uniforms
        if (this.konveyorGrassBladeMaterialControls?.updateInteractors) {
            this.konveyorGrassBladeMaterialControls.updateInteractors({
                positions: this.interactorPositions,
                data: this.interactorData,
                facings: this.interactorFacings,
                count: this.interactorCount,
                material: this.grassMaterial,
            });
        } else if (this.grassMaterial?.uniforms) {
            this.grassMaterial.uniforms.interactorPositions.value = this.interactorPositions;
            this.grassMaterial.uniforms.interactorData.value = this.interactorData;
            this.grassMaterial.uniforms.interactorFacings.value = this.interactorFacings;
            this.grassMaterial.uniforms.interactorCount.value = this.interactorCount;
        }
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

        this.time += deltaTime;

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
        if (this._frameTimeCount >= 30) {
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
        if (this.konveyorGrassBladeMaterialControls?.update) {
            this.konveyorGrassBladeMaterialControls.update({
                time: this.time,
                deltaTime,
                camera,
                sceneFog: this.scene?.fog ?? null,
                material: this.grassMaterial,
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

        // Update frustum culling and LOD
        if (camera) {
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
            effectiveBlades: this.stats.visibleClumps * this.config.bladesPerClump
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
        if (this.konveyorGrassBladeMaterialControls?.setWind) {
            this.konveyorGrassBladeMaterialControls.setWind({ strength, direction, material: this.grassMaterial });
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
        if (this.konveyorGrassBladeMaterialControls?.setSunDirection) {
            this.konveyorGrassBladeMaterialControls.setSunDirection({ sunDir, material: this.grassMaterial });
            return;
        }
        if (this.grassMaterial.uniforms?.uSunDirection) {
            this.grassMaterial.uniforms.uSunDirection.value.copy(sunDir);
        }
    }

    setInteractionShadowStrength(strength) {
        if (this.konveyorGrassBladeMaterialControls?.setInteractionShadowStrength) {
            this.konveyorGrassBladeMaterialControls.setInteractionShadowStrength({
                strength,
                material: this.grassMaterial,
            });
            return true;
        }
        return false;
    }

    /**
     * Cleanup
     */
    dispose() {
        for (const [key, chunk] of this.chunks) {
            this.scene.remove(chunk.mesh);
            // Cycle 51: meadow-quad chunks now own a per-chunk displaced
            // geometry (each conforms to the terrain), so dispose them
            // per-chunk like any clump chunk that owns its geometry. The
            // shared material is still disposed standalone below.
            if (chunk.mesh.geometry && (chunk.isMeadowQuad || chunk.ownsGeometry === true)) {
                chunk.mesh.geometry.dispose();
            }
        }

        this.chunks.clear();

        if (this.grassMaterial) {
            this.konveyorGrassBladeMaterialControls?.dispose?.();
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
    }
}
