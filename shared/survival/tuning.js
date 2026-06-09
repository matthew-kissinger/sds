// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Survival feel constants - the single source of truth.
 *
 * Cycle 68 P2: CENTRALIZED from four scattered sites (`wolves.js`
 * DEFAULT_WOLF_TUNING, `wolfBehavior.js` spawnCountForDay defaults, `run.js`
 * constructor defaults, and the scene `survival` block) so a feel pass is a
 * one-file change instead of a four-file hunt. Pure data: no Math.random, no
 * Date.now, no DOM, no Three. Survival-only - nothing here is on the standard
 * sheep tick, so the 9 sim-baselines stay byte-identical.
 *
 * Two groups, split by ownership:
 *   - WOLF_TUNING is GLOBAL (one predator model across every survival scene).
 *   - SURVIVAL_RUN_DEFAULTS are the run-economy feel defaults. A SceneDef's
 *     `survival` block spreads them and overrides per-scene capacity. maxFlock
 *     stays scene data (per scene-and-render: scene-specific knobs live on the
 *     SceneDef), so it is deliberately NOT defined here.
 *
 * Values are the current survival feel contract. The first applied taste pass
 * keeps the 10-sheep opening, makes dawn progress more visible, lets day one
 * survive one extra sheep lost, and slows repeat kills enough for dog pressure
 * to matter.
 */

/** Run economy: starting flock, per-day growth, and the night loss ratio that ends a run. */
export const SURVIVAL_RUN_DEFAULTS = {
    startFlock: 10,       // sheep at the start of day 1
    growth: 6,            // sheep added each surviving dawn
    lossThreshold: 0.45,  // a night that loses >= this fraction of the flock ends the run
};

/** Night-wolf feel: pack-size curve, speeds (m/s), kill + bark-repel geometry. */
export const WOLF_TUNING = {
    // Pack size: `base` on night one, +`perDay` each night, hard `max` ceiling.
    base: 2,
    perDay: 1,
    max: 8,
    // Speeds (m/s).
    huntSpeed: 11.5,
    fleeSpeed: 13,
    retreatSpeed: 12,
    // Kill geometry.
    killRadius: 1.7,     // m: a wolf within this of a roaming sheep kills it
    killCooldown: 1.6,   // s: between a single wolf's kills
    // Spawn ring (laid around the roaming-flock centroid at nightfall).
    spawnRadius: 150,    // m
    spawnJitter: 60,     // m
    // Movement / lifecycle.
    body: 1.0,           // m: fence standoff radius (wolves collide with the pen like the dog)
    retreatDist: 260,    // m: a retreating wolf despawns once this far from the pen
    // Bark wolf-repel (a dog bark scares wolves into a flee; longer range than the sheep cone).
    fleeRepelRadius: 45, // m
    barkRepelSecs: 2.0,  // s the scare lasts before the wolf re-acquires
};

/*
 * FEEL PASS NOTES.
 *   - Day-1 pressure keeps two wolves for the visual read, but a 0.45 loss
 *     threshold and 1.6s kill cooldown mean four lost sheep is recoverable and
 *     five lost sheep ends the run.
 *   - huntSpeed 11.5 stays below Sally's sprint and below Jep/George sprint,
 *     while still outrunning grazing sheep. Slower dogs rely on bark/range.
 *   - Bark is a long wolf-control tool: 45m reach, 2.0s flee.
 *   - growth 6 reaches the 200-sheep cap in about 33 clean dawns.
 */
