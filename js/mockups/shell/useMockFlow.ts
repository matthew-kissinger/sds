/**
 * Cycle 51 P1: the headless flow state machine the ten skins share. It owns the
 * arm -> commit -> loading -> in-game -> back sequence and the calibrated
 * loading animation. Skins read this and render; they never reimplement the
 * flow. No game-runtime import: this is a pure mock of the real boot sequence.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WORLDS, DOGS, MODES, WAYS } from './data';
import { TOTAL_MS, stageAt } from './timings';
import { useReducedMotion } from './useReducedMotion';
import type { MockFlow, Step } from './types';

/** Reduced-motion loading fills quickly and without the easing flourish. */
const REDUCED_MS = 350;

export function useMockFlow(): MockFlow {
  const reducedMotion = useReducedMotion();

  const [step, setStep] = useState<Step>('entrance');
  const [worldIndex, setWorldIndex] = useState(1); // Rolling Hills, the hero, armed by default
  const [modeId, setModeId] = useState(MODES[0].id); // Just Play, the right first experience
  const [dogId, setDogId] = useState(DOGS[0].id); // Jep, the balanced default

  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);

  const world = WORLDS[worldIndex];
  const mode = useMemo(() => MODES.find((m) => m.id === modeId) ?? MODES[0], [modeId]);
  const dog = useMemo(() => DOGS.find((d) => d.id === dogId) ?? DOGS[0], [dogId]);

  const armWorld = useCallback((id: string) => {
    const i = WORLDS.findIndex((w) => w.id === id);
    if (i >= 0) setWorldIndex(i);
  }, []);
  const nextWorld = useCallback(() => setWorldIndex((i) => (i + 1) % WORLDS.length), []);
  const prevWorld = useCallback(() => setWorldIndex((i) => (i - 1 + WORLDS.length) % WORLDS.length), []);
  const setMode = useCallback((id: string) => setModeId(id), []);
  const setDog = useCallback((id: string) => setDogId(id), []);

  const commit = useCallback(() => {
    setProgress(0);
    setStep('loading');
  }, []);

  const exit = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setProgress(0);
    setStep('entrance');
  }, []);

  // Drive the loading bar over the calibrated timeline, then reveal the in-game frame.
  useEffect(() => {
    if (step !== 'loading') return;
    const duration = reducedMotion ? REDUCED_MS : TOTAL_MS;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setProgress(t);
      if (t >= 1) {
        rafRef.current = null;
        // brief settle before the crossfade to in-game
        window.setTimeout(() => setStep('ingame'), reducedMotion ? 0 : 260);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [step, reducedMotion]);

  const elapsedEquivalent = progress * TOTAL_MS;
  const { label } = stageAt(elapsedEquivalent);

  return {
    step,
    worlds: WORLDS,
    dogs: DOGS,
    modes: MODES,
    ways: WAYS,
    world,
    mode,
    dog,
    worldIndex,
    armWorld,
    nextWorld,
    prevWorld,
    setMode,
    setDog,
    commit,
    exit,
    loading: {
      progress,
      pct: Math.round(progress * 100),
      label,
      done: progress >= 1,
    },
    reducedMotion,
  };
}
