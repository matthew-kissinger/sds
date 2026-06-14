// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serviceWorkerSource = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const pagesHeaders = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');

function headerSection(path) {
    const lines = pagesHeaders.split(/\r?\n/);
    const start = lines.indexOf(path);
    expect(start, `${path} header section`).toBeGreaterThanOrEqual(0);
    return lines.slice(start, start + 3).join('\n');
}

describe('production cache policy', () => {
    it('network-firsts unversioned entrance and terrain assets before hashed asset matching', () => {
        expect(serviceWorkerSource).toContain('const MUTABLE_UNHASHED = [');
        expect(serviceWorkerSource).toMatch(/assets\\\/scenes\\\/entrance/);
        expect(serviceWorkerSource).toMatch(/terrain\\\//);

        const mutableRoute = serviceWorkerSource.indexOf('MUTABLE_UNHASHED.some');
        const immutableRoute = serviceWorkerSource.indexOf('IMMUTABLE_HASHED.test');
        expect(mutableRoute).toBeGreaterThanOrEqual(0);
        expect(immutableRoute).toBeGreaterThanOrEqual(0);
        expect(mutableRoute).toBeLessThan(immutableRoute);

        const routeBody = serviceWorkerSource.slice(mutableRoute, immutableRoute);
        expect(routeBody).toContain('event.respondWith(networkFirst(req));');
    });

    it('publishes short-lived Cloudflare Pages headers for mutable production assets', () => {
        expect(headerSection('/sw.js')).toContain(
            'Cache-Control: no-cache, no-store, must-revalidate',
        );
        expect(headerSection('/assets/scenes/entrance/*')).toContain(
            'Cache-Control: public, max-age=300, s-maxage=300, must-revalidate',
        );
        // Cycle 100: /terrain/* split into the JSON manifest (cache only) and the
        // brotli-pre-compressed .bin (cache + no-transform + Content-Encoding: br).
        expect(headerSection('/terrain/*.json')).toContain(
            'Cache-Control: public, max-age=300, s-maxage=300, must-revalidate',
        );
        expect(headerSection('/terrain/*.bin')).toContain(
            'Cache-Control: public, max-age=300, s-maxage=300, must-revalidate, no-transform',
        );
        expect(headerSection('/terrain/*.bin')).toContain('Content-Encoding: br');
    });
});
