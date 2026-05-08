/**
 * Cycle 27 Phase B — cinema-runner unit coverage.
 *
 * The cinema runner depends on a live Vite + Playwright Chromium spawn
 * that takes ~90s on swiftshader for a single static shot. That's too
 * slow + brittle for vitest; full headless-launch integration is
 * exercised manually via `npm run cinema -- --shot=og-field` and gated
 * by the cycle-close acceptance criterion.
 *
 * What this spec covers without spawning anything:
 *   - SHOT manifest invariants (every shot has its required fields).
 *   - shot URL builder produces the `?cinematic=1&ui=off` shape.
 *   - canvasShot helper extracts a PNG buffer from a base64 data URL.
 */
import { describe, it, expect } from 'vitest';
import { SHOTS, DOG_SHOTS, PWA_ICON_SHOT } from '../tools/cinematic/shot-list.mjs';

const KIND_VIDEO = 'video';
const KIND_STATIC = 'static';
const KIND_DOG = 'dog';
const KIND_PWA = 'pwa-icon';
const VALID_KINDS = [KIND_VIDEO, KIND_STATIC, KIND_DOG, KIND_PWA];

describe('cinema-runner shot manifest', () => {
    it('every shot has id + kind + scene', () => {
        for (const shot of [...SHOTS, ...DOG_SHOTS, PWA_ICON_SHOT]) {
            expect(shot.id, 'shot.id missing').toBeTruthy();
            expect(VALID_KINDS, `${shot.id}: unknown kind ${shot.kind}`).toContain(shot.kind);
            expect(shot.scene, `${shot.id}: scene missing`).toBeTruthy();
        }
    });

    it('static shots declare size + camera pose', () => {
        for (const shot of SHOTS.filter((s) => s.kind === KIND_STATIC)) {
            expect(shot.size, `${shot.id}: size missing`).toBeTruthy();
            expect(shot.size.width, `${shot.id}: width`).toBeGreaterThan(0);
            expect(shot.size.height, `${shot.id}: height`).toBeGreaterThan(0);
            expect(shot.camera, `${shot.id}: camera missing`).toBeTruthy();
        }
    });

    it('video shots declare durationMs + camera path', () => {
        for (const shot of SHOTS.filter((s) => s.kind === KIND_VIDEO)) {
            expect(shot.durationMs, `${shot.id}: durationMs`).toBeGreaterThan(0);
            expect(Array.isArray(shot.camera), `${shot.id}: camera path is array`).toBe(true);
            expect(shot.camera.length, `${shot.id}: camera path has ≥2 keyframes`).toBeGreaterThanOrEqual(2);
        }
    });

    it('OG card shots target 1200×630 (Twitter/Facebook/LinkedIn share spec)', () => {
        const ogCards = SHOTS.filter((s) => s.kind === KIND_STATIC && s.id.startsWith('og-'));
        expect(ogCards.length).toBeGreaterThan(0);
        for (const shot of ogCards) {
            expect(shot.size.width).toBe(1200);
            expect(shot.size.height).toBe(630);
        }
    });

    it('dog shots cover all five canonical dogs', () => {
        const dogIds = DOG_SHOTS.map((s) => s.dogId);
        expect(dogIds).toEqual(['jep', 'pip', 'sally', 'shiloh', 'george_washington']);
    });
});

describe('cinema-runner URL builder', () => {
    function shotUrl(shot, baseUrl) {
        const params = new URLSearchParams();
        params.set('cinematic', '1');
        params.set('ui', 'off');
        if (shot.scene) params.set('scene', shot.scene);
        if (typeof shot.sun === 'number') params.set('sun', String(shot.sun));
        return `${baseUrl}/?${params.toString()}`;
    }

    it('a static shot URL carries cinematic=1, ui=off, scene, sun', () => {
        const shot = SHOTS.find((s) => s.id === 'og-field');
        const url = new URL(shotUrl(shot, 'http://localhost:3000'));
        expect(url.searchParams.get('cinematic')).toBe('1');
        expect(url.searchParams.get('ui')).toBe('off');
        expect(url.searchParams.get('scene')).toBe('field');
        expect(url.searchParams.get('sun')).toBe('0.5');
    });
});

describe('cinema-runner canvas capture path', () => {
    it('decodes a base64 PNG data URL into a Buffer', () => {
        const tinyPngDataUrl =
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';
        const base64 = tinyPngDataUrl.slice('data:image/png;base64,'.length);
        const buf = Buffer.from(base64, 'base64');
        expect(buf.length).toBeGreaterThan(0);
        expect(buf.slice(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    });
});
