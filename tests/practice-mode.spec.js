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

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function readSource(rel) {
    return readFileSync(resolve(repoRoot, rel), 'utf8');
}

describe('Practice Paddock contract', () => {
    it('Practice tile is first in MODES (position 0)', () => {
        const src = readSource('js/components/StartScreen/SinglePlayerModes.tsx');
        // The .tsx declaration carries a `: ModeDef[]` type annotation between
        // the name and the `=`, so match anything up to the assignment.
        const modesMatch = src.match(/const MODES[^=]*=\s*\[([\s\S]*?)\];/);
        expect(modesMatch).not.toBeNull();
        const block = modesMatch[1];
        const firstId = block.match(/id:\s*'(\w+)'/);
        expect(firstId?.[1]).toBe('practice');
    });

    it('Practice tile uses the cyan hue token (cyan-500)', () => {
        const src = readSource('js/components/StartScreen/SinglePlayerModes.tsx');
        // The first id:'practice' entry pairs with color: color.hueCyan, the
        // Cycle 48 P2 design-token mirror of the old '#06b6d4' literal.
        const idx = src.indexOf("id: 'practice'");
        expect(idx).toBeGreaterThan(0);
        const slice = src.slice(idx, idx + 240);
        expect(slice).toMatch(/color:\s*color\.hueCyan/);
    });

    it('i18n English locale exposes modes.practice + modes.practiceDesc', () => {
        const src = readSource('js/locales/en/index.js');
        expect(src).toMatch(/practice:\s*['"][^'"]+['"]/);
        expect(src).toMatch(/practiceDesc:\s*['"][^'"]+['"]/);
    });

    it('first-visit localStorage flag uses dot-namespaced sds.has-played', () => {
        const src = readSource('js/components/StartScreen/SinglePlayerModes.tsx');
        expect(src).toMatch(/['"]sds\.has-played['"]/);
        const gameState = readSource('js/GameState.js');
        expect(gameState).toMatch(/sds\.has-played/);
    });

    it('SOLO_MODE_SHEEP_COUNT registers practice: 30', () => {
        // Cycle 29 B1: SOLO_MODE_SHEEP_COUNT was extracted from GameState.js
        // to js/gamestate/modes.js as part of the data-driven mode-config
        // table. Practice's 30-sheep contract is now asserted there.
        const src = readSource('js/gamestate/modes.js');
        const block = src.match(/SOLO_MODE_SHEEP_COUNT\s*=\s*Object\.freeze\(\{([^}]+)\}\)/);
        expect(block).not.toBeNull();
        expect(block[1]).toMatch(/practice:\s*30/);
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
