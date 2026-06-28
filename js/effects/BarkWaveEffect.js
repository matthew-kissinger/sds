// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';

const ARC_SEGMENTS = 48;
const WAVE_COUNT = 3;
const WAVE_DURATION = 0.72;
const WAVE_DELAY = 0.08;
const WAVE_Y = 0.28;

function makeArcGeometry(minDot) {
    const halfAngle = Math.acos(minDot);
    const positions = [];
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
        const t = i / ARC_SEGMENTS;
        const a = -halfAngle + halfAngle * 2 * t;
        positions.push(Math.sin(a), WAVE_Y, Math.cos(a));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
}

function makeEdgeGeometry(minDot, side) {
    const halfAngle = Math.acos(minDot) * side;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        0, WAVE_Y, 0,
        Math.sin(halfAngle), WAVE_Y, Math.cos(halfAngle),
    ], 3));
    return geometry;
}

function makeMaterial(color, opacity) {
    return new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
    });
}

function disposeLine(line) {
    line.geometry?.dispose?.();
    line.material?.dispose?.();
}

export class BarkWaveEffect {
    constructor(sceneProvider) {
        this.sceneProvider = sceneProvider;
        this.root = new THREE.Group();
        this.root.name = 'BarkWaveEffect';
        this.scene = null;
        this.waves = [];
    }

    attach() {
        const scene = this.sceneProvider?.();
        if (!scene || scene === this.scene) return scene;
        if (this.root.parent) this.root.parent.remove(this.root);
        scene.add(this.root);
        this.scene = scene;
        return scene;
    }

    emit(position, forward, config) {
        if (!position || !forward || !config) return;
        if (!this.attach()) return;

        const group = new THREE.Group();
        group.name = 'BarkWave';
        group.position.set(position.x, 0, position.z);
        group.rotation.y = Math.atan2(forward.x, forward.z);

        const arcs = [];
        const edgeLines = [];
        for (let i = 0; i < WAVE_COUNT; i++) {
            const arc = new THREE.Line(makeArcGeometry(config.minDot), makeMaterial(0xf7f1e6, 0.42 - i * 0.08));
            const left = new THREE.Line(makeEdgeGeometry(config.minDot, -1), makeMaterial(0xe0a458, 0.22 - i * 0.04));
            const right = new THREE.Line(makeEdgeGeometry(config.minDot, 1), makeMaterial(0xe0a458, 0.22 - i * 0.04));
            arcs.push(arc);
            edgeLines.push(left, right);
            group.add(arc, left, right);
        }

        this.root.add(group);
        this.waves.push({
            group,
            arcs,
            edgeLines,
            age: 0,
            range: config.range,
        });
    }

    update(deltaTime) {
        this.attach();
        for (let i = this.waves.length - 1; i >= 0; i--) {
            const wave = this.waves[i];
            wave.age += deltaTime;

            let alive = false;
            for (let j = 0; j < wave.arcs.length; j++) {
                const localAge = wave.age - j * WAVE_DELAY;
                const lineSet = [wave.arcs[j], wave.edgeLines[j * 2], wave.edgeLines[j * 2 + 1]];
                if (localAge < 0) {
                    for (const line of lineSet) line.visible = false;
                    alive = true;
                    continue;
                }

                const t = Math.min(1, localAge / WAVE_DURATION);
                const eased = 1 - Math.pow(1 - t, 3);
                const radius = Math.max(0.01, wave.range * eased);
                const opacity = Math.max(0, (1 - t) * (0.48 - j * 0.08));
                for (const line of lineSet) {
                    line.visible = t < 1;
                    line.scale.set(radius, 1, radius);
                    line.material.opacity = opacity;
                }
                if (t < 1) alive = true;
            }

            if (!alive) {
                this.root.remove(wave.group);
                wave.group.traverse((obj) => {
                    if (obj.isLine) disposeLine(obj);
                });
                this.waves.splice(i, 1);
            }
        }
    }

    dispose() {
        for (const wave of this.waves) {
            this.root.remove(wave.group);
            wave.group.traverse((obj) => {
                if (obj.isLine) disposeLine(obj);
            });
        }
        this.waves = [];
        if (this.root.parent) this.root.parent.remove(this.root);
        this.scene = null;
    }
}
