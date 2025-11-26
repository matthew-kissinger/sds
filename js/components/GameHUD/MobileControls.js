/**
 * MobileControls Component
 * Touch controls for mobile devices (joystick, sprint, zoom)
 */
const { createElement, useState, useEffect, useRef } = window.React;

export function MobileControls() {
    const [joystickManager, setJoystickManager] = useState(null);
    const [isSprinting, setIsSprinting] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(80);
    const [isZooming, setIsZooming] = useState(null);
    const joystickRef = useRef(null);
    const zoomIntervalRef = useRef(null);

    useEffect(() => {
        if (!window.gameInstance || !joystickRef.current || !window.nipplejs) return;

        // Create joystick
        const manager = window.nipplejs.create({
            zone: joystickRef.current,
            mode: 'static',
            position: { left: '75px', bottom: '75px' },
            color: 'white',
            size: 120,
            threshold: 0.1
        });

        // Handle joystick movement
        manager.on('move', (evt, data) => {
            if (window.gameInstance && window.gameInstance.inputHandler) {
                const angle = data.angle.radian;
                const force = Math.min(data.force, 1);

                // Convert to game coordinates (negate Z for correct up/down)
                const moveX = Math.cos(angle) * force;
                const moveZ = -Math.sin(angle) * force;

                // Update input handler
                window.gameInstance.inputHandler.keys = {
                    ...window.gameInstance.inputHandler.keys,
                    w: moveZ < -0.3,
                    s: moveZ > 0.3,
                    a: moveX < -0.3,
                    d: moveX > 0.3
                };
            }
        });

        manager.on('end', () => {
            if (window.gameInstance && window.gameInstance.inputHandler) {
                window.gameInstance.inputHandler.keys = {
                    ...window.gameInstance.inputHandler.keys,
                    w: false,
                    s: false,
                    a: false,
                    d: false
                };
            }
        });

        setJoystickManager(manager);

        return () => {
            manager.destroy();
        };
    }, []);

    // Cleanup zoom interval on unmount
    useEffect(() => {
        return () => {
            if (zoomIntervalRef.current) {
                clearInterval(zoomIntervalRef.current);
            }
        };
    }, []);

    const handleSprintStart = () => {
        setIsSprinting(true);
        if (window.gameInstance && window.gameInstance.inputHandler) {
            window.gameInstance.inputHandler.keys.shift = true;
        }
    };

    const handleSprintEnd = () => {
        setIsSprinting(false);
        if (window.gameInstance && window.gameInstance.inputHandler) {
            window.gameInstance.inputHandler.keys.shift = false;
        }
    };

    // Zoom control functions
    const startZoom = (direction) => {
        setIsZooming(direction);
        handleZoomChange(direction === 'in' ? -5 : 5);
        zoomIntervalRef.current = setInterval(() => {
            handleZoomChange(direction === 'in' ? -3 : 3);
        }, 50);
    };

    const stopZoom = () => {
        setIsZooming(null);
        if (zoomIntervalRef.current) {
            clearInterval(zoomIntervalRef.current);
            zoomIntervalRef.current = null;
        }
    };

    const handleZoomChange = (delta) => {
        setZoomLevel(prevZoom => {
            const newZoom = Math.max(20, Math.min(150, prevZoom + delta));
            if (window.gameInstance?.mobileControls?.onZoomChange) {
                window.gameInstance.mobileControls.onZoomChange(newZoom);
            }
            return newZoom;
        });
    };

    const zoomPercentage = ((150 - zoomLevel) / (150 - 20)) * 100;

    const zoomButtonStyle = (isActive, isIn) => ({
        width: '48px',
        height: '48px',
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
            ? `0 0 20px ${isIn ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 107, 107, 0.3)'}, inset 0 1px 0 0 rgba(255, 255, 255, 0.2)`
            : '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)',
        color: 'white',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: isActive ? 'scale(0.92)' : 'scale(1)',
        WebkitTapHighlightColor: 'transparent',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'manipulation'
    });

    return createElement('div', {
        className: 'fixed inset-0 pointer-events-none z-10'
    }, [
        // Joystick container
        createElement('div', {
            key: 'joystick',
            id: 'joystick-zone',
            ref: joystickRef,
            className: 'pointer-events-auto',
            style: {
                position: 'fixed',
                left: 'calc(env(safe-area-inset-left, 0px) + 20px)',
                bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
                width: '150px',
                height: '150px'
            }
        }),

        // Sprint button
        createElement('button', {
            key: 'sprint',
            className: `mobile-control ${isSprinting ? 'bg-blue-500 bg-opacity-30' : ''} fixed w-16 h-16 text-2xl pointer-events-auto ui-panel`,
            style: {
                bottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)',
                right: 'calc(env(safe-area-inset-right, 0px) + 1.5rem)'
            },
            onTouchStart: handleSprintStart,
            onTouchEnd: handleSprintEnd,
            onMouseDown: handleSprintStart,
            onMouseUp: handleSprintEnd,
            onMouseLeave: handleSprintEnd
        }, 'RUN'),

        // Zoom Control
        createElement('div', {
            key: 'zoom-control',
            className: 'fixed pointer-events-auto',
            style: {
                right: 'calc(env(safe-area-inset-right, 0px) + 1.5rem)',
                bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8rem)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.75rem',
                zIndex: 200
            }
        }, [
            // Zoom indicator bar
            createElement('div', {
                key: 'indicator',
                style: {
                    position: 'relative',
                    width: '6px',
                    height: '100px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '3px',
                    overflow: 'hidden',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.1), 0 2px 8px rgba(0, 0, 0, 0.1)'
                }
            }, [
                createElement('div', {
                    key: 'fill',
                    style: {
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: `${zoomPercentage}%`,
                        background: 'linear-gradient(180deg, rgba(0, 191, 255, 0.8) 0%, rgba(0, 150, 255, 0.6) 100%)',
                        transition: 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        borderRadius: '3px'
                    }
                }),
                // Notches
                [0, 25, 50, 75, 100].map(percent =>
                    createElement('div', {
                        key: percent,
                        style: {
                            position: 'absolute',
                            left: '-2px',
                            right: '-2px',
                            height: '1px',
                            bottom: `${percent}%`,
                            background: 'rgba(255, 255, 255, 0.3)'
                        }
                    })
                )
            ]),

            // Zoom in button
            createElement('button', {
                key: 'zoom-in',
                style: zoomButtonStyle(isZooming === 'in', true),
                onTouchStart: (e) => { e.preventDefault(); startZoom('in'); },
                onTouchEnd: (e) => { e.preventDefault(); stopZoom(); },
                onMouseDown: () => startZoom('in'),
                onMouseUp: stopZoom,
                onMouseLeave: stopZoom
            },
                createElement('svg', {
                    width: '20',
                    height: '20',
                    viewBox: '0 0 24 24',
                    fill: 'none',
                    style: { opacity: '0.9' }
                }, [
                    createElement('circle', {
                        key: 'circle',
                        cx: '12',
                        cy: '12',
                        r: '10',
                        stroke: 'currentColor',
                        strokeWidth: '2'
                    }),
                    createElement('path', {
                        key: 'plus',
                        d: 'M12 8v8M8 12h8',
                        stroke: 'currentColor',
                        strokeWidth: '2',
                        strokeLinecap: 'round'
                    })
                ])
            ),

            // Zoom out button
            createElement('button', {
                key: 'zoom-out',
                style: zoomButtonStyle(isZooming === 'out', false),
                onTouchStart: (e) => { e.preventDefault(); startZoom('out'); },
                onTouchEnd: (e) => { e.preventDefault(); stopZoom(); },
                onMouseDown: () => startZoom('out'),
                onMouseUp: stopZoom,
                onMouseLeave: stopZoom
            },
                createElement('svg', {
                    width: '20',
                    height: '20',
                    viewBox: '0 0 24 24',
                    fill: 'none',
                    style: { opacity: '0.9' }
                }, [
                    createElement('circle', {
                        key: 'circle',
                        cx: '12',
                        cy: '12',
                        r: '10',
                        stroke: 'currentColor',
                        strokeWidth: '2'
                    }),
                    createElement('path', {
                        key: 'minus',
                        d: 'M8 12h8',
                        stroke: 'currentColor',
                        strokeWidth: '2',
                        strokeLinecap: 'round'
                    })
                ])
            )
        ])
    ]);
}
