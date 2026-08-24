// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { useEffect, useState } from 'react';
import { useGameStore } from '@app/state/store';

const QUERY = '(prefers-reduced-motion: reduce)';

function systemPreference(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(QUERY).matches;
}

/** OS reduction is always respected; the player can additionally opt in. */
export function useReducedMotion(): boolean {
  const playerPreference = useGameStore((state) => state.reduceMotion);
  const [system, setSystem] = useState(systemPreference);

  useEffect(() => {
    const query = window.matchMedia(QUERY);
    const update = () => setSystem(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return system || playerPreference;
}
