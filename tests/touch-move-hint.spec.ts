// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Whether the touch stick teaches this player, remembered across sessions.
//
// The interesting part is not the round trip, it is what happens when storage
// will not cooperate. A private window can leave `localStorage` present and
// THROWING rather than absent, and the same object can refuse a write after
// allowing a read. Both directions have to fail toward teaching: a player who
// is shown the stick again has lost a glance, a player who is never shown it
// cannot move. There is no DOM environment in this suite, so the component
// wiring around this - the travel threshold, the handoff to the live stick -
// is verified in a real browser rather than here.

import { describe, it, expect, afterEach } from 'vitest';
import { forgetMoveHint, markMoveHintLearned, moveHintLearned } from '../app/src/input/moveHint';

type Store = Record<string, string>;

function install(behaviour: {
  get?: (key: string) => string | null;
  set?: (key: string, value: string) => void;
  remove?: (key: string) => void;
} = {}): Store {
  const store: Store = {};
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: behaviour.get ?? ((key: string) => store[key] ?? null),
    setItem: behaviour.set ?? ((key: string, value: string) => { store[key] = value; }),
    removeItem: behaviour.remove ?? ((key: string) => { delete store[key]; }),
  };
  return store;
}

function uninstall(): void {
  delete (globalThis as { localStorage?: unknown }).localStorage;
}

afterEach(uninstall);

describe('remembering that a player found the stick', () => {
  it('starts every new player as one who has to be taught', () => {
    install();
    expect(moveHintLearned()).toBe(false);
  });

  it('remembers across a session once they have moved', () => {
    const store = install();
    markMoveHintLearned();
    expect(moveHintLearned()).toBe(true);
    // Under one key, so clearing site data clears exactly this.
    expect(Object.keys(store)).toEqual(['herd.touch-move-learned.v1']);
  });

  it('forgets on request, which is how a first run is exercised', () => {
    install();
    markMoveHintLearned();
    forgetMoveHint();
    expect(moveHintLearned()).toBe(false);
  });

  it('teaches when there is no storage at all', () => {
    uninstall();
    expect(moveHintLearned()).toBe(false);
    // And recording it must not throw, or the pointer handler dies mid-drag
    // and takes the stick with it.
    expect(() => markMoveHintLearned()).not.toThrow();
    expect(() => forgetMoveHint()).not.toThrow();
  });

  it('teaches when storage is present but refuses to be read', () => {
    install({ get: () => { throw new DOMException('denied', 'SecurityError'); } });
    expect(moveHintLearned()).toBe(false);
  });

  it('survives storage that reads but refuses to be written', () => {
    // A quota-exceeded or private-mode write. The player is taught once more
    // next session, which is the cheap failure, and this session continues.
    install({ set: () => { throw new DOMException('quota', 'QuotaExceededError'); } });
    expect(() => markMoveHintLearned()).not.toThrow();
    expect(moveHintLearned()).toBe(false);
  });

  it('treats any value that is not the recorded one as not learned', () => {
    // Someone else's key collision, a half-written value, an older format.
    for (const value of ['1', 'yes', '', 'TRUE', '{"learned":true}']) {
      install({ get: () => value });
      expect(moveHintLearned(), value).toBe(false);
    }
  });
});
