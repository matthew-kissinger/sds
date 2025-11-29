import * as THREE from 'three';
import { loadShaderWithReplacements } from './shaders/ShaderLoader.js';

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
    constructor(scene, isMobile = false) {
        this.scene = scene;
        this.isMobile = isMobile;

        // Grass configuration
        this.config = {
            // World bounds for grass
            worldSize: isMobile ? 220 : 420,

            // Chunk system - smaller chunks = more grass density control
            chunkSize: 40,

            // Grass density per chunk - MUCH denser
            clumpsPerChunk: isMobile ? 800 : 2500,
            bladesPerClump: isMobile ? 5 : 7,

            // Blade geometry - varied heights for lush look
            bladeWidth: 0.12,
            bladeHeight: 1.0,
            bladeHeightVariation: 0.7,

            // Colors - richer, more vibrant greens that stand out from ground
            baseColor: new THREE.Color(0.08, 0.28, 0.04),      // Very dark green at base
            midColor: new THREE.Color(0.18, 0.48, 0.12),       // Rich mid green
            tipColor: new THREE.Color(0.55, 0.82, 0.30),       // Bright yellow-green tips

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

            // LOD distances
            lodNear: 100,
            lodMid: 180,
            lodFar: 280,

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
     * Create advanced grass shader material
     * Uses externally loaded shaders if available, falls back to inline
     */
    createGrassMaterial() {
        // Use loaded shaders or fallback to inline
        let vertexShader, fragmentShader;

        if (this.isMobile) {
            vertexShader = grassMobileVertexShader || this.getMobileVertexShader();
        } else {
            vertexShader = grassDesktopVertexShader || this.getDesktopVertexShader();
        }
        fragmentShader = grassFragmentShader || this.getFragmentShader();

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
            interactorCount: { value: 0 },
            interactionRadius: { value: this.config.interactionRadius },
            interactionStrength: { value: this.config.interactionStrength },

            // Fog
            fogColor: { value: this.config.fogColor },
            fogNear: { value: this.config.fogNear },
            fogFar: { value: this.config.fogFar },

            // Camera for distance calculations
            uCameraPos: { value: new THREE.Vector3() }
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
            uniform float interactorData[${this.config.maxInteractors}]; // w component: 0=player, 1=sheep
            uniform int interactorCount;
            uniform float interactionRadius;
            uniform float interactionStrength;

            attribute vec4 bladeData;

            varying vec2 vUv;
            varying vec3 vWorldPos;
            varying float vHeight;
            varying float vColorVariation;
            varying float vShadow;

            // Smooth falloff for interaction
            float smoothFalloff(float dist, float radius) {
                float t = clamp(dist / radius, 0.0, 1.0);
                return 1.0 - t * t * (3.0 - 2.0 * t);
            }

            void main() {
                vUv = uv;
                vHeight = bladeData.y;

                vec3 pos = position;
                vec4 worldPos4 = modelMatrix * instanceMatrix * vec4(pos, 1.0);
                vWorldPos = worldPos4.xyz;

                // Wind power - smooth curve, tips move more
                float windPower = vHeight * vHeight;

                // Sample noise texture for gentle organic wind
                vec2 noiseUV = vWorldPos.xz * 0.008 + time * windSpeed * 0.05;
                vec4 noise = texture2D(noiseTexture, noiseUV);

                // Gentle wave-based wind - zen-like swaying
                float wave1 = sin(vWorldPos.x * 0.03 + vWorldPos.z * 0.02 + time * 0.8) * 0.5 + 0.5;
                float wave2 = sin(vWorldPos.x * 0.02 - vWorldPos.z * 0.03 + time * 0.5) * 0.5 + 0.5;
                float combinedWave = (wave1 + wave2) * 0.5;

                // Smooth wind displacement
                vec2 windDisp = windDirection * combinedWave * windStrength * windPower;

                // Add subtle noise variation
                windDisp.x += (noise.r - 0.5) * 0.03 * windPower;
                windDisp.y += (noise.g - 0.5) * 0.03 * windPower;

                // Entity interaction - grass bends AWAY from entities
                vec3 totalPush = vec3(0.0);
                for (int i = 0; i < ${this.config.maxInteractors}; i++) {
                    if (i >= interactorCount) break;

                    vec3 entityPos = interactorPositions[i];
                    float entityType = interactorData[i]; // 0=player/dog, 1=sheep
                    vec2 fromEntity = vWorldPos.xz - entityPos.xz;

                    // Different radius/strength for player vs sheep
                    float radius = entityType < 0.5 ? ${this.config.interactionRadius.toFixed(1)} : ${this.config.sheepInteractionRadius.toFixed(1)};
                    float strength = entityType < 0.5 ? ${this.config.interactionStrength.toFixed(1)} : ${this.config.sheepInteractionStrength.toFixed(1)};

                    // For player (entityType 0), use elliptical shape (longer body)
                    float dist;
                    if (entityType < 0.5) {
                        // Elliptical distance - dog is longer than wide
                        // Scale X more to make it narrower, keeping Z longer
                        vec2 scaledDist = fromEntity * vec2(1.8, 1.0); // Narrower in X, full length in Z
                        dist = length(scaledDist);
                    } else {
                        dist = length(fromEntity);
                    }

                    if (dist < radius && dist > 0.1) {
                        float pushStrength = smoothFalloff(dist, radius) * strength;
                        vec2 pushDir = normalize(fromEntity);
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

            uniform vec3 interactorPositions[${this.config.maxInteractors}];
            uniform int interactorCount;
            uniform float interactionRadius;
            uniform float interactionStrength;

            float smoothFalloff(float dist, float radius) {
                float t = clamp(dist / radius, 0.0, 1.0);
                return 1.0 - t * t * (3.0 - 2.0 * t);
            }

            void main() {
                vUv = uv;
                vHeight = bladeData.y;

                vec3 pos = position;
                vec4 worldPos4 = modelMatrix * instanceMatrix * vec4(pos, 1.0);
                vWorldPos = worldPos4.xyz;

                float windPower = vHeight * vHeight;

                // Player interaction on mobile - grass bends AWAY
                vec3 totalPush = vec3(0.0);
                if (interactorCount > 0) {
                    vec3 entityPos = interactorPositions[0];
                    vec2 fromEntity = vWorldPos.xz - entityPos.xz;
                    float dist = length(fromEntity);

                    if (dist < interactionRadius && dist > 0.1) {
                        float pushStrength = smoothFalloff(dist, interactionRadius) * interactionStrength;
                        vec2 pushDir = normalize(fromEntity); // Points AWAY from entity
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
            const densityFactor = Math.max(0, 1 - distFromCenter / (this.config.worldSize * 0.6));
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
            dummy.position.set(pos.x, 0, pos.z);

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
            visible: true,
            lodLevel: 0 // 0 = full, 1 = medium, 2 = low
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
            if (x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) {
                return true;
            }
        }

        return false;
    }

    /**
     * Add an exclusion zone
     */
    addExclusionZone(minX, maxX, minZ, maxZ) {
        this.exclusionZones.push({ minX, maxX, minZ, maxZ });
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

                // Entity type: 0 = player/dog (elliptical), 1 = sheep (circular)
                this.interactorData[this.interactorCount] = entity.type === 'sheep' ? 1.0 : 0.0;

                this.interactorCount++;
            }
        }

        // Update uniforms
        if (this.grassMaterial) {
            this.grassMaterial.uniforms.interactorPositions.value = this.interactorPositions;
            this.grassMaterial.uniforms.interactorData.value = this.interactorData;
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

            if (playerPosition) {
                this.updateLOD(playerPosition);
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
                this.stats.visibleClumps += chunk.clumpCount;
            }
        }
    }

    /**
     * Update LOD based on distance from player
     */
    updateLOD(playerPosition) {
        const { lodNear, lodMid, lodFar } = this.config;

        for (const [key, chunk] of this.chunks) {
            if (!chunk.visible) continue;

            const dx = chunk.center.x - playerPosition.x;
            const dz = chunk.center.z - playerPosition.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            let targetLOD;
            if (dist < lodNear) {
                targetLOD = 0; // Full detail
            } else if (dist < lodMid) {
                targetLOD = 1; // Medium
            } else if (dist < lodFar) {
                targetLOD = 2; // Low
            } else {
                targetLOD = 3; // Very low / hidden
            }

            // Only update if LOD changed
            if (targetLOD !== chunk.lodLevel) {
                chunk.lodLevel = targetLOD;
                this.applyLOD(chunk, targetLOD);
            }
        }
    }

    /**
     * Apply LOD to a chunk
     */
    applyLOD(chunk, lodLevel) {
        const mesh = chunk.mesh;

        // LOD via instance visibility (scale to 0)
        // For performance, we skip updating every instance and just control visibility
        switch (lodLevel) {
            case 0: // Full
                mesh.visible = true;
                mesh.material = this.grassMaterial;
                break;
            case 1: // Medium - slightly transparent/faded
                mesh.visible = true;
                break;
            case 2: // Low
                mesh.visible = true;
                break;
            case 3: // Very low / hidden at extreme distance
                mesh.visible = chunk.visible; // Still respect frustum culling
                break;
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
