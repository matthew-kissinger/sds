// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Authoritative Game Simulation for Multiplayer Sheepdog
 * Uses shared simulation logic to ensure consistency across all clients
 */

// Import shared simulation logic
import {
    Vector2D,
    calculateFlockingForce,
    calculateFlee,
    getNeighbors,
    updateMovement,
    applyAcceleration,
    updateStamina,
    calculateBoundaryAvoidanceWithGate,
    calculateBoundaryAvoidanceWithMultipleGates,
    applyHardBoundaryConstraints,
    applyHardBoundaryConstraintsWithMultipleGates,
    updateSheepRetirements,
    updateSheepCorralRetirements,
    checkGameCompletion,
    validateEntityState,
    generateInitialSheepPositions,
    createGameState,
    createBoidConfig,
    createMovementConfig,
    generateCompetitiveGateLayout,
    assignGatesToPlayers,
    updateCompetitiveSheepRetirements,
    checkCompetitiveCompletion,
    createCompetitiveGameState,
    checkGatePassage,
    loadScene,
    DEFAULT_SCENE_ID,
    createObjective,
    tickObjective,
    isCorralOpen,
    resolveDogSheepCollisions,
    createSheepCollisionScratch,
    resolveSheepSheepCollisions,
    applyBarkImpulse,
    DEFAULT_BARK_CONFIG
} from '../../shared/index.js';
import { mulberry32 } from '../../shared/Random.js';
// Cycle 67 P3: the promoted survival cores. These run authoritatively on the DO
// for co-op survival rooms (the client cannot run the Worker; these run here and
// broadcast). All four are pure shared/ modules (no Three/DOM).
import { SurvivalRun } from '../../shared/survival/run.js';
import { WolfSim } from '../../shared/survival/wolves.js';
import { PenContainment } from '../../shared/survival/pen.js';
import { secondsToT, phaseForT, gateOpenForPhase } from '../../shared/survival/dayClock.js';
import { PROTOCOL_VERSION, KEYFRAME_INTERVAL_TICKS } from '../../shared/protocol.js';
// P0-OBS: structured one-line JSON logging (worker/src/log.ts). Extensionless
// import so vitest, wrangler/esbuild, and tsc all resolve the .ts source.
import { log, errStr } from './log';

// P-SEC-3: server input trust boundary. The DO is authoritative, but a client
// can send any MessagePack payload it likes over the playerInput channel. Two
// shapes are hostile and were not previously rejected:
//   - a `direction` that is missing, non-object, or carries a non-finite x/z
//     (NaN/Infinity) propagates straight into the physics and poisons the
//     sheepdog's position with NaN, which then desyncs every client.
//   - a non-finite `inputSequence` (Infinity slipped through the `?? 0` chain
//     in RoomDO) latches `sheepdog.inputSequence` at Infinity, so every
//     subsequent finite input fails the `<=` freshness check and the dog
//     freezes for the rest of the game.
// These two helpers are the single validation point shared by the RoomDO
// message handler (drop at ingress) and applyPlayerInput (defence in depth).

// A valid movement direction is an object with finite numeric x and z.
export function isValidInputDirection(direction) {
    return (
        !!direction &&
        typeof direction === 'object' &&
        typeof direction.x === 'number' && Number.isFinite(direction.x) &&
        typeof direction.z === 'number' && Number.isFinite(direction.z)
    );
}

// Coerce a wire-supplied input sequence to a finite, non-negative integer.
// Returns null when the value can't be made into one (NaN, Infinity, non-
// numeric) so the caller can reject the input instead of latching a poisoned
// sequence number. Fractional values floor; negatives clamp to 0.
export function coerceInputSequence(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.floor(n));
}

// P-SEC-4 (b): DoS cap on the per-dog pending-input queue. A hostile client can
// push playerInput frames far faster than the 60Hz tick drains them; without a
// bound the queue grows without limit (memory) and a single tick that drained
// the whole backlog would do unbounded work. We keep only the most recent
// MAX_PENDING_INPUTS at enqueue (newest wins — stale inputs are worthless to an
// authoritative sim that already advanced past them) and process at most one per
// dog per tick. A legitimate client at 144Hz only ever has ~2-3 queued between
// 60Hz ticks, so this cap is generous: it only bites a flooder.
export const MAX_PENDING_INPUTS = 8;

// P2-DELTA: degenerate-frame rule (design doc section 3.6). When more than
// this fraction of the flock changed since the previous broadcast frame, a
// delta would approach keyframe size anyway - send a keyframe instead, which
// also rebuilds the diff basis. Bounds the worst case (mass panic, round
// start) at today's full-snapshot cost.
const DELTA_DEGENERATE_FRACTION = 0.85;

// P0-OBS: tick-health thresholds. A 60Hz tick has a ~16.7ms budget; a tick
// that measures past TICK_OVERRUN_THRESHOLD_MS emits a `tick_overrun` event.
// The emission itself is rate-limited to one line per
// TICK_OVERRUN_LOG_INTERVAL_MS per room; overruns inside the window are
// counted and reported as `suppressed` on the next emitted line. There is
// deliberately NO logging on the happy path.
const TICK_OVERRUN_THRESHOLD_MS = 16;
const TICK_OVERRUN_LOG_INTERVAL_MS = 5000;

// P2-BACKPRESSURE: tick-variance health. tick_overrun above catches single
// spikes; this catches sustained degradation, where most ticks are
// individually near budget but the cadence as a whole has gone ragged (CPU
// contention on the isolate, a too-heavy room). We keep a rolling window of
// the last TICK_HEALTH_WINDOW_TICKS inter-tick intervals (300 ticks = 5s at
// 60Hz) in a preallocated ring buffer; the happy-path cost is one
// Float64Array slot write + one modulo per tick, zero allocation. Each time
// the ring completes a full pass (every ~5s of real time) we sort one copy
// and take the p95: past TICK_HEALTH_P95_BOUND_MS we emit a single
// `tick_health_degraded` line, rate-limited to one per
// TICK_HEALTH_LOG_INTERVAL_MS like tick_overrun. Bound rationale: the nominal
// interval is 16.7ms and a couple of ms of setInterval jitter is normal; p95
// at 24ms means at least 5% of the last ~5s of ticks ran at 1.44x the budget
// or worse - a sustained deficit, not noise. Inter-tick interval (not
// intra-tick duration) is the sampled quantity because Workers freeze the
// clock during synchronous execution, so an overrunning tick is only visible
// as the NEXT tick firing late.
export const TICK_HEALTH_WINDOW_TICKS = 300;
export const TICK_HEALTH_P95_BOUND_MS = 24;
const TICK_HEALTH_LOG_INTERVAL_MS = 5000;

// P2-BACKPRESSURE: fixed-size ring of tick-interval samples. push() is the
// per-tick hot path: one slot write, one counter increment, no allocation.
// p95() allocates (copy + sort) and is only called when push() reports a
// completed pass over the ring - once per window, every ~5s of real time.
// Exported so the threshold logic is unit-testable in isolation.
export class TickHealthWindow {
    constructor(size = TICK_HEALTH_WINDOW_TICKS) {
        this.size = size;
        this.buf = new Float64Array(size);
        this.count = 0;
    }

    // Record one inter-tick interval. Returns true when this sample completed
    // a full pass over the ring (the caller's cue to evaluate p95).
    push(ms) {
        this.buf[this.count % this.size] = ms;
        this.count++;
        return this.count % this.size === 0;
    }

    // Nearest-rank 95th percentile of the samples currently in the ring.
    p95() {
        const n = Math.min(this.count, this.size);
        if (n === 0) return 0;
        const sorted = Array.from(this.buf.subarray(0, n)).sort((a, b) => a - b);
        return sorted[Math.min(n - 1, Math.floor(0.95 * n))];
    }
}

// P-PERF-2: per-tick allocation reduction.
//
// `validateEntityState` (shared/MovementPhysics.js) only ever reads its
// fallback by calling `fallbackPosition.clone()` when an entity's position
// went non-finite — it never aliases or mutates the argument. So the two
// hot-loop call sites can share a single frozen module-level constant each
// instead of constructing a fresh `new Vector2D(...)` every entity, every
// tick. The clone-on-use contract keeps this aliasing-safe and the produced
// position byte-identical to the old per-call literal.
const DOG_VALIDATE_FALLBACK = new Vector2D(0, 0);
const SHEEP_VALIDATE_FALLBACK = new Vector2D(-20, -20);

// P2-DOSPILL: reusable scratch vector for calculateGateAttraction. The DO is
// single-threaded and the caller (updateSheep's gate-seek branch) only reads
// the returned steer via acceleration.add(...) before the next call, so one
// module-level instance reused per call is aliasing-safe. The math performed
// on it is operation-for-operation identical to the old clone()-based chain.
const GATE_STEER_SCRATCH = new Vector2D(0, 0);

// Hoisted named predicate for the per-tick "active sheep" filter in
// updateSheep(). Defined once at module scope so the filter does not allocate
// a fresh closure every tick (and so the filter itself runs once per tick
// rather than once per sheep — see updateSheep()). state === 0 is the active
// state (1 = retiring, 2 = grazing).
function isActiveSheep(s) {
    return s.state === 0;
}

// P2-DELTA: flat key/value compare of two quantized sheep wire records
// (design doc 3.4). A sheep is "changed" iff its record differs from the
// previous broadcast frame's record in any key's PRESENCE or VALUE - the
// conditional keys (`killed`, `assignedGate`, `targetX`/`targetZ`) appearing
// or disappearing are differences, so state transitions, retirement, gate
// passage, survival kills/dormancy, and competitive slot-reuse respawns (the
// `id` changing in place) all register without special-casing. The records
// are already quantized to the wire quantum (0.01) by the snapshot, so there
// is no second epsilon. Records are flat (scalars only), so a per-key
// Object.is is a complete comparison; equal key counts + every current key
// matching means the previous record cannot hold extra keys either.
// Object.is (not ===) so a 0 <-> -0 flip (a sheep stopping leaves vx = -0)
// counts as a change: msgpack encodes -0 and 0 differently, and the client
// reconstruction must reproduce the snapshot EXACTLY, not just numerically.
function sheepRecordChanged(rec, prev) {
    if (!prev) return true;
    const keys = Object.keys(rec);
    if (keys.length !== Object.keys(prev).length) return true;
    for (const k of keys) {
        if (!Object.is(rec[k], prev[k])) return true;
    }
    return false;
}

export class GameSimulation {
    constructor(room) {
        this.room = room;
        this.isRunning = false;
        this.tickRate = 60; // 60 FPS server simulation
        this.deltaTime = 1 / this.tickRate;
        this.lastTickTime = 0;
        this.tickInterval = null;

        // P0-OBS: tick_overrun rate-limit state (see _recordTickHealth).
        this._tickOverrunLastLog = 0;
        this._tickOverrunSuppressed = 0;

        // P2-BACKPRESSURE: rolling tick-interval window + tick_health_degraded
        // rate-limit state (see _recordTickHealth).
        this._tickHealthWindow = new TickHealthWindow();
        this._tickHealthLastLog = 0;
        
        // Determine game mode
        this.isCompetitive = room.gameMode === 'competitive';
        this.isTimedMode = room.gameMode === 'timed';
        // Cycle 67: co-op survival. Authoritative survival run + wolves + pen on
        // the DO (shared/survival/*), broadcast for clients to render. Only valid
        // on a scene that declares `survival` (gated again in _initSurvival).
        this.isSurvival = room.gameMode === 'survival';
        const playerIds = Array.from(room.players.keys());

        // Load scene (biome data). Room can override via `room.sceneId`; falls back to default.
        this.scene = loadScene(room.sceneId || DEFAULT_SCENE_ID);

        // P-DET-1 (option c): per-game seed for reproducible spawn + retirement
        // placement. Drawn ONCE here (the only intentionally non-deterministic
        // draw — it's the per-game variety source, recorded for replay, NOT in
        // the per-tick path). Prefer the seed the DO persisted in RoomMeta so a
        // replay reproduces the exact layout; fall back to a fresh in-memory
        // draw when the adapter didn't supply one (tests, standalone sims).
        // This seed is server-side only: it is never written into
        // getSerializableState / createGameStateSnapshot / any wire payload —
        // clients copy positions from the snapshot, so they never need it.
        this.seed = (typeof room.seed === 'number' && Number.isFinite(room.seed))
            ? (room.seed >>> 0)
            : ((Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0);
        // One stateful mulberry32 reused across the whole game. The single-
        // threaded DO tick order makes the draw sequence deterministic given
        // the seed; passed into every spawn/retirement call in shared/.
        this.rng = mulberry32(this.seed);
        this.sheepCollisionScratch = createSheepCollisionScratch();

        // Timed mode specific properties
        if (this.isTimedMode) {
            this.gameStartTime = null;
            this.gameDuration = 3 * 60 * 1000; // 3 minutes in ms
            this.sheepRemovalQueue = []; // Track sheep to remove after 5s
            // Cycle 8 Phase 5: nextSheepId starts past the initial flock so
            // respawned sheep don't collide with existing IDs. With variable
            // room sheepCount, this needs to be at least the actual count.
            this.nextSheepId = (typeof room.sheepCount === 'number' && room.sheepCount > 0)
                ? room.sheepCount
                : 200;
        }
        
        // Cycle 8 Phase 5: room-level sheep count overrides the scene default.
        // Falls back to scene default if room hasn't been migrated yet.
        let roomSheepCount = (typeof room.sheepCount === 'number' && room.sheepCount > 0)
            ? room.sheepCount
            : this.scene.sheepSpawn.count;

        // Cycle 67 P3: a survival room's sheep array is the FULL pool sized to
        // maxFlock. Only `startFlock` are active at first; the rest are dormant
        // and get activated as the run grows the flock each surviving dawn
        // (_growSurvivalFlock). The pool is authoritative regardless of the
        // room's sheepCount (survival has no count selector).
        if (this.isSurvival && this.scene.survival) {
            roomSheepCount = this.scene.survival.maxFlock ?? roomSheepCount;
        }

        // Initialize game state based on mode
        if (this.isCompetitive || this.isTimedMode) {
            this.gameState = createCompetitiveGameState({
                totalSheep: roomSheepCount,
                bounds: this.scene.bounds
            }, playerIds);
        } else {
            // Use cooperative mode (existing logic)
            this.gameState = createGameState({
                sceneId: this.scene.id,
                totalSheep: roomSheepCount,
                bounds: this.scene.bounds
            });
        }
        
        // Configuration for entities (2x faster for multiplayer)
        // Cycle 5+: scenes can override boid params via `scene.flocking` (e.g.
        // larger neighbour radius for the bigger Open Country island, looser
        // cohesion for the woodland feel). The override merges over the
        // multiplayer baseline.
        this.sheepConfig = createBoidConfig({
            maxSpeed: 0.24,
            maxForce: 0.05,
            perceptionRadius: 6,
            separationDistance: 2.5,
            ...(this.scene.flocking || {})
        });
        
        this.dogConfigs = new Map(); // playerId -> movement config

        // Cycle 34 Phase 2: multi-stage objective state machine for scenes
        // that declare `objective` (Open Country today). Server-authoritative;
        // host migration is a no-op for stage state because the DO owns it.
        // RH/Field have no objective — `this.objective` stays null and the
        // corral retirement path runs unchanged via `isCorralOpen(null) === true`.
        this.objective = createObjective(this.scene.objective, roomSheepCount);

        // Game state broadcasting
        this.lastGameState = null;
        this.completionData = null;
        this.completionBroadcast = false;

        // P2-DELTA: monotonic sim tick counter, stamped on every wire frame as
        // the additive `tick` field (keyframes and deltas alike). 0 until the
        // first tick, so the gameStarted snapshot is tick 0 - the first
        // keyframe by the tick % KEYFRAME_INTERVAL_TICKS === 0 rule.
        this.tickCount = 0;
        // P2-DELTA: the diff basis - the previous broadcast frame's quantized
        // sheep records + its tick. The snapshot already quantizes to the wire
        // quantum (0.01) and builds fresh record objects every tick, so the
        // basis can hold the previous snapshot's array by reference (a 200-
        // record "lastWire" cache with zero copying). Rebuilt wholesale on
        // every broadcast frame; null until the first delta-path frame.
        this._wireBasis = null;
        
        // Initialize simulation state
        this.initializeSimulation();
        
        const modeName = this.isTimedMode
            ? 'timed'
            : (this.isCompetitive ? 'competitive' : (this.isSurvival ? 'survival' : 'cooperative'));
        log.info('sim_initialized', {
            roomCode: room.roomCode,
            mode: modeName,
            players: playerIds.length,
            sheep: this.gameState.totalSheep,
            sceneId: this.scene.id,
        });
    }

    initializeSimulation() {
        // Create initial sheep positions with competitive balance if needed
        const sheepSpawnConfig = {
            spreadRadius: this.scene.sheepSpawn.spreadRadius,
            centerX: this.scene.sheepSpawn.centerX,
            centerZ: this.scene.sheepSpawn.centerZ
        };
        
        // For competitive mode, use balanced spawning
        if (this.isCompetitive) {
            sheepSpawnConfig.competitiveMode = true;
            sheepSpawnConfig.competitiveGates = this.gameState.competitiveGates;
            sheepSpawnConfig.minDistanceFromGates = 35;
        }
        
        const sheepPositions = generateInitialSheepPositions(
            this.gameState.totalSheep,
            this.gameState.bounds,
            sheepSpawnConfig,
            this.rng
        );

        // Initialize sheep entities.
        //
        // P2-DELTA index-stability invariant: this loop is the ONLY place that
        // pushes into gameState.sheep. The array never reorders, grows, or
        // shrinks for the life of a round - competitive/timed "removal" reuses
        // the slot in place (updateTimedMode resets the object, the id changes
        // but the index does not) and survival pre-allocates the full maxFlock
        // pool and toggles a `dormant` flag. The delta wire protocol keys
        // changed-sheep records by ARRAY INDEX (`changed[j].i`) and the client
        // maps snapshot records onto its local flock by index, so a splice/
        // sort/push anywhere else desyncs every v3 client. A unit assertion
        // (tests/worker/delta-protocol.spec.ts) locks slot identity per mode.
        this.gameState.sheep = [];
        for (let i = 0; i < this.gameState.totalSheep; i++) {
            const position = sheepPositions[i];
            const sheep = {
                id: i,
                position: position.clone(),
                velocity: new Vector2D(0, 0),
                acceleration: new Vector2D(0, 0),
                
                // Sheep-specific properties
                hasPassedGate: false,
                isRetiring: false,
                retirementTarget: null,
                state: 0, // 0: active, 1: retiring, 2: grazing
                fleeRadius: 8,
                gateAttraction: 0.5,
                
                // Competitive mode support
                assignedGate: null, // Track which gate the sheep went through
                
                // Animation properties for client sync
                animationPhase: Math.random() * Math.PI * 2,
                facingDirection: Math.random() * Math.PI * 2
            };
            
            this.gameState.sheep.push(sheep);
        }

        // Initialize sheepdog entities for each player
        this.sheepdogs = new Map(); // playerId -> sheepdog entity
        const playerIds = Array.from(this.room.players.keys());
        
        playerIds.forEach((playerId, index) => {
            // Position dogs in different starting locations
            const angle = (index / playerIds.length) * Math.PI * 2;
            const radius = 15;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;

            // Get dog type from room player data
            const playerInfo = this.room.getPlayer(playerId);
            const dogType = playerInfo ? playerInfo.dogType : 'jep';

            const sheepdog = {
                id: playerId,
                dogType: dogType, // Store the player's selected dog type
                position: new Vector2D(x, z),
                velocity: new Vector2D(0, 0),
                acceleration: new Vector2D(0, 0),
                
                // Sheepdog properties (2x faster for multiplayer)
                maxSpeed: 30,
                sprintSpeed: 50,
                maxStamina: 100,
                stamina: 100,
                isSprinting: false,
                
                // Add rotation tracking
                rotation: 0,
                targetRotation: 0,
                
                // Player input tracking
                inputSequence: 0,
                lastInputTime: 0,
                pendingInputs: [],

                // Cycle 61 P5: bark state. barkForward latches the facing unit
                // vector (velocity-normalized, no trig) for the deterministic
                // impulse; lastBarkTime gates the server-side bark cooldown
                // (anti-spam trust boundary, authoritative over the client).
                barkForward: { x: 0, z: 1 },
                lastBarkTime: 0
            };

            this.sheepdogs.set(playerId, sheepdog);
            
            // Create movement config for this dog (2x faster for multiplayer)
            this.dogConfigs.set(playerId, createMovementConfig({
                maxSpeed: sheepdog.maxSpeed, // Already 2x (30)
                acceleration: 80, // 2x acceleration for responsiveness
                deceleration: 100  // 2x deceleration for snappier stops
            }));
        });

        // Set game as active
        this.gameState.gameActive = true;

        // Cycle 67 P3: stand up the authoritative survival subsystem (run economy,
        // wolves, pen barrier, day clock) once the flock + dogs exist.
        if (this.isSurvival && this.scene.survival) {
            this._initSurvival();
        }
    }

    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.lastTickTime = Date.now();
        
        // Start game timer for timed mode
        if (this.isTimedMode) {
            this.gameStartTime = Date.now();
        }
        
        // Start the simulation loop
        this.tickInterval = setInterval(() => {
            this.tick();
        }, 1000 / this.tickRate);

        log.info('sim_started', { roomCode: this.room.roomCode, tickRate: this.tickRate });
    }

    stop() {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }

        log.info('sim_stopped', { roomCode: this.room.roomCode });
    }

    tick() {
        if (!this.isRunning) return;

        const currentTime = Date.now();

        // P-SEC-3: wrap the whole tick body so a single malformed input (or any
        // unexpected throw in a per-tick subsystem) can never abort the broadcast
        // loop for the entire room. Before this, an exception anywhere in
        // processPlayerInputs/updateSheep/etc. propagated out of the setInterval
        // callback and the room silently stopped advancing for everyone. We log
        // and let the next tick try again; the input validation above means a
        // hostile input is dropped long before it reaches here, so this is the
        // backstop, not the primary defence.
        try {
            // P2-DELTA: advance the wire tick. Incremented before the snapshot
            // is built so the frame broadcast for this tick carries its number.
            this.tickCount++;

            // Process player inputs
            this.processPlayerInputs();

            // Update sheepdog physics
            this.updateSheepdogs();

            // Update sheep behavior and movement
            this.updateSheep();

            // Cycle 34 Phase 2: advance the multi-stage objective. No-op when
            // there's no objective or stage is already 'drive'. Mutates
            // this.objective in place — `createGameStateSnapshot` reads the
            // post-tick state for the optional `objective` wire field.
            if (this.objective) {
                tickObjective(this.objective, this.gameState.sheep, this.deltaTime, null);
            }

            // Cycle 67 P3: advance the authoritative survival subsystem (day
            // clock, run economy, wolves, pen). Runs AFTER updateSheep so the pen
            // corrects final sheep positions and the wolves see the settled flock.
            if (this.isSurvival && this._survival) {
                this._tickSurvival(this.deltaTime);
            }

            // Update timed mode specific logic
            if (this.isTimedMode) {
                this.updateTimedMode(currentTime);
            }

            // Check game completion
            this.checkGameCompletion();

            // Broadcast state to all clients in room
            this.broadcastGameState();
        } catch (e) {
            log.error('tick_error', { roomCode: this.room?.roomCode, error: errStr(e) });
        }

        // P0-OBS: tick health. Happy path is one Date.now() + two compares.
        this._recordTickHealth(currentTime);

        this.lastTickTime = currentTime;
    }

    // P0-OBS: emit `tick_overrun` when a tick blows the 60Hz budget. Two
    // measures, either can trigger:
    //   - intraMs: wall time spent inside this tick body. Accurate in node /
    //     vitest / `wrangler dev`; reads ~0 in production because Workers
    //     freeze the clock during synchronous execution (Spectre mitigation).
    //   - lateMs: how far past the nominal interval this tick fired relative
    //     to the previous tick's start. Accurate everywhere (the clock
    //     advances at the I/O boundary between setInterval callbacks), so an
    //     overrunning tick surfaces as the NEXT tick firing late.
    // Emission is rate-limited to one log per TICK_OVERRUN_LOG_INTERVAL_MS per
    // room; overruns inside the window increment `suppressed` and are reported
    // on the next emitted line. No logging at all when ticks are on budget.
    _recordTickHealth(tickStart) {
        const nominalMs = 1000 / this.tickRate;
        const intraMs = Date.now() - tickStart;
        const lateMs = this.lastTickTime > 0
            ? (tickStart - this.lastTickTime) - nominalMs
            : 0;
        // P2-BACKPRESSURE: tick-variance window. Sample the inter-tick
        // interval (accurate in production, unlike intraMs - see the
        // TICK_HEALTH_* constant block). The window is only evaluated when
        // the ring completes a full pass, every ~5s; the per-tick cost here
        // is one slot write.
        if (this.lastTickTime > 0 && this._tickHealthWindow.push(tickStart - this.lastTickTime)) {
            const p95 = this._tickHealthWindow.p95();
            if (p95 > TICK_HEALTH_P95_BOUND_MS
                && tickStart - this._tickHealthLastLog >= TICK_HEALTH_LOG_INTERVAL_MS) {
                log.warn('tick_health_degraded', {
                    roomCode: this.room?.roomCode,
                    p95Ms: Math.round(p95 * 100) / 100,
                    boundMs: TICK_HEALTH_P95_BOUND_MS,
                    windowTicks: this._tickHealthWindow.size,
                });
                this._tickHealthLastLog = tickStart;
            }
        }
        if (intraMs <= TICK_OVERRUN_THRESHOLD_MS && lateMs <= TICK_OVERRUN_THRESHOLD_MS) return;
        this._tickOverrunSuppressed++;
        if (tickStart - this._tickOverrunLastLog < TICK_OVERRUN_LOG_INTERVAL_MS) return;
        log.warn('tick_overrun', {
            roomCode: this.room?.roomCode,
            durationMs: intraMs,
            lateMs: Math.max(0, Math.round(lateMs)),
            suppressed: this._tickOverrunSuppressed - 1,
        });
        this._tickOverrunLastLog = tickStart;
        this._tickOverrunSuppressed = 0;
    }

    processPlayerInputs() {
        for (const [playerId, sheepdog] of this.sheepdogs.entries()) {
            // P-SEC-4 (b): process at most ONE input per dog per tick. Draining
            // the whole queue per tick (the old `while`) let a flooder's backlog
            // do work proportional to how fast they sent, turning the input
            // channel into a per-tick CPU-amplification lever. One-per-tick caps
            // per-dog work at O(1) regardless of queue depth; the freshness
            // (`seq <= inputSequence`) check in applyPlayerInput already makes
            // superseded queued inputs no-ops, and we keep the newest at enqueue,
            // so dropping older queued frames here costs nothing a client relies
            // on. The 60Hz tick still consumes one fresh input every ~16ms.
            if (sheepdog.pendingInputs.length > 0) {
                const input = sheepdog.pendingInputs.shift();
                this.applyPlayerInput(playerId, input);
            }
        }
    }

    applyPlayerInput(playerId, input) {
        const sheepdog = this.sheepdogs.get(playerId);
        if (!sheepdog) return;

        const { direction, sprint, inputSequence, timestamp, clientPosition } = input;

        // P-SEC-3: trust boundary. Reject a missing/non-finite direction before
        // it reaches Vector2D — a NaN here latches into sheepdog.position and
        // desyncs the room. Defence in depth: RoomDO already drops this shape at
        // ingress, but applyPlayerInput is also reachable from pendingInputs and
        // from tests, so guard here too.
        if (!isValidInputDirection(direction)) {
            return;
        }

        // P-SEC-3: coerce the sequence to a finite integer. Without this an
        // Infinity (which slipped through RoomDO's `?? 0` chain) would pass the
        // `<=` freshness check once and then pin sheepdog.inputSequence at
        // Infinity, freezing the dog for the rest of the game. null => reject.
        const seq = coerceInputSequence(inputSequence);
        if (seq === null) {
            return;
        }

        // Validate input sequence to prevent old/duplicate inputs
        if (seq <= sheepdog.inputSequence) {
            return; // Ignore old input
        }

        sheepdog.inputSequence = seq;
        sheepdog.lastInputTime = timestamp;

        // Apply movement input
        const targetVelocity = new Vector2D(direction.x, direction.z);
        const currentMaxSpeed = sprint && sheepdog.stamina > 10 ? sheepdog.sprintSpeed : sheepdog.maxSpeed;
        
        if (targetVelocity.magnitude() > 0) {
            targetVelocity.normalize().multiply(currentMaxSpeed);
        }

        // Handle client-sent stopping position for smooth reconciliation
        if (clientPosition && targetVelocity.magnitude() === 0) {
            const dx = clientPosition.x - sheepdog.position.x;
            const dz = clientPosition.z - sheepdog.position.z;
            const d2 = dx * dx + dz * dz;
            // Fail closed: NaN/Infinity (or a >5m jump) rejects. Phrasing the
            // guard as !(d2 <= 25) means a non-finite clientPosition can't slip
            // past the clamp and latch isInterpolatingToClient on a NaN target.
            if (!(d2 <= 25)) {
                log.warn('client_position_rejected', {
                    roomCode: this.room?.roomCode,
                    playerId,
                    deltaM: Number(Math.sqrt(d2).toFixed(2)),
                });
                return;
            }
            // Client is stopping and sent their final position
            // Set up interpolation target instead of normal physics
            sheepdog.clientStopTarget = new Vector2D(clientPosition.x, clientPosition.z);
            sheepdog.isInterpolatingToClient = true;
            
            // Immediately stop velocity to prevent further movement
            sheepdog.velocity.multiply(0);
            sheepdog.acceleration.multiply(0);
        } else {
            // Normal movement - clear any client interpolation
            sheepdog.clientStopTarget = null;
            sheepdog.isInterpolatingToClient = false;
            
            // Apply normal acceleration
            const config = this.dogConfigs.get(playerId);
            applyAcceleration(sheepdog, targetVelocity, this.deltaTime, config);
        }
        
        // Update stamina
        const staminaResult = updateStamina(sheepdog, sprint, this.deltaTime, {
            maxStamina: sheepdog.maxStamina,
            drainRate: 35,
            regenRate: 25,
            minStaminaToConsume: 10
        });
        
        sheepdog.stamina = staminaResult.current;
        sheepdog.isSprinting = staminaResult.isConsuming;

        // Cycle 61 P5: server-authoritative bark. The optional `bark` edge drives
        // the deterministic forward impulse on the flock, cooldown-gated
        // server-side (anti-spam; authoritative over the client's own predicted
        // cooldown). Forward is derived trig-free: the live velocity direction
        // when moving, else the freshly-sent input direction, else the latched
        // facing - matching the shared bark module's determinism contract.
        if (input.bark === true) {
            const nowMs = Date.now();
            if (nowMs - sheepdog.lastBarkTime >= DEFAULT_BARK_CONFIG.cooldownMs) {
                sheepdog.lastBarkTime = nowMs;
                const sp = sheepdog.velocity.magnitude();
                if (sp > 0.01) {
                    sheepdog.barkForward.x = sheepdog.velocity.x / sp;
                    sheepdog.barkForward.z = sheepdog.velocity.z / sp;
                } else if (targetVelocity.magnitude() > 0) {
                    const t = targetVelocity.magnitude();
                    sheepdog.barkForward.x = targetVelocity.x / t;
                    sheepdog.barkForward.z = targetVelocity.z / t;
                }
                applyBarkImpulse(this.gameState.sheep, sheepdog.position, sheepdog.barkForward, DEFAULT_BARK_CONFIG);
                // Cycle 67 P3: in survival, the same bark edge scares wolves at a
                // longer radial range (breaks pursuit), authoritative + reflected
                // to all clients via the broadcast. Mirrors the solo main.js path.
                if (this.isSurvival && this._survival) {
                    this._survival.wolves.repel(sheepdog.position.x, sheepdog.position.z);
                }
            }
        }
    }

    updateSheepdogs() {
        for (const [playerId, sheepdog] of this.sheepdogs.entries()) {
            // Use time-based movement for sheepdogs (like client)
            this.updateSheepdogMovementTimeStyle(sheepdog);

            // Update rotation based on movement direction
            if (sheepdog.velocity.magnitude() > 0.1) {
                sheepdog.targetRotation = -sheepdog.velocity.angle() + Math.PI / 2;
            }
            
            // Smooth rotation interpolation (similar to client)
            let rotationDiff = sheepdog.targetRotation - sheepdog.rotation;
            while (rotationDiff > Math.PI) rotationDiff -= 2 * Math.PI;
            while (rotationDiff < -Math.PI) rotationDiff += 2 * Math.PI;
            
            const rotationSpeed = 8; // Match client rotation speed
            sheepdog.rotation += rotationDiff * rotationSpeed * this.deltaTime;

            // Apply boundary constraints (boundary preferred — handles island; bounds fallback for legacy)
            const constrainedPosition = applyHardBoundaryConstraints(
                sheepdog,
                this.gameState.boundary || this.gameState.bounds,
                null,
                { margin: 1 }
            );
            
            sheepdog.position = constrainedPosition;
            
            // Validate state to prevent NaN/Infinity. P-PERF-2: shared frozen
            // fallback constant — validateEntityState clones it on use, never
            // aliases, so this is byte-identical to a fresh literal per call.
            validateEntityState(sheepdog, DOG_VALIDATE_FALLBACK);
        }
    }

    updateSheepdogMovementTimeStyle(sheepdog) {
        // Handle interpolation to client stopping position
        if (sheepdog.isInterpolatingToClient && sheepdog.clientStopTarget) {
            // Calculate distance to client target
            const targetPos = sheepdog.clientStopTarget;
            const currentPos = sheepdog.position;
            const distance = Math.sqrt(
                (targetPos.x - currentPos.x) ** 2 + 
                (targetPos.z - currentPos.z) ** 2
            );
            
            // If close enough, snap to target and stop interpolating
            if (distance < 0.05) {
                sheepdog.position.x = targetPos.x;
                sheepdog.position.z = targetPos.z;
                sheepdog.velocity.multiply(0);
                sheepdog.isInterpolatingToClient = false;
                sheepdog.clientStopTarget = null;
            } else {
                // Interpolate toward client position with high speed
                const interpolationSpeed = 8.0; // Fast interpolation
                const interpolationFactor = Math.min(interpolationSpeed * this.deltaTime, 0.8);
                
                sheepdog.position.x += (targetPos.x - currentPos.x) * interpolationFactor;
                sheepdog.position.z += (targetPos.z - currentPos.z) * interpolationFactor;
                sheepdog.velocity.multiply(0); // Keep velocity at zero during interpolation
            }
            
            // Reset acceleration during interpolation
            sheepdog.acceleration.multiply(0);
            return;
        }
        
        // Normal time-based physics when not interpolating to client
        const maxSpeed = sheepdog.isSprinting ? sheepdog.sprintSpeed : sheepdog.maxSpeed;
        const dampingFactor = 0.85; // More aggressive damping for snappier stops
        const velocitySmoothing = 0.6; // Less smoothing for more responsive movement
        const minMovementThreshold = 0.1; // Higher threshold for quicker stops

        // P2-DOSPILL: scalar form of the old clone()-based pipeline. Same
        // operations on the same values in the same order, so the result is
        // bit-identical - just without the three Vector2D allocations per call
        // (previousVelocity clone, smoothing clone, position-step clone).

        // Store previous velocity for smoothing (was: velocity.clone())
        const prevX = sheepdog.velocity.x;
        const prevZ = sheepdog.velocity.z;

        // Update velocity with acceleration (was: add + limit + multiply)
        let vx = sheepdog.velocity.x + sheepdog.acceleration.x;
        let vz = sheepdog.velocity.z + sheepdog.acceleration.z;
        // Inline Vector2D.limit: magnitude check, then normalize + rescale.
        // limit() computes the same sqrt twice (check + normalize); both see
        // identical x/z, so a single computation yields the identical value.
        const len = Math.sqrt(vx * vx + vz * vz);
        if (len > maxSpeed && len > 0.00001) {
            vx /= len;
            vz /= len;
            vx *= maxSpeed;
            vz *= maxSpeed;
        }

        // Apply velocity damping to reduce oscillations
        vx *= dampingFactor;
        vz *= dampingFactor;

        // Smooth velocity with previous velocity to reduce jittering
        // (was: previousVelocity.multiply(s).add(velocity.clone().multiply(1 - s)))
        const sx = prevX * velocitySmoothing + vx * (1 - velocitySmoothing);
        const sz = prevZ * velocitySmoothing + vz * (1 - velocitySmoothing);

        // Only apply movement if above threshold to prevent micro-movements
        if (Math.sqrt(sx * sx + sz * sz) > minMovementThreshold) {
            sheepdog.velocity.x = sx;
            sheepdog.velocity.z = sz;
            // TIME-BASED position update (WITH deltaTime) - matches client
            sheepdog.position.x += sx * this.deltaTime;
            sheepdog.position.z += sz * this.deltaTime;
        } else {
            // Stop micro-movements (was: multiply(0) on the post-damping
            // velocity - vx * 0 preserves the old -0/NaN propagation exactly)
            sheepdog.velocity.x = vx * 0;
            sheepdog.velocity.z = vz * 0;
        }

        // Reset acceleration for next frame
        sheepdog.acceleration.multiply(0);
    }

    updateSheep() {
        // P-PERF-2: compute the active-sheep set ONCE per tick before the loop,
        // using the hoisted `isActiveSheep` predicate (no per-iteration closure).
        // Previously this filter ran inside the per-sheep loop, allocating a
        // fresh O(N) array (and closure) for every active sheep — O(N^2) garbage
        // per tick at flock scale. `getNeighbors` only reads `allBoids` and
        // skips `boid === otherBoid`, so a single shared array reused for every
        // sheep's neighbor query is behavior-identical to the per-sheep rebuild.
        const activeSheep = this.gameState.sheep.filter(isActiveSheep);

        // Update each sheep using shared flocking logic
        for (let sheep of this.gameState.sheep) {
            // Skip sheep that are retiring or grazing (client handles these)
            if (sheep.state === 1 || sheep.state === 2) {
                // Just clear physics to prevent interference
                sheep.velocity.set(0, 0);
                sheep.acceleration.set(0, 0);
                continue;
            }


            // Get neighboring sheep for flocking (only consider active sheep)
            const neighbors = getNeighbors(sheep, activeSheep, this.sheepConfig.perceptionRadius);
            
            // Apply flocking behavior
            const flockingForce = calculateFlockingForce(sheep, neighbors, this.sheepConfig);
            sheep.acceleration.add(flockingForce);

            // Apply flee behavior from all sheepdogs
            for (const sheepdog of this.sheepdogs.values()) {
                const fleeForce = calculateFlee(
                    sheep,
                    sheepdog.position,
                    sheep.fleeRadius,
                    this.sheepConfig.maxSpeed,
                    this.sheepConfig.maxForce
                );
                
                if (fleeForce.magnitude() > 0) {
                    fleeForce.multiply(1.2); // Stronger flee response
                    sheep.acceleration.add(fleeForce);
                }
            }

            // Gate attraction logic (if sheep is being herded toward gate).
            // Skip for survival: the gate is the pen gate, handled by the pen
            // containment, not the boundary-gate retirement attraction.
            if (!this.isSurvival && this.shouldSeekGate(sheep)) {
                const gateForce = this.calculateGateAttraction(sheep);
                sheep.acceleration.add(gateForce);
            }

            // Boundary avoidance (skip for sheep actively passing through gates)
            // Check if sheep is in a gate passage zone
            let inGatePassageZone = false;
            if ((this.isCompetitive || this.isTimedMode) && this.gameState.competitiveGates) {
                for (const gate of this.gameState.competitiveGates) {
                    if (sheep.position.x >= gate.passageZone.minX && 
                        sheep.position.x <= gate.passageZone.maxX &&
                        sheep.position.z >= gate.passageZone.minZ && 
                        sheep.position.z <= gate.passageZone.maxZ) {
                        inGatePassageZone = true;
                        break;
                    }
                }
            } else if (!this.isSurvival && this.gameState.gate && this.gameState.gate.passageZone) {
                const zone = this.gameState.gate.passageZone;
                inGatePassageZone = sheep.position.x >= zone.minX &&
                                  sheep.position.x <= zone.maxX &&
                                  sheep.position.z >= zone.minZ && 
                                  sheep.position.z <= zone.maxZ;
            }
            
            // Only apply boundary forces if not in gate passage zone
            if (!inGatePassageZone) {
                let boundaryForce;
                if ((this.isCompetitive || this.isTimedMode) && this.gameState.competitiveGates) {
                    // Use multiple gates boundary avoidance for competitive/timed mode
                    boundaryForce = calculateBoundaryAvoidanceWithMultipleGates(
                        sheep,
                        this.gameState.bounds,
                        this.gameState.competitiveGates,
                        {
                            margin: 4,
                            maxSpeed: this.sheepConfig.maxSpeed,
                            maxForce: this.sheepConfig.maxForce
                        }
                    );
                } else {
                    // Use single gate boundary avoidance for cooperative mode.
                    // Survival passes a null gate: the pen gate is inland (handled
                    // by the pen barrier), so the coastline has no boundary gap.
                    boundaryForce = calculateBoundaryAvoidanceWithGate(
                        sheep,
                        this.gameState.boundary || this.gameState.bounds,
                        this.isSurvival ? null : this.gameState.gate,
                        {
                            margin: 4,
                            maxSpeed: this.sheepConfig.maxSpeed,
                            maxForce: this.sheepConfig.maxForce
                        }
                    );
                }
                sheep.acceleration.add(boundaryForce);
            }

            // Update movement using time-based physics calibrated to 144 FPS
            // This ensures consistent movement speed with client at all frame rates
            this.updateSheepMovementClientStyle(sheep);

            // Cycle 56: dog<->sheep hard separation. Runs after integration and
            // before the boundary clamp so the clamp re-contains any push. The
            // dog is authoritative; sheep never shove the player-controlled dog.
            resolveDogSheepCollisions(sheep, this.sheepdogs.values());

            this.applySheepBoundaryConstraint(sheep);

            // Update facing direction for animation
            if (sheep.velocity.magnitude() > 0.001) {
                sheep.facingDirection = sheep.velocity.angle();
            }

            // Validate entity state. P-PERF-2: shared frozen fallback constant
            // (cloned on use inside validateEntityState, never aliased).
            validateEntityState(sheep, SHEEP_VALIDATE_FALLBACK);
        }

        const sheepCollision = resolveSheepSheepCollisions(this.gameState.sheep, {
            scratch: this.sheepCollisionScratch,
            bounds: this.gameState.boundary || this.gameState.bounds
        });
        if (sheepCollision.moved > 0) {
            for (const index of this.sheepCollisionScratch.movedIndices) {
                const sheep = this.gameState.sheep[index];
                resolveDogSheepCollisions(sheep, this.sheepdogs.values());
                this.applySheepBoundaryConstraint(sheep);
                if (sheep.velocity.magnitude() > 0.001) {
                    sheep.facingDirection = sheep.velocity.angle();
                }
                validateEntityState(sheep, SHEEP_VALIDATE_FALLBACK);
            }
        }

        // Check for sheep retirement
        if (this.isSurvival) {
            // Cycle 67 P3: survival has no gate/corral retirement - the pen
            // containment (_tickSurvival) retires sheep herded into the pen and
            // tracks membership. Skip the gate/pasture/corral retirement paths.
        } else if (this.isCompetitive || this.isTimedMode) {
            // Use competitive retirement logic (also for timed mode)
            const retirementResult = this.isTimedMode ? 
                this.updateTimedSheepRetirements(
                    this.gameState.sheep,
                    this.gameState.competitiveGates
                ) :
                updateCompetitiveSheepRetirements(
                    this.gameState.sheep,
                    this.gameState.competitiveGates,
                    this.rng
                );
            
            // Update player scores
            for (const [playerId, newRetirements] of Object.entries(retirementResult.playerRetirements)) {
                if (this.gameState.playerScores.hasOwnProperty(playerId)) {
                    this.gameState.playerScores[playerId] += newRetirements;
                }
            }
            
            this.gameState.sheepRetired = retirementResult.totalRetired;
        } else if (this.gameState.corral) {
            // Cycle 5+: corral-based retirement (Rolling Hills). Sheep are
            // retired when they enter the corral radius instead of crossing
            // a gate. No pasture rect — random target inside the corral disc.
            //
            // Cycle 34 Phase 2: gate retirement on `isCorralOpen(this.objective)`.
            // Scenes without an objective (RH, Field) get `true` unconditionally
            // — byte-identical to pre-Phase-2 behavior. Scenes with an objective
            // (OC) only retire sheep once the round-up → drive transition fires.
            if (isCorralOpen(this.objective)) {
                const retirementResult = updateSheepCorralRetirements(
                    this.gameState.sheep,
                    this.gameState.corral,
                    this.rng
                );
                this.gameState.sheepRetired = retirementResult.totalRetired;
            }
        } else {
            // Use cooperative retirement logic
            const retirementResult = updateSheepRetirements(
                this.gameState.sheep,
                this.gameState.gate,
                this.gameState.pasture,
                this.rng
            );

            this.gameState.sheepRetired = retirementResult.totalRetired;
        }
    }

    applySheepBoundaryConstraint(sheep) {
        if (!sheep.hasPassedGate && !sheep.isRetiring) {
            let constrainedPosition;
            if ((this.isCompetitive || this.isTimedMode) && this.gameState.competitiveGates) {
                constrainedPosition = applyHardBoundaryConstraintsWithMultipleGates(
                    sheep,
                    this.gameState.bounds,
                    this.gameState.competitiveGates,
                    { margin: 0.5, allowGatePassage: true }
                );
            } else {
                constrainedPosition = applyHardBoundaryConstraints(
                    sheep,
                    this.gameState.boundary || this.gameState.bounds,
                    this.isSurvival ? null : this.gameState.gate,
                    { margin: 0.5, allowGatePassage: true }
                );
            }
            sheep.position = constrainedPosition;
        } else if (sheep.isRetiring && sheep.retirementTarget) {
            // P2-DOSPILL: inline the extended +-35m clamp (was a fresh
            // extendedBounds object literal per retiring sheep per tick).
            // Same arithmetic, same Math.max/Math.min nesting; this is the
            // form the sim-baseline harness already mirrors.
            const b = this.gameState.bounds;
            sheep.position.x = Math.max(b.minX - 35, Math.min(b.maxX + 35, sheep.position.x));
            sheep.position.z = Math.max(b.minZ - 35, Math.min(b.maxZ + 35, sheep.position.z));
        }
    }

    updateSheepMovementClientStyle(sheep) {
        // Time-based physics calibrated to 144 FPS baseline
        // This matches client behavior and ensures consistent speed
        
        const maxSpeed = this.sheepConfig.maxSpeed;
        const dampingFactor = 0.98;
        const velocitySmoothing = 0.85;
        const minMovementThreshold = 0.001;

        // P2-DOSPILL: scalar form of the old clone()-based pipeline. Same
        // operations on the same values in the same order, so the result is
        // bit-identical - just without the three Vector2D allocations per
        // sheep per tick (previousVelocity clone, smoothing clone, position-
        // step clone). The sim-baseline fixtures are the guard.

        // Store previous velocity for smoothing (was: velocity.clone())
        const prevX = sheep.velocity.x;
        const prevZ = sheep.velocity.z;

        // Update velocity with acceleration (was: add + limit + multiply)
        let vx = sheep.velocity.x + sheep.acceleration.x;
        let vz = sheep.velocity.z + sheep.acceleration.z;
        // Inline Vector2D.limit: magnitude check, then normalize + rescale.
        // limit() computes the same sqrt twice (check + normalize); both see
        // identical x/z, so a single computation yields the identical value.
        const len = Math.sqrt(vx * vx + vz * vz);
        if (len > maxSpeed && len > 0.00001) {
            vx /= len;
            vz /= len;
            vx *= maxSpeed;
            vz *= maxSpeed;
        }

        // Apply velocity damping to reduce oscillations
        vx *= dampingFactor;
        vz *= dampingFactor;

        // Smooth velocity with previous velocity to reduce jittering
        // (was: previousVelocity.multiply(s).add(velocity.clone().multiply(1 - s)))
        const sx = prevX * velocitySmoothing + vx * (1 - velocitySmoothing);
        const sz = prevZ * velocitySmoothing + vz * (1 - velocitySmoothing);

        // Only apply movement if above threshold to prevent micro-movements
        if (Math.sqrt(sx * sx + sz * sz) > minMovementThreshold) {
            sheep.velocity.x = sx;
            sheep.velocity.z = sz;
            // Time-based position update calibrated to 60 FPS baseline (server tick rate)
            const step = this.deltaTime * 60;
            sheep.position.x += sx * step;
            sheep.position.z += sz * step;
        } else {
            // Stop micro-movements (was: multiply(0) on the post-damping
            // velocity - vx * 0 preserves the old -0/NaN propagation exactly)
            sheep.velocity.x = vx * 0;
            sheep.velocity.z = vz * 0;
        }

        // Reset acceleration for next frame
        sheep.acceleration.multiply(0);
    }

    updateGrazingSheep(sheep) {
        // Server doesn't update grazing sheep - client handles it entirely
        // Just clear physics to prevent any interference
        sheep.velocity.set(0, 0);
        sheep.acceleration.set(0, 0);
        // That's it - no position updates, no movement, nothing
    }

    applyPastureContainment(sheep) {
        // Keep sheep within pasture bounds
        const pastureMargin = 2;
        const steer = new Vector2D(0, 0);
        
        let targetPasture;
        
        if ((this.isCompetitive || this.isTimedMode) && this.gameState.competitiveGates && sheep.assignedGate !== null) {
            // Find the pasture for the assigned gate in competitive/timed mode
            const assignedGate = this.gameState.competitiveGates.find(gate => gate.id === sheep.assignedGate);
            targetPasture = assignedGate ? assignedGate.pasture : this.gameState.competitiveGates[0].pasture;
        } else if ((this.isCompetitive || this.isTimedMode) && this.gameState.competitiveGates) {
            // If no assigned gate yet, use the closest pasture
            let closestPasture = this.gameState.competitiveGates[0].pasture;
            let closestDistance = Infinity;
            
            for (const gate of this.gameState.competitiveGates) {
                const centerX = (gate.pasture.minX + gate.pasture.maxX) / 2;
                const centerZ = (gate.pasture.minZ + gate.pasture.maxZ) / 2;
                const distance = Math.sqrt(
                    (sheep.position.x - centerX) ** 2 + 
                    (sheep.position.z - centerZ) ** 2
                );
                
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestPasture = gate.pasture;
                }
            }
            
            targetPasture = closestPasture;
        } else {
            // Use cooperative mode pasture
            targetPasture = this.gameState.pasture;
        }
        
        // Use distance-based forces for smoother boundaries
        const distToMinX = sheep.position.x - targetPasture.minX;
        const distToMaxX = targetPasture.maxX - sheep.position.x;
        const distToMinZ = sheep.position.z - targetPasture.minZ;
        const distToMaxZ = targetPasture.maxZ - sheep.position.z;
        
        if (distToMinX < pastureMargin) {
            steer.x = 0.02 * (1 - distToMinX / pastureMargin);
        } else if (distToMaxX < pastureMargin) {
            steer.x = -0.02 * (1 - distToMaxX / pastureMargin);
        }
        
        if (distToMinZ < pastureMargin) {
            steer.z = 0.02 * (1 - distToMinZ / pastureMargin);
        } else if (distToMaxZ < pastureMargin) {
            steer.z = -0.02 * (1 - distToMaxZ / pastureMargin);
        }
        
        if (steer.magnitude() > 0) {
            sheep.acceleration.add(steer);
        }
    }

    shouldSeekGate(sheep) {
        // Check if any sheepdog is nearby and sheep should be attracted to gate
        for (const sheepdog of this.sheepdogs.values()) {
            // For competitive/timed mode, find the closest gate
            if ((this.isCompetitive || this.isTimedMode) && this.gameState.competitiveGates) {
                let closestGate = null;
                let closestDistance = Infinity;
                
                for (const gate of this.gameState.competitiveGates) {
                    const distanceToGate = sheep.position.distanceTo(gate.position);
                    if (distanceToGate < closestDistance) {
                        closestDistance = distanceToGate;
                        closestGate = gate;
                    }
                }
                
                if (closestGate) {
                    const distanceToDog = sheep.position.distanceTo(sheepdog.position);

                    if (distanceToDog < sheep.fleeRadius * 1.5 && closestDistance < 30) {
                        // P2-DOSPILL: inline the dot product (was two
                        // clone().subtract() temporaries per check). Same
                        // subtractions, same products, same order.
                        const toGateX = closestGate.position.x - sheep.position.x;
                        const toGateZ = closestGate.position.z - sheep.position.z;
                        const toDogX = sheepdog.position.x - sheep.position.x;
                        const toDogZ = sheepdog.position.z - sheep.position.z;

                        const dotProduct = toGateX * toDogX + toGateZ * toDogZ;
                        if (dotProduct < 0) { // Gate is opposite direction from dog
                            return true;
                        }
                    }
                }
            } else if (this.gameState.gate) {
                // Cooperative mode - single gate. Cycle 5+ corral scenes
                // (Rolling Hills, Open Country) have no gate, so the gate-seek
                // pathway is skipped — corral retirement runs client-side.
                const distanceToGate = sheep.position.distanceTo(this.gameState.gate.position);
                const distanceToDog = sheep.position.distanceTo(sheepdog.position);

                if (distanceToDog < sheep.fleeRadius * 1.5 && distanceToGate < 30) {
                    // P2-DOSPILL: inline the dot product (was two
                    // clone().subtract() temporaries per check). Same
                    // subtractions, same products, same order.
                    const toGateX = this.gameState.gate.position.x - sheep.position.x;
                    const toGateZ = this.gameState.gate.position.z - sheep.position.z;
                    const toDogX = sheepdog.position.x - sheep.position.x;
                    const toDogZ = sheepdog.position.z - sheep.position.z;

                    const dotProduct = toGateX * toDogX + toGateZ * toDogZ;
                    if (dotProduct < 0) { // Gate is opposite direction from dog
                        return true;
                    }
                }
            }
        }
        return false;
    }

    calculateGateAttraction(sheep) {
        let targetGate;
        
        if ((this.isCompetitive || this.isTimedMode) && this.gameState.competitiveGates) {
            // Find the closest gate for competitive/timed mode
            let closestGate = null;
            let closestDistance = Infinity;
            
            for (const gate of this.gameState.competitiveGates) {
                const distanceToGate = sheep.position.distanceTo(gate.position);
                if (distanceToGate < closestDistance) {
                    closestDistance = distanceToGate;
                    closestGate = gate;
                }
            }
            
            targetGate = closestGate;
        } else {
            // Use single gate for cooperative mode
            targetGate = this.gameState.gate;
        }
        
        if (!targetGate) {
            return GATE_STEER_SCRATCH.set(0, 0);
        }

        // P2-DOSPILL: scratch reuse. set(gate.x - sheep.x, ...) produces the
        // same components as the old clone().subtract(); the method chain
        // below is unchanged, so every float op matches the old code exactly.
        const desired = GATE_STEER_SCRATCH.set(
            targetGate.position.x - sheep.position.x,
            targetGate.position.z - sheep.position.z
        );
        desired.normalize();
        desired.multiply(this.sheepConfig.maxSpeed);

        const steer = desired.subtract(sheep.velocity);
        steer.limit(this.sheepConfig.maxForce);
        steer.multiply(sheep.gateAttraction);

        return steer;
    }

    checkGameCompletion() {
        if (this.gameState.gameCompleted) return;

        // Cycle 67 P3: survival completes only when the run ends (a 33%+ night
        // loss), driven by _endSurvivalRun. The sheep-retired completion checks
        // below do not apply (penned sheep are "home", not "won").
        if (this.isSurvival) return;

        let completionResult;
        
        if (this.isCompetitive || this.isTimedMode) {
            // Check competitive/timed completion conditions
            const playerCount = Object.keys(this.gameState.playerScores).length;
            
            // For timed mode, only complete when timer expires
            if (this.isTimedMode) {
                // Timed mode only completes via timer in updateTimedMode
                return;
            }
            
            completionResult = checkCompetitiveCompletion(
                this.gameState.playerScores,
                playerCount,
                this.gameState.totalSheep
            );
            
            if (completionResult.isComplete) {
                this.gameState.gameCompleted = true;
                this.completionData = {
                    completedAt: Date.now(),
                    isCompetitive: true,
                    isTimedMode: this.isTimedMode,
                    competitive: {
                        winner: completionResult.winner,
                        winType: completionResult.winType,
                        finalScores: completionResult.finalScores,
                        playerRankings: this.calculatePlayerRankings(completionResult.finalScores),
                        winCondition: this.calculateWinProgress(),
                        playerCount: Object.keys(this.gameState.playerScores).length,
                        isComplete: true
                    },
                    totalSheep: this.gameState.totalSheep,
                    gameCompleted: true
                };
                
                // Broadcast completion immediately (game_completed is logged
                // once in broadcastGameCompletion, the single funnel).
                this.broadcastGameCompletion();
            }
        } else {
            // Check cooperative completion conditions
            completionResult = checkGameCompletion(
                this.gameState.sheep,
                this.gameState.totalSheep,
                this.gameState.gameActive
            );
            
            if (completionResult.isComplete) {
                this.gameState.gameCompleted = true;
                this.completionData = {
                    completedAt: Date.now(),
                    isCompetitive: false,
                    sheepRetired: this.gameState.sheepRetired,
                    totalSheep: this.gameState.totalSheep,
                    completionPercentage: completionResult.completionPercentage
                };
                
                // Broadcast completion immediately (game_completed is logged
                // once in broadcastGameCompletion, the single funnel).
                this.broadcastGameCompletion();
            }
        }
    }

    broadcastGameState() {
        // Create state snapshot for clients
        const gameStateSnapshot = this.createGameStateSnapshot();
        
        // Store last game state for external access
        this.lastGameState = gameStateSnapshot;
        
        // Broadcasting will be handled by the server through periodic polling
        // The server will call getLatestGameState() to get updates
    }

    broadcastGameCompletion() {
        if (!this.gameState.gameCompleted || this.completionBroadcast) return;
        
        this.completionBroadcast = true;

        // P0-OBS: the single game-completion log line. Every completion path
        // (competitive, timed, cooperative, survival) funnels through here.
        log.info('game_completed', {
            roomCode: this.room.roomCode,
            mode: this.isTimedMode
                ? 'timed'
                : (this.isCompetitive ? 'competitive' : (this.isSurvival ? 'survival' : 'cooperative')),
            winner: this.completionData.competitive?.winner,
            winType: this.completionData.competitive?.winType,
            sheepRetired: this.completionData.sheepRetired,
            totalSheep: this.completionData.totalSheep,
            survivalPeak: this.completionData.survival?.score,
            survivalDay: this.completionData.survival?.day,
        });

        // Submit scores to leaderboard for multiplayer games. Delegated to the DO.
        // Cycle 67 P3/P7: survival posts each player's peak flock (the DO's
        // onSubmitScores routes survival to the party-size-partitioned board).
        if ((this.isCompetitive || this.isTimedMode || this.isSurvival) && this.room.onSubmitScores) {
            try { this.room.onSubmitScores(this.gameState.playerScores, this.completionData); }
            catch (e) { log.error('score_error', { roomCode: this.room.roomCode, path: 'sim_submit', error: errStr(e) }); }
        }

        if (this.room.broadcastToRoom) {
            this.room.broadcastToRoom('gameComplete', this.completionData);
        }

        setTimeout(() => {
            this.stop();
            if (this.room.finishGame) this.room.finishGame();

            if (this.room.isPublic && this.room.broadcastToRoom) {
                // Survival public rooms stay survival (don't cycle into the
                // coop/competitive/timed rotation).
                if (!this.room.modeLocked && !this.isSurvival) {
                    const modeCycle = { cooperative: 'competitive', competitive: 'timed', timed: 'cooperative' };
                    this.room.gameMode = modeCycle[this.room.gameMode] || 'cooperative';
                }
                this.room.state = 'waiting';
                this.room.simulation = null;
                this.room.lastActivity = Date.now();
                log.info('room_mode_cycled', { roomCode: this.room.roomCode, gameMode: this.room.gameMode });
                this.room.broadcastToRoom('roomUpdated', {
                    room: this.room.getSerializableState ? this.room.getSerializableState() : null,
                });
            }
        }, 1000);
    }

    // Get the latest game state for server broadcasting
    getLatestGameState() {
        return this.lastGameState;
    }

    // -----------------------------------------------------------------------
    // P2-DELTA: delta wire frames (docs/hardening/delta-protocol-design.md).
    // Pure transport: everything below serializes the output of
    // createGameStateSnapshot differently - it reads nothing the snapshot does
    // not already read and writes nothing into the sim.
    // -----------------------------------------------------------------------

    /**
     * The frame the delta-capable (v >= DELTA_MIN_PROTOCOL_VERSION) cohort
     * should receive this broadcast interval. Called by the RoomDO broadcast
     * loop EVERY interval (even when the v3 cohort is empty) so the diff basis
     * always tracks the previous broadcast frame - that is what lets a unicast
     * keyframe at tick T be followed by the shared broadcast delta for the next
     * tick with `baseTick === T` (design section 4 consistency note).
     *
     * Returns null before the first snapshot, otherwise:
     *   { kind: 'keyframe', state }  - send the full snapshot as gameStateUpdate
     *     (tick % KEYFRAME_INTERVAL_TICKS === 0, no basis yet, or the
     *     degenerate-frame rule fired);
     *   { kind: 'delta', frame }     - send frame as gameStateDelta.
     */
    getDeltaPathFrame() {
        const state = this.lastGameState;
        if (!state) return null;
        const basis = this._wireBasis;

        // Duplicate-tick frame (design 3.7): the 16ms broadcast loop fired
        // before the sim ticked again. Preserve the cadence with an empty
        // delta (the client jitter estimator sizes interpolationDelay from
        // packet intervals); the basis is already this tick's records.
        if (basis && basis.tick === state.tick) {
            return { kind: 'delta', frame: this._buildDeltaFrame(state, [], state.tick) };
        }

        let keyframe = !basis || state.tick % KEYFRAME_INTERVAL_TICKS === 0;
        let changed = null;
        if (!keyframe) {
            changed = [];
            const sheep = state.sheep;
            const prev = basis.sheep;
            for (let i = 0; i < sheep.length; i++) {
                const rec = sheep[i];
                if (sheepRecordChanged(rec, prev[i])) changed.push({ i, ...rec });
            }
            // Degenerate-frame rule: past 85% changed, a keyframe is barely
            // bigger and rebuilds the basis for free.
            if (changed.length > sheep.length * DELTA_DEGENERATE_FRACTION) keyframe = true;
        }

        const baseTick = basis ? basis.tick : null;
        // Advance the basis to this frame's quantized records (by reference -
        // the snapshot builds fresh record objects every tick).
        this._wireBasis = { tick: state.tick, sheep: state.sheep };

        if (keyframe) return { kind: 'keyframe', state };
        return { kind: 'delta', frame: this._buildDeltaFrame(state, changed, baseTick) };
    }

    /**
     * Assemble a gameStateDelta payload (design section 3.3). Top-level
     * scalars, the full sheepdogs array, and the conditional blocks ride every
     * delta with snapshot-identical semantics; only unchanged sheep are
     * omitted. `changed[j]` is the full quantized sheep record plus its array
     * index `i`. The RoomDO send path adds `t: 'gameStateDelta'`.
     */
    _buildDeltaFrame(state, changed, baseTick) {
        const frame = {
            v: state.v,
            tick: state.tick,
            baseTick,
            timestamp: state.timestamp,
            sheepRetired: state.sheepRetired,
            totalSheep: state.totalSheep,
            gameCompleted: state.gameCompleted,
            isCompetitive: state.isCompetitive,
            isTimedMode: state.isTimedMode,
            changed,
            sheepdogs: state.sheepdogs,
        };
        if (state.competitive) frame.competitive = state.competitive;
        if (state.timedMode) frame.timedMode = state.timedMode;
        if (state.objective) frame.objective = state.objective;
        if (state.survival) frame.survival = state.survival;
        if (state.wolves) frame.wolves = state.wolves;
        return frame;
    }

    // Get completion data if game is complete
    getCompletionData() {
        return this.completionData;
    }

    // Handle player input from network
    handlePlayerInput(playerId, inputData) {
        const sheepdog = this.sheepdogs.get(playerId);
        if (!sheepdog) return;

        // Add input to pending queue for processing on next tick
        sheepdog.pendingInputs.push({
            ...inputData,
            timestamp: Date.now()
        });

        // P-SEC-4 (b): bound the queue to the most recent MAX_PENDING_INPUTS.
        // A flooder pushing thousands of frames between ticks would otherwise
        // grow this array without limit. Newest-wins: an authoritative sim only
        // cares about the freshest input (it already advanced past older ones),
        // so shifting the oldest off is lossless for legitimate play. Combined
        // with one-per-tick draining in processPlayerInputs, total queued work
        // is hard-capped.
        while (sheepdog.pendingInputs.length > MAX_PENDING_INPUTS) {
            sheepdog.pendingInputs.shift();
        }
    }
    
    // Cleanup simulation resources
    cleanup() {
        this.stop();
        this.gameState = null;
        this.sheepdogs.clear();
        this.dogConfigs.clear();
    }

    // Get current simulation statistics
    getStats() {
        return {
            isRunning: this.isRunning,
            tickRate: this.tickRate,
            sheepCount: this.gameState.sheep.length,
            sheepRetired: this.gameState.sheepRetired,
            sheepdogCount: this.sheepdogs.size,
            gameCompleted: this.gameState.gameCompleted,
            roomCode: this.room.roomCode
        };
    }
    
    createGameStateSnapshot() {
        // Cycle 34 Phase 3: snapshot includes an optional `objective` block
        // when the scene declares a multi-stage objective (Open Country
        // today). The field is purely additive — pre-Cycle-34 clients ignore
        // it and fall back to the legacy "drive to portal" prompt; post-
        // Cycle-34 clients connecting to a pre-Cycle-34 worker receive no
        // field and do the same. No protocol-version handshake. See
        // docs/cycle-34-plan.md and .claude/rules/multiplayer.md.
        //
        // Create a lightweight state snapshot for network transmission
        const snapshot = {
            // Cycle 67 P5: the protocol version tag. Always present; pre-Cycle-67
            // clients ignore the unknown field, so non-survival frames stay
            // backward-compatible.
            v: PROTOCOL_VERSION,
            // P2-DELTA: the sim tick this snapshot was built at. Additive (old
            // clients ignore unknown fields, the Cycle 34/67 precedent); v3
            // clients use it as the delta base/drift anchor.
            tick: this.tickCount,
            timestamp: Date.now(),
            sheepRetired: this.gameState.sheepRetired,
            totalSheep: this.gameState.totalSheep,
            gameCompleted: this.gameState.gameCompleted,
            isCompetitive: this.isCompetitive,
            isTimedMode: this.isTimedMode,
            
            // Sheep positions and states (simplified for network efficiency)
            sheep: this.gameState.sheep.map(sheep => ({
                id: sheep.id,
                x: Math.round(sheep.position.x * 100) / 100, // Round to 2 decimal places
                z: Math.round(sheep.position.z * 100) / 100,
                vx: Math.round(sheep.velocity.x * 100) / 100,
                vz: Math.round(sheep.velocity.z * 100) / 100,
                state: sheep.state,
                facing: Math.round(sheep.facingDirection * 100) / 100,
                hasPassedGate: sheep.hasPassedGate,
                isRetiring: sheep.isRetiring,
                // Cycle 67 P3: survival sends `killed` for wolf-killed AND dormant
                // (not-yet-activated) sheep so the co-op client hides them (the
                // Cycle 66 OptimizedSheep killed-guard + the minimap skip). Absent
                // for every non-survival sheep, so non-survival frames are unchanged.
                ...((sheep.killed || sheep.dormant) && { killed: true }),
                ...(sheep.assignedGate !== null && { assignedGate: sheep.assignedGate }), // Include assigned gate for competitive
                // Only send retirement target if it exists (to save bandwidth)
                ...(sheep.retirementTarget && {
                    targetX: Math.round(sheep.retirementTarget.x * 100) / 100,
                    targetZ: Math.round(sheep.retirementTarget.z * 100) / 100
                })
            })),
            
            // Sheepdog positions and states
            sheepdogs: Array.from(this.sheepdogs.entries()).map(([playerId, dog]) => ({
                playerId,
                dogType: dog.dogType || 'jep', // Include dog type for client rendering
                x: Math.round(dog.position.x * 100) / 100,
                z: Math.round(dog.position.z * 100) / 100,
                vx: Math.round(dog.velocity.x * 100) / 100,
                vz: Math.round(dog.velocity.z * 100) / 100,
                rotation: Math.round(dog.rotation * 100) / 100,
                stamina: Math.round(dog.stamina),
                sprinting: dog.isSprinting,
                sequence: dog.inputSequence,
                interpolatingToClient: dog.isInterpolatingToClient || false
            }))
        };
        
        // Add competitive/timed mode data if applicable
        if (this.isCompetitive || this.isTimedMode) {
            snapshot.competitive = {
                // Player gate assignments and scores
                playerScores: { ...this.gameState.playerScores },
                
                // Gate information with player assignments
                gates: this.gameState.competitiveGates.map(gate => ({
                    id: gate.id,
                    x: gate.position.x,
                    z: gate.position.z,
                    playerId: gate.playerId,
                    color: gate.color,
                    direction: gate.direction,
                    pasture: gate.pasture
                })),
                
                // Win condition progress
                winCondition: this.calculateWinProgress(),
                
                // Game mode info
                playerCount: Object.keys(this.gameState.playerScores).length,
                totalSheep: this.gameState.totalSheep
            };
            
            // Add timed mode specific data
            if (this.isTimedMode && this.gameStartTime) {
                const currentTime = Date.now();
                const elapsed = currentTime - this.gameStartTime;
                const remaining = Math.max(0, this.gameDuration - elapsed);
                
                snapshot.timedMode = {
                    timeRemaining: remaining,
                    gameDuration: this.gameDuration
                };
            }
        }

        // Cycle 34 Phase 3: optional objective stage block. Omitted entirely
        // when this.objective is null (RH, Field) so msgpack output is byte-
        // identical to pre-Phase-3 for those scenes. The shape mirrors the
        // client's local ObjectiveState (shared/objective.js) so the
        // ObjectiveBanner UI consumes the snapshot field directly without
        // a translation layer.
        if (this.objective) {
            snapshot.objective = {
                stage: this.objective.stage,
                sheepInZone: this.objective.sheepInZone,
                requiredSheep: this.objective.requiredSheep,
                holdTimer: Math.round(this.objective.holdTimer * 100) / 100,
                holdRequired: this.objective.holdRequired
            };
        }

        // Cycle 67 P3: optional survival + wolves blocks, present ONLY on a
        // survival room so non-survival frames stay byte-compatible (the
        // multiplayer.md wire contract). P5 stamps the protocol version tag.
        if (this.isSurvival && this._survival) {
            const s = this._survival;
            snapshot.survival = {
                day: s.run.day,
                phase: s.phase,
                flock: s.run.flock,
                peak: s.run.peak,
                t: Math.round(s.t * 1000) / 1000,
                gateOpen: s.gateOpen,
                alive: s.run.isAlive(),
                pennedCount: s.pen?.pennedCount ?? 0,
            };
            snapshot.wolves = s.wolves.wolves.map(w => ({
                id: w.id,
                x: Math.round(w.x * 100) / 100,
                z: Math.round(w.z * 100) / 100,
                state: w.state,
            }));
        }

        return snapshot;
    }

    calculateWinProgress() {
        if (!this.isCompetitive) return null;
        
        const playerCount = Object.keys(this.gameState.playerScores).length;
        const scores = Object.values(this.gameState.playerScores);
        
        if (playerCount === 2) {
            // 2-player mode: race to 101
            const maxScore = Math.max(...scores);
            const winThreshold = 101;
            return {
                type: 'race',
                threshold: winThreshold,
                maxScore: maxScore,
                progress: maxScore / winThreshold,
                isComplete: maxScore >= winThreshold
            };
        } else {
            // 3-4 player mode: highest score when all sheep collected
            const totalCollected = scores.reduce((sum, score) => sum + score, 0);
            const maxScore = Math.max(...scores);
            return {
                type: 'highest_score',
                totalCollected: totalCollected,
                totalSheep: this.gameState.totalSheep,
                maxScore: maxScore,
                progress: totalCollected / this.gameState.totalSheep,
                isComplete: totalCollected >= this.gameState.totalSheep
            };
        }
    }
    
    calculatePlayerRankings(finalScores) {
        // Convert scores object to array with rankings
        return Object.entries(finalScores)
            .map(([playerId, score]) => {
                // DO-friendly lookup: the adapter exposes resolvePlayerName(playerId).
                let playerName = `Player ${playerId}`;
                if (this.room.resolvePlayerName) {
                    const resolved = this.room.resolvePlayerName(playerId);
                    if (resolved) playerName = resolved;
                }
                
                return {
                    playerId,
                    score,
                    playerName
                };
            })
            .sort((a, b) => b.score - a.score) // Sort by score descending
            .map((player, index) => ({
                ...player,
                rank: index + 1,
                medal: index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : ''
            }));
    }
    
    getPlayerRankings() {
        if (!this.isCompetitive && !this.isTimedMode) return [];
        
        return this.calculatePlayerRankings(this.gameState.playerScores);
    }
    
    updateTimedSheepRetirements(sheep, competitiveGates) {
        let totalRetired = 0;
        const playerRetirements = new Map();
        const currentTime = Date.now();
        
        // Initialize player retirement counts
        for (const gate of competitiveGates) {
            if (gate.playerId && !playerRetirements.has(gate.playerId)) {
                playerRetirements.set(gate.playerId, 0);
            }
        }
        
        for (let sheepEntity of sheep) {
            // Check if sheep just passed through any gate
            if (!sheepEntity.hasPassedGate && !sheepEntity.scheduledForRemoval) {
                for (const gate of competitiveGates) {
                    if (checkGatePassage(sheepEntity.position, sheepEntity.velocity, gate.passageZone, gate.direction)) {
                        sheepEntity.hasPassedGate = true;
                        sheepEntity.isRetiring = true;
                        sheepEntity.state = 1; // Set to retiring state
                        sheepEntity.assignedGate = gate.id;
                        
                        // In timed mode, schedule for removal
                        if (this.isTimedMode) {
                            sheepEntity.scheduledForRemoval = true;
                            sheepEntity.disappearTime = currentTime + 5000; // 5 seconds from now
                        }
                        
                        // Set retirement target in the appropriate pasture
                        const targetPasture = gate.pasture;
                        const margin = 3;
                        sheepEntity.retirementTarget = new Vector2D(
                            targetPasture.minX + margin + Math.random() * ((targetPasture.maxX - targetPasture.minX) - 2 * margin),
                            targetPasture.minZ + margin + Math.random() * ((targetPasture.maxZ - targetPasture.minZ) - 2 * margin)
                        );
                        
                        // Award point to the gate's player
                        if (gate.playerId && playerRetirements.has(gate.playerId)) {
                            playerRetirements.set(gate.playerId, playerRetirements.get(gate.playerId) + 1);
                        }
                        
                        // Add to removal queue
                        this.sheepRemovalQueue.push({
                            sheepId: sheepEntity.id,
                            removeTime: sheepEntity.disappearTime
                        });
                        break;
                    }
                }
            }
            
            // Count all sheep that have passed gates
            if (sheepEntity.hasPassedGate) {
                totalRetired++;
            }
        }
        
        return {
            playerRetirements: Object.fromEntries(playerRetirements),
            totalRetired
        };
    }
    
    updateTimedMode(currentTime) {
        // Check if 3 minutes have elapsed
        if (this.gameStartTime && currentTime - this.gameStartTime >= this.gameDuration) {
            // Force game completion
            if (!this.gameState.gameCompleted) {
                this.gameState.gameCompleted = true;
                this.gameState.completionTime = this.gameDuration / 1000; // Convert to seconds
                
                // Find winner based on highest score
                const rankings = this.getPlayerRankings();
                if (rankings.length > 0) {
                    this.gameState.winner = rankings[0].playerId;
                    this.gameState.winType = 'timeout';
                    
                    // Set up completion data for broadcast
                    this.completionData = {
                        completedAt: Date.now(),
                        isCompetitive: this.isCompetitive,
                        isTimedMode: this.isTimedMode,
                        competitive: {
                            winner: rankings[0].playerId,
                            winType: 'timeout',
                            finalScores: { ...this.gameState.playerScores },
                            playerRankings: rankings,
                            winCondition: { 
                                type: 'timeout',
                                timeLimit: this.gameDuration / 1000,
                                message: '3 minute timer expired'
                            },
                            playerCount: Object.keys(this.gameState.playerScores).length,
                            isComplete: true
                        },
                        totalSheep: this.gameState.totalSheep,
                        gameCompleted: true
                    };
                    
                    // Broadcast completion immediately (game_completed is
                    // logged once in broadcastGameCompletion, the funnel).
                    this.broadcastGameCompletion();
                }
            }
        }
        
        // Process sheep removal queue
        const sheepToRemove = [];
        for (let i = this.sheepRemovalQueue.length - 1; i >= 0; i--) {
            const removal = this.sheepRemovalQueue[i];
            if (currentTime >= removal.removeTime) {
                sheepToRemove.push(removal.sheepId);
                this.sheepRemovalQueue.splice(i, 1);
            }
        }
        
        // Remove sheep and spawn replacements
        for (const sheepId of sheepToRemove) {
            const sheepIndex = this.gameState.sheep.findIndex(s => s.id === sheepId);
            if (sheepIndex !== -1) {
                // Remove the sheep
                const removedSheep = this.gameState.sheep[sheepIndex];
                
                // Create a new sheep at a random spawn location
                const spawnLocations = this.gameState.competitiveSpawnClusters || [{ x: -30, z: -30 }];
                const spawnLocation = spawnLocations[Math.floor(Math.random() * spawnLocations.length)];
                
                // Reuse the sheep object but reset its properties
                removedSheep.id = this.nextSheepId++;
                removedSheep.position.set(
                    spawnLocation.x + (Math.random() - 0.5) * 20,
                    spawnLocation.z + (Math.random() - 0.5) * 20
                );
                removedSheep.velocity.set(0, 0);
                removedSheep.acceleration.set(0, 0);
                removedSheep.hasPassedGate = false;
                removedSheep.isRetiring = false;
                removedSheep.state = 0;
                removedSheep.assignedGate = null;
                removedSheep.retirementTarget = null;
                removedSheep.disappearTime = null;
                removedSheep.scheduledForRemoval = false;
            }
        }
    }

    // ---------------------------------------------------------------------
    // Cycle 67 P3: authoritative co-op survival subsystem.
    // ---------------------------------------------------------------------

    /**
     * Stand up the survival run economy, wolves, pen barrier, and day clock from
     * the scene config. Marks sheep beyond startFlock dormant (the dormant pool
     * the run draws from as it grows). Seeded from the per-game seed so the run
     * is reproducible.
     */
    _initSurvival() {
        const cfg = this.scene.survival;
        const startFlock = Math.max(0, cfg.startFlock ?? 10);

        // Sheep beyond startFlock start dormant: parked, not active, not
        // huntable, hidden on the wire (killed flag), activated as the run grows.
        for (let i = 0; i < this.gameState.sheep.length; i++) {
            const s = this.gameState.sheep[i];
            if (i >= startFlock) {
                s.dormant = true;
                s.state = 2;
                s.velocity.set(0, 0);
            }
        }

        // Pen barrier (same geometry the client builds: scene.pen + scene.gate).
        const pen = this.scene.pen;
        const gate = this.scene.gate;
        const penContainment = (pen?.center && gate?.position)
            ? new PenContainment(
                pen,
                { x: gate.position.x, z: gate.position.z, width: gate.width },
                { settleSeed: this.seed },
            )
            : null;

        const run = new SurvivalRun(cfg);
        // Cycle 68 P4: resume a multi-day run that survived a worker redeploy /
        // DO eviction. The persisted progress is day-granularity - the in-flight
        // night (wolf positions, within-day clock) is ephemeral and lost on
        // eviction by design (the room snaps to 'waiting' on wake), so we restore
        // the run to the START of the saved day with the saved flock. The player
        // keeps the days they survived instead of resetting to day 1.
        const resume = this.room?.survivalResume;
        const resuming = !!(resume && Number.isFinite(resume.day) && resume.day >= 1
            && Number.isFinite(resume.flock) && resume.flock > 0 && !resume.dead);
        if (resuming) {
            run.day = Math.floor(resume.day);
            run.flock = Math.min(run.maxFlock, Math.max(1, Math.floor(resume.flock)));
            run.peak = Math.max(Math.floor(resume.peak ?? resume.flock), run.flock);
            run.nightStartFlock = run.flock;
        }
        const wolves = new WolfSim({
            pen: penContainment,
            onKill: () => run.recordKill(),
            seed: this.seed,
        });

        const secondsPerDay = this.scene.dayNight?.secondsPerDay;
        const initialT = this.scene.dayNight?.initialT ?? 0.28;
        const t0 = secondsToT(0, secondsPerDay, initialT);
        const phase0 = phaseForT(t0);

        this._survival = {
            run,
            wolves,
            pen: penContainment,
            elapsed: 0,
            t: t0,
            phase: phase0,
            gateOpen: gateOpenForPhase(phase0),
            dogMem: new Map(),
            ended: false,
        };
        // Establish the run's prev-phase baseline (no event on the first observe).
        run.onPhase(phase0);
        // Resumed run: activate dormant sheep so the rendered flock matches the
        // restored day's flock (a fresh run starts at startFlock and grows in).
        if (resuming && run.flock > startFlock) this._syncActiveToFlock();
        log.info('survival_initialized', {
            roomCode: this.room.roomCode,
            startFlock,
            pool: this.gameState.sheep.length,
            resumed: !!resuming,
            day: run.day,
            flock: run.flock,
        });
    }

    /**
     * Advance the survival subsystem one tick: the day clock, the pen correction
     * + membership, the run economy off phase transitions, and the wolves. Called
     * from tick() AFTER updateSheep so the pen sees final sheep positions.
     */
    _tickSurvival(dt) {
        const s = this._survival;
        if (!s || s.ended) return;
        const step = Number.isFinite(dt) ? dt : this.deltaTime;

        // Server-owned day clock.
        s.elapsed += step;
        s.t = secondsToT(s.elapsed, this.scene.dayNight?.secondsPerDay, this.scene.dayNight?.initialT ?? 0.28);
        const phase = phaseForT(s.t);
        s.phase = phase;
        s.gateOpen = gateOpenForPhase(phase);

        // Pen: retire sheep herded in, keep others out, collide each player dog.
        if (s.pen) {
            s.pen.update(this.gameState.sheep, null, s.gateOpen, step);
            for (const [pid, dog] of this.sheepdogs) {
                let mem = s.dogMem.get(pid);
                if (!mem) { mem = { inside: false }; s.dogMem.set(pid, mem); }
                s.pen.containDog(dog.position, s.gateOpen, mem);
            }
        }

        // Run economy off the phase transitions.
        const ev = s.run.onPhase(phase);
        if (ev) {
            if (ev.type === 'nightfall') {
                s.wolves.spawnNight(s.run.day, this.gameState.sheep);
            } else if (ev.type === 'survived') {
                s.wolves.retreatAll();
                if (s.pen) s.pen.releaseAll(this.gameState.sheep);
                this._syncActiveToFlock();
                // P4: checkpoint the new day so a redeploy resumes here, not day 1.
                this.room?.onSurvivalProgress?.(this.serializeSurvival());
            } else if (ev.type === 'death') {
                s.wolves.retreatAll();
                // P4: run over - clear any persisted progress (dead:true).
                this.room?.onSurvivalProgress?.(this.serializeSurvival());
                this._endSurvivalRun(ev);
                return;
            }
        }

        // Wolves last, so they see settled sheep + pen membership this frame.
        s.wolves.update(step, this.gameState.sheep, null);
    }

    /**
     * Test-only: jump the survival day clock forward by `seconds` so a harness
     * can drive a room to nightfall in one step instead of waiting out a real
     * ~10-minute day. Gated behind env.INTEGRATION_TEST in RoomDO so it can never
     * be reached in production. No-op outside an active survival run.
     * @param {number} seconds
     */
    _testAdvanceSurvival(seconds) {
        if (!this._survival || this._survival.ended) return;
        const s = Number(seconds);
        if (!Number.isFinite(s) || s <= 0) return;
        this._survival.elapsed += s;
    }

    /**
     * Cycle 68 P4: a day-granularity snapshot of the survival run's progress for
     * DO storage, so a worker redeploy / DO eviction mid-run does not reset the
     * multi-day run to day 1. Returns null outside an active survival run. The
     * in-flight night (wolf positions, within-day clock) is intentionally NOT
     * captured - it is ephemeral (render-from-snapshot) and the room snaps to
     * 'waiting' on wake; the run resumes at the start of the saved day.
     * @returns {{day:number, flock:number, peak:number, dead:boolean}|null}
     */
    serializeSurvival() {
        if (!this.isSurvival || !this._survival) return null;
        const r = this._survival.run;
        return { day: r.day, flock: r.flock, peak: r.peak, dead: !r.isAlive() };
    }

    /** Count sheep currently in the run (active, not killed, not dormant). */
    _countActiveSurvivalSheep() {
        let n = 0;
        for (const s of this.gameState.sheep) {
            if (s.state === 0 && !s.killed && !s.dormant) n++;
        }
        return n;
    }

    /**
     * Activate dormant sheep until the rendered active count matches the run's
     * flock (which already grew + capped at maxFlock in SurvivalRun). Cap-correct:
     * if run.flock hit maxFlock, only the difference is activated.
     */
    _syncActiveToFlock() {
        const target = this._survival.run.flock;
        const active = this._countActiveSurvivalSheep();
        if (active < target) this._activateDormant(target - active);
    }

    /** Flip up to n dormant sheep to active at the spawn cluster (seeded jitter). */
    _activateDormant(n) {
        if (n <= 0) return 0;
        const cfg = this.scene.sheepSpawn || {};
        const cx = cfg.centerX ?? 0, cz = cfg.centerZ ?? 0;
        const spread = cfg.spreadRadius ?? 60;
        let activated = 0;
        for (let i = 0; i < this.gameState.sheep.length && activated < n; i++) {
            const s = this.gameState.sheep[i];
            if (!s.dormant) continue;
            s.dormant = false;
            s.killed = false;
            s.penned = false;
            s.hasPassedGate = false;
            s.isRetiring = false;
            s.state = 0;
            s._penSettling = false;
            s.settleTarget = null;
            const jx = (this.rng() - 0.5) * spread;
            const jz = (this.rng() - 0.5) * spread;
            s.position.set(cx + jx, cz + jz);
            s.velocity.set(0, 0);
            s.acceleration.set(0, 0);
            activated++;
        }
        return activated;
    }

    /** End the shared run: mark complete + post each player's peak flock. */
    _endSurvivalRun(ev) {
        const s = this._survival;
        if (!s || s.ended) { /* already ended */ }
        if (s) s.ended = true;
        this.gameState.gameActive = false;
        this.gameState.gameCompleted = true;
        // One shared run: every connected player posts the run's peak flock to
        // the party-size-partitioned survival board (P7 routes it in the DO).
        const scores = {};
        for (const pid of this.sheepdogs.keys()) scores[pid] = ev.score;
        this.gameState.playerScores = scores;
        this.completionData = {
            completedAt: Date.now(),
            isSurvival: true,
            isCompetitive: false,
            survival: { score: ev.score, day: ev.day, partySize: this.sheepdogs.size },
            partySize: this.sheepdogs.size,
            totalSheep: this.gameState.totalSheep,
            gameCompleted: true,
        };
        // game_completed (with survivalPeak/survivalDay) is logged in
        // broadcastGameCompletion, the single completion funnel.
        this.broadcastGameCompletion();
    }
}
