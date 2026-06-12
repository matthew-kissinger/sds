// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_BARK_CONFIG } from '../shared/BarkImpulse.js';
import {
    makeSheep,
    makeSheepdog,
    makeCoopGameState,
    tickSheepCoop,
    SHEEP_CONFIG,
    round4,
} from '../tests/sim-baseline/harness.js';

const OUT_DIR = 'cycle94-validation';
const DT = 1 / 60;
const ORIGIN = { x: 0, z: 0 };
const FORWARD = { x: 0, z: 1 };
const SAMPLES = [1, 5, 15, 30, 60];
const LEGACY_IMPULSE_STRENGTH = 6;

const SHEEP_LAYOUT = [
    { label: 'near', x: 0, z: 4 },
    { label: 'mid', x: 0, z: 12 },
    { label: 'far', x: 0, z: 20 },
    { label: 'lateral', x: 3, z: 10 },
    { label: 'outside-cone', x: 14, z: 10 },
];

const CANDIDATES = [
    {
        key: 'current-velocity-impulse',
        label: 'Current direct velocity impulse',
        mode: 'current',
    },
    {
        key: 'one-frame-bounded-force',
        label: 'One-frame bounded acceleration',
        mode: 'one-frame',
        steerForce: 0.24,
    },
    {
        key: 'decaying-steering-30t',
        label: 'Short decaying steering intent',
        mode: 'intent',
        steerForce: 0.16,
        durationTicks: 30,
    },
];

function cloneFlock() {
    return SHEEP_LAYOUT.map((s, i) => makeSheep(i, s.x, s.z));
}

function speed(sheep) {
    return Math.sqrt(sheep.velocity.x * sheep.velocity.x + sheep.velocity.z * sheep.velocity.z);
}

function coneFalloff(sheep, config = DEFAULT_BARK_CONFIG) {
    const dx = sheep.position.x - ORIGIN.x;
    const dz = sheep.position.z - ORIGIN.z;
    const distSq = dx * dx + dz * dz;
    const rangeSq = config.range * config.range;
    if (distSq > rangeSq) return 0;

    const dist = Math.sqrt(distSq);
    if (dist < 1e-6) return 1;

    const dot = (dx / dist) * FORWARD.x + (dz / dist) * FORWARD.z;
    if (dot < config.minDot) return 0;

    return 1 - dist / config.range;
}

function applyOneFrameForce(sheep, candidate) {
    let affected = 0;
    for (const s of sheep) {
        const falloff = coneFalloff(s);
        if (falloff <= 0) continue;
        s.acceleration.x += FORWARD.x * candidate.steerForce * falloff;
        s.acceleration.z += FORWARD.z * candidate.steerForce * falloff;
        affected++;
    }
    return affected;
}

function applyLegacyVelocityImpulse(sheep) {
    let affected = 0;
    for (const s of sheep) {
        const falloff = coneFalloff(s);
        if (falloff <= 0) continue;
        s.velocity.x += FORWARD.x * LEGACY_IMPULSE_STRENGTH * falloff;
        s.velocity.z += FORWARD.z * LEGACY_IMPULSE_STRENGTH * falloff;
        affected++;
    }
    return affected;
}

function applySteeringIntent(sheep, candidate) {
    let affected = 0;
    for (const s of sheep) {
        const falloff = coneFalloff(s);
        if (falloff <= 0) continue;
        s.barkSteerTicks = candidate.durationTicks;
        s.barkSteerDurationTicks = candidate.durationTicks;
        s.barkSteerX = FORWARD.x;
        s.barkSteerZ = FORWARD.z;
        s.barkSteerForce = candidate.steerForce * falloff;
        affected++;
    }
    return affected;
}

function tickSteeringIntent(sheep) {
    for (const s of sheep) {
        if ((s.barkSteerTicks ?? 0) <= 0) continue;
        const decay = s.barkSteerTicks / s.barkSteerDurationTicks;
        s.acceleration.x += s.barkSteerX * s.barkSteerForce * decay;
        s.acceleration.z += s.barkSteerZ * s.barkSteerForce * decay;
        s.barkSteerTicks--;
    }
}

function snapshot(sheep, startById) {
    return sheep.map((s, i) => ({
        label: SHEEP_LAYOUT[i].label,
        zDisplacement: round4(s.position.z - startById.get(s.id).z),
        xDisplacement: round4(s.position.x - startById.get(s.id).x),
        speed: round4(speed(s)),
        vx: round4(s.velocity.x),
        vz: round4(s.velocity.z),
    }));
}

function runCandidate(candidate) {
    const sheep = cloneFlock();
    const dog = makeSheepdog('p1', 0, 0);
    const state = makeCoopGameState();
    const startById = new Map(sheep.map((s) => [s.id, { x: s.position.x, z: s.position.z }]));
    const samples = {};
    let affected = 0;
    let maxSpeed = 0;

    for (let t = 1; t <= 60; t++) {
        if (t === 1) {
            if (candidate.mode === 'current') {
                affected = applyLegacyVelocityImpulse(sheep);
            } else if (candidate.mode === 'one-frame') {
                affected = applyOneFrameForce(sheep, candidate);
            } else if (candidate.mode === 'intent') {
                affected = applySteeringIntent(sheep, candidate);
            }
        }

        if (candidate.mode === 'intent') tickSteeringIntent(sheep);
        tickSheepCoop(sheep, [dog], state, DT);

        for (const s of sheep) {
            maxSpeed = Math.max(maxSpeed, speed(s));
        }
        if (SAMPLES.includes(t)) {
            samples[t] = snapshot(sheep, startById);
        }
    }

    return {
        key: candidate.key,
        label: candidate.label,
        affected,
        config: {
            steerForce: candidate.steerForce ?? null,
            durationTicks: candidate.durationTicks ?? null,
            range: DEFAULT_BARK_CONFIG.range,
            minDot: DEFAULT_BARK_CONFIG.minDot,
        },
        maxSpeed: round4(maxSpeed),
        speedEnvelope: SHEEP_CONFIG.maxSpeed,
        samples,
    };
}

function tableForMetric(results, metric, tick) {
    const lines = [
        `| Sheep | ${results.map((r) => r.label).join(' | ')} |`,
        `|---|${results.map(() => '---|').join('')}`,
    ];
    for (const layout of SHEEP_LAYOUT) {
        const values = results.map((r) => {
            const row = r.samples[tick].find((s) => s.label === layout.label);
            return row[metric].toFixed(4);
        });
        lines.push(`| ${layout.label} | ${values.join(' | ')} |`);
    }
    return lines.join('\n');
}

function writeReport(results) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, 'bark-spike.json'), `${JSON.stringify(results, null, 2)}\n`);

    const lines = [
        '# Cycle 94 bark steering spike',
        '',
        'Generated by `node tools/bark-steering-spike.mjs`.',
        '',
        '## Setup',
        '',
        `- Sheep speed envelope: \`${SHEEP_CONFIG.maxSpeed}\`.`,
        `- Bark range: \`${DEFAULT_BARK_CONFIG.range}\`; forward-cone minDot: \`${DEFAULT_BARK_CONFIG.minDot}\`.`,
        '- Deterministic sheep layout: near 4m, mid 12m, far 20m, lateral in-cone, and outside-cone.',
        '- Each candidate runs for 60 ticks at 60 Hz through `tickSheepCoop`.',
        '',
        '## Max Speed',
        '',
        '| Candidate | Max sheep speed over 1s | Over envelope? |',
        '|---|---:|---|',
        ...results.map((r) => `| ${r.label} | ${r.maxSpeed.toFixed(4)} | ${r.maxSpeed > r.speedEnvelope ? 'yes' : 'no'} |`),
        '',
        '## Z displacement at 1.0s',
        '',
        tableForMetric(results, 'zDisplacement', 60),
        '',
        '## Speed at 1.0s',
        '',
        tableForMetric(results, 'speed', 60),
        '',
        '## Z displacement at 0.5s',
        '',
        tableForMetric(results, 'zDisplacement', 30),
        '',
        '## Selection',
        '',
        'Selected target for implementation: short decaying steering intent, `durationTicks: 30`, `steerForce: 0.16`, with the existing 24m range, forward cone, and cooldown.',
        '',
        'Reason: the one-frame force stays inside the speed envelope but is almost invisible by 1s, while the decaying intent gives a readable heading bias and meaningful displacement without ever exceeding the ordinary sheep speed envelope. The current velocity impulse exceeds that envelope by an order of magnitude and still moves sheep after the bark frame because velocity smoothing blends from the injected velocity.',
        '',
    ];

    writeFileSync(join(OUT_DIR, 'bark-spike.md'), `${lines.join('\n')}\n`);
}

const results = CANDIDATES.map(runCandidate);
writeReport(results);
console.log(JSON.stringify({
    outDir: OUT_DIR,
    maxSpeeds: results.map((r) => ({ key: r.key, maxSpeed: r.maxSpeed, envelope: r.speedEnvelope })),
}, null, 2));
