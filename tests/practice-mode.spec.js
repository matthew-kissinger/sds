// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 26 v2.1.0 — Practice Paddock contract tests.
 *
 * Locks the surface contract without spinning up the full GameState
 * instance (which depends on Three.js / DOM). Each assertion guards a
 * specific regression risk:
 *
 *  1. Practice tile renders first in the mode picker (first-time visitors
 *     see it before any timed/competitive option).
 *  2. i18n strings exist for both label and description (no missing-key
 *     fallback into "modes.practice" leaking into UI).
 *  3. The localStorage first-visit flag uses the dot-namespaced key the
 *     codebase has standardized on (matches sds.cameraZoom.*).
 *  4. Score submission is gated against practice mode (no leaderboard
 *     pollution from the no-pressure entry mode).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { MODES, modesForWorld } from '../js/components/entrance/worlds.js';
import { SOLO_MODE_SHEEP_COUNT } from '../js/gamestate/modes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function readSource(rel) {
    return readFileSync(resolve(repoRoot, rel), 'utf8');
}

describe('Practice Paddock contract', () => {
    it('Practice is first in the entrance MODES (position 0)', () => {
        // Cycle 51 P7: the world-first entrance replaced the old SinglePlayerModes
        // picker; Practice (no timer, no fail state) stays the first difficulty so
        // it reads as the default. Cycle 58: MODES is now derived from the legacy
        // ladder (and per-world ladders via modesForWorld), so this asserts the
        // resolved value, not a source literal — Practice still leads every biome.
        expect(MODES[0].id).toBe('practice');
        for (const worldId of ['field', 'rolling-hills', 'open-country']) {
            expect(modesForWorld(worldId)[0].id).toBe('practice');
        }
    });

    it('i18n English locale exposes modes.practice + modes.practiceDesc', () => {
        const src = readSource('js/locales/en/index.js');
        expect(src).toMatch(/practice:\s*['"][^'"]+['"]/);
        expect(src).toMatch(/practiceDesc:\s*['"][^'"]+['"]/);
    });

    it('SOLO_MODE_SHEEP_COUNT registers practice: 30 (legacy default)', () => {
        // Cycle 29 B1: SOLO_MODE_SHEEP_COUNT lives in js/gamestate/modes.js.
        // Cycle 58: it is single-sourced from the legacy ladder (per-biome counts
        // now live on each scene's soloLadder), so assert the resolved value.
        expect(SOLO_MODE_SHEEP_COUNT.practice).toBe(30);
    });

    it('submitScoreToLeaderboard blocks practice mode', () => {
        // Cycle 29 B5: submitScoreToLeaderboard's body was extracted to
        // js/gamestate/completion.js. The Cycle 26 practice-mode guard
        // (return early when singlePlayerMode === 'practice') now lives
        // there; GameState's method is a thin delegator.
        const src = readSource('js/gamestate/completion.js');
        expect(src).toMatch(
            /state\.singlePlayerMode\s*===\s*['"]practice['"][\s\S]{0,200}return/
        );
    });

    it('completion overlay skips score submission for practice', () => {
        // Cycle 28 Stream B1: showCompletionOverlay body extracted from
        // main.js to js/boot/completionOverlay.js. The practice-mode guard
        // lives there now; main.js method is a thin shim.
        const src = readSource('js/boot/completionOverlay.js');
        expect(src).toMatch(/game\.singlePlayerMode\s*!==\s*['"]practice['"]/);
    });

    it('PracticeHint component exists and is exported from GameHUD index', () => {
        const idx = readSource('js/components/GameHUD/index.js');
        expect(idx).toMatch(/PracticeHint/);
        const comp = readSource('js/components/GameHUD/PracticeHint.tsx');
        expect(comp).toMatch(/export function PracticeHint/);
    });
});
