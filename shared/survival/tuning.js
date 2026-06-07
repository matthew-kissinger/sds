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
 * Values are Matt's Cycle 66/67 spec, preserved byte-for-byte in Cycle 68. The
 * centralization is structural; the live taste pass - which numbers actually
 * feel right across a wolf night - is Matt's paired track. See FEEL PASS NOTES.
 */

/** Run economy: starting flock, per-day growth, and the night loss ratio that ends a run. */
export const SURVIVAL_RUN_DEFAULTS = {
    startFlock: 10,       // sheep at the start of day 1
    growth: 5,            // sheep added each surviving dawn
    lossThreshold: 1 / 3, // a night that loses >= this fraction of the flock ends the run
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
    killCooldown: 1.2,   // s: between a single wolf's kills
    // Spawn ring (laid around the roaming-flock centroid at nightfall).
    spawnRadius: 150,    // m
    spawnJitter: 60,     // m
    // Movement / lifecycle.
    body: 1.0,           // m: fence standoff radius (wolves collide with the pen like the dog)
    retreatDist: 260,    // m: a retreating wolf despawns once this far from the pen
    // Bark wolf-repel (a dog bark scares wolves into a flee; longer range than the sheep cone).
    fleeRepelRadius: 22, // m
    barkRepelSecs: 1.6,  // s the scare lasts before the wolf re-acquires
};

/*
 * FEEL PASS NOTES (Cycle 68 carryover - candidates for Matt's paired playtest).
 * Reasoned starting points, deliberately NOT applied: feel needs a live wolf
 * night to judge, and the values above are Matt's spec.
 *   - Day-1 pressure: base 2 wolves at killCooldown 1.2s is ~1.7 kills/s once a
 *     wolf reaches the flock. With startFlock 10 and lossThreshold 1/3 (death at
 *     ~4 kills) an unherded day-1 night can end in seconds. If day 1 reads as
 *     too punishing, prefer raising killCooldown (1.6-2.0) or softening the
 *     per-day curve over cutting the pack count (the pack visual carries weight).
 *   - huntSpeed 11.5 vs per-dog speed: if wolves outrun the slower dogs (Shiloh,
 *     George Washington) the player cannot shoulder one off a sheep. Cross-check
 *     against the dog speeds before lowering.
 *   - growth 5 vs maxFlock 200: ~38 surviving days to the cap. Fine for a score
 *     chase; revisit only if runs routinely stall at the ceiling.
 */
