/**
 * PauseMenu Component
 * Full-featured pause screen with resume, restart, settings, and menu options
 * Works on both desktop and mobile with responsive design
 */
import React, { createElement, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../hooks/usePlatform.js';
import {
    getDefaultSettings,
    loadSettings,
    saveSettings,
    applySettingsToGame,
    applyPerformancePreset,
    PERFORMANCE_PRESETS
} from '../shared/settings.js';

// Icon components
const PlayIcon = ({ size = 24 }) => createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'currentColor',
    stroke: 'none'
}, createElement('polygon', { points: '5 3 19 12 5 21 5 3' }));

const RestartIcon = ({ size = 24 }) => createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
}, [
    createElement('path', { key: 'arrow', d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }),
    createElement('path', { key: 'head', d: 'M3 3v5h5' })
]);

const HomeIcon = ({ size = 24 }) => createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
}, [
    createElement('path', { key: 'roof', d: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }),
    createElement('polyline', { key: 'door', points: '9 22 9 12 15 12 15 22' })
]);

const SettingsIcon = ({ size = 24 }) => createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
}, [
    createElement('circle', { key: 'c', cx: '12', cy: '12', r: '3' }),
    createElement('path', { key: 'p', d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z' })
]);

const BackIcon = ({ size = 24 }) => createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
}, [
    createElement('path', { key: 'l', d: 'M19 12H5' }),
    createElement('path', { key: 'a', d: 'M12 19l-7-7 7-7' })
]);

const FullscreenIcon = ({ size = 24, isFullscreen = false }) => createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
}, isFullscreen ? [
    // Exit fullscreen icon
    createElement('path', { key: '1', d: 'M8 3v3a2 2 0 0 1-2 2H3' }),
    createElement('path', { key: '2', d: 'M21 8h-3a2 2 0 0 1-2-2V3' }),
    createElement('path', { key: '3', d: 'M3 16h3a2 2 0 0 1 2 2v3' }),
    createElement('path', { key: '4', d: 'M16 21v-3a2 2 0 0 1 2-2h3' })
] : [
    // Enter fullscreen icon
    createElement('path', { key: '1', d: 'M8 3H5a2 2 0 0 0-2 2v3' }),
    createElement('path', { key: '2', d: 'M21 8V5a2 2 0 0 0-2-2h-3' }),
    createElement('path', { key: '3', d: 'M3 16v3a2 2 0 0 0 2 2h3' }),
    createElement('path', { key: '4', d: 'M16 21h3a2 2 0 0 0 2-2v-3' })
]);

// Toggle component for settings
function Toggle({ value, onChange, color = '#3b82f6' }) {
    return createElement('button', {
        onClick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange(!value);
        },
        style: {
            width: '44px',
            height: '24px',
            borderRadius: '12px',
            background: value ? color : '#4b5563',
            border: 'none',
            cursor: 'pointer',
            position: 'relative',
            transition: 'all 0.2s ease',
            flexShrink: 0
        }
    },
        createElement('div', {
            style: {
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: 'white',
                position: 'absolute',
                top: '2px',
                left: value ? '22px' : '2px',
                transition: 'left 0.2s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
            }
        })
    );
}

// Slider component for settings
function Slider({ value, min, max, step = 1, onChange, color = '#3b82f6' }) {
    const percentage = ((value - min) / (max - min)) * 100;

    return createElement('input', {
        type: 'range',
        min, max, step, value,
        onChange: (e) => {
            e.stopPropagation();
            onChange(parseFloat(e.target.value));
        },
        onClick: (e) => e.stopPropagation(),
        style: {
            width: '100px',
            height: '6px',
            borderRadius: '3px',
            appearance: 'none',
            WebkitAppearance: 'none',
            background: `linear-gradient(to right, ${color} 0%, ${color} ${percentage}%, #374151 ${percentage}%, #374151 100%)`,
            cursor: 'pointer',
            outline: 'none'
        }
    });
}

// In-game settings panel
function InGameSettings({ settings, onSettingsChange, onBack, isCompact }) {
    const { t } = useTranslation();

    const handleChange = (key, value) => {
        const newSettings = { ...settings, [key]: value };
        onSettingsChange(newSettings);
        saveSettings(newSettings);
        applySettingsToGame(newSettings);
    };

    const handlePresetChange = (preset) => {
        const newSettings = applyPerformancePreset(preset, settings);
        onSettingsChange(newSettings);
        saveSettings(newSettings);
        applySettingsToGame(newSettings);
    };

    const rowStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.5rem 0',
        borderBottom: '1px solid rgba(255,255,255,0.08)'
    };

    const labelStyle = {
        color: 'white',
        fontSize: isCompact ? '0.8rem' : '0.9rem'
    };

    const presetButtonStyle = (isActive, color) => ({
        flex: 1,
        padding: isCompact ? '0.5rem' : '0.6rem',
        background: isActive ? `${color}22` : 'rgba(255,255,255,0.05)',
        border: isActive ? `2px solid ${color}` : '1px solid rgba(255,255,255,0.1)',
        borderRadius: '0.5rem',
        color: isActive ? color : 'rgba(255,255,255,0.7)',
        fontSize: isCompact ? '0.7rem' : '0.75rem',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s'
    });

    return createElement('div', {
        style: { display: 'flex', flexDirection: 'column', gap: '0.5rem' }
    }, [
        // Back button header
        createElement('div', {
            key: 'header',
            style: {
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.5rem',
                paddingBottom: '0.5rem',
                borderBottom: '1px solid rgba(255,255,255,0.1)'
            }
        }, [
            createElement('button', {
                key: 'back',
                onClick: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onBack();
                },
                style: {
                    background: 'rgba(255,255,255,0.1)',
                    border: 'none',
                    borderRadius: '0.5rem',
                    padding: '0.4rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white'
                }
            }, createElement(BackIcon, { size: 18 })),
            createElement('span', {
                key: 'title',
                style: { color: 'white', fontWeight: 600, fontSize: isCompact ? '0.9rem' : '1rem' }
            }, t('settings.title'))
        ]),

        // Performance presets
        createElement('div', {
            key: 'presets',
            style: { marginBottom: '0.5rem' }
        }, [
            createElement('div', {
                key: 'label',
                style: {
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                    marginBottom: '0.4rem'
                }
            }, t('settings.presets')),
            createElement('div', {
                key: 'buttons',
                style: { display: 'flex', gap: '0.4rem' }
            }, [
                createElement('button', {
                    key: 'perf',
                    onClick: (e) => { e.stopPropagation(); handlePresetChange('performance'); },
                    style: presetButtonStyle(settings.performanceMode === 'performance', '#22c55e')
                }, t('settings.performanceOption')),
                createElement('button', {
                    key: 'bal',
                    onClick: (e) => { e.stopPropagation(); handlePresetChange('balanced'); },
                    style: presetButtonStyle(settings.performanceMode === 'balanced', '#3b82f6')
                }, t('settings.balancedOption')),
                createElement('button', {
                    key: 'qual',
                    onClick: (e) => { e.stopPropagation(); handlePresetChange('quality'); },
                    style: presetButtonStyle(settings.performanceMode === 'quality', '#a855f7')
                }, t('settings.qualityOption'))
            ])
        ]),

        // Audio toggle
        createElement('div', { key: 'audio', style: rowStyle }, [
            createElement('span', { key: 'label', style: labelStyle }, t('settings.audioEnabled')),
            createElement(Toggle, {
                key: 'toggle',
                value: settings.audioEnabled,
                onChange: (v) => handleChange('audioEnabled', v),
                color: '#22c55e'
            })
        ]),

        // Volume slider (if audio enabled)
        settings.audioEnabled && createElement('div', { key: 'volume', style: rowStyle }, [
            createElement('span', { key: 'label', style: labelStyle }, t('settings.audioVolume')),
            createElement('div', {
                key: 'control',
                style: { display: 'flex', alignItems: 'center', gap: '0.5rem' }
            }, [
                createElement(Slider, {
                    key: 'slider',
                    value: settings.audioVolume,
                    min: 0, max: 100, step: 5,
                    onChange: (v) => handleChange('audioVolume', v),
                    color: '#22c55e'
                }),
                createElement('span', {
                    key: 'value',
                    style: { color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', minWidth: '2.5rem', textAlign: 'right' }
                }, `${settings.audioVolume}%`)
            ])
        ]),

        // Performance stats toggle
        createElement('div', { key: 'stats', style: rowStyle }, [
            createElement('span', { key: 'label', style: labelStyle }, t('settings.showStats')),
            createElement(Toggle, {
                key: 'toggle',
                value: settings.showStats,
                onChange: (v) => handleChange('showStats', v),
                color: '#f59e0b'
            })
        ])
    ]);
}

// Menu button component
function MenuButton({ icon, label, onClick, variant = 'default', size = 'normal' }) {
    const { isMobile, isLandscapeMobile } = useResponsive();

    const isSmall = size === 'small' || isLandscapeMobile;
    const isPrimary = variant === 'primary';
    const isSecondary = variant === 'secondary';

    const buttonStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: isSmall ? '0.5rem' : '0.75rem',
        width: '100%',
        padding: isSmall ? '0.75rem 1rem' : '1rem 1.5rem',
        fontSize: isSmall ? '0.9rem' : '1.1rem',
        fontWeight: 600,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: 'white',
        background: isPrimary
            ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
            : isSecondary
                ? 'rgba(255, 255, 255, 0.1)'
                : 'rgba(255, 255, 255, 0.15)',
        border: isPrimary
            ? '1px solid rgba(34, 197, 94, 0.5)'
            : '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '0.75rem',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: isPrimary
            ? '0 4px 15px rgba(34, 197, 94, 0.3)'
            : '0 2px 10px rgba(0, 0, 0, 0.2)',
        WebkitTapHighlightColor: 'transparent'
    };

    return createElement('button', {
        style: buttonStyle,
        onClick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[PauseMenu] Button clicked:', label);
            if (onClick) onClick();
        },
        onMouseEnter: (e) => {
            e.currentTarget.style.transform = 'scale(1.02)';
            e.currentTarget.style.boxShadow = isPrimary
                ? '0 6px 20px rgba(34, 197, 94, 0.4)'
                : '0 4px 15px rgba(0, 0, 0, 0.3)';
        },
        onMouseLeave: (e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = isPrimary
                ? '0 4px 15px rgba(34, 197, 94, 0.3)'
                : '0 2px 10px rgba(0, 0, 0, 0.2)';
        },
        onTouchStart: (e) => {
            e.currentTarget.style.transform = 'scale(0.98)';
        },
        onTouchEnd: (e) => {
            e.currentTarget.style.transform = 'scale(1)';
        }
    }, [
        icon && createElement('span', { key: 'icon', style: { display: 'flex', pointerEvents: 'none' } }, icon),
        createElement('span', { key: 'label', style: { pointerEvents: 'none' } }, label)
    ]);
}

export function PauseMenu({
    isVisible,
    onResume,
    onRestart,
    onMainMenu,
    onToggleFullscreen,
    isFullscreen = false,
    showFullscreenOption = false,
    gameMode = 'solo'
}) {
    const { t } = useTranslation();
    const { isMobile, isLandscapeMobile } = useResponsive();
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState(() => loadSettings());

    // Reset settings view when menu closes
    useEffect(() => {
        if (!isVisible) {
            setShowSettings(false);
        }
    }, [isVisible]);

    // Handle escape key to resume or go back from settings
    useEffect(() => {
        if (!isVisible) return;

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (showSettings) {
                    setShowSettings(false);
                } else {
                    onResume?.();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isVisible, onResume, showSettings]);

    if (!isVisible) return null;

    // Responsive sizing
    const containerPadding = isLandscapeMobile ? '1rem' : isMobile ? '1.5rem' : '2rem';
    const titleSize = isLandscapeMobile ? '1.5rem' : isMobile ? '2rem' : '2.5rem';
    const subtitleSize = isLandscapeMobile ? '0.75rem' : isMobile ? '0.85rem' : '1rem';
    const buttonGap = isLandscapeMobile ? '0.5rem' : '0.75rem';
    const maxWidth = isLandscapeMobile ? '280px' : isMobile ? '320px' : '400px';

    // Overlay style
    const overlayStyle = {
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 1000,
        animation: 'fadeIn 0.2s ease-out',
        padding: containerPadding,
        pointerEvents: 'auto' // Ensure clicks work despite parent having pointer-events: none
    };

    // Panel style
    const panelStyle = {
        background: 'rgba(30, 30, 40, 0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: '1.5rem',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        padding: containerPadding,
        width: '100%',
        maxWidth,
        animation: 'scaleIn 0.25s ease-out'
    };

    // Title style
    const titleStyle = {
        fontSize: titleSize,
        fontWeight: 800,
        color: 'white',
        textAlign: 'center',
        marginBottom: '0.25rem',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        letterSpacing: '2px'
    };

    // Subtitle style
    const subtitleStyle = {
        fontSize: subtitleSize,
        color: 'rgba(255, 255, 255, 0.5)',
        textAlign: 'center',
        marginBottom: isLandscapeMobile ? '1rem' : '1.5rem',
        fontFamily: 'system-ui, -apple-system, sans-serif'
    };

    // Buttons container style
    const buttonsStyle = {
        display: 'flex',
        flexDirection: 'column',
        gap: buttonGap
    };

    // Divider style
    const dividerStyle = {
        height: '1px',
        background: 'rgba(255, 255, 255, 0.1)',
        margin: `${buttonGap} 0`
    };

    const buttonSize = isLandscapeMobile ? 'small' : 'normal';
    const iconSize = isLandscapeMobile ? 18 : 22;

    return createElement('div', {
        style: overlayStyle,
        onClick: (e) => {
            // Only close if clicking the overlay background (and not in settings)
            if (e.target === e.currentTarget && !showSettings) {
                onResume?.();
            }
        }
    },
        createElement('div', { style: panelStyle },
            showSettings ? [
                // Settings panel
                createElement(InGameSettings, {
                    key: 'settings',
                    settings,
                    onSettingsChange: setSettings,
                    onBack: () => setShowSettings(false),
                    isCompact: isLandscapeMobile
                })
            ] : [
                // Title
                createElement('h2', { key: 'title', style: titleStyle }, t('pause.title')),

                // Subtitle with control hint
                createElement('p', { key: 'subtitle', style: subtitleStyle },
                    isMobile ? t('pause.tapToResume') : t('pause.pressEscToResume')
                ),

                // Buttons
                createElement('div', { key: 'buttons', style: buttonsStyle }, [
                    // Resume button (primary)
                    createElement(MenuButton, {
                        key: 'resume',
                        icon: createElement(PlayIcon, { size: iconSize }),
                        label: t('pause.resume'),
                        variant: 'primary',
                        size: buttonSize,
                        onClick: onResume
                    }),

                    // Restart button
                    createElement(MenuButton, {
                        key: 'restart',
                        icon: createElement(RestartIcon, { size: iconSize }),
                        label: t('pause.restart'),
                        size: buttonSize,
                        onClick: onRestart
                    }),

                    // Settings button
                    createElement(MenuButton, {
                        key: 'settings',
                        icon: createElement(SettingsIcon, { size: iconSize }),
                        label: t('menu.settings'),
                        size: buttonSize,
                        onClick: () => setShowSettings(true)
                    }),

                    // Divider
                    createElement('div', { key: 'divider', style: dividerStyle }),

                    // Fullscreen toggle (mobile only)
                    showFullscreenOption && createElement(MenuButton, {
                        key: 'fullscreen',
                        icon: createElement(FullscreenIcon, { size: iconSize, isFullscreen }),
                        label: isFullscreen ? t('pause.exitFullscreen') : t('pause.fullscreen'),
                        variant: 'secondary',
                        size: buttonSize,
                        onClick: onToggleFullscreen
                    }),

                    // Main Menu button
                    createElement(MenuButton, {
                        key: 'menu',
                        icon: createElement(HomeIcon, { size: iconSize }),
                        label: t('pause.mainMenu'),
                        variant: 'secondary',
                        size: buttonSize,
                        onClick: onMainMenu
                    })
                ])
            ]
        )
    );
}

// Add animations to document if not present
if (typeof document !== 'undefined') {
    const styleId = 'pause-menu-animations';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes scaleIn {
                from {
                    opacity: 0;
                    transform: scale(0.9);
                }
                to {
                    opacity: 1;
                    transform: scale(1);
                }
            }
        `;
        document.head.appendChild(style);
    }
}
