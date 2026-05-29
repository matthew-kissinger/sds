/**
 * Cycle 27 Phase F — first-30s onboarding pointer tour.
 *
 * 5-second auto-fade overlay shown to first-time visitors only.
 * Pulses pointer arrows for WASD (movement), Shift (sprint), S key
 * (whistle) on desktop; the mobile path swaps in tap-and-hold +
 * virtual-stick captions.
 *
 * Dismissal: auto-fades after 5s OR on the first user input. The
 * localStorage flag flips on first input (or auto-fade), so a second
 * visit never re-shows.
 *
 * Visual treatment is intentionally subtle — frosted backdrop, 1-line
 * captions, pointer-events:none so it never blocks the canvas.
 *
 * Testable hooks (gating + dismissal-on-input) live in `./pointerTourState.js`
 * so vitest can exercise them without React or window.
 *
 * Cycle 48 P2: converted from the element-factory .js to token-driven .tsx.
 * The keyframes that used to ride along in a dangerouslySetInnerHTML <style>
 * tag now live in css/main.css (sds-pointer-tour-fadein / -fadeout), matching
 * the Cycle 47 scene-picker precedent; the overlay just references them by
 * name. The one 6-digit hex (the key-cap text) maps to the text token (#fff).
 * Behavior is identical to the previous PointerTour.js.
 */
import { useEffect, useState, useRef, type CSSProperties } from 'react';
import { shouldShowTour, markTourShown, INPUT_EVENTS } from './pointerTourState.js';
import { color } from '../ui/tokens';

const FADE_AFTER_MS = 5000;

interface Gesture {
    keys: string[];
    caption: string;
}

const DESKTOP_GESTURES: Gesture[] = [
    { keys: ['W', 'A', 'S', 'D'], caption: 'Move' },
    { keys: ['Shift'], caption: 'Sprint' },
    { keys: ['S'], caption: 'Whistle' },
];

const MOBILE_GESTURES: Gesture[] = [
    { keys: ['Stick'], caption: 'Move' },
    { keys: ['Hold'], caption: 'Sprint' },
    { keys: ['Tap'], caption: 'Whistle' },
];

interface PointerTourProps {
    isMobile?: boolean;
}

export function PointerTour({ isMobile = false }: PointerTourProps) {
    const [visible, setVisible] = useState(() => shouldShowTour());
    const dismissedRef = useRef(false);

    useEffect(() => {
        if (!visible) return;

        const dismiss = () => {
            if (dismissedRef.current) return;
            dismissedRef.current = true;
            markTourShown();
            setVisible(false);
        };

        const fadeTimer = setTimeout(dismiss, FADE_AFTER_MS);
        for (const ev of INPUT_EVENTS) {
            window.addEventListener(ev, dismiss, { once: true, passive: true });
        }
        return () => {
            clearTimeout(fadeTimer);
            for (const ev of INPUT_EVENTS) {
                window.removeEventListener(ev, dismiss);
            }
        };
    }, [visible]);

    if (!visible) return null;

    const gestures = isMobile ? MOBILE_GESTURES : DESKTOP_GESTURES;

    const keyCapStyle: CSSProperties = {
        minWidth: '1.6rem',
        padding: '0.2rem 0.45rem',
        borderRadius: '6px',
        background: 'rgba(255,255,255,0.12)',
        color: color.text,
        fontWeight: 600,
        fontSize: '0.78rem',
        textAlign: 'center',
        letterSpacing: '0.02em',
    };

    return (
        <div
            aria-hidden="true"
            style={{
                position: 'fixed',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 1500,
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                paddingBottom: isMobile ? '14vh' : '8vh',
                animation:
                    'sds-pointer-tour-fadein 0.4s ease-out, sds-pointer-tour-fadeout 0.6s ease-in 4.4s forwards',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    gap: isMobile ? '0.8rem' : '1.4rem',
                    padding: isMobile ? '0.6rem 0.9rem' : '0.9rem 1.4rem',
                    borderRadius: '14px',
                    background: 'rgba(8, 14, 20, 0.55)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
                }}
            >
                {gestures.map((g, i) => (
                    <div
                        key={i}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}
                    >
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                            {g.keys.map((k) => (
                                <span key={k} style={keyCapStyle}>
                                    {k}
                                </span>
                            ))}
                        </div>
                        <span
                            style={{
                                color: 'rgba(255,255,255,0.78)',
                                fontSize: '0.72rem',
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                            }}
                        >
                            {g.caption}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
