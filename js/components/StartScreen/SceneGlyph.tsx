/**
 * SceneGlyph — bespoke scene-vignette art for the scene picker.
 *
 * Cycle 47 P3: lifted verbatim out of ScenePicker's SCENE_CHROME.icon. These
 * are hand-drawn illustrations (a sunlit island, a mountain range, a fenced
 * farmhouse), not generic UI icons, so lucide-react does not replace them.
 * They stay owned SVG; this module just gives them a typed home so the Phase 5
 * ScenePicker conversion has a clean child to render instead of an inline
 * createElement blob.
 *
 * The white-on-gradient rgba strokes are art values painted over each scene's
 * colored card gradient, not theme tokens, so they are not tokenized.
 */
import React from 'react';

export type SceneGlyphId = 'rolling-hills' | 'open-country' | 'field';

// Shared outer-svg attributes. All three vignettes draw into the same
// 64x40 viewBox at the same 96x60 render size with the same stroke style.
const SVG_PROPS = {
    viewBox: '0 0 64 40',
    width: '96',
    height: '60',
    fill: 'none',
    stroke: 'rgba(255,255,255,0.92)',
    strokeWidth: '1.6',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
} as const;

const GLYPHS: Record<SceneGlyphId, React.ReactElement> = {
    'rolling-hills': (
        <>
            <circle cx="50" cy="12" r="4" fill="rgba(255,235,180,0.78)" stroke="none" />
            <path d="M6 28 Q14 18, 26 22 T48 24 Q56 24, 58 28" fill="rgba(255,255,255,0.2)" />
            <path d="M2 33 Q8 31, 14 33 T26 33 T38 33 T50 33 T62 33" />
            <path d="M2 37 Q8 35, 14 37 T26 37 T38 37 T50 37 T62 37" strokeOpacity="0.5" />
            <path d="M22 22 v-3 M22 19 q-2 -3 0 -5 q2 2 0 5" fill="rgba(255,255,255,0.32)" stroke="rgba(255,255,255,0.85)" />
            <path d="M34 23 v-2 M34 21 q-1.5 -2.5 0 -4 q1.5 1.5 0 4" fill="rgba(255,255,255,0.32)" stroke="rgba(255,255,255,0.85)" />
        </>
    ),
    'open-country': (
        <>
            <path d="M2 28 L14 12 L26 28 Z" fill="rgba(255,255,255,0.2)" />
            <path d="M20 28 L34 8 L48 28 Z" fill="rgba(255,255,255,0.24)" />
            <path d="M40 28 L52 14 L62 28 Z" fill="rgba(255,255,255,0.2)" />
            <line x1="2" y1="32" x2="62" y2="32" />
            <path d="M10 32 v-3 M10 29 q-1.6 -2.5 0 -4 q1.6 1.5 0 4" fill="rgba(255,255,255,0.32)" stroke="rgba(255,255,255,0.92)" />
            <path d="M22 32 v-3 M22 29 q-1.6 -2.5 0 -4 q1.6 1.5 0 4" fill="rgba(255,255,255,0.32)" stroke="rgba(255,255,255,0.92)" />
            <path d="M40 32 v-3 M40 29 q-1.6 -2.5 0 -4 q1.6 1.5 0 4" fill="rgba(255,255,255,0.32)" stroke="rgba(255,255,255,0.92)" />
            <path d="M54 32 v-3 M54 29 q-1.6 -2.5 0 -4 q1.6 1.5 0 4" fill="rgba(255,255,255,0.32)" stroke="rgba(255,255,255,0.92)" />
        </>
    ),
    field: (
        <>
            <line x1="2" y1="32" x2="62" y2="32" />
            <rect x="34" y="20" width="14" height="12" fill="rgba(255,255,255,0.24)" />
            <path d="M32 20 L41 12 L50 20 Z" fill="rgba(255,255,255,0.34)" />
            <rect x="39" y="25" width="4" height="7" fill="rgba(255,255,255,0.45)" stroke="none" />
            <line x1="6" y1="28" x2="28" y2="28" />
            <line x1="6" y1="31" x2="28" y2="31" />
            <line x1="8" y1="26" x2="8" y2="32" />
            <line x1="14" y1="26" x2="14" y2="32" />
            <line x1="20" y1="26" x2="20" y2="32" />
            <line x1="26" y1="26" x2="26" y2="32" />
        </>
    ),
};

export function SceneGlyph({ scene }: { scene: string }) {
    const glyph = GLYPHS[scene as SceneGlyphId] ?? GLYPHS.field;
    return <svg {...SVG_PROPS}>{glyph}</svg>;
}
