// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Is this a device the player touches?
 *
 * ONE ANSWER, TWO CONSUMERS, WHICH IS WHY IT LEFT `TouchControls`. The touch
 * stick renders when this is true and the keyboard reminder renders when it is
 * false, so they are complementary by construction and cannot both be on
 * screen. That used to be two independent rules - the component asked
 * `matchMedia`, the reminder was hidden by a `@media (pointer: coarse)` block
 * in the stylesheet - and two rules that are meant to agree will eventually
 * not. `?debug=touch` was already a case where they disagreed: it forces the
 * stick on without changing what the stylesheet can see, so the reminder sat
 * underneath the stick, which is where this was noticed.
 *
 * The media query stays in the stylesheet as well. It costs nothing and it
 * covers the first paint, before React has mounted anything.
 */

import { useEffect, useState } from 'react';
import { debugFlags } from '@app/scene/glFactory';

const TOUCH_QUERY = '(pointer: coarse)';

/**
 * A coarse pointer, or the dev override. `pointer` rather than `any-pointer`
 * deliberately: a laptop with a touchscreen reports a fine primary pointer and
 * wants the keyboard reminder, not a thumb stick it has no thumb for.
 */
export function touchPresent(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(TOUCH_QUERY).matches
    || (import.meta.env.DEV && debugFlags().has('touch'));
}

/** `touchPresent`, re-read when the device's primary pointer changes. */
export function useTouchPresent(): boolean {
  const [present, setPresent] = useState(touchPresent);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(TOUCH_QUERY);
    const onChange = () => setPresent(touchPresent());
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return present;
}
