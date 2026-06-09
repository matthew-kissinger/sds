// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// P1-MOBILE-WARN: pure gate for the mobile big-flock performance warning.
// Solo Insane (3,000) and Solo Chaos (5,000) were measured on desktop only;
// phones and tablets can drop frames at those counts. The entrance asks
// before committing a >1000-sheep solo round on a mobile client. The player
// can always continue - this is a warning, never a block.
//
// Counting runs are exempt: their Mode.sheep carries the shared 5,000
// ceiling, but a counting run starts at one sheep and ramps round by round.
//
// Multiplayer does not route through this gate. The worker already rejects
// every mobile client (host included) at the WS upgrade for rooms over
// 1,000 sheep (worker/src/RoomDO.ts, MOBILE_GUEST_MAX_SHEEP_COUNT), so
// RoomCreation shows an inline notice instead of a continue-anyway dialog.
import { COUNTING_GAME_MODE } from '../../shared/countingModes.js';

/** Counts above this trigger the mobile performance warning. Matches the
 *  worker's MOBILE_GUEST_MAX_SHEEP_COUNT so solo and multiplayer agree on
 *  where "desktop territory" starts. */
export const MOBILE_SHEEP_WARN_THRESHOLD = 1000;

/**
 * Should the pre-round mobile performance warning be shown?
 *
 * @param {object} args
 * @param {number} args.sheepCount - sheep count of the armed mode.
 * @param {boolean} args.isMobile - the isMobileClient() signal.
 * @param {string} [args.gameMode] - top-level gameMode ('solo' | 'counting').
 * @returns {boolean}
 */
export function shouldWarnMobileSheep({ sheepCount, isMobile, gameMode = 'solo' }) {
    if (!isMobile) return false;
    if (gameMode === COUNTING_GAME_MODE) return false;
    return Number(sheepCount) > MOBILE_SHEEP_WARN_THRESHOLD;
}
