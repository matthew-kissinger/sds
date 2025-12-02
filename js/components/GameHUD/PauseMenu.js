/**
 * PauseMenu Component
 * Full-featured pause screen with resume, restart, and menu options
 * Works on both desktop and mobile with responsive design
 */
import React, { createElement, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../hooks/usePlatform.js';

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

    // Handle escape key to resume
    useEffect(() => {
        if (!isVisible) return;

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onResume?.();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isVisible, onResume]);

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
            // Only close if clicking the overlay background
            if (e.target === e.currentTarget) {
                onResume?.();
            }
        }
    },
        createElement('div', { style: panelStyle }, [
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
        ])
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
