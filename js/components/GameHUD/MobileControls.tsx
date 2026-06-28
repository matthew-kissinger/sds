// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * MobileControls — touch joystick, sprint, and zoom controls for mobile.
 *
 * Cycle 51 P10: migrated from createElement .js to JSX .tsx and the joystick
 * rebuilt on native pointer events (was nipplejs ^0.10.2, an unmaintained dep -
 * now removed). One PointerEvent path covers iOS Safari, Android Chrome, and the
 * desktop mouse. The movement-vector contract is byte-identical to the nipplejs
 * version so the shared sim sees no change: angle = atan2(-dy, dx) (nipplejs's
 * math-angle convention), x = -cos(angle) * force, z = sin(angle) * force.
 *
 * Restyled onto the pastoral language: warm glass joystick + buttons, the shared
 * Icon sprint/zoom glyphs, a meadow zoom fill (was cool cyan/blue/green/red).
 * No silent fallback: a missing input bridge warns loudly (once) rather than
 * masking a wiring failure behind a no-op.
 */
import { useState, useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Z } from '../../ui/zIndex.js';
import { getMobileControls, getSceneManager } from '../../GameBridge.js';
import { useResponsive } from '../hooks/usePlatform.js';
import { useGameState } from '../hooks/useGameState.js';
import { Icon } from '../ui/Icon';
import { pastoral, alpha } from '../ui/tokens';

interface ZoomState {
    mode: string;
    distance: number;
    min: number;
    max: number;
}

// Read the active camera-mode zoom state from the controller. Falls back to the
// legacy 20-150 Classic range only during the very first paint, before the
// controller is wired (this is an init default, not a failure mask).
function readZoomState(): ZoomState {
    const cc = getSceneManager()?.cameraController;
    if (cc?.getZoomState) {
        try { return cc.getZoomState(); } catch { /* not ready yet */ }
    }
    return { mode: 'classic', distance: 80, min: 20, max: 150 };
}

export function MobileControls() {
    const [isSprinting, setIsSprinting] = useState(false);
    const [zoomState, setZoomState] = useState<ZoomState>(() => readZoomState());
    const [isZooming, setIsZooming] = useState<'in' | 'out' | null>(null);
    const [thumb, setThumb] = useState({ x: 0, y: 0 });
    const [dragging, setDragging] = useState(false);
    const gameData = useGameState();

    const baseRef = useRef<HTMLDivElement>(null);
    const activePointer = useRef<number | null>(null);
    const warnedNoBridge = useRef(false);
    const zoomIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const rafRef = useRef<number | null>(null);

    const { isLandscapeMobile } = useResponsive();

    // Responsive sizing (unchanged from the nipplejs version).
    const joystickSize = isLandscapeMobile ? 100 : 150;
    const sprintSize = isLandscapeMobile ? 48 : 64;
    const zoomBarSize = isLandscapeMobile ? 60 : 100;
    const zoomButtonSize = isLandscapeMobile ? 36 : 48;
    const iconSize = isLandscapeMobile ? 20 : 28;
    const zoomIconSize = isLandscapeMobile ? 16 : 20;
    const joystickRadius = joystickSize / 2;
    const barkReady = gameData.barkReady === true;
    const barkRatio = Math.max(0, Math.min(1, gameData.barkCooldownRatio || 0));
    const barkFillDegrees = Math.round((1 - barkRatio) * 360);
    const barkLabel = barkReady
        ? 'Bark ready'
        : `Bark ready in ${Math.max(0.1, (gameData.barkCooldownRemainingMs || 0) / 1000).toFixed(1)} seconds`;

    // --- Custom pointer-events joystick (replaces nipplejs) ---

    function driveMovement(dx: number, dy: number) {
        // dx, dy: thumb offset from the base centre in screen pixels (y down).
        const dist = Math.hypot(dx, dy);
        const force = joystickRadius > 0 ? Math.min(dist, joystickRadius) / joystickRadius : 0;
        const angle = Math.atan2(-dy, dx); // math angle (y up), nipplejs convention
        const mc = getMobileControls();
        if (!mc) {
            if (!warnedNoBridge.current) {
                // No fallback: surface the missing bridge loudly instead of a silent no-op.
                console.warn('[MobileControls] input bridge unavailable; joystick is not driving movement.');
                warnedNoBridge.current = true;
            }
            return;
        }
        // Game coordinates: +X = left, -X = right, +Z = forward, -Z = backward.
        mc.movementVector.x = -Math.cos(angle) * force;
        mc.movementVector.z = Math.sin(angle) * force;
        mc.isMoving = force > 0;
    }

    function applyPointer(clientX: number, clientY: number) {
        const base = baseRef.current;
        if (!base) return;
        const rect = base.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        let dx = clientX - cx;
        let dy = clientY - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > joystickRadius) {
            dx = (dx / dist) * joystickRadius;
            dy = (dy / dist) * joystickRadius;
        }
        setThumb({ x: dx, y: dy });
        driveMovement(dx, dy);
    }

    function startDrag(e: ReactPointerEvent<HTMLDivElement>) {
        if (activePointer.current !== null) return;
        activePointer.current = e.pointerId;
        setDragging(true);
        applyPointer(e.clientX, e.clientY);
    }

    function resetJoystick() {
        activePointer.current = null;
        setDragging(false);
        setThumb({ x: 0, y: 0 });
        const mc = getMobileControls();
        if (mc) {
            mc.movementVector.x = 0;
            mc.movementVector.z = 0;
            mc.isMoving = false;
        }
    }

    // While dragging, listen on the window so the joystick keeps tracking when the
    // pointer leaves the base, and ALWAYS resets on release. Robust across the
    // pointer-capture quirks a zone-only pointerup can miss; movement never sticks.
    useEffect(() => {
        if (!dragging) return;
        const onMove = (e: PointerEvent) => { if (e.pointerId === activePointer.current) applyPointer(e.clientX, e.clientY); };
        const onUp = (e: PointerEvent) => { if (e.pointerId === activePointer.current) resetJoystick(); };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };
        // Handlers read live refs; only the dragging toggle gates them.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dragging]);

    // --- Zoom controls (logic unchanged; restyled) ---

    useEffect(() => () => {
        if (zoomIntervalRef.current) clearInterval(zoomIntervalRef.current);
    }, []);

    // Poll camera state at rAF so the bar tracks mode changes + sprint dolly.
    useEffect(() => {
        let last = '';
        const tick = () => {
            const s = readZoomState();
            const key = `${s.mode}:${s.distance.toFixed(2)}:${s.min}:${s.max}`;
            if (key !== last) { last = key; setZoomState(s); }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, []);

    const handleSprintStart = () => {
        setIsSprinting(true);
        const mc = getMobileControls();
        if (mc) mc.isSprinting = true;
    };
    const handleSprintEnd = () => {
        setIsSprinting(false);
        const mc = getMobileControls();
        if (mc) mc.isSprinting = false;
    };

    const handleZoomChange = (delta: number) => {
        const cur = readZoomState();
        const newZoom = Math.max(cur.min, Math.min(cur.max, cur.distance + delta));
        const mc = getMobileControls();
        if (mc?.onZoomChange) mc.onZoomChange(newZoom);
        setZoomState({ ...cur, distance: newZoom });
    };

    const startZoom = (direction: 'in' | 'out') => {
        setIsZooming(direction);
        const cur = readZoomState();
        const range = cur.max - cur.min;
        const initialStep = Math.max(2, range * 0.04);
        const continuousStep = Math.max(1, range * 0.025);
        handleZoomChange(direction === 'in' ? -initialStep : initialStep);
        zoomIntervalRef.current = setInterval(() => {
            handleZoomChange(direction === 'in' ? -continuousStep : continuousStep);
        }, 50);
    };
    const stopZoom = () => {
        setIsZooming(null);
        if (zoomIntervalRef.current) {
            clearInterval(zoomIntervalRef.current);
            zoomIntervalRef.current = null;
        }
    };

    // Bar fills 0% (max distance, zoomed out) -> 100% (min distance, zoomed in).
    const range = Math.max(1, zoomState.max - zoomState.min);
    const zoomPercentage = Math.max(0, Math.min(100, ((zoomState.max - zoomState.distance) / range) * 100));

    const zoomButtonStyle = (isActive: boolean): CSSProperties => ({
        width: `${zoomButtonSize}px`,
        height: `${zoomButtonSize}px`,
        borderRadius: '50%',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isActive ? alpha(pastoral.accentMeadow, 22) : alpha(pastoral.cream, 8),
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: isActive ? alpha(pastoral.accentMeadow, 45) : pastoral.glassWarmBorder,
        boxShadow: isActive ? `0 0 20px ${alpha(pastoral.accentMeadow, 35)}` : '0 4px 16px rgba(43,38,32,0.14)',
        color: pastoral.cream,
        transition: 'all 0.2s ease',
        transform: isActive ? 'scale(0.92)' : 'scale(1)',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
    });

    return (
        <div className="fixed inset-0 pointer-events-none z-10">
            {/* Joystick - native pointer events (was nipplejs) */}
            <div
                ref={baseRef}
                id="joystick-zone"
                className="pointer-events-auto"
                onPointerDown={startDrag}
                style={{
                    position: 'fixed',
                    left: `calc(env(safe-area-inset-left, 0px) + ${isLandscapeMobile ? '12px' : '20px'})`,
                    bottom: `calc(env(safe-area-inset-bottom, 0px) + ${isLandscapeMobile ? '8px' : '20px'})`,
                    width: `${joystickSize}px`,
                    height: `${joystickSize}px`,
                    borderRadius: '50%',
                    background: alpha(pastoral.cream, 8),
                    border: `1px solid ${pastoral.glassWarmBorder}`,
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    display: 'grid',
                    placeItems: 'center',
                    touchAction: 'none',
                    WebkitTapHighlightColor: 'transparent',
                }}
            >
                <div
                    style={{
                        width: `${joystickSize * 0.46}px`,
                        height: `${joystickSize * 0.46}px`,
                        borderRadius: '50%',
                        background: alpha(pastoral.cream, 24),
                        border: `1px solid ${pastoral.glassWarmBorder}`,
                        boxShadow: '0 2px 8px rgba(43,38,32,0.2)',
                        transform: `translate(${thumb.x}px, ${thumb.y}px)`,
                        transition: dragging ? 'none' : 'transform 0.15s ease-out',
                        pointerEvents: 'none',
                    }}
                />
            </div>

            {/* Sprint button */}
            <button
                className="mobile-control fixed pointer-events-auto"
                style={{
                    width: `${sprintSize}px`,
                    height: `${sprintSize}px`,
                    bottom: `calc(env(safe-area-inset-bottom, 0px) + ${isLandscapeMobile ? '8px' : '2rem'})`,
                    right: `calc(env(safe-area-inset-right, 0px) + ${isLandscapeMobile ? '1rem' : '1.5rem'})`,
                    background: isSprinting ? alpha(pastoral.accentMeadow, 30) : alpha(pastoral.cream, 8),
                    border: isSprinting ? `2px solid ${alpha(pastoral.accentMeadow, 60)}` : `1px solid ${pastoral.glassWarmBorder}`,
                    boxShadow: isSprinting ? `0 0 20px ${alpha(pastoral.accentMeadow, 40)}` : '0 4px 16px rgba(43,38,32,0.14)',
                    transform: isSprinting ? 'scale(0.95)' : 'scale(1)',
                    transition: 'all 0.15s ease-out',
                }}
                onTouchStart={handleSprintStart}
                onTouchEnd={handleSprintEnd}
                onMouseDown={handleSprintStart}
                onMouseUp={handleSprintEnd}
                onMouseLeave={handleSprintEnd}
                aria-label="Sprint"
            >
                <Icon name="sprint" size={iconSize} color={isSprinting ? pastoral.accentMeadow : alpha(pastoral.cream, 90)} />
            </button>

            {/* Cycle 61 P3: bark button - one-shot. Left of sprint so the right
                thumb reaches both. Dispatches 'sds-bark'; InputHandler queues it. */}
            <button
                className="mobile-control fixed pointer-events-auto"
                style={{
                    width: `${sprintSize}px`,
                    height: `${sprintSize}px`,
                    bottom: `calc(env(safe-area-inset-bottom, 0px) + ${isLandscapeMobile ? '8px' : '2rem'})`,
                    right: `calc(env(safe-area-inset-right, 0px) + ${isLandscapeMobile ? '1rem' : '1.5rem'} + ${sprintSize}px + ${isLandscapeMobile ? '0.75rem' : '1rem'})`,
                    background: barkReady
                        ? alpha(pastoral.accentGold, 24)
                        : `conic-gradient(${pastoral.accentGold} ${barkFillDegrees}deg, ${alpha(pastoral.cream, 10)} ${barkFillDegrees}deg)`,
                    border: barkReady ? `2px solid ${alpha(pastoral.accentGold, 62)}` : `1px solid ${pastoral.glassWarmBorder}`,
                    boxShadow: barkReady ? `0 0 20px ${alpha(pastoral.accentGold, 32)}` : '0 4px 16px rgba(43,38,32,0.14)',
                    transition: 'all 0.15s ease-out',
                }}
                onPointerDown={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('sds-bark')); }}
                aria-label={barkLabel}
            >
                <Icon name="sound" size={iconSize} color={barkReady ? pastoral.accentGold : alpha(pastoral.cream, 90)} />
            </button>

            {/* Zoom controls - always vertical */}
            <div
                className="fixed pointer-events-auto"
                style={isLandscapeMobile ? {
                    right: 'calc(env(safe-area-inset-right, 0px) + 1rem)',
                    top: 'calc(env(safe-area-inset-top, 0px) + 50px)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', zIndex: Z.controls,
                } : {
                    right: 'calc(env(safe-area-inset-right, 0px) + 1.5rem)',
                    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8rem)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', zIndex: Z.controls,
                }}
            >
                <button
                    style={zoomButtonStyle(isZooming === 'in')}
                    onTouchStart={(e) => { e.preventDefault(); startZoom('in'); }}
                    onTouchEnd={(e) => { e.preventDefault(); stopZoom(); }}
                    onMouseDown={() => startZoom('in')}
                    onMouseUp={stopZoom}
                    onMouseLeave={stopZoom}
                    aria-label="Zoom in"
                >
                    <Icon name="zoomIn" size={zoomIconSize} color={pastoral.cream} />
                </button>

                <div style={{
                    position: 'relative',
                    width: '6px',
                    height: `${zoomBarSize}px`,
                    background: alpha(pastoral.cream, 12),
                    borderRadius: '3px',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        height: `${zoomPercentage}%`,
                        background: `linear-gradient(180deg, ${alpha(pastoral.accentMeadow, 90)}, ${alpha(pastoral.accentMeadow, 55)})`,
                        transition: 'height 0.3s ease',
                        borderRadius: '3px',
                    }} />
                </div>

                <button
                    style={zoomButtonStyle(isZooming === 'out')}
                    onTouchStart={(e) => { e.preventDefault(); startZoom('out'); }}
                    onTouchEnd={(e) => { e.preventDefault(); stopZoom(); }}
                    onMouseDown={() => startZoom('out')}
                    onMouseUp={stopZoom}
                    onMouseLeave={stopZoom}
                    aria-label="Zoom out"
                >
                    <Icon name="zoomOut" size={zoomIconSize} color={pastoral.cream} />
                </button>
            </div>
        </div>
    );
}
