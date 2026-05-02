/**
 * Cycle 10 Phase 4: declarative marketing shot list.
 *
 * Each entry is a shot consumed by run.mjs. The runner spawns Vite + the
 * Playwright browser, navigates to a `?cinematic=1&...` URL, drives the
 * `__sdsCinema` API to set up the shot, captures PNG frames at 30 fps,
 * then optionally muxes to MP4 via ffmpeg.
 *
 * Output naming: `<id>.mp4` for video, `<id>.png` for static OG images.
 * All written under `/assets/marketing/`.
 *
 * Camera coordinates are in world space. Reference: terrain centred at
 * (0, 0); play area is roughly 200×200 m for Field, 250×250 m for RH/OC.
 *
 * Tuning: take the resulting MP4s and iterate. The cycle plan estimates
 * 6-10 hours total for the marketing-asset pass, most of it in iteration.
 */

export const SHOTS = [
    {
        id: 'dog-into-sunset',
        kind: 'video',
        scene: 'rolling-hills',
        mode: 'classic',
        sun: 0.06, // dusk, just above horizon
        durationMs: 8000,
        camera: [
            { t: 0,   pos: { x: 30, y: 14, z: 50 }, target: { x: 0, y: 1, z: 0 } },
            { t: 0.5, pos: { x: 25, y: 12, z: 35 }, target: { x: -5, y: 1, z: -5 } },
            { t: 1,   pos: { x: 20, y: 10, z: 25 }, target: { x: -15, y: 1, z: -25 } },
        ],
        notes: 'Behind-the-dog dolly toward sun on the horizon.',
    },
    {
        id: 'lightning-strike',
        kind: 'video',
        scene: 'rolling-hills',
        mode: 'classic',
        sun: 0.4,
        durationMs: 6000,
        // Static wide; trigger lightning pulse on the sheep cluster mid-shot.
        camera: [
            { t: 0, pos: { x: 0, y: 35, z: 80 }, target: { x: 0, y: 0, z: 0 } },
            { t: 1, pos: { x: 0, y: 35, z: 80 }, target: { x: 0, y: 0, z: 0 } },
        ],
        triggerLightningAt: [{ ms: 2000, pos: { x: 0, y: 0, z: 10 } },
                             { ms: 4000, pos: { x: 15, y: 0, z: -10 } }],
        notes: 'Static wide; two zap pulses on the flock.',
    },
    {
        id: 'chaos-5000',
        kind: 'video',
        scene: 'field',
        mode: 'chaos',
        sun: 0.5,
        durationMs: 8000,
        // Orbital around the flock at 80m radius.
        camera: orbital({ radius: 80, height: 25, target: { x: 0, y: 0, z: 0 }, fullCircle: false, sweep: 0.4 }),
        notes: 'Orbital camera at 80m radius, ~40% of full circle in 8s.',
    },
    {
        id: 'oc-portal',
        kind: 'video',
        scene: 'open-country',
        mode: 'classic',
        sun: 0.55,
        durationMs: 10000,
        // Drone descent toward the corral portal.
        camera: [
            { t: 0,   pos: { x: 0, y: 60, z: 80 },  target: { x: 0, y: 5, z: 0 } },
            { t: 0.5, pos: { x: 0, y: 35, z: 50 },  target: { x: 0, y: 5, z: 0 } },
            { t: 1,   pos: { x: 0, y: 18, z: 30 },  target: { x: 0, y: 5, z: 0 } },
        ],
        notes: 'Drone descent toward the OC portal. Pause until first sheep ascends.',
    },

    // Static OG cards.
    {
        id: 'og-rolling-hills',
        kind: 'static',
        scene: 'rolling-hills',
        mode: 'classic',
        sun: 0.45,
        camera: { pos: { x: 35, y: 18, z: 50 }, target: { x: 0, y: 1, z: 0 } },
        size: { width: 1200, height: 630 },
        notes: 'OG card for sharing on RH.',
    },
    // Cycle 12 marketing refresh — Matt's hero shot ask 2026-05-02.
    // Behind-the-dog over Rolling Hills at dusk with the Solo Extreme
    // 1000-sheep flock spread across the hills. Live-action capture so
    // sheep are mid-flock instead of frozen.
    {
        id: 'og-rh-sunset',
        kind: 'static',
        scene: 'rolling-hills',
        mode: 'extreme',          // Solo Extreme = exactly 1000 sheep
        liveAction: true,         // skip pauseSimulation so the flock is moving
        // Cycle 13 Phase 1 fix: gate on actual flock size instead of a
        // fixed wait. First-pass capture at settleMs=4500 only spawned
        // 24/1000 sheep. waitForFlockSize polls the sheep system directly.
        waitForFlockSize: 1000,
        settleMs: 1200,           // brief post-settle for boid distribution
        sun: 0.06,                // dusk, just above horizon (mirrors dog-into-sunset)
        // Behind-the-dog low overlook: dog-spawn at world origin, sun
        // sets to the west. Camera placed back+high enough to see the
        // dog silhouette + the hills + the flock spread, looking past
        // the dog toward the horizon.
        camera: { pos: { x: 18, y: 8, z: 22 }, target: { x: -10, y: 1, z: -20 } },
        size: { width: 1200, height: 630 },
        notes: 'Hero OG: behind-dog Rolling Hills sunset with 1000-sheep flock.',
    },
    {
        id: 'og-open-country',
        kind: 'static',
        scene: 'open-country',
        mode: 'classic',
        sun: 0.55,
        camera: { pos: { x: 0, y: 25, z: 60 }, target: { x: 0, y: 5, z: 0 } },
        size: { width: 1200, height: 630 },
        notes: 'OG card for sharing on OC.',
    },
    {
        id: 'og-field',
        kind: 'static',
        scene: 'field',
        mode: 'classic',
        sun: 0.5,
        camera: { pos: { x: 30, y: 15, z: 40 }, target: { x: 0, y: 1, z: 0 } },
        size: { width: 1200, height: 630 },
        notes: 'OG card for sharing on Field.',
    },
];

// Cycle 11 Phase 3: dog portrait shots for DogSelection thumbnails.
// Each renders into assets/dogs/<id>.webp at 512x512 + a PNG fallback.
export const DOG_SHOTS = ['jep', 'pip', 'sally', 'shiloh', 'george_washington'].map(id => ({
    id: `dog-${id}`,
    kind: 'dog',
    dogId: id,
    scene: 'field', // any scene works; mountDogShowcase replaces visible content
    sun: 0.5,
    size: { width: 1024, height: 1024 },
    output: { width: 512, height: 512 }, // sharp resize target
    notes: `DogSelection thumbnail for ${id}.`,
}));

// Cycle 11 Phase 3: PWA icon hero shot. Pose Jep portrait at 1024x1024 PNG;
// sharp pipeline produces 192/512/maskable PNG variants.
export const PWA_ICON_SHOT = {
    id: 'pwa-icon-hero',
    kind: 'pwa-icon',
    dogId: 'jep',
    scene: 'field',
    sun: 0.55,
    size: { width: 1024, height: 1024 },
    notes: 'PWA icon hero — Jep portrait at 1024x1024.',
};

function orbital({ radius, height, target, fullCircle = true, sweep = 1 }) {
    const segments = 8;
    const totalAngle = fullCircle ? Math.PI * 2 : Math.PI * 2 * sweep;
    const out = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const theta = t * totalAngle;
        out.push({
            t,
            pos: {
                x: target.x + Math.cos(theta) * radius,
                y: target.y + height,
                z: target.z + Math.sin(theta) * radius,
            },
            target,
        });
    }
    return out;
}
