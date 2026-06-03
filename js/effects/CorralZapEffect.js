// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * CorralZapEffect — lightning bolt + particle burst when a sheep enters
 * the corral. The sheep gets "zapped into the sky" before its retirement
 * animation flies it to its grazing target inside the corral.
 *
 * One persistent group hosts a pool of reusable effects. fire(pos) checks
 * out a free slot, animates over ~1.5s, returns it to the pool. Pool
 * size is small (~8) — corral entry is rare enough that we never run out.
 */
import * as THREE from 'three';
import { createKonveyorEffectMaterial } from './konveyorEffectMaterialAdapter.js';

const POOL_SIZE = 8;
// Lengths bumped from the v1 (1.5s / 0.25s) — playtest 2026-04-25 said the
// flash was too short. Now: ~2.4s total, ~0.7s of bright flicker.
const EFFECT_DURATION = 2.4;       // seconds total
const FLASH_DURATION = 0.7;        // bright lightning flicker
const BOLT_SEGMENTS = 14;          // zigzag segments
const BOLT_HEIGHT = 60;            // metres up from sheep — bolt reaches into the sky
const BOLT_JITTER = 1.0;           // metres of horizontal jitter per segment
const PARTICLE_COUNT = 36;
const PARTICLE_SPEED = 8;          // metres/sec initial outward speed
const PARTICLE_GRAVITY = -8;       // metres/sec² downward

class _Effect {
    constructor(scene, options = {}) {
        // Lightning bolt — LineSegments, zigzag pattern
        const boltGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(BOLT_SEGMENTS * 2 * 3);  // each segment is 2 verts x 3 axes
        boltGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const boltMaterialResult = createKonveyorEffectMaterial('corral-zap-bolt', 'createCorralZapBoltMaterial', {
            createDefaultMaterial: () => new THREE.LineBasicMaterial({
                color: 0xeaffff,
                transparent: true,
                opacity: 0,
                linewidth: 2,
                depthWrite: false,
            }),
            search: options.search,
            factories: options.konveyorEffectFactories,
            context: {
                color: new THREE.Color(0xeaffff),
                opacity: 0,
                linewidth: 2,
                depthWrite: false,
                boltSegments: BOLT_SEGMENTS,
                boltHeight: BOLT_HEIGHT,
                boltJitter: BOLT_JITTER,
            },
        });
        const boltMat = boltMaterialResult.material;
        this.boltMaterialControls = boltMaterialResult.controls;
        this.konveyorBoltMaterialSummary = boltMaterialResult.summary;
        this.bolt = new THREE.LineSegments(boltGeo, boltMat);
        this.bolt.frustumCulled = false;
        scene.add(this.bolt);

        // Particle burst — Points with per-particle velocities tracked in CPU
        const partGeo = new THREE.BufferGeometry();
        this._partPositions = new Float32Array(PARTICLE_COUNT * 3);
        this._partVelocities = new Float32Array(PARTICLE_COUNT * 3);
        partGeo.setAttribute('position', new THREE.BufferAttribute(this._partPositions, 3));
        const particleMaterialResult = createKonveyorEffectMaterial('corral-zap-particles', 'createCorralZapParticleMaterial', {
            createDefaultMaterial: () => new THREE.PointsMaterial({
                color: 0xc8efff,
                size: 0.6,
                transparent: true,
                opacity: 0,
                depthWrite: false,
                sizeAttenuation: true,
            }),
            search: options.search,
            factories: options.konveyorEffectFactories,
            context: {
                color: new THREE.Color(0xc8efff),
                size: 0.6,
                opacity: 0,
                depthWrite: false,
                sizeAttenuation: true,
                particleCount: PARTICLE_COUNT,
                particleSpeed: PARTICLE_SPEED,
                particleGravity: PARTICLE_GRAVITY,
            },
        });
        const partMat = particleMaterialResult.material;
        this.particleMaterialControls = particleMaterialResult.controls;
        this.konveyorParticleMaterialSummary = particleMaterialResult.summary;
        this.particles = new THREE.Points(partGeo, partMat);
        this.particles.frustumCulled = false;
        scene.add(this.particles);

        this.active = false;
        this.elapsed = 0;
        this.origin = new THREE.Vector3();
    }

    _setBoltOpacity(opacity) {
        if (this.boltMaterialControls?.update) {
            this.boltMaterialControls.update({ opacity, material: this.bolt.material });
        } else {
            this.bolt.material.opacity = opacity;
        }
    }

    _setParticleOpacity(opacity) {
        if (this.particleMaterialControls?.update) {
            this.particleMaterialControls.update({ opacity, material: this.particles.material });
        } else {
            this.particles.material.opacity = opacity;
        }
    }

    /**
     * Cycle 7: fire a small "ascend top" spark — particle-only burst, no
     * lightning bolt. Used to mark the moment a retiring sheep finishes
     * tracing the bolt upward and vanishes. Reuses the same particle
     * pool but skips the bolt geometry rebuild.
     */
    fireSpark(pos) {
        this.active = true;
        this.elapsed = FLASH_DURATION; // skip the bolt-flash phase entirely
        this.origin.copy(pos);
        // Bolt opacity stays 0 — no lightning for the spark.
        this._setBoltOpacity(0);
        // Tighter, more upward-biased particle burst at the top.
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const i3 = i * 3;
            this._partPositions[i3 + 0] = pos.x;
            this._partPositions[i3 + 1] = pos.y;
            this._partPositions[i3 + 2] = pos.z;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(0.6 + Math.random() * 0.4); // strongly upward
            const sinPhi = Math.sin(phi);
            const speed = PARTICLE_SPEED * 0.6;
            this._partVelocities[i3 + 0] = Math.cos(theta) * sinPhi * speed;
            this._partVelocities[i3 + 1] = Math.cos(phi) * speed;
            this._partVelocities[i3 + 2] = Math.sin(theta) * sinPhi * speed;
        }
        this.particles.geometry.attributes.position.needsUpdate = true;
        this._setParticleOpacity(1.0);
    }

    fire(pos) {
        this.active = true;
        this.elapsed = 0;
        this.origin.copy(pos);

        // Build initial bolt geometry: zigzag from sky down to origin
        const positions = this.bolt.geometry.attributes.position.array;
        let prevX = pos.x;
        let prevY = pos.y + BOLT_HEIGHT;
        let prevZ = pos.z;
        for (let i = 0; i < BOLT_SEGMENTS; i++) {
            const t = (i + 1) / BOLT_SEGMENTS;
            const segY = pos.y + BOLT_HEIGHT * (1 - t);
            const jitterScale = (1 - t) * BOLT_JITTER;  // less jitter near the impact
            const segX = pos.x + (Math.random() - 0.5) * jitterScale * 2;
            const segZ = pos.z + (Math.random() - 0.5) * jitterScale * 2;
            const i6 = i * 6;
            positions[i6 + 0] = prevX;
            positions[i6 + 1] = prevY;
            positions[i6 + 2] = prevZ;
            positions[i6 + 3] = segX;
            positions[i6 + 4] = segY;
            positions[i6 + 5] = segZ;
            prevX = segX; prevY = segY; prevZ = segZ;
        }
        this.bolt.geometry.attributes.position.needsUpdate = true;
        this._setBoltOpacity(1.0);

        // Particles burst from the impact point with random outward velocities
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const i3 = i * 3;
            this._partPositions[i3 + 0] = pos.x;
            this._partPositions[i3 + 1] = pos.y + 0.3;
            this._partPositions[i3 + 2] = pos.z;

            // Random unit vector, biased upward
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(0.3 + Math.random() * 0.7);  // mostly upper hemisphere
            const sinPhi = Math.sin(phi);
            this._partVelocities[i3 + 0] = Math.cos(theta) * sinPhi * PARTICLE_SPEED;
            this._partVelocities[i3 + 1] = Math.cos(phi) * PARTICLE_SPEED;
            this._partVelocities[i3 + 2] = Math.sin(theta) * sinPhi * PARTICLE_SPEED;
        }
        this.particles.geometry.attributes.position.needsUpdate = true;
        this._setParticleOpacity(1.0);
    }

    update(dt) {
        if (!this.active) return;
        this.elapsed += dt;
        if (this.elapsed >= EFFECT_DURATION) {
            this.active = false;
            this._setBoltOpacity(0);
            this._setParticleOpacity(0);
            return;
        }

        // Lightning fades out over FLASH_DURATION; flicker while visible.
        // Re-randomise the bolt path every few frames for a crackling feel.
        if (this.elapsed < FLASH_DURATION) {
            const flashT = this.elapsed / FLASH_DURATION;
            this._setBoltOpacity((0.4 + Math.cos(flashT * 22) * 0.4) * (1 - flashT * 0.5));
            // Re-jitter mid-segments every few frames
            if (Math.random() < 0.4) {
                const positions = this.bolt.geometry.attributes.position.array;
                for (let i = 1; i < BOLT_SEGMENTS - 1; i++) {
                    const i6 = i * 6;
                    const t = (i + 1) / BOLT_SEGMENTS;
                    const jitterScale = (1 - t) * BOLT_JITTER;
                    // Re-randomise the segment endpoint while keeping y on the bolt line
                    positions[i6 + 3] = this.origin.x + (Math.random() - 0.5) * jitterScale * 2;
                    positions[i6 + 5] = this.origin.z + (Math.random() - 0.5) * jitterScale * 2;
                    // Next segment's start matches this segment's end
                    if (i + 1 < BOLT_SEGMENTS) {
                        positions[(i + 1) * 6 + 0] = positions[i6 + 3];
                        positions[(i + 1) * 6 + 2] = positions[i6 + 5];
                    }
                }
                this.bolt.geometry.attributes.position.needsUpdate = true;
            }
        } else {
            this._setBoltOpacity(0);
        }

        // Particles: integrate ballistically, fade
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const i3 = i * 3;
            this._partVelocities[i3 + 1] += PARTICLE_GRAVITY * dt;
            this._partPositions[i3 + 0] += this._partVelocities[i3 + 0] * dt;
            this._partPositions[i3 + 1] += this._partVelocities[i3 + 1] * dt;
            this._partPositions[i3 + 2] += this._partVelocities[i3 + 2] * dt;
        }
        this.particles.geometry.attributes.position.needsUpdate = true;
        const partT = this.elapsed / EFFECT_DURATION;
        this._setParticleOpacity(Math.max(0, 1 - partT * partT));
    }

    dispose() {
        this.bolt.geometry.dispose();
        this.bolt.material.dispose();
        this.particles.geometry.dispose();
        this.particles.material.dispose();
    }
}

export class CorralZapEffectPool {
    /**
     * @param {THREE.Scene} scene
     */
    constructor(scene, options = {}) {
        this.scene = scene;
        this.effects = [];
        for (let i = 0; i < POOL_SIZE; i++) {
            this.effects.push(new _Effect(scene, options));
        }
    }

    /**
     * Fire a zap at a world position. If all pool slots are busy, the
     * oldest one is reused (reasonable trade-off for a many-sheep burst).
     * @param {{x: number, y?: number, z: number}} pos
     */
    fire(pos) {
        let target = this.effects.find(e => !e.active);
        if (!target) {
            // Reuse the oldest effect (largest elapsed)
            target = this.effects.reduce((a, b) => (a.elapsed > b.elapsed ? a : b));
        }
        const p = new THREE.Vector3(pos.x, pos.y ?? 0, pos.z);
        target.fire(p);
    }

    /**
     * Cycle 7: top-of-bolt spark when a retiring sheep finishes its ascent.
     * Particle-only burst (no lightning bolt rebuild).
     */
    fireSpark(pos) {
        let target = this.effects.find(e => !e.active);
        if (!target) {
            target = this.effects.reduce((a, b) => (a.elapsed > b.elapsed ? a : b));
        }
        const p = new THREE.Vector3(pos.x, pos.y ?? 0, pos.z);
        target.fireSpark(p);
    }

    update(dt) {
        for (const e of this.effects) e.update(dt);
    }

    dispose() {
        for (const e of this.effects) {
            this.scene.remove(e.bolt);
            this.scene.remove(e.particles);
            e.dispose();
        }
        this.effects.length = 0;
    }
}
