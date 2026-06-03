// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';

/**
 * TwoPlayerCamera - Dynamic camera that keeps both players in view
 * Smoothly adjusts zoom and position to frame both players
 */
export class TwoPlayerCamera {
    constructor(camera) {
        this.camera = camera;

        // Camera settings
        this.minDistance = 40;   // Minimum camera distance when players are close
        this.maxDistance = 180;  // Maximum camera distance when players are far apart
        this.padding = 25;       // Extra padding around players in view (world units; ~25 suits a 200x200 field)
        this.heightRatio = 1.0;  // Camera height relative to distance

        // Smoothing
        this.positionLerpSpeed = 0.05;  // How fast camera position follows
        this.zoomLerpSpeed = 0.03;      // How fast camera zooms

        // Current state
        this.currentCenter = new THREE.Vector3(0, 0, 0);
        this.currentDistance = 80;
        this.targetDistance = 80;

        // Player references
        this.player1Position = null;
        this.player2Position = null;
    }

    /**
     * Update camera to frame both players
     * @param {THREE.Vector3|Object} player1Pos - Player 1 position (or object with x, z)
     * @param {THREE.Vector3|Object} player2Pos - Player 2 position (or object with x, z)
     * @param {number} deltaTime - Time since last frame (optional, for consistent smoothing)
     */
    update(player1Pos, player2Pos, deltaTime = 0.016) {
        if (!player1Pos || !player2Pos) return;

        // Extract positions (handle both THREE.Vector3 and plain objects)
        const p1x = player1Pos.x ?? player1Pos.position?.x ?? 0;
        const p1z = player1Pos.z ?? player1Pos.position?.z ?? 0;
        const p2x = player2Pos.x ?? player2Pos.position?.x ?? 0;
        const p2z = player2Pos.z ?? player2Pos.position?.z ?? 0;

        // Calculate center point between players
        const centerX = (p1x + p2x) / 2;
        const centerZ = (p1z + p2z) / 2;

        // Calculate distance between players
        const playerDistance = Math.sqrt(
            Math.pow(p2x - p1x, 2) + Math.pow(p2z - p1z, 2)
        );

        // Calculate required camera distance based on player separation
        // Using basic trigonometry: we want both players in frame with padding
        const fov = this.camera.fov * (Math.PI / 180);
        const aspect = this.camera.aspect;

        // Calculate the required distance to fit both players in view
        // Consider both horizontal and vertical FOV
        const horizontalFOV = 2 * Math.atan(Math.tan(fov / 2) * aspect);
        const requiredDistH = (playerDistance / 2 + this.padding) / Math.tan(horizontalFOV / 2);
        const requiredDistV = (playerDistance / 2 + this.padding) / Math.tan(fov / 2);

        // Use the larger of the two to ensure both players fit
        const requiredDistance = Math.max(requiredDistH, requiredDistV);

        // Clamp to min/max bounds
        this.targetDistance = Math.max(
            this.minDistance,
            Math.min(this.maxDistance, requiredDistance)
        );

        // Smooth interpolation for camera distance
        const zoomLerp = 1 - Math.pow(1 - this.zoomLerpSpeed, deltaTime * 60);
        this.currentDistance += (this.targetDistance - this.currentDistance) * zoomLerp;

        // Smooth interpolation for center position
        const posLerp = 1 - Math.pow(1 - this.positionLerpSpeed, deltaTime * 60);
        this.currentCenter.x += (centerX - this.currentCenter.x) * posLerp;
        this.currentCenter.z += (centerZ - this.currentCenter.z) * posLerp;

        // Calculate camera position (isometric-style view from above and behind)
        const cameraOffset = new THREE.Vector3(
            0,
            this.currentDistance * this.heightRatio,
            -this.currentDistance
        );

        // Update camera position
        this.camera.position.set(
            this.currentCenter.x + cameraOffset.x,
            cameraOffset.y,
            this.currentCenter.z + cameraOffset.z
        );

        // Look at the center point (slightly above ground)
        this.camera.lookAt(this.currentCenter.x, 0, this.currentCenter.z);
    }

    /**
     * Instantly set camera position (no smoothing)
     */
    setImmediate(player1Pos, player2Pos) {
        if (!player1Pos || !player2Pos) return;

        const p1x = player1Pos.x ?? player1Pos.position?.x ?? 0;
        const p1z = player1Pos.z ?? player1Pos.position?.z ?? 0;
        const p2x = player2Pos.x ?? player2Pos.position?.x ?? 0;
        const p2z = player2Pos.z ?? player2Pos.position?.z ?? 0;

        // Set center immediately
        this.currentCenter.x = (p1x + p2x) / 2;
        this.currentCenter.z = (p1z + p2z) / 2;

        // Calculate and set distance immediately
        const playerDistance = Math.sqrt(
            Math.pow(p2x - p1x, 2) + Math.pow(p2z - p1z, 2)
        );

        const fov = this.camera.fov * (Math.PI / 180);
        const aspect = this.camera.aspect;
        const horizontalFOV = 2 * Math.atan(Math.tan(fov / 2) * aspect);
        const requiredDistH = (playerDistance / 2 + this.padding) / Math.tan(horizontalFOV / 2);
        const requiredDistV = (playerDistance / 2 + this.padding) / Math.tan(fov / 2);
        const requiredDistance = Math.max(requiredDistH, requiredDistV);

        this.currentDistance = Math.max(
            this.minDistance,
            Math.min(this.maxDistance, requiredDistance)
        );
        this.targetDistance = this.currentDistance;

        // Apply immediately
        const cameraOffset = new THREE.Vector3(
            0,
            this.currentDistance * this.heightRatio,
            -this.currentDistance
        );

        this.camera.position.set(
            this.currentCenter.x + cameraOffset.x,
            cameraOffset.y,
            this.currentCenter.z + cameraOffset.z
        );

        this.camera.lookAt(this.currentCenter.x, 0, this.currentCenter.z);
    }

    /**
     * Get current camera distance
     */
    getDistance() {
        return this.currentDistance;
    }

    /**
     * Get current center point
     */
    getCenter() {
        return this.currentCenter.clone();
    }

    /**
     * Set minimum camera distance
     */
    setMinDistance(distance) {
        this.minDistance = distance;
    }

    /**
     * Set maximum camera distance
     */
    setMaxDistance(distance) {
        this.maxDistance = distance;
    }

    /**
     * Set padding around players
     */
    setPadding(padding) {
        this.padding = padding;
    }

    /**
     * Reset to default settings
     */
    reset() {
        this.currentCenter.set(0, 0, 0);
        this.currentDistance = 80;
        this.targetDistance = 80;
    }
}
