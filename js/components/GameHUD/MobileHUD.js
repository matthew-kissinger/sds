/**
 * MobileHUD Component
 * Compact status bar for mobile devices
 * Shows sheep count, timer, stamina bar, and pause button
 */
import React, { createElement } from 'react';
import { useResponsive } from '../hooks/usePlatform.js';

// Pause icon
const PauseIcon = ({ size = 16, color = 'currentColor' }) => createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: color,
    stroke: 'none'
}, [
    createElement('rect', { key: 'left', x: '6', y: '4', width: '4', height: '16', rx: '1' }),
    createElement('rect', { key: 'right', x: '14', y: '4', width: '4', height: '16', rx: '1' })
]);

// Sheep icon
const SheepIcon = ({ size = 16, color = 'currentColor' }) => createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: color,
    stroke: 'none'
}, [
    createElement('ellipse', { key: 'body', cx: '12', cy: '14', rx: '8', ry: '5' }),
    createElement('circle', { key: 'head', cx: '18', cy: '12', r: '3' }),
    createElement('rect', { key: 'leg1', x: '7', y: '17', width: '2', height: '4', rx: '1' }),
    createElement('rect', { key: 'leg2', x: '11', y: '17', width: '2', height: '4', rx: '1' }),
    createElement('rect', { key: 'leg3', x: '15', y: '17', width: '2', height: '4', rx: '1' })
]);

// Clock icon
const ClockIcon = ({ size = 16, color = 'currentColor' }) => createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
}, [
    createElement('circle', { key: 'face', cx: '12', cy: '12', r: '10' }),
    createElement('polyline', { key: 'hands', points: '12 6 12 12 16 14' })
]);

// Stamina color based on percentage
function getStaminaColor(stamina) {
    if (stamina >= 60) return 'linear-gradient(90deg, #10b981, #34d399)';
    if (stamina >= 30) return 'linear-gradient(90deg, #f59e0b, #fbbf24)';
    return 'linear-gradient(90deg, #ef4444, #f87171)';
}

export function MobileHUD({ gameData, stamina, onPause }) {
    const { isLandscapeMobile } = useResponsive();

    const minutes = Math.floor(gameData.gameTime / 60);
    const seconds = Math.floor(gameData.gameTime % 60);

    // Responsive sizing
    const iconSize = isLandscapeMobile ? 12 : 16;
    const fontSize = isLandscapeMobile ? '0.75rem' : '0.875rem';
    const gap = isLandscapeMobile ? '0.5rem' : '1rem';
    const padding = isLandscapeMobile ? '0.25rem 0.5rem' : '0.5rem';
    const staminaHeight = isLandscapeMobile ? '3px' : '4px';

    // Position: centered at top for both landscape and portrait
    const containerStyle = isLandscapeMobile ? {
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        top: 'max(env(safe-area-inset-top, 4px), 4px)',
        zIndex: 20,
        animation: 'slideDown 0.5s ease-out'
    } : {
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        top: 'max(env(safe-area-inset-top, 8px), 8px)',
        zIndex: 20,
        animation: 'slideDown 0.5s ease-out'
    };

    const panelStyle = {
        display: 'flex',
        alignItems: 'center',
        gap: isLandscapeMobile ? '0.5rem' : '0.75rem',
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        padding
    };

    // Pause button style
    const pauseButtonStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: isLandscapeMobile ? '24px' : '32px',
        height: isLandscapeMobile ? '24px' : '32px',
        background: 'rgba(255, 255, 255, 0.15)',
        border: '1px solid rgba(255, 255, 255, 0.25)',
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        WebkitTapHighlightColor: 'transparent',
        pointerEvents: 'auto'
    };

    return createElement('div', { style: containerStyle },
        createElement('div', { style: panelStyle }, [
            // Pause button
            createElement('button', {
                key: 'pause',
                style: pauseButtonStyle,
                onClick: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onPause?.();
                },
                onTouchStart: (e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                    e.currentTarget.style.transform = 'scale(0.95)';
                },
                onTouchEnd: (e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                    e.currentTarget.style.transform = 'scale(1)';
                },
                'aria-label': 'Pause game'
            }, createElement(PauseIcon, { size: isLandscapeMobile ? 12 : 16, color: 'rgba(255, 255, 255, 0.9)' })),

            // Stats section
            createElement('div', { key: 'stats-section' }, [
                // Stats row
                createElement('div', {
                    key: 'stats',
                    style: { display: 'flex', alignItems: 'center', gap }
                }, [
                    // Sheep count
                    createElement('div', {
                        key: 'sheep',
                        style: { display: 'flex', alignItems: 'center', gap: '0.25rem' }
                    }, [
                        createElement(SheepIcon, { key: 'icon', size: iconSize, color: 'rgba(255, 255, 255, 0.8)' }),
                        createElement('span', {
                            key: 'count',
                            style: { color: 'white', fontSize }
                        }, `${gameData.sheepCount}/${gameData.totalSheep}`)
                    ]),
                    // Timer
                    createElement('div', {
                        key: 'timer',
                        style: { display: 'flex', alignItems: 'center', gap: '0.25rem' }
                    }, [
                        createElement(ClockIcon, { key: 'icon', size: iconSize - 2, color: 'rgba(255, 255, 255, 0.8)' }),
                        createElement('span', {
                            key: 'time',
                            style: { color: 'white', fontFamily: 'monospace', fontSize }
                        }, `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`)
                    ])
                ]),
                // Stamina bar
                createElement('div', {
                    key: 'stamina',
                    style: {
                        marginTop: isLandscapeMobile ? '0.125rem' : '0.25rem',
                        height: staminaHeight,
                        borderRadius: '9999px',
                        overflow: 'hidden',
                        background: 'rgba(55, 65, 81, 0.5)',
                        minWidth: isLandscapeMobile ? '100px' : '120px'
                    }
                },
                    createElement('div', {
                        style: {
                            height: '100%',
                            width: `${stamina}%`,
                            background: getStaminaColor(stamina),
                            boxShadow: stamina < 30 ? '0 0 6px rgba(239, 68, 68, 0.5)' : 'none',
                            transition: 'all 0.3s ease-out',
                            borderRadius: '9999px'
                        }
                    })
                )
            ])
        ])
    );
}
