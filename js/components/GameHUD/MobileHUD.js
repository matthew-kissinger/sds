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

// Sheep icon from game-icons.net (Delapouite, CC BY 3.0)
const SheepIcon = ({ size = 16, color = 'currentColor' }) => createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 512 512',
    fill: color,
    stroke: 'none'
}, createElement('path', {
    d: 'M392.8 107.5c9.3 5.3 25.8 9.3 40 9.2 7.7-.1 14.6-1.2 19.5-3.2 5-1.8 6.9-4.9 8.9-8.8-9.2-6.08-22.1-12.27-31.8-12.87-14.9.53-28.8 8.13-36.6 15.67zm-253 20.2c-1.7 5.5-7.9 8.1-13 5.4-26.5-14.5-50.46-6.9-67.71 8.7-35.93 32.6-45.13 87.3-32.47 145.7 7.31 33.6 18.99 53 41.29 62.8 0 .1.1.1.15.1 2.22 1 4.21 1.9 6.09 2.8l4.61-22c1.02-4.9 5.8-8 10.66-7s7.98 5.8 6.96 10.7l-23.5 112c4.79 7.2 16.4 1.2 21.3-1.2l38.12-106.5c10.8-9.4 21.2-19 28.7-29.2 6.6-9.1 10.4-18.4 10.6-23.5.2-5 4.4-8.9 9.4-8.7 5 .2 9 4.6 8.6 9.6-.6 11.2-6.2 22.4-14 33.2-7.3 10-16.7 19.6-27.2 27.2l-3.3 8.9c6.9 8.7 13.4 13.8 19.6 16.8 8.8 4.1 17.7 4.6 28.5 3.3 16.4-1.9 34.6-12.9 43.5-37.2 2.8-7.7 13.6-8 16.8-.5 7.7 21.2 36.1 32.6 55.1 24l-3.9-23.3c-.8-4.9 2.5-9.6 7.4-10.4 4.9-.9 9.6 2.5 10.4 7.4l17.6 105.9c9.2 6.3 14.5 2.4 19.9-4.4l-13.8-114.4c-.7-5.3 3.3-10 8.6-10.2 4.8-.2 8.8 3.3 9.3 8l4.3 35.7c5.1-1.2 9.1-2.5 12.4-5 4.3-3.2 8.5-8.7 12.1-21.5 1.7-6 9-8.5 14.1-4.7 13.6 8.3 27.4-1.8 35.6-12.2 12.9-16.5 14.7-42.4 13.2-69.2-2.1.3-4.2.5-6.3.6-8.8.5-17.9-.9-25.7-4.4-12.4-7-22-18.4-28.2-28.9-3.9-6.8-7.3-13.7-10.5-20-5.4 9.9-11 23.1-19.2 25-12.5 2.1-23.9-3.7-29.8-12.7-5.9-8.9-7.4-20.2-4.8-31.1 2.7-11.7 9.8-38.3 22.6-56.1 2.2-2.9 4.5-5.3 6.8-7.4-7.5-3.1-16.2-3.8-22.9-3.8-5.8 0-13.5 1.8-19.7 5-6.2 3.3-10.7 7.8-12.2 11.8-3.2 8.5-15.5 7.5-17.3-1.3-3.8-22.78-53.9-17.8-65.6 2-3.8 7-14.1 5.9-16.5-1.7-8.1-22.61-62.7-21.3-66.7 5.9zm345-1.5c1.7 16.4 3.5 32.2 4.2 45.6 1.8 6.5 6 18.9 8.7 7.3.9-4.1.8-11-.4-18.6-.1-7.1-14.5-47.3-12.5-34.3zm-112.7-2.5c-11.9 15-19.2 37.4-23.3 53.7-.6 5.8-.6 12.6 2.3 17.1 2.3 3.4 4.8 5.2 9.4 5 5.8-9.4 12.1-19.8 15.6-28.2-1.2-7.9-2.8-19.9-3.6-31.4-.4-5.8-.6-11.2-.4-16.2zm94.4 2.4c-2.4 1.6-4.8 3.1-7.5 4.1-7.8 3.2-16.8 4.4-26 4.5-14.8.1-30.2-2.7-42.9-8.4 0 3.6.1 7.7.4 12.3.9 12.6 3 27.2 4 33.5 10.5 16.6 19.9 44.4 36.8 52.5 5.8 2 11.9 3.1 17.2 2.9 6-.4 10.6-2.6 11.5-3.7 3.5-8 5.9-15.2 7.3-22.3 2.1-10.9 3.4-23.3 3.6-31.6.3-6.4-.6-13.3-1.1-18.7-1.4 4.1-5.7 6.6-10 5.9-4.3-.7-7.5-4.4-7.5-8.8 0-5.1 4.2-9.2 9.3-9 3 0 5.8 1.7 7.4 4.3-.9-6.1-1.4-12-2.5-17.5zm-58.3 16.5c4.9.2 8.7 4.2 8.7 9 0 5-4 9-9 9-4.9 0-9-4-9-9s4.2-9.1 9.3-9zm47.5 48.3c3.7-.1 6.5 1.9 6.5 6.2 0 7.8-5.8 15-12.7 19l-1-23.1c2.5-1.4 5-2.1 7.2-2.1zm-24.1 2c1.8-.1 3.9.4 5.8 1.3l3.8 22.5c-6-3.7-15.4-3.6-16.5-16.1-.5-5.2 2.8-7.7 6.9-7.7zm-30.9 164.2c-3.7 5.1-7.6 9.1-12.6 12.1l16.6 62c7.6 1.5 15.9 1 19.2-5.1zm-241.2 33.7 1.5 46.8c7.9 7.9 12.9 4.8 19.7-3l-3.7-39.5c-6.3-.9-12.6-2.2-17.5-4.3z'
}));

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
                            // Cycle 7 fix: width transition removed so the
                            // bar tracks stamina instantly instead of
                            // lagging 300ms behind the percentage text.
                            transition: 'background 0.3s ease-out, box-shadow 0.3s ease-out',
                            borderRadius: '9999px'
                        }
                    })
                )
            ])
        ])
    );
}
