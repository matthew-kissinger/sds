/**
 * MobileControls Component
 * Touch controls for mobile - joystick, sprint button, zoom controls
 * Landscape-aware positioning
 */
import React, { createElement, useState, useEffect, useRef } from 'react';
import nipplejs from 'nipplejs';
import { getMobileControls, getSceneManager } from '../../GameBridge.js';
import { useResponsive } from '../hooks/usePlatform.js';

// Sprint icon
const SprintIcon = ({ size = 24, color = 'currentColor' }) => createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: '2.5',
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
}, createElement('polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' }));

// Read the active camera-mode zoom state from the controller. Falls back
// to the legacy 20-150 Classic range if the controller isn't ready yet
// (e.g. during initial paint).
function readZoomState() {
    const cc = getSceneManager()?.cameraController;
    if (cc?.getZoomState) {
        try { return cc.getZoomState(); } catch { /* ignore */ }
    }
    return { mode: 'classic', distance: 80, min: 20, max: 150 };
}

export function MobileControls() {
    const [joystickManager, setJoystickManager] = useState(null);
    const [isSprinting, setIsSprinting] = useState(false);
    // Cycle 25 v2.0.1 hotfix-2: zoomLevel is derived from
    // cameraController per-frame so the on-screen bar tracks the active
    // mode's range (Classic 20-150, Follow 6-45, Free 10-70 desktop —
    // mobile floors are higher). Polled at rAF; cheap.
    const [zoomState, setZoomState] = useState(() => readZoomState());
    const [isZooming, setIsZooming] = useState(null);
    const joystickRef = useRef(null);
    const zoomIntervalRef = useRef(null);
    const rafRef = useRef(null);

    const { isLandscapeMobile } = useResponsive();

    // Responsive sizing
    const joystickSize = isLandscapeMobile ? 100 : 150;
    const sprintSize = isLandscapeMobile ? 48 : 64;
    const zoomBarSize = isLandscapeMobile ? 60 : 100;
    const zoomButtonSize = isLandscapeMobile ? 36 : 48;
    const iconSize = isLandscapeMobile ? 20 : 28;

    // Initialize joystick
    useEffect(() => {
        if (!joystickRef.current) return;

        const manager = nipplejs.create({
            zone: joystickRef.current,
            mode: 'static',
            position: { left: '75px', bottom: '75px' },
            color: 'white',
            size: joystickSize,
            threshold: 0.1
        });

        manager.on('move', (evt, data) => {
            const mobileControls = getMobileControls();
            if (mobileControls) {
                const angle = data.angle.radian;
                const force = Math.min(data.force, 1);
                // Update the bridge's movement vector (used by InputHandler.getMovementDirection)
                // Game coordinates: +X = left, -X = right, +Z = forward, -Z = backward
                mobileControls.movementVector.x = -Math.cos(angle) * force;
                mobileControls.movementVector.z = Math.sin(angle) * force;
                mobileControls.isMoving = true;
            }
        });

        manager.on('end', () => {
            const mobileControls = getMobileControls();
            if (mobileControls) {
                mobileControls.movementVector.x = 0;
                mobileControls.movementVector.z = 0;
                mobileControls.isMoving = false;
            }
        });

        setJoystickManager(manager);
        return () => manager.destroy();
    }, [joystickSize]);

    // Cleanup zoom interval
    useEffect(() => {
        return () => {
            if (zoomIntervalRef.current) clearInterval(zoomIntervalRef.current);
        };
    }, []);

    // Poll camera state at requestAnimationFrame so the bar tracks
    // mode changes + sprint dolly + external setZoom calls.
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
        const mobileControls = getMobileControls();
        if (mobileControls) mobileControls.isSprinting = true;
    };

    const handleSprintEnd = () => {
        setIsSprinting(false);
        const mobileControls = getMobileControls();
        if (mobileControls) mobileControls.isSprinting = false;
    };

    const handleZoomChange = (delta) => {
        const cur = readZoomState();
        const newZoom = Math.max(cur.min, Math.min(cur.max, cur.distance + delta));
        const mobileControls = getMobileControls();
        if (mobileControls?.onZoomChange) mobileControls.onZoomChange(newZoom);
        // Optimistically update local state so the bar fills before the
        // next rAF poll.
        setZoomState({ ...cur, distance: newZoom });
    };

    const startZoom = (direction) => {
        setIsZooming(direction);
        // Step size scales with the active range so Follow's tight 6-45
        // band steps in finer increments than Classic's 20-150.
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

    // Bar fills 0% (max distance, fully zoomed out) → 100% (min distance,
    // fully zoomed in). Range comes from the active camera mode.
    const range = Math.max(1, zoomState.max - zoomState.min);
    const zoomPercentage = Math.max(0, Math.min(100,
        ((zoomState.max - zoomState.distance) / range) * 100,
    ));

    // Zoom button style generator
    const zoomButtonStyle = (isActive, isIn) => ({
        width: `${zoomButtonSize}px`,
        height: `${zoomButtonSize}px`,
        borderRadius: '50%',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isActive
            ? (isIn ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 107, 107, 0.2)')
            : 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: isActive
            ? (isIn ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 107, 107, 0.4)')
            : 'rgba(255, 255, 255, 0.15)',
        boxShadow: isActive
            ? `0 0 20px ${isIn ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 107, 107, 0.3)'}`
            : '0 4px 16px rgba(0, 0, 0, 0.1)',
        color: 'white',
        transition: 'all 0.2s ease',
        transform: isActive ? 'scale(0.92)' : 'scale(1)',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation'
    });

    // Zoom icon size
    const zoomIconSize = isLandscapeMobile ? 16 : 20;

    return createElement('div', { className: 'fixed inset-0 pointer-events-none z-10' }, [
        // Joystick zone
        createElement('div', {
            key: 'joystick',
            id: 'joystick-zone',
            ref: joystickRef,
            className: 'pointer-events-auto',
            style: {
                position: 'fixed',
                left: `calc(env(safe-area-inset-left, 0px) + ${isLandscapeMobile ? '12px' : '20px'})`,
                bottom: `calc(env(safe-area-inset-bottom, 0px) + ${isLandscapeMobile ? '8px' : '20px'})`,
                width: `${joystickSize}px`,
                height: `${joystickSize}px`
            }
        }),

        // Sprint button
        createElement('button', {
            key: 'sprint',
            className: 'mobile-control fixed pointer-events-auto',
            style: {
                width: `${sprintSize}px`,
                height: `${sprintSize}px`,
                bottom: `calc(env(safe-area-inset-bottom, 0px) + ${isLandscapeMobile ? '8px' : '2rem'})`,
                right: `calc(env(safe-area-inset-right, 0px) + ${isLandscapeMobile ? '1rem' : '1.5rem'})`,
                background: isSprinting ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.08)',
                border: isSprinting ? '2px solid rgba(59, 130, 246, 0.6)' : '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: isSprinting ? '0 0 20px rgba(59, 130, 246, 0.4)' : '0 4px 16px rgba(0, 0, 0, 0.1)',
                transform: isSprinting ? 'scale(0.95)' : 'scale(1)',
                transition: 'all 0.15s ease-out'
            },
            onTouchStart: handleSprintStart,
            onTouchEnd: handleSprintEnd,
            onMouseDown: handleSprintStart,
            onMouseUp: handleSprintEnd,
            onMouseLeave: handleSprintEnd
        }, createElement(SprintIcon, { size: iconSize, color: isSprinting ? '#60a5fa' : 'rgba(255, 255, 255, 0.9)' })),

        // Zoom controls - always vertical
        createElement('div', {
            key: 'zoom',
            className: 'fixed pointer-events-auto',
            style: isLandscapeMobile ? {
                right: 'calc(env(safe-area-inset-right, 0px) + 1rem)',
                top: 'calc(env(safe-area-inset-top, 0px) + 50px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.5rem',
                zIndex: 200
            } : {
                right: 'calc(env(safe-area-inset-right, 0px) + 1.5rem)',
                bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8rem)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.75rem',
                zIndex: 200
            }
        }, [
            // Zoom in (top - brings camera closer)
            createElement('button', {
                key: 'in',
                style: zoomButtonStyle(isZooming === 'in', true),
                onTouchStart: (e) => { e.preventDefault(); startZoom('in'); },
                onTouchEnd: (e) => { e.preventDefault(); stopZoom(); },
                onMouseDown: () => startZoom('in'),
                onMouseUp: stopZoom,
                onMouseLeave: stopZoom
            }, createElement('svg', { width: zoomIconSize, height: zoomIconSize, viewBox: '0 0 24 24', fill: 'none' }, [
                createElement('circle', { key: 'c', cx: '12', cy: '12', r: '10', stroke: 'currentColor', strokeWidth: '2' }),
                createElement('path', { key: 'p', d: 'M12 8v8M8 12h8', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round' })
            ])),

            // Zoom bar (always vertical)
            createElement('div', {
                key: 'bar',
                style: {
                    position: 'relative',
                    width: '6px',
                    height: `${zoomBarSize}px`,
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '3px',
                    overflow: 'hidden'
                }
            }, createElement('div', {
                style: {
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: `${zoomPercentage}%`,
                    background: 'linear-gradient(180deg, rgba(0, 191, 255, 0.8), rgba(0, 150, 255, 0.6))',
                    transition: 'height 0.3s ease',
                    borderRadius: '3px'
                }
            })),

            // Zoom out (bottom - moves camera away)
            createElement('button', {
                key: 'out',
                style: zoomButtonStyle(isZooming === 'out', false),
                onTouchStart: (e) => { e.preventDefault(); startZoom('out'); },
                onTouchEnd: (e) => { e.preventDefault(); stopZoom(); },
                onMouseDown: () => startZoom('out'),
                onMouseUp: stopZoom,
                onMouseLeave: stopZoom
            }, createElement('svg', { width: zoomIconSize, height: zoomIconSize, viewBox: '0 0 24 24', fill: 'none' }, [
                createElement('circle', { key: 'c', cx: '12', cy: '12', r: '10', stroke: 'currentColor', strokeWidth: '2' }),
                createElement('path', { key: 'p', d: 'M8 12h8', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round' })
            ]))
        ])
    ]);
}
