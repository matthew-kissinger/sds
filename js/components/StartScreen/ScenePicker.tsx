/**
 * ScenePicker — single-card scene selector with prev/next + swipe.
 *
 * Auto-load model (cycle 26): picking a scene IS loading it. After the
 * user's last interaction (chevron, swipe, dot, arrow-key) settles for
 * COMMIT_DEBOUNCE_MS, the visible scene swaps in. Rapid flicks reset
 * the timer so only the final pick fires — no wasted disposes/rebuilds
 * on slow devices.
 *
 * Latest-wins coalescing: if the debounce fires while a swap is already
 * running, the new target stashes in pendingTargetRef. On scene-swap-end
 * we check it — if it differs from the now-active scene, we kick the
 * next swap immediately. If the user flipped and came back to the
 * just-loaded scene, the pending entry drops.
 *
 * Keyboard:
 *   ArrowLeft / ArrowRight  — flip (debounced auto-load)
 *
 * Cycle 47 P5: converted from the hand-built .js (React element-factory calls)
 * to JSX .tsx. The card frame, badges, and chevrons are the token-driven Card /
 * Badge / IconButton primitives; the per-scene gradient art moved to
 * sceneChrome.ts; the pure ordering/commit logic moved to scenePickerLogic.ts.
 * No element-factory calls, no raw hex, no inline style-tag injection, no
 * per-file accent constant. The Cycle 46 attract-crossfade swap contract is
 * preserved exactly.
 */

import { useState, useEffect, useCallback, useRef, type CSSProperties, type TouchEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { listScenes, DEFAULT_SCENE_ID } from '../../../shared/scenes/index.js';
import { getGameInstance, subscribeGameEvent } from '../../GameBridge.js';
import { useResponsive } from '../hooks/usePlatform.js';
import { SceneGlyph } from './SceneGlyph';
import { Card, Badge, IconButton } from '../ui';
import { color, radius, duration } from '../ui/tokens';
import { sceneChrome } from './sceneChrome';
import { orderScenes, resolveSceneId, shouldCommit, commitAction, pendingDispatch, flipIndex, swipeDirection } from './scenePickerLogic';

interface SceneLike { id: string; name: string; description: string }

const TRANSITION_MS = 320;
// Idle time after the last flip before the visible scene actually loads.
// Long enough to coalesce rapid flicks; short enough to feel instant on
// a single tap.
const COMMIT_DEBOUNCE_MS = 300;

type ResponsiveInfo = { isCompact?: boolean; isVeryCompact?: boolean };
type AttractWindow = Window & { __sdsAttractActive?: boolean };

function currentSceneId(): string {
    const ids = (listScenes() as SceneLike[]).map((s) => s.id);
    return resolveSceneId(location.search, ids, DEFAULT_SCENE_ID);
}

function legacySwitchSceneFallback(sceneId: string) {
    const url = new URL(location.href);
    if (sceneId === DEFAULT_SCENE_ID) url.searchParams.delete('scene');
    else url.searchParams.set('scene', sceneId);
    location.href = url.toString();
}

function switchScene(sceneId: string) {
    const game = getGameInstance();
    if (game?.swapScene) {
        game.swapScene(sceneId).catch((err: unknown) => {
            console.warn('[SCENE] swapScene failed; hard-reload fallback', err);
            legacySwitchSceneFallback(sceneId);
        });
        return;
    }
    legacySwitchSceneFallback(sceneId);
}

const containerStyle: CSSProperties = {
    width: '100%',
    maxWidth: '32rem',
    margin: '0 auto 1rem',
    padding: '0.25rem 0',
};

const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: '0.5rem',
    paddingLeft: '0.25rem',
    paddingRight: '0.25rem',
};

const labelStyle: CSSProperties = {
    fontSize: '0.7rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    opacity: 0.6,
    fontWeight: 600,
};

const counterStyle: CSSProperties = {
    fontSize: '0.7rem',
    opacity: 0.5,
    fontVariantNumeric: 'tabular-nums',
};

function chevronPos(side: 'left' | 'right', compact: boolean): CSSProperties {
    return {
        position: 'absolute',
        top: '50%',
        [side]: compact ? '0.4rem' : '0.6rem',
        transform: 'translateY(-50%)',
        zIndex: 3,
    };
}

export function ScenePicker() {
    const [, force] = useState(0);

    // Swap-flow refs (don't need to trigger renders — they coordinate
    // async work).
    const swapInFlightRef = useRef(false);
    const pendingTargetRef = useRef<string | null>(null);
    const commitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    // Set true when we dispatch a queued swap from the swap-end handler;
    // the next activeIndex sync useEffect skips one tick so it doesn't
    // yank visibleIndex back to the just-loaded (now stale) scene.
    const skipNextActiveSync = useRef(false);

    const allScenes = listScenes() as SceneLike[];
    // Fixed display order independent of registry insertion.
    const scenes = orderScenes(allScenes);

    const activeId = currentSceneId();
    const activeIndex = Math.max(0, scenes.findIndex((s) => s.id === activeId));

    // Visible index = which card the player is browsing right now (may
    // differ from activeIndex briefly while a swap is mid-flight).
    const [visibleIndex, setVisibleIndex] = useState(activeIndex);
    const [slideDir, setSlideDir] = useState(0); // -1 = slide left, +1 = slide right, 0 = no anim
    const [anim, setAnim] = useState(false);
    const animTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const containerRef = useRef<HTMLDivElement>(null);
    const touchRef = useRef({ x: 0, t: 0, active: false });

    useEffect(() => {
        const unsubStart = subscribeGameEvent('scene-swap-start', () => {
            swapInFlightRef.current = true;
        });
        const unsubEnd = subscribeGameEvent('scene-swap-end', () => {
            swapInFlightRef.current = false;
            const target = pendingTargetRef.current;
            pendingTargetRef.current = null;
            if (pendingDispatch(target, currentSceneId())) {
                skipNextActiveSync.current = true;
                switchScene(target as string);
            }
            force((n) => n + 1);
        });
        const unsubError = subscribeGameEvent('scene-swap-error', () => {
            swapInFlightRef.current = false;
            pendingTargetRef.current = null;
            force((n) => n + 1);
        });
        return () => { unsubStart?.(); unsubEnd?.(); unsubError?.(); };
    }, []);

    // Cleanup the debounce timer on unmount so no orphan swap fires.
    useEffect(() => () => clearTimeout(commitTimer.current), []);

    // Keep visibleIndex aligned when active scene changes externally
    // (URL param, programmatic). Skipped after a coalesced queued-swap
    // dispatch so the user's latest pick stays visible during the
    // chained second swap.
    useEffect(() => {
        if (skipNextActiveSync.current) {
            skipNextActiveSync.current = false;
            return;
        }
        setVisibleIndex(activeIndex);
    }, [activeIndex]);

    // Schedule a debounced commit. Called from every navigation gesture.
    const scheduleCommit = useCallback((targetId: string) => {
        clearTimeout(commitTimer.current);
        commitTimer.current = setTimeout(() => {
            // Cycle 46 Phase 1: while the zen attract field is up, the scene
            // def matches the picker's "current" id but nothing is built yet,
            // so a pick of the default scene must still commit (swapScene
            // builds it and leaves attract mode). The same-scene no-op only
            // applies once a real scene is on screen.
            const attractActive = typeof window !== 'undefined'
                && (window as AttractWindow).__sdsAttractActive === true;
            if (!shouldCommit(targetId, currentSceneId(), attractActive)) return;
            if (commitAction(swapInFlightRef.current) === 'queue') {
                // Latest-wins: don't fire a concurrent swap; queue and
                // let scene-swap-end pick it up.
                pendingTargetRef.current = targetId;
            } else {
                switchScene(targetId);
            }
        }, COMMIT_DEBOUNCE_MS);
    }, []);

    const flip = useCallback((delta: number) => {
        const next = flipIndex(visibleIndex, delta, scenes.length);
        if (next === visibleIndex) return;
        setSlideDir(delta > 0 ? 1 : -1);
        setAnim(true);
        setVisibleIndex(next);
        clearTimeout(animTimer.current);
        animTimer.current = setTimeout(() => setAnim(false), TRANSITION_MS);
        scheduleCommit(scenes[next].id);
    }, [visibleIndex, scenes, scheduleCommit]);

    // Keyboard: ←/→ flip (auto-load via debounced scheduleCommit).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!containerRef.current?.contains(document.activeElement) &&
                document.activeElement !== document.body) return;
            if (e.key === 'ArrowLeft') { e.preventDefault(); flip(-1); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); flip(1); }
        };
        // Only listen when picker is the focused area; avoid stealing
        // arrows globally. We attach to window but bail out unless the
        // active element is inside the picker (or no element is focused
        // — common on initial paint, where the user's arrow keys
        // should still flip the picker).
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [flip]);

    // Touch swipe support.
    const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
        const t = e.touches?.[0];
        if (!t) return;
        touchRef.current = { x: t.clientX, t: Date.now(), active: true };
    };
    const onTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
        if (!touchRef.current.active) return;
        touchRef.current.active = false;
        const t = e.changedTouches?.[0];
        if (!t) return;
        const dx = t.clientX - touchRef.current.x;
        const dt = Date.now() - touchRef.current.t;
        const dir = swipeDirection(dx, dt);
        if (dir !== 0) flip(dir);
    };

    const { isCompact, isVeryCompact } = useResponsive() as ResponsiveInfo;
    const compact = Boolean(isCompact || isVeryCompact);

    if (scenes.length <= 1) return null;

    const visibleScene = scenes[visibleIndex];
    const chrome = sceneChrome(visibleScene.id);
    const isVisibleActive = visibleScene.id === activeId;

    const cardHeight = compact ? '170px' : '210px';
    const titleSize = compact ? '1.15rem' : '1.5rem';
    const descSize = compact ? '0.78rem' : '0.88rem';

    const contentStyle: CSSProperties = {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        padding: compact ? '0.85rem 3rem 0.85rem 0.95rem' : '1rem 3.5rem 1rem 1.25rem',
        color: color.text,
        transform: anim ? `translateX(${slideDir > 0 ? -8 : 8}px)` : 'translateX(0)',
        opacity: anim ? 0 : 1,
        animation: anim
            ? `sds-slide-in-${slideDir > 0 ? 'right' : 'left'} ${TRANSITION_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards`
            : undefined,
    };

    return (
        <div ref={containerRef} style={containerStyle} tabIndex={-1}>
            <div style={headerStyle}>
                <span style={labelStyle}>Choose your home</span>
                <span style={counterStyle}>{visibleIndex + 1} / {scenes.length}</span>
            </div>

            <Card
                active={isVisibleActive}
                accent={isVisibleActive ? color.accent : chrome.accent}
                radius={compact ? '16px' : '20px'}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
                style={{ width: '100%', height: cardHeight }}
            >
                {/* Animated gradient layer (cross-fade between scenes). */}
                <div style={{ position: 'absolute', inset: 0, background: chrome.gradient, transition: `background ${TRANSITION_MS}ms ease` }} />
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.22) 100%)', pointerEvents: 'none' }} />

                {/* Slide content (title + desc + glyph). Animated on flip. */}
                <div style={contentStyle}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%', gap: '0.5rem' }}>
                        <div style={{ flex: '0 0 auto' }}>
                            <SceneGlyph scene={visibleScene.id} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
                            {chrome.badge && <Badge tone="danger">{chrome.badge}</Badge>}
                            {isVisibleActive && <Badge tone="accent">Current</Badge>}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: titleSize, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: '0.25rem', textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                            {visibleScene.name}
                        </div>
                        <div style={{ fontSize: descSize, lineHeight: 1.4, opacity: 0.92, textShadow: '0 1px 4px rgba(0,0,0,0.4)', maxWidth: '34ch' }}>
                            {visibleScene.description}
                        </div>
                    </div>
                </div>

                {/* Prev / next chevrons. */}
                <IconButton
                    aria-label="Previous scene"
                    size={compact ? 34 : 40}
                    onClick={(e) => { e.stopPropagation(); flip(-1); }}
                    style={chevronPos('left', compact)}
                >
                    <ChevronLeft size={compact ? 16 : 18} strokeWidth={2.4} />
                </IconButton>
                <IconButton
                    aria-label="Next scene"
                    size={compact ? 34 : 40}
                    onClick={(e) => { e.stopPropagation(); flip(1); }}
                    style={chevronPos('right', compact)}
                >
                    <ChevronRight size={compact ? 16 : 18} strokeWidth={2.4} />
                </IconButton>
            </Card>

            {/* Indicator dots. */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.6rem' }}>
                {scenes.map((s, i) => (
                    <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                            if (i === visibleIndex) return;
                            setSlideDir(i > visibleIndex ? 1 : -1);
                            setAnim(true);
                            setVisibleIndex(i);
                            clearTimeout(animTimer.current);
                            animTimer.current = setTimeout(() => setAnim(false), TRANSITION_MS);
                            scheduleCommit(s.id);
                        }}
                        aria-label={`Show ${s.name}`}
                        style={{
                            width: i === visibleIndex ? '20px' : '8px',
                            height: '8px',
                            borderRadius: radius.pill,
                            background: i === visibleIndex
                                ? (s.id === activeId ? color.accent : color.text)
                                : 'rgba(255,255,255,0.35)',
                            border: 'none',
                            padding: 0,
                            cursor: i === visibleIndex ? 'default' : 'pointer',
                            transition: `width ${duration.fast} ease, background ${duration.fast} ease`,
                        }}
                    />
                ))}
            </div>
        </div>
    );
}
