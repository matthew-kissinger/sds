// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ELAPSED_BUCKETS,
  FRAME_BUCKETS,
  LOAD_BUCKETS,
  browserLanguage,
  bucketLabel,
  deviceClass,
  leavingPhase,
  medianFrameBucket,
  sheepBucket,
  startFunnel,
  trackFunnel,
} from '../app/src/funnel/funnel';
import { useGameStore } from '../app/src/state/store';

describe('what the counts may say', () => {
  it('sorts a device into one of three shapes', () => {
    expect(deviceClass(false, 900)).toBe('desktop');
    expect(deviceClass(true, 390)).toBe('phone');
    expect(deviceClass(true, 768)).toBe('tablet');
  });

  it('sends a language tag and nothing else in its place', () => {
    expect(browserLanguage('id-ID')).toBe('id-ID');
    expect(browserLanguage('zh-Hans-CN')).toBe('zh-Hans-CN');
    expect(browserLanguage('not a language tag')).toBe('other');
    expect(browserLanguage('x'.repeat(200))).toBe('other');
    expect(browserLanguage(undefined)).toBe('other');
  });

  it('turns a wait into a coarse bucket, with each edge in the bucket above it', () => {
    expect(bucketLabel(4_999, LOAD_BUCKETS)).toBe('<5s');
    expect(bucketLabel(5_000, LOAD_BUCKETS)).toBe('5-10s');
    expect(bucketLabel(39_999, LOAD_BUCKETS)).toBe('20-40s');
    expect(bucketLabel(600_000, LOAD_BUCKETS)).toBe('>40s');
    expect(bucketLabel(0, ELAPSED_BUCKETS)).toBe('<15s');
    expect(bucketLabel(296_000, ELAPSED_BUCKETS)).toBe('2-5m');
    expect(bucketLabel(3_600_000, ELAPSED_BUCKETS)).toBe('>10m');
  });

  it('reads sheep in as a share of the flock', () => {
    expect(sheepBucket(0, 25)).toBe('none');
    expect(sheepBucket(1, 200)).toBe('<25%');
    expect(sheepBucket(25, 75)).toBe('25-50%');
    expect(sheepBucket(100, 200)).toBe('50-75%');
    expect(sheepBucket(24, 25)).toBe('>75%');
    expect(sheepBucket(25, 25)).toBe('all');
  });

  it('finds the median frame from counts alone', () => {
    const counts = (...values: number[]) => FRAME_BUCKETS.map((_, index) => values[index] ?? 0);
    expect(medianFrameBucket(counts())).toBe('none');
    expect(medianFrameBucket(counts(100))).toBe('<20ms');
    // A few awful frames do not move a median.
    expect(medianFrameBucket(counts(90, 0, 0, 0, 0, 10))).toBe('<20ms');
    expect(medianFrameBucket(counts(10, 10, 80))).toBe('33-50ms');
    expect(medianFrameBucket(counts(0, 0, 0, 0, 0, 3))).toBe('>250ms');
  });

  it('tells a player who never started from one who came back to the title', () => {
    expect(leavingPhase('title', false)).toBe('title');
    expect(leavingPhase('title', true)).toBe('returned');
    expect(leavingPhase('playing', true)).toBe('playing');
    expect(leavingPhase('paused', true)).toBe('playing');
    expect(leavingPhase('complete', true)).toBe('complete');
    // Graphics lost before any run also reads as paused.
    expect(leavingPhase('paused', false)).toBe('title');
  });
});

describe('a count', () => {
  const fetchSpy = vi.fn(async () => new Response('{}'));

  beforeEach(() => {
    fetchSpy.mockClear();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('navigator', { language: 'id-ID' });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('innerHeight', 844);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('carries no identity', () => {
    trackFunnel('funnel_play', { flock: 25 });
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/event');
    expect(init.credentials).toBe('omit');
    expect(init.headers).not.toHaveProperty('authorization');
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'funnel_play',
      props: { ui: 'en', browser: 'id-ID', device: 'phone', flock: 25 },
    });
  });

  it('is not sent by a browser asking not to be tracked', () => {
    vi.stubGlobal('navigator', { language: 'id-ID', globalPrivacyControl: true });
    trackFunnel('funnel_load');
    vi.stubGlobal('navigator', { language: 'id-ID', doNotTrack: '1' });
    trackFunnel('funnel_load');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never throws into the game, whatever fetch or matchMedia do', () => {
    vi.stubGlobal('fetch', () => { throw new Error('a wrapper around fetch'); });
    expect(() => trackFunnel('funnel_load')).not.toThrow();
    vi.stubGlobal('matchMedia', () => { throw new Error('a wrapper around matchMedia'); });
    expect(() => trackFunnel('funnel_load')).not.toThrow();
  });

  it('never surfaces a failed send', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('offline'));
    expect(() => trackFunnel('funnel_load')).not.toThrow();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  });
});

describe('a page load', () => {
  const fetchSpy = vi.fn(async () => new Response('{}'));
  const windowListeners = new Map<string, () => void>();
  const documentListeners = new Map<string, () => void>();
  let frame: ((now: number) => void) | null = null;
  const doc = { visibilityState: 'visible', addEventListener: (name: string, run: () => void) => documentListeners.set(name, run) };
  const sent = () => fetchSpy.mock.calls.map((call) => JSON.parse(String((call as unknown as [string, RequestInit])[1].body)) as {
    name: string;
    props: Record<string, string | number>;
  });
  const named = (name: string) => sent().filter((event) => event.name === name);

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('navigator', { language: 'id-ID' });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('innerHeight', 844);
    vi.stubGlobal('window', { addEventListener: (name: string, run: () => void) => windowListeners.set(name, run) });
    vi.stubGlobal('document', doc);
    vi.stubGlobal('requestAnimationFrame', (run: (now: number) => void) => { frame = run; return 1; });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('counts each stage once and leaves with coarse values only', () => {
    const clock = vi.spyOn(performance, 'now');
    clock.mockReturnValue(12_000);
    startFunnel();
    expect(sent().map((event) => event.name)).toEqual(['funnel_load']);
    expect(frame).toBeNull();

    const receipt = {
      backend: 'webgl2', fillMs: 3, targetPixels: 1, tier: 'low', deviceClass: 'mobile', reason: 'mobile-cap', runtimeDemotions: 0,
    } as const;
    useGameStore.setState({ sceneReady: true, autoTierReceipt: receipt, quality: 'auto' });
    useGameStore.setState({ sceneReady: true });
    expect(named('funnel_ready')).toHaveLength(1);
    expect(named('funnel_ready')[0]!.props).toMatchObject({ load: '10-20s', renderer: 'webgl2', tier: 'low' });

    // Three title frames, which a run's start must not count.
    frame!(1_000);
    frame!(1_300);
    frame!(1_600);

    clock.mockReturnValue(20_000);
    useGameStore.getState().startGame(25);
    expect(named('funnel_play')).toHaveLength(1);
    expect(named('funnel_moved')).toHaveLength(0);

    frame!(2_000);
    frame!(2_040);
    frame!(2_080);
    frame!(2_120);

    useGameStore.getState().markDogMoved();
    useGameStore.getState().markDogMoved();
    expect(named('funnel_moved')).toHaveLength(1);

    useGameStore.getState().sheepPenned(10);
    useGameStore.getState().pause();
    useGameStore.getState().resume();

    // Hidden, then back, then gone: one of each, each describing its own moment.
    clock.mockReturnValue(50_000);
    doc.visibilityState = 'hidden';
    documentListeners.get('visibilitychange')!();
    documentListeners.get('visibilitychange')!();
    doc.visibilityState = 'visible';
    clock.mockReturnValue(110_000);
    windowListeners.get('pagehide')!();
    windowListeners.get('pagehide')!();

    expect(named('funnel_hidden')).toHaveLength(1);
    expect(named('funnel_hidden')[0]!.props.elapsed).toBe('30-60s');
    expect(named('funnel_left')).toHaveLength(1);
    expect(named('funnel_left')[0]!.props).toEqual({
      ui: 'en',
      browser: 'id-ID',
      device: 'phone',
      phase: 'playing',
      elapsed: '1-2m',
      sheep: '25-50%',
      frame: '33-50ms',
      renderer: 'webgl2',
      tier: 'low',
      flock: 25,
      mode: 'solo',
    });
  });

  it('starts nothing for a browser asking not to be tracked', () => {
    vi.stubGlobal('navigator', { language: 'id-ID', doNotTrack: '1' });
    fetchSpy.mockClear();
    frame = null;
    windowListeners.clear();
    documentListeners.clear();
    startFunnel();
    useGameStore.setState({ sceneReady: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(windowListeners.size).toBe(0);
    expect(documentListeners.size).toBe(0);
  });
});
