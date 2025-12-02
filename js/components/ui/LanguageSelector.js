/**
 * LanguageSelector Component
 * Mobile-friendly language switcher with globe icon
 * Can be used as a compact icon button or full dropdown
 */
import React, { createElement, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../../i18n.js';
import { useResponsive } from '../hooks/usePlatform.js';

// Globe Icon SVG
const GlobeIcon = ({ size = 24, color = 'currentColor' }) => createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
}, [
    createElement('circle', { key: 'circle', cx: '12', cy: '12', r: '10' }),
    createElement('line', { key: 'line1', x1: '2', y1: '12', x2: '22', y2: '12' }),
    createElement('path', {
        key: 'path1',
        d: 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'
    })
]);

// Check icon for selected language
const CheckIcon = ({ size = 16 }) => createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '3',
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
}, createElement('polyline', { points: '20 6 9 17 4 12' }));

/**
 * LanguageSelector - Compact globe button with dropdown
 * @param {Object} props
 * @param {'icon'|'full'} props.variant - Display style
 * @param {string} props.className - Additional CSS classes
 */
export function LanguageSelector({ variant = 'icon', className = '' }) {
    const { i18n, t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const dropdownRef = useRef(null);
    const { isCompact, isMobile } = useResponsive();

    const currentLanguage = LANGUAGES.find(lang => lang.code === i18n.language) || LANGUAGES[0];

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('touchstart', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [isOpen]);

    const handleLanguageChange = (langCode) => {
        if (langCode !== i18n.language) {
            setIsAnimating(true);
            i18n.changeLanguage(langCode);
            setTimeout(() => setIsAnimating(false), 300);
        }
        setIsOpen(false);
    };

    const toggleOpen = (e) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
    };

    // Icon-only button style (for menu corner)
    if (variant === 'icon') {
        const buttonSize = isCompact ? 36 : 44;
        const iconSize = isCompact ? 20 : 24;

        return createElement('div', {
            ref: dropdownRef,
            style: { position: 'relative', zIndex: 100 },
            className
        }, [
            // Globe button
            createElement('button', {
                key: 'button',
                onClick: toggleOpen,
                style: {
                    width: buttonSize,
                    height: buttonSize,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isOpen ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: 'white',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    transform: isAnimating ? 'rotate(360deg)' : 'rotate(0deg)'
                },
                onMouseEnter: (e) => {
                    if (!isMobile) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                },
                onMouseLeave: (e) => {
                    if (!isMobile && !isOpen) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                },
                'aria-label': 'Change language',
                title: `Language: ${currentLanguage.nativeName}`
            }, createElement(GlobeIcon, { size: iconSize })),

            // Dropdown menu
            isOpen && createElement('div', {
                key: 'dropdown',
                style: {
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '8px',
                    minWidth: isMobile ? '200px' : '180px',
                    maxWidth: 'calc(100vw - 24px)',
                    maxHeight: 'min(70vh, 400px)',
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    WebkitOverflowScrolling: 'touch',
                    background: 'rgba(30, 30, 40, 0.95)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4)',
                    animation: 'fadeInDown 0.2s ease-out'
                }
            }, LANGUAGES.map((lang, index) => {
                const isSelected = lang.code === i18n.language;
                return createElement('button', {
                    key: lang.code,
                    onClick: () => handleLanguageChange(lang.code),
                    style: {
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: isMobile ? '14px 16px' : '12px 16px',
                        minHeight: '48px',
                        background: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                        border: 'none',
                        borderBottom: index < LANGUAGES.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                        color: 'white',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.15s ease',
                        WebkitTapHighlightColor: 'transparent'
                    },
                    onMouseEnter: (e) => {
                        if (!isMobile && !isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                    },
                    onMouseLeave: (e) => {
                        if (!isMobile && !isSelected) e.currentTarget.style.background = 'transparent';
                    }
                }, [
                    // Flag
                    createElement('span', {
                        key: 'flag',
                        style: { fontSize: '20px' }
                    }, lang.flag),
                    // Native name
                    createElement('span', {
                        key: 'name',
                        style: {
                            flex: 1,
                            fontWeight: isSelected ? '600' : '400',
                            fontSize: '14px'
                        }
                    }, lang.nativeName),
                    // Check mark if selected
                    isSelected && createElement('span', {
                        key: 'check',
                        style: { color: '#3b82f6' }
                    }, createElement(CheckIcon, { size: 16 }))
                ]);
            }))
        ]);
    }

    // Full dropdown style (for settings page)
    return createElement('div', {
        ref: dropdownRef,
        style: { position: 'relative' },
        className
    }, [
        // Current language button
        createElement('button', {
            key: 'button',
            onClick: toggleOpen,
            style: {
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: isCompact ? '10px 14px' : '12px 16px',
                background: 'rgba(31, 41, 55, 0.8)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                color: 'white',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '1rem',
                transition: 'all 0.2s ease'
            }
        }, [
            createElement(GlobeIcon, { key: 'icon', size: 20 }),
            createElement('span', {
                key: 'flag',
                style: { fontSize: '18px' }
            }, currentLanguage.flag),
            createElement('span', {
                key: 'name',
                style: { flex: 1 }
            }, currentLanguage.nativeName),
            createElement('span', {
                key: 'arrow',
                style: {
                    color: 'rgba(255, 255, 255, 0.5)',
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease'
                }
            }, '▼')
        ]),

        // Dropdown menu
        isOpen && createElement('div', {
            key: 'dropdown',
            style: {
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '4px',
                maxHeight: 'min(60vh, 350px)',
                overflowY: 'auto',
                overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                background: 'rgba(30, 30, 40, 0.95)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4)',
                zIndex: 50,
                animation: 'fadeInDown 0.2s ease-out'
            }
        }, LANGUAGES.map((lang, index) => {
            const isSelected = lang.code === i18n.language;
            return createElement('button', {
                key: lang.code,
                onClick: () => handleLanguageChange(lang.code),
                style: {
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: isMobile ? '14px 16px' : '12px 16px',
                    minHeight: '48px',
                    background: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                    border: 'none',
                    borderBottom: index < LANGUAGES.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                    color: 'white',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.15s ease',
                    WebkitTapHighlightColor: 'transparent'
                },
                onMouseEnter: (e) => {
                    if (!isMobile && !isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                },
                onMouseLeave: (e) => {
                    if (!isMobile && !isSelected) e.currentTarget.style.background = 'transparent';
                }
            }, [
                createElement('span', {
                    key: 'flag',
                    style: { fontSize: '20px' }
                }, lang.flag),
                createElement('span', {
                    key: 'name',
                    style: {
                        flex: 1,
                        fontWeight: isSelected ? '600' : '400'
                    }
                }, lang.nativeName),
                isSelected && createElement('span', {
                    key: 'check',
                    style: { color: '#3b82f6' }
                }, createElement(CheckIcon, { size: 16 }))
            ]);
        }))
    ]);
}

// Add animation keyframes
if (typeof document !== 'undefined' && !document.getElementById('language-selector-styles')) {
    const style = document.createElement('style');
    style.id = 'language-selector-styles';
    style.textContent = `
        @keyframes fadeInDown {
            from {
                opacity: 0;
                transform: translateY(-8px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    `;
    document.head.appendChild(style);
}
