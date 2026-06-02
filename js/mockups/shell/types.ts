/**
 * Cycle 51 P1: the shared types for the bake-off shell. The flow shape every
 * skin consumes, and the SkinModule contract the harness registers. Pure types,
 * no runtime deps.
 */
import type { FC } from 'react';
import type { World, Dog, Mode, Way } from './data';

export type Step = 'entrance' | 'loading' | 'ingame';

export interface LoadingState {
  /** 0..1, by cumulative real build cost. */
  progress: number;
  /** Rounded percent for display. */
  pct: number;
  /** Active stage label. */
  label: string;
  done: boolean;
}

/**
 * The headless flow state every skin reads. world-first, mode-first, and
 * one-tap skins all set the same { world, mode, dog } and call commit(); they
 * differ only in the order their Entrance surfaces the choices.
 */
export interface MockFlow {
  step: Step;
  worlds: World[];
  dogs: Dog[];
  modes: Mode[];
  ways: Way[];

  world: World;
  mode: Mode;
  dog: Dog;
  worldIndex: number;

  armWorld: (id: string) => void;
  nextWorld: () => void;
  prevWorld: () => void;
  setMode: (id: string) => void;
  setDog: (id: string) => void;
  commit: () => void;
  exit: () => void;

  loading: LoadingState;
  reducedMotion: boolean;
}

export interface SkinViewProps {
  flow: MockFlow;
}

export type FlowKind = 'world-first' | 'mode-first' | 'one-tap';

/** One bake-off prototype: metadata plus the three flow views. */
export interface SkinModule {
  /** Stable slug, also the deep-link target (#/<id>). */
  id: string;
  /** Display name in the index. */
  name: string;
  /** One-line description of what this prototype tests. */
  tagline: string;
  flowKind: FlowKind;
  Entrance: FC<SkinViewProps>;
  Loading: FC<SkinViewProps>;
  InGame: FC<SkinViewProps>;
}
