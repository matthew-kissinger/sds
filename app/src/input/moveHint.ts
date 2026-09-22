// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Whether this player has ever worked the stick.
 *
 * WHY IT IS REMEMBERED AT ALL. The touch stick floats: it appears where the
 * thumb lands rather than in a fixed home, and there was nothing on screen
 * until a thumb landed. Players reported not knowing they could move. The
 * screen was telling them about Sprint, Bark and Camera, which are drawn as
 * buttons, and saying nothing about the one control the game cannot be played
 * without.
 *
 * The fix is a resting stick, and the teaching part of it has to retire. A hint
 * that shows every session is a permanent cost charged to everyone for a
 * problem only the first run has, and the onboarding literature is consistent
 * that hints which repeat on a predictable schedule are remembered WORSE than
 * ones that appear once: a player tunes out a thing that is always there.
 *
 * Retirement is earned rather than timed. A timer punishes someone who is
 * reading the screen, or who put the phone down; real stick travel is proof the
 * player found the control, and it is the only proof worth acting on.
 *
 * Storage may be absent or throw - a private window, a browser with site data
 * blocked - and the failure mode is chosen deliberately: an unreadable store
 * means the hint shows, and an unwritable one means it shows again next time.
 * Teaching someone twice costs them a glance. Not teaching them at all costs
 * them the game.
 */

const KEY = 'herd.touch-move-learned.v1';

/** True once this player has produced real stick travel, ever. */
export function moveHintLearned(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

/** Record that they found it. Safe to call on every sample; it is idempotent. */
export function markMoveHintLearned(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, 'true');
  } catch {
    // Private contexts refuse the write. The run remains playable and the
    // player is taught once more next time, which is the cheap failure.
  }
}

/** Test seam: forget, so a spec can exercise a first-time player. */
export function forgetMoveHint(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to undo if the store never took it.
  }
}
