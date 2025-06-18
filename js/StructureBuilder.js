import * as THREE from 'three';

/**
 * StructureBuilder - Handles fences, gates, and pasture structures
 */
export class StructureBuilder {
    constructor(scene) {
        this.scene = scene;
        this.boundaryFenceElements = []; // Track boundary fence elements for removal
        this.gateElements = []; // Track gate elements for removal
        this.pastureElements = []; // Track pasture elements for removal
    }
    
    /**
     * Remove all existing boundary fence elements from the scene
     */
    clearBoundaryFence() {
        console.log(`🗑️ Removing ${this.boundaryFenceElements.length} boundary fence elements`);
        
        this.boundaryFenceElements.forEach(element => {
            this.scene.remove(element);
            // Dispose of geometry and materials to free memory
            if (element.geometry) element.geometry.dispose();
            if (element.material) {
                if (Array.isArray(element.material)) {
                    element.material.forEach(mat => mat.dispose());
                } else {
                    element.material.dispose();
                }
            }
        });
        
        this.boundaryFenceElements = []; // Clear the tracking array
    }
    
    clearGates() {
        console.log(`🗑️ Removing ${this.gateElements.length} gate elements`);
        
        this.gateElements.forEach(element => {
            this.scene.remove(element);
            // Dispose of geometry and materials to free memory
            if (element.geometry) element.geometry.dispose();
            if (element.material) {
                if (Array.isArray(element.material)) {
                    element.material.forEach(mat => mat.dispose());
                } else {
                    element.material.dispose();
                }
            }
        });
        
        this.gateElements = []; // Clear the tracking array
    }
    
    clearPastures() {
        console.log(`🗑️ Removing ${this.pastureElements.length} pasture elements`);
        
        this.pastureElements.forEach(element => {
            this.scene.remove(element);
            // Dispose of geometry and materials to free memory
            if (element.geometry) element.geometry.dispose();
            if (element.material) {
                if (Array.isArray(element.material)) {
                    element.material.forEach(mat => mat.dispose());
                } else {
                    element.material.dispose();
                }
            }
        });
        
        this.pastureElements = []; // Clear the tracking array
    }
    
    clearAllStructures() {
        console.log('🗑️ Clearing all structures (fences, gates, pastures)');
        this.clearBoundaryFence();
        this.clearGates();
        this.clearPastures();
    }
    
    createFieldBoundaryFence(bounds, gate) {
        // Clear any existing boundary fence first
        this.clearBoundaryFence();
        
        // Fence post geometry and material
        const postGeometry = new THREE.CylinderGeometry(0.25, 0.25, 3.5, 8);
        const postMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x5a4a3a,
            emissive: 0x1a0a00,
            emissiveIntensity: 0.05
        });
        
        // Rail geometry and material
        const railMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x6a5a4a,
            emissive: 0x1a0a00,
            emissiveIntensity: 0.05
        });
        
        // Fence parameters
        const postSpacing = 10; // Distance between posts
        const postHeight = 3.5;
        const railHeight1 = 1.2; // Lower rail
        const railHeight2 = 2.4; // Upper rail
        
        const fencePosts = [];
        
        // Create fence posts around the perimeter
        // Bottom edge (z = -100)
        for (let x = bounds.minX; x <= bounds.maxX; x += postSpacing) {
            const post = new THREE.Mesh(postGeometry, postMaterial);
            post.position.set(x, postHeight/2, bounds.minZ);
            post.castShadow = true;
            post.receiveShadow = true;
            this.scene.add(post);
            this.boundaryFenceElements.push(post); // Track for removal
            fencePosts.push({x: x, z: bounds.minZ, type: 'bottom'});
        }
        
        // Top edge (z = 100) - connect properly to gate posts
        for (let x = bounds.minX; x <= bounds.maxX; x += postSpacing) {
            // Skip posts that would be too close to gate posts
            const gateLeftPost = gate.position.x - gate.width/2;
            const gateRightPost = gate.position.x + gate.width/2;
            
            if (x < gateLeftPost - 1 || x > gateRightPost + 1) {
                const post = new THREE.Mesh(postGeometry, postMaterial);
                post.position.set(x, postHeight/2, bounds.maxZ);
                post.castShadow = true;
                post.receiveShadow = true;
                this.scene.add(post);
                this.boundaryFenceElements.push(post); // Track for removal
                fencePosts.push({x: x, z: bounds.maxZ, type: 'top'});
            }
        }
        
        // Left edge (x = -100)
        for (let z = bounds.minZ; z <= bounds.maxZ; z += postSpacing) {
            const post = new THREE.Mesh(postGeometry, postMaterial);
            post.position.set(bounds.minX, postHeight/2, z);
            post.castShadow = true;
            post.receiveShadow = true;
            this.scene.add(post);
            this.boundaryFenceElements.push(post); // Track for removal
            fencePosts.push({x: bounds.minX, z: z, type: 'left'});
        }
        
        // Right edge (x = 100)
        for (let z = bounds.minZ; z <= bounds.maxZ; z += postSpacing) {
            const post = new THREE.Mesh(postGeometry, postMaterial);
            post.position.set(bounds.maxX, postHeight/2, z);
            post.castShadow = true;
            post.receiveShadow = true;
            this.scene.add(post);
            this.boundaryFenceElements.push(post); // Track for removal
            fencePosts.push({x: bounds.maxX, z: z, type: 'right'});
        }
        
        // Add horizontal rails between posts
        // Bottom edge rails
        for (let x = bounds.minX; x < bounds.maxX; x += postSpacing) {
            const rail1 = this.createFenceRail(x, bounds.minZ, x + postSpacing, bounds.minZ, railHeight1, railMaterial);
            const rail2 = this.createFenceRail(x, bounds.minZ, x + postSpacing, bounds.minZ, railHeight2, railMaterial);
            if (rail1) this.boundaryFenceElements.push(rail1);
            if (rail2) this.boundaryFenceElements.push(rail2);
        }
        
        // Top edge rails - connect to gate posts properly
        const gateLeftPost = gate.position.x - gate.width/2;
        const gateRightPost = gate.position.x + gate.width/2;
        
        for (let x = bounds.minX; x < bounds.maxX; x += postSpacing) {
            const nextX = x + postSpacing;
            
            // Left side of gate - connect to left gate post
            if (nextX <= gateLeftPost + 1) {
                const endX = (nextX > gateLeftPost - 1) ? gateLeftPost : nextX;
                const rail1 = this.createFenceRail(x, bounds.maxZ, endX, bounds.maxZ, railHeight1, railMaterial);
                const rail2 = this.createFenceRail(x, bounds.maxZ, endX, bounds.maxZ, railHeight2, railMaterial);
                if (rail1) this.boundaryFenceElements.push(rail1);
                if (rail2) this.boundaryFenceElements.push(rail2);
            }
            
            // Right side of gate - connect from right gate post
            if (x >= gateRightPost - 1) {
                const startX = (x < gateRightPost + 1) ? gateRightPost : x;
                const rail1 = this.createFenceRail(startX, bounds.maxZ, nextX, bounds.maxZ, railHeight1, railMaterial);
                const rail2 = this.createFenceRail(startX, bounds.maxZ, nextX, bounds.maxZ, railHeight2, railMaterial);
                if (rail1) this.boundaryFenceElements.push(rail1);
                if (rail2) this.boundaryFenceElements.push(rail2);
            }
        }
        
        // Left edge rails
        for (let z = bounds.minZ; z < bounds.maxZ; z += postSpacing) {
            const rail1 = this.createFenceRail(bounds.minX, z, bounds.minX, z + postSpacing, railHeight1, railMaterial);
            const rail2 = this.createFenceRail(bounds.minX, z, bounds.minX, z + postSpacing, railHeight2, railMaterial);
            if (rail1) this.boundaryFenceElements.push(rail1);
            if (rail2) this.boundaryFenceElements.push(rail2);
        }
        
        // Right edge rails
        for (let z = bounds.minZ; z < bounds.maxZ; z += postSpacing) {
            const rail1 = this.createFenceRail(bounds.maxX, z, bounds.maxX, z + postSpacing, railHeight1, railMaterial);
            const rail2 = this.createFenceRail(bounds.maxX, z, bounds.maxX, z + postSpacing, railHeight2, railMaterial);
            if (rail1) this.boundaryFenceElements.push(rail1);
            if (rail2) this.boundaryFenceElements.push(rail2);
        }
        
        return fencePosts;
    }
    
    createFenceRail(x1, z1, x2, z2, height, material) {
        const distance = Math.sqrt((x2-x1)*(x2-x1) + (z2-z1)*(z2-z1));
        if (distance < 0.1) return; // Skip very short rails
        
        const railGeometry = new THREE.CylinderGeometry(0.08, 0.08, distance, 6);
        const rail = new THREE.Mesh(railGeometry, material);
        
        // Position rail at midpoint
        rail.position.set((x1 + x2) / 2, height, (z1 + z2) / 2);
        
        // Rotate rail to connect posts
        // First rotate to horizontal (from vertical default)
        rail.rotation.z = Math.PI / 2;
        
        // Then rotate around Y axis to point in the right direction
        const angle = Math.atan2(z2 - z1, x2 - x1);
        rail.rotation.y = angle;
        
        rail.castShadow = true;
        rail.receiveShadow = true;
        this.scene.add(rail);
        
        return rail;
    }

    createGateAndPasture(gate, pasture) {
        const gateElements = [];
        
        // Determine gate color (use player color if available, otherwise default)
        const gateColor = gate.color || 0x4a3c28;
        const archColor = gate.color ? this.lightenColor(gate.color, 0.3) : 0x6a5a4a;
        const thresholdColor = gate.color ? this.lightenColor(gate.color, 0.5) : 0xFFD700;
        
        // Create gate posts - taller and more prominent
        const postGeometry = new THREE.CylinderGeometry(0.4, 0.4, gate.height + 1, 8);
        const postMaterial = new THREE.MeshPhongMaterial({ 
            color: gateColor,
            emissive: gate.color ? this.darkenColor(gate.color, 0.8) : 0x1a0a00,
            emissiveIntensity: 0.1
        });
        
        // Left post
        const leftPost = new THREE.Mesh(postGeometry, postMaterial);
        leftPost.position.set(gate.position.x - gate.width/2, (gate.height + 1)/2, gate.position.z);
        leftPost.castShadow = true;
        leftPost.receiveShadow = true;
        this.scene.add(leftPost);
        gateElements.push(leftPost);
        this.gateElements.push(leftPost); // Track for removal
        
        // Right post
        const rightPost = new THREE.Mesh(postGeometry, postMaterial);
        rightPost.position.set(gate.position.x + gate.width/2, (gate.height + 1)/2, gate.position.z);
        rightPost.castShadow = true;
        rightPost.receiveShadow = true;
        this.scene.add(rightPost);
        gateElements.push(rightPost);
        this.gateElements.push(rightPost); // Track for removal
        
        // Decorative gate arch with player color
        const archGeometry = new THREE.CylinderGeometry(0.2, 0.2, gate.width + 1, 8);
        const archMaterial = new THREE.MeshPhongMaterial({ 
            color: archColor,
            emissive: gate.color ? this.darkenColor(gate.color, 0.7) : 0x2a1a00,
            emissiveIntensity: 0.1
        });
        
        const arch = new THREE.Mesh(archGeometry, archMaterial);
        arch.position.set(gate.position.x, gate.height + 0.5, gate.position.z);
        arch.rotation.z = Math.PI / 2;
        arch.castShadow = true;
        this.scene.add(arch);
        gateElements.push(arch);
        this.gateElements.push(arch); // Track for removal
        
        // Gate threshold marker with player color
        const thresholdGeometry = new THREE.BoxGeometry(gate.width + 2, 0.15, 3);
        const thresholdMaterial = new THREE.MeshPhongMaterial({ 
            color: thresholdColor,
            emissive: gate.color ? this.darkenColor(gate.color, 0.5) : 0x806000,
            emissiveIntensity: 0.3
        });
        
        const threshold = new THREE.Mesh(thresholdGeometry, thresholdMaterial);
        threshold.position.set(gate.position.x, 0.075, gate.position.z);
        this.scene.add(threshold);
        gateElements.push(threshold);
        this.gateElements.push(threshold); // Track for removal
        
        // Add player-specific welcome sign above gate
        this.createPlayerWelcomeSign(gate.position.x, gate.height + 1.5, gate.position.z - 1, gate.playerId, gate.color);
        
        // Create enhanced pasture area with player color
        const pastureElements = this.createEnhancedPasture(pasture, gate);
        
        // Track pasture elements for removal
        pastureElements.forEach(element => this.pastureElements.push(element));
        
        return {
            gate: gateElements,
            pasture: pastureElements
        };
    }
    
    createWelcomeSign(x, y, z) {
        // Sign post
        const postGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 6);
        const postMaterial = new THREE.MeshPhongMaterial({ color: 0x4a3c28 });
        const signPost = new THREE.Mesh(postGeometry, postMaterial);
        signPost.position.set(x, y - 0.5, z);
        signPost.castShadow = true;
        this.scene.add(signPost);
        
        // Sign board
        const signGeometry = new THREE.BoxGeometry(3, 0.8, 0.2);
        const signMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x8B4513,
            emissive: 0x2a1a00,
            emissiveIntensity: 0.05
        });
        const signBoard = new THREE.Mesh(signGeometry, signMaterial);
        signBoard.position.set(x, y, z);
        signBoard.castShadow = true;
        this.scene.add(signBoard);
    }
    
    createPlayerWelcomeSign(x, y, z, playerId, playerColor) {
        // Sign post with player color
        const postGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 6);
        const postMaterial = new THREE.MeshPhongMaterial({ 
            color: playerColor || 0x4a3c28,
            emissive: playerColor ? this.darkenColor(playerColor, 0.8) : 0x1a0a00,
            emissiveIntensity: 0.1
        });
        const signPost = new THREE.Mesh(postGeometry, postMaterial);
        signPost.position.set(x, y - 0.5, z);
        signPost.castShadow = true;
        this.scene.add(signPost);
        
        // Sign board with player color accent
        const signGeometry = new THREE.BoxGeometry(3, 0.8, 0.2);
        const signMaterial = new THREE.MeshPhongMaterial({ 
            color: playerColor ? this.lightenColor(playerColor, 0.6) : 0x8B4513,
            emissive: playerColor ? this.darkenColor(playerColor, 0.7) : 0x2a1a00,
            emissiveIntensity: 0.05
        });
        const signBoard = new THREE.Mesh(signGeometry, signMaterial);
        signBoard.position.set(x, y, z);
        signBoard.castShadow = true;
        this.scene.add(signBoard);
        
        // Add player indicator if playerId provided
        if (playerId && playerColor) {
            const indicatorGeometry = new THREE.SphereGeometry(0.15, 8, 6);
            const indicator = new THREE.Mesh(indicatorGeometry, new THREE.MeshPhongMaterial({
                color: playerColor,
                emissive: playerColor,
                emissiveIntensity: 0.3
            }));
            indicator.position.set(x - 1.2, y, z + 0.15);
            indicator.castShadow = true;
            this.scene.add(indicator);
        }
    }
    
    // Color utility methods
    lightenColor(color, amount) {
        const r = (color >> 16) & 0xff;
        const g = (color >> 8) & 0xff;
        const b = color & 0xff;
        
        const newR = Math.min(255, Math.floor(r + (255 - r) * amount));
        const newG = Math.min(255, Math.floor(g + (255 - g) * amount));
        const newB = Math.min(255, Math.floor(b + (255 - b) * amount));
        
        return (newR << 16) | (newG << 8) | newB;
    }
    
    darkenColor(color, amount) {
        const r = (color >> 16) & 0xff;
        const g = (color >> 8) & 0xff;
        const b = color & 0xff;
        
        const newR = Math.floor(r * amount);
        const newG = Math.floor(g * amount);
        const newB = Math.floor(b * amount);
        
        return (newR << 16) | (newG << 8) | newB;
    }
    
    /**
     * Create multiple gates and pastures for competitive mode
     * @param {Array} competitiveGates - Array of gate configurations with player data
     * @returns {Object} - Object containing all gate and pasture elements
     */
    createMultipleGatesAndPastures(competitiveGates) {
        if (!Array.isArray(competitiveGates) || competitiveGates.length === 0) {
            console.warn('No competitive gates provided, falling back to single gate creation');
            return null;
        }
        
        const allElements = {
            gates: [],
            pastures: []
        };
        
        console.log(`🚪 Creating ${competitiveGates.length} competitive gates with player colors`);
        
        // Create each gate and pasture pair
        competitiveGates.forEach((gateConfig, index) => {
            const gateAndPasture = this.createGateAndPasture(gateConfig, gateConfig.pasture);
            allElements.gates.push(...gateAndPasture.gate);
            allElements.pastures.push(...gateAndPasture.pasture);
            
            console.log(`Created gate ${index + 1}/${competitiveGates.length} for player ${gateConfig.playerId} with color 0x${gateConfig.color.toString(16).toUpperCase()}`);
        });
        
        return allElements;
    }
    
    /**
     * Creates a boundary fence that correctly leaves openings for multiple competitive gates.
     * This is the main refactored function to fix the competitive mode fence.
     * @param {Object} bounds - The field boundaries.
     * @param {Array} competitiveGates - An array of gate configuration objects.
     */
    createMultiGateBoundaryFence(bounds, competitiveGates) {
        console.log(`🔧 Building boundary fence with ${competitiveGates.length} gate openings.`);
        
        const postGeometry = new THREE.CylinderGeometry(0.25, 0.25, 3.5, 8);
        const postMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x5a4a3a,
            emissive: 0x1a0a00,
            emissiveIntensity: 0.05
        });
        const railMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x6a5a4a,
            emissive: 0x1a0a00,
            emissiveIntensity: 0.05
        });
        const postSpacing = 10;
        const railHeight1 = 1.2;
        const railHeight2 = 2.4;

        // An array of the four boundaries to build fences along
        const boundaries = [
            { direction: 'north', start: bounds.minX, end: bounds.maxX, fixedCoord: bounds.maxZ, orientation: 'horizontal' },
            { direction: 'south', start: bounds.minX, end: bounds.maxX, fixedCoord: bounds.minZ, orientation: 'horizontal' },
            { direction: 'west', start: bounds.minZ, end: bounds.maxZ, fixedCoord: bounds.minX, orientation: 'vertical' },
            { direction: 'east', start: bounds.minZ, end: bounds.maxZ, fixedCoord: bounds.maxX, orientation: 'vertical' }
        ];

        boundaries.forEach(boundary => {
            // Filter gates that lie on the current boundary
            const gatesOnBoundary = competitiveGates.filter(gate => {
                const isOnBoundary = (boundary.orientation === 'horizontal')
                    ? Math.abs(gate.position.z - boundary.fixedCoord) < 1
                    : Math.abs(gate.position.x - boundary.fixedCoord) < 1;
                return isOnBoundary;
            }).sort((a, b) => {
                // Sort gates along the boundary line
                return (boundary.orientation === 'horizontal') ? a.position.x - b.position.x : a.position.z - b.position.z;
            });

            let currentPos = boundary.start;

            // Build fence segments between gates
            for (const gate of gatesOnBoundary) {
                const gateCenter = (boundary.orientation === 'horizontal') ? gate.position.x : gate.position.z;
                const gateStart = gateCenter - gate.width / 2;
                
                if (gateStart > currentPos) {
                    this.buildFenceRun(currentPos, gateStart, boundary.fixedCoord, boundary.orientation, postGeometry, postMaterial, railMaterial, postSpacing, railHeight1, railHeight2);
                }
                currentPos = gateCenter + gate.width / 2;
            }

            // Build the final segment from the last gate to the end of the boundary
            if (currentPos < boundary.end) {
                this.buildFenceRun(currentPos, boundary.end, boundary.fixedCoord, boundary.orientation, postGeometry, postMaterial, railMaterial, postSpacing, railHeight1, railHeight2);
            }
        });
    }
    
    /**
     * Builds a continuous run of fence posts and rails between two points on a boundary.
     * This helper ensures rails connect perfectly to endpoints (corners or gate posts).
     * @private
     */
    buildFenceRun(start, end, fixedCoord, orientation, postGeom, postMat, railMat, spacing, h1, h2) {
        if (Math.abs(start - end) < 0.1) return; // Skip tiny segments

        // Create the starting post for this run
        this.createPost(start, fixedCoord, orientation, postGeom, postMat);

        // Create intermediate posts and rails at intervals
        let currentPos = start;
        while (currentPos + spacing < end) {
            const nextPos = currentPos + spacing;
            
            // Create the next post
            this.createPost(nextPos, fixedCoord, orientation, postGeom, postMat);
            
            // Create rails between current and next post
            if (orientation === 'horizontal') {
                const rail1 = this.createFenceRail(currentPos, fixedCoord, nextPos, fixedCoord, h1, railMat);
                const rail2 = this.createFenceRail(currentPos, fixedCoord, nextPos, fixedCoord, h2, railMat);
                if (rail1) this.boundaryFenceElements.push(rail1);
                if (rail2) this.boundaryFenceElements.push(rail2);
            } else { // vertical
                const rail1 = this.createFenceRail(fixedCoord, currentPos, fixedCoord, nextPos, h1, railMat);
                const rail2 = this.createFenceRail(fixedCoord, currentPos, fixedCoord, nextPos, h2, railMat);
                if (rail1) this.boundaryFenceElements.push(rail1);
                if (rail2) this.boundaryFenceElements.push(rail2);
            }
            
            currentPos = nextPos;
        }
        
        // Create the final post at the end of the run
        this.createPost(end, fixedCoord, orientation, postGeom, postMat);
        
        // Create final rails from last intermediate post to end post
        if (currentPos < end) {
            if (orientation === 'horizontal') {
                const rail1 = this.createFenceRail(currentPos, fixedCoord, end, fixedCoord, h1, railMat);
                const rail2 = this.createFenceRail(currentPos, fixedCoord, end, fixedCoord, h2, railMat);
                if (rail1) this.boundaryFenceElements.push(rail1);
                if (rail2) this.boundaryFenceElements.push(rail2);
            } else { // vertical
                const rail1 = this.createFenceRail(fixedCoord, currentPos, fixedCoord, end, h1, railMat);
                const rail2 = this.createFenceRail(fixedCoord, currentPos, fixedCoord, end, h2, railMat);
                if (rail1) this.boundaryFenceElements.push(rail1);
                if (rail2) this.boundaryFenceElements.push(rail2);
            }
        }
    }

    /**
     * Helper to create and track a single fence post.
     * @private
     */
    createPost(pos, fixedCoord, orientation, postGeom, postMat) {
        const post = new THREE.Mesh(postGeom, postMat);
        const postHeight = postGeom.parameters.height;

        if (orientation === 'horizontal') {
            post.position.set(pos, postHeight / 2, fixedCoord);
        } else {
            post.position.set(fixedCoord, postHeight / 2, pos);
        }
        
        post.castShadow = true;
        this.scene.add(post);
        this.boundaryFenceElements.push(post);
    }

    createEnhancedPasture(pasture, gate) {
        const pastureElements = [];
        
        // Create a more enclosed pen with proper fencing
        this.createPenFencing(pasture, pastureElements, gate);
        
        // Enhanced pasture ground with better texture
        const pastureGeometry = new THREE.PlaneGeometry(
            pasture.maxX - pasture.minX + 4, 
            pasture.maxZ - pasture.minZ + 4
        );
        
        // Create enhanced pasture texture with player color tint
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const context = canvas.getContext('2d');
        
        // Base grass colors with optional player color tint
        let baseColor1 = '#6a8a5a';
        let baseColor2 = '#5a7a4a';
        let baseColor3 = '#4a6a3a';
        
        // Apply subtle player color tint if gate has player color
        if (gate && gate.color) {
            const playerColorHex = '#' + gate.color.toString(16).padStart(6, '0');
            baseColor1 = this.blendColors('#6a8a5a', playerColorHex, 0.15);
            baseColor2 = this.blendColors('#5a7a4a', playerColorHex, 0.15);
            baseColor3 = this.blendColors('#4a6a3a', playerColorHex, 0.15);
        }
        
        // Rich, comfortable grass for sleeping pasture
        const gradient = context.createRadialGradient(512, 512, 0, 512, 512, 512);
        gradient.addColorStop(0, baseColor1);
        gradient.addColorStop(0.5, baseColor2);
        gradient.addColorStop(1, baseColor3);
        context.fillStyle = gradient;
        context.fillRect(0, 0, 1024, 1024);
        
        // Add clover patches
        for (let i = 0; i < 50; i++) {
            const x = Math.random() * 1024;
            const y = Math.random() * 1024;
            const radius = 20 + Math.random() * 30;
            
            const cloverGradient = context.createRadialGradient(x, y, 0, x, y, radius);
            cloverGradient.addColorStop(0, '#7a9a6a');
            cloverGradient.addColorStop(1, 'transparent');
            context.fillStyle = cloverGradient;
            context.beginPath();
            context.arc(x, y, radius, 0, Math.PI * 2);
            context.fill();
        }
        
        // Add texture details
        for (let i = 0; i < 2000; i++) {
            context.fillStyle = `rgba(${60 + Math.random() * 40}, ${120 + Math.random() * 40}, ${60 + Math.random() * 40}, 0.15)`;
            context.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
        }
        
        const pastureTexture = new THREE.CanvasTexture(canvas);
        pastureTexture.wrapS = THREE.RepeatWrapping;
        pastureTexture.wrapT = THREE.RepeatWrapping;
        pastureTexture.repeat.set(3, 3);
        pastureTexture.colorSpace = THREE.SRGBColorSpace;
        
        const pastureMaterial = new THREE.MeshPhongMaterial({ 
            map: pastureTexture,
            emissive: 0x1a2a1a,
            emissiveIntensity: 0.08
        });
        
        const pastureMesh = new THREE.Mesh(pastureGeometry, pastureMaterial);
        pastureMesh.rotation.x = -Math.PI / 2;
        pastureMesh.position.set(
            (pasture.minX + pasture.maxX) / 2, 
            0.02, 
            (pasture.minZ + pasture.maxZ) / 2
        );
        pastureMesh.receiveShadow = true;
        this.scene.add(pastureMesh);
        pastureElements.push(pastureMesh);
        
        // Add comfort features
        this.addPastureComfortFeatures(pasture, pastureElements);
        
        return pastureElements;
    }
    
    createPenFencing(pasture, pastureElements, gate) {
        const fencePostGeometry = new THREE.CylinderGeometry(0.25, 0.25, 3.5, 8);
        const fencePostMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x5a4a3a,
            emissive: 0x1a0a00,
            emissiveIntensity: 0.05
        });
        
        const railMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x6a5a4a,
            emissive: 0x1a0a00,
            emissiveIntensity: 0.05
        });
        
        const postSpacing = 8;
        const railHeight1 = 1.2;
        const railHeight2 = 2.4;
        
        // Determine which side is the "back" based on gate direction
        const gateDirection = gate?.direction || 'north';
        let backZ, frontZ, isNorthFacing;
        
        if (gateDirection === 'north') {
            // North-facing gate: back is maxZ (away from field center)
            backZ = pasture.maxZ + 2;
            frontZ = pasture.minZ - 2; // Front connects to boundary fence
            isNorthFacing = true;
        } else if (gateDirection === 'south') {
            // South-facing gate: back is minZ (away from field center)
            backZ = pasture.minZ - 2;
            frontZ = pasture.maxZ + 2; // Front connects to boundary fence
            isNorthFacing = false;
        } else {
            // Default to north-facing for other directions
            backZ = pasture.maxZ + 2;
            frontZ = pasture.minZ - 2;
            isNorthFacing = true;
        }
        
        // Back fence (complete enclosure away from gate)
        for (let x = pasture.minX - 2; x <= pasture.maxX + 2; x += postSpacing) {
            const post = new THREE.Mesh(fencePostGeometry, fencePostMaterial);
            post.position.set(x, 1.75, backZ);
            post.castShadow = true;
            this.scene.add(post);
            pastureElements.push(post);
            
            // Add rails
            if (x < pasture.maxX + 2) {
                const rail1 = this.createFenceRail(x, backZ, x + postSpacing, backZ, railHeight1, railMaterial);
                const rail2 = this.createFenceRail(x, backZ, x + postSpacing, backZ, railHeight2, railMaterial);
                if (rail1) pastureElements.push(rail1);
                if (rail2) pastureElements.push(rail2);
            }
        }
        
        // Side fences - build from back to front
        const startZ = isNorthFacing ? pasture.maxZ + 2 : pasture.minZ - 2;
        const endZ = isNorthFacing ? pasture.minZ + 2 : pasture.maxZ - 2;
        const zStep = isNorthFacing ? -postSpacing : postSpacing;
        
        for (let z = startZ; isNorthFacing ? z > endZ : z < endZ; z += zStep) {
            // Left side
            const leftPost = new THREE.Mesh(fencePostGeometry, fencePostMaterial);
            leftPost.position.set(pasture.minX - 2, 1.75, z);
            leftPost.castShadow = true;
            this.scene.add(leftPost);
            pastureElements.push(leftPost);
            
            // Right side
            const rightPost = new THREE.Mesh(fencePostGeometry, fencePostMaterial);
            rightPost.position.set(pasture.maxX + 2, 1.75, z);
            rightPost.castShadow = true;
            this.scene.add(rightPost);
            pastureElements.push(rightPost);
            
            // Add rails if not at the end
            const nextZ = z + zStep;
            const shouldAddRails = isNorthFacing ? nextZ > endZ : nextZ < endZ;
            
            if (shouldAddRails) {
                // Left rails
                const leftRail1 = this.createFenceRail(pasture.minX - 2, z, pasture.minX - 2, nextZ, railHeight1, railMaterial);
                const leftRail2 = this.createFenceRail(pasture.minX - 2, z, pasture.minX - 2, nextZ, railHeight2, railMaterial);
                if (leftRail1) pastureElements.push(leftRail1);
                if (leftRail2) pastureElements.push(leftRail2);
                
                // Right rails
                const rightRail1 = this.createFenceRail(pasture.maxX + 2, z, pasture.maxX + 2, nextZ, railHeight1, railMaterial);
                const rightRail2 = this.createFenceRail(pasture.maxX + 2, z, pasture.maxX + 2, nextZ, railHeight2, railMaterial);
                if (rightRail1) pastureElements.push(rightRail1);
                if (rightRail2) pastureElements.push(rightRail2);
            }
        }
        
        // Add corner posts at the front (gate side) to connect with boundary fence
        const leftCornerPost = new THREE.Mesh(fencePostGeometry, fencePostMaterial);
        leftCornerPost.position.set(pasture.minX - 2, 1.75, endZ);
        leftCornerPost.castShadow = true;
        this.scene.add(leftCornerPost);
        pastureElements.push(leftCornerPost);
        
        const rightCornerPost = new THREE.Mesh(fencePostGeometry, fencePostMaterial);
        rightCornerPost.position.set(pasture.maxX + 2, 1.75, endZ);
        rightCornerPost.castShadow = true;
        this.scene.add(rightCornerPost);
        pastureElements.push(rightCornerPost);
        
        // NOTE: In competitive mode, the pasture fences connect to the boundary fence,
        // not to gate posts. The gate openings are handled by the boundary fence logic.
        // The old code that connected to hardcoded gate positions has been removed.
    }
    
    addPastureComfortFeatures(pasture, pastureElements) {
        // Add water trough
        const troughGeometry = new THREE.BoxGeometry(4, 0.8, 1.5);
        const troughMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x666666,
            emissive: 0x111111
        });
        const trough = new THREE.Mesh(troughGeometry, troughMaterial);
        trough.position.set(pasture.maxX - 5, 0.4, pasture.maxZ - 5);
        trough.castShadow = true;
        trough.receiveShadow = true;
        this.scene.add(trough);
        pastureElements.push(trough);
        
        // Add water surface
        const waterGeometry = new THREE.PlaneGeometry(3.8, 1.3);
        const waterMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x4488cc,
            transparent: true,
            opacity: 0.8,
            emissive: 0x002244,
            emissiveIntensity: 0.1
        });
        const water = new THREE.Mesh(waterGeometry, waterMaterial);
        water.rotation.x = -Math.PI / 2;
        water.position.set(pasture.maxX - 5, 0.81, pasture.maxZ - 5);
        this.scene.add(water);
        pastureElements.push(water);
        
        // Add hay bales for comfort
        const hayGeometry = new THREE.CylinderGeometry(1.5, 1.5, 1.2, 8);
        const hayMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xDAA520,
            emissive: 0x2a1a00,
            emissiveIntensity: 0.05
        });
        
        // Place several hay bales
        const hayPositions = [
            { x: pasture.minX + 5, z: pasture.maxZ - 8 },
            { x: pasture.maxX - 10, z: pasture.minZ + 8 },
            { x: (pasture.minX + pasture.maxX) / 2, z: pasture.maxZ - 12 }
        ];
        
        hayPositions.forEach(pos => {
            const hayBale = new THREE.Mesh(hayGeometry, hayMaterial);
            hayBale.position.set(pos.x, 0.6, pos.z);
            hayBale.rotation.z = Math.PI / 2; // Lay on side
            hayBale.castShadow = true;
            hayBale.receiveShadow = true;
            this.scene.add(hayBale);
            pastureElements.push(hayBale);
        });
        
        // Tree removed from pen area for better gameplay
    }
    
    /**
     * Blend two hex colors
     * @param {string} color1 - First color in hex format (#rrggbb)
     * @param {string} color2 - Second color in hex format (#rrggbb)
     * @param {number} ratio - Blend ratio (0-1, where 0 = color1, 1 = color2)
     * @returns {string} - Blended color in hex format
     */
    blendColors(color1, color2, ratio) {
        const hex = (color) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : null;
        };
        
        const rgb1 = hex(color1);
        const rgb2 = hex(color2);
        
        if (!rgb1 || !rgb2) return color1;
        
        const r = Math.round(rgb1.r * (1 - ratio) + rgb2.r * ratio);
        const g = Math.round(rgb1.g * (1 - ratio) + rgb2.g * ratio);
        const b = Math.round(rgb1.b * (1 - ratio) + rgb2.b * ratio);
        
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
} 