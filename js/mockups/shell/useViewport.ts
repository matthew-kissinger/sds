/**
 * Cycle 51 P1: viewport hook so skins lay out for PC and mobile from one source.
 * `compact` is the phone/narrow breakpoint; the bake-off has to hold on both.
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
    return () => window.removeEventListener('resize', on);
  }, []);
  return vp;
}
