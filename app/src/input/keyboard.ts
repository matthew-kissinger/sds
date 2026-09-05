// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Keyboard as a device: two window listeners, one set of held keys, no state
 * machine. WASD and the arrow cluster move, Shift sprints, Space barks, C swaps
 * camera framing.
 *
 * Keys are read by `event.code`, the PHYSICAL key, so the WASD cluster is the
 * WASD cluster on AZERTY and Dvorak too. That is also what a future remap panel
 * (spec/06 settings) wants to store.
 *
 * Held keys are a level, not an edge: the resolver samples `keyboardAxis` every
 * frame. Bark and camera are edges and fire from the handler, with `repeat`
 * rejected so holding Space is one bark (the contract in intent.ts).
 *
 * Blur and tab-hide clear the held set. Without that, alt-tabbing mid-sprint
 * loses the keyup and the dog runs into the fence forever.
 */

import { barkPressed, isPlaying, toggleCameraMode } from './actions';
import { clearAxis, type MoveAxis } from './axis';
import { setSprintSource } from './sprintSources';
import {
  useGameStore,
  type InputBindings,
} from '@app/state/store';

const ARROW_MOVE: ReadonlyMap<string, readonly [number, number]> = new Map([
  ['ArrowUp', [0, 1]], ['ArrowDown', [0, -1]],
  ['ArrowLeft', [-1, 0]], ['ArrowRight', [1, 0]],
]);

const held = new Set<string>();

/** Held movement keys, summed. Diagonals come out long; `worldFromAxis` clamps. */
export function keyboardAxis(out: MoveAxis): MoveAxis {
  clearAxis(out);
  const bindings = useGameStore.getState().inputBindings;
  for (const code of held) {
    const move = bindingMove(code, bindings);
    if (!move) continue;
    out.right += move[0];
    out.forward += move[1];
  }
  return out;
}

export function keyboardSprint(): boolean {
  const sprint = useGameStore.getState().inputBindings.sprint;
  return held.has(sprint) || held.has('ShiftRight');
}

export function bindingMove(
  code: string,
  bindings: InputBindings,
): readonly [number, number] | undefined {
  const arrow = ARROW_MOVE.get(code);
  if (arrow !== undefined) return arrow;
  if (code === bindings.forward) return [0, 1];
  if (code === bindings.backward) return [0, -1];
  if (code === bindings.left) return [-1, 0];
  if (code === bindings.right) return [1, 0];
  return undefined;
}

function onKeyDown(event: KeyboardEvent): void {
  const { code } = event;
  const state = useGameStore.getState();
  const bindings = state.inputBindings;

  if (code === 'Escape') {
    if (!event.repeat) {
      if (state.uiPanel === 'settings') state.closeSettings();
      else if (state.gamePhase === 'playing') state.pause();
      else if (state.gamePhase === 'paused') state.resume();
    }
    return;
  }

  if (code === bindings.camera) {
    if (!event.repeat) toggleCameraMode();
    return;
  }

  if (code === bindings.bark) {
    if (!isPlaying()) return;
    // Only swallowed during a run, so Space still activates the focused Play
    // button on the title.
    event.preventDefault();
    if (!event.repeat) barkPressed();
    return;
  }

  if (
    bindingMove(code, bindings) !== undefined ||
    code === bindings.sprint ||
    code === 'ShiftRight'
  ) {
    held.add(code);
    setSprintSource('keyboard', keyboardSprint());
    if (isPlaying() && code.startsWith('Arrow')) event.preventDefault();
  }
}

function onKeyUp(event: KeyboardEvent): void {
  held.delete(event.code);
  setSprintSource('keyboard', keyboardSprint());
}

function releaseAll(): void {
  held.clear();
  setSprintSource('keyboard', false);
}

/** Attach the listeners. Returns the detach function, for a React effect. */
export function installKeyboard(): () => void {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', releaseAll);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', releaseAll);
    document.removeEventListener('visibilitychange', releaseAll);
    releaseAll();
  };
}
