import * as THREE from 'three';

/**
 * TerrainBuilder - Handles terrain, grass, mountains, and environmental elements
 */
export class TerrainBuilder {
    constructor(scene) {
        this.scene = scene;
        this.grassMaterial = null;
        this.grassInstanceCount = 0;
    }
    
    createTerrain() {
        // Create flat terrain - extended to match grass coverage
        const terrainGeometry = new THREE.PlaneGeometry(1000, 1000);
        const terrainMaterial = new THREE.MeshPhongMaterial({
            color: 0x4a7c4a,
            emissive: 0x1a3a1a,
            emissiveIntensity: 0.1,
            shininess: 0
        });
        
        const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
        terrain.rotation.x = -Math.PI / 2;
        terrain.position.y = 0;
        terrain.receiveShadow = true;
        this.scene.add(terrain);
        
        return terrain;
    }
    
    createGrass() {
        // Create instanced grass using shaders
        const grassVertexShader = `
            varying vec2 vUv;
            varying vec3 vWorldPos;
            uniform float time;
            
            void main() {
                vUv = uv;
                
                // Get instance position
                vec3 pos = position;
                vec4 mvPosition = vec4(pos, 1.0);
                
                #ifdef USE_INSTANCING
                    mvPosition = instanceMatrix * mvPosition;
                #endif
                
                vWorldPos = (modelMatrix * mvPosition).xyz;
                
                // Wind displacement - stronger at blade tips
                float dispPower = 1.0 - cos(uv.y * 3.14159 / 2.0);
                
                // Complex wind pattern
                float windX = sin(vWorldPos.z * 0.1 + time * 2.0) * cos(vWorldPos.x * 0.1 + time * 1.5);
                float windZ = cos(vWorldPos.x * 0.15 + time * 2.5) * sin(vWorldPos.z * 0.15 + time * 2.0);
                
                float displacement = windX * (0.15 * dispPower);
                mvPosition.x += displacement;
                mvPosition.z += windZ * (0.1 * dispPower);
                
                vec4 modelViewPosition = modelViewMatrix * mvPosition;
                gl_Position = projectionMatrix * modelViewPosition;
            }
        `;
        
        const grassFragmentShader = `
            varying vec2 vUv;
            varying vec3 vWorldPos;
            uniform vec3 fogColor;
            uniform float fogNear;
            uniform float fogFar;
            
            void main() {
                // Gradient from dark at base to light at tips
                vec3 baseColor = vec3(0.2, 0.5, 0.1);
                vec3 tipColor = vec3(0.41, 0.8, 0.3);
                
                // Add some color variation based on world position
                float colorVariation = sin(vWorldPos.x * 0.5) * cos(vWorldPos.z * 0.5) * 0.1;
                
                vec3 grassColor = mix(baseColor, tipColor, vUv.y);
                grassColor += vec3(colorVariation, colorVariation * 0.5, 0.0);
                
                // Apply fog
                float depth = gl_FragCoord.z / gl_FragCoord.w;
                float fogFactor = smoothstep(fogNear, fogFar, depth);
                
                vec3 finalColor = mix(grassColor, fogColor, fogFactor);
                
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `;
        
        const grassUniforms = {
            time: { value: 0 },
            fogColor: { value: new THREE.Color(0x87CEEB) },
            fogNear: { value: 200 },
            fogFar: { value: 600 }
        };
        
        this.grassMaterial = new THREE.ShaderMaterial({
            vertexShader: grassVertexShader,
            fragmentShader: grassFragmentShader,
            uniforms: grassUniforms,
            side: THREE.DoubleSide
        });
        
        // Create grass blade geometry - small
        const bladeGeometry = new THREE.PlaneGeometry(0.05, 0.8, 1, 4);
        bladeGeometry.translate(0, 0.4, 0); // Move pivot to base
        
        // Create instanced mesh for grass - optimized for performance
        // Reduce grass count for better performance on high-end systems
        const instanceCount = 400000; // Reduced from 800k for better performance
        this.grassInstanceCount = instanceCount;
        const grassMesh = new THREE.InstancedMesh(bladeGeometry, this.grassMaterial, instanceCount);
        
        const dummy = new THREE.Object3D();
        
        // Distribute grass instances - extend much further out
        let placedCount = 0;
        for (let i = 0; i < instanceCount && placedCount < instanceCount; i++) {
            // Random position within much larger bounds - extend to horizon
            const x = (Math.random() - 0.5) * 800; // Increased from 240 to 800
            const z = (Math.random() - 0.5) * 800; // Increased from 240 to 800
            
            // Skip grass in the pasture area
            if (z > 100 && z < 130 && Math.abs(x) < 30) {
                continue;
            }
            
            dummy.position.set(x, 0, z);
            
            // Random scale and rotation with distance-based scaling
            const distanceFromCenter = Math.sqrt(x * x + z * z);
            const distanceScale = Math.max(0.3, 1.0 - distanceFromCenter / 600); // Grass gets smaller with distance
            const scale = (0.8 + Math.random() * 0.4) * distanceScale;
            dummy.scale.setScalar(scale);
            dummy.rotation.y = Math.random() * Math.PI * 2;
            
            // Slight random tilt
            dummy.rotation.z = (Math.random() - 0.5) * 0.1;
            
            dummy.updateMatrix();
            grassMesh.setMatrixAt(placedCount, dummy.matrix);
            placedCount++;
        }
        
        grassMesh.castShadow = true;
        grassMesh.receiveShadow = true;
        this.scene.add(grassMesh);
        
        return grassMesh;
    }
    
    createTrees() {
        // Tree trunk material
        const trunkMaterial = new THREE.MeshPhongMaterial({
            color: 0x4a3a2a,
            emissive: 0x1a0a00,
            emissiveIntensity: 0.05
        });
        
        // Richer foliage materials for variety & realism
        const foliageMaterials = [
            new THREE.MeshPhongMaterial({
                color: 0x355e29,
                emissive: 0x0e1a0e,
                emissiveIntensity: 0.1,
                flatShading: true
            }),
            new THREE.MeshPhongMaterial({
                color: 0x426b33,
                emissive: 0x112411,
                emissiveIntensity: 0.1,
                flatShading: true
            }),
            new THREE.MeshPhongMaterial({
                color: 0x274b1f,
                emissive: 0x091609,
                emissiveIntensity: 0.1,
                flatShading: true
            })
        ];

        // Helper to add slight noise to a spherical geometry for a fluffier canopy
        const addCanopyNoise = (geometry, amplitude = 0.4) => {
            const positionAttr = geometry.attributes.position;
            const normal = new THREE.Vector3();
            for (let i = 0; i < positionAttr.count; i++) {
                normal.set(
                    positionAttr.getX(i),
                    positionAttr.getY(i),
                    positionAttr.getZ(i)
                ).normalize();
                const offset = (Math.random() - 0.5) * amplitude;
                positionAttr.setXYZ(
                    i,
                    positionAttr.getX(i) + normal.x * offset,
                    positionAttr.getY(i) + normal.y * offset,
                    positionAttr.getZ(i) + normal.z * offset
                );
            }
            geometry.computeVertexNormals();
        };

        const trees = [];

        /***********************
         *  DECIDUOUS TREES   *
         ***********************/
        for (let i = 0; i < 200; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 120 + Math.random() * 300; // Spread trees further out
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;

            // Keep play area clear
            if (Math.abs(x) < 120 && Math.abs(z) < 120) continue;
            if (z > 100 && z < 135 && Math.abs(x) < 35) continue;

            // Trunk
            const trunkHeight = 7 + Math.random() * 5;
            const trunkRadius = 0.6 + Math.random() * 0.5;
            const trunkGeometry = new THREE.CylinderGeometry(trunkRadius * 0.8, trunkRadius, trunkHeight, 8);
            const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
            trunk.position.set(x, trunkHeight / 2, z);
            trunk.castShadow = true;
            this.scene.add(trunk);
            trees.push(trunk);

            // Canopy – multiple irregular lumps for an organic silhouette
            const canopyLumps = 3 + Math.floor(Math.random() * 2); // 3-4 lumps
            const materialIndex = Math.floor(Math.random() * foliageMaterials.length);

            for (let l = 0; l < canopyLumps; l++) {
                const radius = 4 + Math.random() * 2 - l * 0.5;
                const icoDetail = 1; // keeps polycount low
                const canopyGeometry = new THREE.IcosahedronGeometry(radius, icoDetail);
                addCanopyNoise(canopyGeometry, 0.5);

                const canopy = new THREE.Mesh(canopyGeometry, foliageMaterials[materialIndex]);
                canopy.position.set(
                    x + (Math.random() - 0.5) * 1.5,
                    trunkHeight + radius / 2 + l * 0.8 + Math.random() * 0.5,
                    z + (Math.random() - 0.5) * 1.5
                );
                canopy.rotation.y = Math.random() * Math.PI;
                canopy.castShadow = true;
                canopy.receiveShadow = true;
                this.scene.add(canopy);
                trees.push(canopy);
            }
        }

        /***********************
         *      PINE TREES    *
         ***********************/
        for (let i = 0; i < 80; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 140 + Math.random() * 250;
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;

            if (Math.abs(x) < 120 && Math.abs(z) < 120) continue;
            if (z > 100 && z < 135 && Math.abs(x) < 35) continue;

            // Trunk
            const trunkHeight = 5 + Math.random() * 3;
            const trunkGeometry = new THREE.CylinderGeometry(0.4, 0.6, trunkHeight, 6);
            const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
            trunk.position.set(x, trunkHeight / 2, z);
            trunk.castShadow = true;
            this.scene.add(trunk);
            trees.push(trunk);

            // Layered foliage – stacked cones for a stylised pine
            const layers = 3 + Math.floor(Math.random() * 2); // 3-4 layers
            const baseHeight = trunkHeight;
            const pineMaterial = new THREE.MeshPhongMaterial({
                color: 0x1e4b1e,
                emissive: 0x061406,
                emissiveIntensity: 0.1,
                flatShading: true
            });

            for (let l = 0; l < layers; l++) {
                const layerRadius = 3 - l * 0.6 + Math.random() * 0.4;
                const layerHeight = 4 + Math.random() * 1.5;
                const layerGeometry = new THREE.ConeGeometry(layerRadius, layerHeight, 8, 1, true);

                addCanopyNoise(layerGeometry, 0.3);

                const layerMesh = new THREE.Mesh(layerGeometry, pineMaterial);
                layerMesh.position.set(
                    x,
                    baseHeight + l * 2 + layerHeight / 2,
                    z
                );
                layerMesh.rotation.y = Math.random() * Math.PI;
                layerMesh.castShadow = true;
                layerMesh.receiveShadow = true;
                this.scene.add(layerMesh);
                trees.push(layerMesh);
            }
        }

        return trees;
    }
    
    addEnvironmentDetails() {
        // Add rocks - placed outside the play area
        const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
        const rockMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x666666,
            emissive: 0x111111,
            emissiveIntensity: 0.05,
            flatShading: true
        });
        
        const rocks = [];
        
        // Play area boundaries to avoid: X: -100 to 100, Z: -100 to 130 (including pasture)
        const playAreaBounds = {
            minX: -100,
            maxX: 100,
            minZ: -100,
            maxZ: 130
        };
        
        // Increase rock count since we have more area to fill
        for (let i = 0; i < 40; i++) {
            const rock = new THREE.Mesh(rockGeometry, rockMaterial);
            let x, z;
            let attempts = 0;
            
            // Find a position outside the play area
            do {
                // Generate position in larger area (400x400)
                x = (Math.random() - 0.5) * 400;
                z = (Math.random() - 0.5) * 400;
                attempts++;
                
                // Prevent infinite loop
                if (attempts > 100) {
                    // Force placement in known safe areas
                    if (Math.random() < 0.5) {
                        // Place far left or right
                        x = Math.random() < 0.5 ? -150 - Math.random() * 100 : 150 + Math.random() * 100;
                        z = (Math.random() - 0.5) * 300;
                    } else {
                        // Place far north or south
                        x = (Math.random() - 0.5) * 300;
                        z = Math.random() < 0.5 ? -150 - Math.random() * 100 : 180 + Math.random() * 100;
                    }
                    break;
                }
            } while (
                x >= playAreaBounds.minX && x <= playAreaBounds.maxX &&
                z >= playAreaBounds.minZ && z <= playAreaBounds.maxZ
            );
            
            rock.position.set(x, 0.5, z);
            rock.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            );
            
            const scale = 0.5 + Math.random() * 1.5;
            rock.scale.set(scale, scale * 0.7, scale);
            
            rock.castShadow = true;
            rock.receiveShadow = true;
            this.scene.add(rock);
            rocks.push(rock);
        }
        
        return rocks;
    }
    
    updateGrassAnimation() {
        if (this.grassMaterial) {
            this.grassMaterial.uniforms.time.value = performance.now() * 0.001;
        }
    }
    
    getGrassMaterial() {
        return this.grassMaterial;
    }
    
    getGrassInstanceCount() {
        return this.grassInstanceCount;
    }
} 