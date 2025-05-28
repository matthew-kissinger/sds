import * as THREE from 'three';

/**
 * StructureBuilder - Handles fences, gates, and pasture structures
 */
export class StructureBuilder {
    constructor(scene) {
        this.scene = scene;
    }
    
    createFieldBoundaryFence(bounds, gate) {
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
            fencePosts.push({x: bounds.minX, z: z, type: 'left'});
        }
        
        // Right edge (x = 100)
        for (let z = bounds.minZ; z <= bounds.maxZ; z += postSpacing) {
            const post = new THREE.Mesh(postGeometry, postMaterial);
            post.position.set(bounds.maxX, postHeight/2, z);
            post.castShadow = true;
            post.receiveShadow = true;
            this.scene.add(post);
            fencePosts.push({x: bounds.maxX, z: z, type: 'right'});
        }
        
        // Add horizontal rails between posts
        // Bottom edge rails
        for (let x = bounds.minX; x < bounds.maxX; x += postSpacing) {
            this.createFenceRail(x, bounds.minZ, x + postSpacing, bounds.minZ, railHeight1, railMaterial);
            this.createFenceRail(x, bounds.minZ, x + postSpacing, bounds.minZ, railHeight2, railMaterial);
        }
        
        // Top edge rails - connect to gate posts properly
        const gateLeftPost = gate.position.x - gate.width/2;
        const gateRightPost = gate.position.x + gate.width/2;
        
        for (let x = bounds.minX; x < bounds.maxX; x += postSpacing) {
            const nextX = x + postSpacing;
            
            // Left side of gate - connect to left gate post
            if (nextX <= gateLeftPost + 1) {
                const endX = (nextX > gateLeftPost - 1) ? gateLeftPost : nextX;
                this.createFenceRail(x, bounds.maxZ, endX, bounds.maxZ, railHeight1, railMaterial);
                this.createFenceRail(x, bounds.maxZ, endX, bounds.maxZ, railHeight2, railMaterial);
            }
            
            // Right side of gate - connect from right gate post
            if (x >= gateRightPost - 1) {
                const startX = (x < gateRightPost + 1) ? gateRightPost : x;
                this.createFenceRail(startX, bounds.maxZ, nextX, bounds.maxZ, railHeight1, railMaterial);
                this.createFenceRail(startX, bounds.maxZ, nextX, bounds.maxZ, railHeight2, railMaterial);
            }
        }
        
        // Left edge rails
        for (let z = bounds.minZ; z < bounds.maxZ; z += postSpacing) {
            this.createFenceRail(bounds.minX, z, bounds.minX, z + postSpacing, railHeight1, railMaterial);
            this.createFenceRail(bounds.minX, z, bounds.minX, z + postSpacing, railHeight2, railMaterial);
        }
        
        // Right edge rails
        for (let z = bounds.minZ; z < bounds.maxZ; z += postSpacing) {
            this.createFenceRail(bounds.maxX, z, bounds.maxX, z + postSpacing, railHeight1, railMaterial);
            this.createFenceRail(bounds.maxX, z, bounds.maxX, z + postSpacing, railHeight2, railMaterial);
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
        
        // Create gate posts - taller and more prominent
        const postGeometry = new THREE.CylinderGeometry(0.4, 0.4, gate.height + 1, 8);
        const postMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x4a3c28,
            emissive: 0x1a0a00,
            emissiveIntensity: 0.1
        });
        
        // Left post
        const leftPost = new THREE.Mesh(postGeometry, postMaterial);
        leftPost.position.set(gate.position.x - gate.width/2, (gate.height + 1)/2, gate.position.z);
        leftPost.castShadow = true;
        leftPost.receiveShadow = true;
        this.scene.add(leftPost);
        gateElements.push(leftPost);
        
        // Right post
        const rightPost = new THREE.Mesh(postGeometry, postMaterial);
        rightPost.position.set(gate.position.x + gate.width/2, (gate.height + 1)/2, gate.position.z);
        rightPost.castShadow = true;
        rightPost.receiveShadow = true;
        this.scene.add(rightPost);
        gateElements.push(rightPost);
        
        // Decorative gate arch
        const archGeometry = new THREE.CylinderGeometry(0.2, 0.2, gate.width + 1, 8);
        const archMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x6a5a4a,
            emissive: 0x2a1a00,
            emissiveIntensity: 0.1
        });
        
        const arch = new THREE.Mesh(archGeometry, archMaterial);
        arch.position.set(gate.position.x, gate.height + 0.5, gate.position.z);
        arch.rotation.z = Math.PI / 2;
        arch.castShadow = true;
        this.scene.add(arch);
        gateElements.push(arch);
        
        // Gate threshold marker (on ground) - more prominent
        const thresholdGeometry = new THREE.BoxGeometry(gate.width + 2, 0.15, 3);
        const thresholdMaterial = new THREE.MeshPhongMaterial({ 
            color: 0xFFD700, // Gold
            emissive: 0x806000,
            emissiveIntensity: 0.3
        });
        
        const threshold = new THREE.Mesh(thresholdGeometry, thresholdMaterial);
        threshold.position.set(gate.position.x, 0.075, gate.position.z);
        this.scene.add(threshold);
        gateElements.push(threshold);
        
        // Add welcome sign above gate
        this.createWelcomeSign(gate.position.x, gate.height + 1.5, gate.position.z - 1);
        
        // Create enhanced pasture area
        const pastureElements = this.createEnhancedPasture(pasture, gate);
        
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
    
    createEnhancedPasture(pasture, gate) {
        const pastureElements = [];
        
        // Create a more enclosed pen with proper fencing
        this.createPenFencing(pasture, pastureElements);
        
        // Enhanced pasture ground with better texture
        const pastureGeometry = new THREE.PlaneGeometry(
            pasture.maxX - pasture.minX + 4, 
            pasture.maxZ - pasture.minZ + 4
        );
        
        // Create enhanced pasture texture
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const context = canvas.getContext('2d');
        
        // Rich, comfortable grass for sleeping pasture
        const gradient = context.createRadialGradient(512, 512, 0, 512, 512, 512);
        gradient.addColorStop(0, '#6a8a5a');
        gradient.addColorStop(0.5, '#5a7a4a');
        gradient.addColorStop(1, '#4a6a3a');
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
    
    createPenFencing(pasture, pastureElements) {
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
        
        // Back fence (complete enclosure)
        for (let x = pasture.minX - 2; x <= pasture.maxX + 2; x += postSpacing) {
            const post = new THREE.Mesh(fencePostGeometry, fencePostMaterial);
            post.position.set(x, 1.75, pasture.maxZ + 2);
            post.castShadow = true;
            this.scene.add(post);
            pastureElements.push(post);
            
            // Add rails
            if (x < pasture.maxX + 2) {
                this.createFenceRail(x, pasture.maxZ + 2, x + postSpacing, pasture.maxZ + 2, railHeight1, railMaterial);
                this.createFenceRail(x, pasture.maxZ + 2, x + postSpacing, pasture.maxZ + 2, railHeight2, railMaterial);
            }
        }
        
        // Side fences (left and right) - stop at the boundary fence line
        for (let z = pasture.maxZ + 2; z > pasture.minZ + 2; z -= postSpacing) {
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
            
            // Add rails
            if (z > pasture.minZ + 2) {
                this.createFenceRail(pasture.minX - 2, z, pasture.minX - 2, z - postSpacing, railHeight1, railMaterial);
                this.createFenceRail(pasture.minX - 2, z, pasture.minX - 2, z - postSpacing, railHeight2, railMaterial);
                this.createFenceRail(pasture.maxX + 2, z, pasture.maxX + 2, z - postSpacing, railHeight1, railMaterial);
                this.createFenceRail(pasture.maxX + 2, z, pasture.maxX + 2, z - postSpacing, railHeight2, railMaterial);
            }
        }
        
        // Add corner posts to connect with boundary fence
        // Left corner post
        const leftCornerPost = new THREE.Mesh(fencePostGeometry, fencePostMaterial);
        leftCornerPost.position.set(pasture.minX - 2, 1.75, pasture.minZ + 2);
        leftCornerPost.castShadow = true;
        this.scene.add(leftCornerPost);
        pastureElements.push(leftCornerPost);
        
        // Right corner post  
        const rightCornerPost = new THREE.Mesh(fencePostGeometry, fencePostMaterial);
        rightCornerPost.position.set(pasture.maxX + 2, 1.75, pasture.minZ + 2);
        rightCornerPost.castShadow = true;
        this.scene.add(rightCornerPost);
        pastureElements.push(rightCornerPost);
        
        // Connect corner posts to the last side fence posts
        const lastSideZ = pasture.minZ + 2 + postSpacing;
        this.createFenceRail(pasture.minX - 2, lastSideZ, pasture.minX - 2, pasture.minZ + 2, railHeight1, railMaterial);
        this.createFenceRail(pasture.minX - 2, lastSideZ, pasture.minX - 2, pasture.minZ + 2, railHeight2, railMaterial);
        this.createFenceRail(pasture.maxX + 2, lastSideZ, pasture.maxX + 2, pasture.minZ + 2, railHeight1, railMaterial);
        this.createFenceRail(pasture.maxX + 2, lastSideZ, pasture.maxX + 2, pasture.minZ + 2, railHeight2, railMaterial);
        
        // Connect the nearest boundary fence posts to gate posts to close the gaps
        const gateLeftPost = -4; // Gate left post position (gate width/2 = 4)
        const gateRightPost = 4; // Gate right post position (gate width/2 = 4)
        const gateZ = 100; // Gate is at z = 100
        
        // The nearest boundary fence posts to the gate are at x = -10 and x = +10
        const nearestLeftBoundaryPost = -10;
        const nearestRightBoundaryPost = 10;
        const boundaryZ = 100; // Boundary fence is at z = 100
        
        // Left side connection from nearest boundary post to gate post
        this.createFenceRail(nearestLeftBoundaryPost, boundaryZ, gateLeftPost, gateZ, railHeight1, railMaterial);
        this.createFenceRail(nearestLeftBoundaryPost, boundaryZ, gateLeftPost, gateZ, railHeight2, railMaterial);
        
        // Right side connection from nearest boundary post to gate post
        this.createFenceRail(nearestRightBoundaryPost, boundaryZ, gateRightPost, gateZ, railHeight1, railMaterial);
        this.createFenceRail(nearestRightBoundaryPost, boundaryZ, gateRightPost, gateZ, railHeight2, railMaterial);
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
} 