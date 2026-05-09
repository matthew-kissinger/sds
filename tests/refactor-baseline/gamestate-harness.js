/**
 * GameState mode-dispatch refactor-baseline harness — Cycle 29 Stream A0.
 *
 * Captures pre-extraction behavior of GameState's mode dispatch surfaces:
 *
 *   1. startGameMatrix      — startGame(mode, …, sub) → snapshot of resulting state
 *   2. objectiveSetup       — setObjective(def) at varying totalSheep
 *   3. objectiveTick        — updateSheepBehaviors() driving 'roundup' → 'drive'
 *   4. competitiveCompletion — checkCompetitiveCompletion across 2p/3p/4p × score boundaries
 *   5. sandboxCompletion    — checkSandboxCompletion across {none, all, percentage}
 *
 * The harness is pure JS + JSDoc, mirroring tests/refactor-baseline/harness.js.
 * It expects the spec to vi.mock '../../js/OptimizedSheep.js' (Three.js puller)
 * before calling captureGoldens(). Other transitive deps (FieldConfig,
 * FenceCollisionSystem, ExtremeBoidSystem, GameBridge) are pure JS and load
 * cleanly under vitest's node environment.
 *
 * Why these surfaces specifically: each one is a target of a B-stream
 * extraction. The fixture asserts the extracted module produces bit-exact
 * the same observable behavior. Drift = behavior change, intentional or
 * otherwise — same posture as tests/refactor-baseline/baseline.spec.ts.
 */

import { GameState } from '../../js/GameState.js';

/**
 * Install minimal browser globals so GameState methods that touch
 * window/localStorage/CustomEvent don't throw under vitest's node env.
 * Idempotent — safe to call multiple times.
 */
export function installBrowserShims() {
    if (typeof globalThis.CustomEvent !== 'function') {
        globalThis.CustomEvent = class CustomEvent {
            constructor(type, init) {
                this.type = type;
                this.detail = init?.detail;
            }
        };
    }
    if (typeof globalThis.window !== 'object' || globalThis.window === null) {
        globalThis.window = {
            dispatchEvent: () => {},
            submitGameScore: undefined,
            __currentSceneId: undefined,
        };
    }
    if (typeof globalThis.localStorage !== 'object' || globalThis.localStorage === null) {
        globalThis.localStorage = {
            _store: {},
            setItem(k, v) { this._store[k] = String(v); },
            getItem(k) { return Object.prototype.hasOwnProperty.call(this._store, k) ? this._store[k] : null; },
            removeItem(k) { delete this._store[k]; },
            clear() { this._store = {}; },
        };
    }
}

/**
 * The (mode, singlePlayerMode) grid we exercise via startGame.
 *
 * Solo modes drive `totalSheep` and `useExtremeBoids`; non-solo modes
 * (multiplayer/competitive/timed) consult sceneSpawnDef.count or the
 * room's sheepCount and ignore singlePlayerMode for sheep selection
 * (but still record it on state).
 */
const START_GAME_MATRIX = [
    ['solo', 'practice'],
    ['solo', 'classic'],
    ['solo', 'extreme'],
    ['solo', 'insane'],
    ['solo', 'chaos'],
    ['multiplayer', 'classic'],
    ['competitive', 'classic'],
    ['timed', 'classic'],
];

/**
 * Snapshot the mode-dispatch outputs of startGame for a single combo.
 * Returns a plain object — JSON-stable.
 *
 * @param {[string, string]} combo
 * @returns {object}
 */
function snapshotStartGame([mode, sub]) {
    const state = new GameState();
    // For competitive, startGame requires competitiveData when initializing
    // competitive mode; pass minimal stub so initializeCompetitiveMode
    // succeeds. For other modes, null is fine.
    const competitiveData = mode === 'competitive'
        ? {
            competitiveGates: [
                { id: 0, position: { x: 0, z: 100 }, pasture: { minX: -30, maxX: 30, minZ: 102, maxZ: 130 } },
                { id: 1, position: { x: 0, z: -100 }, pasture: { minX: -30, maxX: 30, minZ: -130, maxZ: -102 } },
            ],
            playerScores: { p1: 0, p2: 0 },
        }
        : null;
    state.startGame(mode, competitiveData, sub);
    return {
        gameMode: state.gameMode,
        singlePlayerMode: state.singlePlayerMode,
        totalSheep: state.totalSheep,
        useExtremeBoids: state.useExtremeBoids,
        gameActive: state.gameActive,
        gameCompleted: state.gameCompleted,
        sheepRetired: state.sheepRetired,
        isPaused: state.isPaused,
        params: { ...state.params },
        competitiveGates: state.competitiveGates.length,
        playerScoresCount: Object.keys(state.playerScores).length,
        needsFlockRecreation: state.needsFlockRecreation ?? null,
    };
}

/**
 * Snapshot setObjective(def) outputs across representative defs and
 * totalSheep values. The OC-style def with fractional + min should
 * scale; an explicit-requiredSheep def should not.
 *
 * @returns {object}
 */
function snapshotObjectiveSetup() {
    /** @type {Record<string, object | null>} */
    const out = {};
    const ocStyle = {
        roundupZone: { x: 0, z: 0, radius: 30 },
        requiredSheepFraction: 0.4,
        requiredSheepMin: 10,
        holdRequired: 2,
    };
    const explicit = {
        roundupZone: { x: 5, z: -5, radius: 25 },
        requiredSheep: 50,
        holdRequired: 3,
    };
    const tinyMin = {
        roundupZone: { x: 0, z: 0, radius: 30 },
        requiredSheepFraction: 0.4,
        requiredSheepMin: 10,
        holdRequired: 1,
    };

    // Null def
    {
        const state = new GameState();
        state.totalSheep = 200;
        state.setObjective(null);
        out['null@200'] = state.objective;
    }

    // OC-style across the four solo modes' totalSheep
    for (const [label, totalSheep] of [
        ['ocStyle@200', 200],
        ['ocStyle@1000', 1000],
        ['ocStyle@3000', 3000],
        ['ocStyle@5000', 5000],
    ]) {
        const state = new GameState();
        state.totalSheep = totalSheep;
        state.setObjective(ocStyle);
        out[label] = { ...state.objective };
    }

    // Explicit requiredSheep — should NOT scale with totalSheep
    for (const totalSheep of [200, 1000]) {
        const state = new GameState();
        state.totalSheep = totalSheep;
        state.setObjective(explicit);
        out[`explicit@${totalSheep}`] = { ...state.objective };
    }

    // Tiny-pop / floor-clamp case
    {
        const state = new GameState();
        state.totalSheep = 5;
        state.setObjective(tinyMin);
        out['tinyMin@5'] = { ...state.objective };
    }

    // _refreshObjective behavior — set objective at totalSheep=200, then
    // bump totalSheep and refresh via startGame's refresh path. Lock the
    // observable post-refresh shape.
    {
        const state = new GameState();
        state.totalSheep = 200;
        state.setObjective(ocStyle);
        // Mutate totalSheep without going through startGame, then call the
        // private refresher. The refactor must preserve this contract.
        state.totalSheep = 1000;
        state._refreshObjective();
        out['ocStyle_refresh_200_to_1000'] = { ...state.objective };
    }

    return out;
}

/**
 * Drive updateSheepBehaviors() to exercise the 'roundup' → 'drive'
 * stage transition. We stub optimizedSheepSystem with a noop so
 * the early-return guard at the top of the method doesn't fire,
 * and populate state.sheep with mock entities at known positions.
 *
 * @returns {object}
 */
function snapshotObjectiveTick() {
    /** @type {Record<string, object>} */
    const out = {};
    const objectiveDef = {
        roundupZone: { x: 0, z: 0, radius: 10 },
        requiredSheep: 5,
        holdRequired: 2,
    };

    function makeState(sheepInZone) {
        const state = new GameState();
        state.totalSheep = 10;
        state.setObjective(objectiveDef);
        state.gameActive = true;
        state.gameMode = 'solo';
        state.optimizedSheepSystem = { update: () => {} };
        // Populate 10 sheep — `sheepInZone` of them inside the radius=10 disc,
        // the rest at (50, 50) far outside. Stub the retirement-check methods
        // so updateSheepBehaviors' post-objective gate-passage block doesn't
        // crash on plain-object sheep. Returning false means no retirement —
        // the objective tick is what we're characterizing here.
        const sheep = [];
        for (let i = 0; i < 10; i++) {
            const inZone = i < sheepInZone;
            sheep.push({
                position: { x: inZone ? 0 : 50, z: inZone ? 0 : 50 },
                hasPassedGate: false,
                isRetiring: false,
                checkCorralAndRetire: () => false,
                checkGatePassageAndRetire: () => false,
            });
        }
        state.sheep = sheep;
        return state;
    }

    // Below threshold: stage stays roundup, holdTimer stays 0
    {
        const state = makeState(3);
        state.updateSheepBehaviors(1.0);
        out['below_threshold_dt=1'] = {
            stage: state.objective.stage,
            sheepInZone: state.objective.sheepInZone,
            holdTimer: state.objective.holdTimer,
        };
    }

    // At threshold, single tick under hold: stage=roundup, holdTimer=1
    {
        const state = makeState(5);
        state.updateSheepBehaviors(1.0);
        out['at_threshold_dt=1'] = {
            stage: state.objective.stage,
            sheepInZone: state.objective.sheepInZone,
            holdTimer: state.objective.holdTimer,
        };
    }

    // At threshold, two ticks of dt=1: holdTimer reaches holdRequired=2
    // → stage flips to drive
    {
        const state = makeState(5);
        state.updateSheepBehaviors(1.0);
        state.updateSheepBehaviors(1.0);
        out['at_threshold_two_ticks'] = {
            stage: state.objective.stage,
            sheepInZone: state.objective.sheepInZone,
            holdTimer: state.objective.holdTimer,
        };
    }

    // Single dt=2.5 (over hold): stage flips
    {
        const state = makeState(8);
        state.updateSheepBehaviors(2.5);
        out['over_threshold_dt=2.5'] = {
            stage: state.objective.stage,
            sheepInZone: state.objective.sheepInZone,
            holdTimer: state.objective.holdTimer,
        };
    }

    // Hold-broken: tick at threshold, then drop below — holdTimer resets to 0
    {
        const state = makeState(5);
        state.updateSheepBehaviors(1.0);
        // Move all sheep outside the zone for the second tick
        for (const s of state.sheep) {
            s.position = { x: 50, z: 50 };
        }
        state.updateSheepBehaviors(1.0);
        out['hold_broken'] = {
            stage: state.objective.stage,
            sheepInZone: state.objective.sheepInZone,
            holdTimer: state.objective.holdTimer,
        };
    }

    return out;
}

/**
 * Snapshot checkCompetitiveCompletion across player counts and score
 * configurations. The 2p winThreshold for totalSheep=200 is 100
 * (Math.ceil(200 / 2) = 100); for totalSheep=10 it's 5.
 *
 * @returns {object}
 */
function snapshotCompetitiveCompletion() {
    /** @type {Record<string, object>} */
    const out = {};

    function setup(playerCount, scores, totalSheep = 200) {
        const state = new GameState();
        const gates = Array.from({ length: playerCount }, (_, i) => ({
            id: i,
            position: { x: 0, z: 100 + i * 10 },
            pasture: { minX: -30, maxX: 30, minZ: 102, maxZ: 130 },
        }));
        const playerScores = Object.fromEntries(
            scores.map((s, i) => [`p${i + 1}`, s])
        );
        state.gameMode = 'competitive';
        state.totalSheep = totalSheep;
        state.competitiveGates = gates;
        state.playerScores = playerScores;
        return state;
    }

    function omitFinalScores(result) {
        const { isComplete, winner, winType } = result;
        return { isComplete, winner: winner ?? null, winType: winType ?? null };
    }

    // 2 players: threshold = 100 for totalSheep=200
    out['2p@99-99'] = omitFinalScores(setup(2, [99, 99]).checkCompetitiveCompletion());
    out['2p@100-50'] = omitFinalScores(setup(2, [100, 50]).checkCompetitiveCompletion());
    out['2p@99-101'] = omitFinalScores(setup(2, [99, 101]).checkCompetitiveCompletion());
    out['2p@100-100'] = omitFinalScores(setup(2, [100, 100]).checkCompetitiveCompletion());
    out['2p@200-0'] = omitFinalScores(setup(2, [200, 0]).checkCompetitiveCompletion());

    // 3 players: completes when totalRetired >= totalSheep
    out['3p@30-30-30'] = omitFinalScores(setup(3, [30, 30, 30]).checkCompetitiveCompletion());
    out['3p@67-67-66'] = omitFinalScores(setup(3, [67, 67, 66]).checkCompetitiveCompletion());
    out['3p@100-50-50'] = omitFinalScores(setup(3, [100, 50, 50]).checkCompetitiveCompletion());

    // 4 players
    out['4p@49-49-49-49'] = omitFinalScores(setup(4, [49, 49, 49, 49]).checkCompetitiveCompletion());
    out['4p@50-50-50-50'] = omitFinalScores(setup(4, [50, 50, 50, 50]).checkCompetitiveCompletion());
    out['4p@200-0-0-0'] = omitFinalScores(setup(4, [200, 0, 0, 0]).checkCompetitiveCompletion());

    // Wrong gameMode → must always return isComplete: false
    {
        const state = setup(2, [200, 200]);
        state.gameMode = 'solo';
        out['wrongMode'] = omitFinalScores(state.checkCompetitiveCompletion());
    }

    return out;
}

/**
 * Snapshot checkSandboxCompletion across winCondition × winPercentage
 * × sheepRetired/totalSheep boundary cases.
 *
 * @returns {object}
 */
function snapshotSandboxCompletion() {
    /** @type {Record<string, boolean>} */
    const out = {};

    function check(rules, sheepRetired, totalSheep) {
        const state = new GameState();
        state.gameMode = 'sandbox';
        state.sandboxRules = rules;
        state.totalSheep = totalSheep;
        state.sheepRetired = sheepRetired;
        // checkSandboxCompletion delegates to checkCompletion when rules
        // are missing OR gameMode != 'sandbox'; we pass both in.
        // Note: checkCompletion checks against state.sheep.length, not
        // state.totalSheep, so we stub state.sheep accordingly so the
        // legacy fallback path is well-defined (even though no input
        // here triggers it, the spec asserts the surface is intact).
        state.sheep = new Array(totalSheep);
        return state.checkSandboxCompletion();
    }

    out['none@0-of-200'] = check({ winCondition: 'none' }, 0, 200);
    out['none@200-of-200'] = check({ winCondition: 'none' }, 200, 200);

    out['all@199-of-200'] = check({ winCondition: 'all' }, 199, 200);
    out['all@200-of-200'] = check({ winCondition: 'all' }, 200, 200);
    out['all@201-of-200'] = check({ winCondition: 'all' }, 201, 200);

    // percentage 50: target = ceil(200 * 0.5) = 100
    out['percentage50@99-of-200'] = check({ winCondition: 'percentage', winPercentage: 50 }, 99, 200);
    out['percentage50@100-of-200'] = check({ winCondition: 'percentage', winPercentage: 50 }, 100, 200);

    // percentage 100: target = 200
    out['percentage100@199-of-200'] = check({ winCondition: 'percentage', winPercentage: 100 }, 199, 200);
    out['percentage100@200-of-200'] = check({ winCondition: 'percentage', winPercentage: 100 }, 200, 200);

    // percentage 75 with 1000 totalSheep: target = ceil(1000 * 0.75) = 750
    out['percentage75@749-of-1000'] = check({ winCondition: 'percentage', winPercentage: 75 }, 749, 1000);
    out['percentage75@750-of-1000'] = check({ winCondition: 'percentage', winPercentage: 75 }, 750, 1000);

    // Non-sandbox gameMode → falls through to checkCompletion
    {
        const state = new GameState();
        state.gameMode = 'solo';
        state.totalSheep = 10;
        state.sheep = new Array(10);
        state.sheepRetired = 10;
        out['fallthrough_solo@10-of-10'] = state.checkSandboxCompletion();
    }

    return out;
}

/**
 * Capture all goldens. Returns a single JSON-stable object the spec
 * compares against the committed fixture.
 *
 * @returns {object}
 */
export function captureGoldens() {
    installBrowserShims();
    /** @type {Record<string, object>} */
    const startGameMatrix = {};
    for (const combo of START_GAME_MATRIX) {
        startGameMatrix[`${combo[0]}+${combo[1]}`] = snapshotStartGame(combo);
    }
    return {
        startGameMatrix,
        objectiveSetup: snapshotObjectiveSetup(),
        objectiveTick: snapshotObjectiveTick(),
        competitiveCompletion: snapshotCompetitiveCompletion(),
        sandboxCompletion: snapshotSandboxCompletion(),
    };
}
