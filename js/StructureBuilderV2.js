import * as THREE from 'three';
import { FencePresets, FenceConfigBuilder } from './FencePresets.js';

/**
 * StructureBuilderV2 - Enhanced structure builder with modular fence system
 * 
 * Improvements:
 * - Uses modular FencePresets for reusable components
 * - Properly handles 3-4 player configurations
 * - Fixes diagonal gate rendering issues
 * - Optimized geometry with instancing support
 */
export class StructureBuilderV2 {
    constructor(scene) {
        this.scene = scene;
        this.structures = {
            fences: [],
            gates: [],
            pastures: [],
            decorations: []
        };
        
        // Initialize modular fence system
        this.fencePresets = new FencePresets();
        this.fenceConfigBuilder = new FenceConfigBuilder(this.fencePresets);
    }
    
    /**
     * Clear all structures from scene
     */
    clearAllStructures() {
        console.log('[BUILD] Clearing all structures');
        
        Object.values(this.structures).forEach(structureArray => {
            structureArray.forEach(element => {
                if (element.parent) {
                    element.parent.remove(element);
                }
                
                // Dispose of geometries and materials
                if (element.geometry) element.geometry.dispose();
                if (element.material) {
                    if (Array.isArray(element.material)) {
                        element.material.forEach(mat => mat.dispose());
                    } else {
                        element.material.dispose();
                    }
                }
                
                // Recursively dispose children
                if (element.children) {
                    element.traverse(child => {
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach(mat => mat.dispose());
                            } else {
                                child.material.dispose();
                            }
                        }
                    });
                }
            });
            structureArray.length = 0;
        });
    }
    
    /**
     * Build structures for single player mode
     */
    buildSinglePlayerStructures(bounds, gate, pasture) {
        console.log('[BUILD] Building single player structures');
        
        this.clearAllStructures();
        
        // Build fences with integrated gate and pasture
        const fenceGroup = this.fenceConfigBuilder.buildSinglePlayerFences(bounds, gate, pasture);
        this.scene.add(fenceGroup);
        this.structures.fences.push(fenceGroup);
        
        // Add decorative elements
        this.addFieldDecorations(bounds);
        
        console.log('[OK] Single player structures built');
    }
    
    /**
     * Build structures for competitive multiplayer mode
     */
    buildCompetitiveStructures(bounds, competitiveGates) {
        console.log(`[BUILD] Building competitive structures for ${competitiveGates.length} players`);
        
        this.clearAllStructures();
        
        // Build fences with multiple gates
        const fenceGroup = this.fenceConfigBuilder.buildCompetitiveFences(bounds, competitiveGates);
        this.scene.add(fenceGroup);
        this.structures.fences.push(fenceGroup);
        
        // Create individual gate markers and pastures
        competitiveGates.forEach(gate => {
            this.createCompetitiveGateMarker(gate);
        });
        
        // Add field decorations
        this.addFieldDecorations(bounds);
        
        console.log('[OK] Competitive structures built');
    }
    
    
    /**
     * Create visual marker for competitive gate
     */
    createCompetitiveGateMarker(gate) {
        // No additional markers needed - gates have their own visual identity
        // Player colors are already shown on the gate structures themselves
    }
    
    /**
     * Create player label sprite
     */
    createPlayerLabel(x, y, z, playerId, parent) {
        // Create canvas for text
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        
        // Draw player label
        context.fillStyle = 'white';
        context.font = 'bold 48px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(`P${playerId}`, 64, 32);
        
        // Create sprite
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.set(x, y, z);
        sprite.scale.set(2, 1, 1);
        
        parent.add(sprite);
    }
    
    /**
     * Add decorative elements to the field
     */
    addFieldDecorations(bounds) {
        // Corner flags
        const cornerPositions = [
            { x: bounds.minX, z: bounds.minZ },
            { x: bounds.maxX, z: bounds.minZ },
            { x: bounds.maxX, z: bounds.maxZ },
            { x: bounds.minX, z: bounds.maxZ }
        ];
        
        cornerPositions.forEach(pos => {
            const flag = this.createCornerFlag(pos.x, pos.z);
            this.scene.add(flag);
            this.structures.decorations.push(flag);
        });
    }
    
    /**
     * Create corner flag decoration
     */
    createCornerFlag(x, z) {
        const group = new THREE.Group();
        
        // Flag pole
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 2, 6),
            new THREE.MeshPhongMaterial({ color: 0xffffff })
        );
        pole.position.y = 1;
        group.add(pole);
        
        // Flag
        const flagGeometry = new THREE.PlaneGeometry(0.5, 0.3);
        const flagMaterial = new THREE.MeshPhongMaterial({
            color: 0xff0000,
            side: THREE.DoubleSide,
            emissive: 0x440000,
            emissiveIntensity: 0.1
        });
        
        const flag = new THREE.Mesh(flagGeometry, flagMaterial);
        flag.position.set(0.25, 1.7, 0);
        group.add(flag);
        
        group.position.set(x, 0, z);
        return group;
    }
    
    
    /**
     * Create optimized fence system using instancing
     * For very large fields or many fences
     */
    createOptimizedFenceSystem(fenceSegments) {
        return this.fencePresets.createInstancedFenceSystem(fenceSegments);
    }
    
    /**
     * Update structures (for animations, etc)
     */
    update(deltaTime) {
        // Animate flags waving
        this.structures.decorations.forEach(decoration => {
            decoration.traverse(child => {
                if (child.geometry && child.geometry.type === 'PlaneGeometry' && child.material.color.r > 0.5) {
                    // Simple flag waving animation
                    child.rotation.z = Math.sin(Date.now() * 0.002) * 0.1;
                }
            });
        });
    }
}