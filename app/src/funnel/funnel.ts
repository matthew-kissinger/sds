// SPDX-License-Identifier: AGPL-3.0-or-later
//
// How far players get, in which language, on what kind of device, and how the game
// ran for them. Counts for the owner, sent to the Worker's existing /api/event route
// (docs/operations/funnel.md).
//
// Nothing here identifies a player or links one event to another: no token, no
// running name, no stored or per-visit id, no cookies. Times and amounts are sent as
// coarse buckets, never as measured values. So the table can answer "how many
// loads in this language reached Play", and cannot answer anything about one person. A
// failed send changes nothing for the player, and it is never retried.

import { activeLocale, useI18nStore } from '@app/i18n/store';
import { resolvedRenderTier } from '@app/quality/autoTier';
import { scoreApiBase } from '@app/scores/config';
import { useGameStore, type GamePhase, type GameStore } from '@app/state/store';

export type FunnelEvent =
  | 'funnel_load' | 'funnel_ready' | 'funnel_play' | 'funnel_moved' | 'funnel_complete'
  | 'funnel_graphics_lost' | 'funnel_hidden' | 'funnel_left'
  | 'language_offered' | 'language_chosen' | 'language_declined';

type FunnelProps = Readonly<Record<string, string | number>>;

/** Each row is the value it stays below and what to call it. The last row catches the rest. */
type Buckets = readonly (readonly [below: number, label: string])[];

export const LOAD_BUCKETS: Buckets = [[5_000, '<5s'], [10_000, '5-10s'], [20_000, '10-20s'], [40_000, '20-40s'], [Infinity, '>40s']];
export const ELAPSED_BUCKETS: Buckets = [
  [15_000, '<15s'], [30_000, '15-30s'], [60_000, '30-60s'], [120_000, '1-2m'], [300_000, '2-5m'], [600_000, '5-10m'], [Infinity, '>10m'],
];
export const FRAME_BUCKETS: Buckets = [[20, '<20ms'], [33, '20-33ms'], [50, '33-50ms'], [100, '50-100ms'], [250, '100-250ms'], [Infinity, '>250ms']];
const SHEEP_BUCKETS: Buckets = [[0.25, '<25%'], [0.5, '25-50%'], [0.75, '50-75%'], [Infinity, '>75%']];

function bucketIndex(value: number, buckets: Buckets): number {
  let index = 0;
  while (value >= buckets[index]![0]) index += 1;
  return index;
}

export function bucketLabel(value: number, buckets: Buckets): string {
  return buckets[bucketIndex(value, buckets)]![1];
}

/** A share of the flock, so 25 and 200 sheep read alike. Flock size is sent beside it. */
export function sheepBucket(penned: number, flock: number): string {
  if (penned <= 0) return 'none';
  if (penned >= flock) return 'all';
  return bucketLabel(penned / flock, SHEEP_BUCKETS);
}

/** Counts per bucket hold the median without a list of samples. `none` means no frame was measured. */
export function medianFrameBucket(counts: ArrayLike<number>): string {
  let total = 0;
  for (let index = 0; index < counts.length; index += 1) total += counts[index]!;
  if (total === 0) return 'none';
  let seen = 0;
  let index = 0;
  for (; index < counts.length - 1; index += 1) {
    seen += counts[index]!;
    if (seen * 2 >= total) break;
  }
  return FRAME_BUCKETS[index]![1];
}

/** `returned` is a player back at the title after a run, who `title` must not count as never having played. */
export function leavingPhase(phase: GamePhase, runStarted: boolean): 'title' | 'playing' | 'complete' | 'returned' {
  if (phase === 'complete') return 'complete';
  if (!runStarted) return 'title';
  return phase === 'title' ? 'returned' : 'playing';
}

/** Coarse on purpose: a shape, not a device. */
export function deviceClass(coarsePointer: boolean, shortSide: number): 'phone' | 'tablet' | 'desktop' {
  if (!coarsePointer) return 'desktop';
  return shortSide < 600 ? 'phone' : 'tablet';
}

/** A language tag such as `id-ID`. Anything else is not sent as written. */
export function browserLanguage(language: string | undefined): string {
  return language !== undefined && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,4}){0,2}$/.test(language) ? language : 'other';
}

function sharedProps(): Record<string, string> {
  return {
    ui: activeLocale(),
    browser: browserLanguage(navigator.language),
    device: deviceClass(matchMedia('(pointer: coarse)').matches, Math.min(innerWidth, innerHeight)),
  };
}

function declined(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true || nav.doNotTrack === '1';
}

export function trackFunnel(name: FunnelEvent, props: FunnelProps = {}): void {
  // Not in an async function, so a `fetch` or `matchMedia` that throws, as a wrapper
  // around them might, would otherwise land in whatever game code got here.
  try {
    if (declined()) return;
    // keepalive is what lets the events sent as a page goes away arrive.
    void fetch(`${scoreApiBase()}/api/event`, {
      method: 'POST',
      credentials: 'omit',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, props: { ...sharedProps(), ...props } }),
    }).catch(() => undefined);
  } catch {
    // A count is worth less than the game.
  }
}

/**
 * Frame gaps, from the timestamp the browser already hands a frame callback, so no
 * clock is read per frame and the only work is one comparison run and one increment.
 * It runs beside the render loop and touches nothing the simulation reads.
 */
function sampleFrames(): { reset(): void; median(): string } {
  const counts = new Uint32Array(FRAME_BUCKETS.length);
  let last = 0;
  const onFrame = (now: number) => {
    // A stopped renderer draws no frames worth counting.
    if (useGameStore.getState().graphicsLost) return;
    if (last !== 0) counts[bucketIndex(now - last, FRAME_BUCKETS)]! += 1;
    last = now;
    requestAnimationFrame(onFrame);
  };
  requestAnimationFrame(onFrame);
  return { reset: () => counts.fill(0), median: () => medianFrameBucket(counts) };
}

/** Sent with frame time as well as at ready: rows are not linked, and a frame time means little without its tier. */
function renderProps(state: GameStore): FunnelProps {
  const receipt = state.autoTierReceipt;
  if (receipt === null) return { renderer: 'pending', tier: 'pending' };
  return { renderer: receipt.backend, tier: resolvedRenderTier(state.quality, receipt) };
}

function runProps(state: GameStore): FunnelProps {
  return { flock: state.flockSize, mode: state.sim.authoritative ? 'solo' : 'multiplayer' };
}

/** Each stage once per page load: this counts how far a load got, not how often someone plays. */
export function startFunnel(): void {
  if (declined()) return;
  trackFunnel('funnel_load', { source: useI18nStore.getState().source });
  const seen = new Set<FunnelEvent>();
  const once = (name: FunnelEvent, props?: () => FunnelProps) => {
    if (seen.has(name)) return;
    seen.add(name);
    trackFunnel(name, props?.());
  };
  let frames: ReturnType<typeof sampleFrames> | null = null;
  let runStartedAt: number | null = null;
  let previousPhase = useGameStore.getState().gamePhase;

  useGameStore.subscribe((state) => {
    // Listeners run in a plain loop, so a throw here would skip the game's own and
    // surface in whatever changed the state.
    try {
      if (state.sceneReady) {
        frames ??= sampleFrames();
        // The page's own clock starts at navigation, so this is the wait the player saw.
        once('funnel_ready', () => ({ load: bucketLabel(performance.now(), LOAD_BUCKETS), ...renderProps(state) }));
      }
      if (state.graphicsLost) once('funnel_graphics_lost');
      // Resuming from a pause is the same run.
      if (state.gamePhase === 'playing' && previousPhase !== 'playing' && previousPhase !== 'paused') {
        runStartedAt = performance.now();
        frames?.reset();
      }
      previousPhase = state.gamePhase;
      if (state.gamePhase === 'playing') once('funnel_play', () => runProps(state));
      if (state.dogMoved) once('funnel_moved', () => runProps(state));
      if (state.gamePhase === 'complete') once('funnel_complete', () => runProps(state));
    } catch {
      // A count is worth less than the game.
    }
  });

  const leaving = (): FunnelProps => {
    const state = useGameStore.getState();
    return {
      phase: leavingPhase(state.gamePhase, runStartedAt !== null),
      // From the run's start, or from the page's when no run started: how long a
      // player stayed before giving up on the title is the question there.
      elapsed: bucketLabel(performance.now() - (runStartedAt ?? 0), ELAPSED_BUCKETS),
      sheep: sheepBucket(state.pennedCount, state.flockSize),
      frame: frames?.median() ?? 'none',
      ...renderProps(state),
      ...runProps(state),
    };
  };
  window.addEventListener('pagehide', () => once('funnel_left', leaving));
  // A phone usually leaves by switching apps, which hides the page and may then kill
  // it with no pagehide at all. So funnel_left undercounts and this one overcounts:
  // the page may come back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') once('funnel_hidden', leaving);
  });
}
