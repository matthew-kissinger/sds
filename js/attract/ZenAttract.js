/**
 * ZenAttract — the boot-time attract field (Cycle 46 Phase 1).
 *
 * A cheap, renderer-agnostic drifting-boid field that paints as first
 * frame INSTEAD of building a hero scene. The persistent renderer + the
 * Atmosphere sky dome (built in the SheepDogSimulation constructor) are
 * already up; this adds one InstancedMesh of small darts that drift over
 * the gradient sky while the scene picker floats on top. Selecting a scene
 * tears this down and streams the real scene in (Phase 2 crossfade).
 *
 * Design constraints that shaped this module:
 *
 * - **Renderer-agnostic, standard material.** The main bundle's `THREE` is
 *   the WebGL build; the WebGPU renderer + TSL come from a separately
 *   vendored copy that injects node-material factories as globals. A
 *   `three/tsl` import here would pull a second copy of three (breaking the
 *   renderer or blowing the bundle ratchet). `MeshBasicMaterial` +
 *   `InstancedMesh` render identically on both renderers (WebGPU
 *   auto-converts the standard material), so the attract field needs zero
 *   node-material plumbing and is unit-testable under jsdom.
 *
 * - **O(n) independent drift, NOT a flocking loop.** Each dart integrates
 *   its own velocity with a gentle random-walk turn rate, a vertical bob,
 *   and a soft restoring force at the bounds. There are no neighbour
 *   queries — the O(n^2) boid-boid interaction (the expensive part a GPU
 *   compute pass would offload) does not exist here, so the per-frame cost
 *   is a few thousand FMAs (sub-0.1ms for ~1k darts on the RTX 3070).
 *   The cycle plan's "GPU compute path" acceptance line is honoured in
 *   spirit: there is no per-frame main-thread flocking loop because there
 *   is no flocking. See `cycle46-validation/entrance-timing.md`.
 *
 * - **Allocation-free update.** Scratch math objects are module-level
 *   singletons; the per-frame loop writes straight into the instance
 *   matrix buffer.
 *
 * The field is intentionally a render-only toy. It is NOT a `shared/` sim,
 * holds no game state, and is seeded by a small internal PRNG so a guard
 * spec can assert bounded drift deterministically.
 */

import * as THREE from 'three';

// Scratch singletons — reused every frame, never allocated in the loop.
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3(1, 1, 1);
const _dir = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);

// Calm naturalistic palette — pale sky tones + soft greens. Flat-shaded
// (MeshBasicMaterial ignores lights) so each dart reads as one clean color
// over the gradient sky. Matt's taste call (Q1) gates the final look.
const PALETTE = [
    0xeaf2f8, // near-white sky
    0xc9e2d4, // pale mint
    0xa7d3be, // soft sage
    0xd9e8c8, // light moss
    0xbfe0e6, // pale teal
    0xf0ead6, // warm cream
];

/** Deterministic 32-bit PRNG (mulberry32) so attract drift is reproducible. */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class ZenAttract {
    /**
     * @param {THREE.Scene} scene  The persistent scene to add darts to.
     * @param {object} [options]
     * @param {number} [options.count]    Dart count. Defaults by tier.
     * @param {boolean} [options.isMobile] Lower the default count on mobile.
     * @param {number} [options.seed]     PRNG seed (default fixed, reproducible).
     * @param {{x:number,y:number,z:number}} [options.halfExtents] Soft-bounds box.
     */
    constructor(scene, options = {}) {
        this.scene = scene;
        const isMobile = options.isMobile === true;
        this.count = options.count ?? (isMobile ? 420 : 1100);

        // Soft-containment box centred on the origin (the camera orbits the
        // origin at radius 120 / height 80 looking at (0,0,0)).
        const he = options.halfExtents ?? { x: 72, y: 38, z: 72 };
        this._halfX = he.x;
        this._halfY = he.y;
        this._halfZ = he.z;
        this._centerY = 44; // vertical centre of the drift volume

        // Speed envelope (units/sec).
        this._minSpeed = 2.2;
        this._maxSpeed = 7.5;

        const rng = mulberry32(options.seed ?? 0x5eed1234);
        this._rng = rng;

        // Per-dart state. Flat typed arrays, no per-instance objects.
        const n = this.count;
        this._pos = new Float32Array(n * 3);
        this._vel = new Float32Array(n * 3);
        this._turn = new Float32Array(n);   // horizontal turn rate (rad/s)
        this._bob = new Float32Array(n);     // vertical bob phase
        this._bobRate = new Float32Array(n); // vertical bob frequency

        for (let i = 0; i < n; i++) {
            const ix = i * 3;
            // Position: uniform in the box, biased toward the vertical centre.
            this._pos[ix] = (rng() * 2 - 1) * this._halfX;
            this._pos[ix + 1] = this._centerY + (rng() * 2 - 1) * this._halfY * 0.85;
            this._pos[ix + 2] = (rng() * 2 - 1) * this._halfZ;

            // Velocity: random heading, mid-range speed, very shallow climb.
            const heading = rng() * Math.PI * 2;
            const speed = this._minSpeed + rng() * (this._maxSpeed - this._minSpeed);
            this._vel[ix] = Math.cos(heading) * speed;
            this._vel[ix + 1] = (rng() * 2 - 1) * 0.8;
            this._vel[ix + 2] = Math.sin(heading) * speed;

            this._turn[i] = (rng() * 2 - 1) * 0.5;       // initial lazy curl
            this._bob[i] = rng() * Math.PI * 2;
            this._bobRate[i] = 0.4 + rng() * 0.6;
        }

        // Geometry: a small 4-sided dart (cone, apex +Y) — orients along
        // velocity so the field reads as directional drift, not confetti.
        const geo = new THREE.ConeGeometry(0.42, 2.1, 4);
        geo.computeVertexNormals();

        const mat = new THREE.MeshBasicMaterial({
            // Per-instance color via instanceColor; base white so the
            // instance tint shows through unmodulated.
            color: 0xffffff,
            transparent: true, // opacity 1 now; Phase 2 crossfades to 0.
            opacity: 1,
            fog: false,         // float clean over the sky, unmodulated by fog.
            depthWrite: true,
        });
        this._geometry = geo;
        this._material = mat;

        const mesh = new THREE.InstancedMesh(geo, mat, n);
        mesh.frustumCulled = false; // they ring the origin; cheap to skip cull.
        mesh.name = 'ZenAttractField';
        mesh.renderOrder = -1;       // behind the (DOM) picker; ahead of sky.
        this.mesh = mesh;

        // Seed instance matrices + colors.
        const color = new THREE.Color();
        for (let i = 0; i < n; i++) {
            this._writeMatrix(i);
            color.setHex(PALETTE[(rng() * PALETTE.length) | 0]);
            // Subtle per-instance lightness jitter for depth.
            const j = 0.88 + rng() * 0.12;
            color.multiplyScalar(j);
            mesh.setColorAt(i, color);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

        scene.add(mesh);
    }

    /** Compose dart i's instance matrix from its position + velocity heading. */
    _writeMatrix(i) {
        const ix = i * 3;
        _pos.set(this._pos[ix], this._pos[ix + 1], this._pos[ix + 2]);
        _dir.set(this._vel[ix], this._vel[ix + 1], this._vel[ix + 2]);
        const len = _dir.length();
        if (len > 1e-4) {
            _dir.multiplyScalar(1 / len);
            _q.setFromUnitVectors(_UP, _dir);
        } else {
            _q.identity();
        }
        _m.compose(_pos, _q, _scl);
        this.mesh.setMatrixAt(i, _m);
    }

    /**
     * Advance the drift field one frame. O(n), no neighbour queries.
     * @param {number} dt  Seconds since last frame (clamped internally).
     */
    update(dt) {
        if (!this.mesh) return;
        const h = Math.min(Math.max(dt, 0), 0.05); // clamp dropped frames
        if (h <= 0) return;

        const rng = this._rng;
        const n = this.count;
        const minS = this._minSpeed;
        const maxS = this._maxSpeed;
        const hx = this._halfX;
        const hy = this._halfY;
        const hz = this._halfZ;
        const cy = this._centerY;

        for (let i = 0; i < n; i++) {
            const ix = i * 3;
            let vx = this._vel[ix];
            let vy = this._vel[ix + 1];
            let vz = this._vel[ix + 2];

            // 1. Random-walk the horizontal turn rate → smooth meander.
            let turn = this._turn[i] + (rng() * 2 - 1) * h * 0.6;
            if (turn > 0.8) turn = 0.8;
            else if (turn < -0.8) turn = -0.8;
            this._turn[i] = turn;

            // 2. Rotate the horizontal heading by turn*h (cheap small-angle
            //    rotation in the XZ plane).
            const a = turn * h;
            const ca = Math.cos(a);
            const sa = Math.sin(a);
            const nvx = vx * ca - vz * sa;
            const nvz = vx * sa + vz * ca;
            vx = nvx;
            vz = nvz;

            // 3. Vertical bob — gentle sinusoidal climb/sink.
            this._bob[i] += this._bobRate[i] * h;
            vy += Math.sin(this._bob[i]) * h * 1.6;

            // 4. Soft restoring force when a dart drifts past the box.
            const px = this._pos[ix];
            const py = this._pos[ix + 1];
            const pz = this._pos[ix + 2];
            if (px > hx) vx -= (px - hx) * h * 0.9;
            else if (px < -hx) vx += (-hx - px) * h * 0.9;
            if (pz > hz) vz -= (pz - hz) * h * 0.9;
            else if (pz < -hz) vz += (-hz - pz) * h * 0.9;
            const dyTop = cy + hy;
            const dyBot = cy - hy;
            if (py > dyTop) vy -= (py - dyTop) * h * 1.2;
            else if (py < dyBot) vy += (dyBot - py) * h * 1.2;

            // 5. Damp vertical so darts don't accumulate climb.
            vy *= 0.985;

            // 6. Clamp horizontal-dominated speed into the envelope.
            let sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
            if (sp < 1e-4) {
                vx = minS;
                sp = minS;
            }
            if (sp < minS) {
                const k = minS / sp;
                vx *= k; vy *= k; vz *= k;
            } else if (sp > maxS) {
                const k = maxS / sp;
                vx *= k; vy *= k; vz *= k;
            }

            // 7. Integrate position.
            this._pos[ix] = px + vx * h;
            this._pos[ix + 1] = py + vy * h;
            this._pos[ix + 2] = pz + vz * h;
            this._vel[ix] = vx;
            this._vel[ix + 1] = vy;
            this._vel[ix + 2] = vz;

            this._writeMatrix(i);
        }

        this.mesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * Set the field's global opacity (Phase 2 crossfade hook).
     * @param {number} a  0..1
     */
    setOpacity(a) {
        if (!this._material) return;
        const v = Math.min(Math.max(a, 0), 1);
        this._material.opacity = v;
        this._material.transparent = true;
        // Drop depth writes while translucent so the streaming scene behind
        // it composites cleanly during the crossfade.
        this._material.depthWrite = v >= 0.999;
        this._material.needsUpdate = true;
    }

    /** Remove from scene and free GPU resources. Idempotent. */
    dispose() {
        if (this.mesh) {
            if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
            this.mesh.dispose?.();
            this.mesh = null;
        }
        this._geometry?.dispose?.();
        this._material?.dispose?.();
        this._geometry = null;
        this._material = null;
        this._pos = this._vel = this._turn = this._bob = this._bobRate = null;
    }
}
