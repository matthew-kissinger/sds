/**
 * resolveAssetUrl — guards the absolute-root path → BASE_URL prefix
 * resolution that lets the same scene defs work on Cloudflare Pages
 * (root-served) and itch.io (subpath-served).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
    vi.resetModules();
});

async function withBaseUrl(value, fn) {
    vi.resetModules();
    vi.stubGlobal('__VITEST_BASE_URL__', value);
    // Vite injects import.meta.env.BASE_URL at build; in vitest we
    // approximate by stubbing what assetUrl.js falls back to.
    const original = import.meta.env?.BASE_URL;
    if (import.meta.env) import.meta.env.BASE_URL = value;
    const mod = await import('../js/utils/assetUrl.js');
    try {
        return await fn(mod);
    } finally {
        if (import.meta.env) import.meta.env.BASE_URL = original;
    }
}

describe('resolveAssetUrl', () => {
    it('null / undefined / empty → null', async () => {
        await withBaseUrl('/', ({ resolveAssetUrl }) => {
            expect(resolveAssetUrl(null)).toBe(null);
            expect(resolveAssetUrl(undefined)).toBe(null);
            expect(resolveAssetUrl('')).toBe(null);
        });
    });

    it('root-deploy: absolute-root path stays absolute', async () => {
        await withBaseUrl('/', ({ resolveAssetUrl }) => {
            expect(resolveAssetUrl('/terrain/x.bin')).toBe('/terrain/x.bin');
            expect(resolveAssetUrl('/assets/y.png')).toBe('/assets/y.png');
        });
    });

    it('subpath-deploy: absolute-root path becomes relative', async () => {
        await withBaseUrl('./', ({ resolveAssetUrl }) => {
            expect(resolveAssetUrl('/terrain/x.bin')).toBe('./terrain/x.bin');
        });
    });

    it('already-relative path passes through unchanged', async () => {
        await withBaseUrl('./', ({ resolveAssetUrl }) => {
            expect(resolveAssetUrl('terrain/x.bin')).toBe('terrain/x.bin');
            expect(resolveAssetUrl('./terrain/x.bin')).toBe('./terrain/x.bin');
        });
    });

    it('fully-qualified URL passes through unchanged', async () => {
        await withBaseUrl('./', ({ resolveAssetUrl }) => {
            expect(resolveAssetUrl('https://cdn.example.com/x.bin')).toBe(
                'https://cdn.example.com/x.bin',
            );
            expect(resolveAssetUrl('http://localhost:3000/x.bin')).toBe(
                'http://localhost:3000/x.bin',
            );
        });
    });
});
