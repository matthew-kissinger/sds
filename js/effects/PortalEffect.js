/**
 * PortalEffect — magical vertical portal at the corral center.
 *
 * Cycle 6 Phase 4: replaces Open Country's gate+pasture coastal pen with
 * a persistent magical-portal visual. Sheep that enter the corral trigger
 * the existing vertical-ascent retirement (OptimizedSheep.checkCorralAndRetire);
 * the portal also pulses on each entry as visual feedback.
 *
 * Visual (always on):
 *   - Slowly rotating torus ring at ground level (cyan-purple gradient)
 *   - Vertical column of upward-streaking particles
 *   - Soft glowing disc at the base
 *
 * Visual (per retirement):
 *   - Brief brightness pulse on the ring + particle burst spawn rate spike
 *
 * One PortalEffect instance per scene (not a pool — there's only ever one
 * portal). main.js owns the instance and forwards dt and 'corral-retired'
 * events to it.
 */
import * as THREE from 'three';

const PARTICLE_COUNT = 96;
const COLUMN_HEIGHT = 22;     // matches sheep ascent height in OptimizedSheep
const COLUMN_RADIUS = 1.2;    // narrow vertical streak
const RING_RADIUS_OUTER = 5.5;
const RING_RADIUS_INNER = 4.2;
const RISE_SPEED = 6.5;       // m/s base particle rise
const PULSE_DURATION = 1.0;   // seconds — brightness flare on retirement

/**
 * GLSL ring shader: radial cyan→purple gradient, additive rim glow,
 * slow phase rotation. Single material reused for the rotating ring mesh.
 */
function makeRingMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uPulse: { value: 0 },
            uColorInner: { value: new THREE.Color(0x6cf2ff) },
            uColorOuter: { value: new THREE.Color(0x9b6cff) },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */`
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: /* glsl */`
            uniform float uTime;
            uniform float uPulse;
            uniform vec3 uColorInner;
            uniform vec3 uColorOuter;
            varying vec2 vUv;

            void main() {
                // Radial position within the ring's UV (0 = inner edge, 1 = outer)
                float r = vUv.y;
                // Tangential phase rotates slowly around the ring
                float phase = vUv.x * 6.2831853 + uTime * 0.9;
                vec3 col = mix(uColorInner, uColorOuter, r);
                float base = 0.55 + 0.35 * sin(phase);
                float pulseGlow = uPulse * (1.0 - smoothstep(0.0, 1.0, abs(r - 0.5) * 2.0));
                float intensity = base + pulseGlow * 0.9;
                // Fade toward inner/outer edges so the ring reads as a band
                float edge = smoothstep(0.0, 0.18, r) * smoothstep(1.0, 0.82, r);
                gl_FragColor = vec4(col * intensity, intensity * edge);
            }
        `,
    });
}

export class PortalEffect {
    /**
     * @param {THREE.Scene} scene
     * @param {{x: number, z: number}} center  World-space center of the corral.
     * @param {number} [groundY=0]            Terrain Y at the center (so the
     *                                        portal sits flush with the land).
     */
    constructor(scene, center, groundY = 0) {
        this.scene = scene;
        this.center = { x: center.x, z: center.z };
        this.groundY = groundY;
        this.elapsed = 0;
        this.pulseT = 0;

        // Ring at ground level — flat torus-like band
        const ringGeo = new THREE.RingGeometry(RING_RADIUS_INNER, RING_RADIUS_OUTER, 64, 1);
        this.ringMaterial = makeRingMaterial();
        this.ring = new THREE.Mesh(ringGeo, this.ringMaterial);
        this.ring.rotation.x = -Math.PI / 2;
        this.ring.position.set(center.x, groundY + 0.06, center.z);
        this.ring.renderOrder = 5; // draw over grass
        scene.add(this.ring);

        // Soft glowing disc at the base — a fainter inner pad
        const padGeo = new THREE.CircleGeometry(RING_RADIUS_INNER * 0.95, 48);
        const padMat = new THREE.MeshBasicMaterial({
            color: 0x6cf2ff,
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        this.pad = new THREE.Mesh(padGeo, padMat);
        this.pad.rotation.x = -Math.PI / 2;
        this.pad.position.set(center.x, groundY + 0.04, center.z);
        scene.add(this.pad);

        // Particle column — Points with per-particle Y + lifetime tracked CPU-side
        this._partPositions = new Float32Array(PARTICLE_COUNT * 3);
        this._partLifetimes = new Float32Array(PARTICLE_COUNT);
        this._partMaxLife = new Float32Array(PARTICLE_COUNT);
        const partGeo = new THREE.BufferGeometry();
        partGeo.setAttribute('position', new THREE.BufferAttribute(this._partPositions, 3));
        const partMat = new THREE.PointsMaterial({
            color: 0xb8e8ff,
            size: 0.5,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            sizeAttenuation: true,
            blending: THREE.AdditiveBlending,
        });
        this.particles = new THREE.Points(partGeo, partMat);
        this.particles.frustumCulled = false;
        scene.add(this.particles);
        this._initParticles();
    }

    _initParticles() {
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            this._spawnParticle(i, /*staggered=*/true);
        }
        this.particles.geometry.attributes.position.needsUpdate = true;
    }

    /**
     * Reset particle i to a fresh position at the column base, with a randomised
     * lifetime so the column reads as continuous flow rather than synchronised waves.
     */
    _spawnParticle(i, staggered = false) {
        const i3 = i * 3;
        const angle = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * COLUMN_RADIUS;
        this._partPositions[i3 + 0] = this.center.x + Math.cos(angle) * r;
        this._partPositions[i3 + 2] = this.center.z + Math.sin(angle) * r;
        // Stagger initial Y on first spawn so the column is filled from t=0
        const startFrac = staggered ? Math.random() : 0;
        const life = COLUMN_HEIGHT / RISE_SPEED * (0.7 + Math.random() * 0.6);
        this._partLifetimes[i] = startFrac * life;
        this._partMaxLife[i] = life;
        this._partPositions[i3 + 1] = this.groundY + this._partLifetimes[i] * RISE_SPEED;
    }

    /**
     * Trigger a brief pulse (called from main.js on 'corral-retired').
     */
    pulse() {
        this.pulseT = PULSE_DURATION;
    }

    /**
     * Per-frame integration. Called from main.js animate loop with dt.
     * @param {number} dt seconds
     */
    update(dt) {
        this.elapsed += dt;
        // Slow ring rotation
        this.ring.rotation.z += dt * 0.18;
        this.ringMaterial.uniforms.uTime.value = this.elapsed;
        if (this.pulseT > 0) {
            this.pulseT = Math.max(0, this.pulseT - dt);
            // Smooth ease-out: 1 -> 0
            const t = this.pulseT / PULSE_DURATION;
            this.ringMaterial.uniforms.uPulse.value = t * t;
        } else {
            this.ringMaterial.uniforms.uPulse.value = 0;
        }

        // Particle integration — rise and recycle
        const speedBoost = this.pulseT > 0 ? 1.6 : 1.0;
        const positions = this._partPositions;
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            this._partLifetimes[i] += dt;
            if (this._partLifetimes[i] >= this._partMaxLife[i]) {
                this._spawnParticle(i, /*staggered=*/false);
                continue;
            }
            const i3 = i * 3;
            positions[i3 + 1] += RISE_SPEED * speedBoost * dt;
            // Tiny inward swirl (radial pull) so particles converge as they rise
            const dx = this.center.x - positions[i3 + 0];
            const dz = this.center.z - positions[i3 + 2];
            positions[i3 + 0] += dx * 0.6 * dt;
            positions[i3 + 2] += dz * 0.6 * dt;
        }
        this.particles.geometry.attributes.position.needsUpdate = true;
    }

    dispose() {
        this.scene.remove(this.ring);
        this.scene.remove(this.pad);
        this.scene.remove(this.particles);
        this.ring.geometry.dispose();
        this.ring.material.dispose();
        this.pad.geometry.dispose();
        this.pad.material.dispose();
        this.particles.geometry.dispose();
        this.particles.material.dispose();
    }
}
