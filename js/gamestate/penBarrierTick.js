// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The client's per-frame pen-barrier tick.
 *
 * On a scene that declares a pen (Rolling Hills' island pasture, Newsheepdogland's
 * homestead) the barrier is not decoration. It is BOTH halves of the scene:
 *
 *   - the fence is only solid because this runs (dog and sheep collide with the
 *     four edges, the gate gap is the one crossing), and
 *   - retirement only happens because this runs. `js/GameState.js` stands its
 *     gate arm down on a pen scene and the corral arm is gone from the island,
 *     so nothing else in the client sets `hasPassedGate`. No tick, no score, no
 *     completion - the round simply never ends.
 *
 * That is why the body lives here rather than inline in `main.js`'s solo frame,
 * where Cycle 117 P2 first put it. It sat inside `update()`'s
 * `!isPaused && !this.isLocalMultiplayer` block, and local 2-player runs through
 * `updateLocalMultiplayer`, which ticks the sheep sim itself and never reached
 * it - so a local 2-player round on Rolling Hills could not score and the new
 * fence was scenery. One function, called from both frames.
 *
 * @param {object} game  The SheepDogSimulation instance.
 * @param {number} deltaTime  Frame delta (s).
 */
export function tickPenBarrier(game, deltaTime) {
    const pen = game?._penBarrier;
    if (!pen) return;

    const state = game.gameState;
    // Cycle 67 P6: solo (and local 2-player, which is solo as far as the network
    // is concerned) only. In a networked room the DO runs the barrier
    // authoritatively and the client renders the corrected sheep from the
    // broadcast, so a second client-side barrier would fight the snapshot.
    if (!state?.gameActive || game.isMultiplayer) return;

    // `game.dayLoop?.gateOpen ?? true` already meant "open" on a scene with no
    // day clock, which is what an island pasture wants.
    const gateOpen = game.dayLoop?.gateOpen ?? true;

    // Cycle 117 P3: a rise in pennedCount IS the number of sheep that came
    // through the gate this frame, because the count is recomputed from scratch
    // every tick. It is read rather than announced: the barrier lives in
    // `shared/` and dispatches nothing, and the gate cue already reads it the
    // same way (createPenCrossingObserver). Only a rise counts - `releaseAll`
    // empties the pen at dawn, and that is bookkeeping, not sheep.
    const pennedBefore = pen.pennedCount;

    // Always pass the dog: it collides with the fence whether or not the round
    // is "active" (the fence is a physical barrier).
    pen.update(state.sheep, game.sheepdog ?? null, gateOpen, deltaTime);

    // The second dog, on the local 2-player frame. `update()` above tracks ONE
    // dog, on an instance-level `_dogInside` flag, which is exactly why
    // `containDog` exists with a caller-owned memory object - one barrier
    // instance cannot remember which side of the fence several dogs are on.
    // `worker/src/GameSim.js#_tickPen` does the same thing per player dog.
    //
    // Dog 1 deliberately stays on `update()`'s path rather than moving here
    // too: that path is what survival and solo have shipped on, and the point
    // of this call is to ADD the dog the barrier was blind to.
    //
    // The memory is keyed to the barrier instance so it cannot outlive it. A
    // scene swap builds a new barrier (`js/boot/initWorld.js`), and a stale
    // `inside: true` against a new fence would let a dog walk out through a
    // wall it was never inside.
    const dog2 = game.sheepdog2;
    if (dog2?.position) {
        let side = game._penDog2Side;
        if (!side || side.barrier !== pen) {
            side = game._penDog2Side = { barrier: pen, inside: false };
        }
        pen.containDog(dog2.position, gateOpen, side);
    }

    if (pen.pennedCount > pennedBefore) {
        state.audioManager?.playRewardingChime();
    }
}
