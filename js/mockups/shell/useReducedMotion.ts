/**
 * Cycle 51 P1: prefers-reduced-motion hook for the bake-off shell. Mirrors the
 * intent of the live useReducedMotion hook without importing game code, so the
 * mockup route stays isolated. Every ambient drift and the loading easing
 * collapse to calm-and-still when this returns true.
 */
import { useEffect, useState } from 'react';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return reduced;
}
