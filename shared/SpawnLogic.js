// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { Vector2D } from './Vector2D.js';
import { isWithinArea } from './BoundaryCollision.js';

/**
 * Sheep spawn placement (P3-GSV-SPLIT: moved verbatim from
 * GameStateValidation.js). Stateless and deterministic - no external
 * dependencies.
 */

/**
 * Generate initial sheep positions in a clustered formation
 * @param {number} sheepCount - Number of sheep to position
 * @param {Object} bounds - Field boundaries
 * @param {Object} config - Configuration options
 * @param {() => number} [rng=Math.random] - PRNG returning [0,1). Defaults to
 *   Math.random so existing callers + the client stay byte-identical. The
 *   Worker passes a per-game seeded mulberry32 so the spawn layout is
 *   reproducible for a given seed (variety still comes from a fresh seed
 *   per game). Forwarded to generateCompetitiveBalancedSpawns.
 * @returns {Array} - Array of initial positions
 */
export function generateInitialSheepPositions(sheepCount, bounds, config = {}, rng = Math.random) {
    const {
        spreadRadius = 30,
        centerX = -30,
        centerZ = -30,
        avoidAreas = [],
        competitiveMode = false,
        competitiveGates = [],
        // New options for competitive mode
        clusterCount = 1,
        clusterCenters = null
    } = config;
    
    const positions = [];
    
    // For competitive mode, use balanced cluster spawning
    if (competitiveMode && competitiveGates.length > 0) {
        return generateCompetitiveBalancedSpawns(sheepCount, bounds, competitiveGates, config, rng);
    }
    
    // Use cluster centers if provided, otherwise single center
    const centers = clusterCenters || [{ x: centerX, z: centerZ }];
    const sheepPerCluster = Math.ceil(sheepCount / centers.length);
    
    for (let clusterIndex = 0; clusterIndex < centers.length; clusterIndex++) {
        const center = centers[clusterIndex];
        const startIndex = clusterIndex * sheepPerCluster;
        const endIndex = Math.min(startIndex + sheepPerCluster, sheepCount);
        
        for (let i = startIndex; i < endIndex; i++) {
            let position;
            let attempts = 0;
            const maxAttempts = 50;
            
            do {
                // Random position in this cluster
                const angle = rng() * Math.PI * 2;
                const distance = rng() * spreadRadius;
                const x = center.x + Math.cos(angle) * distance;
                const z = center.z + Math.sin(angle) * distance;
                
                position = new Vector2D(x, z);
                attempts++;
                
                // Check if position is valid (within bounds and not in avoid areas)
                const withinBounds = position.x >= bounds.minX + 5 && 
                                    position.x <= bounds.maxX - 5 &&
                                    position.z >= bounds.minZ + 5 && 
                                    position.z <= bounds.maxZ - 5;
                
                let inAvoidArea = false;
                for (const area of avoidAreas) {
                    if (isWithinArea(position, area)) {
                        inAvoidArea = true;
                        break;
                    }
                }
                
                if (withinBounds && !inAvoidArea) {
                    break;
                }
                
            } while (attempts < maxAttempts);
            
            positions.push(position);
        }
    }
    
    return positions;
}

/**
 * Generate balanced sheep spawns for competitive mode
 * Creates multiple spawn clusters equidistant from all gates
 * @param {number} sheepCount - Number of sheep to spawn
 * @param {Object} bounds - Field boundaries
 * @param {Array} competitiveGates - Array of competitive gate configurations
 * @param {Object} config - Additional configuration
 * @param {() => number} [rng=Math.random] - PRNG returning [0,1). Defaults to
 *   Math.random for byte-identical legacy behavior; the Worker passes a
 *   per-game seeded mulberry32.
 * @returns {Array} - Array of balanced spawn positions
 */
export function generateCompetitiveBalancedSpawns(sheepCount, bounds, competitiveGates, config = {}, rng = Math.random) {
    const {
        spreadRadius = 25,
        minDistanceFromGates = 35,
        avoidAreas = []
    } = config;
    
    // Calculate spawn clusters that are equidistant from all gates
    const spawnClusters = calculateBalancedSpawnClusters(competitiveGates, bounds, minDistanceFromGates);
    
    const positions = [];
    const sheepPerCluster = Math.ceil(sheepCount / spawnClusters.length);
    
    console.log(`🐑 Generating competitive spawns: ${spawnClusters.length} clusters, ~${sheepPerCluster} sheep per cluster`);
    
    for (let clusterIndex = 0; clusterIndex < spawnClusters.length; clusterIndex++) {
        const cluster = spawnClusters[clusterIndex];
        const startIndex = clusterIndex * sheepPerCluster;
        const endIndex = Math.min(startIndex + sheepPerCluster, sheepCount);
        
        for (let i = startIndex; i < endIndex; i++) {
            let position;
            let attempts = 0;
            const maxAttempts = 50;
            
            do {
                // Random position within this cluster
                const angle = rng() * Math.PI * 2;
                const distance = rng() * spreadRadius;
                const x = cluster.x + Math.cos(angle) * distance;
                const z = cluster.z + Math.sin(angle) * distance;
                
                position = new Vector2D(x, z);
                attempts++;
                
                // Validate position
                const withinBounds = position.x >= bounds.minX + 5 && 
                                    position.x <= bounds.maxX - 5 &&
                                    position.z >= bounds.minZ + 5 && 
                                    position.z <= bounds.maxZ - 5;
                
                // Check distance from all gates
                let tooCloseToGates = false;
                for (const gate of competitiveGates) {
                    const distanceToGate = position.distanceTo(gate.position);
                    if (distanceToGate < minDistanceFromGates) {
                        tooCloseToGates = true;
                        break;
                    }
                }
                
                // Check avoid areas
                let inAvoidArea = false;
                for (const area of avoidAreas) {
                    if (isWithinArea(position, area)) {
                        inAvoidArea = true;
                        break;
                    }
                }
                
                if (withinBounds && !tooCloseToGates && !inAvoidArea) {
                    break;
                }
                
            } while (attempts < maxAttempts);
            
            positions.push(position);
        }
    }
    
    return positions;
}

/**
 * Calculate balanced spawn cluster positions for competitive mode
 * @param {Array} competitiveGates - Array of gate configurations
 * @param {Object} bounds - Field boundaries
 * @param {number} minDistanceFromGates - Minimum distance from any gate
 * @returns {Array} - Array of spawn cluster centers
 */
export function calculateBalancedSpawnClusters(competitiveGates, bounds, minDistanceFromGates = 35) {
    const clusters = [];
    
    if (competitiveGates.length === 2) {
        // 2 players: Create clusters in neutral areas
        clusters.push(
            { x: -50, z: 0, description: "West neutral zone" },
            { x: 50, z: 0, description: "East neutral zone" },
            { x: 0, z: -50, description: "South-center neutral zone" }
        );
    } else if (competitiveGates.length === 3) {
        // 3 players: Triangular formation with balanced distances from N/E/W gates
        clusters.push(
            { x: 0, z: 0, description: "Central cluster" },
            { x: -40, z: -20, description: "Southwest cluster" },
            { x: 40, z: -20, description: "Southeast cluster" },
            { x: 0, z: -50, description: "South cluster" }
        );
    } else if (competitiveGates.length === 4) {
        // 4 players: Diamond formation in center with balanced distances
        clusters.push(
            { x: 0, z: 0, description: "Center cluster" },
            { x: -30, z: -30, description: "Southwest cluster" },
            { x: 30, z: -30, description: "Southeast cluster" },
            { x: 0, z: -60, description: "South cluster" }
        );
    } else {
        // Fallback: single central cluster
        clusters.push({ x: 0, z: -30, description: "Default central cluster" });
    }
    
    // Validate and adjust clusters to ensure minimum distance from gates
    const validatedClusters = [];
    for (const cluster of clusters) {
        let adjustedCluster = { ...cluster };
        let isValid = false;
        let adjustmentAttempts = 0;
        
        while (!isValid && adjustmentAttempts < 10) {
            // Check distance from all gates
            let minDistanceFromAnyGate = Infinity;
            for (const gate of competitiveGates) {
                const distance = Math.sqrt(
                    (adjustedCluster.x - gate.position.x) ** 2 + 
                    (adjustedCluster.z - gate.position.z) ** 2
                );
                minDistanceFromAnyGate = Math.min(minDistanceFromAnyGate, distance);
            }
            
            // Also check if within bounds
            const withinBounds = adjustedCluster.x >= bounds.minX + 20 && 
                                adjustedCluster.x <= bounds.maxX - 20 &&
                                adjustedCluster.z >= bounds.minZ + 20 && 
                                adjustedCluster.z <= bounds.maxZ - 20;
            
            if (minDistanceFromAnyGate >= minDistanceFromGates && withinBounds) {
                isValid = true;
            } else {
                // Adjust position slightly toward center
                adjustedCluster.x *= 0.9;
                adjustedCluster.z *= 0.9;
                adjustmentAttempts++;
            }
        }
        
        if (isValid) {
            validatedClusters.push(adjustedCluster);
            console.log(`✅ Spawn cluster: ${cluster.description} at (${Math.round(adjustedCluster.x)}, ${Math.round(adjustedCluster.z)})`);
        } else {
            console.warn(`⚠️ Could not validate spawn cluster: ${cluster.description}`);
        }
    }
    
    // Ensure we have at least one cluster
    if (validatedClusters.length === 0) {
        console.warn('No valid spawn clusters found, using fallback center position');
        validatedClusters.push({ x: 0, z: -30, description: "Fallback center" });
    }
    
    return validatedClusters;
}
