// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 51 P6: viewport hook for the world-first entrance, promoted from the
 * bake-off shell. `compact` is the phone/narrow breakpoint (<= 720px); the
 * entrance must hold on every device and OS (the cycle's mobile-compat
 * directive). Distinct from usePlatform's device-tier detection: this is a
 * pure layout breakpoint driven by the live viewport width.
 */
import { useEffect, useState } from 'react';

export interface Viewport {
  width: number;
  height: number;
  compact: boolean;
}

export function useViewport(): Viewport {
  const read = (): Viewport => {
    const width = typeof window === 'undefined' ? 1280 : window.innerWidth;
    const height = typeof window === 'undefined' ? 720 : window.innerHeight;
    return { width, height, compact: width <= 720 };
  };
  const [vp, setVp] = useState<Viewport>(read);
  useEffect(() => {
    const on = () => setVp(read());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return vp;
}
