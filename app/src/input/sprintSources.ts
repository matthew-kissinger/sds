// SPDX-License-Identifier: AGPL-3.0-or-later
/** Raw device levels plus an all-released edge retained between render frames.
 * Events only update this device state; the resolver remains the intent writer.
 * Gamepad edges have the normal browser poll resolution. */
export type SprintSource = 'keyboard' | 'touch' | 'gamepad';
const bits: Record<SprintSource, number> = { keyboard: 1, touch: 2, gamepad: 4 };
let heldSources = 0;
let releaseSerial = 0;

export function setSprintSource(source: SprintSource, held: boolean): void {
  const previous = heldSources;
  heldSources = held ? heldSources | bits[source] : heldSources & ~bits[source];
  if (previous !== 0 && heldSources === 0) releaseSerial++;
}

export function sprintReleaseSerial(): number { return releaseSerial; }
