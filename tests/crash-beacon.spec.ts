// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// P0-CRASH (hardening phase 0): client crash reporting contract.
//
// When the React ErrorBoundary catches an error, reportCrash must POST a
// `client_error` event with { message, stack, build, ua } to /api/event
// before the reload UI shows. This locks the beacon shape, the ~4KB stack
// truncation, the isTelemetryEnabled() gate, and the never-throws guarantee
// (it runs inside componentDidCatch while the UI is already broken).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const state = vi.hoisted(() => ({ telemetryEnabled: true }));

vi.mock('../js/GameBridge.js', () => ({ getNetworkManager: () => null }));
vi.mock('../js/runtimeConfig.js', () => ({
  getApiBase: () => 'https://worker.test',
  isTelemetryEnabled: () => state.telemetryEnabled,
}));

import { reportCrash } from '../js/telemetry.js';

describe('crash beacon - reportCrash (P0-CRASH)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    state.telemetryEnabled = true;
    fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
    );
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { userAgent: 'TestUA/1.0' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const sentBody = () => JSON.parse(fetchSpy.mock.calls[0][1].body);

  it('POSTs client_error with { message, stack, build, ua } to /api/event', async () => {
    const error = new Error('boom');
    await reportCrash(error, { componentStack: '\n    at StartScreen\n    at App' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://worker.test/api/event');
    expect(init.method).toBe('POST');

    const body = sentBody();
    expect(body.name).toBe('client_error');
    expect(body.props.message).toBe('boom');
    expect(body.props.stack).toContain('boom');
    expect(body.props.stack).toContain('at StartScreen');
    expect(body.props.build).toBe('dev'); // no __BUILD_ID__ define under vitest
    expect(body.props.ua).toBe('TestUA/1.0');
  });

  it('truncates the stack to 4096 chars', async () => {
    const error = new Error('long');
    error.stack = 'x'.repeat(10_000);
    await reportCrash(error);

    expect(sentBody().props.stack.length).toBe(4096);
  });

  it('respects the isTelemetryEnabled() gate', async () => {
    state.telemetryEnabled = false;
    const result = await reportCrash(new Error('local dev'));

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never throws on malformed input', async () => {
    await expect(reportCrash(null)).resolves.not.toThrow;
    await expect(reportCrash(undefined, undefined)).resolves.not.toThrow;
    await expect(reportCrash('string error')).resolves.not.toThrow;
    // String errors still produce a usable message.
    const last = fetchSpy.mock.calls.at(-1);
    expect(JSON.parse(last[1].body).props.message).toBe('string error');
  });

  it('never throws even when fetch itself is gone', async () => {
    vi.stubGlobal('fetch', undefined);
    const result = await reportCrash(new Error('no fetch'));
    expect(result).toBeNull();
  });
});
