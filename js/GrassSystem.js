import * as THREE from 'three';
import { loadShaderWithReplacements } from './shaders/ShaderLoader.js';
import { geometryTriangleCount } from './utils/TriangleCount.js';

// Shader cache for sync access after async load
let grassDesktopVertexShader = null;
let grassMobileVertexShader = null;
let grassFragmentShader = null;
let grassShadersLoaded = false;

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
     */
    constructor(scene, isMobile = false, sceneGrass = null, heightfield = null) {
        this.scene = scene;
        this.isMobile = isMobile;
        this.sceneGrass = sceneGrass;
        this.heightfield = heightfield;

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

        // Grass configuration
        this.config = {
            // World bounds for grass
            worldSize: isMobile ? 220 : 420,

            // Cycle 7 Phase 2b: per-scene-overridable radial density-falloff
            // multiplier. Default 0.6 keeps RH/Field byte-identical; OC sets
            // 0.75 to extend grass to its 306m safe radius (otherwise the
            // outer 250–306m ring renders as bare terrain).
            densityRange: sceneGrass?.densityRange ?? 0.6,

            // Chunk system - smaller chunks = more grass density control
            chunkSize: 40,

            // Grass density per chunk - MUCH denser
            clumpsPerChunk,
            bladesPerClump: isMobile ? 5 : 7,

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

            // Fog
            fogNear: 200,
            fogFar: 550,
            fogColor: new THREE.Color(0x87CEEB)
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

        // Frustum culling
        this.frustum = new THREE.Frustum();
        this.frustumMatrix = new THREE.Matrix4();

        // Performance stats
        this.stats = {
            totalClumps: 0,
            visibleClumps: 0,
            chunksVisible: 0,
            lastUpdateTime: 0
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
            const angle = (blade / bladesPerClump) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
            const radius = Math.random() * 0.6;
            const offsetX = Math.cos(angle) * radius;
            const offsetZ = Math.sin(angle) * radius;

            // Random blade properties
            const heightScale = 0.4 + Math.random() * 0.8;
            const widthScale = 0.7 + Math.random() * 0.5;
            const rotY = Math.random() * Math.PI; // Random facing direction
            const lean = (Math.random() - 0.5) * 0.4;

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

            // Fog
            fogColor: { value: this.config.fogColor },
            fogNear: { value: this.config.fogNear },
            fogFar: { value: this.config.fogFar },

            // Camera for distance calculations
            uCameraPos: { value: new THREE.Vector3() },

            // Distance-based blade-height fade (smooth LOD transition)
            grassFadeStart: { value: this.config.grassFadeStart },
            grassFadeEnd: { value: this.config.grassFadeEnd }
        };

        return new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms,
            side: THREE.FrontSide,
            transparent: false,
            depthWrite: true,
            depthTest: true
        });
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

                // Wind power - smooth curve, tips move more
                float windPower = vHeight * vHeight;

                // Zen wind: three noise samples taken at DIFFERENT directions
                // and scales so the field has no single visible "wavefront".
                // The previous single-direction scroll created a coherent line
                // of magnitude advancing across the grass; rotating each
                // octave breaks that up so the field reads as a soft, organic
                // shimmer rather than a marching wave.
                vec2 perp = vec2(-windDirection.y, windDirection.x);
                float t = time * windSpeed * 0.05;
                vec2 uvA = vWorldPos.xz * 0.009 - windDirection * t;
                vec2 uvB = vWorldPos.xz * 0.014 - perp * t * 0.6;
                vec2 uvC = vWorldPos.xz * 0.023 - normalize(windDirection + perp) * t * 1.1;
                float nA = texture2D(noiseTexture, uvA).r;
                float nB = texture2D(noiseTexture, uvB).g;
                float nC = texture2D(noiseTexture, uvC).b;

                // Soft modulation around a constant background flow. Smaller
                // variation than before (0.35..0.65 vs 0.4..1.2) — less
                // pulse, more breath. The mean push along windDirection is
                // what makes blades visibly lean; the noise just whispers.
                float gust = (nA + nB + nC) * 0.333;
                float flow = 0.5 + (gust - 0.5) * 0.3;
                vec2 windDisp = windDirection * flow * windStrength * windPower;

                // Per-blade decorrelated side wobble — micro-jitter so blades
                // don't all wave in lockstep along the wind axis.
                windDisp.x += (nB - 0.5) * 0.05 * windPower;
                windDisp.y += (nC - 0.5) * 0.05 * windPower;

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
            uniform float fogNear;
            uniform float fogFar;
            uniform vec3 uCameraPos;

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

                // Slight translucency effect at tips (brighter when backlit)
                vec3 toCamera = normalize(uCameraPos - vWorldPos);
                float backlight = 1.0 + (1.0 - abs(dot(toCamera, vec3(0.0, 1.0, 0.0)))) * vHeight * 0.15;
                color *= backlight;

                // Rim-light on blade tips - back-lit tops naturally brighten
                float tipMask = smoothstep(0.6, 1.0, vHeight);
                float rim = pow(max(dot(toCamera, vec3(0.0, 1.0, 0.0)), 0.0), 4.0);
                color += rim * tipColor * 0.6 * tipMask;

                // Distance fog
                float dist = length(vWorldPos - uCameraPos);
                float fogFactor = smoothstep(fogNear, fogFar, dist);
                color = mix(color, fogColor, fogFactor);

                gl_FragColor = vec4(color, 1.0);
            }
        `;
    }

    /**
     * Generate chunks with grass instances
     */
    generateChunks() {
        const { worldSize, chunkSize, clumpsPerChunk } = this.config;
        const halfWorld = worldSize / 2;
        const chunksPerSide = Math.ceil(worldSize / chunkSize);

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
                if (distFromCenter > halfWorld * 1.2) continue;

                // Create chunk
                const chunk = this.createChunk(
                    cx, cz,
                    chunkMinX, chunkMinZ,
                    chunkMaxX, chunkMaxZ,
                    clumpsPerChunk
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
            const x = minX + Math.random() * (maxX - minX);
            const z = minZ + Math.random() * (maxZ - minZ);

            // Check exclusion zones
            if (this.isExcluded(x, z)) continue;

            // Distance-based density falloff
            const distFromCenter = Math.sqrt(x * x + z * z);
            const densityFactor = Math.max(0, 1 - distFromCenter / (this.config.worldSize * this.config.densityRange));
            if (Math.random() > densityFactor * 0.8 + 0.2) continue;

            validPositions.push({ x, z });

            if (validPositions.length >= clumpCount) break;
        }

        if (validPositions.length === 0) return null;

        // Create instanced mesh for this chunk
        const instancedMesh = new THREE.InstancedMesh(
            this.clumpGeometry,
            this.grassMaterial,
            validPositions.length
        );

        // Set up instances
        validPositions.forEach((pos, i) => {
            const y = this.heightfield ? this.heightfield.sample(pos.x, pos.z) : 0;
            dummy.position.set(pos.x, y, pos.z);

            // Random rotation and scale
            dummy.rotation.y = Math.random() * Math.PI * 2;

            // Scale variation with distance falloff
            const distFromCenter = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
            const distanceScale = Math.max(0.5, 1 - distFromCenter / (this.config.worldSize * 0.8));
            const scale = (0.7 + Math.random() * 0.6) * distanceScale;
            dummy.scale.setScalar(scale);

            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);
        });

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
            lodLevel: 0 // 0 = full, 1 = 50%, 2 = 25%
        };

        this.scene.add(instancedMesh);
        this.stats.totalClumps += validPositions.length;

        return chunk;
    }

    /**
     * Check if position is in an exclusion zone
     */
    isExcluded(x, z) {
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
        if (this.grassMaterial) {
            this.grassMaterial.uniforms.interactorPositions.value = this.interactorPositions;
            this.grassMaterial.uniforms.interactorData.value = this.interactorData;
            this.grassMaterial.uniforms.interactorFacings.value = this.interactorFacings;
            this.grassMaterial.uniforms.interactorCount.value = this.interactorCount;
        }
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

        // Update time uniform
        if (this.grassMaterial) {
            this.grassMaterial.uniforms.time.value = this.time;

            // Update camera position for fog/lighting calculations
            if (camera) {
                this.grassMaterial.uniforms.uCameraPos.value.copy(camera.position);
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

        const boundingSphere = new THREE.Sphere();

        for (const [key, chunk] of this.chunks) {
            boundingSphere.center.copy(chunk.center);
            boundingSphere.radius = chunk.radius;

            const isVisible = this.frustum.intersectsSphere(boundingSphere);

            if (isVisible !== chunk.visible) {
                chunk.visible = isVisible;
                chunk.mesh.visible = isVisible;
            }

            if (isVisible) {
                this.stats.chunksVisible++;
                this.stats.visibleClumps += chunk.mesh.count;
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

        for (const [, chunk] of this.chunks) {
            if (!chunk.visible) continue;

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
        const fraction = lodLevel === 0 ? 1.0 : lodLevel === 1 ? 0.5 : 0.25;
        chunk.mesh.count = Math.max(1, Math.round(chunk.fullCount * fraction));
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

    /**
     * Set wind parameters
     */
    setWind(strength, direction) {
        if (this.grassMaterial) {
            this.grassMaterial.uniforms.windStrength.value = strength;
            if (direction) {
                this.grassMaterial.uniforms.windDirection.value.set(direction.x, direction.y);
            }
        }
    }

    /**
     * Cleanup
     */
    dispose() {
        for (const [key, chunk] of this.chunks) {
            this.scene.remove(chunk.mesh);
            chunk.mesh.geometry.dispose();
        }

        this.chunks.clear();

        if (this.grassMaterial) {
            this.grassMaterial.dispose();
        }

        if (this.noiseTexture) {
            this.noiseTexture.dispose();
        }

        if (this.clumpGeometry) {
            this.clumpGeometry.dispose();
        }
    }
}
