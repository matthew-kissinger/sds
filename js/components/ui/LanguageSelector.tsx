// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * LanguageSelector Component
 * Mobile-friendly language switcher with globe icon.
 * Can be used as a compact icon button or full dropdown.
 *
 * Cycle 48 P4: converted from the element-factory .js to token-driven .tsx.
 * The selected-language check mark reads the info-strong token (the old raw
 * blue-500 hex). The dropdown's fadeInDown keyframe moved out of the
 * module-load injected <style> tag (a DOM style-element injection at import
 * time) into the shared css/main.css sheet, matching the picker/pointer-tour
 * precedents. The bespoke globe/check SVGs are kept as inline JSX (not swapped
 * to lucide) so the glyphs render byte-identically. Behavior is identical to
 * the previous LanguageSelector.js.
 */
import { useState, useRef, useEffect, type CSSProperties, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../../i18n.js';
import { useResponsive } from '../hooks/usePlatform.js';
import { color } from './tokens';

// Globe Icon SVG
const GlobeIcon = ({ size = 24, color = 'currentColor' }: { size?: number; color?: string }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
);

// Check icon for selected language
const CheckIcon = ({ size = 16 }: { size?: number }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

interface LanguageSelectorProps {
    variant?: 'icon' | 'full';
    className?: string;
}

/**
 * LanguageSelector - Compact globe button with dropdown
 */
export function LanguageSelector({ variant = 'icon', className = '' }: LanguageSelectorProps) {
    const { i18n } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { isCompact, isMobile } = useResponsive();

    const currentLanguage = LANGUAGES.find((lang) => lang.code === i18n.language) || LANGUAGES[0];

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: Event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
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

    const handleLanguageChange = (langCode: string) => {
        if (langCode !== i18n.language) {
            setIsAnimating(true);
            i18n.changeLanguage(langCode);
            setTimeout(() => setIsAnimating(false), 300);
        }
        setIsOpen(false);
    };

    const toggleOpen = (e: MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
    };

    // Icon-only button style (for menu corner)
    if (variant === 'icon') {
        const buttonSize = isCompact ? 36 : 44;
        const iconSize = isCompact ? 20 : 24;

        const buttonStyle: CSSProperties = {
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
            transform: isAnimating ? 'rotate(360deg)' : 'rotate(0deg)',
        };

        return (
            <div ref={dropdownRef} style={{ position: 'relative', zIndex: 100 }} className={className}>
                <button
                    onClick={toggleOpen}
                    style={buttonStyle}
                    onMouseEnter={(e) => {
                        if (!isMobile) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                        if (!isMobile && !isOpen) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                    }}
                    aria-label="Change language"
                    title={`Language: ${currentLanguage.nativeName}`}
                >
                    <GlobeIcon size={iconSize} />
                </button>

                {isOpen && (
                    <div
                        style={{
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
                            animation: 'fadeInDown 0.2s ease-out',
                        }}
                    >
                        {LANGUAGES.map((lang, index) => {
                            const isSelected = lang.code === i18n.language;
                            return (
                                <button
                                    key={lang.code}
                                    onClick={() => handleLanguageChange(lang.code)}
                                    style={{
                                        width: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        padding: isMobile ? '14px 16px' : '12px 16px',
                                        minHeight: '48px',
                                        background: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                                        border: 'none',
                                        borderBottom:
                                            index < LANGUAGES.length - 1
                                                ? '1px solid rgba(255, 255, 255, 0.05)'
                                                : 'none',
                                        color: 'white',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        transition: 'background 0.15s ease',
                                        WebkitTapHighlightColor: 'transparent',
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isMobile && !isSelected)
                                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isMobile && !isSelected)
                                            e.currentTarget.style.background = 'transparent';
                                    }}
                                >
                                    <span style={{ fontSize: '20px' }}>{lang.flag}</span>
                                    <span style={{ flex: 1, fontWeight: isSelected ? '600' : '400', fontSize: '14px' }}>
                                        {lang.nativeName}
                                    </span>
                                    {isSelected && (
                                        <span style={{ color: color.infoStrong }}>
                                            <CheckIcon size={16} />
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    // Full dropdown style (for settings page)
    return (
        <div ref={dropdownRef} style={{ position: 'relative' }} className={className}>
            <button
                onClick={toggleOpen}
                style={{
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
                    transition: 'all 0.2s ease',
                }}
            >
                <GlobeIcon size={20} />
                <span style={{ fontSize: '18px' }}>{currentLanguage.flag}</span>
                <span style={{ flex: 1 }}>{currentLanguage.nativeName}</span>
                <span
                    style={{
                        color: 'rgba(255, 255, 255, 0.5)',
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                    }}
                >
                    {'▼'}
                </span>
            </button>

            {isOpen && (
                <div
                    style={{
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
                        animation: 'fadeInDown 0.2s ease-out',
                    }}
                >
                    {LANGUAGES.map((lang, index) => {
                        const isSelected = lang.code === i18n.language;
                        return (
                            <button
                                key={lang.code}
                                onClick={() => handleLanguageChange(lang.code)}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: isMobile ? '14px 16px' : '12px 16px',
                                    minHeight: '48px',
                                    background: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                                    border: 'none',
                                    borderBottom:
                                        index < LANGUAGES.length - 1
                                            ? '1px solid rgba(255, 255, 255, 0.05)'
                                            : 'none',
                                    color: 'white',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    transition: 'background 0.15s ease',
                                    WebkitTapHighlightColor: 'transparent',
                                }}
                                onMouseEnter={(e) => {
                                    if (!isMobile && !isSelected)
                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                }}
                                onMouseLeave={(e) => {
                                    if (!isMobile && !isSelected)
                                        e.currentTarget.style.background = 'transparent';
                                }}
                            >
                                <span style={{ fontSize: '20px' }}>{lang.flag}</span>
                                <span style={{ flex: 1, fontWeight: isSelected ? '600' : '400' }}>
                                    {lang.nativeName}
                                </span>
                                {isSelected && (
                                    <span style={{ color: color.infoStrong }}>
                                        <CheckIcon size={16} />
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
